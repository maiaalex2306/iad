-- IAD CRM — correção 22: completar o que faltou do e-mail
-- ==================================================================
-- POR QUE ESTE ARQUIVO EXISTE
--
-- Porque o passo a passo que o Alexandre seguiu mandava rodar só a correção
-- 21, e as tabelas do e-mail precisam das 18, 19, 20 e 21. Resultado na tela:
--
--   Could not find the 'envia' column of 'caixas_email' in the schema cache
--
-- Essa mensagem manda a pessoa procurar no lugar errado — parece defeito do
-- app, e é banco faltando uma coluna. Este arquivo existe para que ninguém
-- mais precise descobrir QUAL correção faltou: ele completa todas de uma vez
-- e, no fim, imprime linha a linha o que está lá e o que não está.
--
-- É seguro rodar mesmo que todas já tenham rodado: cada linha é
-- `add column if not exists`, e nenhuma apaga nada.
--
-- COMO RODAR
--   Supabase → SQL Editor → cole este arquivo inteiro → Run.
--
-- Ele NÃO substitui a correção 18, que é quem CRIA as tabelas. Se a conferência
-- no fim disser que as tabelas não existem, rode a 18 primeiro.

-- ------------------------------------------------------------------
-- 1. AS COLUNAS DA CAIXA
-- ------------------------------------------------------------------
-- da correção 19: até onde a leitura do IMAP já chegou, e qual pasta ler
alter table public.caixas_email add column if not exists ultimo_uid bigint not null default 0;
alter table public.caixas_email add column if not exists pastas     text   not null default 'INBOX';

-- da correção 20: receber é de todas as caixas, mandar é de uma
alter table public.caixas_email add column if not exists envia      boolean not null default true;

-- da correção 21: quando a senha de aplicativo foi guardada
alter table public.caixas_email add column if not exists senha_em   timestamptz;

-- ------------------------------------------------------------------
-- 2. AS COLUNAS DA MENSAGEM
-- ------------------------------------------------------------------
-- da correção 19: a marca de "já passou pelo assistente"
alter table public.emails add column if not exists analisada_em       timestamptz;
alter table public.emails add column if not exists analise            jsonb;
alter table public.emails add column if not exists analise_erro       text not null default '';
alter table public.emails add column if not exists analise_tentativas int  not null default 0;

create index if not exists idx_emails_por_analisar on public.emails(tenant_id, enviada_em)
  where analisada_em is null and direcao = 'entrada';

-- ------------------------------------------------------------------
-- 3. A GAVETA DAS SENHAS (correção 21)
-- ------------------------------------------------------------------
create table if not exists public.segredos_email (
  caixa_id      uuid primary key references public.caixas_email(id) on delete cascade,
  senha_cifrada text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.segredos_email enable row level security;
revoke all on public.segredos_email from authenticated, anon;

-- ------------------------------------------------------------------
-- 4. AVISAR O POSTGREST
--
-- A mensagem de erro diz "schema cache", e é literal: o PostgREST guarda em
-- memória a lista de colunas de cada tabela. Coluna criada agora só passa a
-- existir para o app quando ele relê essa lista. O Supabase costuma reler
-- sozinho em alguns segundos — este aviso faz na hora, e evita a pessoa achar
-- que a correção não funcionou porque tentou logo em seguida.
-- ------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ------------------------------------------------------------------
-- 5. CONFERÊNCIA, LINHA A LINHA
--
-- Em vez de um número que só quem escreveu o arquivo sabe interpretar: uma
-- linha por coisa necessária, dizendo "ok" ou "FALTA".
-- ------------------------------------------------------------------
with esperado(ordem, tabela, coluna) as (
  values (1, 'caixas_email', 'endereco'),
         (2, 'caixas_email', 'ultimo_uid'),
         (3, 'caixas_email', 'pastas'),
         (4, 'caixas_email', 'envia'),
         (5, 'caixas_email', 'senha_em'),
         (6, 'emails',       'analisada_em'),
         (7, 'emails',       'analise'),
         (8, 'emails',       'analise_erro'),
         (9, 'emails',       'analise_tentativas')
)
select e.tabela || '.' || e.coluna as precisa_existir,
       case when c.column_name is null then 'FALTA — rode a correcao-18 primeiro' else 'ok' end as situacao
  from esperado e
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = e.tabela and c.column_name = e.coluna
union all
select 'tabela segredos_email',
       case when to_regclass('public.segredos_email') is null then 'FALTA' else 'ok' end
union all
select 'o navegador NAO le a senha',
       case when to_regclass('public.segredos_email') is null then 'FALTA'
            when has_table_privilege('authenticated', 'public.segredos_email', 'SELECT')
            then 'PROBLEMA — me chame' else 'ok' end
 order by 1;
