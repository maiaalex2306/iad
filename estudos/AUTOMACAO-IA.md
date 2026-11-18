# O que dá para trazer do mercado de AI SDR para dentro do IAD

Estudo de setembro de 2026, a pedido do Alexandre, sobre dois documentos:
o **Dossiê Global de AI SDR / LinkedIn Outreach / Revenue Orchestration** (12
plataformas) e a **Análise Completa do Chattie**.

A pergunta era: *o que podemos implantar de automação deles no IAD para
torná-lo mais efetivo e autônomo?*

A resposta curta está aqui em cima, porque ela muda a leitura de tudo o que
vem depois:

> **O IAD não está atrás dessas plataformas. Ele está num eixo diferente — e
> num lugar que elas estão tentando alcançar.** As doze medem ATIVIDADE
> (aceitação, resposta, reunião marcada). O IAD mede DECISÃO DO COMPRADOR
> (IAD 0–16, idade da evidência, cobertura do grupo comprador, força da
> evidência). O dossiê diz, na conclusão, que o maior espaço de inovação do
> mercado é **memória coordenada de buying committee**. O IAD já tem o grafo:
> `PAPEIS`, `PAPEIS_CRITICOS`, `coverage()`, `mobilizadores()`,
> `bloqueadores()` e os perfis Challenger. Falta coordenar, não modelar.

Então este estudo não é "como copiar o Chattie". É: **quais peças daquele
mercado encaixam num motor que já é melhor, e quais peças a gente deve
recusar de propósito.**

---

## Parte 0 — O que os dois documentos realmente dizem

Tirando o marketing, as duas leituras convergem em cinco frases.

**1. O valor migrou do motor de envio para o motor de decisão.**
Copy gerada por IA virou commodity. O dossiê é explícito: *"a vantagem
competitiva tende a migrar do motor de envio para a qualidade do motor de
decisão: quem abordar, por qual motivo, por qual canal, em qual momento, com
qual narrativa e qual ação executar depois de cada resposta."*

**2. O que se automatiza não são mensagens — são ESTADOS.**
É a tese central da análise do Chattie: *"o Chattie não automatiza somente
mensagens; ele automatiza estados comerciais."* O prospect tem um estado
(`NEW → INVITE_SENT → CONNECTED → REPLIED → QUALIFIED → MEETING`), e a
máquina decide o próximo movimento a partir do estado, não de um calendário.

**3. IA de texto sozinha não ganha.**
O achado mais honesto dos dois documentos vem do Expandi, que tem a maior
base (13,2 milhões de convites): *"mensagens puramente geradas por IA não
superaram automaticamente a copy humana quando controles de comparação foram
aplicados."* O ganho vem de targeting, timing e consistência — não de prosa.

**4. Separe cérebro de execução.**
A lição do HeyReach: quem decide não precisa ser quem envia. Plataformas de
execução viraram commodity programável; o que vale é a camada que decide.

**5. Automação de LinkedIn não é autorizada, e nenhum fornecedor garante o
contrário.** Os dois documentos batem nisso. O LinkedIn declara que não
permite software de terceiros que automatize conexões, mensagens, curtidas ou
comentários. *"Não trate 'human-like', 'safe limits', 'cloud', 'proxy' ou
'account protection' como sinônimo de conformidade oficial."* Os próprios
Termos do Chattie atribuem o risco ao usuário.

---

## Parte 1 — Onde o IAD já está, módulo a módulo

O dossiê fecha com os **10 módulos mínimos de uma plataforma superior**
(§17.1). É a melhor régua possível, porque foi escrita olhando as doze. Abaixo,
o IAD medido contra ela — sem generosidade.

