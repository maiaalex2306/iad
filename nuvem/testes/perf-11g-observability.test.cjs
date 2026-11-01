'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/performance.js','utf8');
function montar(){
 let agora=100,iniciados=0,fechados=0,callback;
 class Observer {
  constructor(fn){callback=fn;}
  observe({entryTypes}){assert.deepEqual(Array.from(entryTypes),['longtask']);iniciados++;}
  disconnect(){fechados++;}
 }
 const win={performance:{now:()=>agora},PerformanceObserver:Observer};
 vm.runInNewContext(source,{window:win,console});
 return{p:win.IADPerformance,clock:ms=>{agora+=ms;},state:()=>({iniciados,fechados}),
  longtask:entradas=>callback({getEntries:()=>entradas})};
}
test('por padrão não coleta nem cria PerformanceObserver, e não altera retorno',()=>{
 const x=montar();
 assert.equal(x.p.ativo(),false);
 assert.equal(x.p.medir('tela.cockpit',()=>42),42);
 x.p.registrar('tela.cockpit',7000);
 assert.deepEqual(Object.keys(x.p.relatorio(true)),[]);
 assert.equal(x.state().iniciados,0);
});
test('ativação idempotente, longtasks sem URL/nome, parada definitiva',()=>{
 const x=montar();
 x.p.iniciar();x.p.iniciar();
 assert.equal(x.state().iniciados,1);
 x.longtask([{entryType:'longtask',duration:63,name:'https://segredo.exemplo/cliente-ABC',
  attribution:[{name:'conta-secreta'}]},
 {entryType:'resource',duration:12345,name:'privado'}]);
 assert.equal(x.p.relatorio(true)['longtask.navegador'].chamadas,1);
 const json=x.p.exportarJSON();
 assert.ok(!json.includes('cliente-ABC')&&!json.includes('conta-secreta'));
 x.p.parar();
 assert.equal(x.state().fechados,1);
 x.p.registrar('longtask.navegador',99);
 assert.equal(x.p.relatorio(true)['longtask.navegador'].chamadas,1);
});
test('agrupamento de nomes impossibilita expor nomes e IDs de clientes',()=>{
 const x=montar();x.p.iniciar();
 x.p.registrar('tela.#/op/opp_HEINEKEN_PRIVADO',60);
 x.p.registrar('tela.#/pipeline',15);
 x.p.registrar('perf10.cockpit.detalhe.contato_pessoa123',9);
 x.p.registrar('perf10.cockpit.detalhe.dom.cliente.123',8);
 x.p.registrar('https://empresa-secreta.com.br',3);
 x.p.registrar('tela.#/op/SUZANO_CONTRATO',2);
 const report=JSON.parse(x.p.exportarJSON());
 const value=JSON.stringify(report);
 for(const segredo of ['HEINEKEN','SUZANO','pessoa123','empresa-secreta','CONTRATO'])
  assert.ok(!value.includes(segredo),'vazamento de dados: '+segredo);
 assert.ok(report.metricas['tela.#/pipeline']);
 assert.ok(report.metricas['tela.outra-rota']);
 assert.ok(report.metricas['metrica.outra']);
 assert.ok(Object.keys(report.metricas).length<=5);
});
test('avaliação P95 aguarda amostra mínima e somente depois aciona diagnóstico',()=>{
 const x=montar();x.p.iniciar();
 for(let i=0;i<19;i++)x.p.registrar('tela.cockpit',310);
 assert.equal(x.p.avaliar().metricas['tela.cockpit'].situacao,'amostra-insuficiente');
 x.p.registrar('tela.cockpit',310);
 let r=x.p.avaliar();
 assert.equal(r.metricas['tela.cockpit'].situacao,'acima-do-limite');
 assert.equal(r.metricas['tela.cockpit'].amostras,20);
 x.p.limpar();
 for(let i=0;i<100;i++)x.p.registrar('tela.cockpit',40);
 r=x.p.avaliar();
 assert.equal(r.metricas['tela.cockpit'].situacao,'dentro-do-limite');
 assert.equal(r.metricas['tela.cockpit'].p95Ms,40);
 assert.equal(r.local,true);
});
test('somente últimas 100 observações alimentam P95, sem criar chaves ilimitadas',()=>{
 const x=montar();x.p.iniciar();
 for(let i=0;i<1000;i++)x.p.registrar('tela.cockpit',i%10?10:9999);
 for(let i=0;i<300;i++)x.p.registrar('tela.#/op/opp'+i,40);
 const r=x.p.relatorio(true);
 assert.equal(r['tela.cockpit'].chamadas,1000);
 assert.equal(r['tela.cockpit'].amostrasPercentis,100);
 assert.equal(r['tela.cockpit'].p95Ultimas100Ms,9999);
 assert.equal(r['tela.outra-rota'].chamadas,300);
 assert.equal(r['tela.outra-rota'].amostrasPercentis,100);
 assert.ok(Object.keys(r).length<=2);
});
test('não registrar durações inválidas; exceção do trabalho preservada',()=>{
 const x=montar();x.p.iniciar();
 x.p.registrar('tela.cockpit',NaN);
 x.p.registrar('tela.cockpit',-3);
 x.p.registrar('tela.cockpit',Infinity);
 assert.equal(x.p.relatorio(true)['tela.cockpit'],undefined);
 assert.throws(()=>x.p.medir('tela.cockpit',()=>{x.clock(17);throw new Error('erro comercial')}),/erro comercial/);
 assert.equal(x.p.relatorio(true)['tela.cockpit'].p95Ultimas100Ms,17);
});
test('relatório JSON anterior preservado e diagnóstico incremental somente local',()=>{
 const x=montar();x.p.iniciar();
 for(let i=1;i<=40;i++)x.p.registrar('perf10.aba.dois-frames.tarefas',i);
 const r=JSON.parse(x.p.exportarJSON());
 assert.equal(r.formato,'iad-perf-10-p7');
 assert.equal(r.versaoEsquema,1);
 assert.equal(r.metricas['perf10.aba.dois-frames.tarefas'].p95Ultimas100Ms,38);
 assert.equal(r.diagnostico.versaoEsquema,1);
 assert.equal(r.diagnostico.local,true);
 assert.equal(r.diagnostico.minimoAmostras,20);
 assert.equal(r.diagnostico.metricas['tela.cockpit'].situacao,'amostra-insuficiente');
});
