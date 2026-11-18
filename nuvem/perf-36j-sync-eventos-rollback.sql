-- PERF-36J: rollback da expressao de leitura original, sem afetar os dados.
-- Aplicar somente se houver regressao comprovada.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER POLICY iad_sync_eventos_leitura ON public.iad_sync_eventos
  USING (
    public.sou_admin()
    OR (tenant_id = public.meu_tenant() AND public.sou_gestor())
  );
COMMIT;
