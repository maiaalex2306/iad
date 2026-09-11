# WhatsApp — o plano, passo a passo

O que este documento resolve: a conversa do vendedor com o cliente acontece no
WhatsApp e morre lá. O CRM não sabe que ela existiu, e o que o cliente disse —
que é a única coisa que move as oito decisões — fica num aparelho.

Nada aqui foi executado ainda. Este é o plano, na ordem em que ele tem de
acontecer.

---

## 1. O caminho escolhido

**Coexistence**, da própria Meta. O mesmo número funciona no aplicativo
WhatsApp Business e na Cloud API ao mesmo tempo.

Isso importa por três razões:

- **O vendedor não muda de hábito.** Continua conversando pelo celular dele.
- **As mensagens que ELE manda também entram**, num evento chamado
  `smb_message_echoes`. Sem isso o CRM veria metade do diálogo.
- **O histórico entra junto**: até 6 meses de conversas individuais e 2 semanas
  de mídia, num evento `history` enviado uma vez só, logo depois da conexão.

O caminho descartado são as bibliotecas que automatizam o WhatsApp Web.
Funcionam até o dia em que o número é banido, sem aviso e sem recurso. Para um
produto que se vende, com o número do cliente dentro, não serve.

## 2. A ordem importa, e por um motivo só

O evento `history` chega **uma vez**, nos minutos seguintes à conexão do
número. Se a função não estiver publicada e correta naquele instante, os 6
meses de histórico se perdem e não voltam.

Por isso conectar o número é o **último** passo, nunca o primeiro.

---

## Fase 0 — Meta

Feita por você, no painel da Meta. Não envolve código.

1. Conta **Meta Business**.
2. Criar um aplicativo com o produto **WhatsApp**.
3. Registrar-se como **Tech Provider**. O Coexistence roda dentro do Embedded
   Signup, e o Embedded Signup exige Tech Provider ou Solution Partner. Não dá
   para começar sem e virar depois sem refazer a conexão.
4. Guardar três coisas: o **App ID**, o **App Secret** e o **token de
   verificação** que você mesmo inventa para o webhook.
5. **Verificar o portfólio empresarial.** A Meta exige isso antes de mandar o
   app para análise ou acessar dados de gente de fora da sua empresa — que é
   exatamente o que uma conversa de cliente é. Leva dias, não minutos, e por
   isso é a primeira coisa a começar, não a última.

O App Secret nunca entra no repositório nem no navegador. Ele vive como
segredo da Edge Function, pela mesma razão que a `service_role` e a chave da
IA vivem lá.

## Fase 1 — O banco

Duas tabelas. O isolamento por empresa fica aqui, não no aplicativo, como nas
outras nove.

```sql
-- Qual número pertence a qual empresa. É por aqui que o webhook descobre
-- para quem a mensagem vai, e é o que permite um número por cliente.
create table if not exists public.whatsapp_numeros (
  phone_number_id text primary key,      -- o id do número na Meta
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  waba_id         text default '',
  numero          text default '',
  nome            text default '',
  ativo           boolean default true,
  criado_em       timestamptz default now()
);

create table if not exists public.mensagens_whatsapp (
  id              text primary key,      -- o wamid da Meta, que já é único
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  phone_number_id text not null,
  telefone        text not null,         -- o outro lado, só dígitos
  telefone_curto  text not null,         -- últimos 8 dígitos, para casar
  direcao         text not null check (direcao in ('entrada', 'saida')),
  origem          text not null default 'api'
                  check (origem in ('api', 'celular', 'historico')),
  autor           text default '',
  texto           text default '',
  tipo            text default 'text',
  midia_url       text default '',
  enviada_em      timestamptz not null,
  contato_id      text,
  oportunidade_id text,
  lida            boolean default false,
  criado_em       timestamptz default now()
);

create index if not exists idx_msg_wa_casar
  on public.mensagens_whatsapp (tenant_id, telefone_curto, enviada_em desc);
```

`telefone_curto` existe porque o mesmo telefone chega escrito de quatro
jeitos: com 55, sem 55, com o 9 na frente, com zero de operadora. Comparar os
últimos 8 dígitos casa os quatro sem heurística frágil.

`origem` separa três coisas que se parecem e não são: o que passou pela API,
o que o vendedor mandou do celular, e o que veio na carga de histórico.

As políticas de acesso seguem o padrão das outras tabelas: cada empresa lê o
que é dela, administrador lê tudo. Quem **escreve** é a função, com a chave de
serviço, que não passa por RLS — e é por isso que ela precisa validar a
assinatura da Meta antes de gravar qualquer coisa.

## Fase 2 — A função `whatsapp`

Uma Edge Function, ao lado de `assistente` e `convite`. Ela faz quatro coisas.

**Responder a verificação.** A Meta manda um GET com `hub.challenge` e
`hub.verify_token`. Se o token bater com o segredo, devolve o challenge.

**Conferir a assinatura.** Todo POST vem com `X-Hub-Signature-256`, um HMAC do
corpo com o App Secret. Sem essa conferência, qualquer um que descubra o
endereço grava mensagem falsa no CRM de qualquer cliente. É a parte mais
importante da função.

