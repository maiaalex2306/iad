# Assistente de preenchimento — como ligar

O IAD é uma PWA de arquivos estáticos: tudo que está em `src/` é público.
Por isso a chave da IA **não entra no aplicativo**. Ela vive como segredo de
uma Edge Function do Supabase — o mesmo motivo pelo qual a `service_role`
nunca entrou no navegador.

O navegador manda o texto que o vendedor escreveu. A função conversa com a IA
e devolve campos já validados. A chave nunca sai do servidor.

---

## 1. A chave da IA

**Groq** é a recomendação: é gratuito, é o mais rápido, e — decisivo para um
CRM — **não treina com os seus dados**. A política de não-treinar vale para a
conta inteira, e a retenção é zero por padrão.

1. Crie a conta em <https://console.groq.com> (sem cartão).
2. Em **API Keys**, gere uma chave e copie.

Cota gratuita: 30 requisições por minuto, 1.000 por dia. Isso é cerca de
30 mil preenchimentos por mês — folgado para uma equipe de vendas inteira.

> O Gemini gratuito tem cota melhor, mas o Google diz que usa as requisições
> da camada gratuita para melhorar os modelos. O que passa por aqui é a ata da
> reunião do cliente do seu cliente. Não vai para lá.

## 2. Publicar a função pelo painel (sem instalar nada)

O painel do Supabase publica Edge Functions direto do navegador — não precisa
da CLI, nem de Docker, nem de Deno instalado.

1. Abra o código da função:
   <https://raw.githubusercontent.com/maiaalex2306/iad/claude/decisoes-estagios-vendas-eckjo0/nuvem/funcoes/assistente/index.ts>
   Selecione tudo (Ctrl+A) e copie (Ctrl+C).
2. No painel do projeto, vá em **Edge Functions** → **Deploy a new function** →
   **Via Editor**.
3. Nome da função: exatamente `assistente` (minúsculo, sem acento). O app
   chama por esse nome.
4. Apague o exemplo que vem no editor, cole o código e clique em **Deploy**.

## 3. Guardar a chave da IA

Ainda em **Edge Functions**, abra **Secrets** e adicione:

| Nome | Valor |
| --- | --- |
| `IA_CHAVE_OPENAI` | a chave da OpenAI (começa com `sk-`) |
| `IA_CHAVE_ANTHROPIC` | a chave da Anthropic (começa com `sk-ant-`) |
| `IA_CHAVE_GROQ` | a chave da Groq (começa com `gsk_`) |

**Ponha quantas quiser — uma basta, duas é melhor.** São tentadas em ordem: o
primeiro que responder, responde. Se ele recusar por um motivo que o próximo
não teria — chave errada, cota do mês estourada, modelo que não existe,
provedor fora do ar — o pedido segue para o seguinte em vez de voltar vazio.

Um 400 que é culpa do nosso pedido NÃO cai para o próximo: o segundo recusaria
igual, e insistir gastaria chamada e esconderia a causa.

| Nome | Valor | Para quê |
| --- | --- | --- |
| `IA_ORDEM` | `openai,anthropic` | quem vem primeiro |
| `IA_MODELO_OPENAI` | `gpt-5` | o modelo bom daquele provedor |
| `IA_MODELO_RAPIDO_OPENAI` | `gpt-5-mini` | o modelo de volume |
| `IA_MODELO_ANTHROPIC` | `claude-opus-5` | |
| `IA_MODELO_RAPIDO_ANTHROPIC` | `claude-haiku-5-5` | |
| `IA_MODELO_GROQ` | `openai/gpt-oss-120b` | |
| `IA_MODELO_RAPIDO_GROQ` | `openai/gpt-oss-20b` | |

Sem `IA_ORDEM`, a ordem é **openai, anthropic, groq**, pulando quem não tem
chave. Sem `IA_MODELO_*`, cada provedor usa um padrão do código — e padrão
envelhece, então prefira escrever o nome.

**Confira na tela, não no palpite.** Em Configuração → O aplicativo, o cartão
*Assistente de IA* lista quem responde, em que ordem e com que modelo. A chave
nunca sai do servidor: de lá vêm só os nomes e se o formato da chave bate com
o do provedor.

### A configuração antiga continua valendo

