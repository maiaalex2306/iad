'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm'),assert=require('node:assert/strict');
const baseline=cp.execFileSync('git',['show','2267c8bd780049842e44f8eb65db7dd421c5950e:src/engine.js'],{encoding:'utf8'});
const candidate=fs.readFileSync('src/engine.js','utf8');
function load(source,stats){
 const a=source.indexOf('  function resumo(op, atrasadasIndex) {');
 const b=source.indexOf('\n  /* Tarefa aberta com vencimento',a);
 assert.ok(a>=0&&b>a);
 const names=['Store','iad','evidenceAge','faixaEvidencia','decisionVelocity','coverage','gates','saude','classificar','nextBestDecision','alertas','compromisso','lacunas','tempoNaEtapa','deltaSemana','autoria','tarefasAtrasadas'];
 const stubs={
  Store:{conta:(id)=>({id})},iad:(o)=>o.valor%16,
  evidenceAge:(o)=>{stats.calls++;return o.idx%90;},
  faixaEvidencia:(v)=>v<30?'recente':'antiga',
  decisionVelocity:(o)=>o.idx%4,coverage:(o)=>({percentual:o.idx%100}),
  gates:(o)=>({prontidao:o.idx%5}),saude:(o)=>o.idx%2,
  classificar:(o)=>({id:o.idx%3}),nextBestDecision:(o)=>({id:o.idx%4}),
  alertas:()=>[],compromisso:()=>null,lacunas:()=>[],
  tempoNaEtapa:(o)=>o.idx%30,deltaSemana:()=>0,autoria:()=>[],
  tarefasAtrasadas:()=>0};
 const fn=vm.runInNewContext('(function('+names.join(',')+'){'+source.slice(a,b)+';return resumo;})');
 return fn(...names.map(n=>stubs[n]));
}
for(const n of [0,1,243,389,1000,5000]){
 const oldCounter={calls:0},newCounter={calls:0};
 const old=load(baseline,oldCounter),next=load(candidate,newCounter);
 const ops=Array.from({length:n},(_,idx)=>({id:'op'+idx,idx,valor:idx*13,contaId:'c'+idx}));
 const older=ops.map(o=>old(o,{})),newer=ops.map(o=>next(o,{}));
 assert.deepEqual(JSON.parse(JSON.stringify(newer)),JSON.parse(JSON.stringify(older)),'paridade '+n);
 assert.equal(oldCounter.calls,n*2);
 assert.equal(newCounter.calls,n);
 console.log(JSON.stringify({n,parity:true,evidenceAgeOld:oldCounter.calls,evidenceAgeNew:newCounter.calls}));
}
