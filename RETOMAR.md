# Onde paramos — 15/09/2026, fim da noite

Este arquivo existe para a próxima sessão começar sabendo o que já aconteceu.
Conversa não sobrevive; arquivo commitado sim. **Atualize junto com o que for
feito** — um mapa desatualizado custa mais caro que mapa nenhum, porque ele é
obedecido.

Publicado agora: **v191**, em <https://maiaalex2306.github.io/iad/>
O carimbo da versão fica no alto do **Manual**. Se não disser v191, o aparelho
está com cache velho: Ctrl+Shift+R no computador, ou fechar e reabrir o app.

---

## 0. A mudança de fundo — v180, 17/09

**O navegador não guarda mais carteira.** O servidor é a única fonte.

Tudo o que deu errado nesta semana saiu da decisão oposta: o `localStorage`
era a verdade e o servidor uma cópia. O depósito é do NAVEGADOR e não do
login, então a carteira de uma empresa aparecia no aparelho de outra; o envio
podia falhar calado e dois computadores mostravam números diferentes; e a
proteção contra gravar vazio por cima gerou faixas, cópias de segurança e
botões que ofereciam a carteira alheia. Corrigi cada um em separado por dois
dias, e o cano continuava furado no mesmo lugar.

Agora: a memória é a única cópia local e morre com a aba; abrir o app baixa do
servidor (e sem servidor a tela é "Sem conexão", não uma tela vazia); cada
alteração sobe na hora, com faixa que não sai enquanto não subir; excluir
finalmente chega ao servidor — o envio sempre foi só `upsert`, e apagar nunca
viajava. O que estava guardado de antes é apagado na primeira abertura, em
qualquer aparelho.

Saíram: "Carregar demonstração" e "Apagar tudo" (publicariam ficção ou
esvaziariam a tela sem tocar no servidor) e a cópia de segurança local.

**O que isso custa:** sem internet o app não abre. Foi decisão do Alexandre,
consciente. E cada alteração manda a carteira inteira — tudo bem no tamanho de
hoje, vai precisar virar envio por tabela quando crescer.

---

## 0-B. Sinais do comprador — v185, 18/09

**A segunda metade do relógio.** Até a v184 o IAD só sabia o que o VENDEDOR
registrou. A régua das oito decisões mede evidência, e evidência é coisa que
alguém digita depois de uma conversa. Isso não mudou e não deve mudar.

O que faltava era o que o COMPRADOR faz sozinho: respondeu, abriu, voltou,
mudou de cargo. O app via esses fatos passarem — na conversa do WhatsApp, na
campanha — e jogava fora, porque não tinha onde guardar.

Agora tem: a tabela `sinais`, coleção própria, sincronizada como as outras.

**A regra que não se negocia:** sinal NÃO é evidência. Não zera a Idade da
Evidência, não mexe no IAD, não entra em `saude()` nem em `classificar()`. Um
clique não é um problema reconhecido, e tratar comportamento como decisão
transformaria o IAD num contador de cliques — que é o que todo CRM já é, e o
motivo de nenhum deles saber dizer se o negócio existe.

A ponte entre os dois é **Promover a evidência**, e ela é humana de propósito:
quem diz que abrir a proposta três vezes comprova Prioridade é uma pessoa que
conhece a conta. A força entra como `relato`, porque é o que ela é.

**O que o sinal faz de útil**, e é só uma coisa: `E.momento(op)`. Quando há
sinal forte (peso ≥ 2) dentro de 21 dias E a evidência está parada há mais de
14 dias E o sinal é mais novo que a evidência, o app diz *"o comportamento
está N dias à frente do registro"*. Duas condições, as duas necessárias — sem
a segunda isto tocaria em toda conta ativa e seria desligado na primeira
semana, como todo alerta que toca sempre.

Esse alerta sai com `tipo: 'momento'` e `nivel: 'alto'`, então aparece no
cockpit (aba **Sinais**, com contador) e nos riscos críticos do Painel, com ⏱
em vez de ⚠ — é o único aviso deste app que é boa notícia.

**Captura automática:** o WhatsApp alimenta sozinho (`W.colherSinais()`, roda
junto com a busca das conversas). Um sinal por conversa por DIA, não por
mensagem; conversa sem dono não vira sinal; a carga de histórico de 6 meses
fica de fora. Idempotente pelo par (`fonte`, `externoId`).

