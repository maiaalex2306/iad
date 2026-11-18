'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const forward=fs.readFileSync(path.join(root,'nuvem/perf-13c-rls-initplan.sql'),'utf8');
const rollback=fs.readFileSync(path.join(root,'nuvem/perf-13c-rls-initplan-rollback.sql'),'utf8');
const tables=['contas','contatos','oportunidades','tarefas'];
function extract(sql,table) {
 const m=sql.match(new RegExp('ALTER POLICY '+table+'_tudo ON public\\.'+table+'\\s+USING \\(([^;]+?)\\)\\s+WITH CHECK \\(([^;]+?)\\);','i'));
 assert.ok(m,table+': policy definition present');
 assert.equal(m[1],m[2],table+': USING and WITH CHECK equivalent');
 return m[1];
}
test('Only four expected business policies changed',()=>{
 for(const sql of [forward,rollback]){
  assert.equal((sql.match(/ALTER POLICY /g)||[]).length,4);
  assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);
  assert.match(sql,/lock_timeout = '3s'/);
  for(const t of tables)extract(sql,t);
 }
});
test('optimized RLS retains admin, tenant, role and owner logic',()=>{
 for(const t of tables){
  const original=extract(rollback,t);
  const optimized=extract(forward,t);
  // The only allowed transformation is to wrap calls of stable nullary
  // auth/helper functions in a scalar SELECT, without rewriting the predicate.
  const normalized=optimized
    .replace(/\(select public\.sou_admin\(\)\)/g,'sou_admin()')
    .replace(/\(select public\.sou_gestor\(\)\)/g,'sou_gestor()')
    .replace(/\(select public\.meu_tenant\(\)\)/g,'meu_tenant()')
    .replace(/\(select auth\.uid\(\)\)/g,'auth.uid()');
  const simplify=x=>x.replace(/\s+/g,'').replace(/\(\(/g,'(').replace(/\)\)/g,')');
  assert.equal(simplify(normalized),simplify(original),t+': same access predicate');
 }
});