`IA_CHAVE` + `IA_PROVEDOR` + `IA_MODELO` viram um provedor como os outros, e
entram na fila se aquele provedor ainda não tiver chave própria. Isso não é
gentileza: é o que impede a mudança de desligar o assistente de quem já o tinha
no ar. Quando você puser `IA_CHAVE_<PROVEDOR>`, ela ganha de `IA_CHAVE`.

**Sobre os dois modelos.** Os pedidos não são do mesmo tipo de trabalho.

`IA_MODELO` é o modelo bom. Ele lê ata de reunião, propõe as oito notas,
escreve o plano da semana. A resposta tem de apontar o trecho literal onde o
cliente disse cada coisa, e modelo pequeno erra isso. Errar aqui não aparece
como erro na tela: aparece como IAD baixo, que o vendedor lê como "o cliente
não avançou".

`IA_MODELO_RAPIDO` serve só à classificação de segmentos na importação do
Linked Helper. Ali o trabalho é volume — vinte leads, texto curto por lead,
resposta em lista fechada — e o que importa é caber no limite de tokens por
minuto do provedor. Modelo pequeno faz bem e faz barato.

Sem `IA_MODELO_RAPIDO`, tudo usa `IA_MODELO`.

No Groq, uma combinação que funciona:

| Nome | Valor |
| --- | --- |
| `IA_MODELO` | `openai/gpt-oss-120b` |
| `IA_MODELO_RAPIDO` | `openai/gpt-oss-20b` |

### Anthropic, o caminho pago

A conta gratuita da Groq tem teto de 8000 tokens por minuto. Isso é apertado
para classificar vinte leads com conversa, catálogo de segmentos e contas
candidatas — e foi a causa de todas as importações que voltaram pela metade.
Passado esse ponto, o conserto deixa de ser código.

Três segredos, nenhuma mudança de código:

| Nome | Valor |
| --- | --- |
| `IA_CHAVE_ANTHROPIC` | a chave da Anthropic (começa com `sk-ant-`) |
| `IA_MODELO_ANTHROPIC` | `claude-sonnet-5-5` |
| `IA_MODELO_RAPIDO_ANTHROPIC` | `claude-haiku-5-5` |

Vale como **reserva** mesmo quando não é a principal: com a OpenAI na frente e
a Anthropic atrás, a cota estourada de uma deixa de ser um dia sem assistente.

Ordem de grandeza do custo, medida nos pedidos que este app faz — uma
importação de vinte leads gasta cerca de 30 mil tokens de entrada e 5 mil de
saída; uma ata de reunião, 15 mil e 3 mil:

| Modelo | Importação de 20 | Uma ata |
| --- | --- | --- |
| `claude-haiku-4-5` | US$ 0,055 | US$ 0,03 |
| `claude-sonnet-5` | US$ 0,11 | US$ 0,06 |
| `claude-opus-5` | US$ 0,28 | US$ 0,15 |

O Sonnet lê ata e propõe as oito notas: essa tarefa exige apontar o trecho
literal onde o cliente disse cada coisa, e é onde modelo pequeno falha. O
Haiku classifica segmento em lote, que é extração curta contra lista fechada.

Um efeito colateral bem-vindo: a Anthropic não tem "modo JSON", então o erro
`json_validate_failed` — que derrubou lotes inteiros na Groq — deixa de
existir. A instrução do prompt já pede JSON e o validador da função descarta
o que vier torto.

**Nomes de modelo morrem.** O Groq aposenta nomes sem aviso, e o nome fica
escrito num segredo que alguém definiu meses atrás — a função inteira para
por causa de uma string. Por isso ela não desiste: ao receber 404, pergunta
ao provedor quais modelos existem hoje, escolhe um substituto e refaz o
pedido. A tabela acima é o que se pede; o que roda pode ser outro, se o
pedido tiver morrido.

A troca automática é rede de segurança, não substituto de configurar: ela
escolhe pelo tamanho, e o modelo certo para a sua operação você descobre
lendo uma ata de verdade e conferindo as oito notas.

`SUPABASE_URL` e `SUPABASE_ANON_KEY` já existem no ambiente — não crie.

> Depois de adicionar ou mudar um segredo, publique a função de novo
> (**Deploy**). Ela lê os segredos quando sobe.

