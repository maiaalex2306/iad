# E-mail dentro da oportunidade: como receber, como mandar, e como casar

Estudo, não plano de obra. Nada aqui foi construído.

O problema é o mesmo do WhatsApp, e a resposta é parecida mas não igual: a
conversa por e-mail acontece fora do CRM e morre na caixa de entrada. O que o
cliente escreveu — que é a única coisa que move as oito decisões — fica no
Outlook de uma pessoa.

---

## 1. Três arquiteturas, e uma delas está fora por preço

### 1.1 Cópia oculta para um endereço do sistema

O vendedor põe um endereço do IAD em cópia oculta ao mandar o e-mail, e
encaminha para lá o que recebe. O sistema recebe a mensagem como qualquer
servidor de e-mail recebe.

- **A favor:** funciona com qualquer provedor, sem autorização nenhuma, sem
  auditoria, sem custo por usuário. O IAD nunca tem acesso à caixa de entrada —
  ele vê só o que foi mandado para ele.
- **Contra:** depende de o vendedor lembrar. O que ele esquece, não entra.
- **Privacidade:** é a opção mais limpa que existe. Nada além do que foi
  explicitamente copiado chega ao sistema.

### 1.2 IMAP com usuário e senha

O sistema entra na caixa do vendedor e lê tudo.

- **A favor:** pega tudo, sem depender de disciplina.
- **Contra:** guardar senha de e-mail de outra pessoa é responsabilidade que eu
  não recomendaria assumir. E os provedores grandes estão fechando essa porta —
  senha de aplicativo, autenticação em dois fatores, políticas corporativas.

### 1.3 API oficial (Gmail, Microsoft Graph)

O caminho "certo", com autorização por OAuth e notificação por evento.

- **A favor:** entra tudo, em tempo real, sem senha guardada, com permissão que
  a pessoa pode revogar.
- **Contra, e é decisivo:** ler e-mail é **escopo restrito** no Google. Escopo
  restrito exige verificação do aplicativo **mais uma auditoria de segurança
  anual feita por empresa credenciada**. A auditoria é paga, recorrente, e as
  faixas de preço que aparecem em relatos públicos vão de alguns milhares a
  dezenas de milhares de dólares por ano, com o ciclo completo levando de seis a
  doze semanas. A auto-avaliação gratuita que existia no nível mais simples
  deixou de ser opção.

**Conclusão:** a API é o destino, não a partida. Para um produto no início, ela
custa mais por ano do que o produto fatura — e a auditoria vence todo ano.

### 1.4 O que eu faria

Começar pela cópia oculta, com um endereço **por oportunidade**, e deixar a API
para quando houver receita que a pague.

Endereço por oportunidade resolve o casamento antes de ele existir: o vendedor
copia `iad+op-7f3a@…` e a mensagem já chega sabendo a qual negociação pertence.
É o truque do sinal de mais, que todos os provedores grandes entendem, e é a
diferença entre adivinhar e saber.

---

## 2. O casamento: ligar o remetente ao contato

Quando a mensagem não traz o endereço com o identificador, o sistema precisa
descobrir de quem ela é. Em camadas, como já fazemos no WhatsApp:

| camada | regra | força |
|---|---|---|
| 1 | o `Message-ID` da resposta aponta para uma mensagem que já está no CRM | certeza |
| 2 | o endereço bate com o e-mail de um contato | forte |
| 3 | o domínio do endereço bate com o site de uma empresa cadastrada | fraca |
| 4 | nada bate | "sem dono", e o vendedor escolhe |

A camada 1 é a mais forte e a mais esquecida. Todo e-mail tem um `Message-ID`
único, e toda resposta carrega `In-Reply-To` e `References` apontando para os
anteriores. Guardando o `Message-ID` de tudo que entra e sai, a resposta se
encaixa sozinha na conversa certa — sem depender de endereço, de assunto, nem
de nada que o cliente possa mudar.

E ele serve para a segunda coisa: **não gravar a mesma mensagem duas vezes**. É
o mesmo papel que o `wamid` faz no WhatsApp, e o mesmo problema que o Linked
Helper já nos deu.

**A camada 3 é perigosa e precisa de limite.** Casar por domínio funciona para
`@marilan.com` e é um desastre para `@gmail.com`. A regra prática: só vale para
domínio que pertence a uma empresa cadastrada e que não esteja numa lista de
provedores públicos.

