'use strict';
// Somente transporte/auth; NÃO faz pesquisa, não envia JWT e não consome cota.
const assert=require('node:assert/strict');
const base='https://drhonmdffhnwamwzynrs.supabase.co/functions/v1/';
const endpoints=['market-search','market-search-v28685-canary'];
(async()=>{
 for(const slug of endpoints){
  const url=base+slug;
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
    body:'{"action":"search"}',signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,401,slug+' deve recusar chamada sem sessão');
  // Nunca ler resposta detalhada nem transmitir credenciais / dados do CRM.
  const preflight=await fetch(url,{method:'OPTIONS',headers:{origin:'https://www.iadcrm.com.br',
    'access-control-request-method':'POST'},signal:AbortSignal.timeout(20000)});
  assert.equal(preflight.status,204,slug+' deve preservar CORS para o domínio oficial');
  console.log('MARKET_CANARY_AUTH_PASS '+JSON.stringify({slug,post:response.status,options:preflight.status}));
 }
 console.log('MARKET_CANARY_PROVIDER_NOT_TESTED: o smoke nao autentica OpenAI/Claude');
})().catch(e=>{console.error('MARKET_CANARY_AUTH_FAIL '+e.message);process.exitCode=1});
