'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const forward = fs.readFileSync(path.join(root,'nuvem/perf-36l-tipos-tarefa-initplan.sql'),'utf8');
const backward = fs.readFileSync(path.join(root,'nuvem/perf-36l-tipos-tarefa-rollback.sql'),'utf8');
const uncomment = s => s.replace(/^\s*--.*$/gm, '');
const normalize = s => s.replace(/\(\s*SELECT\s+public\.(meu_tenant|sou_admin)\(\)\s*\)/gi,'$1()')
 .replace(/\bpublic\.(meu_tenant|sou_admin)\b/gi,'$1').replace(/\s+/g,'').toLowerCase();

function predicates(sql) {
  const m = uncomment(sql).match(/\bALTER\s+POLICY\s+tipos_tarefa_tudo\s+ON\s+public\.tipos_tarefa\s+USING\s+([\s\S]*?)\s+WITH\s+CHECK\s+([\s\S]*?);/i);
  assert.ok(m,'politica real com USING e WITH CHECK obrigatorios');
  return [normalize(m[1]),normalize(m[2])];
}

test('PERF-36L: paridade de leitura e escrita com politica original',()=>{
  const a = predicates(forward), b=predicates(backward);
  assert.deepEqual(a,b,'sem alteração booleana de autorizacao');
  assert.equal(a[0],a[1],'USING e WITH CHECK continuam iguais');
});
test('PERF-36L: funcões STABLE avaliadas por InitPlan',()=>{
  for(const f of ['meu_tenant','sou_admin']){
    const re = new RegExp('\\(SELECT\\s+public\\.'+f+'\\(\\)\\)','gi');
    assert.equal((forward.match(re)||[]).length,2, f+' presente em USING + WITH CHECK');
  }
});
test('PERF-36L: DDL somente altera uma policy com transacao e sem mudanca em dados',()=>{
  for(const raw of [forward,backward]){
    const sql=uncomment(raw);
    assert.match(sql,/\bBEGIN\s*;/i);assert.match(sql,/\bCOMMIT\s*;/i);
    assert.match(sql,/SET\s+LOCAL\s+lock_timeout\s*=\s*'3s'/i);
    assert.equal((sql.match(/\bALTER\s+POLICY\b/gi)||[]).length,1);
    assert.doesNotMatch(sql,/\b(DROP|GRANT|REVOKE|DELETE|INSERT|UPDATE|TRUNCATE|DISABLE)\b/i);
  }
});
