'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('PWA precache do detector e sem API autenticada em cache',()=>{
 const sw=read('sw.js');
 for(const name of ['src/ri/conversation-intent.mjs','src/ri/internal-cues.mjs','src/ri/account-view.mjs','src/nuvem.js','src/performance.js']){
  assert(sw.includes("'./"+name+"'"),'precache faltando '+name);
  assert(fs.existsSync(path.join(root,name)),name);
 }
 assert.match(sw,/if \(e.request.method !== 'GET'\) return/);
 assert.match(sw,/url.origin !== self.location.origin/);
 assert.match(sw,/CHAVES_SENSIVEIS/);
 assert(!sw.includes("functions/v1/assistente"));
});
test('versão v286.83 é atômica no PWA',()=>{
 assert.match(read('sw.js'),/CACHE = 'iad-crm-v286\.83'/);
 assert.match(read('src/config.js'),/numero: 'v286\.83'/);
});
test('PERF-39 Kanban e RI-08 mensagens convivem',()=>{
 const v=read('src/views.js');
 assert(v.includes('PERF-39: indexar uma única vez as etapas'));
 assert(v.includes('const quantidades = new Map(), visiveis = new Map()'));
 assert(v.includes('Sinais comerciais encontrados'));
 assert(v.includes('sinaisLocais'));
});
test('PERF-40, RLS/CAS e render permanecem instrumentados',()=>{
 const n=read('src/nuvem.js'),p=read('src/performance.js');
 for(const metric of ['perf40.sync.full.download','perf40.sync.full.persist','perf40.sync.full.marks','perf40.sync.table.oportunidades'])assert(p.includes(metric),metric);
 assert(n.includes('tenantsComFilaCAS().some'));assert(n.includes('Store.semSincronizar'));
 new vm.Script(read('sw.js'));
});