| # | Módulo do dossiê | O IAD hoje | Onde está no código | Situação |
|---|---|---|---|---|
| 1 | **Company Brain** — oferta, provas, objeções | Contexto por tenant (segmentos, contas, régua) injetado nos prompts. Não há objeto "o que vendemos e como provamos". | `promptDe()`, `reguaDetalhada()` em `assistente/index.ts` | **Falta o essencial** |
| 2 | **ICP Engine** — fit por conta e pessoa | Segmentos existem e a IA classifica. Não há score de fit. | `classificarSegmentos()` | **Falta** |
| 3 | **Signal Engine** — "por que agora" | 23 tipos de sinal, peso 1–3, janela de 21 dias, e `momento()` — que mede o comprador andando enquanto o CRM ficou parado. | `TIPOS_SINAL`, `momento()`, `sinaisFortes()` | **Melhor que a maioria delas** |
| 4 | **Buying Committee Graph** | Papéis, papéis críticos, cobertura, mobilizadores × bloqueadores, perfis Challenger. | `coverage()`, `PAPEIS`, `PERFIS` | **Modelado; não coordenado** |
| 5 | **Research Agent** | Classifica segmento pela descrição que o Linked Helper traz, sem sair para a internet. | `classificarSegmentos()`, `empresaDescricao` | **Parcial, por escolha** |
| 6 | **Decision Engine** | `nextBestDecision()` escolhe a próxima DECISÃO a provar e o canal. `momento()` dá o timing. | `engine.js` | **Existe, mas por oportunidade e sob demanda** |
| 7 | **Conversation Agent** | Lê e-mail, classifica, cria tarefa, dedupe por assunto, analisa reunião, sugere notas. | `analisarLote()`, `tarefaDoCompromisso()`, `analisarReuniao()` | **Forte na leitura; nada na resposta** |
| 8 | **Execution Layer** | E-mail próprio (IMAP/SMTP), WhatsApp (API Meta), ponte do Linked Helper (só leitura). | `funcoes/email`, `funcoes/whatsapp`, `ponte/worker.js` | **Existe; sem cadência** |
| 9 | **Revenue Memory** | Histórico, curva, delta semanal, evidências por dimensão, histórico de nutrição. | `historico()`, `curva()`, `deltaSemana()` | **Por oportunidade, não por conta** |
| 10 | **Learning Loop** | Retrato da carteira, plano de desenvolvimento, mediana por etapa, análise por segmento, tela de Revisão. | `retratoDaCarteira()`, `medianaEtapaGanhos()` | **Existe; sem atribuição por ação** |

**Placar honesto: 4 de 10 fortes, 3 parciais, 3 ausentes.** E os três ausentes
(Company Brain, ICP Engine, memória de conta) são os mais baratos de construir,
porque nenhum deles depende de LinkedIn, de fornecedor externo ou de
infraestrutura nova.

### O que o IAD tem e nenhuma das doze tem

Vale registrar, porque define a estratégia:

- **Medida de decisão, não de atividade.** Nenhuma das doze sabe dizer se o
  negócio existe. Elas sabem dizer quantas mensagens saíram. O IAD sabe dizer
  que a Heineken está em IAD 6 com Consenso zerado e 40 dias sem evidência.
- **Força da evidência.** "Ele disse que leva ao CFO" ≠ "o CFO participou".
  `FORCAS` (relato / confirmado / documentado) e `FORCA_MINIMA_DO_DEGRAU`. Isso
  é imunidade a otimismo — e é exatamente o que falta a um agente autônomo que
  interpreta respostas.
- **Dois relógios separados.** Idade da evidência mede o nosso registro;
  idade do sinal mede o comportamento dele. `momento()` é a diferença entre os
  dois. Nenhuma plataforma do dossiê faz essa distinção.
- **A recusa de contaminar o índice.** O comentário no `engine.js` já diz:
  *"Sinal que mexesse na nota transformaria o IAD num contador de cliques, que
  é o que todo CRM já é e o motivo de nenhum deles saber dizer se o negócio
  existe."* Mantenha isso. É a decisão de arquitetura mais valiosa do produto.

---

## Parte 2 — Tudo o que dá para implantar

Vinte e três itens, agrupados pelos 10 módulos. Cada um traz: o que é, de onde
veio, onde encaixa no código, esforço, custo de IA e risco de plataforma.

Legenda de esforço: **P** = dias · **M** = uma a duas semanas · **G** = mais.
Custo de IA: **livre** = pura computação, não gasta token.

---

### Módulo 1 — Company Brain

#### 1.1 Cérebro da empresa (tabela `cerebro_empresa`) — **P · livre · sem risco**

De onde veio: Reply/Jason (Knowledge Base + Offers + Playbooks como objetos
separados), Chattie (Setup Wizard), 11x (Knowledge Base contra alucinação).

Um registro por tenant com: **o que vendemos**, **para quem**, **provas e
casos**, **objeções conhecidas e as respostas**, **tom de voz**, **o que NÃO
prometemos**. Injetado em todo prompt do `assistente`.

Por que é o item nº 1 da lista inteira: ele melhora **todas** as funções de IA
que já existem, de uma vez — `analisarReuniao`, `sugerirNotas`,
`planoDaOportunidade`, `retratoDaOportunidade`, `analisarEmailsNovos`. Hoje a
IA do IAD sabe o método mas não sabe o negócio. É a diferença entre um
consultor que leu o manual e um que conhece a empresa.