Do contato para a negociação, a regra é a que já está escrita no WhatsApp: se a
pessoa está no grupo comprador de **uma** negociação aberta, é aquela; se está
em duas, o sistema pergunta. Chutar aqui seria pendurar evidência no negócio
errado.

---

## 3. Mandar e-mail: o que ninguém conta antes

Receber é a parte fácil. Mandar tem três armadilhas.

**A primeira é técnica: autenticação de domínio.** Para o e-mail sair como
`voce@suaempresa.com.br` e não cair em spam, o domínio precisa autorizar quem
manda. São três registros no DNS — SPF, DKIM e DMARC — e o que realmente
importa é o **alinhamento**: o domínio que aparece no "De" tem de bater com o
domínio que assinou a mensagem. Sem alinhamento, o DMARC falha mesmo com tudo
configurado. Desde 2024 os provedores grandes exigem política publicada para
quem manda volume.

**A segunda é de produto: a resposta precisa voltar.** Mandar do CRM e receber
no Outlook quebra a conversa em dois pedaços. A solução é o `Reply-To` apontar
para o endereço do sistema com o identificador da oportunidade — aí a resposta
do cliente volta para dentro do CRM sem ninguém fazer nada.

**A terceira é a que mais dói: o e-mail enviado do CRM não parece do vendedor.**
Cliente responde a pessoas, não a sistemas. O e-mail tem de sair com o nome e a
assinatura de quem vende, e o cliente não deve perceber diferença nenhuma.

---

## 4. O que entra automático, e o que não entra

A regra do WhatsApp vale igual aqui, e vale repetir porque é contraintuitiva:

> Mensagem não é evidência. Evidência é o que o cliente decidiu, e quem diz que
> uma mensagem virou decisão é o vendedor.

**Acontece sozinho:** a mensagem entra na linha do tempo, a contagem de não
lidas sobe, o negócio em nutrição acorda quando o cliente escreve.

**Não acontece sozinho:** o tempo sem evidência não zera, a nota das oito não
muda, e nenhuma tarefa é criada. O vendedor lê, e quando alguma coisa valeu a
pena, clica em registrar — e aí a IA lê e o motor recalcula.

---

## 5. LGPD

Guardar e-mail de cliente é tratar dado pessoal, exatamente como a conversa de
WhatsApp. Mesma lista: base legal escrita no contrato, aviso de que a
comunicação é registrada, prazo de retenção, e um jeito de apagar a pedido.

Com uma diferença que pesa a favor da cópia oculta: ali o sistema só recebe o
que alguém mandou para ele. Com acesso à caixa de entrada, ele recebe também a
conversa do vendedor com o médico dele — e essa distinção é relevante quando
alguém perguntar.

---

## 6. Onde isso vive: a oportunidade como um lugar só

Hoje o cockpit tem as oito decisões, o grupo comprador, as tarefas e o
histórico. O que este estudo e o das propostas pedem é que ele ganhe **três
seções novas**, e que elas não sejam três caixinhas separadas:

**Conversa** — uma linha do tempo só, com WhatsApp e e-mail misturados em ordem
cronológica. Separar por canal é organizar pelo encanamento; o vendedor pensa
"o que aconteceu com esse cliente", não "o que aconteceu no WhatsApp".

**Propostas** — as versões, com número, valor, validade e estado. Ver o
estudo das propostas.

**Documentos** — o que já existe hoje em anexos, junto com os PDFs das
propostas enviadas.

E as três desembocam no mesmo lugar: **Registrar o que aconteceu**, que cria
tarefa concluída com relato, manda a IA ler e faz as oito decisões andarem.

Uma porta só. É o que impede que cada canal novo vire um subsistema com regra
própria — e é por isso que o WhatsApp, que já está construído, não precisou
mexer no motor.

---

## 7. Ordem que eu proporia, se formos fazer

1. **Receber por cópia oculta**, com endereço por oportunidade. É a peça que
   entrega valor sozinha e não depende de nada.
2. **O casamento por `Message-ID` e por endereço.** Sem isso o item 1 vira uma
   caixa de entrada dentro do CRM, que não serve para nada.
3. **A linha do tempo unificada** com o WhatsApp.
4. **Mandar**, com `Reply-To` de volta e autenticação de domínio.
5. **A API do Gmail**, se e quando a receita justificar a auditoria anual.
