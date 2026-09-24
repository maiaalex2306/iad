-- IAD CRM — correção 18: os e-mails da negociação
-- ==================================================================
-- POR QUE ESTE ARQUIVO EXISTE
--
-- A conversa por e-mail é onde a venda B2B acontece de verdade, e ela morre
-- na caixa de entrada de uma pessoa. O que o cliente escreveu — a única coisa
-- que move as oito decisões — fica no Gmail do vendedor, invisível para o
-- gestor, perdido quando ele sai da empresa, e ausente de qualquer leitura da
-- carteira.
--
-- Esta tabela é onde essas mensagens passam a morar. Mesmo desenho da
-- `mensagens_whatsapp`, e pelo mesmo motivo: e-mail é conversa, e conversa não
-- cabe no estado que o navegador carrega inteiro. Ela vive no servidor, o app
-- lê o que precisa, e o casamento com contato e negociação é feito na hora.
--
-- COMO RODAR
--   Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
--
-- Ele não apaga nada e pode ser repetido.

-- ------------------------------------------------------------------
-- 1. A TABELA
-- ------------------------------------------------------------------
create table if not exists public.emails (
  -- O Message-ID do próprio e-mail. Chave primária de propósito: é a única
  -- marca que atravessa servidores, e é ela que impede a mesma mensagem de
  -- entrar duas vezes quando a leitura da caixa roda de novo.
  id              text primary key,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,

  -- De quem é a caixa de onde esta mensagem veio. Duas pessoas da mesma
  -- empresa podem ter a mesma mensagem (uma em cópia da outra), e sem isto
  -- não se sabe qual caixa trouxe o quê.
  dono_id         uuid references auth.users(id) on delete set null,
  caixa           text not null default '',

  direcao         text not null default 'entrada'
                  check (direcao in ('entrada', 'saida')),

  -- O cabeçalho, como veio. `de` e `para` guardam o endereço limpo, em
  -- minúsculas, porque é por ele que o casamento acontece; `de_nome` guarda o
  -- que aparece na tela.
  de              text not null default '',
  de_nome         text not null default '',
  para            text not null default '',
  copia           text not null default '',
  assunto         text not null default '',

  -- O corpo em texto puro. HTML não entra: o que a IA lê e o que a tela mostra
  -- é texto, e guardar HTML de e-mail é guardar folha de estilo de 1998 e
  -- rastreador de terceiro junto.
  corpo           text not null default '',

  -- A conversa. `thread` é o que amarra a resposta ao original — vem do
  -- References/In-Reply-To —, e é o que faz a resposta cair na negociação
  -- certa mesmo vindo de um endereço que ninguém cadastrou.
  thread          text not null default '',
  responde_a      text not null default '',

  enviada_em      timestamptz not null,

  -- Preenchidos pelo app quando ele casa a mensagem com quem já está no CRM.
  -- Nascem vazios: a leitura da caixa não adivinha de quem é, só grava o que
  -- chegou.
  contato_id      text,
  conta_id        text,
  oportunidade_id text,

  -- Para a mensagem que o app manda: ela nasce aqui antes de existir no
  -- servidor de e-mail. 'fila' → 'enviada' → ou 'erro' com o motivo.
  estado          text not null default 'recebida'
                  check (estado in ('recebida', 'fila', 'enviada', 'erro')),
  erro            text not null default '',

  lida            boolean default false,
  criado_em       timestamptz default now()
);

-- ------------------------------------------------------------------
-- 2. ÍNDICES
--
-- As perguntas reais: os e-mails desta empresa em ordem, os desta negociação,
-- os desta conversa, e a fila do que ainda não saiu.
-- ------------------------------------------------------------------
create index if not exists idx_emails_tenant   on public.emails(tenant_id, enviada_em desc);
create index if not exists idx_emails_op       on public.emails(oportunidade_id);
create index if not exists idx_emails_contato  on public.emails(contato_id);
create index if not exists idx_emails_thread   on public.emails(tenant_id, thread);
create index if not exists idx_emails_de       on public.emails(tenant_id, de);
create index if not exists idx_emails_fila     on public.emails(tenant_id, estado)
  where estado in ('fila', 'erro');

-- ------------------------------------------------------------------
-- 3. PERMISSÃO
--
-- Mesma regra das tabelas de negócio. E-mail é conversa com pessoa
-- identificada: não pode ficar mais aberto do que a carteira a que pertence.
-- ------------------------------------------------------------------
alter table public.emails enable row level security;

drop policy if exists emails_tudo on public.emails;
create policy emails_tudo on public.emails for all
  using (tenant_id = public.meu_tenant() or public.sou_admin())
  with check (tenant_id = public.meu_tenant() or public.sou_admin());

-- ------------------------------------------------------------------
-- 4. A CAIXA DE CADA PESSOA
--
-- Onde mora a configuração de quem manda e recebe. A SENHA DE APLICATIVO NÃO
-- ENTRA AQUI — ela fica num segredo da Edge Function, criptografada, e nunca
-- passa pelo navegador. Esta tabela guarda só o que a tela precisa mostrar:
-- qual endereço, qual servidor, se está funcionando e desde quando.
-- ------------------------------------------------------------------
create table if not exists public.caixas_email (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  dono_id         uuid not null references auth.users(id) on delete cascade,

  endereco        text not null,
  nome_exibicao   text not null default '',

  -- 'gmail' | 'outlook' | 'outro'. Para 'outro', os campos abaixo valem.
  provedor        text not null default 'gmail',
  imap_servidor   text not null default '',
  imap_porta      int  not null default 993,
  smtp_servidor   text not null default '',
  smtp_porta      int  not null default 587,

  -- O que a tela mostra sobre o estado. 'sem-credencial' até alguém guardar a
  -- senha de aplicativo no segredo da função.
  estado          text not null default 'sem-credencial'
                  check (estado in ('sem-credencial', 'ok', 'erro')),
  erro            text not null default '',
  ultima_leitura  timestamptz,

  ativo           boolean default true,
  criado_em       timestamptz default now(),
  atualizado_em   timestamptz default now(),

  -- Uma caixa por pessoa por endereço.
  unique (dono_id, endereco)
);

create index if not exists idx_caixas_tenant on public.caixas_email(tenant_id);

alter table public.caixas_email enable row level security;

-- Aqui a regra é mais apertada que a das outras tabelas, de propósito: a caixa
-- de e-mail é de uma PESSOA. O gestor vê a carteira da equipe; não vê a
-- configuração de e-mail de cada um. Só o dono e o administrador.
drop policy if exists caixas_email_minha on public.caixas_email;
create policy caixas_email_minha on public.caixas_email for all
  using (dono_id = auth.uid() or public.sou_admin())
  with check (dono_id = auth.uid() or public.sou_admin());

-- ------------------------------------------------------------------
-- 5. CONFERÊNCIA
--
-- Deve devolver: emails com 21 colunas e 1 política; caixas_email com 16
-- colunas e 1 política.
-- ------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'emails')        as colunas_emails,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'emails')           as politicas_emails,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'caixas_email')  as colunas_caixas,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'caixas_email')     as politicas_caixas;
