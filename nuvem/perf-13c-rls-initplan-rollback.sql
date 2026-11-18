-- PERF-13C: ROLLBACK sem alteracao da regra logica de acesso.
-- Impacto: 4 politicas ALL, USING + WITH CHECK, apenas autorizacao per-statement.
-- Uso controlado no projeto oficial; requer verificacao por papeis apos aplicar.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER POLICY contas_tudo ON public.contas
USING ((sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL)))))
WITH CHECK ((sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL)))));

ALTER POLICY contatos_tudo ON public.contatos
USING ((sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL)))))
WITH CHECK ((sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL)))));

ALTER POLICY oportunidades_tudo ON public.oportunidades
USING ((sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL)))))
WITH CHECK ((sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL)))));

ALTER POLICY tarefas_tudo ON public.tarefas
USING ((sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL)))))
WITH CHECK ((sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL)))));
COMMIT;
