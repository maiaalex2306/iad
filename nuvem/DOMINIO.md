# Pôr a aplicação em www.iadcrm.com.br

Guia completo, do estado de hoje até o app servindo no domínio próprio, com
HTTPS. Escrito para ser seguido de cima para baixo, numa sentada.

**A ordem não pode ser trocada.** Cada passo depende do anterior ter
terminado, e trocar dois deles deixa o aplicativo inacessível por horas. Onde
isso importa, está dito no próprio passo.

---

## O que já está pronto

A boa notícia: **o aplicativo não precisa de mudança nenhuma.**

Todos os caminhos dele são relativos — `src/…`, `assets/…`, `./index.html`, e
o `scope: "./"` do manifesto. Não há um único endereço fixo no código (`grep`
por `github.io` não acha nada). O mesmo arquivo que funciona hoje em
`maiaalex2306.github.io/iad/` funciona na raiz de um domínio sem tocar em uma
linha.

O que falta é tudo fora do código: DNS, a configuração do GitHub Pages, e um
ajuste no Supabase que, se esquecido, quebra em silêncio.

---

## Passo 0 — Resolver o branch ANTES de comprar briga com DNS

Este passo não é sobre o domínio, e é por isso mesmo que ele vem primeiro.

**Hoje o `main` está no commit inicial.** Todas as 235 versões — tudo o que
existe neste aplicativo — vivem no branch `claude/decisoes-estagios-vendas-eckjo0`,
279 commits à frente, num pull request que nunca foi mesclado. O GitHub Pages
está publicando a partir desse branch de trabalho.

Funciona hoje. Mas apontar um domínio comprado para um branch de feature é
frágil de um jeito específico: **no dia em que o PR for mesclado, ou o branch
apagado, o site morre** — e morre com o domínio apontando para ele, o que é
muito pior do que morrer num endereço que ninguém usa.

### O que fazer