Implementação: tabela + tela em Configuração + `cerebro(ctx)` entrando em
`promptDe()`. A régua já é montada assim; é o mesmo padrão.

#### 1.2 Rascunho do cérebro a partir do site — **M · pago · risco técnico**

Chattie e Waalaxy partem da URL da empresa. Dá para fazer: Edge Function busca
o site, LLM extrai um rascunho do cérebro, **o humano edita**.

Cuidado obrigatório: buscar URL arbitrária dentro de uma Edge Function é SSRF.
Precisa de lista de domínios permitidos, bloqueio de IP privado, timeout e
limite de tamanho. Não é difícil, mas não pode ser esquecido.

#### 1.3 Biblioteca de objeções ligada às 8 decisões — **P · livre · sem risco**

Esta é nossa, não deles, e é melhor do que a deles. O Chattie tem
`HANDLE_OBJECTION` genérico. O IAD pode dizer **qual decisão a objeção
ataca**:

| Objeção | Decisão atacada | Evidência que responde |
|---|---|---|
| "Está caro" | Impacto e Critérios | Número do custo de não fazer, validado por ele |
| "Vamos deixar para o ano que vem" | Prioridade | O que acontece se esperar 12 meses, nas palavras dele |
| "Já temos fornecedor" | Problema e Critérios | O que o atual não resolve, dito por ele |
| "Preciso falar com o meu chefe" | Stakeholders e Processo | Quem decide, e como ele decide |
| "Manda material que eu vejo" | Consenso | Quem mais precisa ver, e quando vocês olham juntos |

Guardado no playbook, usado pelo analisador de e-mail e pelo rascunho de
resposta. **Traduz objeção em lacuna de decisão** — e a lacuna já tem
evidência definida. Nenhuma das doze consegue fazer isso porque nenhuma
modela decisão.

---

### Módulo 2 — ICP Engine

#### 2.1 ICP declarado — **P · livre · sem risco**

Segmento, porte, região, cargos-alvo, gatilhos. Por tenant. Simples.

#### 2.2 **ICP aprendido dos ganhos** — **M · livre · sem risco**

O item mais subestimado deste estudo, e provavelmente o de melhor retorno.

Todas as doze pedem que você **declare** o ICP. O IAD pode **derivar** o ICP
dos negócios que fechou: ele tem `desfecho`, `porSegmento()`,
`medianaEtapaGanhos()`, cargo dos contatos, campanha e origem de cada
oportunidade.

```
E.icpAprendido(oportunidades) →
  por segmento:   taxa de ganho, IAD médio, tempo até maduro, ticket
  por cargo:      qual papel na primeira conversa antecede ganho
  por origem:     qual campanha do LH produz negócio, e não só volume
  por porte:      onde a gente ganha e onde a gente perde tempo
```

