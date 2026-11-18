# IaD CRM — PERF-04 P2: Painel mais rápido e navegação medida

## Referência e restrições
- Base: **v275 publicada** na branch `claude/decisoes-estagios-vendas-eckjo0`, merge `18a4e64d6372c43a20f46927deda3915cbd645b4`.
- Candidata: `performance/iad-perf-04-p2-painel-v276`; **sem publicação, SQL ou mudanças em produção nesta fase**.
- Testes usam 389 oportunidades/778 tarefas sintéticas, usuários separados por tenant, Chromium headless e rede externa bloqueada.
- A versão no app permanece v275 até a decisão de implantação; no deploy será necessário atualizar **juntos** `src/config.js` e `sw.js` para a nova versão/cache.

## Problema quantificado e correção

O Painel chamava `Store.dados()` três vezes por renderização: uma em `painel()`, outra em `evolucaoDaCarteira()` e outra em `aprendizado()`. Cada chamada refiltra entidades por responsável/empresa. Isso introduzia tempo redundante e variabilidade em cada navegação.

**Modificação funcional única:** `src/views.js`: `painel()` passa o `est` obtido na entrada para `evolucaoDaCarteira(est)` e `aprendizado(est)`. Ambas as funções ainda aceitam chamada sem argumento com fallback para `Store.dados()`, preservando qualquer consumidor legado. Decision Engine, classificação, CAS, RLS e sincronização permanecem inalterados.

## Evidências em Chromium

Comparei **a v275 original e a candidata** na mesma página e com o mesmo Store, em 40 amostras aquecidas alternadas, separando HTML e inserção síncrona no DOM.

| Métrica | Execução 1, v275 → candidata | Execução 2, v275 → candidata |
|---|---|---|
| Painel p95 (HTML + DOM) | 16,0 → 12,9 ms (**19,37% menor**) | 16,0 → 9,9 ms (**38,13% menor**) |
| Mediana (HTML + DOM) | 14,0 → 11,6 ms (**17,14% menor**) | 11,7 → 8,8 ms (**24,79% menor**) |
| Leituras Store por render | **3 → 1** | **3 → 1** |
| HTML completo | Identidade funcional em 4 cenários | Identidade funcional em 4 cenários |

Cenários de equivalência: gestor sem filtro, gestor com filtro de período, gestor com filtro de segmento e outro tenant. Normalização de IDs temporários dos SVGs no teste; nenhum KPI, texto comercial ou registro pode divergir.

**Perfil de função**: antes, 5 renders usavam 15 chamadas de `Store.dados()` e ~31,3 ms acumulados; após correção, 5 renders usam 5 chamadas e ~9,1 ms acumulados. São duas execuções em runners CI com ruído normal; o benchmark pareado é a comparação principal.

### Medição de navegação SPA (ambiente sintético)
A mesma rotina de Chromium navegou por `App.ir()`, com mudança real de hash entre Painel, Cockpit e Pipeline, aguardando a tela no DOM e um segundo frame. p95 observado nesta execução: **Painel 36,6 ms**, **Cockpit 33,5 ms**, **Pipeline 34,0 ms**. Estes números incluem a espera de frames (~33 ms de piso em condições do runner) e são **testes de responsividade local**, não métricas de produção, rede, INP ou LCP. São úteis principalmente para detectar travamentos e regressões da navegação SPA.

## Condições de homologação
1. Pelo menos quatro cenários de HTML exatamente equivalentes à v275, com isolamento entre usuários/tenants.
2. Comprovar leituras de Store **3 → 1**.
3. Medir HTML, DOM, p50 e p95 com mesma base, sem prometer ganhos de uma única rodada.
4. Passar Decision Engine com 243/1.000/5.000 oportunidades e testes de caches.
5. Passar CAS, edição/criação/exclusão offline, RLS, GoTrue real em PostgreSQL descartável e demais 11 workflows do commit final.
6. Nenhuma alteração SQL, nenhum deploy prematuro. Produção mantém integridade.
7. Para testar experiência de usuários reais e tempos de API, usar sessão autorizada de homologação/produção, evitando colocar senhas nos arquivos de CI.

## Próxima evolução recomendada
Estudar `E.carteira` e `IADFunis.tudo`, que no perfil respondem por parte significativa do trabalho restante, com **índices por entidade e invalidação seletiva**, sem criar caches entre sessões/tenants. Fazer isso em PR separado, após medir.
