'use strict';
// Smoke test read-only: sem JWT, sem corpo de pesquisa válida, sem consumo de cotas.
const assert=require('node:assert/strict');
(async()=>{
 const targets=[
  {name:'stage-identity',url:'https://bvlfzeblpewlqhssprpv.supabase.co/functions/v1/market-search-v28686-canary'},
  {name:'prod-current',url:'https://drhonmdffhnwamwzynrs.supabase.co/functions/v1/market-search'}
 ];
 for(const t of targets){
  const res=await fetch(t.url,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({action:'investigate',target:{cnpj:null,nome:'Empresa Teste'}}),
   signal:AbortSignal.timeout(20000)});
  assert.equal(res.status,401,t.name+' deve exigir sessão antes de investigar identidade');
  const options=await fetch(t.url,{method:'OPTIONS',headers:{
   origin:'https://www.iadcrm.com.br','access-control-request-method':'POST'
  },signal:AbortSignal.timeout(20000)});
  assert.equal(options.status,204,t.name+' deve preservar preflight do site oficial');
  console.log('RI_M22_CANARY_AUTH_PASS '+JSON.stringify({name:t.name,post:res.status,options:options.status}));
 }
 console.log('RI_M22_CANARY_LLM_NOT_TESTED');
})().catch(e=>{console.error('RI_M22_CANARY_AUTH_FAIL '+e.message);process.exitCode=1});
