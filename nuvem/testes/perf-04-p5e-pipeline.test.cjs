'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function criar(){
 let rev=1, tenant='t1', listener=()=>{}, chamadas=0;
 const store={revisao:()=>rev,hoje:()=> '2026-10-30',
 contexto:()=>({usuario:{id:'u1',papel:'admin'},tenantId:tenant,filtros:{tenant,usuario:'todos'}}),
 inscreverMudancas(fn){listener=fn;return()=>{listener=()=>{}}}};
 const engine={resumo(op,atrasos){chamadas++;return {op,classe:{id:'real'},tarefasAtrasadas:atrasos[op.id]||0};},
 carteira(ops,atrasos,pre){const abertas=ops.filter(o=>!o.desfecho);return {resumos:pre||abertas.map(o=>engine.resumo(o,atrasos))};}};
 const window={IADStore:store,IADEngine:engine,IAD_P5E_PIPELINE_ENABLED:true};
 const context=vm.createContext({window,console});
 for(const p of ['src/p5e-cache.js','src/pipeline-performance.js'])vm.runInContext(fs.readFileSync(p,'utf8'),context,{filename:p});
 return {window,store,engine,emit(id,type='atualizada'){rev++;listener({id,tipo:type,revisao:rev});},setTenant(t){tenant=t;},get chamadas(){return chamadas;}};
}
test('Pipeline aberto reutiliza resumo e recalcula somente a oportunidade editada',()=>{
 const f=criar(),est={oportunidades:[{id:'1',valor:100},{id:'2',valor:200}],tarefas:[]};
 const a=f.window.IADPipelinePerf.resumos(est);assert.equal(a.length,2);assert.equal(f.chamadas,2);
 f.emit('1');est.oportunidades[0]={id:'1',valor:150};
 const b=f.window.IADPipelinePerf.resumos(est);assert.equal(b[0].op.valor,150);assert.equal(f.chamadas,3);
});
test('Pipeline com desfecho usa motor integral, sem omitir encerrados',()=>{
 const f=criar(),est={oportunidades:[{id:'1',valor:100},{id:'2',desfecho:{tipo:'ganho'},valor:200}],tarefas:[]};
 const a=f.window.IADPipelinePerf.resumos(est);assert.equal(a.length,2);assert.equal(f.chamadas,2);
});
test('mudança de empresa invalida, sem reutilizar resultados de tenant anterior',()=>{
 const f=criar(),est={oportunidades:[{id:'1',valor:100},{id:'2',valor:200}],tarefas:[]};
 f.window.IADPipelinePerf.resumos(est);
 f.setTenant('t2');f.window.IADPipelinePerf.resumos(est);assert.equal(f.chamadas,4);
});
