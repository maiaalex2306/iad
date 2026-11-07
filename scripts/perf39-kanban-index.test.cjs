'use strict';
/* PERF-39: comparação exata de HTML e benchmark da renderização Kanban.
 * Dados sintéticos, sem APIs, credenciais, dados de clientes ou escrita. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const old=cp.execFileSync('git',['show','e89302ee35dc5975e75ffc3ece86b3cf71d53de9:src/views.js'],{cwd:root,encoding:'utf8',maxBuffer:4e6});
const newer=fs.readFileSync(path.join(root,'src/views.js'),'utf8');
const ETAPAS=['Conexão','Diagnóstico','Solução','Proposta','Negociação','Venda'];
function compile(source){
 const start=source.indexOf('  function kanban(resumos, totais) {');
 const end=source.indexOf('  function cartaoKanban(r, etapas) {',start);
 assert.ok(start>=0&&end>start,'função Kanban encontrada');
 const body=source.slice(start,end);
 const context={
  P:{ETAPAS},
  U:{compacto:v=>'R$'+Number(v).toFixed(2)},
  esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;'),
  cartaoKanban:r=>'<article data-id="'+r.op.id+'">'+r.op.titulo+'</article>',
 };
 return vm.runInNewContext('(function () { '+body+' return kanban; })()',context);
}
const prev=compile(old),next=compile(newer);
function rows(n){
 return Array.from({length:n},(_,i)=>({op:{
  id:'op'+i,titulo:'Negócio '+i,etapa:ETAPAS[i%ETAPAS.length],valor:(i%19)*11,
 }}));
}
test('HTML exato: colunas, arrastar, total, valores, cartões e ordenação',()=>{
 for(const n of [0,1,6,20,243,1000,5000,10000]){
  const full=rows(n),limited=full.filter((_,i)=>i%3===0);
  assert.equal(next(limited,full),prev(limited,full),'com totais distintos: '+n);
  assert.equal(next(full),prev(full),'sem total externo: '+n);
 }
});
test('HTML original sem efeitos colaterais e etapas desconhecidas isoladas',()=>{
 const r=rows(30);r.push({op:{id:'other',titulo:'Não listada',valor:999,etapa:'DESCONHECIDA'}});
 const before=JSON.stringify(r);
 assert.equal(next(r,r),prev(r,r));
 assert.equal(JSON.stringify(r),before);
});
test('benchmark CPU: 10 mil negócios com 80% dos cartões de fora do lote',()=>{
 const data=rows(10000),short=data.slice(0,2000);
 for(let j=0;j<6;j++){next(short,data);prev(short,data);}
 const time=(fn)=>{const start=performance.now();fn(short,data);return performance.now()-start;};
 const pre=[],post=[];
 for(let j=0;j<21;j++){
  if(j%2===0){pre.push(time(prev));post.push(time(next));}
  else{post.push(time(next));pre.push(time(prev));}
 }
 const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
 const p50Old=median(pre),p50New=median(post),gain=(1-p50New/p50Old)*100;
 console.log('PERF39_KANBAN_CPU '+JSON.stringify({
  scope:'Node.js VM sintético; sem navegador/auth/rede',
  total:10000,visiveis:2000,amostras:21,
  beforeP50Ms:+p50Old.toFixed(3),afterP50Ms:+p50New.toFixed(3),
  cpuGainPercent:+gain.toFixed(1)
 }));
 assert.ok(gain>15,'ganho esperado >15% nesta rotina; obtido '+gain.toFixed(1)+'%');
});
test('segurança: não mexer em desenho de cards nem escrever no Store',()=>{
 const a=newer.indexOf('  function kanban(resumos, totais) {');
 const b=newer.indexOf('  function cartaoKanban(r, etapas) {',a);
 const body=newer.slice(a,b);
 assert.match(body,/quantidades = new Map\(\), visiveis = new Map\(\)/);
 assert.doesNotMatch(body,/Store\.|fetch\s*\(|localStorage|sessionStorage|\.sort\s*\(/);
 const cfg=fs.readFileSync(path.join(root,'src/config.js'),'utf8');
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.match(cfg,/numero:\s*'v286\.82'/);
 assert.match(sw,/iad-crm-v286\.82/);
});
