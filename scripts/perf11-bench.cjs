'use strict';
const {performance}=require('node:perf_hooks');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/pipeline-performance.js','utf8');
function medir(n, busca){
 let calls=0;
 const w={IADStore:{revisao:()=>1,hoje:()=> '2026-10-31',
   contexto:()=>({usuario:{id:'bench',papel:'gestor'},tenantId:'a',filtros:{}})},
   IADEngine:{resumo:(op,idx)=>{calls++;
     let s=0;for(let i=0;i<300+(op.eventos.length*50);i++)s+=((i%17)*3);
     return {op,iad:s,atrasadas:idx[op.id]||0};
   }}};
 vm.runInNewContext(source,{window:w,Map,Set,Math,Date,JSON,console});
 const ops=Array.from({length:n},(_,i)=>({id:'id'+i,
   titulo:i===0?'The HEINEKEN':i===1?'Suzano':'Empresa '+i,
   eventos:Array.from({length:i===0?131:i===1?130:i%5},()=>({}))}));
 const est={oportunidades:ops,tarefas:[]};
 const prefix=ops.filter(o=>o.titulo.includes(busca));
 const t0=performance.now();
 const base=ops.map(o=>w.IADEngine.resumo(o,{})).filter(r=>prefix.includes(r.op));
 const total=performance.now()-t0;
 const chamadasAntes=calls;calls=0;
 const t1=performance.now();
 const otimizado=w.IADPipelinePerf.resumosElegiveis(est,prefix);
 const novo=performance.now()-t1;
 if(base.map(x=>x.op.id).join(',')!==otimizado.map(x=>x.op.id).join(','))throw Error('Paridade falhou');
 return {ops:n,termo:busca,candidatos:prefix.length,calculosAntes:chamadasAntes,
   calculosDepois:calls,tempoAntesMs:+total.toFixed(3),tempoDepoisMs:+novo.toFixed(3)};
}
for(const n of [389,1000,5000,10000]){
 const r=medir(n,'HEINEKEN');
 if(r.calculosAntes!==n||r.calculosDepois!==1)throw Error('Contagem divergente');
 console.log(JSON.stringify({simulacao:true,...r}));
}
