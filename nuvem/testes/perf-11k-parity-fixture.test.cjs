'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const {validar}=require('../../scripts/perf11i-readiness.cjs');
const fixture=fs.readFileSync('nuvem/perf-11k-fixture-homolog.sql','utf8');
const rollback=fs.readFileSync('nuvem/perf-11k-rollback-homolog.sql','utf8');
test('fixture explicitamente restrita à homologação e totalmente sintética',()=>{
 assert.match(fixture,/PERF11K_SINTETICO_PERFORMANCE/);
 assert.match(fixture,/NÃO rodar em produção/);
 assert.match(fixture,/SEM CLIENTE REAL/);
 assert.match(fixture,/generate_series\(1,141\)/);
 assert.match(fixture,/generate_series\(1,146\)/);
 assert.doesNotMatch(fixture,/INSERT\s+INTO\s+auth\./i);
 assert.doesNotMatch(fixture,/UPDATE\s+public\.perfis|DELETE\s+FROM\s+public\.perfis/i);
});
test('inserções isoladas em tenant novo, sem editar carteira anterior',()=>{
 assert.match(fixture,/INSERT INTO public\.tenants/);
 assert.match(fixture,/INSERT INTO public\.contas/);
 assert.match(fixture,/INSERT INTO public\.oportunidades/);
 assert.match(fixture,/v_tenant,NULL/);
 assert.match(fixture,/v_tenant,NULL,/);
 assert.doesNotMatch(fixture,/UPDATE\s+public\.oportunidades|DELETE\s+FROM\s+public\.oportunidades/i);
 assert.match(fixture,/Fixture PERF11K já existe/);
 assert.match(fixture,/RAISE EXCEPTION 'Fixture incompleta/);
});
test('carga contempla dois negócios complexos artificiais sem dados reais',()=>{
 assert.match(fixture,/i=1 THEN 141 WHEN i=2 THEN 120/);
 assert.match(fixture,/WHEN i=1 THEN 18 WHEN i=2 THEN 20/);
 assert.match(fixture,/PERF11K - Negocio complexo sintetico A/);
 assert.match(fixture,/PERF11K - Negocio complexo sintetico B/);
 assert.match(fixture,/Evidencia artificial PERF11K/);
});
test('rollback protege linhas não sintéticas e rejeita contagens divergentes',()=>{
 assert.match(rollback,/v_ops<>146 OR v_contas<>141/);
 assert.match(rollback,/id NOT LIKE '__perf11k_op_%'/);
 assert.match(rollback,/id NOT LIKE '__perf11k_acc_%'/);
 assert.match(rollback,/WHERE tenant_id=v_tenant AND id LIKE '__perf11k_op_%'/);
 assert.match(rollback,/WHERE tenant_id=v_tenant AND id LIKE '__perf11k_acc_%'/);
 assert.match(rollback,/nome='PERF11K_SINTETICO_PERFORMANCE'/);
 assert.match(rollback,/a\.attname='tenant_id'/);
 assert.match(rollback,/c\.relname NOT IN \('tenants','contas','oportunidades','iad_sync_eventos','iad_sync_versoes'\)/);
 assert.match(rollback,/Tenant PERF11K referenciado/);

 assert.doesNotMatch(rollback,/DELETE FROM auth\.users|DROP TABLE|TRUNCATE/i);
});
test('portão pós-fixture melhora duas condições mas continua bloqueando Auth ausente',()=>{
 const result=validar({
  schema_version:1,
  counts:{auth_users:1,profiles:1,tenants:2,opportunities:389,
    tenant_coverage:2,admins:1,managers:0,sellers:0},
  schema:{iad_sync_usuario_eventos:true,iad_sync_usuario_versoes:true},
  rls:{tables_in_public:23,without_rls:0,protected_opportunities:true}
 });
 assert.equal(result.status,'BLOQUEADO');
 assert.deepEqual(result.falhas.map(x=>x.codigo).sort(),
  ['auth_users','profiles','managers','sellers'].sort());
});

test('rollback exige journal exatamente da carga sintética e bloqueia alterações posteriores',()=>{
 assert.match(rollback,/public\.iad_sync_eventos WHERE tenant_id=v_tenant\) <> 287/);
 assert.match(rollback,/public\.iad_sync_versoes WHERE tenant_id=v_tenant\) <> 1/);
 assert.match(rollback,/tabela='contas' AND registro_id LIKE '__perf11k_acc_%' AND operacao='I'/);
 assert.match(rollback,/tabela='oportunidades' AND registro_id LIKE '__perf11k_op_%' AND operacao='I'/);
 assert.match(rollback,/Journal PERF11K divergente/);
});