E então `scoreICP(conta)` de 0 a 100, com a razão por escrito ("segmento
Bebidas: 3 ganhos em 7; primeiro contato com Diretor Industrial antecede ganho
em 4 de 5").

**O uso imediato é o problema real dele:** 98 negócios em Conexão com IAD 0 na
Carteira Ativa. Hoje a triagem é alfabética. Com score de ICP, a lista abre
ordenada por probabilidade — e a Nutrição em lote deixa de ser "mover o que eu
não conheço" e vira "mover o que a minha própria história diz que não fecha".

Isso é um filtro a mais em `passaNoFiltroDaNutricao()` e uma coluna a mais em
`listaDaNutricao()`. O motor é aritmética sobre dados que já estão lá.

#### 2.3 Falso positivo do Linked Helper — **P · livre/pago · sem risco**

Waalaxy tem `FILTER_FALSE_POSITIVE`. O IAD recebe do LH `cargo`, `headline`,
`empresaDescricao`, `empresaSetor`. Dá para marcar, na entrada, quem
claramente não é ICP — estudante, aposentado, empresa de outro setor,
concorrente — antes de virar oportunidade. Barato, e evita o entulho que já
está lá.

---

### Módulo 3 — Signal Engine

É o módulo mais forte do IAD. Os gaps são de **captura**, não de modelo.

#### 3.1 Abertura e clique de e-mail automáticos — **M · livre · sem risco**

`email_abriu` (peso 1) e `email_clicou` (peso 2) existem em `TIPOS_SINAL` mas
**não são `automatico: true`** — dependem do vendedor anotar, e ninguém anota.

A ponte já sabe emitir link rastreado e colher aberturas (`emitirLink()`,
`/aberturas`, `colherAberturas()`). Falta ligar isso ao envio de e-mail:
reescrever os links do corpo pela ponte no momento do envio, e um pixel para
abertura. Infraestrutura 100% nossa (Cloudflare Worker), zero risco de
plataforma.

Ganho: o canal que o Alexandre acabou de ligar passa a alimentar o relógio do
comprador sozinho.

#### 3.2 **Mudança de cargo detectada pela ponte** — **P · livre · sem risco**

`mudou_de_cargo` (peso 2) existe no modelo e nunca é emitido.

O LH já traz `position`, `company_name`, `connected_at_iso` a cada colheita. É
uma comparação: se o cargo ou a empresa do contato mudou desde a última vez,
emite o sinal. Umas trinta linhas em `colherAberturas()`/`buscar()`.

O dossiê trata job change como um dos gatilhos mais fortes que existem (11x o
lista primeiro em `DETECT_JOB_CHANGE`), e o PhantomBuster tem um playbook
inteiro de "dormant connections → job change → message". O IAD pode ter isso
de graça, porque o dado já chega.

#### 3.3 Visita ao site — **M · livre · sem risco**

O Worker da ponte pode servir um snippet e identificar o visitante pelo link
rastreado que ele clicou antes. `site_visitou` (2) e `site_precos` (3) já estão
modelados. É a categoria "visitor intelligence" que o dossiê cita (RB2B,
Trigify) — em versão pequena, mas nossa e sem mensalidade.

#### 3.4 Engajamento em post → lead — **M · livre · RISCO DE PLATAFORMA**

Chattie (`POST_ENGAGEMENT`), PhantomBuster (`POST_LIKERS`, `COMMENTERS`),
Expandi (triggers). Transformar quem curtiu/comentou em lead.

**Só faça pelo Linked Helper**, que já é a ferramenta dele e já assume esse
risco. O IAD recebe pela ponte e emite `linkedin_engajou`. O IAD não deve ser
quem raspa.

#### 3.5 Movimento na empresa — **G · pago · sem risco**

`empresa_movimento` (peso 1). Uma função periódica com busca web por conta
prioritária: obra, contratação, expansão, notícia. Custo real por conta; só
vale para a lista A. Deixe para depois do resto.

---

### Módulo 4 — Buying Committee Graph

**O maior diferencial possível do IAD, e o espaço que o dossiê aponta como o
mais aberto do mercado inteiro.**

#### 4.1 **Narrativa por papel** — **M · pago · sem risco**

O dossiê §20.3: *"O salto não é mandar cinco mensagens diferentes para cinco
pessoas. É permitir que a IA entenda que as cinco pessoas pertencem à mesma
decisão de compra, que cada uma possui interesse, linguagem e poder diferente,
e que uma resposta em um ponto altera a estratégia dos outros stakeholders."*

O IAD já sabe quem é quem: `PAPEIS` com Champion, Decisor econômico,
Financeiro, Compras, Usuário; `PERFIS` Challenger com mobilizador × falador ×
bloqueador; `coverage()` dizendo quem falta.

O que falta construir: para uma oportunidade, a IA produz **um ângulo por
papel presente**, todos ancorados no mesmo Cérebro da Empresa e nos mesmos
fatos da conta, **explicitamente sem colidir** — e o prompt recebe a
instrução de não revelar a um o que o outro disse em particular (o próprio
dossiê levanta esse cuidado no exemplo da §20.4).

| Papel | Narrativa | Decisão que ela move |
|---|---|---|
| Decisor econômico | Impacto e risco de não fazer | Impacto, Prioridade |
| Financeiro | Payback, business case | Impacto, Critérios |
| Compras | SLA, implantação, fornecedor | Processo, Risco |
| Usuário / Operação | Produtividade, adoção | Problema, Consenso |
| Champion | Munição para defender por dentro | Consenso |

#### 4.2 Cobertura como fila de trabalho, não como alerta — **P · livre · sem risco**

`coverage()` já diz que falta o decisor econômico. Hoje isso é um alerta na
tela. Vire tarefa: "falta o Financeiro na Suzano — peça ao Carlos (Champion,
perfil Professor) uma apresentação conjunta". A ação concreta, com o nome da
pessoa que pode abrir a porta e o motivo pelo qual ela abriria.

