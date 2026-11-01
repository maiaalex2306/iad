-- PERF-11J — TESTE DE HOMOLOGAÇÃO EXCLUSIVAMENTE (não rodar em produção).
-- Abre transações, simula os papéis a partir da conta de homologação e faz
-- ROLLBACK. Não cria usuários Auth, não copia base e não deixa registros.
-- A rotina de testes exige validação explícita dos resultados:
-- vendedor [1,0,1,0,1]; gestor [1,0,0,0].
-- Com estes dados NÃO é possível validar dois vendedores simultâneos.
BEGIN;
SET LOCAL statement_timeout='15000ms';
SELECT set_config('iad_perf_11j.uid',
  (SELECT id::text FROM public.perfis WHERE papel='admin' LIMIT 1),true);
SELECT set_config('iad_perf_11j.tenant_a',
  (SELECT tenant_id::text FROM public.perfis
    WHERE id=current_setting('iad_perf_11j.uid')::uuid),true);
UPDATE public.perfis SET papel='usuario'
  WHERE id=current_setting('iad_perf_11j.uid')::uuid;
INSERT INTO public.tenants(nome) VALUES ('PERF11J_SYNTHETIC_ROLLBACK_ONLY');
SELECT set_config('iad_perf_11j.tenant_b',
  (SELECT id::text FROM public.tenants WHERE nome='PERF11J_SYNTHETIC_ROLLBACK_ONLY'),true);
INSERT INTO public.oportunidades(id,tenant_id,dono_id,titulo)
VALUES
 ('__perf11j_synthetic_a',current_setting('iad_perf_11j.tenant_a')::uuid,
  current_setting('iad_perf_11j.uid')::uuid,'PERF11J A - rollback'),
 ('__perf11j_synthetic_b',current_setting('iad_perf_11j.tenant_b')::uuid,
  current_setting('iad_perf_11j.uid')::uuid,'PERF11J B - rollback');
SELECT set_config('request.jwt.claim.sub',current_setting('iad_perf_11j.uid'),true);
SET LOCAL ROLE authenticated;
SELECT
 (SELECT count(*)::int FROM public.oportunidades
    WHERE id='__perf11j_synthetic_a') AS own_tenant_visible,
 (SELECT count(*)::int FROM public.oportunidades
    WHERE id='__perf11j_synthetic_b') AS foreign_tenant_visible,
 (SELECT count(*)::int FROM public.iad_sync_usuario_eventos
    WHERE registro_id='__perf11j_synthetic_a') AS own_event_visible,
 (SELECT count(*)::int FROM public.iad_sync_usuario_eventos
    WHERE registro_id='__perf11j_synthetic_b') AS foreign_event_visible,
 (SELECT count(*)::int FROM public.iad_sync_usuario_versoes) AS private_cursor_visible;
RESET ROLE;
ROLLBACK;

BEGIN;
SET LOCAL statement_timeout='15000ms';
SELECT set_config('iad_perf_11j.uid',
  (SELECT id::text FROM public.perfis WHERE papel='admin' LIMIT 1),true);
SELECT set_config('iad_perf_11j.tenant_a',
  (SELECT tenant_id::text FROM public.perfis
   WHERE id=current_setting('iad_perf_11j.uid')::uuid),true);
UPDATE public.perfis SET papel='gestor'
  WHERE id=current_setting('iad_perf_11j.uid')::uuid;
INSERT INTO public.tenants(nome) VALUES ('PERF11J_MANAGER_TEST_ROLLBACK_ONLY');
SELECT set_config('iad_perf_11j.tenant_b',
  (SELECT id::text FROM public.tenants WHERE nome='PERF11J_MANAGER_TEST_ROLLBACK_ONLY'),true);
INSERT INTO public.oportunidades(id,tenant_id,dono_id,titulo)
VALUES
 ('__perf11j_manager_a',current_setting('iad_perf_11j.tenant_a')::uuid,
  NULL,'PERF11J gestor A - rollback'),
 ('__perf11j_manager_b',current_setting('iad_perf_11j.tenant_b')::uuid,
  NULL,'PERF11J gestor B - rollback');
SELECT set_config('request.jwt.claim.sub',current_setting('iad_perf_11j.uid'),true);
SET LOCAL ROLE authenticated;
SELECT
 (SELECT count(*)::int FROM public.oportunidades
    WHERE id='__perf11j_manager_a') AS own_tenant_visible,
 (SELECT count(*)::int FROM public.oportunidades
    WHERE id='__perf11j_manager_b') AS foreign_tenant_visible,
 (SELECT count(*)::int FROM public.iad_sync_usuario_eventos) AS private_events_visible_for_manager,
 (SELECT count(*)::int FROM public.iad_sync_usuario_versoes) AS private_versions_visible_for_manager;
RESET ROLE;
ROLLBACK;