'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const s=fs.readFileSync(require('node:path').resolve(__dirname,'../../src/store.js'),'utf8');
test('snapshot de dados depende de revisao e escopo',()=>{
 assert.match(s,/\[revisaoDados, ctx\.usuario && ctx\.usuario\.id/);
 assert.match(s,/filtros\.tenant, filtros\.usuario/);
 assert.match(s,/snapshotVisivel\.estado === estado/);
});
test('nenhum cache persiste no navegador',()=> {
 const i=s.indexOf('let snapshotVisivel = null;'),j=s.indexOf('/* ---------- notas rápidas',i);
 assert.ok(i>0&&j>i);
 const x=s.slice(i,j);
 assert.doesNotMatch(x,/localStorage|sessionStorage|indexedDB/);
 assert.match(x,/return resultado/);
});
