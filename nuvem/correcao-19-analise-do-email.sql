-- IAD CRM — correção 19: a marca de "já analisado"
-- ==================================================================
-- POR QUE ESTE ARQUIVO EXISTE
--
-- Todo e-mail recebido passa pelo assistente: ele separa o que o CLIENTE
-- disse, propõe evidência por decisão, relê as oito e, quando o cliente pediu
-- alguma coisa, abre a tarefa correspondente.
--
-- Isso só pode acontecer UMA VEZ por mensagem. Sem uma marca, cada abertura do
-- app reanalisaria a caixa inteira: consumo do provedor multiplicado por nada,
-- evidência repetida no histórico, e a mesma tarefa nascendo todo dia.
--
-- São duas marcas diferentes, e as duas precisam existir:
--
--   `analisada_em` na mensagem  — esta mensagem já passou pelo assistente.
--   `ultimo_uid` na caixa       — a leitura do IMAP não precisa voltar do
--                                 começo da caixa a cada rodada.
--
-- A primeira impede reanalisar; a segunda impede rebaixar. O Message-ID já
-- impede a mensagem de entrar duas vezes — mas sem o `ultimo_uid` a leitura
-- ainda baixaria dez mil mensagens para descobrir que todas já estão aqui.
--
-- COMO RODAR
--   Supabase → SQL Editor → cole → Run. Depois de correcao-18-emails.sql.
--   Repetível.

-- ------------------------------------------------------------------
-- 1. A MENSAGEM JÁ FOI ANALISADA?
-- ------------------------------------------------------------------
alter table public.emails add column if not exists analisada_em timestamptz;

-- O que a análise concluiu: quantas evidências, quais notas mudaram, se abriu
-- tarefa. Fica guardado porque "o índice subiu e ninguém sabe por quê" é a
-- pergunta que este app existe para responder — e três semanas depois a
-- resposta tem de estar em algum lugar.
alter table public.emails add column if not exists analise jsonb;

-- Falha fica escrita em vez de virar silêncio. Sem isto, o e-mail que o
-- assistente não conseguiu ler ficaria eternamente na fila, tentando de novo a
-- cada abertura do app — ou, pior, seria marcado como analisado e a evidência
-- se perderia sem ninguém notar.
alter table public.emails add column if not exists analise_erro text not null default '';

-- Quantas vezes já tentamos. Depois de três, para de tentar sozinho e espera
-- alguém mandar de novo: assistente fora do ar não pode virar um laço que
-- consome cota a cada abertura.
alter table public.emails add column if not exists analise_tentativas int not null default 0;

-- A fila do que ainda falta analisar. Índice parcial porque é uma pergunta só,
-- feita a toda hora, sobre uma fatia pequena de uma tabela que vai crescer.
create index if not exists idx_emails_por_analisar on public.emails(tenant_id, enviada_em)
  where analisada_em is null and direcao = 'entrada';

-- ------------------------------------------------------------------
-- 2. ATÉ ONDE A LEITURA DA CAIXA JÁ CHEGOU
-- ------------------------------------------------------------------
alter table public.caixas_email add column if not exists ultimo_uid bigint not null default 0;

-- A pasta lida. Caixa de vendedor tem regra que joga coisa em subpasta, e ler
-- só a INBOX perderia metade da conversa; ler tudo traria Spam e Lixeira.
alter table public.caixas_email add column if not exists pastas text not null default 'INBOX';

-- ------------------------------------------------------------------
-- 3. CONFERÊNCIA
--
-- Deve devolver 25 colunas em emails e 18 em caixas_email.
-- ------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'emails')        as colunas_emails,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'caixas_email')  as colunas_caixas,
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname = 'idx_emails_por_analisar') as indice_da_fila;
