'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {resolve} = require('node:path');
const moduleUrl = pathToFileURL(resolve(__dirname, '../nuvem/revenue-intelligence/dispatch-policy.mjs'));
let policy;
async function authorize(input) {
  if (!policy) policy = await import(moduleUrl);
  return policy.authorizeDispatch(input);
}
function valid() {
  return {
    context: {tenantId:'tenant-a', actorId:'seller-1', authenticated:true, role:'vendedor', now:'2026-11-04T12:00:00.000Z'},
    campaign: {id:'campaign-1',tenantId:'tenant-a',actorId:'seller-1',state:'active',paused:false,channel:'email',dailyLimit:3,windowStart:'2026-11-04T10:00:00.000Z',windowEnd:'2026-11-04T20:00:00.000Z'},
    approval: {tenantId:'tenant-a',campaignId:'campaign-1',authorizedActorId:'seller-1',state:'approved',channel:'email',audienceHash:'a'.repeat(64),contentHash:'b'.repeat(64),expiresAt:'2026-11-05T12:00:00.000Z',revokedAt:null},
    recipient: {id:'contact-1',tenantId:'tenant-a',optedOut:false,replied:false,bounced:false,lawfulBasisVerified:true,addressVerified:true},
    action: {tenantId:'tenant-a',campaignId:'campaign-1',recipientId:'contact-1',actorId:'seller-1',channel:'email',audienceHash:'a'.repeat(64),contentHash:'b'.repeat(64),idempotencyKey:'c'.repeat(64),alreadyDispatched:false,dailyCount:0},
    provider: {enabled:true,channel:'email'}
  };
}
test('explicitly approved current email action is eligible', async()=>{
  assert.deepEqual(await authorize(valid()), {allowed:true,code:'allowed'});
});
test('missing session or actor cannot authorize', async()=>{
  const x=valid(); x.context.authenticated=false;
  assert.deepEqual(await authorize(x), {allowed:false,code:'invalid_input'});
  x.context=undefined;
  assert.deepEqual(await authorize(x), {allowed:false,code:'invalid_input'});
});
test('denies cross-tenant references and mismatched actor', async()=>{
  for (const path of [['recipient','tenantId','tenant-b'],['approval','tenantId','tenant-b'],['action','actorId','seller-2'],['campaign','actorId','seller-2'],['approval','authorizedActorId','seller-2']]) {
    const x=valid();x[path[0]][path[1]]=path[2];
    assert.equal((await authorize(x)).code,'identity_mismatch',path.join('.'));
  }
});
test('inactive or paused campaigns are denied', async()=>{
  for (const key of ['state','paused']) {
    const x=valid();x.campaign[key]=key==='state'?'draft':true;
    assert.equal((await authorize(x)).code,'inactive_campaign');
  }
});
test('approval is required and must be current', async()=>{
  const missing=valid();missing.approval=undefined;
  assert.equal((await authorize(missing)).code,'approval_required');
  for(const patch of [{state:'pending'},{revokedAt:'2026-11-04T11:00:00Z'},{contentHash:'d'.repeat(64)},{audienceHash:'e'.repeat(64)},{channel:'whatsapp'}]) {
    const x=valid();Object.assign(x.approval,patch);
    assert.equal((await authorize(x)).code,'approval_invalid');
  }
});
test('expired approvals or invalid timestamps fail closed', async()=>{
  for (const expiresAt of ['2026-11-04T12:00:00.000Z','2026-11-03T00:00:00.000Z','garbage']) {
    const x=valid();x.approval.expiresAt=expiresAt;
    assert.equal((await authorize(x)).allowed,false);
  }
});
test('a reply, opt-out, bounce or unknown eligibility stops outreach', async()=>{
  for(const patch of [{replied:true},{optedOut:true},{bounced:true},{lawfulBasisVerified:false},{addressVerified:false},{addressVerified:undefined}]) {
    const x=valid();Object.assign(x.recipient,patch);
    assert.equal((await authorize(x)).code,'recipient_blocked');
  }
});
test('provider outage and channels without outbound integration are blocked', async()=>{
  const x=valid();x.provider.enabled=false;
  assert.equal((await authorize(x)).code,'provider_unavailable');
  const y=valid();y.provider.channel='whatsapp';
  assert.equal((await authorize(y)).code,'provider_unavailable');
});
test('duplicate dispatch and daily cap block retries and excess traffic', async()=>{
  const x=valid();x.action.alreadyDispatched=true;
  assert.equal((await authorize(x)).code,'duplicate_or_limit');
  const y=valid();y.action.dailyCount=3;
  assert.equal((await authorize(y)).code,'duplicate_or_limit');
  const z=valid();z.action.dailyCount=Number.NaN;
  assert.equal((await authorize(z)).code,'invalid_input');
});
test('outside approved time window cannot send', async()=>{
  const x=valid();x.context.now='2026-11-04T21:00:00.000Z';
  assert.equal((await authorize(x)).code,'inactive_campaign');
});
test('valid identification hashes and a stable idempotency key are mandatory', async()=>{
  for(const patch of [{idempotencyKey:''},{idempotencyKey:'invalid'},{contentHash:'evil'}]) {
    const x=valid();Object.assign(x.action,patch);
    assert.equal((await authorize(x)).allowed,false);
  }
});
