'use strict';
const assert=require('node:assert/strict');
// Auth/CORS smoke only. No JWT, no real research, no token usage.
const sites=[
 {name:'canary-stage-v28687',url:'https://bvlfzeblpewlqhssprpv.supabase.co/functions/v1/market-search-v28687-canary'},
 {name:'current-prod',url:'https://drhonmdffhnwamwzynrs.supabase.co/functions/v1/market-search'}
];
(async()=>{
 for(const p of sites){
  const req=await fetch(p.url,{method:'POST',headers:{'content-type':'application/json'},
   body:'{"action":"search","filters":{"uf":"SP","segmentos":["Automotivo e Mobilidade"]}}',
   signal:AbortSignal.timeout(16000)});
  assert.equal(req.status,401,p.name+' must reject unauthenticated queries');
  const options=await fetch(p.url,{method:'OPTIONS',headers:{
    origin:'https://www.iadcrm.com.br','access-control-request-method':'POST'},
    signal:AbortSignal.timeout(16000)});
  assert.equal(options.status,204,p.name+' must allow preflight');
  console.log('RI_M23_CANARY_AUTH_PASS '+JSON.stringify({name:p.name,post:req.status,options:options.status}));
 }
 console.log('RI_M23_AUTH_ONLY_LLM_NOT_TESTED');
})().catch(e=>{console.error('RI_M23_CANARY_FAIL '+e.message);process.exitCode=1});
