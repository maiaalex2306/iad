'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('src/app.js','utf8');
const views=fs.readFileSync('src/views.js','utf8');
function between(source,start,end) {
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'trecho ausente: '+start);
 return source.slice(a,b);
}
const state=between(app,'  let analisePendenciasEmCurso = false;','  const App = {');
const methods=between(app,'    analisarPendencias: function () {','    /* Conferir o banco.');
function scenario({count=250,urgent=208,ia=true,auto=false,confirmFull=true,loading=false}={}){
 const itens=Array.from({length:count},(_,i)=>({urgencia:i<urgent?3:2,resumo:{op:{id:'op-'+i,valor:100}}}));
 const est={oportunidades:itens.map(i=>i.resumo.op),tarefas:[]},foco={itens,triagem:[]};
 let auth={id:'u1',papel:'admin'},tenant='empresa1',ctxFiltro='empresa1';
 let renderCalls=0,panCalls=0,aiCalls=0,individualCalls=0,asked=0;
 let resolveAi;
 const aiPromise=new Promise(resolve=>{resolveAi=resolve;});
 let lastAnalysis=null;
 const progress=[],alerts=[],analyses=[];
 const IA={
  disponivel:()=>ia,
  varrendoAgora:()=>auto,
  leituraDaCarteira:()=>{aiCalls++;return aiPromise;},
  varrerOrientacoes:(items,onProgress,opts)=>{
   individualCalls++;
   assert.equal(items.length,urgent,'modo completo deve receber os urgentes');
   assert.equal(opts.teto,urgent);
   const processed=Math.min(5,urgent);
   if(processed) onProgress(processed,urgent,items[0]);
   return Promise.resolve(processed);
  }
 };
 const globals={
  IADOrientacao:{panorama:(arr)=>{panCalls++;assert.equal(arr.length,count);return {total:count,porNivel:{urgente:urgent,prioridade:count-urgent,emDia:0},causas:[]};}},
  IADPerf02:{filaDados:()=>foco},
  IADIA:IA,
  IADPerfHoje:{atualizarProgresso:(done,total)=>progress.push([done,total]),atualizarOrientacao:()=>{}}
 };
 const V={
  definirAnalise:(x)=>{lastAnalysis=x;analyses.push(x);},
  definirProgressoDaAnalise:(x)=>progress.push([x.feitos,x.total]),
  esquecerAnalise:()=>{lastAnalysis=null;}
 };
 const ctx={
   global:globals,Store:{dados:()=>est,contexto:()=>({tenantId:tenant,filtros:{tenant:ctxFiltro}})},
   A:{atual:()=>auth},E:{fila:()=>foco},V,
   baixando:loading,alert:(m)=>alerts.push(m),confirm:()=>{asked++;return confirmFull;},
   render:()=>{renderCalls++;},window:{scrollTo:()=>{}},
   Promise,Date,JSON,Math,Number,String,Object
 };
 vm.runInNewContext(state+'\nconst App = {\n'+methods+'\n}; globalThis.underTest=App;',ctx);
 return {App:ctx.underTest,IA,resolveAi,stats:()=>({renderCalls,panCalls,aiCalls,individualCalls,asked,lastAnalysis,progress,alerts,analyses}),
  changeUser:()=>{auth={id:'u2',papel:'admin'};},
  changeTenant:()=>{tenant='empresa2';ctxFiltro='empresa2';}};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('PERF-34A: 250 negocios e 208 urgentes: panorama imediato, zero leituras individuais e UMA sintese',async()=>{
 const t=scenario();
 t.App.analisarPendencias();
 let s=t.stats();
 assert.equal(s.panCalls,1);
 assert.equal(s.lastAnalysis.panorama.total,250);
 assert.equal(s.lastAnalysis.modo,'executiva');
 assert.equal(s.lastAnalysis.pendenteIA,true);
 assert.equal(s.individualCalls,0,'não disparar 208 orientacoes');
 assert.equal(s.aiCalls,0,'renderiza antes de chamar a IA');
 t.App.analisarPendencias();
 assert.equal(t.stats().panCalls,1,'anti-duplicidade');
 await flush();
 assert.equal(t.stats().aiCalls,1);
 assert.equal(t.stats().individualCalls,0);
 t.resolveAi({leitura:'Panorama sintético'});
 await flush();
 s=t.stats();
 assert.equal(s.aiCalls,1);
 assert.equal(s.lastAnalysis.pendenteIA,false);
 assert.equal(s.lastAnalysis.ia.leitura,'Panorama sintético');
 assert.equal(s.lastAnalysis.panorama.total,250);
});
test('PERF-34A: sem IA, dados de toda a carteira ainda aparecem imediatamente',()=>{
 const t=scenario({ia:false});
 t.App.analisarPendencias();
 const s=t.stats();
 assert.equal(s.lastAnalysis.panorama.total,250);
 assert.equal(s.lastAnalysis.pendenteIA,false);
 assert.equal(s.aiCalls,0);
 assert.equal(s.individualCalls,0);
});
test('PERF-34A: recusa iniciar com carteira ainda em download',()=>{
 const t=scenario({loading:true});
 t.App.analisarPendencias();
 assert.equal(t.stats().panCalls,0);
 assert.equal(t.stats().alerts.length,1);
});
test('PERF-34A: modo completo continua disponivel, exige confirmacao e expõe resultado parcial sem mentir',async()=>{
 const t=scenario({confirmFull:true});
 t.App.analisarPendenciasCompleta();
 await flush();
 const s=t.stats();
 assert.equal(s.asked,1);
 assert.equal(s.individualCalls,1);
 assert.equal(s.lastAnalysis, null); // IA final awaits our held promise
 assert.ok(s.progress.some(p=>p[0]===5 && p[1]===208),'progresso mostra 5/208, jamais 208/208');
 t.resolveAi(null);
 await flush();
 const fin=t.stats().lastAnalysis;
 assert.equal(fin.modo,'completa');
 assert.equal(fin.processadas,5);
 assert.equal(fin.solicitadas,208);
 assert.equal(fin.lidos,5);
 assert.equal(fin.panorama.total,250);
});
test('PERF-34A: modo completo nao começa se outra varredura ja esta ativa',()=>{
 const t=scenario({auto:true});
 t.App.analisarPendenciasCompleta();
 const s=t.stats();
 assert.equal(s.individualCalls,0);
 assert.equal(s.panCalls,0);
 assert.equal(s.alerts.length,1);
});
test('PERF-34A: modo completo nao inicia se usuario nao autorizar custo',()=>{
 const t=scenario({confirmFull:false});
 t.App.analisarPendenciasCompleta();
 assert.equal(t.stats().asked,1);
 assert.equal(t.stats().individualCalls,0);
});
test('PERF-34A: fechar nao permite que resposta antiga seja aplicada',async()=>{
 const t=scenario();
 t.App.analisarPendencias();
 await flush();
 t.App.fecharAnalise();
 const before=t.stats().analyses.length;
 t.resolveAi({leitura:'Resposta atrasada'});
 await flush();
 assert.equal(t.stats().analyses.length,before);
 assert.equal(t.stats().lastAnalysis,null);
});
test('PERF-34A: mudanca de usuario/empresa bloqueia resposta antiga',async()=>{
 for(const change of ['changeUser','changeTenant']){
  const t=scenario();
  t.App.analisarPendencias();
  await flush();
  t[change]();
  const before=t.stats().analyses.length;
  t.resolveAi({leitura:'Não mostrar no novo escopo'});
  await flush();
  assert.equal(t.stats().analyses.length,before,change);
 }
});
test('PERF-34A: tela distingue os dois modos e nao bloqueia para sempre apos reload',()=>{
 assert.ok(views.includes('App.analisarPendenciasCompleta()'));
 assert.ok(views.includes('Análise rápida'));
 assert.ok(views.includes('Análise completa'));
 assert.ok(views.includes('g.pendenteIA = false;'));
 assert.ok(views.includes('Aprofundamento parcial:'));
});
test('PERF-34A: cache do panorama não atravessa empresas, usuários nem dias',()=>{
 const viewsCode=between(views,"  const CHAVE_ANALISE = 'iad-crm:analise-do-dia';","  function definirAnalise(a)");
 const disk=new Map();
 let user={id:'u1',papel:'admin'},company='empresa1',day='2026-11-03';
 const ctx={
  Store:{contexto:()=>({usuario:user,tenantId:company,admin:true,gestor:true,
   filtros:{tenant:company,usuario:'todos'}}),hoje:()=>day},
  localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)},
  JSON,Object,String
 };
 vm.runInNewContext('let analise=null;\n'+viewsCode+
  '\nglobalThis.analysis={save:guardarAnalise,read:analiseDoDia};',ctx);
 const p={panorama:{total:250},em:'2026-11-03T16:00:00.000Z',pendenteIA:true};
 ctx.analysis.save(p);
 assert.equal(ctx.analysis.read().panorama.total,250);
 company='empresa2';
 assert.equal(ctx.analysis.read(),null,'não cruzar empresa');
 company='empresa1';
 assert.equal(ctx.analysis.read().interrompida,true,'recarregar não preserva espera sem Promise');
 user={id:'u2',papel:'admin'};
 assert.equal(ctx.analysis.read(),null,'não cruzar usuário');
 user={id:'u1',papel:'admin'};
 day='2026-11-04';
 assert.equal(ctx.analysis.read(),null,'não reutilizar outro dia');
});
test('PERF-34A: app e cache PWA v286.32 coerentes',()=>{
 const cfg=fs.readFileSync('src/config.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
 assert.match(cfg,/numero: 'v286\.\d+'/);
 const version=cfg.match(/numero: '(v286\.\d+)'/)[1];
 assert.ok(sw.includes("const CACHE = 'iad-crm-"+version+"'"));
});