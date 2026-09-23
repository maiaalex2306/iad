# Onde paramos — 23/09/2026

Este arquivo existe para a próxima sessão começar sabendo o que já aconteceu.
Conversa não sobrevive; arquivo commitado sim. **Atualize junto com o que for
feito** — um mapa desatualizado custa mais caro que mapa nenhum, porque ele é
obedecido.

Publicado agora: **v217**, em <https://maiaalex2306.github.io/iad/>
O carimbo da versão fica no alto do **Manual**. Se não disser v217, o aparelho
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

## 0-T. Processo de Nutrição: triagem em lote, nos dois sentidos — v200, 19/09

O pipeline do Alexandre tem **101 negociações, 99 delas em Conexão com IAD 0** —
o lote inteiro de uma campanha do Linked Helper. Decidir uma a uma quem ainda
não está pronto é o motivo pelo qual, em quase todo CRM, ninguém faz — e o
funil fica cheio de coisa que não é negócio.

Item próprio no menu, **logo abaixo de Cadastros** (`#/nutricao`), com duas abas
e um trânsito entre elas:

- **Filtros que valem para as duas ao mesmo tempo:** busca (negócio, empresa,
  campanha, SDR), responsável, segmento, e saúde da decisão — *IAD 0*,
  *IAD 1 a 4*, *parado há 30 dias*, *parado há 90*.
- **Marcar todos** significa **todos os que passam no filtro**, nunca os 101.
  Marcar o que não está na tela é a forma mais fácil de mover um negócio sem
  querer.
- **Um motivo e uma data para o lote inteiro.** Perguntar negócio a negócio
  derrotaria o propósito: quem tria noventa leads responde a mesma coisa
  noventa vezes. O detalhe por negócio continua existindo, para quem quiser.
- **O caminho de volta é igual**, e é o que importa: nutrição que só recebe é
  cemitério com outro nome. O valor está em devolver, no mês em que a conta
  ficou pronta.

**O botão de uma só continua na oportunidade**, como o Alexandre pediu
explicitamente — a tela nova não substitui, acrescenta.

A seleção vive na view e não no Store, de propósito: recarregar a página começa
com nada marcado. Marcar 99 e a seleção sobreviver a um refresh seria armadilha.

**31 testes**, com a carteira dele reproduzida: 99 leads de campanha mais as
duas negociações de verdade. Filtrar por campanha, marcar os 51, mover com
motivo e prazo, conferir que **ninguém foi encerrado**, devolver três, e que a
passagem ficou no `historicoNutricao`.

## 0-AK. A perda de verdade: 17 oportunidades — v217, 23/09

*“Quando o programa fica parado um tempo, ele deixa eu fazer uma ação e depois
diz que o servidor está fora do ar... Acabei de perder 17 oportunidades que eu
puxei do LH.”*

**Este é o erro mais grave que este app já teve, e a causa era um buraco na
decisão da v180.**

“O servidor é a única verdade, a memória é a única cópia local” resolveu o
vazamento entre empresas — e criou uma janela que ninguém tinha pagado ainda:
**quando o envio falha, o que foi feito existe SÓ na aba aberta.** Fechar,
recarregar, o celular matar a aba para economizar memória, e dezessete
oportunidades somem sem nunca terem existido em lugar nenhum.

E piorava: a `sincronia` mostrava a faixa e **parava de tentar**. Só voltava se
alguém clicasse em “Tentar de novo”. O gatilho dele — *ficar parado um tempo* —
é o token de uma hora do Supabase morrendo em silêncio.

**A caixa de saída (`src/pendencias.js`).** Não é uma segunda verdade que
compete com o servidor, e nada lê dela para montar a tela: é a **fila de
envio**. Gravada em IndexedDB **antes de cada tentativa**, apagada só quando o
servidor confirma. Guarda o dono junto — fila de um login não é resgatada por
outro, que seria o vazamento da v180 de volta.

**Três mudanças, todas sobre não perder:**

| | |
|---|---|
| Grava antes de tentar | Fechar a aba deixou de ser destruir o trabalho |
| Insiste sozinho | 2s, 5s, 15s, 30s, 60s — e **na hora** em que a internet volta ou a aba é reaberta. Nunca desiste |
| Renova a sessão antes | `precisaRenovar()` com a data absoluta de vencimento. `expires_in` só vale no instante em que chegou — e é a aba parada há três horas que precisa da conta |

**A ordem na entrada é a coisa toda:** `puxar` sobrescreve a memória com o que
o servidor tem. Se ele rodar primeiro, a fila é apagada pela versão antiga e a
perda vira **definitiva**. Então a fila sobe ANTES, e o app diz o que
recuperou — *“Recuperei o que tinha ficado para trás (17 oportunidades)”*.

**A faixa mudou de frase porque o fato mudou.** Era “recarregar perde”, que
era verdade e tinha de estar em negrito. Agora: *“ainda não chegou ao servidor
— está guardada neste aparelho e sobe sozinha, pode fechar o app sem perder.
Só não aparece nos outros aparelhos enquanto isso.”* Assustar à toa gasta o
crédito da faixa para quando ela precisar ser levada a sério.

`Descartar e recarregar` agora apaga a fila junto — senão a entrada seguinte
ofereceria de volta o que a pessoa acabou de mandar jogar fora.

**25 testes** (`fila17.js`), montados sobre o relato: 17 oportunidades, o
servidor cai no meio, a aba é **recarregada de verdade** — e as 17 voltam e
sobem. Mais: reabrir duas vezes não duplica; a volta da internet envia sem
clique; descartar apaga mesmo.

Nova seção no Manual: **“Quando o servidor não responde”** (índice: 29 itens).

**O que ele perdeu ontem não volta** — aquilo nunca chegou a existir fora da
aba. A partir da v217, volta.

## 0-AJ. “Não funcionou os filtros” — e ele tinha razão pela metade — v216, 22/09

Print: **Carteira = Só o pipeline**, **Status = Atrasadas**, os leads do LH
todos na tela, e em cima, intacto, **93 atrasadas**.

**O filtro estava certo. A tela é que mentia em dois lugares.**

**1. O resumo não seguia a carteira.** Foi decisão minha, herdada: o resumo
responde “em que pé eu estou” *antes de qualquer filtro*. Mas carteira não é
recorte de busca — é em que mundo se está trabalhando. O efeito foi o pior
possível: marcar “Só o pipeline”, a lista encolher e o número grande logo
acima continuar dizendo 93. Qualquer um lê isso como filtro quebrado.
Agora o resumo segue a carteira e carrega a etiqueta do recorte.

**2. O zero não era dito.** O mais provável, no caso dele, é que **nenhum
daqueles negócios esteja em nutrição** — e aí “Só o pipeline” mostrar tudo é o
comportamento correto, indistinguível de um filtro morto.

Duas coisas resolvem, e as duas ficam na tela:

- Cada opção da Carteira mostra **quantas tarefas tem**, já com os outros
  filtros aplicados: *Só o pipeline (93)*, *Só nutrição (0)*. Abrir a lista
  responde a pergunta sem ninguém explicar nada.
- Com o recorte em “Pipeline e nutrição” e zero nutridas, o resumo diz:
  *“Nenhuma destas atrasadas está em nutrição: todas contam na previsão”*, com
  o botão que leva ao Processo de Nutrição.

**A lição, que é a de sempre aqui:** um filtro que não muda nada e um filtro
quebrado têm a mesma aparência. Quem escreve o filtro sabe a diferença; quem
usa, não — a menos que a tela diga.

**17 testes** (`diagf.js`), montados sobre o caso dele: dez leads atrasados e
nenhum nutrido. Provam o zero, a contagem por opção, e que o número grande
cai junto com a lista quando há nutrição de verdade.

## 0-AI. O e-mail preso na conversa, e o botão Visualizar — v215, 22/09

Dois pedidos do mesmo print (a tarefa da PERI):

*“Quando vem as mensagens numa importação do LH muitas vezes vem informações
como celular whatsapp e e-mail... Precisamos ter condições da IA varrer isso e
levar tudo para o contato.”* e *“Aqui do lado de concluir temos que ter um
botão visualizar.”*

**Sobre os campos:** ele pediu para criar um segundo e-mail e um segundo
telefone se só houvesse um. **Já havia os quatro** — E-mail profissional,
E-mail pessoal, WhatsApp e Telefone comercial. O que faltava não era campo:
era o dado chegar neles.

**A varredura.** O botão da edição de tarefa virou **✨ Varrer contatos do
texto** e mudou de natureza:

| | |
|---|---|
| E-mail e telefone | **Por regra, sem IA e sem custo.** Têm forma; forma se reconhece sem gastar chamada. |
| Nome de gente | **Aí sim é o assistente** — e se ele falhar, a regra vale do mesmo jeito. |

Antes o botão **só existia com o assistente ligado**, e sumia junto com ele —
o celular ficava preso na descrição para sempre. Agora ele aparece sempre.

O que a regra recusa importa tanto quanto o que aceita: **data, CNPJ, DDD
inexistente e celular que não começa com 9**. Telefone inventado na ficha é
pior que campo vazio, porque ninguém desconfia de campo preenchido.

**De quem é:** o endereço costuma dizer — `helcio.moraes@` é o Helcio Moraes
já cadastrado. Quando não dá para saber (`ana@` com duas Anas, ou `contato@`),
fica **sem dono** e o vendedor escolhe. Colar o e-mail na Ana errada é um erro
que ninguém descobre depois.

**Onde entra:** só em campo **vazio**, e o primeiro vazio dos dois. Nunca
sobrescreve. Varrer a mesma tarefa de novo não duplica: diz *“já estava na
ficha”* e para. O mesmo número em três formatos é um só — comparação pelos
últimos oito dígitos, a mesma regra do WhatsApp.

Uma caixa só para as duas coisas (gente nova + ficha para completar): duas
confirmações seguidas fazem qualquer pessoa parar de ler na segunda.

**Visualizar.** Ao lado de Concluir, na aba do negócio e na tela geral (como
“Ver”). A tarefa inteira só para ler: a conversa **sem recorte** — na linha ela
vinha em duas linhas com barra de rolagem, e é ali que está o e-mail — mais
empresa, negociação, e o telefone e o e-mail de quem é. Os anexos aparecem sem
o ✕: para mexer existe Editar. Antes, ler a conversa obrigava a abrir o
formulário de edição, com sete campos editáveis e o risco de salvar sem querer.

