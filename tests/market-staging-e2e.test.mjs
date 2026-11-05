import test from 'node:test';
import assert from 'node:assert/strict';
import {runMarketResearchE2E} from '../scripts/ri-m01-staging-e2e.mjs';

const env={
 RI_M01_STAGING_EMAIL:'test@example.invalid',
 RI_M01_STAGING_PASSWORD:'example-test-password',
 RI_M01_STAGING_ANON_KEY:'test-anon-key'
};
const stubFetch=({providers=['OpenAI','Anthropic'],status=200,claim=null}={})=>async(url,opt={})=>{
 if(String(url).includes('/auth/v1/token?grant_type=password')){
  assert.equal(opt.method,'POST');
  return new Response(JSON.stringify({access_token:'test-access-token',token_type:'bearer'}),{status:200});
 }
 if(String(url).includes('/auth/v1/user'))return new Response(JSON.stringify({id:'00000000-0000-4000-8000-000000000001'}),{status:200});
 if(String(url).includes('/functions/v1/market-search')){
  assert.match(opt.headers.Authorization,/^Bearer /);
  return new Response(JSON.stringify(claim??{
   data:[{cnpj:'11222333000181',fontes:[{url:'https://example.org/registro'}]}],
   coverage:'exploratoria',coverageStatus:'unknown',total:null,hasMore:null,
   providers,partial:false,failedProviders:[],
   usage:providers.map(provider=>({provider,inputTokens:100,outputTokens:200,webSearchRequests:1,costBRL:null}))
  }),{status});
 }
 throw Error('unexpected URL '+url);
};
test('E2E staging requires both providers, validates response and outputs metrics only',async()=>{
 const result=await runMarketResearchE2E({fetchImpl:stubFetch(),env,log:()=>{}});
 assert.deepEqual(result.providers,['OpenAI','Anthropic']);
 assert.equal(result.companiesWithSources,1);
 assert.equal(result.coverageStatus,'unknown');
 assert.ok(Number.isFinite(result.elapsedMs));
});
test('E2E staging blocks partial results rather than certifying only one provider',async()=>{
 await assert.rejects(runMarketResearchE2E({fetchImpl:stubFetch({providers:['OpenAI']}),env,log:()=>{}}),/both providers/i);
});
test('E2E staging blocks unknown or fabricated total coverage',async()=>{
 await assert.rejects(runMarketResearchE2E({fetchImpl:stubFetch({claim:{data:[],providers:['OpenAI','Anthropic'],coverageStatus:'complete',total:100,hasMore:false}}),env,log:()=>{}}),/coverage/i);
});
test('E2E refuses to run when staging credentials are absent, with no HTTP requests',async()=>{
 let count=0;
 await assert.rejects(runMarketResearchE2E({fetchImpl:async()=>{count++},env:{},log:()=>{}}),/credentials/i);
 assert.equal(count,0);
});
