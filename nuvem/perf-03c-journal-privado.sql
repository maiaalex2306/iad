-- PERF-03C v272 — feed PRIVADO por responsável, complementar ao PERF-03B.
-- Nunca executar em produção automaticamente. Homologar em Supabase isolado.
-- O feed público PERF-03B permanece restrito a gestor/admin: vendedores NÃO
-- recebem seu cursor global, contagem de eventos ou IDs de outros usuários.
BEGIN;

CREATE TABLE IF NOT EXISTS public.iad_sync_usuario_versoes (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  versao bigint NOT NULL DEFAULT 0 CHECK (versao >= 0),
  PRIMARY KEY (tenant_id, usuario_id)
);
CREATE TABLE IF NOT EXISTS public.iad_sync_usuario_eventos (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  versao bigint NOT NULL,
  tabela text NOT NULL CHECK (tabela IN (
    'contas','contatos','oportunidades','tarefas','produtos',
    'segmentos','tipos_tarefa','fontes'
  )),
  registro_id text NOT NULL,
  operacao char(1) NOT NULL CHECK (operacao IN ('I','U','D')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,usuario_id,versao)
);
CREATE INDEX IF NOT EXISTS idx_iad_sync_usuario_eventos_data
  ON public.iad_sync_usuario_eventos(tenant_id,usuario_id,criado_em);

ALTER TABLE public.iad_sync_usuario_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iad_sync_usuario_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iad_sync_usuario_versoes_ler ON public.iad_sync_usuario_versoes;
CREATE POLICY iad_sync_usuario_versoes_ler ON public.iad_sync_usuario_versoes
  FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid())
         AND tenant_id = (SELECT public.meu_tenant())
         AND NOT (SELECT public.sou_gestor()));
DROP POLICY IF EXISTS iad_sync_usuario_eventos_ler ON public.iad_sync_usuario_eventos;
CREATE POLICY iad_sync_usuario_eventos_ler ON public.iad_sync_usuario_eventos
  FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid())
         AND tenant_id = (SELECT public.meu_tenant())
         AND NOT (SELECT public.sou_gestor()));

REVOKE ALL ON public.iad_sync_usuario_versoes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.iad_sync_usuario_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.iad_sync_usuario_versoes TO authenticated;
GRANT SELECT ON public.iad_sync_usuario_eventos TO authenticated;

-- SECURITY DEFINER é necessário para emitir eventos na mesma transação
-- de escrita autorizada pelo RLS da tabela comercial. Sem EXECUTE a usuários.
CREATE OR REPLACE FUNCTION public.iad_sync_registrar_usuario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  _tenant uuid;
  _uid uuid;
  _old_dono uuid;
  _new_dono uuid;
  _era_visivel boolean;
  _agora_visivel boolean;
  _op char(1);
  _id text;
  _versao bigint;
  _compartilhado boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Não é permitido mudar tenant_id';
  END IF;
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(OLD) - 'atualizado_em') IS NOT DISTINCT FROM
    (to_jsonb(NEW) - 'atualizado_em') THEN
    RETURN NEW;
  END IF;

  _tenant := CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  _id := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  _compartilhado := TG_TABLE_NAME IN ('produtos','segmentos','tipos_tarefa','fontes');
  IF NOT _compartilhado THEN
    IF TG_OP <> 'INSERT' THEN
      _old_dono := nullif(to_jsonb(OLD)->>'dono_id','')::uuid;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      _new_dono := nullif(to_jsonb(NEW)->>'dono_id','')::uuid;
    END IF;
  END IF;

  -- Apenas vendedores: gestores/admin usam o journal PERF-03B por tenant.
  -- Cada vendedor recebe numeração própria, SEM LACUNAS observáveis para
  -- inferir alterações de colegas. Para dono nulo, RLS permite acesso a todos
  -- os usuários do tenant; a fan-out replica somente este evento autorizado.
  FOR _uid IN SELECT p.id FROM public.perfis AS p
      WHERE p.tenant_id = _tenant AND p.papel = 'usuario' LOOP
    _era_visivel := TG_OP <> 'INSERT' AND
      (_compartilhado OR _old_dono IS NULL OR _old_dono=_uid);
    _agora_visivel := TG_OP <> 'DELETE' AND
      (_compartilhado OR _new_dono IS NULL OR _new_dono=_uid);
    IF NOT _era_visivel AND NOT _agora_visivel THEN CONTINUE; END IF;
    IF _era_visivel AND NOT _agora_visivel THEN _op:='D';
    ELSIF NOT _era_visivel AND _agora_visivel THEN _op:='I';
    ELSE _op:='U'; END IF;

    INSERT INTO public.iad_sync_usuario_versoes AS v(tenant_id,usuario_id,versao)
      VALUES (_tenant,_uid,1)
      ON CONFLICT (tenant_id,usuario_id) DO UPDATE SET versao=v.versao+1
      RETURNING versao INTO _versao;
    INSERT INTO public.iad_sync_usuario_eventos
      (tenant_id,usuario_id,versao,tabela,registro_id,operacao)
      VALUES (_tenant,_uid,_versao,TG_TABLE_NAME,_id,_op);
  END LOOP;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.iad_sync_registrar_usuario() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'contas','contatos','oportunidades','tarefas',
    'produtos','segmentos','tipos_tarefa','fontes'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS iad_sync_usuario_evento ON public.%I',tab);
    EXECUTE format('CREATE TRIGGER iad_sync_usuario_evento AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.iad_sync_registrar_usuario()',tab);
  END LOOP;
END $$;

COMMIT;
