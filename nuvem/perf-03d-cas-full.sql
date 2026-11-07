-- PERF-03D: patch CAS de todas as colunas comerciais e exclusão com revisão.
-- Somente homologação; SECURITY INVOKER mantém as políticas RLS.
BEGIN;
CREATE OR REPLACE FUNCTION public.iad_oportunidade_cas(
 p_id text,p_tenant_id uuid,p_revisao bigint,p_patch jsonb
) RETURNS TABLE(estado text,revisao_atual bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  atual public.oportunidades%ROWTYPE;
  proposta public.oportunidades%ROWTYPE;
  r bigint;
  proibidas text[] := ARRAY['id','tenant_id','dono_id','revisao','criado_em','atualizado_em'];
BEGIN
 IF auth.uid() IS NULL OR p_id IS NULL OR p_tenant_id IS NULL
   OR p_revisao IS NULL OR p_revisao < 0
   OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
   OR p_patch = '{}'::jsonb
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k
       WHERE k=ANY(proibidas) OR NOT EXISTS(
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name='oportunidades' AND c.column_name=k
       ))
 THEN RAISE EXCEPTION 'Patch CAS inválido' USING ERRCODE='22023'; END IF;
 SELECT * INTO atual FROM public.oportunidades
 WHERE id=p_id AND tenant_id=p_tenant_id AND revisao=p_revisao FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'conflito_ou_inacessivel'::text,NULL::bigint; RETURN; END IF;
 SELECT * INTO proposta FROM jsonb_populate_record(atual,p_patch);
 UPDATE public.oportunidades o SET
  (conta_id,titulo,valor,etapa,etapa_desde,tipo,concorrentes,produto,fechamento_previsto,
  adiamentos,gate_liberado_por,notas,dims,stakeholders,eventos,snapshots,itens,
  insight,proximo_compromisso,desfecho,dono,origem,campanha,sdr,sdr_email,
  nutricao,fonte_id,prazo_contrato_meses,valor_mensal,historico_nutricao,orientacao,quadro)
  = (proposta.conta_id,proposta.titulo,proposta.valor,proposta.etapa,proposta.etapa_desde,
  proposta.tipo,proposta.concorrentes,proposta.produto,proposta.fechamento_previsto,
  proposta.adiamentos,proposta.gate_liberado_por,proposta.notas,proposta.dims,
  proposta.stakeholders,proposta.eventos,proposta.snapshots,proposta.itens,
  proposta.insight,proposta.proximo_compromisso,proposta.desfecho,proposta.dono,
  proposta.origem,proposta.campanha,proposta.sdr,proposta.sdr_email,
  proposta.nutricao,proposta.fonte_id,proposta.prazo_contrato_meses,proposta.valor_mensal,
  proposta.historico_nutricao,proposta.orientacao,proposta.quadro),
 atualizado_em=now()
 WHERE o.id=p_id AND o.tenant_id=p_tenant_id AND o.revisao=p_revisao
 RETURNING o.revisao INTO r;
 RETURN QUERY SELECT 'ok'::text,r;
END; $$;
REVOKE ALL ON FUNCTION public.iad_oportunidade_cas(text,uuid,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iad_oportunidade_cas(text,uuid,bigint,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.iad_oportunidade_excluir_cas(
 p_id text,p_tenant_id uuid,p_revisao bigint
) RETURNS TABLE(estado text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_revisao IS NULL OR p_revisao < 0 OR p_id IS NULL OR p_tenant_id IS NULL
 THEN RAISE EXCEPTION 'Parâmetros inválidos' USING ERRCODE='22023'; END IF;
 DELETE FROM public.oportunidades
 WHERE id=p_id AND tenant_id=p_tenant_id AND revisao=p_revisao;
 IF FOUND THEN RETURN QUERY SELECT 'ok'::text;
 ELSE RETURN QUERY SELECT 'conflito_ou_inacessivel'::text; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.iad_oportunidade_excluir_cas(text,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iad_oportunidade_excluir_cas(text,uuid,bigint) TO authenticated;
COMMIT;