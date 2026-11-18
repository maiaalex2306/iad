'use strict';
/* PERF-39 / v286.109 — paridade da execução otimizada com implementação
 * referencial NÃO indexada, sob a MESMA interface, com benchmark de CPU.
 * Sintéticos, sem autenticação, rede, dados reais ou mutações do Store. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const views=fs.readFileSync(path.resolve(__dirname,'../src/views.js'),'utf8');
const ETAPAS=['Prospecção','Conexão','Diagnóstico','Benefícios','Proposta','Validação','Fechamento','Venda'];
const start=views.indexOf('  function kanban(resumos, totais) {');
const end=views.indexOf('  function cartaoKanban(r, etapas) {',start);
assert.ok(start>=0&&end>start,'Kanban deve existir no arquivo');
const optimizedBody=views.slice(start,end);
const referenceStart=optimizedBody.indexOf('    const quantidades = new Map(), visiveis = new Map();');
const referenceEnd=optimizedBody.indexOf('      const cartoes = grupo.map(',referenceStart);
assert.ok(referenceStart>0&&referenceEnd>referenceStart,'loop otimizado deve ser detectado');
/* Referência quadrática (por etapa): preserva EXATAMENTE o template
 * atual, a ordem, a paginação e os totais da versão publicada.
 * Apenas a forma de agrupar os dados muda, para medir PERF-39. */
const referenceBody=optimizedBody.slice(0,referenceStart)+
  "    const colunas = etapas.map(function (etapa) {\n"+
  "      const grupo = resumos.filter(function (r) { return r.op.etapa === etapa; }).slice(0,limitesKanban[etapa] || TAMANHO_LOTE_KANBAN);\n"+
  "      const todasDaEtapa = todos.filter(function (r) { return r.op.etapa === etapa; });\n"+
  "      const contagem = { total:todasDaEtapa.length, valor:todasDaEtapa.reduce(function(s,r){return s+(r.op.valor||0);},0) };\n"+
  optimizedBody.slice(referenceEnd);
function compile(body){
 const context={
  P:{ETAPAS},TAMANHO_LOTE_KANBAN:12,limitesKanban:Object.create(null),
  U:{compacto:v=>'R$'+Number(v).toFixed(2)},
  esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;'),
  cartaoKanban:r=>'<article data-id="'+r.op.id+'">'+r.op.titulo+'</article>',
 };
 const fn=vm.runInNewContext('(function () { '+body+' return kanban; })()',context);
 return {fn,context};
}
const optimized=compile(optimizedBody),reference=compile(referenceBody);
function rows(n){
 return Array.from({length:n},(_,i)=>({op:{
  id:'op'+i,titulo:i===15?'Frimesa':'Negócio '+i,etapa:ETAPAS[i%7],valor:(i%19)*11
 }}));
}
test('paridade exata com referência não indexada: colunas, valores e cartões',()=>{
 for(const n of [0,1,6,20,243,1000,5000,10000]){
  const full=rows(n),subset=full.filter((_,i)=>i%3===0);
  assert.equal(optimized.fn(subset,full),reference.fn(subset,full),'dados filtrados n='+n);
  assert.equal(optimized.fn(full),reference.fn(full),'todos n='+n);
 }
});
test('Kanban exibe até 12, informa o total e permite carregar mais sem perder Frimesa',()=>{
 const diag=Array.from({length:19},(_,i)=>({op:{id:'d'+i,etapa:'Diagnóstico',titulo:i===15?'Frimesa':'Empresa '+i,valor:100}}));
 const first=optimized.fn(diag);
 assert.match(first,/Mostrando 12 de 19/);
 assert.match(first,/19 negociações/);
 assert.match(first,/Mostrar mais negociações nesta etapa/);
 assert.doesNotMatch(first,/>Frimesa<\/article>/);
 optimized.context.limitesKanban['Diagnóstico']=24;
 reference.context.limitesKanban['Diagnóstico']=24;
 const next=optimized.fn(diag);
 assert.match(next,/>Frimesa<\/article>/);
 assert.equal(next,reference.fn(diag));
 delete optimized.context.limitesKanban['Diagnóstico'];
 delete reference.context.limitesKanban['Diagnóstico'];
});
test('filtro da busca alcança cartão fora do primeiro lote',()=>{
 const all=Array.from({length:19},(_,i)=>({op:{id:'d'+i,etapa:'Diagnóstico',titulo:i===15?'Frimesa':'Empresa '+i,valor:100}}));
 const hit=all.filter(r=>/frimesa/i.test(r.op.titulo));
 const html=optimized.fn(hit,hit);
 assert.match(html,/Mostrando 1 de 1/);
 assert.match(html,/Frimesa/);
});
test('sem efeitos colaterais; etapas inválidas isoladas',()=>{
 const data=rows(30);
 data.push({op:{id:'unknown',titulo:'Não listada',valor:999,etapa:'DESCONHECIDA'}});
 const snapshot=JSON.stringify(data);
 assert.equal(optimized.fn(data,data),reference.fn(data,data));
 assert.equal(JSON.stringify(data),snapshot);
});
test('benchmark CPU: índice mantém ganho >15% contra referência de mesma interface',()=>{
 const all=rows(10000),partial=all.slice(0,2000);
 for(let j=0;j<6;j++){optimized.fn(partial,all);reference.fn(partial,all);}
 const time=fn=>{const a=performance.now();fn(partial,all);return performance.now()-a;};
 const slow=[],fast=[];
 for(let j=0;j<21;j++){
  if(j%2===0){slow.push(time(reference.fn));fast.push(time(optimized.fn));}
  else{fast.push(time(optimized.fn));slow.push(time(reference.fn));}
 }
 const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
 const oldMs=median(slow),newMs=median(fast),gain=(1-newMs/oldMs)*100;
 console.log('PERF39_KANBAN_CPU '+JSON.stringify({
  scope:'Node VM synthetic, equivalent UI, not browser paint or authenticated latency',
  total:10000,visible:2000,samples:21,referenceP50Ms:+oldMs.toFixed(3),
  optimizedP50Ms:+newMs.toFixed(3),gainPct:+gain.toFixed(1)
 }));
 assert.ok(gain>15,'ganho esperado >15%; resultado '+gain.toFixed(1)+'%');
});
test('segurança e configuração: sem Store, fetch, ou escrita no template',()=>{
 assert.match(optimizedBody,/quantidades = new Map\(\), visiveis = new Map\(\)/);
 assert.doesNotMatch(optimizedBody,/Store\.|fetch\s*\(|localStorage|sessionStorage|\.sort\s*\(/);
 const config=fs.readFileSync(path.resolve(__dirname,'../src/config.js'),'utf8');
 const sw=fs.readFileSync(path.resolve(__dirname,'../sw.js'),'utf8');
 const version=config.match(/numero:\s*'(v286\.\d+)'/)?.[1];
 assert.ok(version&&sw.includes('iad-crm-'+version),'versões devem coincidir');
});