-- IAD CRM — correção 14: a tabela de fontes
-- ------------------------------------------------------------------
-- De onde o lead veio era texto solto dentro da oportunidade. Um vendedor
-- escrevia "Linked Helper", outro "linkedin helper", um terceiro "LH" — e três
-- grafias do mesmo canal não somam. Somar é justamente o que se quer fazer com
-- esse campo: qual fonte produz negócio que FECHA, e não qual produz volume.
--
-- A coluna `origem` fica onde está. Trocar o sentido de uma coluna que já tem
-- dado dentro é o jeito conhecido de perder o dado sem ninguém perceber: a
-- carteira que já existe continua legível pelo texto antigo, e a coluna nova
-- aponta para a linha da tabela.
--
-- A categoria existe porque o nome sozinho não responde à primeira pergunta.
-- "Feiras e Eventos" e "Indicação por Clientes" são fontes diferentes, mas as
-- duas são coisas que vieram até nós — e ler isso separado de prospecção ativa
-- é o que diz se a carteira depende de sorte ou de trabalho.

create table if not exists public.fontes (
  id            text primary key,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  nome          text not null,
  categoria     text not null default 'outra',
  ativo         boolean default true,
  criado_em     date default current_date,
  atualizado_em timestamptz default now()
);

create index if not exists idx_fontes_tenant on public.fontes(tenant_id);

alter table public.fontes enable row level security;

drop policy if exists fontes_tudo on public.fontes;
create policy fontes_tudo on public.fontes for all
  using (tenant_id = public.meu_tenant() or public.sou_admin())
  with check (tenant_id = public.meu_tenant() or public.sou_admin());

-- A ponte entre a oportunidade e a fonte. Sem chave estrangeira de propósito:
-- o app sincroniza as duas tabelas em lotes separados e nada garante a ordem.
-- Uma oportunidade recusada porque a fonte dela ainda não subiu seria uma
-- sincronização que falha sozinha e assusta sem motivo.
alter table public.oportunidades add column if not exists fonte_id text not null default '';

comment on column public.fontes.categoria is
  'saida (prospecção ativa), entrada (o cliente veio), relacao (indicação, parceiro, base) ou outra.';
comment on column public.oportunidades.fonte_id is
  'Aponta para fontes.id. A coluna origem continua guardando o texto solto do que foi criado antes desta tabela.';
