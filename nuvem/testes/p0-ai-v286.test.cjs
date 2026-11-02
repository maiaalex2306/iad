'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'../../src/app.js'),'utf8');
test('loading email never starts AI automatically',()=>{
 const i=s.indexOf('function pintarEmails(forcar)');
 const j=s.indexOf('App.recarregarEmails =',i);
 assert.ok(i>=0&&j>i);
 assert.doesNotMatch(s.slice(i,j),/analisarEmailsNovos\s*\(/);
});
test('manual email AI is still wired',()=>{
 assert.match(s,/App\.analisarEmails\s*=\s*function\s*\(\)\s*\{\s*analisarEmailsNovos\(true\)/);
});
