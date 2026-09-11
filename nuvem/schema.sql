-- IAD CRM — esquema para Supabase (PostgreSQL)
--
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute uma vez.
-- Ele cria as tabelas, liga o Row Level Security e escreve as regras de acesso.
--
-- A regra que importa: o isolamento por empresa NÃO fica no aplicativo, fica aqui.
-- Mesmo que o app peça a carteira de outra empresa, o banco recusa devolver.

-- ---------------------------------------------------------------- empresas
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cnpj        text default '',
  ativo       boolean default true,
  criado_em   timestamptz default now()
);

-- Perfil liga o usuário do Supabase (auth.users) à empresa e ao papel.
create table if not exists public.perfis (
  id           uuid primary key references auth.users(id) on delete cascade,
  tenant_id    uuid references public.tenants(id) on delete set null,
  nome         text default '',
  whatsapp     text default '',
  papel        text not null default 'usuario' check (papel in ('usuario', 'admin')),
  ativo        boolean default true,
  criado_em    timestamptz default now()
);

-- Quem sou eu, sem consultar perfis de dentro das políticas (evita recursão).
create or replace function public.meu_tenant()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.perfis where id = auth.uid()
$$;

create or replace function public.sou_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'admin' from public.perfis where id = auth.uid()), false)
$$;

-- ------------------------------------------------------------- entidades
create table if not exists public.contas (
  id             text primary key,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  nome           text not null,
  razao_social   text default '',
  cnpj           text default '',
  segmento       text default '',
  porte          text default '',
  cidade         text default '',
  uf             text default '',
  site           text default '',
  telefone       text default '',
  relacao_atual  text default 'Prospect',
  criado_em      date default current_date,
  atualizado_em  timestamptz default now()
);

create table if not exists public.contatos (
  id             text primary key,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  conta_id       text,
  nome           text not null,
  cargo          text default '',
  papel          text default 'Usuário',
  perfil         text default 'nao_classificado',
  sentimento     text default 'nao_acessado',
  influencia     int default 2,
  reporta_a      text,
  /* Dois de cada. `email` é o profissional e `telefone` é o WhatsApp — é por
     ele que a conversa que chega casa com a pessoa. */
  email              text default '',
  email_pessoal      text default '',
  telefone           text default '',
  telefone_comercial text default '',
  linkedin       text default '',
  canal_preferido text default '',
  criado_em      date default current_date,
  atualizado_em  timestamptz default now()
);

-- As partes ricas (as 8 notas, evidências, histórico) ficam em jsonb: são lidas
-- e escritas sempre inteiras pelo app, e assim o formato acompanha o código.
create table if not exists public.oportunidades (
  id                   text primary key,
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  dono_id              uuid references auth.users(id) on delete set null,
  dono                 text default '',
  conta_id             text,
  titulo               text not null,
  valor                numeric default 0,
  etapa                text default 'Prospecção',
  etapa_desde          date,
  tipo                 text default 'Novo negócio',
  concorrentes         text default '',
  produto              text default '',
  origem               text default '',
  campanha             text default '',
  sdr                  text default '',
  sdr_email            text default '',
  fechamento_previsto  date,
  adiamentos           int default 0,
  gate_liberado_por    text,
  notas                text default '',
  dims                 jsonb default '{}'::jsonb,
  stakeholders         jsonb default '[]'::jsonb,
  eventos              jsonb default '[]'::jsonb,
  snapshots            jsonb default '[]'::jsonb,
  itens                jsonb default '[]'::jsonb,
  insight              jsonb,
  proximo_compromisso  jsonb,
  /* Nulo quer dizer "não está em nutrição", que é diferente de estar com os
     campos vazios. */
  nutricao             jsonb,
  desfecho             jsonb,
  criado_em            date default current_date,
  atualizado_em        timestamptz default now()
);

create table if not exists public.tarefas (
  id             text primary key,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  dono_id        uuid references auth.users(id) on delete set null,
  oportunidade_id text,
  contato_id     text,
  titulo         text not null,
  descricao      text default '',
  tipo           text default 'Ligar',
  decisao_alvo   text default '',
  vencimento     date,
  hora           text default '',
  status         text default 'aberta',
  concluida_em   date,
  origem         text default 'planejada',
  com_relato     boolean default false,
  sem_registro   boolean default false,
  adiamentos     int default 0,
  criado_em      date default current_date,
  atualizado_em  timestamptz default now()
);

create table if not exists public.produtos (
  id             text primary key,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  nome           text not null,
  sku            text default '',
  categoria      text default '',
  unidade        text default '',
  preco_referencia numeric default 0,
  descricao      text default '',
  ativo          boolean default true,
  criado_em      date default current_date,
  atualizado_em  timestamptz default now()
);