1. Abra o [PR #1](https://github.com/maiaalex2306/iad/pull/1) e **mescle** no `main`.
2. Vá em **Settings → Pages** e mude **Source** para o branch **`main`**
   (pasta `/ (root)`).
3. Espere o deploy terminar e confirme que
   `https://maiaalex2306.github.io/iad/` continua abrindo o app.

**Só depois disto siga adiante.** Se este passo quebrar alguma coisa, é muito
mais fácil descobrir agora, com o endereço antigo, do que no meio da troca de
domínio.

> Se preferir não mesclar agora, dá para seguir mesmo assim — mas então
> **não apague o branch** depois, por nada. O site passa a depender dele.

---

## Passo 1 — DNS no registro.br

**Este passo vem antes do GitHub, e a razão é concreta:** configurar o domínio
no GitHub antes do DNS existir faz o endereço atual passar a redirecionar para
`iadcrm.com.br`, que ainda não resolve. Resultado: você fica sem acesso ao
aplicativo até o DNS propagar, que pode levar horas.

### Chegar na tela certa

O menu não se chama "DNS". Chama-se **Configurar Endereçamento**, e o editor
de verdade só aparece depois de ligar o modo avançado:

1. [registro.br](https://registro.br) → clique no domínio **IADCRM.COM.BR**
2. Role até a seção **DNS** → **Configurar Endereçamento**
3. Role até o fim desse painel → **MODO AVANÇADO** → **Confirmar**
4. Espere alguns minutos e **recarregue a página** até sumir o aviso
   *"Domínio em transição"*
5. Agora aparece **Configurar Zona DNS**, com o botão **NOVA ENTRADA**

### As nove entradas

| NOME | TIPO | DADOS |
| --- | --- | --- |
| *(deixe em branco)* | A | `185.199.108.153` |
| *(deixe em branco)* | A | `185.199.109.153` |
| *(deixe em branco)* | A | `185.199.110.153` |
| *(deixe em branco)* | A | `185.199.111.153` |
| *(deixe em branco)* | AAAA | `2606:50c0:8000::153` |
| *(deixe em branco)* | AAAA | `2606:50c0:8001::153` |
| *(deixe em branco)* | AAAA | `2606:50c0:8002::153` |
| *(deixe em branco)* | AAAA | `2606:50c0:8003::153` |
| `www` | CNAME | `maiaalex2306.github.io` |

No fim de todas: **SALVAR ALTERAÇÕES**. Sem esse botão, nada é aplicado.

### Três coisas que fazem errar

- **Nome em branco para a raiz, nunca `@`.** A legenda da própria tela avisa:
  *"não são aceitos os caracteres @ e \*"*.
- **CNAME sem ponto no fim.** O exemplo do registro.br é
  `meublog.example.com`, sem ponto. Siga o padrão da casa.
- **O alvo do CNAME não leva o nome do repositório.** É
  `maiaalex2306.github.io`, e não `maiaalex2306.github.io/iad`. O caminho do
  repositório some quando existe domínio próprio.

### Por que oito registros para a raiz e um só para o www

Os quatro `A` e os quatro `AAAA` fazem `iadcrm.com.br` (sem www) também
funcionar — o GitHub recebe e redireciona para o www. Quatro endereços em vez
de um é redundância: se um servidor do GitHub cair, os outros três atendem.

O `www` é CNAME porque é o nome canônico, e CNAME é o único tipo que acompanha
sozinho uma eventual troca de endereços do GitHub. Por isso o domínio
**principal** é o `www`, e a raiz é quem redireciona — não o contrário.

### Como saber que deu certo

Espere alguns minutos e abra <https://dnschecker.org> (ou qualquer verificador
de DNS):

- consulte `www.iadcrm.com.br`, tipo **CNAME** → tem de responder
  `maiaalex2306.github.io`
- consulte `iadcrm.com.br`, tipo **A** → tem de responder os quatro
  `185.199.1xx.153`

Enquanto não responder, **não passe para o passo 2**. Normalmente leva de
alguns minutos a uma hora; o prazo oficial é de até 24 horas.

---

## Passo 2 — O domínio no GitHub

Só depois do DNS responder.

1. Repositório → **Settings** → **Pages**
2. Em **Custom domain**, escreva **`www.iadcrm.com.br`** → **Save**

O GitHub faz a verificação do DNS na hora e avisa se algo estiver errado — é
por isso que vale usar esta tela em vez de criar o arquivo `CNAME` à mão. Ele
cria o arquivo sozinho, no branch que está publicando.

Se aparecer erro de DNS aqui, **o problema é o passo 1**, não este. Volte,
confira, espere mais um pouco.

---

## Passo 3 — HTTPS

Depois de salvar o domínio, o GitHub pede um certificado ao Let's Encrypt.
Leva de alguns minutos a uma hora.

Enquanto não terminar, a caixa **Enforce HTTPS** fica cinza, com a mensagem
*"certificate is being provisioned"*. Quando ela liberar, **marque**.

Não pule: sem isso o app abre em `http://`, e um CRM com login e carteira de
clientes trafegando sem criptografia é inaceitável.

---

## Passo 4 — Supabase (o que quebra em silêncio)

**Este é o passo que ninguém lembra, e o único cujo erro não aparece na
tela.**

O app manda o usuário de volta para `location.origin` quando recupera senha e
quando convida alguém. O GoTrue — o serviço de autenticação do Supabase — só
aceita destinos que estejam numa lista. Trocar de domínio sem avisar essa
lista faz o link do e-mail apontar para o endereço antigo, ou simplesmente ser
recusado. Ninguém vê erro: a pessoa só não consegue entrar.

1. Painel do Supabase → **Authentication** → **URL Configuration**
2. **Site URL:** `https://www.iadcrm.com.br`
3. **Redirect URLs:** acrescente `https://www.iadcrm.com.br/**` e
   **mantenha o endereço antigo** (`https://maiaalex2306.github.io/iad/**`)
   enquanto houver gente usando os dois.

Não é preciso mexer em mais nada: as Edge Functions liberam qualquer origem
(`Access-Control-Allow-Origin: *`), e o PostgREST não filtra por domínio.

### Como testar

Peça para si mesmo a recuperação de senha pelo app no domínio novo e veja se o
link do e-mail volta para `www.iadcrm.com.br`. Se voltar para o github.io, a
lista não foi salva.

---

## Passo 5 — Conferir que está tudo de pé

Abra `https://www.iadcrm.com.br` e verifique, nesta ordem:

| O quê | Como se vê |
| --- | --- |
| O site abre no domínio | A barra de endereço mostra `www.iadcrm.com.br`, e não redireciona para github.io |
| HTTPS | O cadeado aparece, sem aviso de "não seguro" |
| A raiz redireciona | `iadcrm.com.br` (sem www) leva ao `www` |
| O app carrega inteiro | Login aparece, e depois a tela **Hoje** |
| A nuvem responde | **Configuração → Conta e nuvem** mostra "conectado" |
| O banco está em dia | Mesma tela → **Conferir agora** → "Está tudo em dia" |
| O assistente | **Configuração → Conta e nuvem** → Assistente de IA "No ar" |
| A recuperação de senha | O link do e-mail volta para o domínio novo |

---

## O que esperar de estranho, e o que não é defeito

**O app parece "voltar atrás" na primeira visita.** O domínio novo é uma
origem nova para o navegador: o service worker, o cache e o
`localStorage` começam do zero ali. Não há perda — a carteira está no
servidor, e o primeiro login baixa tudo. Mas as escolhas locais (tema, o que
estava em cada filtro) começam limpas, e quem tinha o app instalado como PWA
precisa instalar de novo, do endereço novo.

**O endereço antigo passa a redirecionar.** Depois do passo 2,
`maiaalex2306.github.io/iad/` manda para `www.iadcrm.com.br`. É o
comportamento certo. Avise quem tiver o link antigo salvo.

**O certificado demora.** Uma hora é normal. Mais de 24 horas não é: volte ao
passo 1 e confira o DNS.

---

## Se der errado

| Sintoma | Causa quase certa |
| --- | --- |
| GitHub recusa o domínio: "Domain does not resolve" | DNS ainda não propagou, ou o CNAME aponta para o lugar errado |
| O site abre, mas sem HTTPS e sem opção de marcar | Certificado ainda sendo emitido — espere |
| `iadcrm.com.br` não abre, só o `www` | Faltaram os registros `A` da raiz |
| 404 do GitHub no domínio | O Pages está publicando de um branch que não existe mais, ou o Source mudou |
| Login funciona, recuperação de senha não | Passo 4 não foi feito |
| Faixa laranja de sincronização | Nada a ver com o domínio — abra **Conferir agora** |

---

## Resumo em uma tela

```
0. Mesclar o PR no main  →  Settings → Pages → Source = main
1. registro.br → Configurar Endereçamento → MODO AVANÇADO
                → Configurar Zona DNS → as 9 entradas → SALVAR
   (esperar o DNS responder — confira no dnschecker.org)
2. GitHub → Settings → Pages → Custom domain = www.iadcrm.com.br
3. Esperar o certificado → marcar Enforce HTTPS
4. Supabase → Authentication → URL Configuration
              Site URL + Redirect URLs com o domínio novo
5. Abrir https://www.iadcrm.com.br e percorrer a tabela de conferência
```
