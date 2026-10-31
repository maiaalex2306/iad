-- IAD CRM — correção 10: o segmento passa a carregar o mapa do mercado
-- ------------------------------------------------------------------
-- Segmento já era por empresa desde o começo: a tabela tem tenant_id e a
-- política do banco compara com meu_tenant(). Cada empresa já enxerga só os
-- seus. O que faltava era o segmento dizer alguma coisa além do nome.
--
-- Três campos, e cada um responde a uma pergunta que o vendedor faz sozinho
-- toda vez que abre um prospect novo:
--
--   subsegmentos  — "esta empresa é desse segmento?"  (frigorífico é Alimentos)
--   oportunidades — "o que eu vendo para ela?"        (CIP, reúso, ETE)
--   personas      — "com quem eu falo lá dentro?"     (Gerente de Utilidades)
--
-- Texto livre, separado por ponto e vírgula. Não viram tabelas próprias porque
-- ninguém filtra por subsegmento nem cruza persona com persona — isso aqui é
-- material de consulta e de apoio à IA, não chave de relatório. Tabela filha
-- para guardar lista que só se lê inteira é complexidade sem troco.

alter table public.segmentos add column if not exists subsegmentos  text not null default '';
alter table public.segmentos add column if not exists oportunidades text not null default '';
alter table public.segmentos add column if not exists personas      text not null default '';

comment on column public.segmentos.subsegmentos  is 'Tipos de empresa que caem neste segmento, separados por ponto e vírgula.';
comment on column public.segmentos.oportunidades is 'O que se vende para este segmento, separado por ponto e vírgula.';
comment on column public.segmentos.personas      is 'Cargos com quem se fala neste segmento, separados por ponto e vírgula.';
