'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'../../src/app.js'),'utf8');
test('only active file tab schedules attachment initialization',()=>{
 const i=s.indexOf("if (document.getElementById('lista-arquivos'))");
 const j=s.indexOf("if (perf) perf.medir('perf10.cockpit.inicializar-quadro'",i);
 assert.ok(i>=0&&j>i);const block=s.slice(i,j);
 assert.match(block,/requestAnimationFrame\(iniciarArquivos\)/);
 assert.match(block,/location\.hash !== '#\/op\/' \+ id/);
});
test('stale IndexedDB result cannot update a different card',()=>{
 const i=s.indexOf('function pintarArquivos(opId)');
 const j=s.indexOf('function pintarUso()',i);
 assert.ok(i>=0&&j>i);
 assert.match(s.slice(i,j),/destino !== alvo/);
 assert.match(s.slice(i,j),/location\.hash !== '#\/op\/' \+ opId/);
});
