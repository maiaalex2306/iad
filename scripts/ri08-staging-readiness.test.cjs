'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {interpretStatus}=require('./ri08-staging-readiness.cjs');
test('RI-08 readiness: HTTP 503 deve bloquear o release',()=>{
 const actual=interpretStatus(503);
 assert.equal(actual.ok,false);
 assert.equal(actual.code,'AI_PROVIDER_NOT_READY');
});
test('RI-08 readiness: HTTP 401 prova apenas transporte/Auth, não LLM',()=>{
 const actual=interpretStatus(401);
 assert.equal(actual.ok,true);
 assert.equal(actual.code,'AUTH_GATE_ENFORCED');
 assert.match(actual.explanation,/LLM autenticada ainda obrigat/);
});
test('RI-08 readiness: HTTP 200 sem sessão e erros 404/500 falham fechados',()=>{
 for(const status of [200,400,404,429,500,502,504]){
  assert.equal(interpretStatus(status).ok,false, String(status));
 }
});
