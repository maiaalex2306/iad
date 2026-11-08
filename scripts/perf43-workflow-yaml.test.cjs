'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('PERF-43: titulo do workflow RI-M23 exige aspas e tres jobs',()=>{
 const s=fs.readFileSync(path.resolve(__dirname,'../.github/workflows/ri-m23-market-segment-breadth.yml'),'utf8');
 assert.match(s,/^name:\s*["']RI-M23 — Inteligência de Mercado: subsegmentos e ampla descoberta["']/m);
 assert.match(s,/^on:\s*$/m);
 assert.match(s,/^jobs:\s*$/m);
 for(const job of ['icp-breadth','canary-auth','visual-and-pwa'])
  assert.match(s,new RegExp('^  '+job+':','m'));
});
