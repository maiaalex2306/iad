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

---

## 8. Revisão de 18/09/2026 — o que mudou depois de conversar com o Alexandre

A seção 1 continua certa no diagnóstico e **errada na conclusão**, por três
coisas que eu não tinha considerado quando a escrevi.

### 8.1 O app interno existe, e não serve aqui

Aplicativo publicado como **interno** num Google Workspace — só para usuários
da própria organização — **não passa pela verificação nem pela auditoria
anual**. Escopo restrito incluído. Ou seja, para uma empresa ler a própria
caixa, a API do Gmail é de graça.

Só que isso cobre **uma organização**. O Alexandre pretende vender o IAD para
empresas que ele não administra, e cada uma precisaria do próprio projeto no
Google Cloud, feito pelo TI dela. Em empresa industrial isso é semana de
espera e "não" em metade das vezes.

**Conclusão:** o app interno é uma saída para quem usa o CRM dentro de casa.
Não é arquitetura de produto vendido.

### 8.2 Ler é caro; MANDAR não é

A assimetria que muda a ordem das obras:

| | Google | Microsoft |
|---|---|---|
| **Ler** a caixa | escopo restrito → verificação **+ auditoria anual paga** | consentimento do administrador, sem auditoria |
| **Mandar** | escopo sensível → verificação, **sem** auditoria | consentimento do administrador, sem auditoria |

Mandar pela API é barato de autorizar dos dois lados. Ler é caro só no Google.
Isso inverte a intuição de que receber vem antes de enviar.

*(Confirmar as classificações antes de comprometer orçamento — elas mudam.)*

### 8.3 Cópia oculta manual está morta; regra de encaminhamento não

O defeito da 1.1 é real: depende de a pessoa lembrar, e o que ela esquece não
entra. Mas a cópia oculta **manual** não é a única forma sem autorização.

**Regra de encaminhamento**, criada pelo próprio vendedor na caixa dele, uma
vez: *"mensagens vindas de `suzano.com.br`, `klabin.com.br`… encaminhe para
este endereço"*. Gmail e Outlook permitem isso a qualquer usuário, **sem
administrador**. Depois de criada, ninguém pensa mais nisso.

Duas vantagens que nenhum outro cano tem:

- Funciona em **qualquer provedor e qualquer domínio**, no dia um, sem
  verificação, sem auditoria, sem TI.
- O IAD recebe **só o que a regra manda**. A caixa pessoal nunca passa por ele
  — que é a melhor resposta de LGPD possível, melhor até que a da seção 5.

O IAD conhece os domínios da carteira, então pode **gerar a regra pronta para
colar** e avisar quando ela ficar desatualizada — mesma ideia do link
rastreado, que também é "copie isto e cole lá".

### 8.4 Onde a mensagem entra: a ponte que já existe

O Cloudflare roteia e-mail de graça e entrega direto para um Worker. **É o
mesmo Worker da ponte** que já recebe os leads do Linked Helper e já faz os
links rastreados, já com chave por empresa e balde por empresa.

Nenhuma infraestrutura nova, nenhum custo novo, nenhum serviço a mais para
manter. **Falta só um domínio** com DNS no Cloudflare — não pode ser o do
Workspace, cujo MX aponta para o Google.

### 8.5 Mandar, em dois níveis

1. **Sem configuração:** o IAD manda do domínio dele com `Reply-To` para o
   vendedor. Funciona para qualquer pessoa, hoje. Custo: o cliente vê um
   remetente estranho, o que num e-mail de venda pesa.
2. **Com dois registros de DNS** (SPF e DKIM) publicados pelo cliente: o
   e-mail sai do domínio dele de verdade, com entrega boa. Configuração **por
   domínio**, não por pessoa — uma vez, vale para a equipe inteira. É o mesmo
   pedido que qualquer ferramenta de vendas faz, e o TI reconhece; é uma ordem
   de grandeza menor que o pedido do OAuth.

E o principal: **se o IAD manda, ele controla o `Message-ID`** — então a
resposta casa com a negociação sem adivinhação nenhuma, mesmo vindo de
endereço que ninguém cadastrou. Enviar não é só mais uma funcionalidade: é o
que torna o receber preciso.

### 8.6 A ordem revisada

O miolo não depende do cano, e é a maior parte do trabalho:

1. **O miolo** — tabela das mensagens, casamento por endereço e por
   `Message-ID`, a aba E-mail, a IA lendo e propondo evidência. Serve a
   qualquer cano, não se joga fora em hipótese nenhuma.
2. **Receber por encaminhamento**, pela ponte do Cloudflare.
3. **Mandar**, começando pelo `Reply-To` e subindo para SPF/DKIM por domínio.
4. **Microsoft Graph**, no primeiro cliente que pedir — é o mais barato dos
   dois.
5. **Gmail**, quando a receita pagar a auditoria (ou app interno, para quem
   usar o CRM dentro de casa).

**Bloqueio atual:** o domínio para o Cloudflare receber. Sem ele, o item 2 não
começa.
