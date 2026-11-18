-- =====================================================================
--  correcao-24 — a coluna que faltava: oportunidades.historico_nutricao
-- =====================================================================
--
--  O SINTOMA
--  Faixa laranja que não sai, com o recado:
--    "O banco está atrás do aplicativo: falta a coluna
--     oportunidades.historico_nutricao"
--  e, a partir daí, NADA da carteira sobe. Não é só a nutrição que trava:
--  o envio manda a tabela inteira de uma vez, e uma coluna desconhecida faz
--  o PostgREST recusar o lote todo. Uma coluna derruba todas as negociações.
--
--  A CAUSA, e ela é minha
--  O campo `historicoNutricao` nasceu no aplicativo quando a nutrição passou
--  a guardar as passagens (entrou, saiu, por quê) — e eu nunca escrevi a
--  migração. Ficou funcionando em memória por semanas, e quebrou no dia em
--  que alguém tirou uma negociação da nutrição pela primeira vez.
--
--  O QUE ESTE ARQUIVO FAZ
--  Cria a coluna e recarrega o cache do PostgREST. Pode ser rodado quantas
--  vezes quiser: não apaga nada, não altera nenhum registro existente.
--
--  COMO RODAR
--  Painel do Supabase → SQL Editor → cole tudo → Run.
--  Depois, no app: Configuração → Nuvem → Sincronizar.
--
--  NADA SE PERDE ENQUANTO ISSO. Desde a v217 o que não subiu fica gravado
--  no próprio aparelho e sobe sozinho assim que o banco aceitar.
-- =====================================================================

-- O histórico das passagens pela nutrição: cada entrada guarda desde quando,
-- o motivo, a data de revisão e por que voltou. É o que responde "quantas
-- vezes esta conta já entrou e saiu" seis meses depois — dado sobre a conta,
-- não ruído. Lista vazia é o estado normal de quem nunca entrou em nutrição.
alter table public.oportunidades
  add column if not exists historico_nutricao jsonb not null default '[]'::jsonb;

-- Sem isto o PostgREST continua servindo o desenho antigo das tabelas e
-- recusa a coluna nova, mesmo ela já existindo. É o passo que mais se esquece.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
--  Confirmação. Tem de devolver 'ok'.
-- ---------------------------------------------------------------------
select 'oportunidades.historico_nutricao' as item,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'oportunidades'
      and column_name = 'historico_nutricao')
  then 'ok' else 'FALTA' end as situacao;
