-- Follow-up SQL migration: reject repeated first 12 characters of CNPJ even with mathematically valid DVs.
CREATE OR REPLACE FUNCTION public.iad_market_import_confirmed(
 p_empresa jsonb, p_tenant uuid, p_request_id uuid, p_confirmed boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE
 v_user uuid := auth.uid();
 v_tenant uuid;
 v_papel text;
 v_cnpj text;
 v_nome text;
 v_razao text;
 v_cidade text;
 v_uf text;
 v_site text;
 v_segmento text;
 v_source text;
 v_account text;
 v_opportunity text;
 v_existing text;
 v_replay record;
 v_dig integer;
 v_sum integer;
 v_mod integer;
 v_i integer;
 v_w1 integer[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
 v_w2 integer[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
BEGIN
 IF p_confirmed IS DISTINCT FROM true OR p_request_id IS NULL OR p_tenant IS NULL THEN
  RETURN pg_catalog.jsonb_build_object('status','confirmation_required');
 END IF;
 IF v_user IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','auth_required'); END IF;
 SELECT p.tenant_id,p.papel INTO v_tenant,v_papel
 FROM public.perfis p JOIN public.tenants t ON t.id=p.tenant_id
 WHERE p.id=v_user AND p.ativo IS TRUE AND t.ativo IS TRUE;
 IF v_tenant IS NULL OR v_papel NOT IN ('usuario','gestor','admin') OR v_tenant<>p_tenant THEN
  RETURN pg_catalog.jsonb_build_object('status','forbidden_scope');
 END IF;
 IF p_empresa IS NULL OR pg_catalog.jsonb_typeof(p_empresa)<>'object' THEN
  RETURN pg_catalog.jsonb_build_object('status','invalid_company');
 END IF;
 v_cnpj := pg_catalog.upper(pg_catalog.regexp_replace(COALESCE(p_empresa->>'cnpj',''),'[^0-9A-Za-z]','','g'));
 IF v_cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$' OR
    pg_catalog.left(v_cnpj,12) = pg_catalog.repeat(pg_catalog.left(v_cnpj,1),12) THEN
  RETURN pg_catalog.jsonb_build_object('status','invalid_cnpj');
 END IF;
 -- Brazilian alphanumeric CNPJ checksum, mapping ASCII character code - 48.
 v_sum:=0;
 FOR v_i IN 1..12 LOOP
  v_dig:=pg_catalog.ascii(pg_catalog.substr(v_cnpj,v_i,1))-48;
  v_sum:=v_sum+v_dig*v_w1[v_i];
 END LOOP;
 v_mod:=v_sum%11;
 IF pg_catalog.substr(v_cnpj,13,1)<>(CASE WHEN v_mod<2 THEN '0' ELSE (11-v_mod)::text END) THEN
  RETURN pg_catalog.jsonb_build_object('status','invalid_cnpj');
 END IF;
 v_sum:=0;
 FOR v_i IN 1..13 LOOP
  v_dig:=pg_catalog.ascii(pg_catalog.substr(v_cnpj,v_i,1))-48;
  v_sum:=v_sum+v_dig*v_w2[v_i];
 END LOOP;
 v_mod:=v_sum%11;
 IF pg_catalog.substr(v_cnpj,14,1)<>(CASE WHEN v_mod<2 THEN '0' ELSE (11-v_mod)::text END) THEN
  RETURN pg_catalog.jsonb_build_object('status','invalid_cnpj');
 END IF;
 v_nome:=pg_catalog.left(pg_catalog.btrim(COALESCE(p_empresa->>'nome',p_empresa->>'razaoSocial','')),160);
 v_razao:=pg_catalog.left(pg_catalog.btrim(COALESCE(p_empresa->>'razaoSocial','')),160);
 v_cidade:=pg_catalog.left(pg_catalog.btrim(COALESCE(p_empresa->>'cidade','')),120);
 v_uf:=pg_catalog.upper(pg_catalog.left(pg_catalog.btrim(COALESCE(p_empresa->>'uf','')),2));
 v_segmento:=pg_catalog.left(pg_catalog.btrim(COALESCE(p_empresa->>'segmento','')),120);
 v_site:=pg_catalog.left(pg_catalog.btrim(COALESCE(p_empresa->>'site','')),200);
 IF v_nome='' OR v_cidade='' OR v_uf !~ '^[A-Z]{2}$' OR v_segmento='' THEN
  RETURN pg_catalog.jsonb_build_object('status','review_required');
 END IF;
 IF pg_catalog.jsonb_typeof(p_empresa->'fontes') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_empresa->'fontes')=0 THEN
  RETURN pg_catalog.jsonb_build_object('status','source_required');
 END IF;
 SELECT pg_catalog.left(pg_catalog.btrim(x->>'url'),400) INTO v_source
 FROM pg_catalog.jsonb_array_elements(p_empresa->'fontes') x
 WHERE (x->>'url') ~ '^https://[^[:space:]]+$' LIMIT 1;
 IF v_source IS NULL THEN RETURN pg_catalog.jsonb_build_object('status','source_required'); END IF;

 -- All concurrent imports for the same company and tenant serialize.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text||':'||v_cnpj,577));
 SELECT r.cnpj,r.account_id,r.opportunity_id INTO v_replay
 FROM iad_private.market_import_receipts r
 WHERE r.tenant_id=v_tenant AND r.user_id=v_user AND r.request_id=p_request_id;
 IF FOUND THEN
  IF v_replay.cnpj<>v_cnpj THEN
   RETURN pg_catalog.jsonb_build_object('status','request_id_reused');
  END IF;
  RETURN pg_catalog.jsonb_build_object('status','already_imported','accountId',v_replay.account_id,'opportunityId',v_replay.opportunity_id);
 END IF;

 -- Do not create a second company when existing identity, root or name is ambiguous.
 SELECT c.id INTO v_existing FROM public.contas c
 WHERE c.tenant_id=v_tenant AND
 pg_catalog.upper(pg_catalog.regexp_replace(COALESCE(c.cnpj,''),'[^0-9A-Za-z]','','g'))=v_cnpj
 LIMIT 1;
 IF v_existing IS NOT NULL THEN
  RETURN pg_catalog.jsonb_build_object('status','existing','accountId',v_existing);
 END IF;
 SELECT c.id INTO v_existing FROM public.contas c
 WHERE c.tenant_id=v_tenant AND (
  pg_catalog.left(pg_catalog.upper(pg_catalog.regexp_replace(COALESCE(c.cnpj,''),'[^0-9A-Za-z]','','g')),8)=pg_catalog.left(v_cnpj,8)
  OR (pg_catalog.lower(pg_catalog.btrim(c.nome))=pg_catalog.lower(v_nome) AND pg_catalog.lower(pg_catalog.btrim(c.cidade))=pg_catalog.lower(v_cidade))
 ) LIMIT 1;
 IF v_existing IS NOT NULL THEN
  RETURN pg_catalog.jsonb_build_object('status','review_duplicate','accountId',v_existing);
 END IF;

 v_account := 'ri-m01-'||pg_catalog.gen_random_uuid()::text;
 v_opportunity := 'ri-m01-'||pg_catalog.gen_random_uuid()::text;
 INSERT INTO public.contas(id,tenant_id,dono_id,nome,razao_social,cnpj,segmento,porte,cidade,uf,site,telefone,descricao,relacao_atual)
 VALUES(v_account,v_tenant,v_user,v_nome,v_razao,v_cnpj,v_segmento,
 pg_catalog.left(COALESCE(p_empresa->>'porte',''),70),v_cidade,v_uf,v_site,
 pg_catalog.left(COALESCE(p_empresa->>'telefone',''),50),
 'Importação manual RI-M01; fonte citada: '||v_source,'Prospect');

 INSERT INTO public.oportunidades(id,tenant_id,dono_id,conta_id,titulo,etapa,origem,notas)
 VALUES(v_opportunity,v_tenant,v_user,v_account,'Prospecção — '||v_nome,
 'Prospecção','Inteligência de Mercado',
 'Revisão e confirmação humana na importação RI-M01. Fonte citada: '||v_source);
 INSERT INTO iad_private.market_import_receipts(tenant_id,user_id,request_id,cnpj,account_id,opportunity_id)
 VALUES(v_tenant,v_user,p_request_id,v_cnpj,v_account,v_opportunity);
 RETURN pg_catalog.jsonb_build_object('status','imported','accountId',v_account,'opportunityId',v_opportunity);
END;
$func$;

REVOKE ALL ON FUNCTION public.iad_market_import_confirmed(jsonb,uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iad_market_import_confirmed(jsonb,uuid,uuid,boolean) TO authenticated;
