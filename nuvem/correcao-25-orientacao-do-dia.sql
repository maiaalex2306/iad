-- =====================================================================
--  correcao-25 — a coluna nova: oportunidades.orientacao
-- =====================================================================
--
--  PARA QUE SERVE
--  A tela Hoje passou a explicar cada negócio: por que ele está urgente ou em
--  prioridade, o que já está atrasado, e o que fazer para acelerar.
--
--  Quase tudo isso é CONTA, feita no próprio aparelho, de graça e na hora —
--  nada disso precisa de banco nem de internet. O que precisa de banco é a
--  parte que a conta não sabe fazer: a leitura que o assistente escreve uma
--  vez por dia depois de ler o texto das conversas, das atas e das notas. É
--  essa leitura que mora aqui.
--
--  POR QUE DENTRO DA OPORTUNIDADE, e não numa tabela nova
--  Porque a leitura só faz sentido ao lado do negócio que ela descreve, e
--  assim ela viaja na sincronização que já existe: nenhum endpoint novo,
--  nenhuma permissão nova, nenhuma segunda verdade para desencontrar.
--
--  O FORMATO
--    {
--      "data":     "2026-10-06",        -- quando foi escrita
--      "versao":   "v227",              -- qual versão do app escreveu
--      "leitura":  "um parágrafo...",   -- o que o assistente entendeu do texto
--      "acelerar": ["...", "..."],      -- jogadas concretas, nas palavras do cliente
--      "risco":    ["...", "..."]       -- o que pode fazer o negócio morrer
--    }
--  Objeto vazio é o estado normal de quem ainda não foi varrido.
--
--  As três listas que a tela mostra PRIMEIRO — por que está urgente, o que
--  está atrasado, o que fazer — não estão aqui porque são cálculo, feito no
--  aparelho. O que está aqui é só o que a conta não sabe fazer: ler texto.
--
--  SE VOCÊ NÃO RODAR ESTE ARQUIVO
--  A tela Hoje funciona inteira, com as três explicações, porque elas são
--  cálculo. O que não acontece é a leitura do assistente ser GUARDADA: ela
--  seria refeita a cada dia e perdida a cada recarregamento, e a faixa laranja
--  de "o banco está atrás do aplicativo" vai aparecer e travar o envio da
--  carteira — o PostgREST recusa o lote inteiro por causa de uma coluna que
--  não conhece. Então rode.
--
--  COMO RODAR
--  Painel do Supabase → SQL Editor → cole tudo → Run.
--  Depois, no app: Configuração → Nuvem → Sincronizar.
--
--  Pode ser rodado quantas vezes quiser: não apaga nada, não altera nenhum
--  registro existente. E nada se perde enquanto isso — desde a v217 o que não
--  subiu fica gravado no aparelho e sobe sozinho assim que o banco aceitar.
-- =====================================================================

alter table public.oportunidades
  add column if not exists orientacao jsonb not null default '{}'::jsonb;

-- Sem isto o PostgREST continua servindo o desenho antigo das tabelas e
-- recusa a coluna nova, mesmo ela já existindo. É o passo que mais se esquece.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
--  Confirmação. Tem de devolver 'ok'.
-- ---------------------------------------------------------------------
select 'oportunidades.orientacao' as item,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'oportunidades'
      and column_name = 'orientacao')
  then 'ok' else 'FALTA' end as situacao;