#### 4.3 Resposta de um muda a estratégia dos outros — **M · pago · sem risco**

Quando chega evidência de um stakeholder, recalcular a recomendação para os
demais. É o exemplo da §20.4 do dossiê: Engenharia responde "já temos projeto
em avaliação" → a próxima mensagem ao Diretor muda. O IAD tem os dois lados
(evidência por dimensão, papel por contato); falta o gatilho.

---

### Módulo 5 — Research Agent

#### 5.1 Ficha da conta — **M · pago · risco técnico (SSRF)**

Site + descrição do LinkedIn → resumo estruturado: o que faz, porte, unidades,
mercado. Cacheado por conta, refeito sob demanda. Mesmo cuidado de SSRF do 1.2.

#### 5.2 Pesquisa no momento do contato — **G · pago · sem risco**

11x chama de Live Web Search. Cara e raramente decisiva. Baixa prioridade.

---

### Módulo 6 — Decision Engine

#### 6.1 **A Fila — próxima melhor ação da carteira inteira** — **M · LIVRE · sem risco**

Se este estudo tivesse que virar um item só, seria este.

Hoje `nextBestDecision(op)` responde por oportunidade, quando alguém abre a
oportunidade. O dossiê inteiro descreve o oposto: um supervisor que olha a
carteira e decide **quem abordar primeiro** (§14.1).

O IAD tem todos os insumos e **não precisa de LLM nenhum para ordenar**:

```
Para cada oportunidade aberta:
  qual decisão falta        ← nextBestDecision(op)
  quem pode prová-la        ← papel exigido pela dimensão × contatos da conta
  por qual canal            ← dim.canais (o playbook já diz)
  urgência                  ← momento(op) + evidenceAge + sinais fortes
  fit                       ← scoreICP(conta)          [item 2.2]
  valor                     ← op.valor
  bloqueio                  ← gates(op), coverage(op)

→ lista ordenada, com o MOTIVO por escrito de cada posição
```

Vira uma tela — ou melhor: vira o topo da tela **Hoje**. "Estas são as sete
coisas que mais movem a sua carteira hoje, e por quê." Cada linha com o botão
que cria a tarefa já preenchida.

É o que transforma a sensação do produto de "sistema onde eu registro" para
"sistema que me diz o que fazer". E é **aritmética sobre dados que já estão no
banco** — não gasta um token, não depende de fornecedor, não tem risco de
plataforma, não precisa de tabela nova.

#### 6.2 Próxima melhor pessoa — **P · livre · sem risco**

Componente do 6.1, mas vale isolado: cada dimensão do playbook já tem canal e
conteúdo; falta cruzar com o papel do contato. "Processo" se prova com Compras;
"Consenso" se prova com o Champion.

#### 6.3 Próximo melhor momento — **P · livre · sem risco**

`momento(op)` já calcula o atraso entre o relógio do comprador e o nosso.
Falta virar recomendação explícita: "sinal forte há 3 dias, evidência há 40 —
a conversa tem hora marcada, e é hoje."

---

### Módulo 7 — Conversation Agent

#### 7.1 **Taxonomia de intenção** — **P · pago · sem risco**

O Chattie é claro: o que separa gerador de texto de AI SDR é classificar
intenção e **mudar de estado**. A lista dele traduzida para ações do IAD:

| Intenção | O que o IAD faz |
|---|---|
| `MEETING_INTENT` — "podemos quarta?" | Cria tarefa Reunião na data |
| `COMMERCIAL_INTENT` — "quanto custa?" | Confere `gates(op)` antes da proposta; se faltar decisão, avisa |
| `FUTURE_FOLLOW_UP` — "me chama em novembro" | **Manda para Nutrição com a data que ele disse** |
| `REFERRAL` — "fala com o Carlos" | Cria contato, pede o papel, sugere abordagem |
| `OBJECTION` — "está caro" | Mapeia para a decisão atacada [item 1.3] |
| `NEGATIVE_INTENT` — "não temos interesse" | Sugere desfecho ou nutrição com motivo |
| `OUT_OF_OFFICE` | Não conta como resposta; reagenda (LGM tem `OOO Detection`) |
| `NEEDS_HUMAN` | Marca para o vendedor, sem sugerir nada |

Repare no `FUTURE_FOLLOW_UP`: ele cai exatamente na tela de Nutrição que
acabamos de construir, com motivo e data vindos da boca do cliente. As duas
peças foram feitas separadas e encaixam.

O analisador de e-mail já existe (`analisarLote`, `tarefaDoCompromisso`); isso
é ampliar o esquema de saída dele.

