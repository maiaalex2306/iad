-- IAD CRM — correção 11: a conta guarda o que vem do LinkedIn
-- ------------------------------------------------------------------
-- Quatro campos que faltavam na ficha da empresa. Três vêm do Linked Helper e não tinham onde cair. Sem eles,
-- a importação jogava fora justamente o que a IA usa para escolher o segmento
-- — e o vendedor tinha de ir ao LinkedIn de novo para ver o que a empresa faz.
--
--   descricao  o que ela produz e para quem vende. É daqui que a IA tira o
--              segmento quando o nome não diz nada — "Bio Water Care" não
--              informa nada; "tratamento de água industrial" informa tudo.
--   linkedin   a página da empresa. Para conferir a pessoa certa.
--   pais       porque uf só serve no Brasil.
--   necessidades  o que a empresa precisa resolver. É o único campo da ficha
--              que não é cadastro: é o que o vendedor lê antes de ligar, e o
--              que a IA extrai do dossiê em vez de deixar o dossiê fechado.

alter table public.contas add column if not exists descricao text not null default '';
alter table public.contas add column if not exists linkedin  text not null default '';
alter table public.contas add column if not exists pais      text not null default '';
alter table public.contas add column if not exists necessidades text not null default '';

comment on column public.contas.descricao is 'O que a empresa faz. Matéria-prima da IA para classificar o segmento.';
