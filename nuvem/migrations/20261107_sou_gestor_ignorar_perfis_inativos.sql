-- IaD CRM — Hotfix de autorização para contas desativadas — 2026-11-07
--
-- Problema confirmado:
--   Um administrador com public.perfis.ativo=false ainda recebia
--   sou_gestor()=true porque a função verificava somente o papel.
--   As políticas atuais impediam leitura da carteira por meu_tenant() NULL,
--   mas qualquer rotina que confiasse só em sou_gestor() poderia autorizar
--   incorretamente um usuário bloqueado.
--
-- Alteração cirúrgica: adiciona p.ativo à checagem do papel.
-- Conserva assinatura, OID, GRANTs, STABLE, SECURITY DEFINER e search_path.
-- NÃO modifica dados, políticas RLS, CAS, service workers nem frontend.
CREATE OR REPLACE FUNCTION public.sou_gestor()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
 SELECT coalesce((
   SELECT p.papel IN ('gestor','admin') AND p.ativo
   FROM public.perfis p
   WHERE p.id = auth.uid()
 ), false)
$function$;

-- Migração já aplicada em Supabase staging bvlfzeblpewlqhssprpv
-- e produção drhonmdffhnwamwzynrs sob:
--   iad_sou_gestor_inactive_profile_guard_20261107
--
-- Evidências SQL READ ONLY no banco de produção com
-- SET LOCAL ROLE authenticated / request.jwt.claim.sub em transação ROLLBACK:
-- Gestor ativo A: 375 contas / 380 oportunidades / 0 registros de outros tenants
-- Gestor ativo B: 375 contas / 380 oportunidades / 0 registros de outros tenants
-- Gestor ativo C: 17 contas / 17 oportunidades / 0 registros de outros tenants
-- Administrador ativo: manager=true, admin=true, 392 contas, 397 oportunidades
-- Administrador inativo: manager=false (antes true), admin=false,
--                       tenant bloqueado, 0 contas / 0 oportunidades / 0 tarefas
-- Dois usuários comuns inativos: manager=false, admin=false,
--                               0 contas / 0 oportunidades / 0 tarefas
-- Staging: administrador ativo manteve 384 contas / 389 oportunidades,
--          anônimo não obteve acesso a contas.
-- O teste RLS por sessão SQL simula identidade; não substitui login E2E no browser.
--
-- ROLLBACK somente em caso de regressão comprovada:
-- CREATE OR REPLACE FUNCTION public.sou_gestor()
-- RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
-- SET search_path TO 'public'
-- AS $function$
--   SELECT coalesce((
--     SELECT papel IN ('gestor','admin')
--     FROM public.perfis WHERE id=auth.uid()
--   ), false)
-- $function$;
-- Nota: rollback reintroduz o defeito de usuário inativo; não é recomendado
-- como método rotineiro de solução.
