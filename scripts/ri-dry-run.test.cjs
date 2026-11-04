'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');
const u=pathToFileURL(resolve(__dirname,'../nuvem/revenue-intelligence/dry-run.mjs'));
const intentUrl=pathToFileURL(resolve(__dirname,'../nuvem/revenue-intelligence/intent.mjs'));
let dispatch;const execute=async data=>(dispatch ??= import(u)).then(x=>x.previewDispatch(data));
const fingerprint=async input=>(await import(intentUrl)).buildIntent(input);
function base(){return {
  context:{tenantId:'tenant-a',actorId:'seller-1',authenticated:true,role:'vendedor',now:'2026-11-04T12:00:00.000Z'},
  campaign:{id:'c1',tenantId:'tenant-a',actorId:'seller-1',state:'active',paused:false,channel:'email',dailyLimit:3,windowStart:'2026-11-04T11:00:00.000Z',windowEnd:'2026-11-04T20:00:00.000Z'},
  approval:undefined,
  recipient:{id:'p1',tenantId:'tenant-a',address:'person@example.com',optedOut:false,replied:false,bounced:false,lawfulBasisVerified:true,addressVerified:true},
  provider:{enabled:true,channel:'email'},
  proposal:{tenantId:'tenant-a',campaignId:'c1',recipientId:'p1',channel:'email',contactAddress:'person@example.com',content:'Proposta relevante',stepId:'step-1',alreadyDispatched:false,dailyCount:0}
};}
async function approved(){const x=base();const intent=await fingerprint(x.proposal);
 x.approval={tenantId:'tenant-a',campaignId:'c1',authorizedActorId:'seller-1',state:'approved',channel:'email',audienceHash:intent.audienceHash,contentHash:intent.contentHash,expiresAt:'2026-11-06T12:00:00.000Z',revokedAt:null};return x;}
test('approved current preview is eligible and deterministic',async()=>{
 const x=await approved(),a=await execute(x),b=await execute(x);
 assert.equal(a.status,'eligible');assert.equal(a.reason,'allowed');assert.deepEqual(a,b);
 assert.equal(a.intent.recipientId,'p1');assert.ok(!('content' in a.intent));
});
test('approval missing, changed or stale blocks dispatch',async()=>{
 const x=await approved();x.approval=null;
 assert.equal((await execute(x)).status,'blocked');
 const y=await approved();y.proposal.content='Alterado depois da aprovação';
 assert.equal((await execute(y)).reason,'approval_invalid');
});
test('recipient reply and tenant switch block preview',async()=>{
 const x=await approved();x.recipient.replied=true;
 assert.equal((await execute(x)).reason,'recipient_blocked');
 const y=await approved();y.context.tenantId='tenant-outro';
 assert.equal((await execute(y)).reason,'identity_mismatch');
});
test('invalid proposal fails closed with no crashes and no sends',async()=>{
 const x=await approved();x.proposal.contactAddress='invalid';
 assert.deepEqual(await execute(x),{status:'blocked',reason:'invalid_input'});
});
test('dry run never modifies the candidate or creates outbound integrations',async()=>{
 const x=await approved(),before=JSON.stringify(x);
 assert.equal((await execute(x)).status,'eligible');
 assert.equal(JSON.stringify(x),before);
 const mod=await import(u);
 assert.deepEqual(Object.keys(mod),['previewDispatch']);
});

test('prevents approved campaign from redirecting email to a different, unverified destination',async()=>{
 const x=await approved();
 x.proposal.contactAddress='attacker@example.com';
 const attackerIntent=await fingerprint(x.proposal);
 x.approval.audienceHash=attackerIntent.audienceHash;
 const result=await execute(x);
 assert.deepEqual(result,{status:'blocked',reason:'recipient_blocked'});
});
