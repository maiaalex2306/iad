# A caixa de e-mail do vendedor dentro do IAD

Isto é diferente do `EMAIL.md`, que trata de **um** e-mail — o convite que sai
do Supabase. Aqui é a caixa inteira: o IAD entra na sua caixa, baixa o que os
clientes escreveram, casa cada mensagem com o contato e a negociação certos,
manda o assistente ler, e envia a sua resposta pelo seu endereço.

Quem faz isso é uma Edge Function chamada `email`. Ela é a **única** parte do
sistema que toca a senha da caixa.

---

## O que ela faz, em ordem

Para cada caixa ligada, uma conexão isolada — caixa que falha não derruba as
outras:

1. **Receber.** Entra por IMAP, baixa só o que chegou depois do último UID já
   conhecido, grava em `emails` e avança a marca da caixa. Usa `BODY.PEEK`:
   **não marca como lido, não apaga, não move nada**. A sua caixa fica exatamente
   como estava.
2. **Enviar.** Pega o que o app deixou em `emails` com estado `fila`, manda por
   SMTP e marca `enviada` — ou `erro` com o motivo que o servidor deu. Mensagem
   escrita nunca some sem explicação.

Receber e enviar são independentes de propósito: IMAP fora do ar não pode
impedir a resposta que você já escreveu de sair.

O que ela **não** faz: ler, analisar ou decidir. Isso é do assistente, no app,
e acontece depois — a função só transporta.

---

## Por que uma senha de aplicativo, e não "Entrar com o Google"

Porque a senha de aplicativo é a única que você revoga sozinho, hoje, sem pedir
nada a ninguém.

O caminho "Entrar com o Google" (OAuth) exige que o **administrador do Workspace**
aprove o aplicativo para o domínio, e a permissão de *ler* caixa de e-mail é das
que o Google revisa uma a uma. Numa empresa onde você não administra o Workspace
— que é o seu caso — isso é semanas de espera antes da primeira linha funcionar.

A senha de aplicativo:

- não é a senha da sua conta, e não abre a sua conta;
- serve para IMAP e SMTP, e para mais nada;
- morre com um clique em <https://myaccount.google.com/apppasswords>, sem
  mexer no resto;
- exige verificação em duas etapas ligada na conta — o que é bom de todo jeito.

**Cada endereço tem a sua.** Receber em dois endereços são duas senhas, criadas
uma em cada conta.

---

## 1. Crie a senha de aplicativo

Para **cada** endereço que o IAD vai ler:

1. Entre na conta daquele endereço.
2. Ligue a verificação em duas etapas, se ainda não estiver:
   <https://myaccount.google.com/security>
3. Vá em <https://myaccount.google.com/apppasswords>, crie uma com o nome
   `IAD CRM`.
4. Copie as 16 letras. O Google não mostra de novo.

> Não mande essas 16 letras por mensagem para ninguém — nem para mim. Elas vão
> direto do Google para o segredo da função, e mais nada.

---

## 2. Publique a função

No painel do Supabase: **Edge Functions → Deploy a new function → Via Editor**,
nome `email`.

São **dois arquivos**, e eles precisam ficar lado a lado:

| Arquivo no editor | Conteúdo |
| --- | --- |
| `index.ts` | `nuvem/funcoes/email/index.ts` |
| `mime.ts` | `nuvem/funcoes/email/mime.ts` |

No editor, use o **+** da lista de arquivos para criar o `mime.ts` antes de
colar. A primeira linha do `index.ts` é `import { … } from './mime.ts'` — se o
segundo arquivo não existir, a publicação falha dizendo que não achou o módulo.

Pela linha de comando é uma linha só, se você tiver o CLI:

```
supabase functions deploy email
```

**São dois arquivos de propósito.** O `mime.ts` é puro — não toca em rede, não
toca em senha, não usa nada do Deno — e por isso ele é testável fora do
servidor. É onde mora toda a parte chata do e-mail (cabeçalho dobrado, acento
em base64, multipart, corte da conversa citada), que é justamente a parte onde
os erros se escondem. Os 26 testes dele rodam sem servidor nenhum.

---

## 3. Os segredos

Em **Edge Functions → Secrets**:

| Nome | Valor |
| --- | --- |
| `EMAIL_SENHAS` | o mapa de endereços e senhas, abaixo |
| `EMAIL_SEGREDO_CRON` | qualquer frase longa que só você saiba |
| `IAD_CHAVE_SECRETA` | a chave `service_role` do projeto, se ainda não estiver lá |
| `IAD_CHAVE_PUBLICA` | a chave publicável (`anon`), se ainda não estiver lá |

O `EMAIL_SENHAS` é um JSON numa linha, no mesmo formato do `CHAVES_POR_EMPRESA`
da ponte — **um par por caixa**:

```json
{"alexandre.maia@biopartners.com.br":"as16letrasdeuma","alexandre.maia@biosolvit.com":"as16letrasdaoutra"}
```

Endereço que não estiver no mapa não é tentado: a caixa fica marcada
`sem-credencial` na tela, em vez de tentar, falhar e parecer defeito.

O `EMAIL_SEGREDO_CRON` é o que prova que quem chamou é o agendador. **Sem ele
definido, a rodada automática não roda** — só a chamada de gente logada, que lê
apenas as caixas dela. É o padrão seguro: um endereço público que lê caixa de
e-mail sem prova nenhuma seria o convite para alguém de fora mandar a função
trabalhar de graça — e, no limite, descobrir quais endereços existem.

---

## 4. As tabelas

No **SQL Editor**, nesta ordem, se ainda não rodou:

