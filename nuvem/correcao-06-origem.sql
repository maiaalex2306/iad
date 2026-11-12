-- Correção 6 — de onde o negócio veio, e de quem.
--
-- Rode no SQL Editor do Supabase, uma vez. Sem estas colunas, a sincronização
-- das oportunidades falha com "Could not find the 'origem' column of
-- 'oportunidades' in the schema cache".
--
-- Por que elas existem: com várias SDRs mandando prospect de segmentos
-- diferentes, a pergunta "qual campanha e qual pessoa produziram pipeline de
-- verdade?" só tem resposta se a origem estiver em campo próprio. Dentro das
-- notas ela não é agrupável, não é filtrável e não vira gráfico.

alter table public.oportunidades add column if not exists origem     text default '';
alter table public.oportunidades add column if not exists campanha   text default '';
alter table public.oportunidades add column if not exists sdr        text default '';
alter table public.oportunidades add column if not exists sdr_email  text default '';

-- O PostgREST guarda o desenho das tabelas em cache. Sem este aviso, ele
-- continua recusando as colunas novas mesmo depois de criadas.
notify pgrst, 'reload schema';
