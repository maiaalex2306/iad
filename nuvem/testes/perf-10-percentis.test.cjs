'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('medidas p50/p95 isoladas e sem dados comerciais',()=>{
 const w={performance:{now:()=>0}},ctx={window:w,console};
 vm.runInNewContext(fs.readFileSync('src/performance.js','utf8'),ctx);
 w.IADPerformance.iniciar();
 for(let i=1;i<=100;i++) w.IADPerformance.registrar('perf10.tarefa',i);
 const r=w.IADPerformance.relatorio()['perf10.tarefa'];
 assert.equal(r.chamadas,100);
 assert.equal(r.p50Ultimas100Ms,50);
 assert.equal(r.p95Ultimas100Ms,95);
 assert.equal(r.maxMs,100);
 w.IADPerformance.parar();
});