```
nuvem/correcao-18-emails.sql            → 21 | 1 | 16 | 1
nuvem/correcao-19-analise-do-email.sql  → 25 | 18 | 1
nuvem/correcao-20-caixa-que-envia.sql   → 19
```

Os números à direita são o que a última linha de cada arquivo deve devolver.
Todos podem ser repetidos sem estragar nada.

---

## 5. O agendamento

A função roda sozinha. No **SQL Editor**, uma vez:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'iad-email',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://SEU-PROJETO.supabase.co/functions/v1/email',
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'authorization', 'Bearer SUA-CHAVE-PUBLICA',
                 'x-cron', 'O-MESMO-EMAIL_SEGREDO_CRON'),
    body    := '{}'::jsonb
  );
  $$
);
```

Troque as três coisas em maiúsculas. O `authorization` com a chave publicável
existe porque o portão do Supabase pede um token antes de a função rodar; quem
autoriza de verdade é o `x-cron`.

Cinco minutos é o intervalo certo: o vendedor não percebe a diferença para um
minuto, e a caixa não reclama. O IMAP baixa só o que tem UID maior que o último
lido, então uma rodada sem novidade custa uma conexão e nada mais.

Para conferir ou desligar:

```sql
select * from cron.job;              -- o que está agendado
select cron.unschedule('iad-email'); -- desliga
```

Nada disso impede o botão: na aba **E-mail** de qualquer negociação,
**Buscar agora** faz a mesma rodada na hora, e escrever uma mensagem já dispara
o envio sem esperar o ciclo.

---

## 6. Ligue a caixa na tela

Em qualquer negociação, aba **E-mail** → **Minha caixa**:

| Campo | O que é |
| --- | --- |
| Endereço | o e-mail, igualzinho ao que está no `EMAIL_SENHAS` |
| Nome | o que o cliente vê como remetente |
| Provedor | Gmail ou Outlook preenchem servidor e porta sozinhos |
| Envia | **marque numa só**; as outras só recebem |

Não há campo de senha, e não é esquecimento: navegador que nunca viu a senha é
navegador que não pode vazá-la.

Duas caixas é o caso do Alexandre: `@biosolvit.com` e `@biopartners.com.br`
recebem cliente, e a resposta sai sempre pelo `@biopartners.com.br`. Ligue as
duas, marque **Envia** só na segunda. A linha "Caixas ligadas" no topo da aba
mostra qual é qual, e cada uma abre com um clique.

---

## Conferir se está funcionando

1. Abra a aba **E-mail** de uma negociação e clique em **Buscar agora**.
2. A resposta diz quantos vieram e quantos saíram. A linha acima passa a
   mostrar a hora da última conferência.
3. Mande um e-mail de outro endereço para a sua caixa, espere alguns segundos,
   clique de novo. Ele aparece.
4. Clique em **Escrever**, escolha um contato e mande. A mensagem entra como
   `fila` e vira `enviada` em segundos.

Se der errado, a tela diz o quê, com o endereço da caixa junto — com duas caixas
ligadas, "falhou" sem dizer qual faz você mexer na configuração certa por sorte:

| O que aparece | O que é |
| --- | --- |
| `falta o segredo EMAIL_SENHAS` | o segredo não foi criado, ou tem erro de JSON |
| a caixa marcada `sem-credencial` | este endereço não está no mapa |
| `Invalid credentials` ou parecido | a senha de aplicativo está errada, ou a verificação em duas etapas foi desligada |
| `não sei o servidor de entrada` | provedor "outro" sem o servidor de IMAP preenchido |
| `o servidor demorou demais` | a caixa não respondeu em 40 segundos; tente de novo |

A senha **nunca** aparece em nenhuma dessas mensagens, nem no log. O que volta é
o que o servidor de e-mail disse, cortado em 300 caracteres.

---

## O que fica guardado, e o que não fica

Fica: remetente, destinatários, assunto, o corpo **em texto puro**, a data, a
conversa a que pertence e o Message-ID.

Não fica: o HTML do e-mail, os anexos, as imagens. HTML de e-mail é folha de
estilo de 1998 com rastreador de terceiro junto; o que a tela mostra e o que a
IA lê é texto.

O corpo guardado é só **o que a pessoa escreveu agora**. A cadeia citada
("Em 12/09, fulano escreveu: > …") é cortada na entrada: mandá-la inteira ao
assistente a cada mensagem seria pagar dez vezes pelo mesmo texto e ainda piorar
a leitura — ele passaria a ver a resposta de três semanas atrás como se fosse de
hoje.

Cada mensagem é analisada **uma vez só**. A marca `analisada_em` fica no
servidor, e não na memória: o app abre em vários aparelhos, e marcar só no
navegador faria o segundo computador reanalisar a caixa inteira, com evidência
repetida no histórico e a mesma tarefa nascendo todo dia.

---

## Limites conhecidos

- **Uma pasta por caixa.** A coluna `pastas` guarda `INBOX`. Regra de Gmail que
  joga cliente em subpasta esconde a conversa do IAD — quem usa isso precisa
  mandar a regra marcar e manter na caixa de entrada.
- **Até 20 mensagens da fila por rodada**, por caixa. O resto sai na rodada
  seguinte, cinco minutos depois.
- **Sem anexo no envio.** A mensagem que sai é texto puro.
- **Outlook/Microsoft 365** vem configurado, mas só foi testado contra o Gmail.
  Muitas empresas desligam a senha de aplicativo no Microsoft 365; se a sua
  desligou, não há jeito por aqui.
