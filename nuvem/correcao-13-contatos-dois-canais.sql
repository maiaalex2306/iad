-- Dois e-mails e dois telefones por contato.
--
-- Rode uma vez, no SQL Editor. Seguro repetir.
--
-- O que NÃO muda, e é o mais importante daqui: `email` continua sendo o
-- profissional e `telefone` continua sendo o WhatsApp. Renomear o sentido de
-- uma coluna que já tem dado dentro é o jeito de perder o dado sem ninguém
-- perceber — e `telefone` é a coluna pela qual a conversa que chega casa com a
-- pessoa. As duas novas nascem vazias.
--
-- Por que dois de cada:
--
--   e-mail     o profissional morre quando a pessoa troca de emprego; o
--              pessoal é o que sobrevive. Numa venda consultiva o comprador de
--              hoje é o comprador da próxima empresa dele.
--
--   telefone   separação operacional: o WhatsApp é por onde a conversa
--              acontece e por onde ela casa; o comercial é o da mesa, que
--              ninguém usa para conversar.

alter table public.contatos add column if not exists email_pessoal      text default '';
alter table public.contatos add column if not exists telefone_comercial text default '';

-- ----------------------------------------------------------- conferência
-- Tem de sair vazia.
select c as coluna_que_falta
  from unnest(array['email_pessoal','telefone_comercial']) c
 where c not in (select column_name from information_schema.columns
                  where table_schema = 'public' and table_name = 'contatos');