**Descobrir de quem é.** O `phone_number_id` do payload vira `tenant_id` pela
tabela `whatsapp_numeros`. Número desconhecido é descartado, não adivinhado.

**Gravar, tratando três eventos:**

| evento | o que é | como grava |
|---|---|---|
| `messages` | o cliente escreveu | direção entrada, origem api |
| `smb_message_echoes` | o vendedor escreveu do celular | direção saída, origem celular |
| `history` | a carga dos 6 meses, uma vez | as duas direções, origem histórico |

Gravação idempotente pelo `wamid`. A Meta reentrega o webhook quando não
recebe 200 rápido, e sem isso a mesma mensagem entraria duas vezes — o mesmo
problema que o Linked Helper já nos deu.

### Publicar, pelo painel, sem instalar nada

O painel do Supabase publica Edge Functions direto do navegador. Não precisa
da CLI, nem de Docker, nem de Deno. É o mesmo caminho da função `assistente`.

1. Abra o código e copie tudo (Ctrl+A, Ctrl+C):
   <https://raw.githubusercontent.com/maiaalex2306/iad/claude/decisoes-estagios-vendas-eckjo0/nuvem/funcoes/whatsapp/index.ts>
2. No painel do projeto: **Edge Functions** → **Deploy a new function** →
   **Via Editor**.
3. Nome da função: exatamente `whatsapp`, minúsculo e sem acento. O nome vira
   o endereço, e é ele que a Meta vai chamar.
4. Apague o exemplo do editor, cole o código, **Deploy**.

O que sobe é um arquivo só, sem dependências. Publicar de novo por cima
substitui a versão anterior — não há como "quebrar" pela metade.

### Três segredos, e o Verify JWT desligado

Na função, em **Secrets**:

| segredo | o que é |
|---|---|
| `IAD_CHAVE_SECRETA` | a `service_role` do projeto, que ignora o RLS para gravar |
| `WA_TOKEN_VERIFICACAO` | o texto que você inventa e repete no painel da Meta |
| `WA_SEGREDO_APP` | o App Secret do aplicativo, com que a Meta assina cada POST |
| `WA_TENANT_PADRAO` | o `tenant_id` que recebe mensagem de número ainda não cadastrado |

`WA_TENANT_PADRAO` existe por causa de uma corrida que acontece uma vez só. O
`phone_number_id` só é conhecido **depois** de conectar o número, e o `history`
chega nos minutos seguintes. Entre conectar e cadastrar a linha em
`whatsapp_numeros` existe uma janela de alguns minutos — e é exatamente dentro
dela que os 6 meses chegam. Com este segredo definido, nada se perde.

Pegue o valor com:

```sql
select id, nome from public.tenants order by criado_em;
```

Deixe vazio numa instalação com várias empresas: ali chutar o dono da conversa
seria mostrar o cliente de um para outro, e descartar é o certo.

`SUPABASE_URL` já existe no ambiente. Segredo trocado só vale no deploy
seguinte: publique de novo depois de mexer.

E então, no painel da função → **Settings** → desligue **Verify JWT**.

Isto não é detalhe: **sem desligar, nada funciona, e o sintoma engana**. O
porteiro do Supabase exige um token de sessão antes de deixar o pedido chegar à
função. A Meta não tem sessão nenhuma no nosso projeto e nem deveria ter — ela
manda um POST assinado, que é outra forma de provar quem é. O porteiro recusa
com 401, a função nunca roda, e no painel da Meta a verificação do webhook
falha sem dizer por quê.

A segurança não afrouxa, muda de lugar: quem confere passa a ser a função, e
ela confere o que importa aqui — o HMAC do corpo com o App Secret, que o
porteiro do Supabase não sabe olhar.

## Fase 3 — Conectar o número

Só agora, e com a função já publicada e testada.

1. Apontar o webhook do aplicativo para a função:
   `https://drhonmdffhnwamwzynrs.supabase.co/functions/v1/whatsapp`, com o
   mesmo texto de `WA_TOKEN_VERIFICACAO` no campo de verificação, e assinar os
   campos `messages`, `smb_message_echoes` e `history`.
2. Rodar o Embedded Signup com o sub-fluxo de Coexistence.
3. O número precisa estar no WhatsApp Business versão 2.24.17 ou mais nova.
4. Confirmar o código no aparelho.
5. Nos minutos seguintes, conferir se o `history` chegou e quantas mensagens
   gravou. É a única chance.
6. Cadastrar o número, agora que o `phone_number_id` é conhecido. Ele aparece
   no log da função, no aviso da empresa padrão:

```sql
insert into public.whatsapp_numeros (phone_number_id, tenant_id, numero, nome)
values ('<o id que apareceu no log>', '<o tenant>', '+55 ...', 'Comercial');
```

   A partir daí a empresa padrão deixa de ser usada para este número.

---

## Fase 4 — Dentro do CRM

Aqui é onde a coisa vira produto. A regra que organiza tudo:

> Mensagem não é evidência. Evidência é o que o cliente decidiu, e quem diz
> que uma mensagem virou decisão é o vendedor, não o sistema.

