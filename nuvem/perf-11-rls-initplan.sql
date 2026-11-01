-- PERF-11 — avaliado na homologação (243 oportunidades). NÃO executar em produção sem portão de segurança.
-- Preserva literalmente a árvore booleana de autorização; transforma somente chamadas STABLE em initplans.
-- Requires validation: admin, gestor, usuario, multiempresa, SELECT/INSERT/UPDATE/DELETE.
BEGIN;
ALTER POLICY contas_tudo ON public.contas
  USING ((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL))))
  WITH CHECK ((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL))));

ALTER POLICY contatos_tudo ON public.contatos
  USING ((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL))))
  WITH CHECK ((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL))));

ALTER POLICY oportunidades_tudo ON public.oportunidades
  USING ((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL))))
  WITH CHECK ((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL))));

ALTER POLICY tarefas_tudo ON public.tarefas
  USING ((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL))))
  WITH CHECK ((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL))));
COMMIT;
