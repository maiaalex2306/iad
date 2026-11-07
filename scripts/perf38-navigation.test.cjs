'use strict';
/* PERF-38: modelo VM com tempo controlado, sem navegador, rede ou dados pessoais. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/performance.js'),'utf8');
function setup(withObserver=true){
 let clock=100,frames=[],disconnected=0,observers=[],callbacks=[];
 const window={
  performance:{now:()=>clock},
  location:{hash:'#/hoje'},
  requestAnimationFrame:fn=>{frames.push(fn);return frames.length},
 };
 if(withObserver)window.PerformanceObserver=class {
  constructor(fn){callbacks.push(fn);observers.push(this);}
  observe(options){this.options=options;}
  disconnect(){disconnected++;}
 };
 vm.runInNewContext(source,{window,console,Date,JSON,Object,Number,Math});
 const p=window.IADPerformance;
 return {p,window,tick:ms=>clock+=ms,
  flush:()=>{while(frames.length){const f=frames.shift();f();}},
  emit:duration=>{for(const f of callbacks)f({getEntries:()=>[{duration,name:'url/cliente/CNPJ',attribution:[{name:'SECRET'}]}]});},
  disconnected:()=>disconnected,observers};
}
test('sem consentimento: nenhuma medição de navegação ou long task',()=>{
 const h=setup();
 assert.equal(h.p.iniciarNavegacao('#/hoje'),false);
 assert.equal(h.p.concluirNavegacao('#/hoje'),false);
 h.emit(120);
 assert.deepEqual(Object.keys(h.p.relatorioDiagnostico()),[]);
 assert.equal(h.observers.length,0);
});
test('rotas permitidas e dois frames após renderização, sem nome da carteira',()=>{
 const h=setup();h.p.iniciar();
 h.window.location.hash='#/pipeline';
 assert.equal(h.p.iniciarNavegacao('#/pipeline'),true);
 h.tick(120);
 assert.equal(h.p.concluirNavegacao('#/pipeline'),true);
 h.tick(16);h.flush();
 const x=h.p.relatorioDiagnostico();
 assert.equal(x['perf38.nav.pipeline'].chamadas,1);
 assert.equal(x['perf38.nav.pipeline'].p95Ultimas100Ms,136);
 const json=h.p.exportarDiagnosticoJSON();
 assert.doesNotMatch(json,/CNPJ|url\/cliente|SECRET|tenant-a|compra-e-privada|#\/pipeline/);
 assert.match(json,/perf38\.nav\.pipeline/);
 assert.equal(h.p.iniciarNavegacao('#/op/tenant-a-CNPJ'),false);
 assert.equal(h.p.iniciarNavegacao('#/pipeline?secret=1'),false);
 h.p.parar();
 assert.ok(h.disconnected()>=1);
});
test('navegação interrompida, troca de aba ou parada não contaminam o P95',()=>{
 const h=setup();h.p.iniciar();
 h.p.iniciarNavegacao('#/hoje');h.tick(50);
 h.window.location.hash='#/hoje';h.p.concluirNavegacao('#/hoje');
 h.p.iniciarNavegacao('#/pipeline');h.window.location.hash='#/pipeline';
 h.flush();assert.equal(h.p.relatorioDiagnostico()['perf38.nav.hoje'],undefined);
 h.p.concluirNavegacao('#/pipeline');h.tick(21);h.flush();
 assert.equal(h.p.relatorioDiagnostico()['perf38.nav.pipeline'].chamadas,1);
 h.p.iniciarNavegacao('#/hoje');h.p.parar();
 h.window.location.hash='#/hoje';h.p.concluirNavegacao('#/hoje');h.flush();
 assert.equal(h.p.relatorioDiagnostico()['perf38.nav.hoje'],undefined);
});
test('navegação lazy interrompida pelo scope errado não gera amostra',()=>{
 const h=setup();h.p.iniciar();
 h.p.iniciarNavegacao('#/inteligencia');h.window.location.hash='#/pipeline';
 assert.equal(h.p.concluirNavegacao('#/inteligencia'),true);
 h.flush();
 assert.equal(h.p.relatorioDiagnostico()['perf38.nav.inteligencia'],undefined);
});
test('observer: somente duração e contagem de longtask (sem attribution/URL)',()=>{
 const h=setup();h.p.iniciar();
 h.emit(95);h.emit(130);
 const j=h.p.relatorioDiagnostico();
 assert.equal(j['perf38.main-thread.longtask'].chamadas,2);
 assert.equal(j['perf38.main-thread.longtask'].p95Ultimas100Ms,130);
 assert.doesNotMatch(h.p.exportarDiagnosticoJSON(),/url\/cliente|SECRET|CNPJ/);
 h.p.parar();h.emit(300);
 assert.equal(h.p.relatorioDiagnostico()['perf38.main-thread.longtask'].chamadas,2);
});
test('fallback seguro sem PerformanceObserver ou requestAnimationFrame',()=>{
 const h=setup(false);delete h.window.requestAnimationFrame;
 h.p.iniciar();h.p.iniciarNavegacao('#/hoje');h.window.location.hash='#/hoje';
 assert.equal(h.p.concluirNavegacao('#/hoje'),false);
 assert.equal(h.p.relatorioDiagnostico()['perf38.nav.hoje'],undefined);
});
test('contrato de instrumentação: rotas estáticas e mount lazy, versão conjunta',()=>{
 const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
 const views=fs.readFileSync(path.join(root,'src/views.js'),'utf8');
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 const cfg=fs.readFileSync(path.join(root,'src/config.js'),'utf8');
 assert.match(app,/iniciarNavegacao\(hash\)/);
 assert.match(app,/concluirNavegacao\('#\/inteligencia'\)/);
 assert.match(app,/concluirNavegacao\('#\/mercado'\)/);
 assert.match(views,/Navegação real entre telas/);
 assert.match(views,/Bloqueios de interface/);
 assert.match(cfg,/v286\.81/);assert.match(sw,/iad-crm-v286\.81/);
});
