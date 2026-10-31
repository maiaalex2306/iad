-- PERF-03D v273: CAS incremental para oportunidades.
-- Preparado para homologação. NÃO aplicar na produção antes da integração cliente.
BEGIN;
ALTER TABLE public.oportunidades ADD COLUMN IF NOT EXISTS revisao bigint NOT NULL DEFAULT 0;
ALTER TABLE public.oportunidades
  DROP CONSTRAINT IF EXISTS oportunidades_revisao_valida;
ALTER TABLE public.oportunidades
  ADD CONSTRAINT oportunidades_revisao_valida CHECK (revisao >= 0);

CREATE OR REPLACE FUNCTION public.iad_oportunidade_revisar()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public,pg_temp AS $$
BEGIN
  IF NEW.revisao IS DISTINCT FROM OLD.revisao THEN
    RAISE EXCEPTION 'Revisão é controlada pelo servidor' USING ERRCODE='23514';
  END IF;
  IF (to_jsonb(NEW) - 'atualizado_em' - 'revisao')
     IS DISTINCT FROM (to_jsonb(OLD) - 'atualizado_em' - 'revisao') THEN
    NEW.revisao := OLD.revisao + 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.iad_oportunidade_revisar() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS iad_oportunidade_revision_guard ON public.oportunidades;
CREATE TRIGGER iad_oportunidade_revision_guard
 BEFORE UPDATE ON public.oportunidades
 FOR EACH ROW EXECUTE FUNCTION public.iad_oportunidade_revisar();

-- Invoker preserva RLS da oportunidade. Retorna conflito sem mutação.
-- Escopo inicial limitado a três campos comerciais, sem JSON arbitrário.
CREATE OR REPLACE FUNCTION public.iad_oportunidade_cas(
 p_id text, p_tenant_id uuid, p_revisao bigint, p_patch jsonb
) RETURNS TABLE(estado text, revisao_atual bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public,pg_temp AS $$
DECLARE r bigint;
BEGIN
  IF auth.uid() IS NULL OR p_id IS NULL OR p_tenant_id IS NULL
     OR p_revisao IS NULL OR p_revisao < 0
     OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
     OR p_patch = '{}'::jsonb
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_patch) AS k
       WHERE k NOT IN ('titulo','valor','etapa')
     ) THEN
    RAISE EXCEPTION 'Argumentos CAS inválidos' USING ERRCODE='22023';
  END IF;
  UPDATE public.oportunidades AS o
     SET titulo = CASE WHEN p_patch ? 'titulo' THEN p_patch->>'titulo' ELSE o.titulo END,
         valor = CASE WHEN p_patch ? 'valor' THEN (p_patch->>'valor')::numeric ELSE o.valor END,
         etapa = CASE WHEN p_patch ? 'etapa' THEN p_patch->>'etapa' ELSE o.etapa END,
         atualizado_em = now()
   WHERE o.id = p_id AND o.tenant_id = p_tenant_id AND o.revisao = p_revisao
   RETURNING o.revisao INTO r;
  IF FOUND THEN
    RETURN QUERY SELECT 'ok'::text, r;
  ELSE
    -- Não expõe versão/identidade de registros negados por RLS.
    RETURN QUERY SELECT 'conflito_ou_inacessivel'::text, NULL::bigint;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.iad_oportunidade_cas(text,uuid,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iad_oportunidade_cas(text,uuid,bigint,jsonb) TO authenticated;
COMMIT;
