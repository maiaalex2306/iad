'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const config=fs.readFileSync(path.join(root,'src/config.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
test('nao dispara analise IA ao carregar email',()=>{
 const i=app.indexOf('function pintarEmails(forcar)'),j=app.indexOf('App.recarregarEmails =',i);
 assert.ok(i>=0&&j>i); assert.doesNotMatch(app.slice(i,j),/analisarEmailsNovos\s*\(/);
});
test('mantem analise manual',()=>assert.match(app,/App\.analisarEmails\s*=\s*function\s*\(\)\s*\{\s*analisarEmailsNovos\(true\)/));
test('cache e app preservam versao 286.2',()=>{
 assert.match(config,/numero: 'v286\.7'/);
 assert.match(sw,/iad-crm-v286\.7/);
});
