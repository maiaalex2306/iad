-- PERF-11I: análise estritamente SOMENTE LEITURA para homologação e produção.
-- Retorna apenas contagens e flags técnicas; SEM nomes, e-mails, UUIDs, registros ou secrets.
-- Executar separadamente em cada Supabase e passar a coluna release_readiness_report
-- como JSON ao script scripts/perf11i-readiness.cjs. NÃO altera nenhum dado.
SELECT jsonb_build_object(
  'schema_version', 1,
  'counts', jsonb_build_object(
    'auth_users',(SELECT count(*) FROM auth.users),
    'profiles',(SELECT count(*) FROM public.perfis),
    'tenants',(SELECT count(*) FROM public.tenants),
    'opportunities',(SELECT count(*) FROM public.oportunidades),
    'tenant_coverage',(SELECT count(distinct tenant_id) FROM public.oportunidades),
    'admins',(SELECT count(*) FROM public.perfis WHERE papel='admin'),
    'managers',(SELECT count(*) FROM public.perfis WHERE papel='gestor'),
    'sellers',(SELECT count(*) FROM public.perfis WHERE papel NOT IN ('admin','gestor'))
  ),
  'schema', jsonb_build_object(
    'iad_sync_usuario_eventos',to_regclass('public.iad_sync_usuario_eventos') IS NOT NULL,
    'iad_sync_usuario_versoes',to_regclass('public.iad_sync_usuario_versoes') IS NOT NULL
  ),
  'rls', jsonb_build_object(
    'tables_in_public',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),
    'without_rls',(SELECT count(*) FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity),
    'protected_opportunities',(SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='oportunidades')
  )
)::text AS release_readiness_report;