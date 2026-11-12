'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{performance}=require('node:perf_hooks');
const w={};vm.runInNewContext(fs.readFileSync('src/p5e-cache.js','utf8'),{window:w,Map,Set,JSON});
function fixture(n) {
 let rev=1,tenant='t1',user='u1',filter='todos',dia='2026-10-30',listener=()=>{},calls=0;
 const store={inscreverMudancas(fn){listener=fn;return()=>{listener=()=>{}};},
  revisao:()=>rev,hoje:()=>dia,contexto:()=>({usuario:{id:user,papel:'admin'},tenantId:tenant,filtros:{tenant,usuario:filter}})};
 const engine={resumo:(op,idx)=>{calls++;return {op:{...op},classe:{id:'real'},iad:op.valor*2,atrasadas:idx[op.id]||0}},
  carteira:(ops,idx,resumos)=>({resumos:resumos||ops.map(o=>engine.resumo(o,idx)),total:(resumos||[]).reduce((s,r)=>s+r.op.valor,0)})};
 const ops=Array.from({length:n},(_,i)=>({id:'o'+i,valor:i+1}));
 const cache=w.IADP5e.criar(store,engine);
 return {ops,cache,engine,get calls(){return calls;},event(type,id){rev++;listener({tipo:type,id,revisao:rev});},
  changeTenant(s){tenant=s;},changeUser(s){user=s;},changeFilter(s){filter=s;},changeDay(s){dia=s;}};
}
test('paridade, hits e edição de uma entre 389 oportunidades',()=>{
 const x=fixture(389);const a=x.cache.calcular(x.ops,{});assert.equal(a.resumos.length,389);
 x.cache.calcular(x.ops,{});assert.equal(x.calls,389);
 x.ops[2]={id:'o2',valor:9000};x.event('atualizada','o2');
 const b=x.cache.calcular(x.ops,{});assert.equal(x.calls,390);assert.equal(b.resumos[2].op.valor,9000);
 assert.equal(b.total,x.ops.reduce((t,o)=>t+o.valor,0));
 x.cache.revogar();
});
test('full após tarefas, empresa, usuário, filtros e troca de dia',()=>{
 const x=fixture(243);x.cache.calcular(x.ops,{});
 x.event('full',null);x.cache.calcular(x.ops,{});assert.equal(x.calls,486);
 x.changeTenant('t2');x.cache.calcular(x.ops,{});assert.equal(x.calls,729);
 x.changeUser('u2');x.cache.calcular(x.ops,{});assert.equal(x.calls,972);
 x.changeFilter('u3');x.cache.calcular(x.ops,{});assert.equal(x.calls,1215);
 x.changeDay('2026-10-31');x.cache.calcular(x.ops,{});assert.equal(x.calls,1458);
 x.cache.revogar();
});
test('criação, exclusão e eventos perdidos reconstrução completa',()=>{
 const x=fixture(12);x.cache.calcular(x.ops,{});
 x.ops.push({id:'new',valor:10});x.event('criada','new');x.cache.calcular(x.ops,{});
 assert.equal(x.calls,25);
 x.ops.pop();x.event('excluida','new');x.cache.calcular(x.ops,{});
 assert.equal(x.calls,37);
 x.cache.revogar();assert.throws(()=>x.cache.calcular(x.ops,{}),/revogado/);
});
test('benchmarks p50/p95 com 243, 389, 1000 e 5000 oportunidades',()=>{
 for(const n of [243,389,1000,5000]) {
  const x=fixture(n),idx={};x.cache.calcular(x.ops,idx);
  const base=[],inc=[];
  for(let i=0;i<25;i++){
   const k=i%n;x.ops[k]={id:'o'+k,valor:i+100};
   const a=performance.now();x.engine.carteira(x.ops,idx);base.push(performance.now()-a);
   x.event('atualizada','o'+k);
   const b=performance.now();x.cache.calcular(x.ops,idx);inc.push(performance.now()-b);
  }
  const quant=(a,q)=>a.slice().sort((a,b)=>a-b)[Math.ceil(a.length*q)-1];
  const row={n,baseline_p50_ms:quant(base,.5),baseline_p95_ms:quant(base,.95),incremental_p50_ms:quant(inc,.5),incremental_p95_ms:quant(inc,.95)};
  console.log(JSON.stringify(row));assert.equal(x.cache.stats().ativos,n);x.cache.revogar();
 }
});

test('escrita concorrente durante resumo invalida cache e retorna ao motor integral',()=>{
 const x=fixture(4);let disparou=false;
 const original=x.engine.resumo;
 x.engine.resumo=(op,idx)=>{
   if(!disparou){disparou=true;x.event('full',null);}
   return original(op,idx);
 };
 const a=x.cache.calcular(x.ops,{});
 assert.equal(a.resumos.length,4);
 assert.equal(x.cache.stats().ativos,0);
 x.cache.calcular(x.ops,{});
 assert.equal(x.cache.stats().ativos,4);
 x.cache.revogar();
});

test('tarefa, evidência, conta e sincronização sem id exigem cálculo integral',()=>{
 const x=fixture(12),idx={};x.cache.calcular(x.ops,idx);
 for (const origem of ['tarefa','evidencia','conta','sincronizacao']) {
   x.event('full',null);
   x.cache.calcular(x.ops,idx);
 }
 assert.equal(x.calls,60);
 x.cache.revogar();
});
test('ordem e conjunto de oportunidades impedem índices cruzados',()=>{
 const x=fixture(12);x.cache.calcular(x.ops,{});
 x.ops[0]={id:'op-inédito',valor:10};
 x.cache.calcular(x.ops,{});
 assert.equal(x.calls,24);
 x.cache.revogar();
});
