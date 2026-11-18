-- PERF-03D — teste SQL não destrutivo do CAS.
-- Executar SOMENTE no banco de homologação, como administrador de testes.
DO $$
DECLARE p record; o record; st1 text; st2 text; v bigint;
BEGIN
 SELECT id INTO p FROM public.perfis WHERE papel='admin' LIMIT 1;
 SELECT id,tenant_id,revisao INTO o FROM public.oportunidades ORDER BY id LIMIT 1;
 IF p.id IS NULL OR o.id IS NULL THEN RAISE EXCEPTION 'Massa de testes incompleta'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claim.sub',p.id::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT estado,revisao_atual INTO st1,v
    FROM public.iad_oportunidade_cas(o.id,o.tenant_id,o.revisao,'{"titulo":"CAS teste A"}'::jsonb);
  SELECT estado INTO st2
    FROM public.iad_oportunidade_cas(o.id,o.tenant_id,o.revisao,'{"titulo":"CAS teste B"}'::jsonb);
  IF st1 <> 'ok' OR v <> o.revisao + 1 OR st2 <> 'conflito_ou_inacessivel' THEN
    RAISE EXCEPTION 'Falha de controle CAS: %, %, %',st1,v,st2;
  END IF;
  RAISE EXCEPTION 'ROLLBACK_TEST';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_TEST' THEN RAISE; END IF;
 END;
 IF (SELECT revisao FROM public.oportunidades WHERE id=o.id AND tenant_id=o.tenant_id) <> o.revisao THEN
  RAISE EXCEPTION 'O teste persistiu alteração';
 END IF;
END $$;
