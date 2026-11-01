'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const novo=fs.readFileSync('src/views.js','utf8');
const antigo=cp.execFileSync('git',['show','a844883082340fef513dac53f984d4143b88cc27:src/views.js'],
 {encoding:'utf8',maxBuffer:2*1024*1024});
function filtro(code,contexto){
 const a=code.indexOf('  function passaNoFiltroPipeline(');
 const b=code.indexOf('  function ordenarPipeline(',a);
 assert.ok(a>=0&&b>a);
 const ctx=Object.assign({},contexto);
 vm.runInNewContext(code.slice(a,b)+'\n;globalThis.filtrar=passaNoFiltroPipeline;',ctx);
 return ctx.filtrar;
}
test('filtro final não muda resultados, mesmo com sessão já capturada',()=>{
 const conta={id:'c1',nome:'The HEINEKEN',uf:'SP',cidade:'São Paulo',segmento:'Industria'};
 let chamadas=0;
 const contexto={
  Store:{tarefasDaOportunidade:()=>[]},
  E:{segmentoDe:()=> 'Industria',depoisDaProposta:()=>true},
  global:{IADAuth:{atual:()=>{chamadas++;return{id:'u1'};}},
   IADLocalidades:{sigla:x=>x,normalizar:x=>String(x).toLowerCase()}}
 };
 const original=filtro(antigo,contexto),atual=filtro(novo,contexto);
 const padrao={
   responsavel:'meu',status:'abertas',conta:'',uf:'',municipio:'',
   segmento:'',etapa:'',origem:'',sdr:'',produto:'',busca:'',semTarefa:false,
   semCompromisso:false,esfriando:false,gateAberto:false,iadMin:'',
   iadMax:'',valorMin:'',valorMax:'',semEvidenciaDias:'',previsaoDe:'',previsaoAte:''
 };
 const filtros=[{}, {responsavel:'outro'},{uf:'SP',segmento:'Industria'},
  {busca:'HEINEKEN'}, {iadMin:'20'},{semTarefa:true},{valorMin:'10000'},
  {gateAberto:true},{esfriando:true},{previsaoDe:'2026-11-01'}];
 for(const caso of filtros){
  for(let i=0;i<389;i++){
   const op={id:'o'+i,contaId:'c1',titulo:'The HEINEKEN',valor:10000+i,
    donoId:i%5?'u1':'u2',etapa:i%2?'Proposta':'Diagnóstico',
    fechamentoPrevisto:'2026-12-01',desfecho:null};
   const r={op,conta,iad:i%32,evidenceAge:10,gates:{liberado:false},
    faixa:{classe:i%4===0?'risk':'active'}};
   const f=Object.assign({},padrao,caso);
   assert.equal(atual(r,f,{id:'u1'}),original(r,f),
    'filtro final divergente '+JSON.stringify(caso)+' '+i);
  }
 }
 chamadas=0;
 const op={donoId:'u1',contaId:'c1',desfecho:null};
 for(let i=0;i<389;i++)atual({op,conta,iad:1,evidenceAge:3,
  gates:{liberado:true},faixa:{classe:'active'}},padrao,{id:'u1'});
 assert.equal(chamadas,0);
});
test('barra de filtros recebe o mesmo snapshot da tela sem recomputar Store.dados',()=>{
 assert.match(novo,/function barraDoPipeline\(resumos, total, est\)/);
 const i=novo.indexOf('  function barraDoPipeline(');
 const j=novo.indexOf('  function gavetaDeFiltros(',i);
 assert.ok(j>i);
 const corpo=novo.slice(i,j);
 assert.match(corpo,/E\.segmentosDisponiveis\(est\.oportunidades\)/);
 assert.doesNotMatch(corpo,/Store\.dados\(\)\.oportunidades/);
 assert.match(novo,/barraDoPipeline\(resumos, total, est\) \+ corpo/);
});
