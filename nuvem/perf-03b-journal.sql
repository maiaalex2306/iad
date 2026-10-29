-- IaD CRM PERF-03B: journal transacional de alterações por EMPRESA.
-- Aplicar SOMENTE em Supabase isolado durante homologação.
-- Sem aplicação automática à produção e sem alteração de tabelas de negócio.
-- Uma linha de versão por tenant garante ordenação de COMMIT dentro da
-- empresa: transações concorrentes disputam update da mesma linha e só
-- publicam versões em sequência após finalizar a anterior.
BEGIN;

CREATE TABLE IF NOT EXISTS public.iad_sync_versoes (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  versao bigint NOT NULL DEFAULT 0 CHECK (versao >= 0)
);
CREATE TABLE IF NOT EXISTS public.iad_sync_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  versao bigint NOT NULL,
  tabela text NOT NULL CHECK (tabela IN (
    'contas','contatos','oportunidades','tarefas','produtos',
    'segmentos','tipos_tarefa','fontes'
  )),
  registro_id text NOT NULL,
  operacao text NOT NULL CHECK (operacao IN ('I','U','D')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,versao)
);
CREATE INDEX IF NOT EXISTS idx_iad_sync_eventos_tenant_versao
  ON public.iad_sync_eventos (tenant_id,versao);

ALTER TABLE public.iad_sync_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iad_sync_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iad_sync_versoes_leitura ON public.iad_sync_versoes;
CREATE POLICY iad_sync_versoes_leitura ON public.iad_sync_versoes FOR SELECT TO authenticated
  USING (public.sou_admin() OR (tenant_id = public.meu_tenant() AND public.sou_gestor()));
DROP POLICY IF EXISTS iad_sync_eventos_leitura ON public.iad_sync_eventos;
CREATE POLICY iad_sync_eventos_leitura ON public.iad_sync_eventos FOR SELECT TO authenticated
  USING (public.sou_admin() OR (tenant_id = public.meu_tenant() AND public.sou_gestor()));

REVOKE ALL ON public.iad_sync_versoes FROM anon;
REVOKE ALL ON public.iad_sync_eventos FROM anon;
REVOKE ALL ON public.iad_sync_versoes FROM authenticated;
REVOKE ALL ON public.iad_sync_eventos FROM authenticated;
GRANT SELECT ON public.iad_sync_versoes TO authenticated;
GRANT SELECT ON public.iad_sync_eventos TO authenticated;

CREATE OR REPLACE FUNCTION public.iad_sync_registrar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE
  _tenant uuid;
  _nova_versao bigint;
  _id text;
  _operacao text;
BEGIN
  /* Um UPSERT pode atualizar só a marca de transporte (atualizado_em).
     Não gerar evento comercial se nenhum campo de negócio mudou. */
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - 'atualizado_em') IS NOT DISTINCT FROM
    (to_jsonb(OLD) - 'atualizado_em') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Não é permitido mudar tenant_id da entidade em UPDATE';
  END IF;
  _tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  _id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  _operacao := CASE TG_OP WHEN 'INSERT' THEN 'I' WHEN 'UPDATE' THEN 'U' ELSE 'D' END;
  INSERT INTO public.iad_sync_versoes AS v (tenant_id,versao)
    VALUES (_tenant,1)
    ON CONFLICT (tenant_id) DO UPDATE SET versao=v.versao+1
    RETURNING versao INTO _nova_versao;
  INSERT INTO public.iad_sync_eventos(tenant_id,versao,tabela,registro_id,operacao)
    VALUES(_tenant,_nova_versao,TG_TABLE_NAME,_id,_operacao);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.iad_sync_registrar() FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contas','contatos','oportunidades','tarefas',
    'produtos','segmentos','tipos_tarefa','fontes'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS iad_sync_evento ON public.%I',t);
    EXECUTE format('CREATE TRIGGER iad_sync_evento AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.iad_sync_registrar()',t);
  END LOOP;
END $$;
COMMIT;
