'use strict';
/* PERF-10 P4 — benchmark determinístico isolado.
   NÃO simula latência de navegador, rede, Supabase, DOM ou experiência real.
   Mede estritamente o ganho de filtragem e ordenação de tarefas por oportunidade. */
const {performance}=require('node:perf_hooks');
const assert=require('node:assert/strict');
const SIZES=[243,389,1000,5000];
const WARMUP=30, SAMPLES=100;
function tasks(n){
 return Array.from({length:n},(_,i)=>({
  id:'task-'+i,
  oportunidadeId:'op-'+(i%25),
  status:i%4===0?'concluida':'aberta',
  semRegistro:i%13===0,
  concluidaEm:'2026-10-'+String(1+i%28).padStart(2,'0'),
  vencimento:'2026-10-'+String(1+(i*7)%28).padStart(2,'0')
 }));
}
const filters=['todas','abertas','atrasadas','concluidas','sem-relato'];
function eligible(t,f){
 if(f==='abertas')return t.status==='aberta';
 if(f==='atrasadas')return t.status==='aberta'&&t.vencimento<'2026-10-31';
 if(f==='concluidas')return t.status!=='aberta';
 if(f==='sem-relato')return t.status!=='aberta'&&t.semRegistro;
 return true;
}
function old(list,f){return list.slice().sort((a,b)=>a.vencimento.localeCompare(b.vencimento)).filter(t=>eligible(t,f));}
function optimized(list,f){return list.filter(t=>eligible(t,f)).sort((a,b)=>a.vencimento.localeCompare(b.vencimento));}
function percentile(arr,p){const a=arr.slice().sort((x,y)=>x-y);return a[Math.ceil(a.length*p)-1];}
function sample(fn){for(let i=0;i<WARMUP;i++)fn();const ms=[];for(let i=0;i<SAMPLES;i++){const t=performance.now();fn();ms.push(performance.now()-t);}return {p50Ms:percentile(ms,.5),p95Ms:percentile(ms,.95),maxMs:Math.max(...ms)};}
for(const n of SIZES){
 const all=tasks(n), rows=[];
 for(const f of filters){
  const a=old(all,f),b=optimized(all,f);
  assert.deepEqual(b,a,'Paridade da filtragem/ordenação: '+n+' '+f);
  const before=sample(()=>old(all,f));
  const after=sample(()=>optimized(all,f));
  rows.push({filtro:f,linhas:b.length,antesP50Ms:+before.p50Ms.toFixed(3),antesP95Ms:+before.p95Ms.toFixed(3),depoisP50Ms:+after.p50Ms.toFixed(3),depoisP95Ms:+after.p95Ms.toFixed(3)});
 }
 console.log(JSON.stringify({tipo:'microbenchmark isolado — não browser',tarefas:n,warmup:WARMUP,amostras:SAMPLES,resultados:rows}));
}
