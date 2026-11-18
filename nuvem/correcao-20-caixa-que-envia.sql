-- IAD CRM — correção 20: a caixa que envia
-- ==================================================================
-- POR QUE ESTE ARQUIVO EXISTE
--
-- Pedido do Alexandre, e ele tem razão: vendedor recebe cliente em mais de um
-- endereço e manda por um só.
--
-- No caso dele, `@biosolvit.com` e `@biopartners.com.br` recebem os dois, e a
-- saída é sempre pelo `@biopartners.com.br`. Sem esta coluna, o app escolheria
-- a primeira caixa que encontrasse — e a resposta ao cliente sairia do
-- endereço errado, que é o tipo de erro que só se descobre quando o cliente
-- estranha.
--
-- `envia` separa as duas funções da caixa. Ler é de todas; mandar é de uma.
--
-- COMO RODAR
--   Supabase → SQL Editor → cole → Run. Depois das correções 18 e 19.
--   Repetível.

alter table public.caixas_email add column if not exists envia boolean not null default true;

-- Ler é o padrão de qualquer caixa ligada; mandar é escolha. Quem já tinha uma
-- caixa cadastrada continua enviando por ela — `default true` preserva o que
-- estava valendo, e desligar é um clique na tela.
comment on column public.caixas_email.envia is
  'A saída sai por esta caixa. Várias podem receber; normalmente só uma envia.';

-- ------------------------------------------------------------------
-- CONFERÊNCIA — deve devolver 19 colunas.
-- ------------------------------------------------------------------
select count(*) as colunas_caixas
  from information_schema.columns
 where table_schema = 'public' and table_name = 'caixas_email';
