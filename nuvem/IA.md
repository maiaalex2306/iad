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

## 2. Guardar a chave no Supabase

Com a [CLI do Supabase](https://supabase.com/docs/guides/local-development)
instalada e o projeto vinculado:

```bash
supabase secrets set IA_CHAVE=gsk_sua_chave_aqui
```

Opcionais, se um dia quiser trocar de provedor ou de modelo:

```bash
supabase secrets set IA_PROVEDOR=groq              # ou: anthropic
supabase secrets set IA_MODELO=llama-3.3-70b-versatile
```

`SUPABASE_URL` e `SUPABASE_ANON_KEY` já existem no ambiente da função — não
precisa criar.

## 3. Publicar a função

```bash
supabase functions deploy assistente --project-ref SEU_REF
```

O código está em `nuvem/funcoes/assistente/index.ts`. Confira que ficou no ar:

```bash
curl -i https://SEU_REF.supabase.co/functions/v1/assistente \
  -X POST -H 'content-type: application/json' -d '{}'
```

Deve responder **401** — a função existe e está recusando quem não está
logado. Se responder 404, o deploy não foi. Se responder 503, a chave não foi
configurada.

## 4. Pronto

Entre no IAD com um usuário do servidor. As caixas ✨ aparecem sozinhas nos
formulários. Sem nuvem configurada ou sem sessão, elas simplesmente não
existem — o app continua exatamente como era.

---

## Trocar Groq por Claude

Duas variáveis, sem tocar em uma linha de código do aplicativo:

```bash
supabase secrets set IA_PROVEDOR=anthropic
supabase secrets set IA_CHAVE=sk-ant-...
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

## Privacidade

A função recebe apenas o texto da tela atual mais as listas de opções do
próprio tenant (segmentos cadastrados, nomes dos contatos daquela conta).
Nunca a base, nunca o histórico de outras contas, nunca dados de outra
empresa. O limite é 8 mil caracteres por chamada — 40 mil quando é
transcrição de reunião.
