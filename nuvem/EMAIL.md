# Enviar o convite por e-mail, do endereço do administrador

O botão **Enviar**, em Cadastros → Usuários, manda o e-mail pelo servidor. A
pessoa recebe um link, cria a senha dela e entra já na empresa e no papel que
você escolheu.

Duas coisas precisam estar configuradas. Enquanto não estiverem, o botão
continua funcionando pelo caminho antigo — abre o seu programa de e-mail com a
mensagem pronta — em vez de falhar.

---

## Por que não dá para simplesmente escrever o seu Gmail no remetente

Porque isso seria falsificação, e os provedores sabem detectar. O Gmail publica
quais servidores podem enviar em nome de `@gmail.com` (SPF), e assina as
mensagens legítimas (DKIM). Uma mensagem que diz vir do seu endereço mas sai de
outro servidor não bate com nenhum dos dois: cai em spam, ou é recusada.

O jeito certo é o contrário: **autenticar de verdade** como o seu Gmail, com uma
Senha de app do Google. Aí a mensagem é sua de fato, e chega.

---

## 1. A Senha de app do Google

1. A conta precisa ter **verificação em duas etapas** ligada. Em
   <https://myaccount.google.com/security>, ative se ainda não estiver.
2. Vá em <https://myaccount.google.com/apppasswords>.
3. Crie uma senha de app com o nome que quiser (por exemplo, `IAD CRM`).
4. O Google mostra 16 letras. **Copie agora** — ele não mostra de novo.

Isso não é a senha da sua conta. É uma senha separada, que serve só para este
uso e que você pode revogar a qualquer momento sem mexer no resto.

## 2. O SMTP no Supabase

No painel do projeto, **Authentication → Emails → SMTP Settings**, ligue
*Enable Custom SMTP* e preencha:

| Campo | Valor |
| --- | --- |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | `maia.alex.2306@gmail.com` |
| Password | as 16 letras da Senha de app |
| Sender email | `maia.alex.2306@gmail.com` |
| Sender name | `IAD CRM` |

O *Sender email* tem de ser o mesmo do *Username*. O Gmail recusa enviar em
nome de um endereço que não é o da conta autenticada.

## 3. A função de convite

No painel, **Edge Functions → Deploy a new function → Via Editor**, nome
`convite`, e cole o conteúdo de `nuvem/funcoes/convite/index.ts`.

Depois, em **Edge Functions → Secrets**, adicione:

| Nome | Valor |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | a chave `service_role` do projeto, em Settings → API Keys |

Publique a função de novo depois de gravar o segredo.

> **Esta é a única exceção da regra.** A `service_role` ignora todas as
> políticas de segurança do banco e por isso nunca pode entrar no aplicativo.
> Dentro da função ela é segredo de servidor, e é o único lugar onde pode
> existir. Não a coloque em `src/config.js`, nem em nenhum arquivo do
> repositório, nem a mande por mensagem para ninguém.

A função confere no banco se quem chamou é administrador **antes** de convidar.
Estar logado não basta.

---

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

### Se aparecer "matched no key configured for auth mode(s)"

Mensagem inteira, em inglês:

    [@supabase/server] The apikey header matched no key configured
    for auth mode(s): "publishable", "secret".

Ela fala de cabeçalho, mas o cabeçalho está certo. O que está errado é o
**formato da chave**. O Supabase trocou as chaves de projeto: as antigas eram
JWT (`anon` e `service_role`, aquelas que começam com `eyJ`), as novas são
`sb_publishable_...` e `sb_secret_...`. A troca não chegou em tudo ao mesmo
tempo — o banco ainda aceita a antiga, mas o serviço de autenticação, que é
quem convida, já exige a nova.

Como o Supabase injeta a chave antiga sozinho na função, a função não tem como
saber disso até tentar. Então você dá a nova para ela:

1. **Settings → API Keys**, copie a chave **secret** (`sb_secret_...`).
2. **Edge Functions → convite → Secrets**, crie:

       IAD_CHAVE_SECRETA = sb_secret_...

O nome tem de ser esse. O painel recusa segredo cujo nome comece com
`SUPABASE_`, justamente para ninguém sobrescrever os automáticos — por isso a
função procura primeiro por `IAD_CHAVE_SECRETA`, depois por
`SUPABASE_SECRET_KEY`, e só então pela antiga `SUPABASE_SERVICE_ROLE_KEY`.

Essa chave é secreta de verdade: ela ignora todas as políticas RLS. Ela vive
aqui, nos segredos da função, e em lugar nenhum além — nunca em `src/config.js`,
nunca num arquivo do repositório, nunca numa mensagem.

## 4. Para onde o link do e-mail leva

Sem este passo o convite sai, chega, e o link cai em `localhost:3000` — a tela
"Não é possível acessar esse site". O endereço vem de uma configuração do
projeto que nasce apontando para a máquina de quem desenvolve.

Painel do Supabase → **Authentication** → **URL Configuration**:

**Site URL** (para onde o GoTrue manda quem não tem destino explícito):

    https://maiaalex2306.github.io/iad/

**Redirect URLs** (a lista do que é permitido; sem estar aqui, o pedido do app
é ignorado e vale o Site URL):

    https://maiaalex2306.github.io/iad/**

O `**` no fim cobre qualquer caminho abaixo do endereço. É uma lista de
permissão de propósito: sem ela, quem descobrisse a função poderia mandar o
convidado para um site qualquer com o token na mão.

Se um dia o app mudar de endereço, é aqui que se muda também — em nenhum outro
lugar.

## Conferir

Primeiro, que a função subiu. Cole na barra de endereço:

    https://drhonmdffhnwamwzynrs.supabase.co/functions/v1/convite

A resposta esperada é **`UNAUTHORIZED_NO_AUTH_HEADER`** — a rota existe e
está protegida, e o navegador não manda credencial. **404** seria a função
ausente. Não espere 405: o porteiro do Supabase recusa antes de a função
rodar.

Depois, o teste de verdade. Em Cadastros → Usuários, registre uma pessoa e clique em **Enviar**.

- **"Convite enviado para ..."** → funcionou. Confira a caixa de entrada dela,
  e o spam na primeira vez.
- **"O envio automático ainda não está publicado"** → a função `convite` não
  subiu, ou subiu com outro nome.
- **"Só o administrador convida pessoas"** → você está logado com uma conta que
  não é administradora.
- **"Esta pessoa já tem conta no servidor"** → ela deve entrar pelo login, ou
  usar "esqueci a senha".
- **Erro citando SMTP** → o passo 2 não está certo. O motivo vem na mensagem.

## Limites

O Supabase aplica um teto de 30 e-mails por hora mesmo com SMTP próprio, e o
Gmail pessoal tem limite diário e reputação fraca para envio em massa. Para
convidar dezenas de pessoas de uma vez, ou para o dia em que o IAD tiver
clientes de verdade, o caminho é um serviço de envio transacional com domínio
próprio. Para cadastrar a sua equipe, isto resolve.
