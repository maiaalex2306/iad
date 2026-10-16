-- =====================================================================
--  correcao-27 — a coluna nova: oportunidades.quadro
-- =====================================================================
--
--  O QUE ELA GUARDA
--  O quadro financeiro da proposta: o que foi lido dos arquivos do negócio
--  (escopo, equipamentos, serviços, premissas comerciais) já separado em
--  entrada, mensalidade e cenários — e, a partir daí, tudo o que o vendedor
--  editou em cima disso.
--
--  POR QUE UMA COLUNA SÓ, E JSONB
--  Porque o quadro é um documento, não uma tabela. As linhas de um quadro só
--  fazem sentido dentro dele: a mesma linha de "operação assistida" entra no
--  cenário WaaS e não entra no cenário Venda, e esse "entra/não entra" é do
--  quadro, não da linha. Quebrar isso em quatro tabelas relacionadas daria
--  quatro vezes mais código para responder a uma pergunta que ninguém faz
--  ("todas as linhas de todos os quadros de todos os negócios").
--
--  Quando houver proposta com número, versão e estado — que é a outra metade
--  do estudo em estudos/PROPOSTAS.md — AÍ será tabela, porque aí a pergunta
--  "quantas propostas expiraram sem resposta neste trimestre" passa a
--  existir, e ela atravessa negócios.
--
--  O FORMATO, resumido
--    {
--      "arquivos":  [{"nome":"Propostas Heineken.docx","letras":1840}],
--      "escopo":    [{"grupo":"Sentinela Orgânica","item":"Sensor de pH","quantidade":1}],
--      "linhas":    [{"rotulo":"Analisador eletroquímico","valor":29106.28,
--                     "quantidade":1,"tipo":"unico","cenarios":{"c3":true},
--                     "origem":"planilha, aba Precificação"}],
--      "premissas": [{"rotulo":"Segmento alimentos","percentual":20,
--                     "incideEm":"mensal","ligada":true}],
--      "cenarios":  [{"id":"c1","nome":"WaaS"},{"id":"c2","nome":"Adaptável"}],
--      "prazoMeses": 12, "validadeDias": 30
--    }
--
--  `null` é o estado normal: a maioria dos negócios nunca chega a ter um
--  quadro montado, e um objeto vazio em cada registro seria peso subindo e
--  descendo em toda sincronização sem dizer nada.
--
--  SE VOCÊ NÃO RODAR ESTE ARQUIVO
--  A aba Propostas monta o quadro, calcula e mostra tudo — isso é do
--  navegador. Mas na primeira tentativa de salvar, o PostgREST recusa a
--  coluna que não conhece, E RECUSA O LOTE INTEIRO: o envio manda a tabela
--  toda de uma vez. Ou seja, não é o quadro que para de subir — é a carteira.
--  Então rode antes de usar a tela.
--
--  É SEGURO RODAR DUAS VEZES. Só acrescenta, não altera registro nenhum.
--
--  COMO RODAR
--  Painel do Supabase → SQL Editor → cole tudo → Run.
--  Depois, no app: Configuração → Nuvem → Sincronizar agora.
-- =====================================================================

-- ------------------------------------------------------------------
-- 1. A COLUNA
-- ------------------------------------------------------------------
alter table public.oportunidades
  add column if not exists quadro jsonb;

comment on column public.oportunidades.quadro is
  'Quadro financeiro da proposta: escopo, linhas (única/mensal), premissas e '
  'cenários de forma de negócio, lidos dos arquivos e editados pelo vendedor. '
  'Entrada e mensalidade nunca somam: só o total do contrato junta as duas, e '
  'lá o prazo está na conta. null = negócio sem quadro montado.';

-- ------------------------------------------------------------------
-- 2. O POSTGREST PRECISA SER AVISADO
--
-- Sem isto a coluna existe no banco e não existe para a API: o envio
-- continuaria recebendo "column oportunidades.quadro does not exist" com a
-- coluna criada na frente dele. É o passo que mais se esquece.
-- ------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ------------------------------------------------------------------
-- 3. CONFERÊNCIA. Tem de devolver 'ok'.
-- ------------------------------------------------------------------
select 'oportunidades.quadro' as item,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'oportunidades'
      and column_name = 'quadro')
  then 'ok' else 'FALTA' end as situacao;
