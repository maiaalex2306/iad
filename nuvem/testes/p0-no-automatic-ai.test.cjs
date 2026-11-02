'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync(require('node:path').join(__dirname,'../../src/app.js'),'utf8');
test('P0: carregar email nao pode iniciar analise de IA em segundo plano',()=>{
  const begin=app.indexOf('function pintarEmails(forcar)');
  assert.ok(begin>=0,'pintarEmails ausente');
  const end=app.indexOf('App.recarregarEmails =',begin);
  assert.ok(end>begin,'limites de pintarEmails ausentes');
  const method=app.slice(begin,end);
  assert.doesNotMatch(method,/analisarEmailsNovos\s*\(/,'IA disparada ao renderizar os emails');
});
test('P0: analise manual de emails continua disponivel',()=>{
  assert.match(app,/App\.analisarEmails\s*=\s*function\s*\(\)\s*\{\s*analisarEmailsNovos\(true\)/);
});
test('P0: caminho de analise de lote manual continua presente',()=>{
  assert.match(app,/App\.analisarEmailsDaOportunidade|App\.analisarEmailsDoNegocio|analisarLote\(fila\)/);
});