**Falta rodar no banco:** `nuvem/correcao-17-sinais.sql`. Até rodar, a tabela
`sinais` falha no envio e o app avisa qual coluna falta.

**Onde está:** taxonomia em `src/playbook.js` (`TIPOS_SINAL`, 23 tipos em 9
canais, peso 1–3); CRUD em `src/store.js`; relógio e alerta em `src/engine.js`;
aba e cartões em `src/views.js`; ações em `src/app.js`; colheita em
`src/whatsapp.js`.

---

## 0-C. Links rastreados — v185, 18/09

**Correção de um erro meu:** eu disse que `src/documentos.js` já era a base
para rastrear abertura de documento. Não é. Aquele arquivo é um LEITOR — abre
docx/xlsx/pdf que o vendedor sobe, para extrair texto e mandar à IA. E
`src/arquivos.js` guarda anexos em IndexedDB, só neste aparelho, sem
compartilhar com ninguém. **Nunca houve documento que o cliente pudesse
abrir**, logo não havia o que rastrear.

O caminho certo não é hospedar arquivo (nem deve ser: a proposta já mora no
Drive do vendedor). É **guardar um desvio**. A ponte do Linked Helper já é
infraestrutura pública com chave por empresa, então ela ganhou três rotas:

| rota | chave | para quê |
|---|---|---|
| `POST /links` | leitura | emite o desvio, devolve `{id, url}` |
| `GET /r/<id>` | nenhuma | anota a passagem e redireciona (é o cliente que clica) |
| `GET/POST /aberturas` | leitura | o app busca e dá baixa |

**Um link por PESSOA**, e é o ponto todo: com um link só para a conta,
"alguém abriu" não diz quem. Com um por pessoa, a proposta aberta por quem
nunca esteve numa reunião é o comitê de compra aparecendo sozinho.

Decisões que valem lembrar:

- O id do link é aleatório e **não carrega o UUID da empresa**. O link vai
  para fora; espalhar o identificador desmontaria por fora o isolamento que a
  ponte constrói por dentro.
- **Nenhum IP é guardado.** Sabemos de quem é o link porque nós o emitimos.
- Verificador de link de caixa corporativa é marcado como robô e descartado no
  app (não na ponte: lá o registro fica, para conferir quando a lista errar).
- `302` e não `301`: o permanente ficaria no cache do navegador e a VOLTA ao
  documento — o sinal mais forte da lista — nunca mais chegaria.
- A baixa vem depois de gravar, nunca antes.
- 90 dias de validade, contra 30 dos leads: proposta fica mais tempo em cima
  da mesa, e link morto no meio da negociação é o app estragando a venda.

**Falta publicar:** `ponte/worker.js` no Cloudflare (agora com 364 linhas —
confira com Ctrl+F por `chaveDoLink`). Enquanto não publicar, o botão "Link
rastreado" responde que a ponte ainda não conhece links rastreados.

**Onde está:** rotas em `ponte/worker.js`; cliente em `src/integracoes.js`
(`emitirLink`, `aberturas`, `colherAberturas`); diálogo em `src/app.js`
(`linkRastreado`); botão na aba Sinais em `src/views.js`.

**Feito pelo Alexandre em 18/09:** o SQL rodou e o worker foi publicado.

---

## 0-D. Duas seções novas no Manual — v186, 18/09

- **O dia do vendedor: o que alimentar, o que você recebe** (`m-dia`). O manual
  já tinha "O caminho do vendedor", que é o ciclo de UM negócio. Faltava o
  outro corte: o dia, com trinta negócios ao mesmo tempo. Termina com a tabela
  que responde a pergunta que todo vendedor faz sobre qualquer CRM — *o que eu
  ganho por preencher isto?* — em três colunas: alimenta / recebe / onde.
- **Sinais: o que o comprador faz sozinho** (`m-sinais`). A regra antes da
  funcionalidade, porque quem não entender que sinal não é evidência vai
  promover tudo no primeiro dia e estragar a régua. Inclui o passo a passo do
  link rastreado e um teste que o próprio vendedor faz sozinho.

Também corrigido o subtítulo do Manual, que dizia *"funciona offline: está tudo
guardado no aparelho"* — verdade até a v180 e mentira desde então.

