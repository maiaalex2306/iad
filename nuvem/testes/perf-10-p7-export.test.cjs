'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('src/performance.js','utf8');
test('P7 exportação reproduz p50/p95, conta amostras e não inclui dados comerciais',()=>{
 let now=100;const frames=[];const win={performance:{now:()=>now},requestAnimationFrame:fn=>frames.push(fn)};
 vm.runInNewContext(source,{window:win});
 const p=win.IADPerformance;p.iniciar();
 for(let i=1;i<=40;i++)p.registrar('perf10.aba.dois-frames.tarefas',i);
 p.registrar('perf10.cockpit.dois-frames',75);
 const out=JSON.parse(p.exportarJSON());
 assert.equal(out.formato,'iad-perf-10-p7');
 assert.equal(out.metricas['perf10.aba.dois-frames.tarefas'].amostrasPercentis,40);
 assert.equal(out.metricas['perf10.aba.dois-frames.tarefas'].p50Ultimas100Ms,20);
 assert.equal(out.metricas['perf10.aba.dois-frames.tarefas'].p95Ultimas100Ms,38);
 assert.equal(out.metricas['perf10.cockpit.dois-frames'].chamadas,1);
 assert.equal(typeof p.exportarJSON(),'string');
 assert.equal(out.metricas['perf10.aba.dois-frames.tarefas'].mediaMs,20.5);
 p.parar();p.limpar();assert.deepEqual(Object.keys(JSON.parse(p.exportarJSON()).metricas),[]);
});
