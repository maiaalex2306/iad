'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync('src/views.js','utf8');
function fn(name,proximo){
 const i=s.indexOf('  function '+name+'('),j=s.indexOf('  function '+proximo+'(',i);
 assert.ok(i>=0&&j>i,name);
 return s.slice(i,j);
}
test('filtros de UF, município, segmento e conjunto preservam resultados de v286',()=>{
 const ops=Array.from({length:389},(_,i)=>({
  id:'o'+i,contaId:'c'+i,donoId:'u1',etapa:i%2?'Diagnóstico':'Proposta',
  titulo:i===0?'The HEINEKEN':'Empresa '+i,valor:10000+i,desfecho:null
 }));
 const contas=Object.fromEntries(ops.map((o,i)=>[o.contaId,{
  nome:o.titulo,uf:i%7===0?'SP':i%3===0?'PR':'RJ',
  cidade:i%7===0?'São Paulo':i%3===0?'Curitiba':'Rio de Janeiro',
  segmento:i%5===0?'Industria':'Serviços'
 }]));
 let auth=0;
 const ctx={
  Store:{conta:id=>contas[id],tarefasDaOportunidade:()=>[]},
  E:{segmentoDe:op=>contas[op.contaId].segmento,depoisDaProposta:()=>false},
  global:{IADAuth:{atual:()=>{auth++;return{id:'u1'};}},
   IADLocalidades:{sigla:s=>s,normalizar:s=>String(s||'').toLowerCase()}}
 };
 vm.runInNewContext(
  fn('passaNoFiltroPipeline','ordenarPipeline')+
  fn('passaNoPrefiltroPipeline','resumosDoPipeline')+
  ';globalThis.funcoes={antigo:passaNoFiltroPipeline,novo:passaNoPrefiltroPipeline}',ctx);
 const base={
  responsavel:'todos',status:'abertas',busca:'',conta:'',uf:'',
  municipio:'',segmento:'',etapa:'',origem:'',sdr:'',produto:'',
  semTarefa:false,semCompromisso:false,esfriando:false,gateAberto:false,
  iadMin:'',iadMax:'',valorMin:'',valorMax:'',semEvidenciaDias:'',
  previsaoDe:'',previsaoAte:''
 };
 const combinacoes=[
  {uf:'SP'},{uf:'PR'},{municipio:'São Paulo'},{municipio:'Rio de Janeiro'},
  {segmento:'Industria'},{segmento:'Serviços'},
  {uf:'SP',segmento:'Industria'},
  {uf:'SP',municipio:'São Paulo',segmento:'Industria'},
  {uf:'SP',segmento:'Serviços',etapa:'Proposta'},
  {busca:'HEINEKEN',uf:'SP',segmento:'Industria'}
 ];
 for(const x of combinacoes){
  const filtro=Object.assign({},base,x),p=[];let selecionadas=0;
  for(const o of ops){
   const r={op:o,conta:contas[o.contaId],iad:10,faixa:{classe:'active'},
    gates:{liberado:true},evidenceAge:0};
   const antes=ctx.funcoes.antigo(r,filtro),depois=ctx.funcoes.novo(o,filtro);
   if(antes)p.push(o.id);
   assert.ok(!antes||depois,'falso negativo em '+JSON.stringify(x)+' '+o.id);
   if(depois)selecionadas++;
  }
  assert.equal(selecionadas,p.length,'somente campos do novo pré-filtro');
  if(x.uf==='SP'&&x.segmento==='Industria')
   assert.ok(selecionadas<40,'deve reduzir candidatos antes do Engine');
 }
 auth=0;
 const f=Object.assign({},base,{busca:'HEINEKEN'});
 for(const o of ops)ctx.funcoes.novo(o,f,{id:'u1'});
 assert.equal(auth,0,'identidade já capturada não deve ser buscada 389 vezes');
});
