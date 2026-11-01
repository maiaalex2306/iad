'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const cp=require('node:child_process');
const {validar}=require('../../scripts/perf11i-readiness.cjs');
const pronta=()=>({
 schema_version:1,
 counts:{auth_users:7,profiles:7,tenants:2,opportunities:389,
  tenant_coverage:2,admins:2,managers:3,sellers:2},
 schema:{iad_sync_usuario_eventos:true,iad_sync_usuario_versoes:true},
 rls:{tables_in_public:23,without_rls:0,protected_opportunities:true}
});
const faltando=()=>({
 schema_version:1,
 counts:{auth_users:1,profiles:1,tenants:1,opportunities:243,
  tenant_coverage:1,admins:1,managers:0,sellers:0},
 schema:{iad_sync_usuario_eventos:false,iad_sync_usuario_versoes:false},
 rls:{tables_in_public:21,without_rls:0,protected_opportunities:true}
});
test('homologação com uma empresa e um admin BLOQUEIA liberação',()=>{
 const r=validar(faltando());
 assert.equal(r.status,'BLOQUEADO');
 assert.equal(r.prerequisitosOk,false);
 const codes=r.falhas.map(x=>x.codigo);
 for(const code of ['auth_users','profiles','tenants','managers','sellers',
  'tenant_coverage','schema.iad_sync_usuario_eventos','schema.iad_sync_usuario_versoes'])
  assert.ok(codes.includes(code),'falta checar '+code);
 assert.ok(!codes.includes('rls.all_public'),'RLS presente não é problema');
});
test('matriz completa só aprova PRÉ-CONDIÇÕES e não homologa versão',()=>{
 const r=validar(pronta());
 assert.equal(r.status,'PRECONDICOES_ATENDIDAS');
 assert.equal(r.prerequisitosOk,true);
 assert.deepEqual(r.falhas,[]);
 assert.match(r.comentario,/não atesta RLS/);
});
test('mesma matriz recebida de coluna SQL string funciona',()=>{
 const x={release_readiness_report:JSON.stringify(pronta())};
 assert.equal(validar(x).prerequisitosOk,true);
});
test('falha fechada se tabelas de sync desaparecerem',()=>{
 for(const k of ['iad_sync_usuario_eventos','iad_sync_usuario_versoes']){
   const x=pronta();x.schema[k]=false;
   assert.equal(validar(x).prerequisitosOk,false);
 }
});
test('falha fechada quando RLS é desligada em qualquer tabela pública',()=>{
 const x=pronta();x.rls.without_rls=1;
 assert.ok(validar(x).falhas.some(z=>z.codigo==='rls.all_public'));
 x.rls.without_rls=0;x.rls.protected_opportunities=false;
 assert.ok(validar(x).falhas.some(z=>z.codigo==='rls.opportunities'));
});
test('dados inválidos, ausentes, não inteiros e versões desconhecidas bloqueiam',()=>{
 assert.equal(validar(null).status,'BLOQUEADO');
 assert.equal(validar({schema_version:999}).status,'BLOQUEADO');
 for(const valor of [null, '7', undefined, NaN, Infinity,-1]){
  const x=pronta();x.counts.auth_users=valor;
  assert.equal(validar(x).prerequisitosOk,false);
 }
});
test('CLI tem exit code 2 quando bloqueado e 0 quando apto; dados nunca incluem PII',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'iad-perf-11i-'));
 try{
  const target=path.join(d,'status.json');
  const execute=(data)=>{
   fs.writeFileSync(target,JSON.stringify(data));
   return cp.spawnSync(process.execPath,
    ['scripts/perf11i-readiness.cjs',target],{encoding:'utf8'});
  };
  let r=execute(faltando());
  assert.equal(r.status,2);
  assert.equal(JSON.parse(r.stdout).prerequisitosOk,false);
  assert.doesNotMatch(r.stdout,/email|senha|password|token|jwt/i);
  r=execute(pronta());
  assert.equal(r.status,0);
  assert.equal(JSON.parse(r.stdout).prerequisitosOk,true);
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});
