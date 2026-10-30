-- PERF-03D: receipts atomically coupled to CAS; scoped to authenticated user.
BEGIN;
CREATE TABLE IF NOT EXISTS public.iad_cas_receipts (
 usuario_id uuid NOT NULL,
 tenant_id uuid NOT NULL,
 operation_id text NOT NULL,
 request_hash text NOT NULL,
 record_id text NOT NULL,
 revisao_atual bigint NOT NULL,
 criado_em timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(usuario_id,tenant_id,operation_id)
);
ALTER TABLE public.iad_cas_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.iad_cas_receipts FROM anon,PUBLIC;
GRANT SELECT,INSERT ON public.iad_cas_receipts TO authenticated;
DROP POLICY IF EXISTS iad_cas_receipts_owner_select ON public.iad_cas_receipts;
CREATE POLICY iad_cas_receipts_owner_select ON public.iad_cas_receipts FOR SELECT TO authenticated USING(usuario_id=auth.uid());
DROP POLICY IF EXISTS iad_cas_receipts_owner_insert ON public.iad_cas_receipts;
CREATE POLICY iad_cas_receipts_owner_insert ON public.iad_cas_receipts FOR INSERT TO authenticated WITH CHECK(usuario_id=auth.uid());
CREATE OR REPLACE FUNCTION public.iad_oportunidade_cas_idempotente(
 p_id text,p_tenant_id uuid,p_revisao bigint,p_patch jsonb,p_operation_id text
) RETURNS TABLE(estado text,revisao_atual bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE achado public.iad_cas_receipts%ROWTYPE; h text; resultado record;
BEGIN
 IF auth.uid() IS NULL OR p_operation_id IS NULL OR length(p_operation_id)<8 OR length(p_operation_id)>180
 THEN RAISE EXCEPTION 'Identidade/operacao inválida' USING ERRCODE='22023'; END IF;
 h:=md5(jsonb_build_object('id',p_id,'tenant',p_tenant_id,'rev',p_revisao,'patch',p_patch)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text || '|' || p_tenant_id::text || '|' || p_operation_id,0));
 SELECT * INTO achado FROM public.iad_cas_receipts
  WHERE usuario_id=auth.uid() AND tenant_id=p_tenant_id AND operation_id=p_operation_id;
 IF FOUND THEN
  IF achado.request_hash<>h OR achado.record_id<>p_id
  THEN RAISE EXCEPTION 'Reutilização de ID de operação com payload diferente' USING ERRCODE='23505'; END IF;
  RETURN QUERY SELECT 'ok'::text,achado.revisao_atual; RETURN;
 END IF;
 SELECT * INTO resultado FROM public.iad_oportunidade_cas(p_id,p_tenant_id,p_revisao,p_patch);
 IF resultado.estado<>'ok' THEN
  RETURN QUERY SELECT resultado.estado::text,NULL::bigint; RETURN;
 END IF;
 INSERT INTO public.iad_cas_receipts(usuario_id,tenant_id,operation_id,request_hash,record_id,revisao_atual)
 VALUES(auth.uid(),p_tenant_id,p_operation_id,h,p_id,resultado.revisao_atual);
 RETURN QUERY SELECT 'ok'::text,resultado.revisao_atual::bigint;
END;$$;
REVOKE ALL ON FUNCTION public.iad_oportunidade_cas_idempotente(text,uuid,bigint,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iad_oportunidade_cas_idempotente(text,uuid,bigint,jsonb,text) TO authenticated;
COMMIT;