-- IAD CRM — correção 16: põe o banco em dia, de uma vez
-- ==================================================================
-- POR QUE ESTE ARQUIVO EXISTE
--
-- O app se atualiza sozinho, pelo navegador. O banco não. Quando um campo
-- novo nasce no código, ele só existe do lado de lá depois que alguém roda o
-- SQL — e, até rodar, a tabela INTEIRA é recusada no envio. Não é o campo que
-- falha: é a linha, e com ela a sincronização daquela tabela.
--
-- O efeito disso é o que aconteceu aqui: um computador com 41 negociações e
-- outro com 27. A carteira maior nunca subiu porque o envio vinha falhando; o
-- computador novo baixou o que havia no servidor, que era a cópia antiga. Dois
-- aparelhos, duas verdades, nenhuma mensagem na tela.
--
-- Este arquivo junta tudo o que estava pendente (correções 10 a 15) mais a
-- ponte do Linked Helper, que passa a morar na empresa. É repetível: tudo é
-- `if not exists` ou `create or replace`. Rodar duas vezes não estraga nada,
-- e rodar quando já está tudo lá não faz nada.
--
-- COMO RODAR
--   Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
--   Depois, no app: Configuração → Nuvem → Sincronizar, a partir do
--   computador que tem a carteira CERTA (a de 41).
--
-- Ele não apaga nada. Só acrescenta colunas e funções.

-- ------------------------------------------------------------------
-- 1. CONTAS  (era a correção 11)
-- ------------------------------------------------------------------
alter table public.contas add column if not exists descricao    text not null default '';
alter table public.contas add column if not exists linkedin     text not null default '';
alter table public.contas add column if not exists pais         text not null default '';
alter table public.contas add column if not exists necessidades text not null default '';

-- ------------------------------------------------------------------
-- 2. CONTATOS  (era a correção 13)
-- Dois canais separados: o e-mail pessoal não é o corporativo, e o telefone
-- comercial não é o celular. Misturar os dois é o que faz a mensagem chegar
-- no lugar errado.
-- ------------------------------------------------------------------
alter table public.contatos add column if not exists email_pessoal      text default '';
alter table public.contatos add column if not exists telefone_comercial text default '';

-- ------------------------------------------------------------------
-- 3. SEGMENTOS  (era a correção 10)
-- ------------------------------------------------------------------
alter table public.segmentos add column if not exists subsegmentos  text not null default '';
alter table public.segmentos add column if not exists oportunidades text not null default '';
alter table public.segmentos add column if not exists personas      text not null default '';

-- ------------------------------------------------------------------
-- 4. OPORTUNIDADES  (correções 12, 14 e 15)
-- ------------------------------------------------------------------
-- De onde veio. Com várias pessoas prospectando, sem isto não dá para dizer
-- qual campanha e qual delas produziram pipeline de verdade.
alter table public.oportunidades add column if not exists origem    text default '';
alter table public.oportunidades add column if not exists campanha  text default '';
alter table public.oportunidades add column if not exists sdr       text default '';
alter table public.oportunidades add column if not exists sdr_email text default '';

-- Nutrição: parado DE PROPÓSITO, com motivo e data para voltar. Nulo quer
-- dizer "não está em nutrição", que é diferente de estar com os campos vazios.
alter table public.oportunidades add column if not exists nutricao  jsonb;

-- Aponta para fontes.id. A coluna origem continua guardando o texto solto do
-- que foi criado antes de a tabela de fontes existir.
alter table public.oportunidades add column if not exists fonte_id  text not null default '';

-- O valor do negócio é único + mensal × prazo. As duas parcelas nunca se
-- somam na tela, e o prazo fica à vista para a conta ser verificável.
alter table public.oportunidades add column if not exists prazo_contrato_meses int     not null default 12;
alter table public.oportunidades add column if not exists valor_mensal         numeric not null default 0;

-- Os itens da oportunidade. Existe desde o schema original; repetido aqui
-- porque um banco criado a partir de um schema mais antigo pode não ter.
alter table public.oportunidades add column if not exists itens jsonb default '[]'::jsonb;

-- ------------------------------------------------------------------
-- 5. TAREFAS  (era a correção 12)
-- ------------------------------------------------------------------
alter table public.tarefas add column if not exists descricao    text default '';
alter table public.tarefas add column if not exists hora         text default '';
alter table public.tarefas add column if not exists origem       text default 'planejada';
alter table public.tarefas add column if not exists com_relato   boolean default false;
alter table public.tarefas add column if not exists sem_registro boolean default false;
alter table public.tarefas add column if not exists adiamentos   int default 0;

