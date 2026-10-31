# IaD CRM v275 — PERF-04 P1 Revisão e Painel

## Escopo da atualização
Baseline: produção v274 (`d67ecd36de841ea225c68af370b69d1d66958089`). A candidata altera a geração de Revisão e Painel, preserva as regras do Decision Engine e todas as operações CAS, RLS e de sincronização. Não há migração SQL.

- `src/views.js`: índice de tarefas atrasadas por render nas telas Painel e Revisão; Revisão exibe 48 cartões iniciais e permite abrir mais lotes de 48.
- `src/engine.js`: `carteira` recebe índice opcional e constrói índice único quando necessário; consumidores de Conversas seguem protegidos.
- `src/app.js`: ação `revisaoMais` conectada ao botão de expansão.
- `src/config.js` e `sw.js`: v275 e cache v275 sincronizados, para evitar scripts obsoletos no PWA.

## Paridade funcional e integridade
- Chromium isolado com 389 oportunidades e 778 tarefas sintéticas.
- Em Revisão, o HTML dos primeiros 48 cartões é exatamente o prefixo da lista v274; o botão Mostrar mais permite chegar ao 389º cartão.
- Após expansão completa, o HTML resultante é idêntico ao da v274 em todas as condições testadas, incluindo nutrição vencida e segundo tenant.
- Painel: HTML equivalente à v274, normalizando apenas IDs transitórios de SVG gerados por contador no próprio gráfico.
- `E.carteira` retorna dados equivalentes com índice explícito ou calculado automaticamente, em duas empresas.
- Regressões obrigatórias: Decision Engine em 243/1000/5000 oportunidades; CAS, idempotência, recuperação offline, autorização GoTrue e RLS, multiempresa, login, Pipeline, Cockpit.

## Benchmark experimental (sem dados reais)
Benchmark no GitHub Actions, mesmo Chromium e página, 25 amostras aquecidas alternadas, medindo geração de HTML **mais** inserção síncrona no DOM. Não mede rede, pintura posterior, LCP ou INP.

| Tela | v274 p95 | Candidata p95 | Variação | Interpretação |
|---|---:|---:|---:|---|
| Revisão | 34,7 ms | 19,4 ms | **44,09% menor** | Ganho demonstrado em uma rodada pareada de HTML + DOM |
| Revisão — DOM isolado | 18,3 ms | 8,7 ms | **52,46% menor** | Menos cartões no DOM inicial |
| Painel | 27,2 ms | 32,2 ms | **18,38% maior** | p95 instável; não prometer ganho em produção |
| Painel — mediana | 23,1 ms | 21,4 ms | **7,36% menor** | Menor mediana nesta rodada |

O p95 do Painel alternou entre melhora e piora em execuções anteriores; qualquer otimização posterior exige novas medidas. O principal resultado aprovado desta release é **renderização progressiva da Revisão** com paridade integral.

## Critérios para publicação
1. **Todos os 11 workflows** do commit final concluídos com `success`.
2. Sem diferença de registros, ordenação, filtros ou conteúdo após expandir a Revisão.
3. Sem regressão no Decision Engine, sincronização, autorização ou PWA.
4. Confirmação de que `src/config.js` e `sw.js` estão servindo v275 no domínio público após merge.
5. Banco de produção consultado somente para integridade; **nenhum SQL ou atualização de oportunidades para esta release**.
6. Smoke test autenticado em produção com conta humana não é substituído por testes isolados; registrar separadamente se não foi executado.
