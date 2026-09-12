-- IAD CRM — correção 15: o item da oportunidade e o tipo de cobrança
-- ------------------------------------------------------------------
-- Duas tabelas que se confundiam. O CATÁLOGO é o que a empresa vende: uma lista
-- só, do gestor, com preço de referência. Os ITENS são o que CADA negócio leva
-- — quantidade, preço negociado e desconto, que são da negociação.
--
-- Os itens continuam em jsonb dentro da oportunidade, como sempre estiveram:
-- são lidos e escritos inteiros pelo app, e ninguém consulta item solto. O que
-- muda é o conteúdo de cada linha, que agora carrega id próprio, o nome e o
-- preço de tabela congelados no dia em que entrou, a recorrência e o desconto.
--
-- Congelar o preço de tabela é o ponto. Sem isso, o gestor sobe o preço em
-- março e a proposta enviada em janeiro passa a dizer outra coisa.
--
-- O campo que muda todo o resto é o tipo de cobrança. Sem ele, 10 mil de
-- implantação e 10 mil por mês são o mesmo número dentro do sistema — e não são
-- a mesma coisa em lugar nenhum do mundo. Por isso os dois nunca somam na tela:
-- aparecem em linhas separadas, e o valor do negócio é a conta explícita entre
-- eles, com o prazo do contrato à vista.

alter table public.produtos
  add column if not exists tipo_cobranca text not null default 'unico';

alter table public.oportunidades
  add column if not exists prazo_contrato_meses int not null default 12;

alter table public.oportunidades
  add column if not exists valor_mensal numeric not null default 0;

comment on column public.produtos.tipo_cobranca is
  'unico ou mensal. É só o padrão que o item traz ao entrar num negócio; lá dentro continua editável.';
comment on column public.oportunidades.prazo_contrato_meses is
  'Por quantos meses o valor mensal entra no valor do negócio.';
comment on column public.oportunidades.valor_mensal is
  'Soma dos itens mensais. Nunca somado ao valor único: valor = unico + mensal * prazo_contrato_meses.';
