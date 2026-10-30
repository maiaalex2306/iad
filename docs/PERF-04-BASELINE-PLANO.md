# PERF-04 — Auditoria instrumentada da v273 e plano de aceleração

**Referência funcional:** IaD CRM v273 publicada em `claude/decisoes-estagios-vendas-eckjo0`, incluindo o hotfix do service worker.  
**Branch:** `performance/iad-perf-04-instrumentacao`.  
**Status:** exclusivamente medição, diagnóstico e CI; **sem deploy ou SQL em produção**.

## Objetivo mensurável

Reduzir o custo de carregar, navegar e operar o CRM sem mudar nenhum número do Decision Engine e sem perder alterações na sincronização. O baseline da v273 deve existir **antes** de qualquer refatoração de performance.

## Fontes verificadas
- GitHub: `index.html` importa 33 scripts; `src/app.js` tem ~548 mil caracteres, `src/views.js` ~669 mil, `src/store.js` ~95 mil e `src/nuvem.js` ~103 mil.
- `src/perf-02.js` e `src/pipeline-performance.js` invalidam caches com a revisão global `Store.revisao()`, o que pode recomputar mais do que o registro alterado.
- `src/views.js` já limita cartões iniciais do Pipeline a 48, mas prepara resumos da carteira antes do recorte visual.
- Supabase Performance Advisors de produção (30/10/2026): **10 avisos auth_rls_initplan**, **11 chaves estrangeiras sem índice de suporte**, **23 índices sem utilização registrada**. Nenhum foi alterado; é necessário verificar `EXPLAIN (ANALYZE, BUFFERS)` antes de criar/remover índices.
- Referência anterior: teste Chromium sintético de 243 oportunidades com primeiro render ~31,6 ms, p50 aquecido ~6,8 ms e p95 aquecido ~10,9 ms. **Não extrapolar** para outras telas ou navegação com autenticação.

## Instrumentação entregue neste PR
- `scripts/perf04-baseline-browser.cjs`: Chromium isolado; 389 oportunidades sintéticas; mede 12 telas, seis amostras por tela (uma primeira + cinco aquecidas); separa tempo de geração HTML do custo síncrono de inserção no DOM; registra p50/p95, heap disponível, cardinalidades e erros JS.
- `.github/workflows/perf-04-baseline.yml`: publica artefato JSON, repete paridade do Decision Engine em 243/1000/5000 negócios, executa regressões de caches, CAS, offline e deltas, e testa concorrência com GoTrue/Postgres **descartável**.
- Todos os dados do benchmark são sintéticos; servidor local intercepta configuração para evitar conexão à produção; requisições externas são bloqueadas no navegador.

**IMPORTANTE:** os tempos abaixo do JSON medem somente a geração de HTML e inserção síncrona no DOM. Não substituem INP/LCP, custo de transporte autenticado, tempo de APIs nem primeiro login real. A próxima rodada precisa medir essas etapas em homologação autenticada, sem registrar conteúdo comercial.

## Intervenções P0 — maior prioridade

| Função / tela | Arquivos-alvo | Problema verificável | Intervenção proposta | Critério de aceite |
|---|---|---|---|---|
| Todas as rotas | `src/app.js`, `src/views.js` | Render centralizado e telas HTML grandes | Render seletivo; repintar bloco afetado e preservar foco/scroll | Melhorar p95 por tela vs JSON v273; nenhuma regressão E2E |
| Pipeline | `src/views.js`, `src/pipeline-performance.js` | Resumos de todas as oportunidades antes dos 48 cartões visíveis | Memoização incremental por ID/revisão; indexação de filtros | Mesmos cartões, totais e filtros; menor p95 em 389/1k/5k |
| Hoje | `src/perf-hoje.js`, `src/perf-02.js`, `src/views.js` | Recomputação global após edições não relacionadas | Revisões por entidade, cálculo só dos negócios alterados | Paridade exata de prioridade, urgência e orientação |
| Cockpit | `src/views.js`, `src/app.js` | HTML e dados pesados concentrados | Render inicial essencial + abas/histórico lazy | Mesmo conteúdo final e histórico, menor tempo até interatividade |
| Login/primeira carga | `index.html`, `src/app.js`, `sw.js` | 33 scripts no boot | Bundle modular, lazy por rota; preservar offline e ordem de dependências | Menor byte transferido e LCP; cold/warm PWA preservados |
| Sincronização | `src/nuvem.js`, `src/sincronia.js`, `src/cas-queue.js` | Transporte/serialização podem competir com navegação | Contabilizar bytes, solicitações e tempos; coalescer sem descartar ACK | 0 perda/duplicidade; 0 cross-tenant; GoTrue CAS E2E aprovado |

## Intervenções P1 — após P0 validado

| Função / tela | Arquivos | Ação | Gate |
|---|---|---|---|
| Contas e contatos | `src/store.js`, `src/views.js` | Busca indexada, debounce e listas virtuais | Resultado/escopo idênticos |
| Tarefas | `src/views.js`, `src/engine.js` | Índice por prazo, status, dono e oportunidade | Prazos e histórico sem diferenças |
| Painel, Revisão, gráficos | `src/views.js`, `src/graficos.js` | Agregados memoizados por revisão seletiva | KPIs e totais exatamente iguais |
| Cadastros, Nutrição | `src/views.js`, `src/app.js` | Filtragem incremental e render seletivo | Nenhum registro omitido/duplicado |
| Campanhas, importações | `src/app.js`, `src/integracoes.js` | Worker por lote e progresso cancelável | CSV/ações idênticos |
| IA e conversas | `src/ia.js`, `src/conversa.js` | Concorrência limitada e cache por entrada/revisão | Sem respostas trocadas de usuário/empresa |
| SQL/RLS | `nuvem/` (nova migration apenas após aprovação) | Reescrever auth functions independentes da linha com `(SELECT ...)` e avaliar índices | RLS com 2+ tenants idêntico; `EXPLAIN` melhor; rollback testado |
| Índices PostgreSQL | Banco | Validar FKs, taxas de uso, cardinalidade | Nunca remover índice com base somente em advisor |

## Gates inegociáveis antes de otimizar e promover
1. **Paridade jurídica/comercial do Decision Engine:** comparação campo a campo para 243, 1000 e 5000 oportunidades, incluindo estado de cache frio/quente e alterações.
2. **Zero regressão de CAS/Sync:** concorrência, lost ACK, delete offline, criação offline, token/sessão, duas empresas e permissões GoTrue/RLS.
3. **Nenhuma regressão de filtros e contagens:** dashboards, nutrição, pipeline e tarefas continuam determinísticos.
4. **Benchmark equivalente:** mesmo runner, amostras, dataset, escopo, tamanho e método; reportar mediana/p95 antes/depois e variação percentual **somente após medir**.
5. **Sem alterações de produção neste PR.** Homologar mudanças seguintes em nova etapa, sem ativação prematura.

## Uso dos resultados

Artefatos: `perf04-baseline-v273-browser` e `perf04-decision-engine-parity` no GitHub Actions. Os dados são JSON e podem sustentar uma comparação v273 → candidato por tela. Até a execução da bateria, **não declarar percentuais de melhoria**.
