'use strict';
/* Regression gate: both intelligence screens share the official ACP tokens.
   The test is static, operates only on repository CSS, and never reads CRM data. */
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const ri=read('assets/ri-commercial.css');
const acp=read('assets/paleta-acp.css');
const sw=read('sw.js');
const config=read('src/config.js');
test('ACP palette is the single source for both intelligence modules',()=>{
 for(const token of ['--acp-brand','--acp-brand-dark','--acp-brand-fundo','--acp-brand-fundo2','--acp-brand-soft','--acp-accent','--acp-risk']){
   assert.ok(acp.includes(token+':')||acp.includes(token+': '),'Missing official token '+token);
 }
 assert.match(ri,/\.iad-ri-hero\s*\{[^}]*--acp-brand-fundo/s);
 assert.match(ri,/\.iad-ri-primary-small\s*\{[^}]*--acp-brand-fundo/s);
 assert.match(ri,/\.iad-ri-stage-bar\s*\{[^}]*--acp-brand/s);
 assert.match(ri,/\.iad-ri-radar-tab\.active\s*\{[^}]*--acp-brand-soft/s);
 assert.match(ri,/\.iad-ri-signal\.attention\s*\{[^}]*--acp-risk/s);
 assert.match(acp,/\.iad-market-ui .iad-market-btn-search\s*\{[^}]*--acp-brand-fundo/s);
 assert.match(acp,/\.iad-market-progress-dialog\s*\{[^}]*--acp-surface/s);
});
test('no hardcoded legacy navy/cyan remains in commercial intelligence CSS',()=>{
 const legacy=/#(?:102943|133f67|176a87|4078b4|a9e1f1|d6e8f5|e9f6fc|c3e6fa|d4e8f4|1b5c88|0a93a7|6aa2be|164b78|226298|77a3c2|3e83ad|e2edf8)\b|--pri-(?:fundo|borda|tinta)/i;
 assert.doesNotMatch(ri,legacy);
});
test('CSS-only patch preserves responsive breakpoints and semantic controls',()=>{
 assert.match(ri,/@media\s*\(max-width:640px\)/);
 assert.match(ri,/@media\s*\(max-width:820px\)/);
 assert.match(ri,/@media\s*\(max-width:420px\)/);
 assert.match(ri,/\.iad-ri-expired\s*\{[^}]*--urg-fundo/s);
 assert.match(ri,/\.iad-ri-signal\.attention\s*\{[^}]*--acp-risk/s);
 assert.match(ri,/\.iad-ri-radar-source\s*\{[^}]*--acp-brand/s);
});
test('version parity invalidates old offline CSS and retains lazy asset in SW',()=>{
 const version=config.match(/window\.IADVersao\s*=\s*\{[^}]*numero\s*:\s*'([^']+)'/s)?.[1];
 const cache=sw.match(/const CACHE = 'iad-crm-([^']+)'/)?.[1];
 assert.equal(version,'v286.84');
 assert.equal(cache,version);
 assert.ok(sw.includes("'./assets/ri-commercial.css'"),'CSS must be precached offline');
});
