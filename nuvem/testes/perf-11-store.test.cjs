'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const baseline='a844883082340fef513dac53f984d4143b88cc27';
const oldCode=cp.execFileSync('git',['show',baseline+':src/store.js'],{encoding:'utf8',maxBuffer:2*1024*1024});
const newCode=fs.readFileSync('src/store.js','utf8');
const playbook=fs.readFileSync('src/playbook.js','utf8');
function montar(code,role,tenant,filters){
 const metrics={auth:0,filtros:0};
 const u=role?{id:tenant==='b'?'u2':'u1',papel:role,tenantId:tenant}:null;
 const w={console,IADAuth:{
   atual:()=>{metrics.auth++;return u;},
   filtros:()=>{metrics.filtros++;return filters;}
 }};
 const localStorage={removeItem(){},getItem(){return null;},setItem(){}};
 const ctx={window:w,localStorage,Date,Math,JSON,Map,Set,console};
 vm.runInNewContext(playbook,ctx,{filename:'playbook.js'});
 vm.runInNewContext(code,ctx,{filename:'store.js'});
 const e=w.IADStore.obter();
 e.tenants=[{id:'a'},{id:'b'}];
 e.usuarios=[{id:'u1',tenantId:'a'},{id:'u2',tenantId:'b'}];
 function lista(n,prefix,linked){
   return Array.from({length:n},(_,i)=>Object.assign({
     id:prefix+i,tenantId:i%7===0?'b':'a',donoId:i%3===0?'u2':'u1'
   }, linked?linked(i):{}));
 }
 e.contas=lista(384,'c');
 e.contatos=lista(564,'k',i=>({contaId:'c'+(i%384)}));
 e.oportunidades=lista(389,'o',i=>({contaId:'c'+(i%384),eventos:[]}));
 e.tarefas=lista(459,'t',i=>({oportunidadeId:'o'+(i%389)}));
 e.segmentos=lista(20,'s');e.tiposTarefa=lista(813,'tt');
 e.produtos=[];e.fontes=lista(160,'f');
 e.sinais=lista(180,'si');e.notas=lista(40,'not',i=>({criadoEm:'2026-10-01',feita:!!(i%2)}));
 w.IADStore.salvar();
 metrics.auth=0;metrics.filtros=0;
 const dados=w.IADStore.dados();
 return {dados:JSON.parse(JSON.stringify(dados)),metrics,S:w.IADStore};
}
test('3919 registros sintéticos: mesmos resultados da v286 em todos os escopos',()=>{
 const casos=[
   ['admin','a',{tenant:'todas',usuario:'todos'}],
   ['admin','a',{tenant:'a',usuario:'todos'}],
   ['admin','a',{tenant:'a',usuario:'u1'}],
   ['gestor','a',{tenant:'todas',usuario:'todos'}],
   ['usuario','a',{tenant:'todas',usuario:'todos'}],
   ['usuario','b',{tenant:'todas',usuario:'todos'}],
   [null,null,{tenant:'todas',usuario:'todos'}]
 ];
 for(const [role,tenant,filters] of casos){
   const before=montar(oldCode,role,tenant,filters);
   const after=montar(newCode,role,tenant,filters);
   assert.deepEqual(after.dados,before.dados,'mudança de visibilidade em '+role+'/'+tenant+'/'+JSON.stringify(filters));
   assert.ok(before.metrics.auth>2000,'baseline não exerceu o gargalo esperado');
   assert.equal(after.metrics.auth,1,'contexto foi recalculado na mesma leitura');
   assert.equal(after.metrics.filtros,role?1:0);
 }
});
test('Store.dados não mantém cache entre leituras nem revela outras empresas',()=>{
 const atual=montar(newCode,'usuario','a',{tenant:'todas',usuario:'todos'});
 const visiveis=atual.S.dados().oportunidades;
 assert.ok(visiveis.length<389&&visiveis.length>0);
 assert.ok(visiveis.every(x=>x.tenantId==='a'&&(!x.donoId||x.donoId==='u1')));
 const item=atual.S.obter().oportunidades.find(x=>x.tenantId==='a'&&x.donoId==='u1');
 item.titulo='Editado sem cache';
 assert.equal(atual.S.dados().oportunidades.find(x=>x.id===item.id).titulo,'Editado sem cache');
});