### Desligue o "Verify JWT" desta função

Depois de publicar, abra a função no painel → **Settings** (ou **Details**) →
desligue **Verify JWT** (aparece também como *Verify JWT with legacy secret*) →
Save.

Sem isso o app não consegue chamá-la, e o erro é confuso: antes de um POST com
cabeçalhos próprios, o navegador manda uma pergunta de permissão (a preflight,
um OPTIONS) que **não leva credencial nenhuma** — é assim por definição. O
porteiro do Supabase vê um pedido sem autorização, recusa com 401 sem os
cabeçalhos de CORS, e o navegador bloqueia a chamada inteira. O app relata
apenas que não conseguiu falar com o servidor — a mesma frase de estar sem
internet.

Isso não afrouxa a segurança, aperta. O porteiro só verifica se o token é
válido no projeto: qualquer pessoa logada passa. A função verifica quem é a
pessoa e o que ela pode fazer, lendo o papel dela no banco. A tranca que fica é
a mais forte das duas.

### Se aparecer `BOOT_ERROR: Function failed to start`

A função foi publicada e **morre ao carregar**. Não é chave, não é modelo, não
é CORS: o código não chega a rodar, e por isso o navegador não recebe resposta
nenhuma — o app mostra "o navegador não chegou na função", que parece problema
de rede e não é.

Onde está o motivo, escrito por extenso:

**Edge Functions → assistente → Logs.** A linha do boot traz a exceção com o
número da linha. É o único lugar que diz a verdade; tudo o mais é palpite.

As três causas, em ordem de frequência:

1. **A colagem veio incompleta.** O arquivo tem mais de 2.500 linhas, e o
   editor do painel às vezes corta. Role até o fim: a última linha tem de ser
   `});`. Se não for, cole de novo.
2. **A plataforma estava degradada na hora.** Confira <https://status.supabase.com>
   por *Edge Function Degradation*. Publicação feita durante o incidente pode
   gerar artefato quebrado — republique depois que fechar.
3. **O código tem erro de verdade.** Veja abaixo como pegar isso ANTES.

### Antes de publicar, confira com o Deno

`bun build` empacota e **não confere tipos**: ele diz que o arquivo é válido e
deixa passar erro que só aparece no boot. O Deno é quem roda esta função, e é
ele quem tem de aprovar:

    deno check nuvem/funcoes/assistente/index.ts

E, para provar que o módulo SOBE — que é coisa diferente de compilar:

    IA_CHAVE_OPENAI=sk-teste deno run --allow-net --allow-env \
      nuvem/funcoes/assistente/index.ts

Ele fica rodando e servindo; `Ctrl+C` encerra. Se o módulo estivesse quebrado,
ele morreria na hora com a exceção na tela — que é exatamente a mensagem que
você teria de ir caçar nos logs depois de publicar.

### Se aparecer "IA respondeu 404" ou "o modelo não existe mais"

O provedor aposentou o nome do modelo. Isso acontece sem aviso, e o nome fica
escrito no código de quem publicou meses atrás — não é erro de configuração
sua, e não adianta mexer em chave nem republicar sem trocar o nome.

A própria função resolve: ao levar 404 ela pergunta ao provedor quais modelos
existem agora e devolve a lista na mensagem. Escolha um e crie o segredo:

    IA_MODELO_<PROVEDOR> = <o nome que apareceu na mensagem>

(por exemplo `IA_MODELO_OPENAI`. A mensagem de erro já diz o nome do segredo
certo — com mais de um provedor, mandar conferir só "IA_MODELO" manda conferir
o lugar errado.)

Depois publique a função de novo — segredo novo só vale na próxima publicação.

Se preferir ver a lista antes, ela está no painel do provedor (em Groq,
console.groq.com → Models).

## 4. Conferir

Cole isto na barra de endereço do navegador, trocando `SEU_REF`:

    https://SEU_REF.supabase.co/functions/v1/assistente

O navegador não manda credencial nenhuma, então quem responde é o porteiro do
Supabase, antes da função:

- **`UNAUTHORIZED_NO_AUTH_HEADER`** ou **401** → certo. A rota existe e está
  protegida. É o que se espera: o app manda o token, a barra de endereço não.
