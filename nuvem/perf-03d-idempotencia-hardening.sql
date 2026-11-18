-- PERF-03D receipts hardening: clients may not create synthetic ACKs.
BEGIN;
REVOKE INSERT,UPDATE,DELETE ON public.iad_cas_receipts FROM authenticated,anon,PUBLIC;
DROP POLICY IF EXISTS iad_cas_receipts_owner_insert ON public.iad_cas_receipts;
CREATE OR REPLACE FUNCTION public.iad_oportunidade_cas_idempotente(
 p_id text,p_tenant_id uuid,p_revisao bigint,p_patch jsonb,p_operation_id text
) RETURNS TABLE(estado text,revisao_atual bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE achado public.iad_cas_receipts%ROWTYPE; h text; resultado record;
BEGIN
 IF auth.uid() IS NULL OR p_tenant_id IS NULL OR p_id IS NULL OR p_revisao IS NULL
 OR p_revisao<0 OR p_operation_id IS NULL OR length(p_operation_id)<8 OR length(p_operation_id)>180
 OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Argumentos CAS inválidos' USING ERRCODE='22023';
 END IF;
 -- SECURITY DEFINER bypasses RLS: explicitly enforce the same opportunity policy.
 IF NOT EXISTS (
   SELECT 1 FROM public.oportunidades o WHERE o.id=p_id AND o.tenant_id=p_tenant_id
   AND (public.sou_admin() OR
      (o.tenant_id=public.meu_tenant() AND
        (public.sou_gestor() OR o.dono_id=auth.uid() OR o.dono_id IS NULL)))
 ) THEN RETURN QUERY SELECT 'conflito_ou_inacessivel'::text,NULL::bigint; RETURN; END IF;
 h:=md5(jsonb_build_object('id',p_id,'tenant',p_tenant_id,'rev',p_revisao,'patch',p_patch)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'|'||p_tenant_id::text||'|'||p_operation_id,0));
 SELECT * INTO achado FROM public.iad_cas_receipts
 WHERE usuario_id=auth.uid() AND tenant_id=p_tenant_id AND operation_id=p_operation_id;
 IF FOUND THEN
  IF achado.request_hash<>h OR achado.record_id<>p_id THEN
   RAISE EXCEPTION 'Idempotency key changed payload' USING ERRCODE='23505';
  END IF;
  RETURN QUERY SELECT 'ok'::text,achado.revisao_atual; RETURN;
 END IF;
 SELECT * INTO resultado FROM public.iad_oportunidade_cas(p_id,p_tenant_id,p_revisao,p_patch);
 IF resultado.estado<>'ok' THEN RETURN QUERY SELECT resultado.estado::text,NULL::bigint; RETURN; END IF;
 INSERT INTO public.iad_cas_receipts(usuario_id,tenant_id,operation_id,request_hash,record_id,revisao_atual)
 VALUES(auth.uid(),p_tenant_id,p_operation_id,h,p_id,resultado.revisao_atual);
 RETURN QUERY SELECT 'ok'::text,resultado.revisao_atual::bigint;
END;$$;
REVOKE ALL ON FUNCTION public.iad_oportunidade_cas_idempotente(text,uuid,bigint,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iad_oportunidade_cas_idempotente(text,uuid,bigint,jsonb,text) TO authenticated;
COMMIT;