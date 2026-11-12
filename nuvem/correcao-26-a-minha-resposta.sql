-- =====================================================================
--  correcao-26 — a coluna nova: caixas_email.marcas
-- =====================================================================
--
--  O PROBLEMA QUE ISTO RESOLVE
--  O IAD lia só a caixa de ENTRADA. As respostas que o vendedor escreve pelo
--  Gmail — do celular, antes de abrir o app — nunca passam pela entrada: elas
--  nascem direto na pasta de enviados. Resultado: a conversa aparecia com o
--  cliente falando sozinho.
--
--  Não era só feio. Quem lê depois — a pessoa, o histórico da conta e o
--  assistente que avalia a negociação — via um pedido do cliente sem resposta
--  nenhuma. Era mentira, e era mentira que PIORAVA a nota de um negócio bem
--  tocado: o vendedor tinha proposto uma reunião presencial e o sistema
--  registrava silêncio.
--
--  POR QUE PRECISA DE COLUNA NOVA
--  Para ler duas pastas é preciso saber até onde cada uma já foi lida — e
--  `ultimo_uid`, que existe desde a correcao-19, é UM número só.
--
--  UID de IMAP vale dentro de uma pasta, e só. O UID 900 da caixa de entrada e
--  o UID 900 dos enviados são mensagens diferentes, sem nenhuma relação entre
--  si. Com um marcador único, a segunda pasta começaria no número da primeira
--  e tudo o que estivesse abaixo dele jamais seria lido — sem erro nenhum na
--  tela, que é a pior forma de uma leitura falhar.
--
--  O FORMATO
--    {
--      "INBOX":                      { "uid": 1841, "validade": 17 },
--      "[Gmail]/E-mails enviados":   { "uid":  623, "validade": 11 }
--    }
--
--  `uid`      — o maior UID já lido naquela pasta.
--  `validade` — o UIDVALIDITY que o servidor informou quando a pasta foi
--               aberta. Quando ele MUDA, o servidor está dizendo que
--               renumerou tudo; continuar do número guardado leria mensagem
--               errada ou pularia a pasta inteira em silêncio. Então aquela
--               pasta recomeça como se fosse a primeira leitura: as mais
--               recentes, e o arquivo antigo fica no servidor.
--
--  Objeto vazio é o estado normal de quem ainda não foi lido depois desta
--  mudança. A função semeia a primeira pasta com o `ultimo_uid` que já
--  existia, então NINGUÉM recebe de novo o que já recebeu.
--
--  A PASTA DE ENVIADOS NÃO PRECISA SER CONFIGURADA
--  Ela não tem nome fixo: é "[Gmail]/E-mails enviados" numa conta em
--  português, "[Gmail]/Sent Mail" em inglês, "Sent Items" no Outlook,
--  "INBOX.Sent" em servidor próprio. A função PERGUNTA ao servidor (o
--  atributo \Sent do RFC 6154), grava o nome em `caixas_email.pastas` e não
--  pergunta de novo. Se o seu servidor chamar a pasta de outra coisa e não
--  marcar o atributo, dá para escrever o nome à mão nessa mesma coluna.
--
--  SE VOCÊ NÃO RODAR ESTE ARQUIVO
--  A leitura continua funcionando exatamente como antes — só a caixa de
--  entrada. A função tenta gravar `marcas`, o PostgREST recusa a coluna que
--  não conhece, e a atualização da caixa falha: o estado fica em erro e a
--  marca não avança, o que faz a MESMA rodada se repetir para sempre. Ou
--  seja: sem rodar, você não ganha os enviados e ainda perde a entrada.
--  Então rode.
--
--  É SEGURO RODAR DUAS VEZES. Só acrescenta.
-- =====================================================================

-- ------------------------------------------------------------------
-- 1. ATÉ ONDE A LEITURA DE CADA PASTA JÁ CHEGOU
-- ------------------------------------------------------------------
alter table public.caixas_email
  add column if not exists marcas jsonb not null default '{}'::jsonb;

comment on column public.caixas_email.marcas is
  'Até onde a leitura chegou em CADA pasta: {"INBOX":{"uid":1841,"validade":17}}. '
  'UID de IMAP vale dentro de uma pasta só, por isso o marcador não pode ser único.';

-- ------------------------------------------------------------------
-- 2. O POSTGREST PRECISA SER AVISADO
--
-- Sem isto a coluna existe no banco e não existe para a API: a função
-- continuaria recebendo "column caixas_email.marcas does not exist" com a
-- coluna criada na frente dela.
-- ------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ------------------------------------------------------------------
-- 3. CONFERÊNCIA
--
-- Deve devolver uma linha, com marcas = 't'.
-- ------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'caixas_email'
              and column_name = 'marcas') as marcas,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'caixas_email') as colunas_da_caixa;
