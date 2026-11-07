-- IAD CRM — correção 17: a tabela de sinais do comprador
-- ==================================================================
-- POR QUE ESTE ARQUIVO EXISTE
--
-- Até aqui o IAD só sabia o que o VENDEDOR registrou. A régua das oito
-- decisões mede evidência, e evidência é coisa que alguém digita depois de
-- uma conversa. Isso é o que o app tem de diferente e não muda.
--
-- O que faltava era a outra metade: o que o COMPRADOR faz sozinho. Ele
-- respondeu, abriu, voltou ao documento, mudou de cargo. O app via esses
-- fatos passarem — na conversa do WhatsApp, na campanha do Linked Helper — e
-- jogava fora, porque não tinha onde guardar.
--
-- Esta tabela é o onde. Ela não mexe em nota nenhuma: sinal não é decisão, e
-- tratar clique como evidência transformaria o IAD num contador de cliques,
-- que é o que todo CRM já é. O que ela permite é a pergunta que nenhum deles
-- responde: "o comportamento dele está à frente do que registramos?" Quando
-- está, é a hora de falar — e é isso que o app passa a dizer.
--
-- COMO RODAR
--   Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
--   Depois, no app: Configuração → Nuvem → Sincronizar.
--
-- Ele não apaga nada e pode ser repetido: tudo é `if not exists` ou
-- `create or replace`.

-- ------------------------------------------------------------------
-- 1. A TABELA
--
-- Os nomes das colunas são os nomes dos campos do app em snake_case, porque
-- a tradução entre os dois lados é mecânica (src/nuvem.js) e qualquer apelido
-- aqui vira uma coluna que o app nunca preenche.
-- ------------------------------------------------------------------
create table if not exists public.sinais (
  id              text primary key,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  dono_id         uuid references auth.users(id) on delete set null,

  -- O sinal nasce grudado na PESSOA. Conta e negociação são onde ele cai
  -- depois, e as duas podem faltar: o sinal mais valioso costuma chegar antes
  -- de alguém ter tido o trabalho de organizar o cadastro.
  contato_id      text,
  conta_id        text,
  oportunidade_id text,

  canal           text not null default 'outro',
  tipo            text not null default 'outro',

  -- 1 atenção, 2 interesse, 3 intenção. Três degraus e não dez porque
  -- escala fina aqui é falsa precisão.
  peso            int  not null default 1,

  -- `quando` é o dia em que o comprador fez a coisa, que não é o dia em que
  -- alguém registrou. Confundir os dois faz o relógio do comportamento andar
  -- com o relógio do vendedor, e era justamente essa diferença que
  -- queríamos medir.
  quando          date default current_date,
  hora            text not null default '',

  titulo          text not null default '',
  detalhe         text not null default '',

  -- De onde veio: 'manual', 'whatsapp', 'ponte'. Com `externo_id`, é o que
  -- impede a captura automática de criar o mesmo sinal a cada recarga.
  fonte           text not null default 'manual',
  externo_id      text not null default '',

  -- Qual link rastreado gerou o sinal. Campo próprio, e não enfiado no
  -- `detalhe`: detalhe é texto que a pessoa lê. É também o que diz se a
  -- próxima abertura do mesmo link é uma volta ao documento — o sinal mais
  -- forte que este app reconhece.
  link_id         text not null default '',

  -- Preenchido quando uma PESSOA decide que aquele sinal comprova uma
  -- decisão. A promoção é humana de propósito: quem diz que abrir a proposta
  -- três vezes comprova Prioridade conhece a conta, e nenhuma tabela de pesos
  -- conhece.
  evento_id       text not null default '',

  criado_em       date default current_date,
  atualizado_em   timestamptz default now()
);

-- ------------------------------------------------------------------
-- 2. ÍNDICES
--
-- As três perguntas que a tela faz: os sinais desta empresa, os desta pessoa,
-- os desta conta. O de `externo_id` é o da idempotência da captura
-- automática, que roda a cada carregamento da conversa.
-- ------------------------------------------------------------------
create index if not exists idx_sinais_tenant  on public.sinais(tenant_id);
create index if not exists idx_sinais_contato on public.sinais(contato_id);
create index if not exists idx_sinais_conta   on public.sinais(conta_id);
create index if not exists idx_sinais_quando  on public.sinais(tenant_id, quando desc);
create index if not exists idx_sinais_externo on public.sinais(tenant_id, fonte, externo_id);

-- ------------------------------------------------------------------
-- 3. PERMISSÃO
--
-- Mesma regra das outras oito tabelas de negócio: você vê o que é da sua
-- empresa, e o administrador vê tudo. Sinal é dado de pessoa identificada —
-- não pode ficar mais aberto do que a carteira a que ele pertence.
-- ------------------------------------------------------------------
alter table public.sinais enable row level security;

drop policy if exists sinais_tudo on public.sinais;
create policy sinais_tudo on public.sinais for all
  using (tenant_id = public.meu_tenant() or public.sou_admin())
  with check (tenant_id = public.meu_tenant() or public.sou_admin());

-- ------------------------------------------------------------------
-- 4. CONFERÊNCIA
--
-- Depois de rodar, esta consulta deve devolver uma linha com 19 colunas e a
-- política ligada. Se devolver zero, algo acima não rodou.
-- ------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'sinais')          as colunas,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'sinais')             as politicas,
  (select count(*) from pg_indexes
     where schemaname = 'public' and tablename = 'sinais')             as indices;
