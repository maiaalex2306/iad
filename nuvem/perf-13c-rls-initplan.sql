-- PERF-13C: otimizacao de initPlan sem alteracao da regra logica de acesso.
-- Impacto: 4 politicas ALL, USING + WITH CHECK, apenas autorizacao per-statement.
-- Uso controlado no projeto oficial; requer verificacao por papeis apos aplicar.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER POLICY contas_tudo ON public.contas
USING (((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL)))))
WITH CHECK (((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL)))));

ALTER POLICY contatos_tudo ON public.contatos
USING (((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL)))))
WITH CHECK (((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL)))));

ALTER POLICY oportunidades_tudo ON public.oportunidades
USING (((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL)))))
WITH CHECK (((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL)))));

ALTER POLICY tarefas_tudo ON public.tarefas
USING (((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL)))))
WITH CHECK (((select public.sou_admin()) OR ((tenant_id = (select public.meu_tenant())) AND ((select public.sou_gestor()) OR (dono_id = (select auth.uid())) OR (dono_id IS NULL)))));
COMMIT;
