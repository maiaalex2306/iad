'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.resolve(__dirname,'../../src/app.js'),'utf8');
test('troca para Arquivos agenda a leitura depois da montagem da aba',()=>{
 const i=s.indexOf("abaCockpit: function (aba)");
 const j=s.indexOf("verDiagnostico: function",i);
 assert.ok(i>=0&&j>i);
 const trecho=s.slice(i,j);
 assert.match(trecho,/if \(aba === 'arquivos'\) \{/);
 assert.match(trecho,/requestAnimationFrame\(iniciar\)/);
 assert.match(trecho,/document\.getElementById\('lista-arquivos'\) !== listaAtiva/);
 assert.match(trecho,/location\.hash !== '#\/op\/' \+ id/);
});
test('resposta antiga de erro no IndexedDB nao substitui a tela atual',()=>{
 const i=s.indexOf('function pintarArquivos(opId)');
 const j=s.indexOf('function pintarUso()',i);
 assert.ok(i>=0&&j>i);
 const trecho=s.slice(i,j);
 assert.match(trecho,/destino === alvo && location\.hash === '#\/op\/' \+ opId/);
});
