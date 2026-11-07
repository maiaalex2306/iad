-- IAD CRM — tabelas do WhatsApp
--
-- Cole no SQL Editor do Supabase e execute uma vez, DEPOIS de já ter rodado o
-- schema.sql (ele cria tenants, meu_tenant() e sou_admin(), usados aqui).
--
-- A regra é a mesma das outras nove tabelas: o isolamento por empresa não fica
-- no aplicativo, fica aqui. Quem lê é o app, com a chave pública e a sessão do
-- usuário. Quem escreve é a função `whatsapp`, com a chave de serviço, que
-- ignora o RLS — e é por isso que ela confere a assinatura da Meta antes de
-- gravar qualquer coisa.

-- ------------------------------------------------------------- os números
-- Qual número pertence a qual empresa. É por aqui que a função descobre para
-- quem a mensagem vai, e é o que permite um número por empresa cliente.
create table if not exists public.whatsapp_numeros (
  phone_number_id text primary key,          -- o id do número na Meta
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  waba_id         text default '',
  numero          text default '',           -- como aparece para o humano
  nome            text default '',
  ativo           boolean default true,
  criado_em       timestamptz default now()
);

-- ---------------------------------------------------------- as mensagens
create table if not exists public.mensagens_whatsapp (
  -- O wamid da Meta. Chave primária de propósito: a Meta reentrega o webhook
  -- quando não recebe 200 rápido, e sem isto a mesma mensagem entraria duas
  -- vezes. O mesmo problema que o Linked Helper já nos deu.
  id              text primary key,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  phone_number_id text not null,

  -- O outro lado da conversa, só dígitos. `telefone_curto` são os últimos 8,
  -- porque o mesmo número chega escrito de quatro jeitos: com 55, sem 55, com
  -- o 9 na frente, com zero de operadora. Comparar os últimos 8 casa os quatro
  -- sem heurística frágil.
  telefone        text not null,
  telefone_curto  text not null,
  nome_exibicao   text default '',

  direcao         text not null check (direcao in ('entrada', 'saida')),

  -- Três coisas que se parecem e não são: o que passou pela API, o que o
  -- vendedor mandou do celular (smb_message_echoes) e o que veio na carga de
  -- histórico dos 6 meses (history).
  origem          text not null default 'api'
                  check (origem in ('api', 'celular', 'historico')),

  tipo            text default 'text',
  texto           text default '',
  midia_id        text default '',
  enviada_em      timestamptz not null,

  -- Preenchidos pelo app quando ele casa a conversa com quem já está no CRM.
  -- Nascem vazios: a função não adivinha de quem é, só grava o que chegou.
  contato_id      text,
  oportunidade_id text,

  lida            boolean default false,
  criado_em       timestamptz default now()
);

create index if not exists idx_wa_numeros_tenant
  on public.whatsapp_numeros(tenant_id);

create index if not exists idx_msg_wa_casar
  on public.mensagens_whatsapp (tenant_id, telefone_curto, enviada_em desc);

create index if not exists idx_msg_wa_nao_lidas
  on public.mensagens_whatsapp (tenant_id, lida)
  where lida = false and direcao = 'entrada';

-- ------------------------------------------------------- Row Level Security
alter table public.whatsapp_numeros    enable row level security;
alter table public.mensagens_whatsapp  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['whatsapp_numeros','mensagens_whatsapp']
  loop
    execute format('drop policy if exists %I_tudo on public.%I', t, t);
    execute format($f$
      create policy %I_tudo on public.%I for all
        using (tenant_id = public.meu_tenant() or public.sou_admin())
        with check (tenant_id = public.meu_tenant() or public.sou_admin())
    $f$, t, t);
  end loop;
end $$;

-- ------------------------------------------------------------- conferência
-- Depois de conectar o número, rode isto para saber se a carga de histórico
-- chegou. Ela vem uma vez só, nos minutos seguintes — se não veio, não volta.
--
--   select origem, direcao, count(*), min(enviada_em), max(enviada_em)
--     from public.mensagens_whatsapp
--    group by origem, direcao
--    order by origem, direcao;
