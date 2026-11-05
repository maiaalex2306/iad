/* RI-00 — deterministic intent fingerprints.
 * Does not send, store or authorize messages. Server-side code must bind
 * these digests to authenticated, current records before using them.
 */
const validId = value => typeof value==='string' && value.trim()===value && value.length>0;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function buildIntent(input) {
  if(!input||typeof input!=='object') throw Error('Proposta inválida');
  const {tenantId,campaignId,recipientId,channel,content,stepId,contactAddress}=input;
  if(![tenantId,campaignId,recipientId,stepId].every(validId)||
     typeof content!=='string'||!content.trim()||channel!=='email')
    throw Error('Identidade, conteúdo ou canal obrigatório e suportado');
  if(typeof contactAddress!=='string'||!emailPattern.test(contactAddress.trim()))
    throw Error('Endereço do destinatário inválido');
  const address=contactAddress.trim().toLowerCase();
  return {
    tenantId,campaignId,recipientId,channel,
    contentHash:await sha256(content),
    audienceHash:await sha256(JSON.stringify([tenantId,recipientId,channel,address])),
    /* Same campaign/recipient/step is the same send slot, even if the content
       changes; retries never create a new dispatch key. */
    idempotencyKey:await sha256(JSON.stringify([tenantId,campaignId,recipientId,channel,stepId]))
  };
}
