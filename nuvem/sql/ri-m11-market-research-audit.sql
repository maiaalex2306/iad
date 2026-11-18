-- RI-M11: diário por pesquisa, sem conteúdo de prospects, fontes ou pessoas.
-- RLS + privilégios restritos: somente o serviço interno pode ler/escrever.
CREATE TABLE IF NOT EXISTS public.iad_market_research_runs (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 tenant_id uuid NOT NULL,
 user_id uuid NOT NULL,
 action text NOT NULL CHECK (action IN ('search','investigate','signals','enrich')),
 provider_requested text NOT NULL CHECK (provider_requested IN ('OpenAI','Anthropic','both')),
 status text NOT NULL DEFAULT 'started'
  CHECK (status IN ('started','completed','partial','failed')),
 started_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 finished_at timestamptz,
 completed_providers integer NOT NULL DEFAULT 0 CHECK (completed_providers BETWEEN 0 AND 2),
 failed_providers integer NOT NULL DEFAULT 0 CHECK (failed_providers BETWEEN 0 AND 2),
 web_searches integer NOT NULL DEFAULT 0 CHECK (web_searches BETWEEN 0 AND 20),
 cited_sources integer NOT NULL DEFAULT 0 CHECK (cited_sources BETWEEN 0 AND 100),
 records_returned integer NOT NULL DEFAULT 0 CHECK (records_returned BETWEEN 0 AND 50),
 input_tokens integer CHECK (input_tokens BETWEEN 0 AND 1000000),
 output_tokens integer CHECK (output_tokens BETWEEN 0 AND 1000000),
 failure_category text CHECK (failure_category IS NULL OR failure_category IN
  ('ALL_PROVIDERS_FAILED','PARTIAL_PROVIDER_FAILURE','SERVER_OR_NETWORK_ERROR')),
 CONSTRAINT iad_market_research_finished_state CHECK (
  (status='started' AND finished_at IS NULL) OR
  (status<>'started' AND finished_at IS NOT NULL)
 )
);
CREATE INDEX IF NOT EXISTS iad_market_research_runs_tenant_time
 ON public.iad_market_research_runs(tenant_id,started_at DESC);
CREATE INDEX IF NOT EXISTS iad_market_research_runs_user_time
 ON public.iad_market_research_runs(user_id,started_at DESC);
ALTER TABLE public.iad_market_research_runs ENABLE ROW LEVEL SECURITY;
-- No public/anon/authenticated policy. Even in public schema, direct client
-- reads and writes are denied; service_role is server-only and bypasses RLS.
REVOKE ALL ON public.iad_market_research_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.iad_market_research_runs TO service_role;
COMMENT ON TABLE public.iad_market_research_runs IS
 'Metadados agregados de pesquisas externas IA; nenhum nome, URL, prompt ou conteúdo de contato.';
