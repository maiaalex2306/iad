'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const cloud=fs.readFileSync('src/nuvem.js','utf8'),app=fs.readFileSync('src/app.js','utf8');
const a=cloud.indexOf('  function consultarCarteiraCASProtegida(cursor) {');
const b=cloud.indexOf('  function puxarCompleto(forcar) {',a);
assert.ok(a>=0&&b>a,'isolated remote read-only API exists');
const seen=[];
function make({pending=3,rows=[],switchSession=false,online=true}={}){
 const account={user:{id:'user1'},perfil:{tenant_id:'tenant1'}};
 let session=account,writes=0;
 const ctx={Promise,Error,String,Number,Set,Array,encodeURIComponent,
  conectado:()=>online,sessao:()=>session,
  diagnosticoPendenciasCAS:()=>({disponivel:true,quantidade:pending}),
  chamar:async(url,options)=>{
   seen.push({url,options});if(options)writes++;
   if(switchSession)session={user:{id:'user2'},perfil:{tenant_id:'tenant2'}};
   return rows;
  },
  paraApp:r=>({...r,converted:true})};
 vm.runInNewContext(cloud.slice(a,b)+'globalThis.load=consultarCarteiraCASProtegida;',ctx);
 return {load:ctx.load,writes:()=>writes};
}
test('pending CAS permits authenticated server read without any write',async()=>{
 seen.length=0;
 const r=await make({rows:[{id:'1',tenant_id:'tenant1',nome:'Negócio'}]}).load(null);
 assert.equal(r.itens.length,1);assert.equal(r.itens[0].converted,true);
 assert.equal(r.somenteLeitura,true);
 assert.equal(seen.length,1);assert.equal(seen[0].options,undefined);
 assert.match(seen[0].url,/\/rest\/v1\/oportunidades\?select=\*/);
});
test('paginated response is bounded to 100 with stable cursor',async()=>{
 seen.length=0;
 const rows=Array.from({length:101},(_,i)=>({id:String(i+1)}));
 const r=await make({rows}).load(null);
 assert.equal(r.itens.length,100);assert.equal(r.proximo,'100');
 await make({rows:[]}).load(r.proximo);
 assert.match(seen.at(-1).url,/id=gt\.100/);
});
test('session or tenant switch discards a stale response',async()=>{
 await assert.rejects(make({rows:[{id:'1'}],switchSession:true}).load(null),/Sessão ou empresa mudou/);
});
test('no CAS, no authenticated session, and duplicate rows fail closed',async()=>{
 await assert.rejects(make({pending:0}).load(null),/apenas com CAS pendente/);
 await assert.rejects(make({online:false}).load(null),/Sessão autenticada/);
 await assert.rejects(make({rows:[{id:'1'},{id:'1'}]}).load(null),/Paginação repetida/);
});
test('readonly UI uses DOM textContent, no Store or server mutations',()=>{
 const a=app.indexOf('  function visualizarCarteiraCASProtegida() {');
 const b=app.indexOf('  function render() {',a);
 assert.ok(a>=0&&b>a);
 const s=app.slice(a,b);
 assert.match(s,/textContent/);
 assert.match(s,/createElement/);
 assert.doesNotMatch(s,/innerHTML|Store\.|\.salvar\(|\.empurrar\(|\.flush\(/);
 assert.match(app,/Consultar carteira do servidor \(somente leitura\)/);
 assert.match(cloud,/consultarCarteiraCASProtegida,/);
});
test('app and PWA version aligned',()=>{
 assert.match(fs.readFileSync('src/config.js','utf8'),/numero: 'v286.45'/);
 assert.match(fs.readFileSync('sw.js','utf8'),/const CACHE = 'iad-crm-v286.45'/);
});
