-- Correção 2 — colunas que o app manda e a tabela não tinha.
--
-- Rode no SQL Editor do Supabase. Instalações novas já saem com elas.
--
-- Eram três, e todas dariam o mesmo erro, uma de cada vez:
-- "Could not find the 'X' column of 'Y' in the schema cache".

-- O app carimba a hora da última alteração em todo registro que envia; estas
-- duas tabelas nasceram sem o campo.
alter table public.segmentos    add column if not exists atualizado_em timestamptz default now();
alter table public.tipos_tarefa add column if not exists atualizado_em timestamptz default now();

-- dono é o nome de quem toca a oportunidade, escrito à mão. Não confundir com
-- dono_id, que é o usuário do Supabase: um é texto livre, o outro é vínculo.
alter table public.oportunidades add column if not exists dono text default '';

notify pgrst, 'reload schema';
