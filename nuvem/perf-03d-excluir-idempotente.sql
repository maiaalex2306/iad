-- PERF-03D: delete receipts prevent stale deletes from being retried forever after lost ACK.
-- A receipt is created in the SAME transaction as the delete, never by clients.
BEGIN;
CREATE OR REPLACE FUNCTION public.iad_oportunidade_excluir_cas_idempotente(
 p_id text, p_tenant_id uuid, p_revisao bigint, p_operation_id text
) RETURNS TABLE(estado text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h text; prev public.iad_cas_receipts%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR p_id IS NULL OR p_tenant_id IS NULL
 OR p_revisao IS NULL OR p_revisao < 0 OR p_operation_id IS NULL
 OR length(p_operation_id)<8 OR length(p_operation_id)>180 THEN
   RAISE EXCEPTION 'Invalid CAS delete arguments' USING ERRCODE='22023';
 END IF;
 h:=md5(jsonb_build_object('type','delete','id',p_id,'tenant',p_tenant_id,'rev',p_revisao)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'|'||p_tenant_id::text||'|'||p_operation_id,0));
 SELECT * INTO prev FROM public.iad_cas_receipts
 WHERE usuario_id=auth.uid() AND tenant_id=p_tenant_id AND operation_id=p_operation_id;
 IF FOUND THEN
   IF prev.request_hash<>h OR prev.record_id<>p_id THEN
      RAISE EXCEPTION 'CAS operation reused with different delete payload' USING ERRCODE='23505';
   END IF;
   RETURN QUERY SELECT 'ok'::text;
   RETURN;
 END IF;
 DELETE FROM public.oportunidades o
 WHERE o.id=p_id AND o.tenant_id=p_tenant_id AND o.revisao=p_revisao
 AND (public.sou_admin() OR (o.tenant_id=public.meu_tenant()
       AND (public.sou_gestor() OR o.dono_id=auth.uid() OR o.dono_id IS NULL)));
 IF NOT FOUND THEN
   RETURN QUERY SELECT 'conflito_ou_inacessivel'::text;
   RETURN;
 END IF;
 INSERT INTO public.iad_cas_receipts(usuario_id,tenant_id,operation_id,request_hash,record_id,revisao_atual)
 VALUES(auth.uid(),p_tenant_id,p_operation_id,h,p_id,p_revisao);
 RETURN QUERY SELECT 'ok'::text;
END $$;
REVOKE ALL ON FUNCTION public.iad_oportunidade_excluir_cas_idempotente(text,uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iad_oportunidade_excluir_cas_idempotente(text,uuid,bigint,text) TO authenticated;
COMMIT;