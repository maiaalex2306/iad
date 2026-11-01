'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const atual=fs.readFileSync('src/views.js','utf8');
const antigo=cp.execFileSync('git',['show','a844883082340fef513dac53f984d4143b88cc27:src/views.js'],
  {encoding:'utf8',maxBuffer:2*1024*1024});
function funcao(src,store){
 const ini=src.indexOf('  function outrasAbertasDaConta(op) {');
 const fim=src.indexOf('  function barraDeAcoes(op) {',ini);
 assert.ok(ini>=0&&fim>ini);
 const ctx={Store:store};
 vm.runInNewContext(src.slice(ini,fim)+'\n;globalThis.testar=outrasAbertasDaConta;',ctx);
 return ctx.testar;
}
const oportunidades=Array.from({length:389},(_,i)=>({
 id:'o'+i,tenantId:i%6===0?'b':'a',donoId:i%4===0?'u2':'u1',
 contaId:i%10===0?'c0':'c'+(i%384),desfecho:i%7===0?{tipo:'ganho'}:null
}));
const op={id:'o1',contaId:'c0',tenantId:'a',donoId:'u1'};
function montar(role,tenant,filtroTenant='todas',filtroUsuario='todos'){
 const contagem={dados:0};
 const visivel=o=>{
   if(!role)return false;
   if(role==='admin')
     return (filtroTenant==='todas'||o.tenantId===filtroTenant)&&
       (filtroUsuario==='todos'||o.donoId===filtroUsuario);
   return o.tenantId===tenant&&(role==='gestor'||!o.donoId||o.donoId===(tenant==='b'?'u2':'u1'));
 };
 const store={
   obter:()=>({oportunidades}),
   dados:()=>{contagem.dados++;return {oportunidades:oportunidades.filter(visivel)};},
   visivel
 };
 return{store,contagem};
}
test('mesma relação de outras oportunidades abertas, em todos os escopos',()=>{
 const casos=[
   ['admin','a','todas','todos'],['admin','a','a','todos'],
   ['admin','a','a','u1'],['gestor','a'],['usuario','a'],
   ['usuario','b'],[null,null]
 ];
 for(const caso of casos){
   const ctx=montar(...caso);
   const antes=funcao(antigo,ctx.store)(op).map(x=>x.id);
   const depois=funcao(atual,ctx.store)(op).map(x=>x.id);
   assert.deepEqual(depois,antes,'visibilidade alterada em '+JSON.stringify(caso));
 }
});
test('abertura do cockpit não varre Store.dados inteiro para verificar junção',()=>{
 const contexto=montar('admin','a','todas','todos');
 const found=funcao(atual,contexto.store)(op);
 assert.ok(found.length>0);
 assert.equal(contexto.contagem.dados,0,'Store.dados global não deve ser chamado');
 const falha=funcao(atual,contexto.store)(null);
 assert.equal(falha.length,0);
});
