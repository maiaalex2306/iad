'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync('src/performance.js','utf8');
function fixture(types=['largest-contentful-paint','event','layout-shift']){
  const listeners=[];
  class PerformanceObserver{
    static supportedEntryTypes=types;
    constructor(cb){this.cb=cb;this.disconnected=false;listeners.push(this)}
    observe(o){this.type=o.type}
    disconnect(){this.disconnected=true}
  }
  const window={PerformanceObserver,performance:{now:()=>20}};
  vm.runInNewContext(code,{window,console});
  function emit(type,entries){listeners.filter(o=>o.type===type&&!o.disconnected).forEach(o=>o.cb({getEntries:()=>entries}))}
  return {api:window.IADPerformance,emit,listeners};
}
test('Web Vitals: opt-in, nenhuma leitura antes de iniciar e parada efetiva',()=>{
 const f=fixture();f.api.iniciarVitals();
 f.emit('largest-contentful-paint',[{startTime:1200}]);
 f.emit('event',[{duration:150,interactionId:1},{duration:200,interactionId:2}]);
 f.emit('layout-shift',[{value:.1,hadRecentInput:false},{value:.9,hadRecentInput:true}]);
 const result=f.api.pararVitals();
 assert.equal(result.lcpMs,1200);
 assert.equal(result.inpEstimadoMs,200);
 assert.equal(result.cls,.1);
 assert.equal(result.interacoesObservadas,2);
 assert.equal(result.escopo.includes('nenhuma transferência'),true);
 f.emit('event',[{duration:900,interactionId:3}]);
 assert.equal(f.api.relatorioVitals().inpEstimadoMs,200);
 assert.ok(f.listeners.every(x=>x.disconnected));
});
test('Sem PerformanceObserver: não lança erro; métricas indisponíveis',()=>{
 const f=fixture([]);f.api.iniciarVitals();assert.equal(f.api.pararVitals().lcpMs,null);
});
test('API legada permanece funcional',()=>{
 const f=fixture();f.api.iniciar();assert.equal(f.api.medir('painel',()=>42),42);
 assert.equal(f.api.relatorio().painel.chamadas,1);
 f.api.parar();f.api.limpar();assert.deepEqual(Object.keys(f.api.relatorio()),[]);
});
test('Medição limpa sem vazar observadores entre sessões',()=>{
 const f=fixture();f.api.iniciarVitals();f.api.pararVitals();f.api.limparVitals();
 assert.equal(f.api.relatorioVitals().inpEstimadoMs,null);
 f.api.iniciarVitals();f.emit('event',[{duration:30,interactionId:1}]);
 assert.equal(f.api.pararVitals().inpEstimadoMs,30);
});
