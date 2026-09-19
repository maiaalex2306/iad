# Propostas: o que existe hoje, o que o mercado usa, e o que eu faria

Estudo, não plano de obra. Nada aqui foi construído.

---

## 1. Como está hoje

O IAD já tem duas peças, e elas são menos do que parecem.

**O catálogo de produtos** (`Cadastros → Produtos`) tem seis campos:

| campo | o que é |
|---|---|
| `nome` | o nome |
| `sku` | código |
| `categoria` | texto livre |
| `unidade` | un, kg, hora, mês… |
| `precoReferencia` | um número só |
| `descricao` | texto |

**Os itens da oportunidade** (`op.itens`) guardam três coisas por linha:
`produtoId`, `quantidade` e `precoUnitario`. O preço unitário nasce copiado do
`precoReferencia` e **não há tela para editá-lo**: escolher o produto no
formulário da oportunidade cria a linha com quantidade 1 e o preço de tabela,
e pronto.

Nada disso vira documento. O `valor` da oportunidade é um campo digitado à
mão, independente dos itens — dá para ter três produtos somando R$ 300 mil numa
oportunidade que diz valer R$ 80 mil, e o app não reclama.

**Resumindo o diagnóstico:** existe um catálogo e existe uma lista de compras.
Não existe proposta.

---

## 2. As três entidades que faltam, e por que são três

Todo sistema sério separa o que aqui está junto:

**Produto** é o que a empresa vende, em geral. Muda quando o portfólio muda.

**Preço** é quanto custa, para quem e quando. O mesmo produto tem preço
diferente por segmento, por região, por canal, por volume e por data de
vigência. No Salesforce isso é o *price book*; no Dynamics, a *price list*.
Guardar um `precoReferencia` só dentro do produto é o atalho que impede
qualquer negociação séria depois.

**Proposta** é um documento com data, validade, condições e um estado. Ela não
é a oportunidade: uma oportunidade tem várias propostas ao longo do tempo, e é
justamente a sequência delas que conta a história da negociação.

E abaixo da proposta, o **item de proposta** — a linha, com o preço
efetivamente praticado naquele documento, que pode não ser o de tabela.

---

## 3. Os campos, medidos contra o que o mercado usa

### 3.1 Produto (catálogo)

O que o IAD já tem, mais o que falta:

| campo | tem? | por quê |
|---|---|---|
| nome, sku, categoria, unidade, descrição | sim | — |
| **tipo de cobrança** | **não** | único ou recorrente. É o campo que muda tudo o resto. |
| **periodicidade** | **não** | mensal, trimestral, anual — quando é recorrente |
| **custo** | **não** | sem custo não existe margem, e sem margem o desconto é cego |
| **preço mínimo** | **não** | o piso que o vendedor não atravessa sem aprovação |
| **ativo / vigência** | parcial | tem `ativo`; falta "vale a partir de / até" |
| **moeda** | não | só faz falta quando houver venda fora do Brasil |

O campo que eu chamo de mais importante é o **tipo de cobrança**. Enquanto ele
não existir, R$ 10 mil de implantação e R$ 10 mil por mês são o mesmo número
dentro do sistema — e não são a mesma coisa em lugar nenhum do mundo.

### 3.2 Item da proposta (a linha)

É aqui que o mercado tem um padrão bem estabelecido. O Salesforce CPQ, o
HubSpot e o Dynamics convergem nos mesmos conceitos:

| campo | o que é |
|---|---|
| produto | qual |
| quantidade | quantos |
| **preço de tabela** | o de catálogo, congelado no dia da proposta |
| **desconto (% e valor)** | os dois, porque o vendedor pensa em % e o cliente lê valor |
| **preço praticado** | o que sai depois do desconto |
| **total da linha** | quantidade × preço praticado |
| tipo de cobrança | herdado do produto, editável |
| periodicidade | mensal, anual… |
| **prazo (meses)** | por quanto tempo a recorrência vale |
| **total do contrato** | recorrente × prazo |
| início da cobrança | quando começa a contar |

Congelar o preço de tabela na linha não é detalhe: sem isso, mexer no catálogo
reescreve o passado, e a proposta que o cliente recebeu deixa de existir.

### 3.3 A proposta (o documento)