**64 testes** (`varre.js` 38, `vertela.js` 26), incluindo o texto real do print.

## 0-AH. Tarefas: separar o pipeline da nutrição — v214, 22/09

*“Aqui nesta tela precisa de um filtro para separar oportunidades que estão em
nutrição das que estão no pipeline.”* — com o print: **93 atrasadas**, e a
lista inteira de “Empresa Importada do LH – Fazer Contato”.

O defeito era antigo e invisível: **mover um lote para nutrição não faz nada
com as tarefas dele**. Tirava cem leads da previsão e deixava cem tarefas
vencendo na agenda. O número grande passou a acusar justamente quem fez a
coisa certa — nutrir é decisão, não atraso.

Agora a tela de Tarefas tem o filtro **Carteira**: *Pipeline e nutrição*
(padrão, nada some), *Só o pipeline*, *Só nutrição*. Tarefa **sem negócio**
conta como pipeline — ninguém a adiou. O recorte vira etiqueta e sai no ✕.

E o resumo da semana passou a dizer a conta que faltava: *“6 das atrasadas são
de negócios em nutrição — você disse que não era agora”*, com o botão que
aplica o recorte. Nada é escondido por padrão; a pergunta é que fica em pé.

**21 testes** (`carteira.js`), com a carteira dele em miniatura: 6 leads do LH
nutridos, 2 negócios de verdade e 1 tarefa avulsa. Provado também que retomar
da nutrição devolve as tarefas ao pipeline sozinho.

## 0-AG. O campo Empresa vinha preenchido com quem nem era — v213, 22/09

*“Quando vamos cadastrar uma nova oportunidade não pode vir o nome de empresas
cadastradas... Traga vazio o campo onde está Eternit e a pessoa escolhe.”*

A Eternit não era um palpite do app: era só **quem venceu a ordem
alfabética**. Três formulários faziam `contas[0]` de padrão — Nova
oportunidade, Nova tarefa e Editar tarefa (esta quando a tarefa ainda não
tinha negócio). Bastava não mexer no campo para o registro nascer na empresa
errada, e esse é o pior tipo de erro: silencioso, descoberto dias depois no
pipeline de quem não tem nada com aquilo.

Agora os três abrem em **“— escolher a empresa —”**, e os três já sabiam
recusar o vazio (“Escolha a empresa deste negócio”, “Escolha a empresa da
negociação”) — a mudança só tirou o preenchimento falso de cima da recusa.
Junto: a lista de **negociação** da tarefa passa a dizer *“— escolha a empresa
primeiro —”* em vez de oferecer “+ Nova negociação **nesta** empresa” quando
empresa nenhuma foi escolhida.

Um só lugar decide isso agora, `opcoesDeEmpresa()` — era a duplicação que
deixou o mesmo defeito em três telas.

**16 testes** (`vazia.js`): nasce vazio, as empresas continuam todas na lista,
cadastrar nova continua no fim, escolher a Eternit traz o contato dela, salvar
sem empresa **não cria** negócio nenhum e pede a empresa, e editar uma tarefa
que já tem negócio continua mostrando o dele.

## 0-AF. Anexar uma pasta inteira: o ZIP — v213, 22/09

*“Preciso que você permita anexar arquivos compactados, tipo zip, rar... e a IA
ter condições de interpretar tudo que está dentro deles.”*

**ZIP sim, RAR e 7z não** — e o não é honesto, não é esquecimento: o navegador
só descomprime *deflate* (`DecompressionStream`), que é o formato do ZIP. Um
leitor de RAR seriam centenas de kilobytes de dependência num app que não tem
nenhuma. A saída está escrita na mensagem de recusa e no Manual: botão direito
→ Compactar, no Windows e no Mac.

**A decisão de projeto:** um ZIP vira **os arquivos de dentro dele**, não um
blocão só. Cada membro entra como um documento — com nome próprio, removível
da lista, contando na cota de leitura da IA, e anexado ao registro como
qualquer outro. Assim nada do que já existia precisou mudar de forma.

Limites, para não travar o aparelho: **20 arquivos** por ZIP (na ordem em que
estão lá dentro) e **80 MB** descomprimidos. Pasta, `__MACOSX/` e arquivo
oculto ficam de fora. O que sobrou da conta é dito em uma linha, não escondido.

Provado no ZIP real dele (Projeto Marilan, 6,3 MB): **5 dos 6** arquivos
lidos; o sexto é um infográfico **escaneado** — PDF sem texto dentro — e ele
diz isso **sem derrubar os outros cinco**, que é o comportamento que importa.

**29 testes** (`zipt.js`). Os `.zip` de teste ficam fora do repositório, e
agora há um `.gitignore` para que continuem fora.

## 0-AE. O carimbo do Manual dizia v204 com o conteúdo da v210 — v212, 22/09

*“Amigo... tem algo errado nestas versões”* — com o print do Manual: carimbo
**v204**, data 20/09, e embaixo um índice de **28 itens** com Potencial, Notas
rápidas e o Processo de Nutrição, que são v206 em diante.

**Erro meu, sete vezes seguidas.** O número vive em dois arquivos de propósito:

| | |
|---|---|
| `sw.js` → `CACHE` | o que está **guardado** no aparelho |
| `src/config.js` → `IADVersao` | o que está **rodando** agora |

A discordância entre os dois é que denuncia uma troca pela metade — por isso
são dois. **Os comentários dos dois arquivos dizem desde sempre que precisam
ser trocados no mesmo commit.** Eu li os dois, e bumpei só o `sw.js` da v205
até a v211.

**Por que não é vaidade de número:** aquele carimbo é o que a pessoa usa para
saber se o aparelho pegou a versão nova. Um número velho ali manda alguém
limpar cache atrás de um problema que não existe — e faz duvidar do resto da
tela.

**Três consertos, e só o primeiro era óbvio:**

1. `IADVersao` para **v211/2026-09-22** (e esta entrada leva a v212).
2. **A comparação que o comentário promete e ninguém tinha escrito.**
   `pintarVersao()` mostrava o cache guardado e nunca o comparava com
   `IADVersao` — o app tinha as duas metades na mão e não as juntava. Agora,
   quando discordam, Configuração → O aplicativo mostra os dois números, diz
   que o carimbo do Manual mente, e manda recarregar. Serve também para o caso
   legítimo: troca de versão pela metade no celular dele.
3. **`nuvem/testes/versao.test.ts`** — lê os dois arquivos do disco e exige que
   batam, mais uma data com menos de 30 dias. **Provei que ele pega:** com a
   divergência de volta, falha e sai com 1.

**A lição, e ela não é sobre versão:** um comentário que diz *“estes dois têm
de andar juntos”* é uma regra sem quem a cobre. Enquanto for só comentário,
alguém vai esquecer — e nesse caso o alguém fui eu, sete vezes, com o
comentário na tela. **Regra que importa vira teste, ou não é regra.**

E uma segunda: quem viu foi o Alexandre, olhando a tela. Tudo o que eu
verifiquei nessas sete versões passava — porque nenhuma suíte conferia a coisa
que ele olha primeiro.

**Testes:** 4 novos em `versao.test.ts` (bun) e 4 na suíte `manual` — o carimbo
da tela igual ao `IADVersao`, igual ao `CACHE` do `sw.js` buscado por HTTP, e a
denúncia aparecendo com um cache falso plantado.

Total: 16 suítes de navegador (385 conferências) + as de `bun`.

**Onde está:** `IADVersao` em `src/config.js`; `pintarVersao()` em
`src/app.js`; `nuvem/testes/versao.test.ts`.

---

## 0-AD. A faixa laranja: a causa real, e ela era nossa — v211, 22/09

*“Amigo, isso continua ocorrendo”* — com a v210 no ar, a faixa “não foi salva
no servidor” continuava em todas as telas.

**A pista estava no próprio print:** o cockpit mostrava a Terracom Construções,
a campanha, a SDR. Desde a v180 o navegador não guarda carteira — aquilo veio
do servidor. Mas com `tenant_id` nulo, `meu_tenant()` é nulo e o RLS não
devolveria linha nenhuma… **a menos que `sou_admin()` seja verdadeiro.**

Ou seja: ele **é administrador**, lê a carteira inteira, e não conseguia gravar
nada. E aí o defeito fica óbvio:

```js
if (!perfil || !perfil.tenant_id) return Promise.reject(...)
```

Essa guarda está **certa para o vendedor**: o RLS confere
`tenant_id = meu_tenant()`, e com nulo nenhuma linha dele passaria — recusar
aqui, com o motivo na tela, é melhor do que o servidor recusar em silêncio.

Está **errada para o administrador**. `sou_admin()` deixa gravar em qualquer
empresa, e `donoDoRegistro()` — dez linhas abaixo da guarda — já carimba cada
linha com a empresa **dela**, não com a do perfil. O envio funcionaria
perfeitamente. O administrador via a carteira toda e não gravava nada, com uma
faixa que dizia “falta empresa” enquanto o que faltava era só aquela linha.

**O conserto:** administrador passa. O que não passa é o registro **sem carimbo
de servidor** — sem UUID próprio e sem empresa no perfil, não há de quem ele
seja, e inventar dono é exatamente o erro que `donoDoRegistro` existe para não
cometer. Mandar com `tenant_id` nulo esbarraria no NOT NULL e **derrubaria a
tabela inteira, levando junto as linhas certas**. Esse fica retido, e a tela diz
quantos.

E a tela de Configuração parou de mentir: para o administrador ela agora diz
que ele **ainda sincroniza**, e o que não sobe. O texto anterior — *“defina
antes de sincronizar”* — era falso para ele, e foi o que segurou um dia de
trabalho.

**17 testes** (`admsub`), com o POST interceptado para conferir o `tenant_id` de
cada linha que sobe: vendedor sem empresa continua barrado; administrador sem
empresa sobe as carimbadas **com o carimbo da própria empresa de cada uma** e
retém as sem carimbo, sem nunca mandar `tenant_id` nulo; e os dois casos que
já funcionavam (admin com empresa, vendedor com empresa) não mudaram.

