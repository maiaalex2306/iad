-- SECURITY-P0 / 2026-11-08: restringir RPCs administrativas a sessões autenticadas.
-- Estado anterior confirmado nos projetos IDA (produção) e iadcrm-homolog:
-- anon/authenticated/service_role com EXECUTE nestas 9 funções SECURITY DEFINER.
-- Não muda corpos, argumentos, triggers, RLS, tabelas ou dados.
-- Idempotente e atômico: se qualquer verificação falhar, o DO é revertido.
DO $security_p0$
DECLARE
  signature text;
  func_oid oid;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.criar_minha_empresa(text,text)',
    'public.definir_bloqueio_da_empresa(uuid,boolean)',
    'public.definir_bloqueio_do_perfil(uuid,boolean)',
    'public.definir_dados_da_empresa(uuid,text,text)',
    'public.definir_dados_do_perfil(uuid,text,text)',
    'public.definir_empresa_do_perfil(uuid,uuid)',
    'public.definir_nome_do_perfil(uuid,text)',
    'public.definir_papel_do_perfil(uuid,text)',
    'public.definir_ponte_da_empresa(uuid,text,text)'
  ] LOOP
    func_oid := to_regprocedure(signature);
    IF func_oid IS NULL THEN
      RAISE EXCEPTION 'SECURITY_P0_MISSING_RPC: %',signature;
    END IF;
    -- Se PUBLIC também tiver EXECUTE, revogar somente anon seria insuficiente.
    IF EXISTS (
      SELECT 1 FROM pg_proc p,
        LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      WHERE p.oid=func_oid AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
    ) THEN
      RAISE EXCEPTION 'SECURITY_P0_UNEXPECTED_PUBLIC_GRANT: %',signature;
    END IF;
    IF NOT has_function_privilege('authenticated',func_oid,'EXECUTE')
       OR NOT has_function_privilege('service_role',func_oid,'EXECUTE') THEN
      RAISE EXCEPTION 'SECURITY_P0_MISSING_AUTH_GRANT: %',signature;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',func_oid::regprocedure);
    IF has_function_privilege('anon',func_oid,'EXECUTE') THEN
      RAISE EXCEPTION 'SECURITY_P0_ANON_STILL_ALLOWED: %',signature;
    END IF;
  END LOOP;
END $security_p0$;

-- Leitura pós-aplicação (nunca invoca a função, só verifica ACL):
-- SELECT p.proname,has_function_privilege('anon',p.oid,'EXECUTE') anon,
--   has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
--   has_function_privilege('service_role',p.oid,'EXECUTE') service_role
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public' AND p.proname IN
-- ('criar_minha_empresa','definir_bloqueio_da_empresa',
-- 'definir_bloqueio_do_perfil','definir_dados_da_empresa',
-- 'definir_dados_do_perfil','definir_empresa_do_perfil',
-- 'definir_nome_do_perfil','definir_papel_do_perfil','definir_ponte_da_empresa');
