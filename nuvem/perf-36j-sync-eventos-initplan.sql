-- PERF-36J: otimizar apenas a leitura do diario de sincronizacao.
-- Ja aplicada no Supabase de producao como perf_36j_sync_eventos_rls_initplan.
-- A expressao booleana de acesso permanece identica: admin OU (mesmo tenant E gestor).
-- As funcoes sao STABLE, independentes da linha, e executadas como InitPlans.
-- Nao altera a politica de escrita, grants ou status RLS.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER POLICY iad_sync_eventos_leitura ON public.iad_sync_eventos
  USING (
    (SELECT public.sou_admin())
    OR (tenant_id = (SELECT public.meu_tenant()) AND (SELECT public.sou_gestor()))
  );
COMMIT;