**A lição:** a v209 consertou os sintomas (a faixa sem saída, o botão que só
criava empresa) e eu tratei a causa como sendo do lado dele — dados no
servidor. Era nossa. **O print tinha a resposta: dados na tela que só o RLS de
administrador explica.** Ler o print inteiro antes de escrever SQL de socorro
teria economizado uma versão.

Total: 16 suítes, 381 conferências.

**Onde está:** `empurrar()` e `daEmpresa()` em `src/nuvem.js`; o aviso por papel
em `src/views.js`.

---

## 0-AC. Juntar negociações pela seleção do Pipeline — v210, 22/09

*“Dentro desta opção selecionar várias... coloque uma opção que permita juntar
duas oportunidades de uma empresa numa única. Suzano e Suzano Limeira tem que
virar uma oportunidade.”*

O caso real: a mesma venda entra duas vezes — uma pelo Linked Helper, outra à
mão — e as duas ficam na carteira **competindo pela mesma receita**, com a
previsão contando o negócio em dobro.

A engrenagem já existia inteira: `Store.juntarOportunidades` (eventos em ordem
de data, pessoas sem repetir, tarefas e sinais repontados, a MAIOR nota de cada
decisão, campos vazios completados, anexos por fora no IndexedDB, e o evento de
histórico que responde *“onde foi parar aquele negócio”*). O que faltava era a
porta: ela só existia **dentro** de um negócio, e a duplicata se enxerga **na
lista**, olhando as duas lado a lado.

**⇄ Juntar**, na barra de seleção. Acende com **duas ou mais da MESMA
empresa**; fora disso fica visível e desabilitado, com o balão dizendo o que
falta — sumir com ele ensinaria a não procurar. Empresas diferentes não são
duplicata: são dois negócios, e juntar apagaria um. A mensagem manda para
Configuração → Juntar empresas.

**O padrão de “quem fica” é a de MAIS EVIDÊNCIA do cliente, e não a de maior
IAD.** Nota alta sem evidência é exatamente o que este app existe para
desconfiar. No caso dele isso importa duas vezes: a do LH tinha IAD **17** e a
descritiva **15** — ordenar por IAD sugeriria manter *“Suzano — origem LH”*, e
**o título de quem fica sobrevive**. O título bom raramente é o que a
importação gerou; por isso o formulário diz isso na cara e quem escolhe é o
vendedor.

**Uma confirmação para o lote, não um laço.** `juntarSelecionadas` não repete
`App.juntarOportunidades`: aquele confirma e avisa uma vez por juntação, e três
marcadas virariam três confirmações e três alertas — e quem clica em três
confirmações seguidas **para de ler na segunda**. A conta (eventos, evidências,
pessoas, tarefas, quais notas sobem) é feita ANTES, a pergunta é uma só, e o
trabalho continua sendo o `Store.juntarOportunidades`.

As juntações rodam **sequenciais** de propósito: cada uma lê e reescreve a
mesma negociação que fica, e em paralelo a segunda sobrescreveria a primeira.
Falha ao mover anexo não desfaz o resto — vai para as ressalvas da mensagem
final, em vez de ficar calada.

**32 testes** (`juntar`): o botão desabilitado nos três casos e o motivo no
balão, o padrão escolhendo por evidência e não por IAD, cancelar não juntar
nada, e a juntação de verdade conferida campo a campo (título e valor de quem
fica intactos, pessoas somadas sem repetir, risco 0→4, problema 3 que não cai,
campanha vazia completada, tarefa repontada, histórico registrado, seleção
desligada). Mais três numa só com **dois diálogos no total**, não seis.

Total: 15 suítes, 364 conferências.

**Onde está:** `barraDeSelecao()` em `src/views.js`; `juntarSelecionadas()` e
`confirmarJuntarLote()` em `src/app.js`. O trabalho de verdade continua em
`Store.juntarOportunidades`, intocado.

---

## 0-AB. Dois relatos de perda de dados — v209, 21/09

### 1. “A sua última alteração não foi salva”, direto — e um botão que pioraria

O `tenant_id` do perfil do Alexandre ficou **nulo** no servidor. `empurrar()`
recusa o envio nesse estado, de propósito: registro sem carimbo de empresa
nasceria invisível para todo mundo. O preço é que o que está na tela existe só
no navegador, e recarregar perde.

**O defeito grave que isso revelou:** o botão *“Definir minha empresa”* só sabia
chamar `criarMinhaEmpresa`. Quem chega a essa tela quase sempre **já tem
empresa**, com a carteira inteira dentro dela — o que se perdeu foi o vínculo.
Criar uma segunda nesse estado é o pior desfecho possível: some tudo da tela, o
servidor continua com os dados, e nada no app diz o que aconteceu.

Agora `resolverEmpresaDaNuvem()` **lista as empresas primeiro** e oferece entrar
numa que já existe (grava o próprio perfil — a política `perfis_atualizacao`
permite `id = auth.uid()`), com “— criar uma empresa nova —” como última
opção. Sem empresa no perfil o RLS de `tenants` só deixa listar quem é
administrador; para os outros a lista volta vazia, e aí o formulário **diz
isso** e aponta o SQL, em vez de oferecer criar como se fosse a solução.

**A faixa laranja também estava errada.** Diagnosticava certo e oferecia dois
botões que não resolvem: “tentar de novo” falha igual enquanto a causa estiver
de pé, e “descartar” joga fora exatamente o trabalho que a faixa existe para
proteger. Faltava o único que nunca perde: **⬇ Baixar cópia**, agora em
primeiro lugar. E, quando a causa é a empresa, um **Resolver agora** no lugar do
“tentar de novo”.

**`nuvem/socorro-perfil-sem-empresa.sql`** (novo, validado em Postgres 16 real
com as duas opções): item 1 o retrato, item 2 quais empresas existem e quanta
carteira cada uma tem, item 3 a religação — comentada, para ser lida antes de
rodar. A opção B (“pega a de maior carteira”) vem com o aviso de que escolher
pela contagem com duas empresas parecidas é adivinhar.

### 2. “Coloco arquivo na tarefa, salvo, volto e não tem nada”

**O arquivo nunca se perdeu** — ia para a aba **Arquivos do negócio**, que é
onde documento mora. O registro guardava `oportunidadeId` e `contaId` e **nada
mais**: nenhum campo ligava o arquivo à tarefa que o trouxe. E como
`<input type="file">` sempre abre vazio, reabrir “Editar tarefa” mostrava
*“Nenhum arquivo escolhido”* — que se lê como “sumiu”.

- O anexo passa a guardar **`tarefaId`**, e `listar()` filtra por ele.
- O formulário ganhou o bloco **“Já anexado nesta tarefa”**, com abrir e tirar.
  Sem anexo, ele diz onde os documentos moram em vez de ficar mudo.
- **`Arq.salvar(...).catch(function () {})`** — a falha era engolida inteira.
  Sem espaço no aparelho, ou em aba anônima, o arquivo não era gravado e o app
  não dizia nada. Documento que some calado é pior do que documento que não
  entra: no segundo caso a pessoa tenta de novo.

Anexo antigo, sem `tarefaId`, continua no negócio — não some com ele, só não
aparece no bloco da tarefa.

**14 testes** (`anexos`), incluindo o caminho da falha ao gravar — caminho de
erro sem teste volta a ser engolido. Total: 14 suítes, 330 conferências.

**Onde está:** `faixaDeAviso()`, `resolverEmpresaDaNuvem()`,
`criarEmpresaDaNuvem()`, `pintarAnexosDaTarefa()` e `anexarAoRegistro()` em
`src/app.js`; `tarefaId` em `src/arquivos.js`.

---

## 0-AA. Seleção em lote no Pipeline — v208, 21/09

*“No pipeline em formato de lista, eu quero colocar um botão no canto inferior
direito que permita selecionar diversas oportunidades e colocá-las em
nutrição.”*

A triagem em lote já existia — só que na tela de Nutrição. Quem estava olhando
o Pipeline e via cinco negócios que não vão a lugar nenhum precisava sair da
tela, reencontrar cada um numa lista diferente e só então mover. **Duas telas
para uma decisão é uma decisão que não acontece.**

**☑ Selecionar várias**, flutuando no canto inferior direito. Fora da barra de
filtros de propósito: a barra responde *“que negócios eu vejo?”*, e isto
responde *“o que faço com eles?”* — e flutuando continua ao alcance depois de
rolar sessenta cartões, que é quando a vontade de triar aparece.

**O cartão inteiro é o alvo do clique**, e não uma caixinha de 14px no canto.
Duas razões: o cartão já é um `<button>` e aninhar outro controle clicável
seria HTML inválido; e no celular acertar a caixinha é justamente o que faz
ninguém triar.

**As regras que valem:**

- “Marcar as N” marca **as que estão na tela**, respeitando filtros e busca.
  Marcar o que um filtro escondeu é a forma mais fácil de mover sem ver.
- Quem já está em nutrição ou encerrado aparece apagado, com um traço no lugar
  da marca e um balão dizendo por quê. Esconder seria pior: a lista mudaria de
  tamanho ao entrar no modo.
- **Abrir um negócio não perde a seleção** (`#/op/` conta como “ainda estou
  triando”); sair para outra tela, sim. Seleção é de uma sessão de triagem, não
  um estado da carteira — voltar horas depois e achar quarenta cartões marcados
  é a receita para mover em lote sem querer.
- **Só na lista.** No kanban o cartão já carrega o arrasto, e um clique que às
  vezes abre, às vezes marca e às vezes arrasta é um clique em que ninguém
  confia.
- Sem nada elegível na tela, o botão não aparece.

**Um formulário só para as duas portas.** `moverParaNutricao` virou
`pedirNutricaoEmLote(escolhidas, aoTerminar)`, no nível do módulo. Duas cópias
dos mesmos campos divergiriam no dia em que alguém mexesse numa delas, e aí o
mesmo botão pediria coisas diferentes em lugares diferentes.

**Dois tropeços que valem registro:**

