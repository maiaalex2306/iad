'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const {performance}=require('node:perf_hooks');
const antes=cp.execFileSync('git',['show','f58b6f55f9840d74b082dcff78594f1555ef4d2b:src/views.js'],{encoding:'utf8',maxBuffer:2*1024*1024});
const depois=fs.readFileSync('src/views.js','utf8');
function preparar(){
 const usuario={id:'u1',papel:'gestor',tenantId:'a'};
 const w={console,IADAuth:{atual:()=>usuario,filtros:()=>({tenant:'todas',usuario:'todos'})}};
 const localStorage={removeItem(){},getItem(){return null},setItem(){}};
 const ctx={window:w,localStorage,Date,Math,JSON,Map,Set,console};
 for(const f of ['playbook','store','engine','pipeline-performance']){
  vm.runInNewContext(fs.readFileSync('src/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
 }
 const S=w.IADStore,P=w.IADPlaybook,E=w.IADEngine,s=S.obter();
 const dims=Object.fromEntries(P.DIMENSOES.map(d=>[d.id,2]));
 s.tenants=[{id:'a'},{id:'b'}];
 s.contas=Array.from({length:384},(_,i)=>({id:'c'+i,tenantId:'a',donoId:'u1',nome:'Empresa '+i}));
 s.contatos=Array.from({length:564},(_,i)=>({id:'p'+i,tenantId:'a',donoId:'u1',
  contaId:'c'+(i%384),papel:i%4?'decisor_economico':'champion',perfil:'mobilizador',sentimento:'favoravel'}));
 s.oportunidades=Array.from({length:389},(_,i)=>{
  const eventos=Array.from({length:i===0?131:i===1?130:i%6},(_,j)=>({
    id:'e'+i+'_'+j,tipo:'decision',dimensao:P.DIMENSOES[j%P.DIMENSOES.length].id,
    data:'2026-10-20',contatoId:'p'+(j%564),forca:'confirmado'
  }));
  return{id:'o'+i,tenantId:'a',donoId:'u1',contaId:'c'+(i%384),
   titulo:i===0?'The HEINEKEN':i===1?'Suzano':'Empresa '+i,
   valor:10000+i,criadoEm:'2026-10-01',etapaDesde:'2026-10-01',
   etapa:i%3?'Diagnóstico':'Proposta',fechamentoPrevisto:'2026-12-01',
   dims:Object.assign({},dims),eventos,
   snapshots:Array.from({length:i===0?18:i===1?26:1},(_,j)=>({
      data:'2026-10-20',iad:16,dims:Object.assign({},dims)})),
   stakeholders:Array.from({length:i===0?15:i===1?11:2},(_,j)=>'p'+(j%564)),
   desfecho:null
  };
 });
 s.tarefas=Array.from({length:459},(_,i)=>({id:'t'+i,tenantId:'a',donoId:'u1',
   oportunidadeId:'o'+(i%389),vencimento:'2026-10-01',status:'aberta',titulo:'Tarefa '+i}));
 s.sinais=[];s.notas=[];s.segmentos=[];s.tiposTarefa=[];s.fontes=[];s.produtos=[];
 S.salvar();
 let chamadas=0;
 const original=E.resumo;
 E.resumo=function(){chamadas++;return original.apply(E,arguments);};
 return{w,E,S,est:S.dados(),chamadas:()=>chamadas};
}
function construir(src, dados){
 const start=src.indexOf('  function provaDaDimensao(');
 const end=src.indexOf('  function blocoGate(',start);
 assert.ok(start>=0&&end>start);
 const P=dados.w.IADPlaybook,E=dados.E,Store=dados.S;
 const FORCE=Object.fromEntries(P.FORCAS.map(x=>[x.id,x.rotulo]));
 const ctx={P,E,Store,FORCA_ROTULO:FORCE,U:{data:d=>String(d||'')},
   esc:x=>String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')};
 vm.runInNewContext(src.slice(start,end)+'\n;globalThis.bloco=blocoDimensoes;',ctx);
 return ctx.bloco;
}
const normalizar=x=>String(x);
const percentile=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.ceil(a.length*p)-1];
test('389 negócios: HTML das 8 decisões idêntico ao legado',()=>{
 const a=preparar(),b=preparar();
 const oldFn=construir(antes,a),newFn=construir(depois,b);
 let oldCalls=0,newCalls=0;
 const oldLac=a.E.lacunas,newLac=b.E.lacunas;
 a.E.lacunas=function(op){oldCalls++;return oldLac(op)};
 b.E.lacunas=function(op){newCalls++;return newLac(op)};
 assert.equal(a.est.oportunidades.length,389);
 for(let i=0;i<389;i++){
  const antigo=normalizar(oldFn(a.est.oportunidades[i]));
  const novo=normalizar(newFn(b.est.oportunidades[i]));
  assert.equal(novo,antigo,'HTML divergente no lead '+i);
 }
 assert.equal(oldCalls,389*8,'original recalcula lacunas oito vezes');
 assert.equal(newCalls,389,'novo deve calcular lacunas uma vez');
 console.log(JSON.stringify({tipo:'PERF11E varreduras de lacunas',oportunidades:389,
   antes:oldCalls,depois:newCalls,reducaoPercentual:87.5}));
});
test('Evidências e permissões permanecem atualizadas entre aberturas do painel',()=>{
 const a=preparar(),b=preparar(),f1=construir(antes,a),f2=construir(depois,b);
 const p1=a.est.oportunidades[0],p2=b.est.oportunidades[0];
 const novoEvento={id:'extra',tipo:'decision',data:'2026-10-30',
  dimensao:'prioridade',forca:'documentado',titulo:'Aprovação do cliente',contatoId:'p1'};
 p1.eventos.push(Object.assign({},novoEvento));p2.eventos.push(Object.assign({},novoEvento));
 assert.equal(f2(p2),f1(p1));
 p1.dims.prioridade=4;p2.dims.prioridade=4;
 assert.equal(f2(p2),f1(p1));
});
test('benchmark comparativo 200 amostras de HEINEKEN e Suzano sintéticas',()=>{
 const a=preparar(),b=preparar(),f1=construir(antes,a),f2=construir(depois,b);
 const antigos=[],novos=[];
 const runner=(fn,ops)=>fn(ops[0]).length+fn(ops[1]).length;
 const A=a.est.oportunidades,B=b.est.oportunidades;
 for(let i=0;i<220;i++){
  let va,vb,tA,tB;
  if(i%2===0){
   let t=performance.now();va=runner(f1,A);tA=performance.now()-t;
   t=performance.now();vb=runner(f2,B);tB=performance.now()-t;
  }else{
   let t=performance.now();vb=runner(f2,B);tB=performance.now()-t;
   t=performance.now();va=runner(f1,A);tA=performance.now()-t;
  }
  assert.equal(va,vb);
  if(i>=20){antigos.push(tA);novos.push(tB);}
 }
 const d={tipo:'PERF11E cockpit oito dimensoes (CPU Node)',amostras:200,
  p50AntesMs:+percentile(antigos,.5).toFixed(3),
  p95AntesMs:+percentile(antigos,.95).toFixed(3),
  p50DepoisMs:+percentile(novos,.5).toFixed(3),
  p95DepoisMs:+percentile(novos,.95).toFixed(3),
  nota:'dados sinteticos; nao equivale a render DOM ou navegador autenticado'};
 console.log(JSON.stringify(d));
 assert.ok(d.p95AntesMs>0 && d.p95DepoisMs>0);
});
