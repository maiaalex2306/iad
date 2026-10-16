-- IAD CRM — correção 21: cada pessoa guarda a própria senha de caixa
-- ==================================================================
-- POR QUE ESTE ARQUIVO EXISTE
--
-- Do jeito que estava, a senha de aplicativo de cada vendedor morava num
-- segredo da Edge Function (`EMAIL_SENHAS`), editado no painel do Supabase.
-- Isso funciona para uma pessoa e falha para todas as outras, por um motivo
-- que não é técnico:
--
--   a Rosa teria de MANDAR a senha dela para quem administra o painel.
--
-- E aí a senha viaja por WhatsApp, e-mail ou recado — que é exatamente o que
-- uma senha de aplicativo existe para evitar. A credencial de cada um tem de
-- sair do computador dele e ir direto para o servidor, sem passar por pessoa
-- nenhuma no meio.
--
-- Esta tabela é esse caminho. A senha chega à Edge Function numa única
-- chamada, é CIFRADA lá dentro (AES-GCM, com a chave-mestra que só o servidor
-- tem) e o que fica guardado é o texto cifrado. Quem despejasse a tabela
-- inteira levaria embora uma fileira de bytes sem uso.
--
-- COMO RODAR
--   Supabase → SQL Editor → cole → Run. Depois das correções 18, 19 e 20.
--   Repetível.

-- ------------------------------------------------------------------
-- 1. UMA TABELA SÓ PARA O SEGREDO
--
-- Separada de `caixas_email` de propósito. Se a senha cifrada morasse numa
-- coluna da caixa, o app — que lê a caixa com `select=*` — passaria a receber
-- esses bytes em toda tela, e proteger a coluna exigiria fatiar permissão por
-- coluna: quem esquecesse de liberar uma coluna nova depois quebraria a
-- leitura inteira sem entender por quê.
--
-- Em tabela própria a regra é uma linha só, e ela não tem exceção.
-- ------------------------------------------------------------------
create table if not exists public.segredos_email (
  caixa_id      uuid primary key references public.caixas_email(id) on delete cascade,
  senha_cifrada text not null,
  atualizado_em timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- 2. NINGUÉM LÊ ISTO PELO NAVEGADOR
--
-- RLS ligada e NENHUMA política: quem passa pela RLS não lê nem escreve nada.
-- Não é esquecimento — é a regra. A Edge Function usa a chave `service_role`,
-- que não passa pela RLS, e é a única coisa no sistema que precisa ler aqui.
--
-- O `revoke` é a segunda tranca: no Supabase, tabela nova nasce com permissão
-- para `authenticated` por padrão, e RLS sozinha protegeria a linha mas não a
-- existência. Duas trancas porque a primeira que falha não pode ser a última.
-- ------------------------------------------------------------------
alter table public.segredos_email enable row level security;

revoke all on public.segredos_email from authenticated, anon;

-- ------------------------------------------------------------------
-- 3. A MARCA DE "TEM SENHA", ESSA SIM VISÍVEL
--
-- A tela precisa dizer "senha guardada em 19/09" ou "falta a senha". Isso é
-- uma data, não uma credencial — e sem ela a pessoa não tem como saber se
-- terminou de configurar.
-- ------------------------------------------------------------------
alter table public.caixas_email add column if not exists senha_em timestamptz;

comment on column public.caixas_email.senha_em is
  'Quando a senha de aplicativo foi guardada. A senha em si mora, cifrada, em segredos_email.';

-- ------------------------------------------------------------------
-- 4. CONFERÊNCIA
--
-- Deve devolver: 20 colunas em caixas_email, a tabela do segredo com RLS
-- ligada, ZERO políticas nela, e `nao` na última coluna.
-- ------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'caixas_email')      as colunas_caixas,
  (select count(*) from pg_tables
     where schemaname = 'public' and tablename = 'segredos_email')       as tabela_do_segredo,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'segredos_email')       as politicas_no_segredo,
  case when has_table_privilege('authenticated', 'public.segredos_email', 'SELECT')
       then 'SIM — ALGO ERRADO' else 'nao' end                           as navegador_le_a_senha;
