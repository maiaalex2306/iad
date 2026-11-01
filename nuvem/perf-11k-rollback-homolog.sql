-- PERF-11K: limpeza explícita somente da massa sintética de HOMOLOGAÇÃO.
-- NÃO EXECUTAR EM PRODUÇÃO. Não altera registros fora do tenant marcado.
-- Conferir operador e ambiente antes de aplicar. Reversível apenas antes de
-- usar os dados sintéticos como referência em outros testes persistentes.
BEGIN;
DO $rollback$
DECLARE v_tenant uuid; v_contas integer; v_ops integer;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants
   WHERE nome='PERF11K_SINTETICO_PERFORMANCE';
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant sintético não encontrado, nenhuma exclusão.';
  END IF;
  SELECT count(*) INTO v_ops FROM public.oportunidades WHERE tenant_id=v_tenant;
  SELECT count(*) INTO v_contas FROM public.contas WHERE tenant_id=v_tenant;
  IF v_ops<>146 OR v_contas<>141
    OR EXISTS (SELECT 1 FROM public.oportunidades
                WHERE tenant_id=v_tenant AND id NOT LIKE '__perf11k_op_%')
    OR EXISTS (SELECT 1 FROM public.contas
                WHERE tenant_id=v_tenant AND id NOT LIKE '__perf11k_acc_%')
  THEN RAISE EXCEPTION 'Tenant sintético divergente: revisão manual necessária.'; END IF;
  DELETE FROM public.oportunidades WHERE tenant_id=v_tenant AND id LIKE '__perf11k_op_%';
  DELETE FROM public.contas WHERE tenant_id=v_tenant AND id LIKE '__perf11k_acc_%';
  DELETE FROM public.tenants WHERE id=v_tenant AND nome='PERF11K_SINTETICO_PERFORMANCE';
END;
$rollback$;
COMMIT;
