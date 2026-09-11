-- Colunas que o app escreve e o banco não tinha.
--
-- O sintoma é este, na tela de Configuração, ao sincronizar:
--
--   Não sincronizou: oportunidades: Could not find the 'nutricao' column of
--   'oportunidades' in the schema cache — tarefas: Could not find the
--   'adiamentos' column of 'tarefas' in the schema cache
--
-- A causa é simples e vai se repetir: o app é atualizado sozinho, pelo
-- navegador, e o banco não. Quando um campo novo nasce no código, ele só existe
-- do lado de cá depois que alguém roda o SQL. Até lá a tabela inteira é
-- recusada — não é o campo que falha, é a linha, e com ela a sincronização.
--
-- Rode uma vez. É seguro repetir: `if not exists` não reclama do que já existe.

-- --------------------------------------------------------- oportunidades
-- De onde o negócio veio. Com várias pessoas prospectando, sem isto não dá
-- para dizer qual campanha e qual delas produziram pipeline de verdade.
alter table public.oportunidades add column if not exists origem    text default '';
alter table public.oportunidades add column if not exists campanha  text default '';
alter table public.oportunidades add column if not exists sdr       text default '';
alter table public.oportunidades add column if not exists sdr_email text default '';

-- Nutrição: o negócio que está parado DE PROPÓSITO, com motivo e data para
-- voltar. jsonb porque o app lê e escreve o bloco inteiro, e nulo quer dizer
-- "não está em nutrição" — que é diferente de estar com os campos vazios.
alter table public.oportunidades add column if not exists nutricao  jsonb;

-- --------------------------------------------------------------- tarefas
alter table public.tarefas add column if not exists descricao    text default '';

-- A hora é opcional e existe porque agenda sem hora não é agenda: numa lista
-- com trinta tarefas do mesmo dia, a ordem é a hora.
alter table public.tarefas add column if not exists hora         text default '';

-- Planejada (marquei para fazer) ou registrada (aconteceu e anotei depois). As
-- duas contam igual no funil e não contam igual na metodologia.
alter table public.tarefas add column if not exists origem       text default 'planejada';

alter table public.tarefas add column if not exists com_relato   boolean default false;

-- Tarefa fechada em lote, sem contar o que aconteceu. Não é detalhe de
-- auditoria: é dívida visível. Fechar move o funil e não move nenhuma das oito
-- decisões, e sem esta marca a diferença some da tela.
alter table public.tarefas add column if not exists sem_registro boolean default false;

alter table public.tarefas add column if not exists adiamentos   int default 0;

-- ----------------------------------------------------------- conferência
-- As duas listas têm de sair vazias. Se sobrar alguma coluna aqui, ela ainda
-- falta — e a sincronização daquela tabela continua falhando inteira.
select 'oportunidades' as tabela, c as coluna_que_falta
  from unnest(array['origem','campanha','sdr','sdr_email','nutricao']) c
 where c not in (select column_name from information_schema.columns
                  where table_schema = 'public' and table_name = 'oportunidades')
union all
select 'tarefas', c
  from unnest(array['descricao','hora','origem','com_relato','sem_registro','adiamentos']) c
 where c not in (select column_name from information_schema.columns
                  where table_schema = 'public' and table_name = 'tarefas');
