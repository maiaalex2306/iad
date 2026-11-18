-- ==================================================================
-- Correção 23 — Notas rápidas
--
-- O que o vendedor pensa no semáforo e não vira tarefa na hora.
-- "Ligar para o Carlos da Heineken." Uma linha, digitada ou ditada.
--
-- Rode inteiro, de uma vez, no SQL Editor do Supabase. É idempotente:
-- rodar duas vezes não quebra nada.
-- ==================================================================

-- ------------------------------------------------------------------
-- 1. A TABELA
--
-- Deliberadamente burra. Sem prazo, sem prioridade, sem tipo: no minuto
-- em que uma nota precisa de prazo e responsável, ela é uma TAREFA, e
-- existe um botão para transformá-la. Dar campos demais a esta tabela
-- criaria um segundo sistema de tarefas — e duas listas de "o que fazer"
-- é o mesmo que nenhuma.
-- ------------------------------------------------------------------
create table if not exists public.notas (
  id              text primary key,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,

  -- Sem `on delete set null`, ao contrário das outras tabelas: nota é
  -- de uma pessoa, e nota órfã não tem para quem aparecer.
  dono_id         uuid not null references auth.users(id) on delete cascade,

  texto           text not null default '',
  feita           boolean not null default false,

  -- Preenchida quando a nota nasce dentro de uma negociação, ou quando
  -- o app reconhece a empresa no texto. Opcional de propósito: a maioria
  -- das notas é escrita antes de alguém saber a qual negócio ela pertence.
  oportunidade_id text,

  -- Instante, e não dia. Em todas as outras tabelas `criado_em` é uma data,
  -- porque a pergunta é “de que dia é esta conta”. Aqui a pergunta é “qual eu
  -- anotei por último”, e cinco anotações do mesmo dia com a mesma data não
  -- têm ordem nenhuma — a lista sai embaralhada.
  criado_em       timestamptz default now(),
  atualizado_em   timestamptz default now()
);

create index if not exists idx_notas_dono on public.notas(dono_id, feita, criado_em desc);

-- ------------------------------------------------------------------
-- 2. PERMISSÃO — e aqui a regra é MAIS ESTRITA que a das outras tabelas
--
-- Todas as outras usam `tenant_id = meu_tenant() or sou_admin()`: você vê
-- o que é da sua empresa, e o administrador vê tudo. Aqui não.
--
-- Nota rápida é rascunho pessoal. Se o gestor pudesse ler, ninguém
-- escreveria — e uma caixa de notas que ninguém usa não vale o código que
-- a desenha. Então: você vê as SUAS, e só. Nem gestor, nem administrador.
--
-- O tenant continua na linha porque a nota pertence à operação da empresa
-- (some junto quando a empresa some), mas quem enxerga é só o dono.
-- ------------------------------------------------------------------
alter table public.notas enable row level security;

drop policy if exists notas_minhas on public.notas;
create policy notas_minhas on public.notas for all
  using (dono_id = auth.uid())
  with check (dono_id = auth.uid());

-- ------------------------------------------------------------------
-- 3. O PostgREST precisa saber que a tabela nasceu
-- ------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ------------------------------------------------------------------
-- 4. CONFERÊNCIA
--
-- Deve devolver: 8 colunas, 1 política, RLS ligada.
-- ------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'notas')                   as colunas,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'notas')                      as politicas,
  (select case when relrowsecurity then 'ligada' else 'DESLIGADA' end
     from pg_class where oid = 'public.notas'::regclass)                       as rls;