#### 7.2 Rascunho de resposta — Copilot, **nunca** Autopilot — **M · pago · sem risco**

O Chattie tem Autopilot (a IA responde sozinha), Copilot (a IA escreve, o
humano aprova) e Human Takeover. **O IAD deve ter só os dois últimos**, e a
razão é metodológica, não técnica:

> O IAD mede evidência do cliente. Uma IA que responde sozinha produz
> atividade nossa, não evidência dele. Pior: produz uma conversa que o
> vendedor não viveu e vai ter que fingir que lembra na reunião seguinte.

Rascunho na aba de E-mail da oportunidade, ancorado no Cérebro da Empresa, na
decisão que falta e na objeção identificada. O vendedor edita e manda. O
dossiê chama isso de Approval Gate; o IAD chama de bom senso.

#### 7.3 Reengajamento do silêncio — **M · pago · sem risco**

`REENGAGE` da biblioteca universal. O IAD tem o gatilho melhor que todos:
não é "7 dias sem resposta" — é **`momento(op)`**: sinal forte e recente com
evidência velha. Quer dizer que ele se mexeu e nós não. É o melhor momento de
reengajar que existe, e só o IAD sabe calcular.

#### 7.4 Sandbox de conversa — **M · pago · sem risco**

O melhor design do Chattie: simular a conversa inteira antes de pôr no ar
(*configurar → simular → corrigir → disparar*). No IAD: escolher uma
oportunidade real e simular como a abordagem da próxima decisão seria
recebida por aquele perfil Challenger, com objeção e tratamento. Serve de
treinamento — que é metade do que o IAD se propõe a fazer.

---

### Módulo 8 — Execution Layer

#### 8.1 **Cadência por decisão** — **G · livre/pago · sem risco**

Aqui o IAD pode ter algo que **nenhuma das doze tem**, e é por causa do
playbook.

As doze fazem cadência por calendário: dia 1 convite, dia 3 mensagem, dia 7
follow-up, para na resposta. O IAD pode fazer cadência **por decisão**:

```
Cadência tradicional        Cadência por decisão (IAD)
─────────────────────       ─────────────────────────────────────────
dia 1   convite             tentar PROBLEMA   → canal de dim.canais
dia 3   mensagem            evidência chegou? → sim: próxima decisão
dia 7   follow-up                               não: outro canal, outro ângulo
dia 14  último toque        tentar PRIORIDADE → ...
para quando responde        para quando a DECISÃO MOVE
```

A diferença prática: uma resposta educada que não move decisão nenhuma **não
para a cadência**. Hoje, em todas as ferramentas, para — e o negócio morre de
cortesia. `dim.canais` já diz qual canal serve a qual dimensão; `podeComprovar()`
já diz se a evidência vale.

#### 8.2 Envio de e-mail em sequência — **M · livre · sem risco**

A função de e-mail já manda. Falta agendar e parar sozinha. Infra própria.

#### 8.3 WhatsApp como canal de cadência — **M · livre · bloqueado hoje**

Depende da verificação da Meta, que foi recusada em 19/09. Quando liberar, o
`CANAIS` do playbook já diz o papel do WhatsApp: *"remove barreiras e fecha
microcompromissos"*.

#### 8.4 Ações de escrita no LinkedIn — **NÃO CONSTRUIR**

Ver Parte 3.

---

### Módulo 9 — Revenue Memory

#### 9.1 **Memória da conta** — **M · livre · sem risco**

Hoje a memória é por oportunidade. Deveria ser por conta: todas as
oportunidades (inclusive perdidas e por quê), todos os contatos e papéis,
todos os sinais, todas as evidências, toda passagem por nutrição.

Dois ganhos:

1. **Todo prompt sobre aquela conta fica melhor**, porque a IA passa a saber
   que já se perdeu ali em 2024 por preço, e que o Carlos mudou de área.
2. **O IAD é multiusuário.** Sem memória de conta, dois vendedores abordam a
   mesma empresa com histórias diferentes. Com ela, isso vira um aviso.

#### 9.2 Registro de quem decidiu o quê — **P · livre · sem risco**

O dossiê pede audit log de agente (§18.1). Toda sugestão de IA aceita deveria
gravar: qual função, qual modelo, qual entrada, o que o humano mudou. Serve
para auditoria, para LGPD (revisão de decisão automatizada) e para o item 10.2.

---

### Módulo 10 — Learning Loop

