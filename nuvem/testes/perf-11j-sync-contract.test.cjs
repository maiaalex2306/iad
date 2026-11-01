'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('nuvem/perf-03c-journal-privado.sql','utf8');
const probe=fs.readFileSync('nuvem/testes/perf-11j-rls-rollback.sql','utf8');
test('estrutura fonte é única e idempotente, sem modificar SQL de produção',()=>{
 for(const item of [
 'CREATE TABLE IF NOT EXISTS public.iad_sync_usuario_versoes',
 'CREATE TABLE IF NOT EXISTS public.iad_sync_usuario_eventos',
 'ALTER TABLE public.iad_sync_usuario_versoes ENABLE ROW LEVEL SECURITY',
 'ALTER TABLE public.iad_sync_usuario_eventos ENABLE ROW LEVEL SECURITY',
 "CREATE POLICY iad_sync_usuario_versoes_ler",
 "CREATE POLICY iad_sync_usuario_eventos_ler"
 ])assert.ok(source.includes(item),'falta '+item);
});
test('canal privado só concede SELECT autenticado sob RLS e remove escrita direta',()=>{
 for(const tbl of ['iad_sync_usuario_versoes','iad_sync_usuario_eventos']){
  assert.ok(source.includes('REVOKE ALL ON public.'+tbl+' FROM PUBLIC, anon, authenticated;'));
  assert.ok(source.includes('GRANT SELECT ON public.'+tbl+' TO authenticated;'));
  assert.ok(source.includes('CREATE POLICY '+tbl+'_ler ON public.'+tbl));
 }
 assert.match(source,/usuario_id\s*=\s*\(SELECT auth\.uid\(\)\)/);
 assert.match(source,/tenant_id\s*=\s*\(SELECT public\.meu_tenant\(\)\)/);
 assert.match(source,/NOT\s*\(SELECT public\.sou_gestor\(\)\)/);
 assert.ok(source.includes('REVOKE ALL ON FUNCTION public.iad_sync_registrar_usuario() FROM PUBLIC, anon, authenticated;'));
});
test('gatilhos contemplam exatamente oito tabelas e segmentam seller privado',()=>{
 for(const tabela of ['contas','contatos','oportunidades','tarefas','produtos','segmentos','tipos_tarefa','fontes'])
  assert.ok(source.includes("'"+tabela+"'"));
 assert.match(source,/p\.papel = 'usuario'/);
 assert.match(source,/IF NOT _era_visivel AND NOT _agora_visivel THEN CONTINUE/);
 assert.match(source,/IF TG_OP = 'UPDATE' AND OLD\.tenant_id IS DISTINCT FROM NEW\.tenant_id/);
});
test('testes transacionais não persistem nenhuma alteração',()=>{
 assert.equal((probe.match(/^BEGIN;$/gm)||[]).length,2);
 assert.equal((probe.match(/^ROLLBACK;$/gm)||[]).length,2);
 assert.equal((probe.match(/^SET LOCAL ROLE authenticated;$/gm)||[]).length,2);
 assert.equal((probe.match(/^RESET ROLE;$/gm)||[]).length,2);
 assert.doesNotMatch(probe,/^COMMIT\s*;/gm);
 assert.doesNotMatch(probe,/COPY\s|\\copy|pg_read_file|pg_ls_dir|CREATE ROLE|PASSWORD/i);
});
test('prova contém expectativas de isolamento e preserva código original',()=>{
 for(const value of ['own_tenant_visible','foreign_tenant_visible',
 'own_event_visible','foreign_event_visible','private_cursor_visible',
 'private_events_visible_for_manager','private_versions_visible_for_manager'])
 assert.ok(probe.includes(value),value);
 assert.match(probe,/PERF11J_SYNTHETIC_ROLLBACK_ONLY/);
 assert.match(probe,/PERF11J_MANAGER_TEST_ROLLBACK_ONLY/);
 assert.match(probe,/não rodar em produção/);
});