- **404** → o deploy não foi, ou o nome ficou diferente de `assistente`.
- **405** → também está no ar; o pedido chegou à função, que só aceita POST.
- **503** → está no ar, mas não há chave de IA nenhuma nos Secrets.

## 5. Pronto

Entre no IAD com um usuário do servidor. As caixas ✨ aparecem sozinhas nos
formulários. Sem nuvem configurada ou sem sessão, elas simplesmente não
existem — o app continua exatamente como era.

---

## Trocar Groq por Claude

Duas variáveis, sem tocar em uma linha de código do aplicativo:

No painel, em **Edge Functions → Secrets**, acrescente `IA_CHAVE_ANTHROPIC`.
Não precisa tirar a que já está lá: as duas convivem, e a ordem decide. Depois publique a
função de novo.

Pela CLI, se preferir:

```bash
supabase secrets set IA_CHAVE_ANTHROPIC=sk-ant-... IA_ORDEM=openai,anthropic
supabase functions deploy assistente
```

O padrão vira Claude Haiku 4.5: cerca de **R$ 0,01 por preenchimento**, ou uns
R$ 10 por mês para mil. Vale a troca no dia em que a qualidade da extração
incomodar.

---

## O que o assistente faz — e o que ele não faz

| Preenche sozinho | Sugere e você confirma | Nunca toca |
| --- | --- | --- |
| Título da evidência, canal, data, contato, compromisso e para quando, cidade/UF, e-mail, telefone, título e tipo da tarefa | Dimensão, força, papel na compra, perfil Challenger, influência, segmento, concorrentes, rascunho do insight | **Nota da decisão (0/1/2)**, valor, etapa, fechamento previsto, estado do insight, relação da conta |

A linha entre a segunda e a terceira coluna é uma só pergunta: *se a IA errar
aqui, o erro dela vira número no painel do gestor?*

IAD, classificação, Evidence Age, Coverage, Decision Velocity e os gates da
proposta continuam sendo calculados em `src/engine.js`, de forma
determinística. O assistente alimenta a entrada; o motor faz a conta. Se a IA
passasse a opinar sobre esses números, o IAD deixaria de ser um método.

### A leitura diária da tela Hoje

A partir da v227 a tela **Hoje** explica cada negócio: por que ele está
urgente ou em prioridade, o que já está atrasado e o que fazer para acelerar.

**Essas três explicações não passam pela IA.** São cálculo, feito no próprio
aparelho a partir dos dados que já estão lá — instantâneas, de graça,
auditáveis linha por linha e disponíveis mesmo sem internet. Se o assistente
nunca for publicado, a tela funciona inteira.

O que a IA acrescenta, uma vez por dia, é o que a conta não sabe fazer: ler o
texto. As atas, as notas, o que o cliente escreveu com as palavras dele. Dali
sai um parágrafo e as próximas jogadas. É o tipo `orientacao` da função.

Três decisões que valem conhecer antes de publicar:

- **Uma chamada por negócio, uma de cada vez**, na ordem da fila — o mais
  urgente ganha leitura primeiro. Em paralelo, trinta chamadas estourariam o
  limite da função e voltariam quase todas com erro.
- **Teto de 60 negócios por dia.** É escolha de custo, não limite técnico:
  uma carteira de trezentos custaria trezentas chamadas por dia, todos os
  dias. Sessenta na ordem da fila cobre com folga o que alguém trabalha num
  dia, e quem está no fim entra quando subir. O número está em
  `LIMITE_DA_VARREDURA`, em `src/ia.js`.
- **O cálculo vai junto no pedido**, com instrução explícita de não repetir.
  Sem isso o modelo devolve, em prosa pior, o que a tela já diz com números
  exatos.

A leitura é guardada em `oportunidades.orientacao` — rode
`nuvem/correcao-25-orientacao-do-dia.sql` antes, ou o envio da carteira inteira
passa a ser recusado por causa da coluna que o banco não conhece.

## Privacidade

A função recebe apenas o texto da tela atual mais as listas de opções do
próprio tenant (segmentos cadastrados, nomes dos contatos daquela conta).
Nunca a base, nunca o histórico de outras contas, nunca dados de outra
empresa. O limite é 8 mil caracteres por chamada — 40 mil quando é
transcrição de reunião.
