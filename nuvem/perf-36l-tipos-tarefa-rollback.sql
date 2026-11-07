-- PERF-36L: rollback apenas da avaliação de RLS.
-- Sem impacto no conteúdo do catálogo, grants, perfis ou tenants.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER POLICY tipos_tarefa_tudo ON public.tipos_tarefa
  USING (
    (tenant_id = public.meu_tenant())
    OR public.sou_admin()
  )
  WITH CHECK (
    (tenant_id = public.meu_tenant())
    OR public.sou_admin()
  );
COMMIT;
