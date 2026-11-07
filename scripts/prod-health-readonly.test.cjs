'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {versionConfig,versionSW,assertCompatible,run}=require('./prod-health-readonly.cjs');

const ready=()=>({
  config:"window.IADVersao = { numero: 'v286.83', data: '2026-11-06' };",
  worker:"const CACHE = 'iad-crm-v286.83';",
  index:'<html><title>IAD CRM</title><div class="app"></div><script defer src="src/auth.js"></script></html>',
  intents:'/* RI-08 detector local de intencoes comerciais */',
  radar:'export function buildCommercialOpportunityRadar() {}',
  authStatus:401
});
test('versions match the real PWA cache and release configuration',()=>{
  assert.equal(versionConfig(ready().config),'286.83');
  assert.equal(versionSW(ready().worker),'286.83');
  assert.equal(assertCompatible(ready()).version,'v286.83');
});
test('fail closed: stale service worker cache',()=>{
  const f=ready();f.worker="const CACHE = 'iad-crm-v286.82';";
  assert.throws(()=>assertCompatible(f),/PWA_VERSION_MISMATCH/);
});
test('fail closed: old release or missing modules',()=>{
  for(const v of ['286.82','285.99']){
    const f=ready();f.config=f.config.replace('286.83',v);f.worker=f.worker.replace('286.83',v);
    assert.throws(()=>assertCompatible(f),/PRODUCTION_VERSION_BELOW_RELEASE_FLOOR/);
  }
  for(const k of ['index','intents','radar']){
    const f=ready();f[k]='';
    assert.throws(()=>assertCompatible(f),/INVALID/);
  }
});
test('AI provider or Auth outage blocks health without authenticated claims',()=>{
  for(const status of [200,400,403,404,429,500,502,503,504]){
    const f=ready();f.authStatus=status;
    assert.throws(()=>assertCompatible(f),new RegExp('AI_AUTH_GATE_UNAVAILABLE_HTTP_'+status));
  }
  assert.equal(assertCompatible(ready()).authenticatedLLM,'NOT_TESTED');
});
test('probe stays read-only, sends no user session and never accepts 404 assets',async()=>{
  const fixture=ready();
  const calls=[];
  const lookup={
    '/src/config.js':fixture.config,'/sw.js':fixture.worker,'/index.html':fixture.index,
    '/src/ri/conversation-intent.mjs':fixture.intents,
    '/src/ri/opportunity-radar.mjs':fixture.radar
  };
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/functions/v1/assistente')){
      assert.equal(options.method,'POST');
      assert.deepEqual(JSON.parse(options.body),{tipo:'diagnostico'});
      assert.equal(options.headers.authorization,undefined);
      return {status:401};
    }
    assert.equal(options.method,'GET');
    const path=new URL(url).pathname;
    if(!(path in lookup))return {status:404,text:async()=>''};
    return {status:200,text:async()=>lookup[path]};
  };
  const actual=await run({fetchImpl,requestId:'ci'});
  assert.equal(actual.version,'v286.83');
  assert.equal(calls.length,6);
  assert.ok(calls.every(c=>!JSON.stringify(c.options).includes('Bearer')));
  const bad=async()=>({status:404,text:async()=>''});
  await assert.rejects(run({fetchImpl:bad}),/ASSET_HTTP_404/);
});