create table if not exists public.segmentos (
  id            text primary key,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  nome          text not null,
  ativo         boolean default true,
  criado_em     date default current_date,
  atualizado_em timestamptz default now()
);

create table if not exists public.tipos_tarefa (
  id            text primary key,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  nome          text not null,
  ativo         boolean default true,
  criado_em     date default current_date,
  atualizado_em timestamptz default now()
);

create index if not exists idx_contas_tenant        on public.contas(tenant_id);
create index if not exists idx_contatos_tenant      on public.contatos(tenant_id);
create index if not exists idx_oportunidades_tenant on public.oportunidades(tenant_id);
create index if not exists idx_tarefas_tenant       on public.tarefas(tenant_id);

-- ------------------------------------------------------- Row Level Security
alter table public.tenants       enable row level security;
alter table public.perfis        enable row level security;
alter table public.contas        enable row level security;
alter table public.contatos      enable row level security;
alter table public.oportunidades enable row level security;
alter table public.tarefas       enable row level security;
alter table public.produtos      enable row level security;
alter table public.segmentos     enable row level security;
alter table public.tipos_tarefa  enable row level security;

-- Cada um lê e escreve o próprio perfil; o administrador lê todos.
drop policy if exists perfis_leitura on public.perfis;
create policy perfis_leitura on public.perfis for select
  using (id = auth.uid() or public.sou_admin());

drop policy if exists perfis_escrita on public.perfis;
create policy perfis_escrita on public.perfis for insert
  with check (id = auth.uid());

drop policy if exists perfis_atualizacao on public.perfis;
create policy perfis_atualizacao on public.perfis for update
  using (id = auth.uid() or public.sou_admin());

-- Empresas: cada um vê a sua; o administrador vê e cria todas.
drop policy if exists tenants_leitura on public.tenants;
create policy tenants_leitura on public.tenants for select
  using (id = public.meu_tenant() or public.sou_admin());

drop policy if exists tenants_criacao on public.tenants;
create policy tenants_criacao on public.tenants for insert
  with check (auth.uid() is not null);

drop policy if exists tenants_atualizacao on public.tenants;
create policy tenants_atualizacao on public.tenants for update
  using (id = public.meu_tenant() or public.sou_admin());

-- As sete tabelas de negócio seguem a mesma regra, aplicada uma vez por tabela.
do $$
declare t text;
begin
  foreach t in array array['contas','contatos','oportunidades','tarefas','produtos','segmentos','tipos_tarefa']
  loop
    execute format('drop policy if exists %I_tudo on public.%I', t, t);
    execute format($f$
      create policy %I_tudo on public.%I for all
        using (tenant_id = public.meu_tenant() or public.sou_admin())
        with check (tenant_id = public.meu_tenant() or public.sou_admin())
    $f$, t, t);
  end loop;
end $$;

-- Criar a empresa e ligar o próprio perfil a ela, numa operação só.
--
-- Por que uma função e não um insert direto do app: ao devolver a linha de um
-- insert, o Postgres também aplica as políticas de SELECT — e a de tenants diz
-- "você vê a empresa que é a sua". Quem ainda não tem empresa não consegue ler
-- a que acabou de criar, e a operação inteira é recusada. Aqui também fica
-- atômico: ou nasce a empresa com o perfil ligado, ou não nasce nada.
create or replace function public.criar_minha_empresa(p_nome text, p_cnpj text default '')
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  nova  public.tenants;
  atual uuid;
begin
  if auth.uid() is null then
    raise exception 'Entre na nuvem antes de criar a empresa.';
  end if;

  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'A empresa precisa de um nome.';
  end if;

  select tenant_id into atual from public.perfis where id = auth.uid();
  if atual is not null then
    raise exception 'Seu usuário já está ligado a uma empresa.';
  end if;

  insert into public.tenants (nome, cnpj)
    values (btrim(p_nome), coalesce(btrim(p_cnpj), ''))
    returning * into nova;

  insert into public.perfis (id, tenant_id)
    values (auth.uid(), nova.id)
    on conflict (id) do update set tenant_id = excluded.tenant_id;

  return nova;
end $$;

revoke all on function public.criar_minha_empresa(text, text) from public;
grant execute on function public.criar_minha_empresa(text, text) to authenticated;

-- Ao confirmar o e-mail, o Supabase cria o usuário; aqui nasce o perfil dele.
create or replace function public.ao_criar_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, whatsapp)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'nome', ''),
          coalesce(new.raw_user_meta_data->>'whatsapp', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_ao_criar_usuario on auth.users;
create trigger trg_ao_criar_usuario after insert on auth.users
  for each row execute function public.ao_criar_usuario();