### O casamento, em três degraus

Quando uma mensagem entra, o app tenta descobrir de quem ela é:

1. **O telefone bate com um contato.** A conversa é daquele contato e, por
   ele, daquela empresa.
2. **O contato está no grupo comprador de uma única negociação aberta.** A
   conversa também é daquela negociação.
3. **Nada bate.** A conversa fica em "Sem dono", com duas saídas: escolher um
   contato existente ou cadastrar um novo. O cadastro é o mesmo formulário de
   sempre, já com o telefone preenchido.

Se o contato estiver em duas negociações abertas, o app não escolhe. Pergunta.
Chutar aqui seria pendurar evidência no negócio errado.

### Onde aparece

- **Conversas**, seção nova no menu, ao lado de Tarefas. Lista por pessoa, com
  a última mensagem e quantas não lidas.
- **No cartão do pipeline**, uma tarja como a de tarefa atrasada, mas azul:
  "3 mensagens novas". Mesmo mecanismo, cor diferente.
- **Em Hoje, no topo**, antes das tarefas: "Responderam no WhatsApp". Cliente
  que escreveu é a coisa mais quente do dia, e tem de ser a primeira da tela.

### O que a conversa vira

O vendedor abre a conversa, lê, e clica em **Registrar o que aconteceu**.

Isso cria uma tarefa **já concluída**, canal WhatsApp, com o texto da conversa
como relato, na data da última mensagem. Daí em diante é o caminho que já
existe: a IA lê, separa o que o CLIENTE fez, propõe as evidências com a força
de cada uma e relê as oito decisões.

Nada de novo no motor. A conversa entra pela porta que já está aberta.

**Por que não é automático.** "Bom dia, tudo bem?" não move decisão nenhuma.
Ler tudo sozinho encheria o histórico de evidência inventada, gastaria leitura
à toa e — o pior — faria o IAD subir com conversa fiada. A leitura é barata
quando alguém escolhe o que vale a pena ler.

### O que acontece sozinho

- **A contagem de não lidas**, na negociação e no cartão.
- **Acordar da nutrição.** Negociação em nutrição volta para a carteira ativa
  quando o cliente se mexe, e escrever é se mexer. É a mesma regra que já
  existe, com uma porta a mais.
- **O `smb_message_echoes` entra na mesma linha do tempo.** Os dois lados da
  conversa ficam juntos, na ordem em que aconteceram.

### O que NÃO acontece sozinho

- **O `evidenceAge` não zera.** Só evidência zera. Uma conversa não lida não é
  avanço, e fingir que é seria apagar justamente o sinal que este CRM existe
  para dar.
- **A nota das oito não muda.** Muda quando a IA lê, e ela só lê quando o
  vendedor mandar.
- **O histórico dos 6 meses não cria tarefa nenhuma.** Entra marcado como
  histórico, fora da contagem de não lidas. O vendedor escolhe o que importa.
  É por aqui que a conversa antiga com a Hortência entra.

## Fase 5 — Responder

Deixada para depois de propósito: receber já resolve a maior parte, e enviar
tem custo e aprovação.

Dentro da conversa, uma caixa de texto com duas situações:

- **O cliente escreveu nas últimas 24 horas.** Texto livre, grátis.
- **Passou de 24 horas.** A janela fechou. Só modelo aprovado pela Meta, e o
  app mostra o custo ao lado de cada um antes de mandar.

A resposta enviada pelo IAD entra na mesma conversa, e o que for enviado pelo
celular volta pelo echo. Uma linha do tempo só.

---

## Limites que vêm junto

- O aplicativo precisa ser aberto ao menos uma vez a cada 13 dias.
- Vazão fixa de 5 mensagens por segundo. Serve para venda consultiva, não
  serve para disparo em massa.
- Conversa de grupo não sincroniza. Fica só no aplicativo.
- Sem selo azul: contas em Coexistence não suportam Official Business Account.

## Custos, conferidos em setembro de 2026

A cobrança virou por mensagem em julho de 2025. No Brasil:

| categoria | por mensagem |
|---|---|
| Marketing | R$ 0,3125 |
| Utilidade | R$ 0,0340 |
| Autenticação | R$ 0,0340 |

Receber é grátis. Responder dentro da janela de 24 horas é grátis. Só modelo
aprovado é cobrado, desde a primeira mensagem.

Para venda consultiva, com conversas puxadas pelo cliente, o custo tende a
ficar perto de zero. O que custa é disparo de marketing, que não é o que o IAD
faz.

A partir de julho de 2026 empresas brasileiras elegíveis podem ser cobradas em
reais pela entidade local da Meta, com migração obrigatória até junho de 2027.

## LGPD

Guardar conversa de cliente é tratar dado pessoal, e isso não é detalhe de
implementação.

- Base legal definida e escrita no contrato do IAD.
- Aviso claro de que a conversa é registrada no CRM.
- Prazo de retenção, e um jeito de apagar a pedido do titular.
- A tabela já nasce isolada por empresa: o dado de um cliente nunca é visível
  para outro.

Isso mexe no texto comercial, não só no código. Precisa estar resolvido antes
do primeiro cliente, não depois.
