'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {resolve} = require('node:path');
const target=pathToFileURL(resolve(__dirname,'../nuvem/revenue-intelligence/intent.mjs'));
let modulePromise;
async function build(input){modulePromise ??= import(target);const mod=await modulePromise;return mod.buildIntent(input);}
function data(){return {tenantId:'tenant-1',campaignId:'campaign-1',recipientId:'contact-1',channel:'email',content:'Olá, Ana. Gostaria de conversar.',contactAddress:'Ana@EXAMPLE.com',stepId:'initial'};}
test('same proposal yields exact same fingerprints across retries',async()=>{
 const a=await build(data()), b=await build(data());
 assert.deepEqual(a,b);
 for(const key of ['contentHash','audienceHash','idempotencyKey']) assert.match(a[key],/^[a-f0-9]{64}$/);
 assert.equal(a.tenantId,'tenant-1');assert.equal(a.campaignId,'campaign-1');assert.equal(a.recipientId,'contact-1');
});
test('changing message invalidates approved content but retains send slot identity',async()=>{
 const a=await build(data()),x=data();x.content+=' Urgente'; const b=await build(x);
 assert.notEqual(a.contentHash,b.contentHash);
 assert.equal(a.audienceHash,b.audienceHash);
 assert.equal(a.idempotencyKey,b.idempotencyKey);
});
test('recipient address variation in casing is normalized for same audience',async()=>{
 const a=await build(data()),x=data();x.contactAddress=' ana@example.COM ';
 const b=await build(x);
 assert.equal(a.audienceHash,b.audienceHash);
});
test('changing tenant or recipient affects audience and retry key',async()=>{
 const a=await build(data());
 for(const patch of [{tenantId:'tenant-2'},{recipientId:'contact-2'},{contactAddress:'other@example.com'}]){
  const b=await build({...data(),...patch});assert.notEqual(a.audienceHash,b.audienceHash);
 }
 const b=await build({...data(),tenantId:'tenant-2'});assert.notEqual(a.idempotencyKey,b.idempotencyKey);
});
test('different sequence step gets another idempotency key',async()=>{
 const a=await build(data()),b=await build({...data(),stepId:'follow-up-1'});
 assert.notEqual(a.idempotencyKey,b.idempotencyKey);
});
test('rejects blank, malformed addresses, missing identity and unapproved channels',async()=>{
 for(const patch of [{recipientId:''},{content:'  '},{contactAddress:'bad-address'},{tenantId:'  '},{stepId:''},{channel:'whatsapp'}]){
   await assert.rejects(build({...data(),...patch}),/inválido|obrigatóri|suportad/);
 }
});
test('handles Unicode message text',async()=>{
 const a=await build({...data(),content:'Olá 👋🏽 — indústria química: redução de energia e água.'});
 assert.match(a.contentHash,/^[a-f0-9]{64}$/);
});
