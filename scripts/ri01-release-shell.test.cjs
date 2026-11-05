'use strict';
/* RI-01 release gate: the public feature and PWA must ship atomically.
 * These are assertions on the real release artifacts, not mocked config.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cfg=fs.readFileSync('src/config.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('src/app.js','utf8');
test('release version is coherent between application and service worker',()=>{
  const version=cfg.match(/window\.IADVersao\s*=\s*\{[^}]*numero:\s*'(v\d+(?:\.\d+)*)'/);
  const cache=sw.match(/const\s+CACHE\s*=\s*'([^']+)'/);
  assert.ok(version,'IADVersao required');
  assert.ok(cache,'service worker cache required');
  assert.equal(cache[1],'iad-crm-'+version[1]);
});
test('Inteligência Comercial is enabled explicitly in release config',()=>{
  assert.match(cfg,/window\.IAD_RI_ENABLED\s*=\s*true\s*;/);
  assert.match(app,/hash:\s*'#\/inteligencia'/);
  assert.match(app,/global\.IAD_RI_ENABLED\s*===\s*true/);
});
test('offline cache contains both ES modules, without sensitive application data',()=>{
  const paths=['./src/ri/account-view.mjs','./src/ri/account-briefing.mjs','./src/ri/portfolio-analytics.mjs'];
  for(const p of paths)assert.ok(sw.includes("'"+p+"'"),'Missing static cache asset '+p);
  assert.match(sw,/url\.origin\s*!==\s*self\.location\.origin/);
  assert.match(sw,/CAMINHOS_ESTATICOS/);
  assert.match(sw,/CHAVES_SENSIVEIS/);
  assert.doesNotMatch(sw,/\.\/rest\/v1|\.\/auth\/v1|service_role/i);
});
test('configuration loads before application route registration',()=>{
  const p=index.indexOf('src/config.js'),q=index.indexOf('src/app.js');
  assert.ok(p>=0&&q>p,'config must precede app JS');
});
