# IAD CRM — Gestão comercial orientada à decisão

> O funil organiza. A decisão fecha.

CRM que não mede o que o vendedor fez, e sim **o que mudou na decisão do comprador**.
Roda no navegador, instala no desktop (Windows/macOS/Linux) e vira aplicativo no
Android e no iPhone — com **um único código**.

## Por que PWA primeiro

Quatro aplicativos separados (web, Windows, Android, iOS) custam quatro vezes mais
e validam a metodologia quatro vezes mais devagar. Um PWA entrega desde já:

| Plataforma | Como instalar |
|---|---|
| Desktop (Chrome/Edge) | ícone de instalar na barra de endereço |
| Android | menu ⋮ → “Instalar aplicativo” |
| iPhone/iPad (Safari) | Compartilhar → “Adicionar à Tela de Início” |
| Navegador | funciona sem instalar nada |

Funciona **offline**: os dados ficam no dispositivo e o app abre sem rede.
Quando o produto estiver validado, o mesmo código é empacotado com
**Tauri** (Windows/macOS) e **Capacitor** (App Store / Play Store) — sem reescrever a interface.

## O que já está implementado

Os quatro componentes que sustentam a metodologia:

1. **Decision Engine — as 8 decisões e o IAD.** Problema, Prioridade, Impacto,
   Critérios, Stakeholders, Consenso, Risco e Processo de compra, pontuados
   0 (desconhecido) / 1 (parcial) / 2 (comprovado pelo cliente) → IAD de 0 a 16.
2. **Evidence Engine.** A linha do tempo separa `Decision Event` (o cliente se moveu)
   de `Activity` (nós nos movemos). Só evidência do cliente zera o **Evidence Age**;
   proposta enviada e follow-up feito não contam como avanço, por definição do modelo.
3. **Buying Group Map.** Papéis, posição (favorável/neutro/resistente/não acessado)
   e **Stakeholder Coverage** sobre os papéis críticos, com alerta de venda
   single-threaded e de proposta sem decisor econômico.
4. **Next Best Decision.** Regra que aponta qual decisão precisa ocorrer *dentro do
   cliente* agora — e como provocá-la em LinkedIn, LinkedHelper, e-mail e WhatsApp.

**Força da evidência** (relato / confirmado / documentado) governa a pontuação:
uma dimensão só chega a 2 com evidência confirmada ou documentada. Cada evidência
aponta **quem a produziu** e pode carregar **o que ficou combinado e para quando** —
o compromisso que vira o relógio de atraso.

Em volta disso: contas, contatos (com influência e hierarquia), oportunidades,
**tarefas** com decisão-alvo e **arquivos** categorizados pela decisão que destravam;
**Proposal Gate** com prontidão em % e liberação manual registrada; **Decision
Velocity**; **desfecho** (ganho, perdido para concorrente, perdido por inação, adiado)
que congela a foto da decisão e alimenta a seção de **aprendizado da carteira**;
**painel executivo** que separa pipeline saudável, em risco e zumbi e mostra qual
decisão está travando cada faixa de receita; tela **Hoje** com o que precisa de
atenção agora; **revisão semanal**; **curva do IAD** e delta da semana; histórico
unificado; playbook; **importação por CSV** e export/import JSON.

Quatro relógios de atraso, todos calculados: Evidence Age, compromisso vencido,
tempo na etapa e contador de adiamentos da data de fechamento.

Classificação automática da carteira: *Negócio real*, *Oculto promissor*,
*Em construção*, *Falso avançado* e *Zumbi*.

## Como rodar

Basta um servidor estático (o service worker exige `http://` ou `https://`):

```bash
npx http-server -p 8099 -c-1 .
# abra http://127.0.0.1:8099
```

Sem instalação, publique a pasta em qualquer hospedagem estática
(GitHub Pages, Netlify, Vercel, Cloudflare Pages) e o app já é instalável.
Na primeira tela, **Carregar demonstração** monta uma carteira fictícia com os
cinco grupos de pipeline para treinar a leitura do modelo.

## Estrutura

```
index.html              shell do app
manifest.webmanifest    identidade PWA (instalação)
sw.js                   service worker (offline, cache do app shell)
assets/styles.css       mobile-first; o mesmo CSS serve celular e desktop
src/playbook.js         ontologia da decisão: 8 dimensões, evidências, gates, canais
src/store.js            persistência (localStorage) — trocar aqui para IndexedDB ou API
src/engine.js           IAD, Evidence Age, Velocity, Coverage, Gates, NBD, carteira
src/arquivos.js         anexos em IndexedDB (não cabem no localStorage)
src/csv.js              importação por planilha, com prévia e detecção de duplicados
src/graficos.js         gráficos em SVG puro, sem biblioteca
src/integracoes.js      ponte com o Linked Helper: busca as respostas e converte
src/auth.js             empresas do sistema, usuários, sessão e papéis
ponte/                  o coletor que recebe o webhook (Cloudflare Worker)
src/views.js            telas
src/ui.js               formatação e diálogos
src/app.js              rotas e ações
src/seed.js             carteira de demonstração
```

O núcleo conceitual está isolado em `playbook.js` + `engine.js`: são eles que viram
serviço no backend quando o produto sair do modo local.

## Roadmap para produto

**Fase 1 — validação (este repositório).** PWA local, um vendedor ou um time pequeno,
dados no dispositivo com export/import. Objetivo: provar que IAD, Evidence Age e
Coverage explicam ganho e perda melhor que a etapa do CRM.

### Aviso sobre o login desta fase

O app já tem tela de login, usuários, empresas e isolamento por empresa — mas
sem servidor isso **organiza** o acesso, não o protege: a senha é conferida
dentro do próprio navegador, e quem abrir as ferramentas do desenvolvedor
contorna. O envio do código de confirmação também é local (aparece na tela),
porque um site sozinho não tem servidor de e-mail. As telas e os papéis já
estão no formato final; o que muda na Fase 2 é onde a verificação acontece.

**Fase 2 — multiusuário.** Backend (FastAPI ou NestJS) + PostgreSQL, autenticação,
tenants, sincronização e histórico imutável de snapshots — cada alteração de pontuação
já é registrada em `snapshots`, o que permite aprender depois quais sequências de
decisão precedem vendas.

**Fase 3 — empacotamento.** Tauri para Windows/macOS, Capacitor para App Store e
Play Store, notas de voz no celular e notificações de Evidence Age.

**Fase 4 — IA.** Leitura de e-mail, WhatsApp e transcrições sugerindo evidências,
sempre com confirmação humana antes de alterar o IAD — a integridade do forecast
depende disso.

**Fase 5 — Decision Layer.** Modo em que o produto não substitui o CRM da empresa:
conecta a Salesforce, HubSpot ou Pipedrive e adiciona por cima IAD, Evidence Engine,
Buying Group e Next Best Decision.

## Nota

Automação de LinkedIn (inclusive LinkedHelper) deve ser avaliada frente às políticas
da plataforma; o app trata os canais como registro de decisão, não como disparo em massa.
