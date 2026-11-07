'use strict';
/* HTTP boundary only. No JWT, no company data, no paid AI request. */
const assert=require('node:assert/strict');
(async()=>{
 for(const [label,base] of [
  ['stage-v28688','https://bvlfzeblpewlqhssprpv.supabase.co/functions/v1/market-search-v28688-canary'],
  ['production-current','https://drhonmdffhnwamwzynrs.supabase.co/functions/v1/market-search']
 ]){
  const unauthorized=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},
   body:'{"action":"search","batch":{"municipioIBGE":"3549904","familyIndex":1}}',
   signal:AbortSignal.timeout(20000)});
  assert.equal(unauthorized.status,401,label+' must deny request without user session');
  const cors=await fetch(base,{method:'OPTIONS',headers:{
   origin:'https://www.iadcrm.com.br','access-control-request-method':'POST'
  },signal:AbortSignal.timeout(20000)});
  assert.equal(cors.status,204,label+' must preserve preflight');
  console.log('RI_M24_CANARY_AUTH_PASS '+JSON.stringify({label,unauthorized:401,cors:204}));
 }
 console.log('RI_M24_NO_PAID_PROVIDER_CALLS');
})().catch(e=>{console.error('RI_M24_CANARY_AUTH_FAIL '+e.message);process.exitCode=1});
