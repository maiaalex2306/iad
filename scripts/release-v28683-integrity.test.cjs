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
test('versão PWA atômica, sem voltar abaixo de v286.83',()=>{
 const cache=read('sw.js').match(/const CACHE = 'iad-crm-v(\d+)\.(\d+)'/)?.slice(1).map(Number);
 const config=read('src/config.js').match(/numero: 'v(\d+)\.(\d+)'/)?.slice(1).map(Number);
 assert.ok(cache && config,'Versões do cache e do aplicativo precisam existir');
 assert.deepEqual(cache,config,'Versão do SW deve corresponder à versão executada');
 assert.ok(cache[0]>286 || (cache[0]===286 && cache[1]>=83),
  'O aplicativo não pode retroceder em relação ao release RI-08 v286.83');
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
