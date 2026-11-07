'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=cp.execFileSync('git',['show','33f13f9a27d9111dd0c47be9ac1c28fc9b79ac2b:src/engine.js'],{encoding:'utf8'});
const next=fs.readFileSync('src/engine.js','utf8');
function load(src,env){
 const start=src.indexOf('function carteira('),end=src.indexOf('\n  function pesoForca(',start);
 assert.ok(start!==-1&&end!==-1,'marcadores carteira');
 const func=src.slice(start,end).replace(/\n  }\s*$/,'\n  }');
 return vm.runInNewContext('(function(Store,resumo){'+func+';return carteira;})',{})(env.Store,env.resumo);
}
const pct=xs=>{const s=xs.slice().sort((a,b)=>a-b);return s[Math.ceil(s.length*.95)-1]};
const metrics=[];
for(const n of [0,1,243,389,1000,5000]){
 const ops=Array.from({length:n},(_,i)=>({id:'op'+i,valor:i%11===0?0:i%13===0?-10:i*123.45,desfecho:i%17===0?'ganho':null,idx:i}));
 const tasks=ops.filter(o=>!o.desfecho&&o.idx%5===0).map(o=>({oportunidadeId:o.id,status:'aberta',vencimento:'2026-01-01'}));
 const env={Store:{hoje:()=> '2026-10-30',dados:()=>({tarefas:tasks})},
 resumo:(op,indice)=>({op,iad:op.idx%17,evidenceAge:op.idx%40,coverage:{percentual:op.idx%101},gates:{prontidao:op.idx%8},
 classe:{id:['real','oculto','falso','construcao','zumbi'][op.idx%5],rotulo:'Grupo'},
 nbd:{dimensao:op.idx%9===0?null:{id:'d'+op.idx%4,nome:'D'+op.idx%4}},
 atrasadas:indice[op.id]||0})};
 const old=load(base,env),candidate=load(next,env);
 const norm=v=>JSON.parse(JSON.stringify(v));
 assert.deepEqual(norm(candidate(ops)),norm(old(ops)),'paridade n='+n);
 const oldTimes=[],newTimes=[];
 for(let j=0;j<12;j++){
   const t=process.hrtime.bigint();old(ops);oldTimes.push(Number(process.hrtime.bigint()-t)/1e6);
   const u=process.hrtime.bigint();candidate(ops);newTimes.push(Number(process.hrtime.bigint()-u)/1e6);
 }
 metrics.push({n,oldP95Ms:+pct(oldTimes).toFixed(3),newP95Ms:+pct(newTimes).toFixed(3),parity:true});
}
console.log('PERF04_P4_PARITY '+JSON.stringify(metrics));