1. A primeira tentativa pôs `pedirNutricaoEmLote` **dentro** do objeto literal
   `App`, partindo-o ao meio com um `Object.assign` — `SyntaxError`. Declaração
   de função iça; propriedade de objeto não. Revertido e refeito com a função
   fora do objeto.
2. A barra é `fixed` e não ocupa lugar no fluxo: **o último cartão ficava
   embaixo dela** — e o último cartão é um dos que a pessoa desceu até ali para
   marcar. Um `.espaco-flutua` de 64px resolve sem depender de `:has()`.

**32 testes** (`selecao`), incluindo o caminho do cartão inelegível, que numa
primeira rodada tinha passado sem ser exercitado — o filtro “Todos” não traz
nutrição nem encerrados, então não havia nenhum na lista. Cobri com o status
“Todas”.

**Onde está:** `selecaoPipeline`, `barraDeSelecao()` e `cardOportunidade()` em
`src/views.js`; `pedirNutricaoEmLote()` e os handlers em `src/app.js`;
`.flutua-acoes` / `.marca-selecao` em `assets/styles.css`.

---

## 0-Z. O manual, auditado por teste — v207, 21/09

*“Atualizou o manual do Método com tudo que acrescentamos?”* — auditado de
verdade em vez de respondido de memória. Quatro buracos, dois deles antigos:

1. **Não havia seção para a TELA de Nutrição.** `m-caminho` explica nutrição
   como ESTADO de um negócio, e continua certo — mas quem procurava o trabalho
   de triar cem de uma vez achava aquilo e ia embora. Nova seção `m-nutricao`:
   as duas abas, os filtros que valem para as duas, a ordem por Potencial, o
   motivo e a data pedidos uma vez para o lote, e por que a triagem fica fora
   da Fila do dia.
2. **A rotina do dia (`m-dia`) não citava as duas coisas mais novas.** Dois
   blocos: *“ao lembrar de algo”* (Notas rápidas) e *“quando a fila acabar”*
   (triar pelo Potencial). Mais três linhas na tabela “o que você alimenta, o
   que recebe de volta” — segmento da conta, telefone/e-mail do contato e
   desfecho registrado agora têm retorno visível, porque alimentam o Potencial.
3. **Conversas não tinha linha na tabela “As telas”.** Buraco antigo: a tela
   existe no menu desde o WhatsApp e tem seção própria, mas quem consultava a
   tabela para saber em qual tela entrar simplesmente não a via.
4. **Defeito visual nos blocos numerados:** `.tiny` só quebra linha dentro de
   `<td>` (regra antiga), então o subtítulo colava no título — “FiltrePor
   campanha”. Afetava também a seção da IA, que é de muito antes. Uma regra
   (`.passo-manual .tiny`) conserta as três.

**O que muda daqui para a frente:** a nova suíte `manual` (19 testes) audita
sozinha e vale mais que esta lista. Ela cobra: toda tela do menu com linha na
tabela “As telas”; todo item do índice com seção e toda seção no índice; todo
item com resumo no balão; nenhum link interno quebrado; e treze
funcionalidades nomeadas presentes no texto. Foi ela que achou o buraco da
Conversas — que eu não tinha visto lendo.

**28 itens no índice.** Suítes: 12 arquivos, 283 conferências, 0 falhas.

---

## 0-Y. Potencial — 1ª entrega, sem IA — v206, 21/09

*“O RD tem um campo de qualificação mas eu acho muito fraco... Como podemos
criar este campo dentro das oportunidades?”* — e depois *“Faça isso”* sobre o
plano de três entregas. **Esta é a primeira: aritmética pura, zero token.**

**O problema, em uma frase:** o IAD responde *“a decisão está madura?”*, e essa
pergunta pressupõe que exista decisão. Noventa e oito leads do Linked Helper
não têm nenhuma — **todos marcam IAD 0**, e IAD 0 não distingue o diretor de
operações de uma indústria do segmento onde já ganhamos do estagiário de uma
empresa sem site. Potencial responde a pergunta ANTERIOR: vale a primeira hora?

**Quatro faixas com nome de ação**, não de temperatura — “Morno” não diz o que
fazer na segunda de manhã; “A conferir” diz: **Prioritário** (60+) ·
**Promissor** (38) · **A conferir** (18) · **Fora do alvo**.

**Duas contas, mantidas separadas de propósito:**

- **Perfil (0–50)** — papel no grupo comprador (até 18) + senioridade lida do
  cargo (até 8) + a empresa existe de verdade (até 10) + **o segmento,
  aprendido dos próprios desfechos** (até 14).
- **Interesse (0–50)** — o cliente produziu evidência (18) + foram duas ou mais
  (+8) + há quanto tempo (até +10) + sinal do comprador (até +10) + compromisso
  com data (+8) + alcançável fora do LinkedIn (+6).

Separadas porque pedem ações opostas: perfil 45 com interesse 0 é um lead para
TRABALHAR; interesse 40 com perfil 8 é curiosidade que consome tempo. A soma
sozinha confundiria os dois em “45”.

**O ICP não é digitado por ninguém.** `baseDoPotencial()` varre a carteira e
marca os segmentos onde já ganhamos (14 pontos) e onde a decisão ao menos andou
(IAD 8+, 9 pontos). Lista de ICP digitada envelhece calada. E **enquanto não
houver nenhum desfecho**, o segmento entra **neutro (7) para todos** e a pílula
diz isso — zerar todo mundo por uma falta que é nossa seria mentir com número.

**O motivo é a funcionalidade.** Cada ponto vem com a frase que o explica, e a
pílula mostra todas. Qualificação com a qual ninguém consegue discordar nunca
melhora — é exatamente o que mata o campo do RD: *“Estamos no jogo”* não tem
como estar errado porque não diz nada conferível.

**A trava:** quem já respondeu não (`recusas`, casado pelo perfil do LinkedIn)
fica preso em Fora do alvo, com a campanha e o motivo na pílula. “Não” não se
compensa com cargo bom.

**Nada disto entra em `iad()`, `saude()` nem `classificar()`.** Mesma regra dos
sinais, e um teste cobra isso lendo o código das três funções.

**Onde aparece:** pílula ao lado do título no cockpit · coluna, filtro **e ordem
da lista** na Nutrição (sem ordem, cem leads saem na ordem em que a ponte os
entregou, que não é ordem nenhuma) · e no Hoje, a linha de triagem passa a
dizer quantos daquele monte valem a primeira hora.

**Não é guardado em lugar nenhum.** É recalculado a cada abertura de tela —
sem coluna nova, sem SQL para o Alexandre rodar, sem migração. Preencher o
segmento de uma conta muda a faixa na hora.

**47 testes** (`potencial`). Três defeitos reais que eles pegaram:

1. `est[aá]gi` seguido de `([^a-z]|$)` **nunca casava com “estagiário”** — a
   palavra continua depois do radical. Todas as senioridades passaram a ser
   radical + `[a-z]*`.
2. “Coordenação de Produção” não pontuava: o LinkedIn escreve cargo como
   substantivo (“Gerência”, “Diretoria”, “Coordenação”) e a lista só tinha as
   formas de agente.
3. **A ordenação punha o lead travado em segundo lugar.** Ordenar por pontos
   ignora a trava — um “não” de diretor tem pontos altos. A faixa passa a vir
   antes dos pontos no comparador.

**A 2ª e a 3ª entregas** (IA lendo as respostas; calibração por desfecho) **não
foram feitas** — e a 2ª exige colunas novas (`potencialIA`, `potencialManual`)
com o SQL correspondente. A 3ª só faz sentido quando houver desfechos.

**Onde está:** `FAIXAS_POTENCIAL`, `PESO_DO_PAPEL`, `SENIORIDADE` e
`IAD_QUE_ANDOU` em `src/playbook.js`; `potencial()`, `baseDoPotencial()`,
`perfilDoLead()`, `interesseDoLead()` e `senioridade()` em `src/engine.js`;
`pilulaDoPotencial()`, `potencialDe()` e o filtro em `src/views.js`.

---

## 0-X. Notas rápidas: o caderninho — v205, 21/09

*"Debaixo da opção método, coloque uma opção chamada Notas Rápidas, onde o
vendedor poderá digitar ou falar algo rápido que ele não pode esquecer... Por
exemplo: Ligar para o Carlos da Heinenker."*

O app tinha um lugar para tudo, menos para a frase que sobra da ligação. Para
guardar *"ligar para o Carlos da Heineken"* era preciso empresa, negociação,
canal, decisão alvo e vencimento — cinco campos para uma frase, que é o motivo
de a frase acabar no papel. E papel é onde as coisas somem.

`#/notas`, logo abaixo do Método. Uma caixa, um botão **🎤 Ditar**, uma lista.
Enter anota, Shift+Enter pula linha, o cursor volta para a caixa. Nada mais,
de propósito: o que compete com o Post-it não é um formulário melhor, é não
ter formulário.

**Privada de verdade.** `correcao-23-notas-rapidas.sql` é a única tabela do
banco sem `or sou_admin()`: só `dono_id = auth.uid()`, no `using` e no `with
check`. Um rascunho que o chefe lê é um rascunho onde ninguém escreve o que
precisa mesmo lembrar. Provado num Postgres 16 de verdade, com papel não
superusuário e dois donos: o `select` devolve só a minha, o `update` na do
colega afeta 0 linhas, e o `insert` em nome dele levanta *"new row violates
row-level security policy"*. `minhasNotas()` e `dados().notas` repetem a regra
no app — nem `visivel(r, true)`, que deixaria o gestor entrar.

**A única parte esperta: "Virar tarefa".** Anotação não move decisão nenhuma;
quem move as oito é tarefa concluída. O botão atravessa a nota para o método
levando o que `palpiteDaNota()` leu do próprio texto: a conta ("Heineken"), a
pessoa ("Carlos") e o canal (o verbo — "ligar" → Telefonema, "mandar e-mail"
→ E-mail). **Sem IA, sem chamada, sem custo:** é comparação de texto, e
continua funcionando com o assistente fora do ar.

A regra que vale mais que o acerto: **na dúvida, não escolher.** Dois nomes
que batem, ou duas negociações na mesma conta, e o formulário abre em branco.
Preencher o negócio errado é pior que deixar vazio — o errado passa
despercebido. Palavras que aparecem em metade das razões sociais (indústria,
comércio, Ltda, Brasil, agro) não valem como pista, senão *"visitar a
indústria"* casa com a primeira conta da lista.

