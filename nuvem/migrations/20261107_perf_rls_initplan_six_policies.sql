-- IaD CRM — PERF-RLS-INITPLAN-01 — 2026-11-07
-- ESCOPO: otimização de seis políticas RLS, sem alteração de autorizações.
-- Migração executada e verificada no Supabase de homologação
-- (bvlfzeblpewlqhssprpv) e produção (drhonmdffhnwamwzynrs), sob o nome:
-- iad_perf_rls_initplan_20261107
--
-- Motivo: Supabase Advisor auth_rls_initplan indicava seis políticas que
-- reavaliavam auth.uid()/sou_admin() por linha. A função public.sou_admin()
-- é STABLE e não depende da linha. (SELECT ...) vira InitPlan de consulta.
--
-- Antes de aplicar, verificar pg_policies e comparar os predicados. Nenhuma
-- GRANT/REVOKE, RLS enable/disable, tabela, coluna ou linha é alterada.
-- Aplicação novamente resulta no mesmo predicado (idempotente).
ALTER POLICY perfis_leitura ON public.perfis
  USING ((id = (SELECT auth.uid())) OR (SELECT public.sou_admin()));

ALTER POLICY perfis_atualizacao ON public.perfis
  USING ((id = (SELECT auth.uid())) OR (SELECT public.sou_admin()));

ALTER POLICY perfis_escrita ON public.perfis
  WITH CHECK (id = (SELECT auth.uid()));

ALTER POLICY caixas_email_minha ON public.caixas_email
  USING ((dono_id = (SELECT auth.uid())) OR (SELECT public.sou_admin()))
  WITH CHECK ((dono_id = (SELECT auth.uid())) OR (SELECT public.sou_admin()));

ALTER POLICY notas_minhas ON public.notas
  USING (dono_id = (SELECT auth.uid()))
  WITH CHECK (dono_id = (SELECT auth.uid()));

ALTER POLICY iad_cas_receipts_owner_select ON public.iad_cas_receipts
  USING (usuario_id = (SELECT auth.uid()));

-- HOMOLOGAÇÃO EXECUTADA:
-- 1. Stage: Supabase Advisor auth_rls_initplan 6 -> 0.
-- 2. Stage: EXPLAIN ANALYZE public.perfis confirmou InitPlan 1 e InitPlan 2.
-- 3. Produção antes e depois, sob SET LOCAL ROLE authenticated com JWT
--    simulado de um gestor ativo e de um administrador ativo, sem retornar PII:
--    Gestor: perfis 1, contas 375, contas de outros tenants 0,
--            oportunidades 380, notas 0, caixas_email 2, receipts 145.
--    Admin:  perfis 7, contas 392, oportunidades 397,
--            notas 0, caixas_email 2, receipts 12.
--    Ambos preservaram integralmente as contagens de visibilidade.
-- 4. Produção: 2 tenants, 392 contas, 397 oportunidades, 473 tarefas;
--    UPDATE direto de public.tenants segue proibido a authenticated.
-- 5. Produção: Advisor auth_rls_initplan 6 -> 0.
--
-- IMPORTANTE: essa prova NÃO cobre IA autenticada, latência P95 ponta a
-- ponta, nem todas as combinações de permissões. Não declarar que houve
-- redução mensurável de tempo de tela sem comparar sessões reais.
--
-- ROLLBACK DOCUMENTADO (executar SOMENTE mediante regressão comprovada):
-- ALTER POLICY perfis_leitura ON public.perfis
--   USING ((id = auth.uid()) OR public.sou_admin());
-- ALTER POLICY perfis_atualizacao ON public.perfis
--   USING ((id = auth.uid()) OR public.sou_admin());
-- ALTER POLICY perfis_escrita ON public.perfis
--   WITH CHECK (id = auth.uid());
-- ALTER POLICY caixas_email_minha ON public.caixas_email
--   USING ((dono_id = auth.uid()) OR public.sou_admin())
--   WITH CHECK ((dono_id = auth.uid()) OR public.sou_admin());
-- ALTER POLICY notas_minhas ON public.notas
--   USING (dono_id = auth.uid())
--   WITH CHECK (dono_id = auth.uid());
-- ALTER POLICY iad_cas_receipts_owner_select ON public.iad_cas_receipts
--   USING (usuario_id = auth.uid());
