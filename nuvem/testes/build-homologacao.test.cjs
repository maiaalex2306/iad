/* Contract of staging Cloudflare build; no network, no real credentials. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../..');
const script=path.join(root,'scripts/build-homologacao.cjs');
const goodKey='sb_publishable_CREDENCIAL_FAKE_PARA_TESTES';
function exec(url,key,branch='performance/iad-perf-01') {
  return cp.spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',
    env:{...process.env,IAD_STAGING_URL:url,IAD_STAGING_PUBLISHABLE_KEY:key,CF_PAGES_BRANCH:branch}});
}
test('recusa produção e falha fechada sem ambiente isolado',()=>{
  const a=exec('https://drhonmdffhnwamwzynrs.supabase.co',goodKey);
  assert.notEqual(a.status,0);
  assert.match(a.stderr,/PRODUÇÃO/);
  const b=exec('',goodKey);
  assert.notEqual(b.status,0);
  const c=exec('https://exemplo-homolog.supabase.co',goodKey,'main');
  assert.notEqual(c.status,0);
});
test('gera arquivos estáticos com URL isolada e omite SQL e código servidor',()=>{
  const a=exec('https://exemplo-homolog.supabase.co',goodKey);
  assert.equal(a.status,0,a.stderr);
  const config=fs.readFileSync(path.join(root,'dist/src/config.js'),'utf8');
  assert.match(config,/exemplo-homolog.supabase.co/);
  assert.doesNotMatch(config,/drhonmdffhnwamwzynrs/);
  assert.match(config,/v268-HOMOLOG/);
  assert.match(config,/IADHomologacao = true/);
  const nuvem = fs.readFileSync(path.join(root,'dist/src/nuvem.js'),'utf8');
  assert.match(nuvem,/if \(global\.IADHomologacao\) return base/);
  assert.match(nuvem,/if \(global\.IADHomologacao\) throw new Error/);
  assert.equal(fs.existsSync(path.join(root,'dist/nuvem')),false);
  assert.equal(fs.existsSync(path.join(root,'dist/ponte')),false);
  assert.equal(fs.existsSync(path.join(root,'dist/CNAME')),false);
  assert.equal(fs.existsSync(path.join(root,'dist/index.html')),true);
  assert.equal(fs.existsSync(path.join(root,'dist/src/perf-hoje.js')),true);
  const body=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
  assert.match(body,/HOMOLOGAÇÃO v268/);
  assert.match(body,/location\\.replace\\('recuperar\\.html'/);
  assert.doesNotMatch(body,/location\\.replace\\('\/recuperar\\.html'/);
  const recuperar = fs.readFileSync(path.join(root,'dist/recuperar.html'),'utf8');
  assert.match(recuperar,/href="index\\.html"/);
  const recuperarJS = fs.readFileSync(path.join(root,'dist/src/recuperacao.js'),'utf8');
  assert.match(recuperarJS,/new URL\\('\.\/'\\, location\\.href\\)\\.href/);
});
