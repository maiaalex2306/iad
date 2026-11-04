/* IaD Revenue Intelligence RI-00 — pure, fail-closed dispatch eligibility.
 * NO I/O. This is defense in depth, NOT a substitute for authenticated
 * server-side policy, RLS, approval lookup, atomic dispatch claims or provider receipts.
 * Input must come from independently verified server-side records, never raw LLM output.
 */
const deny = code => ({allowed:false, code});
const same = (a,b) => typeof a === 'string' && a.length>0 && a === b;
const id = v => typeof v === 'string' && v.trim().length>0 && v === v.trim();
const hash = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const instant = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : NaN;
const roles = new Set(['vendedor','gestor','administrador']);

export function authorizeDispatch(input) {
  if (!input || typeof input !== 'object') return deny('invalid_input');
  const {context, campaign, approval, recipient, action, provider} = input;
  if (![context,campaign,recipient,action,provider].every(v=>v && typeof v === 'object')) return deny('invalid_input');
  if (!id(context.tenantId)||!id(context.actorId)||context.authenticated!==true||!roles.has(context.role)||
      !id(campaign.id)||!id(campaign.tenantId)||!id(campaign.actorId)||!id(recipient.id)||
      !id(recipient.tenantId)||!id(action.tenantId)||!id(action.campaignId)||
      !id(action.recipientId)||!id(action.actorId)||!id(action.channel)||
      !hash(action.contentHash)||!hash(action.audienceHash)||!hash(action.idempotencyKey)||
      !Number.isSafeInteger(action.dailyCount)||action.dailyCount<0||
      !Number.isSafeInteger(campaign.dailyLimit)||campaign.dailyLimit<1||
      !Number.isFinite(instant(context.now))) return deny('invalid_input');
  if (![campaign.tenantId,recipient.tenantId,action.tenantId].every(t=>same(t,context.tenantId))||
      !same(action.campaignId,campaign.id)||!same(action.recipientId,recipient.id)||
      !same(campaign.actorId,context.actorId)||!same(action.actorId,context.actorId))
      return deny('identity_mismatch');
  if (campaign.state!=='active'||campaign.paused!==false||
      !Number.isFinite(instant(campaign.windowStart))||!Number.isFinite(instant(campaign.windowEnd))||
      instant(context.now)<instant(campaign.windowStart)||instant(context.now)>=instant(campaign.windowEnd))
      return deny('inactive_campaign');
  if (!approval || typeof approval!=='object') return deny('approval_required');
  if (!same(approval.tenantId,context.tenantId)||!same(approval.campaignId,campaign.id)||
      !same(approval.authorizedActorId,context.actorId)) return deny('identity_mismatch');
  if (approval.state!=='approved'||approval.revokedAt!==null||
      !same(approval.channel,action.channel)||!same(approval.channel,campaign.channel)||
      !same(approval.audienceHash,action.audienceHash)||
      !same(approval.contentHash,action.contentHash)||
      !Number.isFinite(instant(approval.expiresAt))) return deny('approval_invalid');
  if (instant(context.now)>=instant(approval.expiresAt)) return deny('approval_expired');
  if (recipient.optedOut!==false||recipient.replied!==false||recipient.bounced!==false||
      recipient.lawfulBasisVerified!==true||recipient.addressVerified!==true) return deny('recipient_blocked');
  /* Only email can eventually be activated after the real integration is certified.
     WhatsApp/LinkedIn are deliberately unavailable in RI-00. */
  if (provider.enabled!==true||provider.channel!=='email'||action.channel!=='email'||campaign.channel!=='email')
      return deny('provider_unavailable');
  if (action.alreadyDispatched!==false || action.dailyCount>=campaign.dailyLimit)
      return deny('duplicate_or_limit');
  return {allowed:true,code:'allowed'};
}
