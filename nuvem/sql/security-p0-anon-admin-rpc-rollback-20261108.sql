-- SECURITY-P0 / 2026-11-08: ROLLBACK APENAS COM APROVAÇÃO EXPLÍCITA.
-- Reintroduz o antigo acesso anon às 9 RPCs, revertendo a proteção.
-- O rollback NÃO altera usuários, RLS, dados, triggers ou autenticação.
DO $security_p0_rollback$
DECLARE signature text; func_oid oid;
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
      RAISE EXCEPTION 'SECURITY_P0_ROLLBACK_MISSING_RPC: %',signature;
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon',func_oid::regprocedure);
  END LOOP;
END $security_p0_rollback$;