E `.passo-manual .numero` ganhou a variante `.quando`: o círculo de 28px foi
feito para um dígito, e com uma palavra dentro ("uma vez na semana") o texto
transbordava.

---

## 0-E. Juntar negociações — v187, 18/09

**O defeito:** a importação do LH abria uma negociação por empresa **por
campanha**. Duas campanhas tocando a mesma conta abriam dois cartões do mesmo
negócio. Apareceu na carteira do Alexandre: a mesma Suzano — uma conta só, 8
contatos — com **IAD 0 num cartão e IAD 16 no outro**. Se é o mesmo negócio,
um dos dois números é mentira.

O comentário de `oportunidadeJaExistente` já avisava do risco ("o índice
partido ao meio") e protegia só o caso em que NÃO havia nenhuma negociação de
LH aberta. Campanha diferente passava batido.

**Três coisas, e todas testadas no navegador:**

1. **`Store.juntarOportunidades(ficaId, vaiId)`.** Move eventos (reordenados
   por data), snapshots, stakeholders (união), itens, tarefas, sinais e
   anexos. As notas das oito ficam no **maior dos dois** — e só porque a
   evidência que as sustenta vem junto; média rebaixaria decisão comprovada e
   soma inventaria decisão que não houve. Campos em branco na que fica são
   emprestados pela outra; as notas de texto são emendadas, nunca
   sobrescritas. **Valor, previsão e etapa não mudam** — são números que
   alguém escolheu, e mexer neles durante uma limpeza é como a previsão do
   mês muda sem ninguém saber por quê. Um evento de histórico registra a
   junção, para "onde foi parar aquele negócio" ter resposta.

   Recusa: negociações de empresas diferentes (manda juntar as empresas
   primeiro) e qualquer uma encerrada.

   **Junta em vez de encerrar**, e a diferença não é estética: encerrar a
   duplicata como desistência a contaria como negócio perdido, e o Aprendizado
   passaria a aprender com um erro de cadastro.

2. **A fila na Revisão** — `Store.contasComMaisDeUmNegocio()` lista as
   empresas com mais de uma negociação aberta, ordenadas por IAD, marcando
   como `suspeita` a que não tem nota, nem evidência, nem valor. Nem toda
   linha é erro; a tela mostra as duas lado a lado e quem decide é quem
   conhece a conta.

3. **A importação pergunta.** Quando um lead abriria uma segunda negociação
   numa empresa que já tem uma, a tela de revisão mostra uma caixa **marcada**
   — "é a mesma negociação que já está aberta" — com o IAD e a contagem de
   evidências da existente. Desmarcar cria a separada. O padrão é marcado (ao
   contrário da caixa da empresa, que protege contra o excesso) porque o erro
   que já aconteceu foi o cartão a mais, e juntar negociação agora tem
   conserto.

**Anexos** moram no IndexedDB, fora do estado, então vão por fora:
`IADArquivos.repontar(deOpId, paraOpId)`, chamado por `App.juntarOportunidades`
depois que o store termina. Falhar ali não desfaz o resto e a mensagem diz o
que ficou.

**Conversas de WhatsApp** apontando para a que morreu se curam sozinhas: o
`oportunidade_id` gravado deixa de resolver e o casamento cai para o contato,
que leva à sobrevivente. A linha no servidor fica com um id velho e inofensivo.

**Onde está:** `juntarOportunidades`, `podeJuntarOportunidades` e
`contasComMaisDeUmNegocio` em `src/store.js`; `repontar` em
`src/arquivos.js`; `juntarComOutra` e `juntarOportunidades` em `src/app.js`;
`filaDeDuplicatas`, `juntarNaNegociacao` e o botão da barra em `src/views.js`;
`marcarNegociacaoParalela` em `src/app.js`.

---

## 0-F. A colheita das aberturas só rodava no boot — v188, 18/09

**Sintoma do Alexandre:** emitiu um link rastreado, a pessoa clicou, e não
apareceu nada na aba Sinais. Ele acabou registrando à mão.

**Causa:** `colherAberturas()` era chamada só depois de `puxar()`, no boot e na
entrada. A abertura estava na ponte o tempo todo; ninguém tinha ido buscar.
Recarregar a página resolvia — que é a pior instrução que um app pode dar.

**Consertos:**

1. **Abrir a aba de Sinais busca.** `App.abaCockpit('sinais')` dispara a
   colheita. A busca acontece onde a pergunta é feita.
2. **O estado fica à vista.** Uma linha no cartão diz quando foi a última
   colheita e o que ela achou, com os botões **Buscar aberturas agora** e
   **O que a ponte viu**. Colheita que falha calada é indistinguível de
   colheita que não achou nada, e as duas pedem coisas opostas de quem lê.
   Quando não dá para colher — sem empresa escolhida, ponte não configurada —
   a linha vira aviso com o motivo, em vez de silêncio.
3. **A baixa deixou de apagar o que foi descartado.** Era um defeito de
   verdade e contradizia o próprio estudo: `colherAberturas` marcava TODAS as
   aberturas como processadas, robôs inclusive, e a ponte as apagava. Uma
   abertura de gente classificada como robô por engano sumia dos dois lados
   para sempre. Agora a baixa vai só no que virou sinal; o resto fica na ponte
   até expirar em 30 dias.
4. **`diagnosticoDasAberturas()`** mostra o que a ponte tem, sem filtrar e sem
   dar baixa. "Cliquei e não apareceu nada" tem três causas com consertos
   diferentes — a ponte não viu, viu e marcou robô, ou a colheita não rodou —
   e este botão separa as três.

**Onde está:** `diagnosticoDasAberturas` e a baixa corrigida em
`src/integracoes.js`; `colherAberturas`, `buscarAberturas`,
`verAberturasNaPonte` e o gatilho da aba em `src/app.js`; `linhaDaColheita` em
`src/views.js`.

---

## 0-G. E-mail: o miolo — v189, 18/09

**A decisão de arquitetura, tomada com o Alexandre em 18/09:** senha de
aplicativo, não OAuth.

O estudo tinha descartado o IMAP porque "guardar senha de e-mail de outra
pessoa é responsabilidade que eu não assumiria". Isso vale para **senha da
conta** e não para **senha de aplicativo**: ela serve a um programa só, não dá
acesso ao login nem ao resto da conta Google, e se revoga num clique. Com ela,
SMTP resolve o enviar e IMAP resolve o receber — **sem domínio, sem DNS, sem
verificação do Google, sem auditoria anual e sem TI**, que é exatamente o
requisito "qualquer usuário e qualquer domínio".

O preço, dito em voz alta: a credencial mora num segredo da Edge Function,
criptografada, e um servidor comprometido expõe caixas de clientes. O OAuth
continua sendo melhor para cliente grande, e a Microsoft é o caminho mais
barato dos dois. Ver `estudos/EMAIL.md` §8.

**O que foi construído agora (o miolo, que serve a qualquer transporte):**

- **`nuvem/correcao-18-emails.sql`** — duas tabelas. `emails` (21 colunas) tem
  como chave primária o **Message-ID**, que é a única marca que atravessa
  servidores e o que impede a mesma mensagem de entrar duas vezes.
  `caixas_email` (16 colunas) guarda o endereço e o estado — **a senha não
  entra ali**, e a política é mais apertada que a das outras tabelas: só o dono
  e o administrador, porque caixa de e-mail é de uma pessoa, e o gestor que vê
  a carteira da equipe não vê a configuração de e-mail de cada um.
- **`src/email.js`** (NEW) — o irmão do `whatsapp.js`. Busca, casa e agrupa por
  conversa. O casamento tem três camadas: gravado → endereço exato → domínio.
  **Provedor gratuito está fora da camada de domínio**, numa lista explícita:
  casar `@gmail.com` com a primeira conta que tiver um contato do Gmail juntaria
  pessoas que não têm nada a ver umas com as outras, e esse erro não se desfaz
  sozinho.
- **A aba E-mail deixou de ser "por construir"** — mostra a conversa como ela
  aconteceu, com **Escrever**, **Responder** e um botão que leva ao caminho de
  sempre para virar evidência (tarefa com relato). Contador de não lidas na aba.
- **Escrever** grava com estado `fila`; quem manda é o servidor. O navegador
  nunca vê credencial. **O Message-ID nasce no app**, de propósito: é ele que a
  resposta do cliente devolve, e é por isso que ela cai na negociação certa sem
  adivinhação.

**Testado no navegador** com o caso real: o e-mail da Ana Luiza casou pelo
endereço (com nome e maiúsculas no cabeçalho); um endereço novo `@suzano.com.br`
casou a EMPRESA e caiu na fila de casar a pessoa; um `@gmail.com` desconhecido
não casou com nada, como tem de ser. A resposta saiu com thread e `responde_a`
corretos.

**Falta para funcionar de verdade:**

1. Rodar `nuvem/correcao-18-emails.sql`.
2. O Alexandre gerar a senha de aplicativo na conta Google (exige 2FA ligada).
3. **A Edge Function do transporte** — a que lê o IMAP e manda pelo SMTP. É o
   próximo pedaço, e é o único que toca na credencial.

---

## 0-H. O e-mail recebido vira evidência e tarefa — v190, 18/09

**O pedido do Alexandre:** todo e-mail recebido tem de ser analisado pela IA,
promover as mudanças, chegar a criar a tarefa — *"Ana da Suzano pediu os
dados…"* — e depois ficar marcado como analisado, para não reanalisar sempre.

**A máquina de analisar já existia:** é a mesma que lê ata de reunião
(`IA.analisarReuniao` + `App.aplicarLeituraDaIA`). O que faltava era o gatilho,
a marca e a tarefa.

**O que foi construído:**

- **`nuvem/correcao-19-analise-do-email.sql`** — `analisada_em`, `analise`
  (jsonb com o que concluiu), `analise_erro` e `analise_tentativas` em
  `emails`; `ultimo_uid` e `pastas` em `caixas_email`. São duas marcas
  diferentes e as duas precisam existir: a primeira impede **reanalisar**, a
  segunda impede **rebaixar** a caixa inteira a cada rodada do IMAP.
- **`aplicarLeituraDaIA` ganhou modo silencioso.** A análise roda em lote, no
  fundo; uma janela de resumo por mensagem seria trinta janelas na cara de
  quem só abriu o app. No silêncio o resumo volta para quem chamou.
- **A tarefa nasce do compromisso**, e só quando o dono somos **nós**. O que
  ficou para o cliente fazer já é o próximo compromisso da negociação;
  transformá-lo em tarefa nossa encheria a agenda de coisas que não dependem
  de nós — que é como uma lista de tarefas perde credibilidade. O título sai
  como *"Ana da Suzano: Mandar os dados de consumo e a memória de cálculo do
  ROI"*, com a data do combinado e a decisão-alvo.

**Quatro travas, cada uma com um motivo:**

1. Só entrada, e só com negociação casada — analisar e-mail sem saber a que
   negócio pertence é gastar chamada para jogar o resultado fora.
2. Resposta automática, remetente de máquina (`no-reply`, `mailer-daemon`…) e
   corpo com menos de 60 caracteres são marcados como analisados **sem gastar
   chamada nenhuma**. "Estou de férias" não move decisão.
3. Cinco por rodada, em fila, nunca em paralelo: o provedor tem limite, e cinco
   chamadas simultâneas voltam todas com erro — e aí as cinco contam tentativa
   sem terem sido lidas.
4. Três tentativas e para. Assistente fora do ar não pode virar um laço que
   consome cota a cada abertura do app.

**Testado no navegador, com os quatro casos:** o e-mail de verdade da Ana subiu
Prioridade de 0 para 2, zerou a Idade da Evidência (90 → 2 dias), gravou a
evidência e **criou a tarefa**; os três de ruído foram marcados sem chamada; e a
**segunda rodada não reanalisou nada** — fila 0, IAD parado em 4, uma tarefa só.

**Onde está:** `analisarEmailsNovos`, `analisarUm`, `tarefaDoCompromisso` e
`ehRuido` em `src/app.js`; `marcarEmailAnalisado` e `contarTentativaDeAnalise`
em `src/nuvem.js`; `linhaDaAnalise` em `src/views.js`.

---

## 0-I. O transporte: o IAD entra na caixa e manda a resposta — v191, 18/09

Faltava a última peça, e era a única que toca a senha: a Edge Function que
**entra na caixa de e-mail de verdade**. Sem ela, tudo o que veio antes — as
tabelas, o casamento, a análise, a tela — estava pronto para mensagens que
ninguém trazia.

**`nuvem/funcoes/email/` — dois arquivos, de propósito:**

- **`mime.ts` (288 linhas)** é puro: não toca em rede, não toca em senha, não
  usa nada do Deno. É onde mora toda a parte chata do e-mail — cabeçalho
  dobrado, acento em `=?UTF-8?B?`, multipart, anexo que não pode virar corpo,
  HTML para texto, o corte da conversa citada. Sendo puro, ele é **testável
  fora do servidor**: **26 testes, 26 passando**. É a parte onde os erros se
  escondem, e agora é a parte com prova.
- **`index.ts` (500 linhas)** é o transporte: IMAP por TLS, SMTP por TLS,
  **zero bibliotecas**. Biblioteca de e-mail é alvo clássico exatamente porque
  quem a comprometesse passaria a ler a correspondência de todos os clientes
  de todo mundo que a usa. IMAP e SMTP são protocolos de linha, antigos e
  chatos — não difíceis.

**A leitura não mexe na caixa.** `BODY.PEEK`, e mais nada: não marca como lido,
não apaga, não move. Se um defeito aqui estragasse a caixa de e-mail de alguém,
isso não se desfaz.

**Testado contra um servidor de mentira** que fala IMAP e SMTP dentro da
memória — **33 testes, 33 passando**. Três deles existem porque o código
original falhava neles:

1. **A armadilha.** Um e-mail cujo *corpo* contém a linha `a3 OK FETCH
   completed` e um `* 99 FETCH (UID 999 BODY[] {12}` logo abaixo. Com marcas
   fixas (`a1`, `a2`, `a3`), bastaria um cliente escrever isso — falando de
   log, o que acontece sozinho — para a leitura parar no meio e o resto da
   caixa virar lixo, e para uma mensagem inventada entrar no banco. Agora a
   marca de cada comando é **sorteada na conexão**, e o corpo é pulado pelo
   **tamanho em bytes** antes de qualquer decisão sobre a mensagem.
2. **O EHLO de várias linhas.** Resposta de SMTP tem linhas do meio com traço
   (`250-SIZE`) e só a última com espaço (`250 HELP`). Parar na primeira
   deixava o resto no socket, e essas linhas apareciam como resposta do
   comando seguinte — o envio falharia só em servidor que anuncia muita
   extensão, que é o Gmail.
3. **A data do IMAP.** `INTERNALDATE` vem como `18-Sep-2026 14:22:01 +0000`,
   com traços que não são padrão em lugar nenhum. `new Date` disso devolve
   `NaN` em boa parte dos motores, e `toISOString()` de `NaN` **lança** — uma
   caixa inteira falharia por causa de um formato de data.

Mais duas travas que não vieram de teste: nada atravessa uma quebra de linha
para dentro de um cabeçalho (é como um formulário de contato vira disparador de
spam), e o acumulado do socket é examinado só pelo **fim** — reexaminar a caixa
inteira a cada 8 KB fazia a leitura de mil mensagens virar trabalho quadrático,
e a função estouraria o tempo com o servidor respondendo normalmente.

**A senha nunca sai de lá.** Não volta na resposta, não vai para log, não entra
em mensagem de erro — e há um teste que confere exatamente isso. O que volta é
o que o servidor de e-mail disse, cortado em 300 caracteres.

**Duas portas, nenhuma aberta:** gente logada roda **só as caixas dela**; o
agendador roda todas, provando com o segredo `EMAIL_SEGREDO_CRON`. Sem prova
nenhuma, 401. Um endereço público que lê caixa de e-mail a pedido de qualquer
um seria o convite para alguém de fora mandar a função trabalhar — e, no
limite, descobrir quais endereços existem.

**No app:** `App.buscarEmails` e a linha **"Buscar agora"** na aba E-mail. São
duas linhas ali, e elas dizem coisas diferentes: a de cima responde *chegou?*
(o transporte) e a de baixo, *foi lido?* (o assistente). Abrir a aba busca
sozinho, e **escrever uma mensagem dispara o envio na hora** — esperar o
próximo ciclo depois de clicar em Enviar é a diferença entre o app parecer que
funciona e o app parecer que engoliu a mensagem. Foi exatamente o que aconteceu
com a colheita das aberturas, que só rodava no boot.

**`nuvem/correcao-20-caixa-que-envia.sql`** — a coluna `envia`. Pedido do
Alexandre, e ele tem razão: ele recebe cliente no `@biosolvit.com` e no
`@biopartners.com.br`, e a resposta sai sempre pelo segundo. Sem a coluna, o
app pegava a primeira caixa que encontrasse — e a resposta sairia do endereço
errado, que é o tipo de erro que só se descobre quando o cliente estranha.
**Conferido no navegador:** com a caixa do biosolvit em primeiro na lista, a
mensagem saiu com `de: alexandre.maia@biopartners.com.br`.

**`nuvem/CAIXA-DE-EMAIL.md`** — o passo a passo inteiro: senha de aplicativo
(uma por endereço), publicação dos dois arquivos, os quatro segredos, o
agendamento com `pg_cron` de 5 em 5 minutos, e a tabela de "o que aparece / o
que é" para cada falha.

**Falta o Alexandre fazer, nesta ordem:**

1. Rodar `nuvem/correcao-20-caixa-que-envia.sql` (as 18 e 19 antes, se ainda
   não rodou).
2. Criar a senha de aplicativo **do `@biosolvit.com` também** — cada endereço
   tem a sua, e ler a segunda caixa exige a credencial dela.
3. Publicar a função `email` com os **dois** arquivos e criar os segredos.
4. Agendar com o `pg_cron`.
5. Ligar as duas caixas em **Minha caixa**, marcando **Envia** só na do
   biopartners.

---

## 1. O bloqueio principal: o banco está atrás do aplicativo

**Sintoma que apareceu:** um perfil do Chrome mostrava 41 negociações, outro
mostrava 27. Mesmo login, mesma empresa.

**Causa:** o envio para o servidor é por tabela, e uma coluna que existe no app
e não existe no banco derruba a tabela inteira. Seis correções (10 a 15) nunca
foram rodadas, então a carteira grande nunca subiu. E o erro da subida era
engolido sem aparecer na tela — dois aparelhos, duas verdades, nenhuma
pergunta.

**Corrigido no código (v176):** a falha de envio agora é o aviso mais grave da
tela, e diz com todas as letras que outro computador vai mostrar menos.

**Falta fazer, e é o primeiro passo de tudo:**

1. Supabase → SQL Editor → rodar `nuvem/correcao-16-tudo-em-dia.sql` inteiro.
   Ele junta as correções 10 a 15 mais as colunas da ponte, é repetível, e
   termina imprimindo `ok` ou `FALTA` linha a linha.
2. Abrir o app **no perfil que tem as 41 negociações**, forçar recarregamento,
   e ir em Configuração → Nuvem → **Sincronizar**. É isso que manda a carteira
   boa para o servidor.
3. Ainda nesse perfil, reconfigurar a ponte em Configuração → Linked Helper.
   Agora ela sobe para a empresa.
4. Abrir o outro perfil: deve baixar 41 e já vir com a ponte.

> Ordem importa: sincronizar a partir do perfil errado não apaga nada (a
> proteção de vazio-sobre-cheio segura), mas perde tempo.

---

## 1-B. O caso da Rosa (AcP) — 17/09

**O que ela via:** faixa dizendo que o servidor não devolveu nada e que há 303
registros no aparelho, e o Pipeline com 0 negociações.

**O que isso significa, junto:** os 303 estão guardados aqui e nenhum é da AcP.
Quem não é administrador só enxerga a própria empresa — então guardados 303,
visíveis 0. E o servidor está vazio para a AcP porque a carteira boa nunca
subiu (é o bloqueio da seção 1, que continua de pé).

**Corrigido em v177:** quando a descida recusava por vazio-sobre-cheio, o
resultado da subida era jogado fora — o aviso de "não subiu" e o de "são de
outra empresa" morriam calados, e sobrava o conselho errado ("sincronize"),
que nesse caso nunca funciona. Agora a faixa diz qual dos três casos é, e
nomeia a empresa dona dos registros.

**Depois (v178/v179):** o cartão Backup passou a avisar que o arquivo exportado
leva também os registros invisíveis de outra empresa; "Apagar tudo" passou a
guardar cópia antes (era o botão mais destrutivo e o único sem passo atrás); e
a faixa que oferece "restaurar essa cópia" parou de oferecer a carteira de
outra empresa — ela ofereceu 72 empresas e 73 negociações da BWC para a
gestora da AcP, logo depois de um "Apagar tudo" deliberado.

**O que falta do lado de lá:** a seção 1 inteira, na ordem. E, para a ponte do
LH da AcP, conferir para qual balde as campanhas entregam — a leitura dela
respondeu 200 com lista vazia, então o balde `e=<id da AcP>` está vazio, não
inacessível.

---

## 2. WhatsApp

O estado detalhado está em `nuvem/WHATSAPP.md`, seção **"Onde estamos"**. Em
uma linha: **o lado de cá está pronto e provado com dado real passando**; o que
falta é tudo na Meta.

Provado em 15/09 com o webhook de teste do painel: Meta assinou → função
conferiu o HMAC → caiu no `WA_TENANT_PADRAO` → gravou no Postgres → RLS deixou
ler → apareceu na tela Conversas com o aviso "Sem dono" correto.

**Decisões tomadas** (não reabrir sem motivo novo):

- **A ACP opera o IAD para a Bio Water Care.** Um app só, no portfólio da ACP,
  atendendo as duas. O isolamento é por `whatsapp_numeros` → empresa, não pela
  Meta.
- **Trilha Tech Provider + Coexistence**, não "Integrar com API". O vendedor
  continua atendendo pelo celular dele.

**Fila na Meta:** Provedor de Tecnologia → verificação do portfólio (estava em
processamento) → publicar o app (sair de "Em desenvolvimento") → conectar o
número → cadastrar o `phone_number_id`.

**Limpeza pendente:** `delete from public.mensagens_whatsapp;` para tirar a
conversa de teste ("test user name") da tela do vendedor.

---

## 3. O que está na minha fila, e ainda não fiz

Nenhum destes foi construído. Estão aqui para não se perderem.

| O quê | Por que importa |
|---|---|
| **Tela para cadastrar o `phone_number_id`** | hoje só existe em SQL, e é preciso justamente no minuto seguinte à conexão do número, quando a janela do histórico de 6 meses está aberta |
| **Telefone estrangeiro formatado errado** | `16315551181` (EUA) aparece como "(16) 31555-1181". A regra olha o comprimento, e número dos EUA tem 11 dígitos como celular brasileiro |
| **`IA_MODELO_RAPIDO` igual a `IA_MODELO`** | os dois segredos têm o mesmo digest, então a triagem paga preço de modelo bom |
| **Fase 5 — responder pelo IAD** | adiada de propósito; hoje responde-se pelo celular e o eco volta |
| **Propostas e E-mail** | as abas existem marcadas como "por construir". Decisão parada em "estuda tudo e depois vamos pensar" |

---

## 4. Segurança — pendências suas, nenhuma resolvida

Estas não mudaram e continuam valendo:

- **Rotacionar os valores das duas chaves da ponte.** Mudar o tipo para Secret
  no Cloudflare impede ler daqui para a frente; não invalida o que já vazou no
  histórico público do repositório.
- **Trocar a senha de `maia.alex.2306@gmail.com`** — ela circulou.
- **Ligar 2FA.**
- **Adicionar um segundo administrador no portfólio da Meta.** Hoje há uma
  pessoa só; perder essa conta é perder o app, a WABA e os números.
- **Corrigir o webhook do Linked Helper da Bio Water Care**, que aponta para o
  balde da ACP, e resgatar os leads que caíram lá.
- **Apagar as Edge Functions de lixo**: `hyper-action`, `quick-action`,
  `rapid-api`, `hyper-task`.

Nunca me mande nenhum desses segredos. Eu não preciso deles para ajudar.

---

## 5. Regras deste projeto que valem sempre

- A `service_role` (`sb_secret_`) só existe como segredo de Edge Function.
  Nunca em `src/config.js`, nunca em arquivo do repositório, nunca no
  navegador, nunca numa mensagem.
- A chave publicável (anon) em `src/config.js` é segura por desenho — o RLS é
  que protege o dado.
- **Nunca renomear o sentido de uma coluna que já tem dado dentro.** Cria-se
  uma coluna companheira e migra-se por correspondência de nome achatado.
- Versão do app e nome do cache do service worker andam juntos, no mesmo
  commit: `src/config.js` e `sw.js`.
- Verificar no navegador antes de publicar. A verificação de sintaxe não pega
  colisão de nome de função — só abrir o app pega.

---

## 6. PR e rotina

PR #1 (`maiaalex2306/iad#1`) segue aberto, `clean`, deploy verde. Há um
check-in automático de hora em hora que confere estado, CI e conflito, e fica
em silêncio quando não há novidade.