A nota só sai da lista **depois** que a tarefa existe (`aoCriar`, novo gancho
de `App.novaTarefa`). Cancelar não pode apagar o único lugar onde ela estava.

**Dois consertos que caíram junto:**

- `ligarVoz` só funcionava dentro de `<dialog>` e só achava campo por
  `[name=]`. Agora aceita qualquer pedaço da página e também acha por `id`, e
  marca o botão com `data-voz-ligado` — a tela se repinta a cada nota, e sem
  a marca um clique abriria três microfones.
- **O Hoje mentia.** Desde a Fila (v203) os leads sem evidência saem da fila
  para a triagem; quem tinha cem deles e nenhum negócio começado via *"Nenhum
  negócio aberto. Toda a carteira está encerrada"* — frase falsa na única
  tela que se abre de manhã. Agora a fila vazia com triagem cheia mostra a
  triagem, que é exatamente o trabalho que existe.

**42 testes** (`notas`): a rota logo depois do Método, anotar/Enter/Shift+Enter,
vazio não cria, feita e desfazer, o palpite nos quatro casos (acerta, acerta
apesar de "Alimentos", não escolhe no ambíguo, não inventa sem pista), o
formulário pré-preenchido, cancelar preserva a nota, confirmar a consome, a
linha no Hoje aparece e some, e as três provas de privacidade. Mais o manual
(`m-notas`), a linha em `TELAS` e o resumo no índice — que agora tem 26 itens.

**Falta o Alexandre fazer:** rodar `nuvem/correcao-23-notas-rapidas.sql` no SQL
Editor do Supabase. Sem ela as notas vivem só na memória da aba e morrem com
ela.

**Onde está:** `notasRapidas()` e `linhaDasNotas()` em `src/views.js`;
`palpiteDaNota()` e os handlers em `src/app.js`; `minhasNotas`/`criarNota`/
`concluirNota`/`excluirNota` em `src/store.js`; `ligarVoz` em `src/ui.js`.

---

## 0-W. O índice do manual com resumo no balão — v204, 20/09

*"Quando passar com o mouse em cima de cada item apresente um pop up dentro do
nosso padrão resumindo em poucas linhas o que a pessoa aprenderá e encontrará
no item."*

Vinte e cinco títulos numa lista são vinte e cinco apostas: a pessoa lê "Como o
IAD anda" e tem de adivinhar se aquilo é a teoria do índice ou o passo a passo
de dar nota. Com o resumo no balão ela decide antes de clicar — que é a única
coisa que um índice precisa fazer.

`SECOES_DO_MANUAL` ganhou um terceiro campo: o resumo. `indiceDoManual()` o
emite como `data-ajuda` com `data-ajuda-titulo`, então usa o balão que já
existe (`src/ajuda.js`) — mesmo desenho de todo o resto do app, e de graça
ganha o teclado, porque o balão já escuta `focusin`.

**A regra que os 25 resumos seguem:** dizem o que a pessoa vai ENCONTRAR ali,
não o que a seção é. *"Os quatro modos de registrar, do mais completo ao mais
rápido"* serve; *"fala sobre registro"* não serve para nada. Cada um foi
escrito depois de ler a seção — resumo inventado num tooltip é pior do que
tooltip nenhum.

**15 testes** (`indice`): os 25 existem, nenhum sem resumo, nenhum curto demais
(< 80 caracteres), nenhum longo demais para um balão (> 400), nenhum só
repetindo o título, os 25 diferentes entre si, o balão abre no mouse e no foco
do teclado, cabe na tela, some ao sair, e o link continua navegando.

### Uma função declarada duas vezes

