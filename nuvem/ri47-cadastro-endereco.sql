-- RI-47 / v286.108 - evolução ADITIVA do cadastro empresarial.
-- Zero UPDATE/DELETE/DROP. Mantém IDs, CNPJ existentes, histórico e RLS.
-- Aplicar e verificar no Supabase homolog antes do mesmo script em produção.
ALTER TABLE public.contas
  ADD COLUMN IF NOT EXISTS cep text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS logradouro text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS numero text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS complemento text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bairro text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS codigo_ibge text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fontes_cadastro jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.contas.fontes_cadastro IS
  'Origem por campo do cadastro empresarial; não substitui evidência oficial nem revisão humana';