#### 10.1 **Qual tipo de tarefa move qual decisão** — **M · livre · sem risco**

A análise que **nenhum concorrente consegue fazer**, porque nenhum mede
decisão.

O IAD guarda cada tarefa com tipo (= canal: Reunião, Visita, Telefonema,
WhatsApp, E-mail, LinkedIn, Apresentação…) e guarda cada evidência com a
dimensão que ela moveu. Cruzando os dois, sobre a base dele:

> "Visita presencial move **Consenso** 3× mais que qualquer outro canal.
> WhatsApp quase nunca move Impacto, mas é o que mais move **Processo**.
> Apresentação sem o Financeiro presente não moveu **Critérios** nenhuma vez
> em 14 tentativas."

Isso é o playbook parando de ser teoria e virando dado da casa. É a
funcionalidade mais defensável do produto inteiro, e o insumo é o que já está
gravado.

#### 10.2 Nota nas sugestões da IA — **P · livre · sem risco**

Joinha em cada sugestão, guardado. Mede taxa de aceitação por tipo e permite
ajustar prompt com evidência em vez de impressão.

#### 10.3 Painel de métricas do dossiê — **M · livre · sem risco**

O dossiê §19.1 lista as métricas que importam. Traduzidas para o IAD:

| Etapa | Métrica do dossiê | No IAD |
|---|---|---|
| Targeting | % ICP aprovado | score de ICP da carteira |
| Conexão | acceptance rate | `lh_aceitou` ÷ convites da campanha |
| Mensagem | first reply rate | `lh_respondeu` ÷ aceitos |
| Intenção | positive reply rate | intenções positivas ÷ respostas |
| **Qualidade** | **meeting → qualified opportunity** | **reuniões que moveram decisão ÷ reuniões** |
| Financeiro | custo por reunião qualificada | — |
| Operacional | horas por 100 prospects | — |

A linha em negrito é onde o IAD responde melhor que todos: as outras medem
reunião marcada; o IAD mede **reunião que moveu decisão**. Reunião que não
move decisão é custo, e só este produto sabe apontá-la.

---

### Fora dos 10 módulos: interface de agente

#### 11.1 MCP / API — o IAD como infraestrutura — **G · livre · sem risco**

A leitura estrutural mais importante do dossiê: *"as plataformas mais
sofisticadas estão deixando de ser interfaces para vendedores e se tornando
infraestrutura que outros agentes de IA também podem operar."* Reply/Jason,
LGM, HeyReach e PhantomBuster já têm MCP.

Para o IAD: uma Edge Function expondo as primitivas de decisão — *qual a fila
de hoje*, *qual a próxima decisão desta conta*, *registre que isto aconteceu*,
*qual a cobertura do grupo comprador*. Aí o Alexandre (ou qualquer vendedor)
pergunta no Claude ou no ChatGPT e recebe a resposta do IAD.

Com uma regra inegociável: **leitura livre, escrita com confirmação.** É o que
a LGM faz e o dossiê recomenda.

---

## Parte 3 — LinkedIn: a parte que precisa ser dita sem rodeio

Os dois documentos batem na mesma tecla, e eu não vou suavizar.

**O LinkedIn não autoriza automação de terceiros** para conectar, mandar
mensagem, curtir ou comentar. Restrições temporárias repetidas podem virar
permanentes. Os próprios Termos do Chattie dizem que a empresa não garante
ausência de banimento e atribuem o risco ao usuário. "Limites seguros" é
engenharia de risco, **não é autorização**.

O Alexandre já usa Linked Helper. Esse risco já existe e é dele hoje.

**A recomendação deste estudo é específica: o IAD nunca deve ser quem executa
ação de escrita no LinkedIn.**

