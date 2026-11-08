'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const test=require('node:test');
const repo=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(repo,p),'utf8');
const apply=read('nuvem/sql/security-p0-anon-admin-rpc-20261108.sql');
const rollback=read('nuvem/sql/security-p0-anon-admin-rpc-rollback-20261108.sql');
const signatures=[
  "public.criar_minha_empresa(text,text)",
  "public.definir_bloqueio_da_empresa(uuid,boolean)",
  "public.definir_bloqueio_do_perfil(uuid,boolean)",
  "public.definir_dados_da_empresa(uuid,text,text)",
  "public.definir_dados_do_perfil(uuid,text,text)",
  "public.definir_empresa_do_perfil(uuid,uuid)",
  "public.definir_nome_do_perfil(uuid,text)",
  "public.definir_papel_do_perfil(uuid,text)",
  "public.definir_ponte_da_empresa(uuid,text,text)"
];
test('SECURITY-P0: mesmo contrato exato de nove RPCs em deploy e rollback',()=>{
 for(const [text,tag] of [[apply,'apply'],[rollback,'rollback']]){
  for(const fn of signatures)assert.equal(text.split("'"+fn+"'").length-1,1,tag+' '+fn);
  assert.equal((text.match(/'public\.\w+\([\w,]+\)'/g)||[]).length,9,tag+': somente as 9 RPCs especificadas');
 }
});
test('SECURITY-P0: revogar apenas anon sem romper roles autenticados, dados e RLS',()=>{
 assert.match(apply,/REVOKE EXECUTE ON FUNCTION %s FROM anon/);
 assert.match(rollback,/GRANT EXECUTE ON FUNCTION %s TO anon/);
 assert.match(apply,/has_function_privilege\('authenticated',func_oid,'EXECUTE'\)/);
 assert.match(apply,/has_function_privilege\('service_role',func_oid,'EXECUTE'\)/);
 assert.match(apply,/SECURITY_P0_UNEXPECTED_PUBLIC_GRANT/);
 assert.match(apply,/SECURITY_P0_ANON_STILL_ALLOWED/);
 for(const sql of [apply,rollback]){
  assert.doesNotMatch(sql,/\b(DROP|TRUNCATE|DELETE FROM|UPDATE\s+public\.|ALTER\s+TABLE|DISABLE ROW LEVEL SECURITY)\b/i);
 }
});
test('SECURITY-P0: todas as chamadas administrativas do cliente são endpoints autenticáveis',()=>{
 const nuvem=read('src/nuvem.js');
 for(const name of ['criar_minha_empresa','definir_bloqueio_da_empresa',
   'definir_bloqueio_do_perfil','definir_dados_da_empresa',
   'definir_dados_do_perfil','definir_empresa_do_perfil','definir_papel_do_perfil',
   'definir_ponte_da_empresa']){
   assert.ok(nuvem.includes('/rest/v1/rpc/'+name),'RPC não encontrada no cliente: '+name);
 }
});