`App.irParaMinhaCaixa` aparecia **duas vezes** no mesmo objeto literal, com
corpos idênticos e comentários quase iguais ("procurar no menu" × "procurar o
menu"). A segunda sobrescrevia a primeira em silêncio — inofensivo hoje,
armadilha no dia em que alguém corrigisse só uma das duas. Removida.

E uma nota de teste: `irNoManual` rola com `behavior: 'smooth'`. Meio segundo
de espera não cobre 1800px de animação, e o teste acusou defeito onde só havia
animação — o oposto do fake complacente, mas igualmente enganoso.

**Onde está:** `SECOES_DO_MANUAL` e `indiceDoManual()` em `src/views.js`.

---

## 0-V. A Fila — v203, 20/09

Primeiro item da Onda 1 do estudo (`estudos/AUTOMACAO-IA.md`, item 6.1),
construído. `E.fila()` substitui o `focoDoDia()`.

**O defeito que ela conserta, e que só apareceu com a carteira real.** A régua
antiga era `evidenceAge > 30 → urgência 3`, e `evidenceAge` de quem nunca teve
evidência conta desde a criação. Noventa e oito leads importados de campanha
nasceram com zero evidência, envelheceram, e a tela do dia abria com noventa e
oito linhas vermelhas. **Lista em que tudo é urgente não diz nada.**

A distinção que conserta: **nunca começou ≠ parou**. `nuncaComecou(op)` —
zero eventos de decisão — manda o lead para um balde `triagem`, fora da fila,
resumido numa linha com botão para a Nutrição. No teste: 101 oportunidades →
**3 na fila, 98 na triagem, no máximo 3 urgentes**.

**O que a fila passou a responder, e o foco não respondia:**

- **Com quem.** `quemProva(op, dim)` cruza a decisão que falta com
  `P.PAPEL_QUE_PROVA` (mapa novo no playbook) e devolve a pessoa — a mais
  influente do papel, nunca uma resistente. Sem papel na conta, a recomendação
  vira *chegar* nele pelo champion.
- **Por qual canal.** `canalDaFila()` — preferência declarada da pessoa,
  depois a regra do playbook (`dim.canais`), depois o que temos para alcançá-la.
  Se faltar o contato, a linha avisa em vez de mandar tentar.
- **Por que agora.** `momento()` — o melhor instante que o motor sabe calcular
  — **não era consultado pela tela do dia**. Agora é a 2ª posição da escada,
  atrás só de compromisso vencido.

Nutrição saiu da fila (é para isso que serve), e volta quando `nutricaoVencida`.

A pontuação é aritmética: **não chama IA, não custa token**. Cada posição sai
com o motivo escrito — número sem motivo é ranking de CRM, que é o que ninguém
obedece.

### Dois defeitos que a construção desenterrou

1. **O assistente respondia errado desde sempre.** `conversa.js` fazia
   `const itens = E.focoDoDia(...)` e lia `itens.length` — mas `focoDoDia`
   devolve `{itens, urgentes, valorUrgente}`. `.length` em objeto é
   `undefined`, então *"o que eu faço agora"* respondia **"Nada urgente na
   carteira"** com a carteira cheia. Passou despercebido porque a resposta era
   plausível — o pior tipo de defeito.
2. **`mom.principal.rotulo`** — `rotulo` é campo do CATÁLOGO (`TIPOS_SINAL`),
   não do sinal gravado, que tem `titulo`. Derrubava a fila inteira com
   `undefined.toLowerCase()`. Pegou no primeiro teste. `rotuloDoSinal()` resolve.

**28 testes** (`fila`): a carteira dele reproduzida — 98 leads que nunca
começaram, um compromisso vencido, um negócio com sinal de 3 dias e evidência
de 40, e um em dia. Confere ordem, motivo, pessoa, canal, a linha de triagem, a
não-poluição da lista e o manual.

Manual: seção **`m-fila`** nova no Método, com a escada de prioridade, a tabela
de quem prova cada decisão (gerada do playbook) e o porquê da triagem ficar
fora. O bloco "de manhã" do `m-dia` foi reescrito, e a linha de Hoje na tabela
`TELAS` também.

**Onde está:** `fila`, `nuncaComecou`, `quemProva`, `canalDaFila`,
`rotuloDoSinal` em `src/engine.js`; `PAPEL_QUE_PROVA` em `src/playbook.js`;
`linhaDaTriagem`, `comQuemECanal`, `manualDaFila` em `src/views.js`.

---

## 0-U. Estudo: o que trazer do mercado de AI SDR — 20/09

O Alexandre mandou dois documentos (Dossiê Global de AI SDR com 12 plataformas,
e a Análise Completa do Chattie) e pediu um estudo profundo do que dá para
implantar de automação no IAD.

Está em **`estudos/AUTOMACAO-IA.md`** — 23 itens, agrupados pelos 10 módulos
que o dossiê define como "plataforma superior", cada um com esforço, custo de
IA e risco de plataforma.

**A tese, porque muda a leitura de tudo:** as doze plataformas medem
ATIVIDADE; o IAD mede DECISÃO. O dossiê conclui que o maior espaço de inovação
do mercado é memória coordenada de buying committee — e o IAD já tem o grafo
(`PAPEIS`, `coverage()`, `PERFIS` Challenger, `FORCAS`). Falta coordenar, não
modelar. Placar honesto contra os 10 módulos: 4 fortes, 3 parciais, 3 ausentes
— e os 3 ausentes são os mais baratos.

**Onda 1 (nenhum precisa de LinkedIn, fornecedor novo ou tabela complexa):**

1. **Cérebro da empresa** — o que vendemos, provas, objeções, tom. Melhora
   todas as funções de IA que já existem, de uma vez.
2. **A Fila** — próxima melhor ação da carteira inteira, ordenada com o motivo
   por escrito. Aritmética sobre o que já está no banco: **não gasta token**.
3. **Mudança de cargo pela ponte** — `mudou_de_cargo` existe em `TIPOS_SINAL`
   e nunca é emitido; o LH já traz cargo e empresa a cada colheita. ~30 linhas.
4. **ICP aprendido dos ganhos** — derivar o ICP de quem a gente FECHOU, em vez
   de declarar. Resolve a triagem dos 98 leads sem critério.
5. **Taxonomia de intenção** no analisador de e-mail — e `FUTURE_FOLLOW_UP`
   ("me chama em novembro") cai direto na Nutrição com a data que ele disse.

**As cinco recusas, com motivo:** não construir envio no LinkedIn (o IAD é
cérebro, o Linked Helper é execução — é a lição do HeyReach e mantém o risco
onde já estava); não construir Autopilot (IA que responde sozinha produz
atividade nossa, não evidência dele); não perseguir "AI copy" (o Expandi mediu
em 13,2M de convites: não supera copy humana); não construir base de leads; e
**nunca deixar sinal entrar no índice IAD** — o comentário do `engine.js` já
explica, e a tentação vai aparecer quando o Signal Engine ficar bom.

**A análise que nenhum concorrente consegue fazer:** cruzar tipo de tarefa com
dimensão movida. "Visita presencial move Consenso 3× mais que qualquer canal;
apresentação sem o Financeiro nunca moveu Critérios." O insumo já está gravado.

---

### O lugar, e as duas abas — v201, 19/09

Nasceu como aba dentro de Cadastros, entre *Oportunidades* e *Segmentos*. O
Alexandre viu a tela pronta e disse o que faltava: *"o processo de nutrição
será muito importante… coloque-o numa opção debaixo de Cadastros, mas não
dentro de Cadastros"*. Ele está certo, e a razão é de arquitetura, não de
gosto: **aba de cadastro é lugar de lista que quase não muda**. Nutrição é
trabalho de todo mês — decidir quem sai da previsão e quem volta. Trabalho que
mora dentro de um cadastro é trabalho que ninguém faz.

- **Rota própria `#/nutricao`**, ícone 🌱, imediatamente depois de
  `#/cadastros` em `ROTAS` (`src/app.js`). Um teste confere a posição: estar
  *debaixo de* Cadastros era metade do pedido.
- **Duas abas: Carteira Ativa e Leads em Nutrição.** Empilhadas, a tela tinha
  98 linhas em cima e 3 embaixo — para ver a nutrição era preciso rolar a
  carteira inteira, e o filtro do topo parecia valer só para a lista de cima.
- **O contador vive no botão da aba** (`Carteira Ativa · 98`), porque é o
  número que decide qual das duas abrir. Saiu o cabeçalho duplicado.
- **Trocar de aba limpa a marcação dos dois lados.** Marcar na carteira, ir
  para a nutrição e mover sem ver o que foi marcado é o acidente que esta tela
  não pode permitir.
- Os filtros continuam valendo para as duas abas, de propósito: filtrar a
  carteira, trocar de aba e ver outra régua faria comparar duas listas que não
  são comparáveis.

**Onde está:** `nutricao()`, `ABAS_NUTRICAO`, `AJUDA_NUTRICAO`,
`cabecalhoDaNutricao(est)` e `definirAbaNutricao` em `src/views.js`; a rota e
`App.abaNutricao` em `src/app.js`. A linha nova na tabela `TELAS` do manual.

### A rolagem que voltava ao topo — v202, 19/09

*"Quando eu clico numa linha, volta para o início… então fico tendo que rolar a
tela o tempo todo."* Com 98 linhas, isso torna a triagem em lote inviável — que
era justamente o propósito da tela.

A causa era uma linha no coração do app: **`window.scrollTo(0, 0)` no fim de
todo `render()`**. Marcar uma caixinha chamava `render()`, que reconstruía a
página inteira e devolvia o topo. O sintoma não era da Nutrição — era de
qualquer tela; Tarefas e Pipeline já tinham cada uma o seu remendo local
(`repintarTarefas`, `repintarPipeline`), copiado um do outro.

Três mudanças, da mais específica para a mais geral:

1. **`repintarConteudo(hash, desenhar)`** — um só lugar no lugar dos dois
   remendos. Guarda rolagem, campo com foco e posição do cursor, repinta só o
   `#conteudo` (agora com a faixa de aviso, que os remendos perdiam) e devolve
   as três coisas. `repintarTarefas`, `repintarPipeline` e o novo
   `repintarNutricao` são uma linha cada.
2. **`render()` só mexe na rolagem quando a TELA MUDA.** Repintura da mesma
   tela — marcar, filtrar, concluir, mover em lote — deixa a pessoa onde
   estava. Isso conserta de graça a busca de Cadastros e tudo o mais que
   chamava `render()` direto.
3. **`ondeParei`** — a rolagem de cada tela de lista, guardada ao sair e
   devolvida ao voltar. Entrar num negócio a partir da linha 90 e voltar agora
   devolve a linha 90. Vale só para as telas do menu: um negócio a gente
   *abre*, e quem abre espera começar do começo. Vive na memória e morre com a
   aba. `history.scrollRestoration = 'manual'` desliga a memória do navegador,
   que brigaria com esta.

Troca de aba (Nutrição, Cadastros, Configuração) continua começando do topo,
explicitamente: é troca de conteúdo, não continuação do trabalho.

**20 testes novos** (`rolagem`), com 98 linhas de verdade: marcar, desmarcar,
digitar tecla a tecla, entrar num negócio e voltar — na Nutrição e no Pipeline.

Dois "defeitos" que o teste acusou eram do próprio teste, e valem como nota:
o **diálogo diário da IaD** rouba o foco 400 ms depois do render (feche-o antes
de medir foco), e **o Pipeline abre negócio por `onclick`, não por `<a href>`**.

**Onde está:** `repintarConteudo`, `ondeParei`, `rolagemAnterior` e
`ehTelaDeLista` em `src/app.js`.

### Um defeito que a tela dele denunciou no mesmo dia

O e-mail *"Aceita: Conversa Inicial"* continuava mostrando o aviso jurídico
inteiro, mesmo com a limpeza da v199 funcionando nos outros. A causa era o
`|| m.corpo` que eu tinha deixado: mensagem que era **só** aviso jurídico virava
string vazia, e o `||` caía de volta no texto cru — a limpeza era derrotada
justamente quando funcionava melhor. Agora a tela diz *"Sem texto — só
assinatura e aviso jurídico. O assistente não gasta leitura com isto."*

### E o estudo: `estudos/NUTRICAO.md`

Levantamento mundial, com uma ressalva que abre o documento: **quase toda
estatística de nutrição que circula vem de blog de fornecedor e recicla
estudos de 2007 a 2014** com "2026" no título. Estão lá, rastreadas até a fonte
original, mas marcadas — servem de indício, não de promessa para um cliente.

O que tem data e método recentes é mais interessante: 70–80% da jornada
acontece antes do vendedor; 67% preferem comprar sem vendedor; grupo comprador
de 11,2 pessoas; **27% dos leads chegam prontos** — o que explica os 99 com
IAD 0 melhor do que qualquer teoria sobre a campanha. Eles não recusaram;
ainda não chegaram.

Os dois números acionáveis: responder a um sinal **em até 5 minutos** dá **8×**
mais conversão, e **70% dos leads nunca veem a mensagem** se o único canal for
o e-mail.

O estudo termina em decisões de produto, não em ideias — e inclui **o que eu
não recomendaria**: sequência automática de e-mail disparada pelo IAD (forma
rápida de queimar o domínio do cliente) e pontuação de lead clássica, que é
exatamente o contador de cliques que este app existe para não ser.

---

## 0-S. A HEINEKEN casou sozinha, e o rodapé saiu do caminho — v199, 19/09

**A prova que faltava:** a negociação da HEINEKEN apareceu com **3 e-mails**,
do `carlos.camargo@heineken.com.br` e do `davi.morgon@heineken.com.br`. Nenhum
dos dois estava cadastrado como contato — casaram **pelo domínio**. A corrente
inteira, do IMAP à aba da negociação.

**E a tela mostrou o próximo problema.** O primeiro e-mail, *"Aceita: Conversa
Inicial sobre ETDI"*, tinha como corpo **só o aviso jurídico**. Os outros dois
traziam assinatura, `[cid:image001.jpg@01DD4757…]` e `<mailto:…>` repetindo o
endereço que já estava ao lado.

Isso atrapalha duas vezes: na tela esconde a única frase que interessa — no do
Carlos, *"Agendado com o Alexandre para hoje às 14hs"* estava no meio de cinco
linhas de rodapé — e no assistente é texto pago para ler o mesmo aviso cem
vezes.

`IADEmail.limpo()` corta, nesta ordem: as marcas de imagem e o `<mailto:>`
(que aparecem no meio da frase), o aviso jurídico e o rodapé (que vão até o
fim), a assinatura depois de `--`, a **despedida** (*At.te.*,
*Atenciosamente*, *Regards*…) e, quando não há despedida, o telefone `+55`.

| | antes | depois |
| --- | --- | --- |
| Carlos | 495 | **89** — exatamente a frase dele |
| Davi | 556 | 270 |
| "Aceita:" | ~1000 | **vazio** → vira ruído, sem gastar chamada |

**A limpeza é no app, não na função do servidor**, e de propósito: assim vale
também para os 25 que **já estão guardados**, e a regra existe num lugar só em
vez de em duas linguagens.

**O limite conhecido, escrito no teste:** o do Davi emenda *"…nesse momento!
Davi Morgon Diretor Industrial…"* sem despedida nenhuma. Sem marca, não há como
saber onde a mensagem acaba sem arriscar cortar conteúdo — e **cortar conteúdo
é muito pior do que deixar rodapé**. O teste afirma o que é verdade: o telefone
e o aviso saem, o bloco de nome e cargo sobra, e a frase dele vem primeiro.

**E o `ehRuido` passou a medir DEPOIS da limpeza**, que é a ordem que importa:
pelo tamanho cru, o "Aceita:" passaria por mensagem de verdade e gastaria uma
chamada para o assistente dizer que não há nada ali.

**Os balões de ajuda foram reescritos.** Antes diziam o que o botão faz; agora
dizem **quando usar, o que ele não faz, e a diferença para o botão parecido do
lado** — que era a dúvida real (*Buscar e-mails* da negociação × *Buscar agora*
da Configuração; *Analisar com a IA* × *Analisar agora*). Nove botões, em
linhas separadas em vez de um parágrafo.

---

## 0-R. O e-mail funcionou — e o trabalho voltou para a negociação — v198, 19/09

**Primeiro: funcionou.** A tela do Alexandre mostrou
*"Última conferência às 13:46 — **25 recebido(s)**"* e
*"Código publicado no servidor: 2026-09-19-c"*. IMAP, senha cifrada, limites,
carimbo — a corrente inteira.

**Segundo: eu tinha movido demais.** Quando ele disse que a configuração estava
no lugar errado, movi as três coisas juntas para a Configuração — e **buscar** e
**analisar** não são configuração, são trabalho:

> *"preciso buscar e-mails de dentro da oportunidade e verificar se para o
> domínio e/ou contatos da empresa chegaram e-mails… e um botão da IA para
> analisar."*

A distinção certa, que agora está no código:

| | Onde | Por quê |
| --- | --- | --- |
| **Configurar** a caixa | Configuração | é de uma pessoa, vale para a carteira toda |
| **Buscar** e **Analisar** | dentro da negociação | a pergunta nasce olhando a Suzano |

- `App.buscarEmailsDaOportunidade` chama o servidor e responde **desta
  empresa**: quantos novos na caixa, quantas conversas apontadas para ela.
- `App.analisarEmailsDaOportunidade` analisa **só a fila deste negócio**, e o
  relatório fala daquele cliente. A versão global continua valendo para o app
  inteiro; as duas passam pelo mesmo `analisarLote`, extraído para não existirem
  duas cópias do laço (uma delas acabaria esquecendo de contar tentativa).

**`porQueVazio()` é a parte que eu não tinha e fazia falta.** "Nenhuma conversa"
tem causas diferentes e cada uma pede uma ação diferente — dizer só "nenhuma"
manda a pessoa adivinhar, e a primeira suspeita costuma ser a errada ("o e-mail
não funciona") quando quase sempre é cadastro:

| Situação | O que a tela diz |
| --- | --- |
| nenhum e-mail no IAD | clique em Buscar e-mails |
| empresa sem contato com endereço | é por isso que nada casou, e oferece cadastrar |
| chegou do domínio mas sem dono | *N conversas de suzano.com.br chegaram*, com link para a fila |
| nada daquele domínio | mostra **quais endereços está procurando** |

**21 testes novos**, incluindo o caso exato da tela dele: 25 e-mails na caixa,
nenhum da empresa, e a tela explicando por quê. Mais o fim a fim: chega um
e-mail da Ana, aparece na negociação, Analisar cria *"Ana da Suzano: Enviar a
apresentação para Ana da Suzano"* com data — e clicar de novo não repete.

---

## 0-Q. Uma conversa de cinco respostas não são cinco tarefas — v197, 19/09

O Alexandre descreveu o que espera do fluxo e terminou com um cuidado:
*"tem que tomar cuidado com e-mails que possuem várias respostas e réplicas"*.

Três dos quatro pontos dele já estavam construídos, e vale registrar onde:

| O que ele descreveu | Onde já estava |
| --- | --- |
| entrar na oportunidade e ver os e-mails | a aba **E-mail** do negócio, casada por endereço e por thread |
| apertar Analisar e virar movimentação | `analisarEmailsNovos` → evidência, nota e tarefa |
| ler só o que chegou depois da última vez | `ultimo_uid` na caixa e `analisada_em` na mensagem |

Sobre "a partir da **data** da última leitura": o IAD usa o **UID**, não a data.
É mais forte — relógio de servidor de e-mail erra, e duas mensagens no mesmo
segundo são indistinguíveis por data. O UID é um contador que só cresce.

**O quarto ponto era um buraco de verdade.** Uma troca de cinco respostas sobre
o mesmo pedido gerava **cinco tarefas iguais** — e lista de tarefas com
repetição perde a credibilidade que ela existe para ter.

`jaPediramIsso()` usa como chave o **assunto sem os "Re:"/"Enc:"**, que é o que
atravessa a thread inteira. Se já existe tarefa **aberta** vinda de e-mail com
aquele assunto, a nova não nasce. **Concluída não conta**: se a pessoa entregou
e o cliente pediu de novo, é pedido novo de verdade.

**Testado pelo caminho real**, e não chamando a função por dentro: quatro
mensagens semeadas na tabela, o assistente substituído por um de mentira que
devolve sempre o mesmo pedido, e `App.analisarEmails()` rodando de verdade.
Três da mesma conversa + uma de outro assunto → **duas** tarefas. Reanalisar
não repete. Concluir e cobrar de novo cria.

---

## 0-P. Saber qual código está no servidor — v196, 19/09

As duas caixas do Alexandre chegaram a **funcionando**, com senha guardada —
o cofre inteiro provado ponta a ponta. E o "Buscar agora" continuou dando
`not having enough compute resources`.

Aí eu travei numa pergunta que não deveria existir: **ele republicou a função
ou não?** A Edge Function é colada à mão no painel e não sobe com o app, então
não havia como saber se o servidor tinha a correção ou a versão de antes. Passei
a tarde inteira nesse escuro, e isso é pior do que o defeito — porque cada
tentativa de diagnóstico vale para uma versão que eu não sei qual é.

**`VERSAO_DA_FUNCAO`** resolve: um carimbo que volta em toda resposta e aparece
na tela, em *O servidor de e-mail → Código publicado no servidor*. A pergunta
passa a ter resposta em vez de palpite.

**E a primeira leitura mudou de regra**, que é uma decisão de produto e não um
detalhe:

| | O que traz |
| --- | --- |
| primeira vez | as **mais recentes**, e o arquivo antigo fica para trás de propósito |
| daí em diante | as mais antigas primeiro, para a marca avançar sempre |

Drenar dez anos de caixa de 25 em 25 levaria meses, e ninguém precisa disso: o
que move uma negociação é o que foi escrito nas últimas semanas. O histórico
continua no Gmail, onde sempre esteve.

63 ok na função (eram 57), 63 no navegador.

---

## 0-O. A função pedia a caixa inteira de uma vez — v195, 19/09

Senha aceita, e o próximo erro:

> *"Function failed due to not having enough compute resources (please check
> logs)"*

Que não diz nada sobre e-mail e manda procurar no lugar errado. A causa: na
**primeira** leitura de uma caixa, `ultimo_uid` é zero, então o comando saía
como `UID FETCH 1:*` — **"me dê tudo"**. Numa caixa de verdade isso é a
correspondência de anos chegando de uma vez, e a função morre.

**Dois limites, e eles precisam dos dois:**

- **25 mensagens por rodada.** Com `UID FETCH n:*` não há como pedir "as 25
  primeiras" — quem decide quantas vêm é o servidor. Então agora se **pergunta
  antes**: `UID SEARCH` devolve só números (uma caixa de dez mil responde uns
  70 KB), escolhem-se as 25 mais antigas, e só elas são buscadas pelo UID. Com
  o agendador de 5 em 5 minutos, uma caixa antiga drena sozinha.
- **64 KB por mensagem**, com `BODY.PEEK[]<0.65536>`. O IAD guarda só o texto —
  anexo e imagem ficam onde estão. Sem isso, um anexo de 30 MB entra na memória
  por acidente.

A tela diz quantas faltam, senão a pessoa veria "25 recebidos" três vezes e
concluiria que travou.

**O fake era o problema de novo — a terceira vez hoje.** Ele devolvia as mesmas
três mensagens para qualquer pedido, então nunca notou que a função pedia tudo.
Agora ele tem uma caixa de 43 mensagens (40 delas com 200 KB), responde
`SEARCH` de verdade, entrega só os UIDs pedidos e só o pedaço pedido, e
**recusa um FETCH sem limite de tamanho**. Reintroduzi o defeito para conferir:
o teste acusa `UID FETCH 11:* (UID INTERNALDATE BODY.PEEK[])` e a caixa fica
com zero mensagens.

Quatro asserções novas, e são sobre a forma do pedido, não sobre o resultado:
que o `SEARCH` vem antes do `FETCH`, que o pedaço é de 64 KB, que vêm no
máximo 25, e que **nunca se pede a caixa inteira**. 57 ok na função, mais 62
no navegador.

---

## 0-N. Testar a senha não é ler a caixa com um truque — 19/09

Com o CORS resolvido, a função finalmente respondeu — e mostrou dois erros
diferentes, um em cada caixa:

| Caixa | O que voltou |
| --- | --- |
| `@biopartners.com.br` | `[AUTHENTICATIONFAILED] Invalid credentials` |
| `@biosolvit.com` | **`Could not parse command`** |

O segundo era meu. Para testar a senha sem baixar mensagem nenhuma, eu chamava
a leitura da caixa com `ultimo_uid: Number.MAX_SAFE_INTEGER`, achando esperto:

```
UID FETCH 9007199254740992:* (UID INTERNALDATE BODY.PEEK[])
```

**UID de IMAP cabe em 32 bits.** Acima disso o servidor não recusa a busca —
recusa a *linha*, e a mensagem que volta não fala de UID nenhum. Ou seja: a
senha do biosolvit estava **certa**, e o app dizia que não.

**A correção é estrutural, não um `Math.min`:** `naCaixa()` passou a ser o
começo compartilhado (conectar, cumprimentar, entrar, escolher a pasta), e
sobre ele existem dois usos — `testarCaixa()`, que só entra e sai, e
`lerCaixa()`, que busca. Testar virou *um comando a menos*, e não uma leitura
disfarçada. O teto de 32 bits também entrou na busca, por garantia.

**O servidor de mentira era permissivo demais** — aceitava qualquer número num
`UID FETCH`, e por isso os 51 testes passavam com o defeito dentro. Agora ele
recusa fora da faixa, como o Gmail faz. Reintroduzi o defeito para conferir, e
o teste reproduz o erro exato que o Alexandre viu: `{"erro":"Could not parse
command"}`, com a linha de 16 dígitos no relatório.

Dois testes novos, e o segundo é o que importa: **guardar a senha não pode
pedir mensagem nenhuma** — nenhum `UID FETCH` na conversa —, mas tem de entrar
e escolher a pasta. 53 ok.

É a segunda vez hoje que um fake complacente esconde um defeito real (a
primeira foi o banco que ignorava filtros). A regra que fica: **quando um teste
passa e a realidade não, desconfie do fake antes do código.**

---

## 0-M. Uma palavra que faltava numa lista — 19/09

O Alexandre publicou a função `email`, com os dois arquivos, com o nome certo.
E continuou vendo *"a resposta não chegou"*.

**A causa era uma palavra minha:**

```
assistente:  'authorization, x-client-info, apikey, content-type'   ← funciona
email:       'authorization, content-type, x-cron'                  ← falta apikey
```

O app manda `apikey` em toda chamada. Antes de enviar um pedido com cabeçalhos
fora do comum, o navegador pergunta ao servidor se pode — e basta **um** não
estar na resposta para ele negar a permissão e **o pedido de verdade nunca
sair**.

**E isso não deixa rastro.** A função não é chamada: não há log, não há erro,
não há nada para investigar do lado do servidor. Do lado do app o sintoma é
idêntico ao de uma função que não foi publicada — que foi exatamente onde eu
fui procurar. Mandei o Alexandre publicar de novo, conferir nomes, conferir
arquivos, e trocar a senha de aplicativo várias vezes, com e sem espaços,
atrás de um problema que estava numa vírgula minha. Escrevi a função do zero
em vez de copiar a linha do CORS das que já funcionavam.

**O teste que faltava:** `nuvem/testes/cors.test.ts`. Ele lê o `cabecalhos()`
do `src/nuvem.js` e o `Access-Control-Allow-Headers` de **cada** Edge Function,
e compara as duas listas. Teste de navegador não pegaria isto — ele fala com um
servidor de mentira, que não faz essa pergunta. Confirmei que ele pega,
reintroduzindo o defeito de propósito antes de restaurar.

Hoje: 4 ok nas três funções. Quando nascer a quarta, ela entra sozinha na
conferência.

---

## 0-L. A mensagem de erro culpava a pessoa — v194, 19/09

O Alexandre cadastrou as duas caixas, colou a senha de aplicativo **com e sem
espaços**, e o app respondeu:

> *"A caixa foi salva, mas a senha não foi aceita: Não foi possível falar com o
> servidor. (…) O mais comum é ser a senha da CONTA em vez da senha de
> APLICATIVO."*

As duas frases se contradizem, e a segunda é minha. A resposta **nem chegou ao
navegador** — a Edge Function não está publicada — e ainda assim a mensagem
mandou ele desconfiar da própria senha. Ele foi trocar de senha atrás de um
problema que não era dele, enquanto o problema real (um passo de instalação que
faltou) ficava invisível.

**A regra que faltava usar** já estava escrita no `src/nuvem.js`, no comentário
do `chamar`: *erro com status veio do servidor; erro SEM status significa que a
resposta nem chegou*. `porQueASenhaFalhou(e)` passou a respeitá-la:

| O que aconteceu | O que a tela diz agora |
| --- | --- |
| sem status — a resposta não chegou | **"ISSO NÃO É A SUA SENHA"**, e manda conferir se existe a função `email` com os **dois** arquivos |
| 503 | falta o segredo `EMAIL_CHAVE_MESTRA` |
| 401 / 403 | a sessão venceu, entre de novo |
| a caixa recusou de verdade | aí sim: senha da conta ≠ senha de aplicativo, com o endereço de onde gerar |
| qualquer outro | o que o servidor disse, sem inventar causa |

A explicação também foi para a **tela**, e não só para o alerta: a busca roda
sozinha ao abrir a aba, e ali não há alerta nenhum — antes, a linha dizia "não
foi possível falar com o servidor" e parava aí.

**13 testes**, um por causa, cada um provando também o que a mensagem **não**
diz: no caso da função fora do ar, que ela *não* fala em senha da conta. O
teste usa `route.abort()` de propósito, que é o que de fato acontece quando a
função não existe — o portão recusa e o CORS impede o navegador de ler o que
voltou.

**Duas asserções antigas foram atualizadas, não apagadas:** elas cobravam o
texto do alerta anterior.

---

## 0-K. A caixa é da pessoa, não da negociação — v193, 19/09

**O Alexandre olhou a tela e viu na hora o que eu não tinha visto:**

> *"Esta configuração não deveria ficar dentro de Configurações? Está dentro de
> Pipeline… parece que cada oportunidade terá uma configuração da minha caixa."*

Ele tem razão, e o erro é de desenho. O botão **Minha caixa** estava dentro da
aba E-mail de *uma negociação*. A caixa é de uma **pessoa** e vale para a
carteira inteira — configurá-la a partir de um negócio faz parecer que cada
negócio tem a sua. Foi a primeira pergunta de quem olhou a tela, e isso é o
teste que importa.

**O que mudou de lugar:**

- **Configuração ganhou a aba "Minha caixa de e-mail"** (`configEmail`): uma
  linha por endereço, com o estado em primeiro lugar — *funcionando*,
  **falta a senha** ou *com erro* —, quem envia e quem só recebe, desde quando
  a senha está guardada, e Editar. Mais o bloco **O servidor de e-mail**, com
  o Buscar agora e o resultado da última rodada.
- **A aba E-mail da negociação ficou só com a conversa daquele cliente**:
  Escrever, a linha da análise e as mensagens. Sem configurar nada.
- **Quando falta caixa**, a aba não some o problema: diz o que falta e leva
  para o lugar certo (`App.irParaMinhaCaixa`), porque a falta é percebida de
  dentro da negociação e mandar a pessoa procurar no menu é mandá-la desistir.
- `linhaDoTransporte` foi removida — virou `blocoTransporte`, na Configuração.
- O manual passou a ensinar o caminho novo, incluindo que os campos de
  servidor ficam **vazios** para Gmail e Outlook (outra dúvida real dele).

**Por que a lista tem estado e não só o endereço:** cadastrado-e-sem-senha é o
pior caso possível, porque parece pronto e não funciona. Ele agora aparece em
vermelho e com um aviso que diz o que fazer.

**19 testes novos no navegador**, mais os 13 do transporte reescritos para a
tela nova — os antigos cobravam o lugar antigo e passaram a falhar de
propósito. Não apaguei a cobertura: movi as asserções para onde a coisa está.

**Um erro meu no caminho, que vale registrar:** uma substituição por fatia
(`s[i:j]`) com os índices invertidos devolveu string vazia, e
`s.replace('', novo)` inseriu o texto entre cada caractere do arquivo —
`views.js` foi de 448 KB para **411 MB**. `git checkout` desfez; a lição é que
substituição por fatia precisa afirmar `i < j` antes, e não depois.

---

## 0-J. Cada pessoa liga a própria caixa — v192, 19/09

**O Alexandre não entendeu o que tinha de fazer, e ele estava certo:** o
desenho da v191 não respondia à pergunta dele. A senha de aplicativo de cada
vendedor morava num segredo do painel (`EMAIL_SENHAS`), editado à mão. Isso
funciona para uma pessoa e falha para todas as outras, por um motivo que não é
técnico:

> a Rosa teria de **mandar a senha dela** para quem administra o painel.

Senha que viaja por WhatsApp já está queimada, por melhor que seja o cofre do
outro lado. E o app dizia, com todas as letras, *"me avise quando tiver gerado"*
— ou seja, ele não terminava sozinho.

**Agora cada um guarda a sua, sozinho.** A senha faz uma viagem só: do
computador da pessoa para a Edge Function, por TLS. A função **testa** contra a
caixa antes de guardar e só então cifra (AES-256-GCM) e grava.

- **`nuvem/correcao-21-senha-da-caixa.sql`** — a tabela `segredos_email`, com
  RLS ligada e **nenhuma política**: quem passa pela RLS não lê nem escreve
  nada. Só a `service_role` da função chega lá. Mais `senha_em` em
  `caixas_email`, que é uma data e não uma credencial — é ela que a tela lê
  para dizer "falta a senha".
- **Duas coisas que o Postgres de verdade pegou.** A primeira versão punha a
  senha cifrada numa coluna de `caixas_email` e revogava o SELECT dela; a
  conferência voltou **`SIM — ALGO ERRADO`**, porque revogar permissão de
  coluna não tem efeito nenhum enquanto existe permissão de tabela. Fatiar por
  coluna ainda deixaria uma armadilha: coluna nova em migração futura nasceria
  invisível, e a leitura inteira quebraria sem dizer por quê. Tabela separada
  resolve as duas.
- **Testado:** 51 testes na função (eram 33). Os novos provam que o guardado
  **não é** a senha nem a senha em base64, que cada gravação sai diferente (o
  vetor do GCM é sorteado — reaproveitá-lo é a falha clássica do modo), que
  senha errada é recusada **sem** apagar a boa que já estava lá, que ninguém
  guarda senha na caixa de outro e que o agendador não guarda senha nenhuma.
- **Dois testes falharam por culpa do banco de mentira, não do código:** ele
  ignorava os filtros da consulta e devolvia sempre a mesma caixa — o que
  transformava em "ok" justamente os testes de isolamento. Consertado o falso,
  os dois passaram de verdade.
- **16 testes no navegador**, com a Rosa: o campo é `password`, os espaços que
  o Google mostra são tirados, senha errada deixa o cadastro de pé e explica o
  motivo do servidor, em branco mantém a que está guardada — e **a senha não
  aparece em localStorage, sessionStorage, no estado do app nem na tela**.

**Na tela:** campo de senha em "Minha caixa"; a caixa sem senha vira uma pílula
**vermelha com FALTA A SENHA** (cadastrada e não funciona é o jeito mais fácil
de alguém achar que terminou sem ter terminado); e um botão **Como gerar** que
leva ao manual.

**No manual, seção nova `m-email`** — escrita para vendedor, não para quem
instala: o que é senha de aplicativo e por que não é a da conta, como descobrir
quem hospeda o e-mail da empresa, os seis passos, os dois exemplos de verdade
(Alexandre com duas caixas e uma que envia; Rosa com uma só) e a tabela de
"quando dá errado". Com o aviso que importa: **não mande as 16 letras para
ninguém**.

**`EMAIL_SENHAS` continua aceito** para quem já o usava — a senha guardada pela
tela tem precedência. Mas o `nuvem/CAIXA-DE-EMAIL.md` agora separa em duas
colunas quem faz o quê: instalar é uma vez, de quem administra; ligar a própria
caixa é de cada vendedor, sozinho.

**Falta o Alexandre fazer:** rodar a `correcao-21` e criar o segredo
`EMAIL_CHAVE_MESTRA` (`openssl rand -base64 48`, uma vez, nunca trocar).
Depois disso a Rosa se vira sozinha.

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
