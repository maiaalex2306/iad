-- PERF-11 — rollback exato para as quatro políticas de produção anteriormente verificadas.
BEGIN;
ALTER POLICY contas_tudo ON public.contas
  USING (sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL))))
  WITH CHECK (sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL))));
ALTER POLICY contatos_tudo ON public.contatos
  USING (sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL))))
  WITH CHECK (sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL))));
ALTER POLICY oportunidades_tudo ON public.oportunidades
  USING (sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL))))
  WITH CHECK (sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL))));
ALTER POLICY tarefas_tudo ON public.tarefas
  USING (sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL))))
  WITH CHECK (sou_admin() OR ((tenant_id = meu_tenant()) AND (sou_gestor() OR (dono_id = auth.uid()) OR (dono_id IS NULL))));
COMMIT;
