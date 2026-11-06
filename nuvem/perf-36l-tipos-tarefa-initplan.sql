-- PERF-36L: política de tipos_tarefa (1343 linhas em produção).
-- Aplicada ao projeto IDA como migração perf_36l_tipo_tarefa_rls_initplan.
-- Preserva integralmente a autorização por tenant e administrador nos dois sentidos:
-- USING (leitura / filtro) e WITH CHECK (inserção / atualização).
-- As funções STABLE sem parâmetros dependem da sessão, não de cada linha.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER POLICY tipos_tarefa_tudo ON public.tipos_tarefa
  USING (
    (tenant_id = (SELECT public.meu_tenant()))
    OR (SELECT public.sou_admin())
  )
  WITH CHECK (
    (tenant_id = (SELECT public.meu_tenant()))
    OR (SELECT public.sou_admin())
  );
COMMIT;
