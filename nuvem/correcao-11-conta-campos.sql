-- IAD CRM — correção 11: a conta guarda o que vem do LinkedIn
-- ------------------------------------------------------------------
-- Quatro campos que o Linked Helper entrega e não tinham onde cair. Sem eles,
-- a importação jogava fora justamente o que a IA usa para escolher o segmento
-- — e o vendedor tinha de ir ao LinkedIn de novo para ver o que a empresa faz.
--
--   setor      o que o mercado chama a empresa (Farmacêutica, Saneamento).
--              Não é o nosso `segmento`: aquele é a gaveta comercial desta
--              empresa, e cada uma tem a sua lista. Guardar os dois é o que
--              deixa conferir de onde veio o palpite da IA.
--   descricao  o que ela produz e para quem vende. É daqui que a IA tira o
--              segmento quando o nome não diz nada — "Bio Water Care" não
--              informa nada; "tratamento de água industrial" informa tudo.
--   linkedin   a página da empresa. Para conferir a pessoa certa.
--   pais       porque uf só serve no Brasil.

alter table public.contas add column if not exists setor     text not null default '';
alter table public.contas add column if not exists descricao text not null default '';
alter table public.contas add column if not exists linkedin  text not null default '';
alter table public.contas add column if not exists pais      text not null default '';

comment on column public.contas.setor     is 'Setor de mercado, como o LinkedIn o chama. Diferente de segmento, que é a gaveta comercial da empresa que usa o CRM.';
comment on column public.contas.descricao is 'O que a empresa faz. Matéria-prima da IA para classificar o segmento.';