E essa não é só a escolha segura — é a arquitetura que o próprio dossiê
recomenda (lição do HeyReach, §20.2: *"Superar: orquestração inteligente
acima. Evitar: confundir send layer com brain"*):

```
   IAD = CÉREBRO + MEMÓRIA              Linked Helper = EXECUÇÃO
   decide quem, quando, por quê    →    faz o convite e a mensagem
   recebe pela ponte, registra     ←    devolve a resposta
```

O risco de plataforma fica onde já estava, na ferramenta que ele escolheu. O
IAD continua sendo a parte que ninguém pode banir. E se um dia o Linked Helper
cair ou for trocado, o cérebro não vai junto.

### Governança que vale implantar mesmo assim

Do dossiê §18.1, traduzido para o que faz sentido aqui:

| Controle | Por quê | Esforço |
|---|---|---|
| **DNC / lista de não contatar** | Pedido de não contato tem que valer para sempre e para todos os vendedores | P |
| **Opt-out por contato** | LGPD, e o Chattie tem | P |
| **Parar na resposta** | Já existe no e-mail; estender à cadência | P |
| **Aprovação humana** | Já é a regra; formalizar como gate | P |
| **Registro de decisão do agente** | Item 9.2 — auditoria e LGPD | P |
| **Detecção de anomalia** | Queda brusca de aceitação da campanha do LH = conta sob restrição. O IAD tem os sinais para perceber isso antes do Alexandre | M |

Esse último é bonito: o IAD recebe `lh_aceitou` pela ponte. Se a taxa despenca
de um dia para o outro, é sinal de restrição na conta — e o IAD pode avisar
**antes** que ele descubra sozinho.

---

## Parte 4 — O que NÃO fazer

Tão importante quanto a lista de cima. Cinco recusas, cada uma com motivo.

**1. Não construir envio automático no LinkedIn.** Parte 3.

**2. Não construir Autopilot conversacional.** IA que responde sozinha produz
atividade, não evidência. Contradiz a tese do produto. Copilot sim, Autopilot
não — e isso é diferencial de posicionamento, não limitação.

**3. Não perseguir "AI copy".** O Expandi, com 13,2 milhões de convites,
mediu: copy de IA não superou copy humana em teste controlado. O dossiê
repete três vezes que copy virou commodity. O IAD não deve gastar esforço ali.

**4. Não construir base de leads.** Apollo, Clay, Lusha e a B2B Database do
Skylead resolvem isso e têm escala de dados que não dá para replicar. Se um
dia precisar, integra.

**5. Não deixar sinal entrar no índice IAD.** A tentação vai aparecer quando o
Signal Engine ficar bom. O comentário no `engine.js` já explica por que não, e
está certo: um índice que sobe com clique vira contador de cliques, e o IAD
perde a única coisa que o torna diferente dos outros.

---

## Parte 5 — Ordem de implantação

Ordenada por **(valor ÷ esforço) × (1 ÷ risco)**, não por vontade.

### Onda 1 — A base (valor alto, esforço baixo, risco zero)

| # | Item | Por que primeiro |
|---|---|---|
| 1.1 | **Cérebro da empresa** | Melhora TODAS as funções de IA que já existem, de uma vez |
| 6.1 | **A Fila** | Muda a sensação do produto. Pura aritmética, não gasta token |
| 3.2 | **Mudança de cargo pela ponte** | O dado já chega. ~30 linhas. Gatilho dos mais fortes que existem |
| 2.2 | **ICP aprendido dos ganhos** | Resolve o problema real: 98 leads para triar sem critério |
| 7.1 | **Taxonomia de intenção** | Amplia o analisador de e-mail que já roda. Encaixa na Nutrição |

Nenhum item da Onda 1 precisa de tabela complexa, fornecedor novo, dinheiro
novo ou toca no LinkedIn. **Dá para fazer tudo com o que já está no banco.**

### Onda 2 — A conversa

1.3 objeções ligadas às decisões · 7.2 rascunho Copilot · 3.1 abertura e
clique de e-mail · 9.1 memória da conta · 10.1 **qual tarefa move qual
decisão** · governança (DNC, opt-out, log)

### Onda 3 — A coordenação

4.1 narrativa por papel · 4.3 resposta de um muda os outros · 8.1 cadência por
decisão · 7.3 reengajamento por `momento()` · 10.3 painel de métricas

### Onda 4 — A fronteira

11.1 MCP/API · 7.4 sandbox · 5.1 ficha da conta · 3.3 visita ao site ·
3.5 movimento na empresa

---

## Fecho

O dossiê termina dizendo que o produto mais ambicioso não é um AI SDR — é um
**AI Account Development System capaz de operar como Revenue Orchestrator**, e
que o espaço mais aberto é **memória coordenada de buying committee com
narrativas distintas por papel**.

O IAD já tem o grafo do grupo comprador, os papéis, os perfis Challenger, a
força da evidência, os dois relógios e a medida de decisão. O que falta é
menos do que parece: um cérebro que saiba o que a empresa vende, uma fila que
diga o que fazer primeiro, e a coordenação entre as pessoas da mesma conta.

As doze plataformas estão correndo atrás de um motor de decisão. O IAD já é um
— só não sabia que era isso que o mercado estava chamando de fronteira.