| campo | o que é |
|---|---|
| número | sequencial, para citar por telefone |
| versão | v1, v2, v3 — a negociação é a sequência delas |
| data de emissão | — |
| **validade** | no Brasil, o padrão legal na ausência de prazo é curto; o costume de mercado é 15 a 30 dias |
| **condição de pagamento** | à vista, parcelado, recorrente |
| **parcelamento** | quantas e quando |
| **reajuste** | índice e periodicidade — IPCA ou IGP-M, anual |
| impostos | inclusos ou não, e quais |
| escopo excluído | o que NÃO está no preço, que é a origem de metade das brigas |
| **estado** | rascunho, enviada, vista, aceita, recusada, expirada |
| quem assina | contato e cargo |

### 3.4 Os totais, e a armadilha da soma

A regra que todo mundo aprende errado uma vez:

> **Valor único e valor recorrente não somam.**

Implantação de R$ 30 mil mais R$ 8 mil por mês não é "R$ 38 mil". Uma proposta
séria mostra três números separados:

- **Entrada** — o que é cobrado uma vez (implantação, treinamento, setup)
- **Recorrente** — o valor por período
- **Total do contrato** — entrada + (recorrente × prazo)

É por isso que toda a indústria de software separa receita recorrente de
receita única, e nunca mistura implantação dentro do valor mensal.

---

## 4. Descontos: as três camadas

O que o mercado faz, do mais simples ao mais elaborado:

1. **Desconto por linha**, digitado pelo vendedor.
2. **Desconto por volume**, em faixas — comprou mais de X, o preço cai.
3. **Desconto de cabeçalho**, aplicado sobre o total da proposta.

E acima dos três, a única regra que realmente protege a empresa: **o piso**.
Abaixo de certa margem, ou acima de certo percentual, a proposta não é enviada,
é submetida. É a diferença entre um sistema que registra desconto e um sistema
que governa desconto.

Para o IAD, eu começaria com o item 1 mais o piso. Faixas por volume e desconto
de cabeçalho são elaboração, e elaboração sem uso é peso morto.

---

## 5. O estado da proposta, e por que ele importa aqui mais do que nos outros

O ciclo padrão: **rascunho → enviada → vista → aceita / recusada / expirada**.

Num CRM comum, esses estados servem para o vendedor saber onde está cada
documento. **No IAD eles valem mais**, e por um motivo que é a tese do produto:

> Enviar proposta não é avanço. Proposta é trabalho nosso. O que move a decisão
> é o que o CLIENTE faz com ela.

O manual já diz isso, e a régua já trata "Enviar proposta" como não-avanço.
Então cada estado tem um significado diferente para as oito decisões:

| estado | o que é, para o método |
|---|---|
| enviada | nada. Trabalho nosso. |
| **vista** | sinal fraco — ele abriu |
| **recusada com motivo** | evidência forte, e das boas: o cliente disse o que não serve |
| **aceita** | evidência documentada, no degrau mais alto |
| **expirada sem resposta** | o sintoma clássico do falso avançado, e hoje invisível |

Essa última linha é, para mim, a justificativa mais forte de construir isto. O
IAD existe para denunciar o negócio que parece adiantado e não é. Proposta
enviada que venceu sem resposta é exatamente esse negócio — e hoje o sistema
não tem como saber que ela existiu.

---

## 6. O que eu NÃO faria

Disciplina de escopo, porque CPQ é um poço sem fundo:

- **Motor de regras de configuração.** Produto que exige produto, produto que
  exclui produto. É o coração de um CPQ de verdade e não é o problema de
  ninguém que use o IAD hoje.
- **Assinatura eletrônica.** Integração, custo por envio, valor jurídico. A
  proposta pode sair em PDF e ser assinada onde já se assina.
- **Multimoeda.** Só quando houver venda fora do Brasil.
- **Fluxo de aprovação com várias etapas.** Um piso com aviso resolve 90% e
  cabe numa tarde.

---

## 7. Onde isso viveria na tela

O cockpit da oportunidade ganharia uma seção **Propostas**: a lista de versões,
com número, data, valor e estado. Criar uma proposta abre o editor de linhas;
enviar gera o PDF e muda o estado.

E — a parte que amarra com o resto do sistema — **mudar o estado para "aceita"
ou "recusada" abre a mesma tela de contar o que aconteceu que já existe**. A
proposta não vira nota sozinha: ela vira tarefa concluída com relato, a IA lê, e
as oito decisões andam. A mesma porta do WhatsApp, da reunião e do e-mail.

Nada de novo no motor. De novo.