-- ------------------------------------------------------------------
-- 6. PRODUTOS  (era a correção 15)
-- Único ou mensal muda tudo no valor do negócio, e é escolha do produto.
-- ------------------------------------------------------------------
alter table public.produtos add column if not exists tipo_cobranca text not null default 'unico';

-- ------------------------------------------------------------------
-- 7. FONTES  (era a correção 14)
-- De onde o lead veio era texto solto: um escrevia "Linked Helper", outro
-- "linkedin helper", um terceiro "LH" — e três grafias do mesmo canal não
-- somam. Somar é justamente o que se quer fazer com esse campo.
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- 8. A PONTE DO LINKED HELPER, NA EMPRESA
--
-- Morava só no navegador. Reiniciar o computador e abrir noutro perfil dava um
-- app sem ponte, sem botão de importar e sem explicação — cada máquina virava
-- uma instalação diferente do mesmo sistema.
--
-- Agora é da empresa: desce junto com ela em qualquer computador. Quem já
-- enxerga a carteira daquela empresa já enxerga tudo o que a ponte traria, de
-- modo que a chave de leitura aqui não amplia o acesso de ninguém.
--
-- Uma ponte por empresa, de propósito: mesmo worker, endereço próprio. Sem
-- isso duas empresas dividiriam o balde e a primeira a buscar levaria a
-- prospecção da outra.
-- ------------------------------------------------------------------
alter table public.tenants add column if not exists ponte_url   text not null default '';
alter table public.tenants add column if not exists ponte_chave text not null default '';

comment on column public.tenants.ponte_url is
  'Endereço do coletor (Cloudflare Worker) que recebe o webhook do Linked Helper desta empresa.';
comment on column public.tenants.ponte_chave is
  'Chave de LEITURA do coletor. Quem lê aqui já enxerga a carteira desta empresa — a chave não amplia acesso.';

-- `sou_gestor` nasceu na correção 05. Repetida aqui, igual, para este arquivo
-- não depender da ordem em que as correções foram rodadas: `create or replace`
-- com o mesmo corpo não muda nada onde ela já existe.
create or replace function public.sou_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select papel in ('gestor', 'admin') from public.perfis where id = auth.uid()), false)
$$;

-- Quem pode mudar: quem administra, ou quem gerencia a própria empresa. O
-- vendedor não — a ponte é configuração, não trabalho do dia.
create or replace function public.definir_ponte_da_empresa(p_id uuid, p_url text, p_chave text)
returns public.tenants language plpgsql security definer set search_path = public as $$
declare linha public.tenants;
begin
  if not (public.sou_admin() or (p_id = public.meu_tenant() and public.sou_gestor())) then
    raise exception 'Só quem administra ou gerencia esta empresa configura a ponte.';
  end if;
  update public.tenants
     set ponte_url   = coalesce(btrim(p_url), ''),
         ponte_chave = coalesce(btrim(p_chave), '')
   where id = p_id returning * into linha;
  if linha.id is null then raise exception 'Empresa não encontrada.'; end if;
  return linha;
end $$;

revoke all on function public.definir_ponte_da_empresa(uuid, text, text) from public;
grant execute on function public.definir_ponte_da_empresa(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------
-- 9. CONFERÊNCIA
-- Rode e leia: toda linha tem de dizer "ok". O que disser "FALTA" não subiu.
-- ------------------------------------------------------------------
select
  'oportunidades.fonte_id'             as o_que,
  case when exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'oportunidades' and column_name = 'fonte_id')
    then 'ok' else 'FALTA' end          as situacao
union all select 'oportunidades.nutricao',
  case when exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'oportunidades' and column_name = 'nutricao')
    then 'ok' else 'FALTA' end
union all select 'oportunidades.valor_mensal',
  case when exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'oportunidades' and column_name = 'valor_mensal')
    then 'ok' else 'FALTA' end
union all select 'tarefas.adiamentos',
  case when exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tarefas' and column_name = 'adiamentos')
    then 'ok' else 'FALTA' end
union all select 'contatos.email_pessoal',
  case when exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contatos' and column_name = 'email_pessoal')
    then 'ok' else 'FALTA' end
union all select 'produtos.tipo_cobranca',
  case when exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'produtos' and column_name = 'tipo_cobranca')
    then 'ok' else 'FALTA' end
union all select 'tabela fontes',
  case when exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'fontes')
    then 'ok' else 'FALTA' end
union all select 'tenants.ponte_url',
  case when exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenants' and column_name = 'ponte_url')
    then 'ok' else 'FALTA' end
union all select 'função definir_ponte_da_empresa',
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'definir_ponte_da_empresa')
    then 'ok' else 'FALTA' end;
