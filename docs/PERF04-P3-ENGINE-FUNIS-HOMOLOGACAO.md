# IaD CRM — PERF-04 P3 | Decision Engine e funis comerciais

**Data:** 30/10/2026  
**Baseline imutável:** v276 publicada, commit `33f13f9a27d9111dd0c47be9ac1c28fc9b79ac2b`  
**PR:** https://github.com/maiaalex2306/iad/pull/17  
**Situação:** candidata isolada, sem SQL, merge ou publicação nesta etapa.

## Diagnóstico confirmado

No cálculo `IADFunis.tudo()`, cada oportunidade tinha seu IAD recalculado até três vezes nas agregações (etapa, campanha e SDR), e os negócios abertos podiam ser classificados duas vezes (etapa e contagem de falsos avançados).

Na base sintética de 389 oportunidades:
- `E.iad(op)`: **1.167 → 389 chamadas** (redução de 66,7%).
- `E.classificar(op)`: **778 → 389 chamadas** (redução de 50,0%).
- A primeira comparação Chromium da v276 contra a candidata resultou em p95 de funis **2,9 → 1,8 ms**, redução de 37,93%; mediana **1,9 → 1,5 ms**, redução de 21,05%.
- No mesmo benchmark a mediana de `E.carteira` variou de **4,0 → 3,8 ms**, redução de 5,0%; p95 **8,3 → 8,1 ms**, redução de 2,41%. Esses ganhos não devem ser extrapolados para rede, renderização ou login.

O código da carteira também fazia várias passagens para sumarizar grupo, trava, idade de evidência, prontidão e riscos, e `E.resumo` chamava `evidenceAge` duas vezes no mesmo registro.

## Implementação

1. `src/funis.js`: duas `WeakMap` criadas **somente dentro de `tudo()`**, usadas para reutilizar resultados puros de `E.iad` e classificação sem mudar a fórmula. `funilDaEtapa()` e `agrupar()` continuam aceitando chamadas legadas sem memoização.
2. `src/engine.js`: `resumo()` calcula a idade da evidência uma vez e reutiliza na faixa; `carteira()` mantém a ordem original dos resumos e acumula suas somas e agrupamentos em uma única passagem. Preserva todos os campos e valores.
3. `scripts/perf04-baseline-browser.cjs`: carrega engine/funis da v276 e da candidata no **mesmo Chromium**, com o mesmo Store e sem comunicação externa. Compara resultados completos, inclusive listas e agregados, antes/depois, nas bases de 389, 1.000, 5.000 e 10.000 oportunidades.
4. Abrange contas isoladas em duas empresas, filtros de situação/segmento, índice explícito de tarefas vencidas, base vazia e registros sintéticos com decisões, evidências, ganhos, perdas e nutrição.
5. Benchmark alternado de `F.tudo()` e `E.carteira()` com 22 amostras aquecidas por variante, medindo p50/p95, e contadores de chamadas para validar a redução. O pipeline falha se houver qualquer divergência JSON ou regressão de mediana superior a 20%.

## Gates obrigatórios

- **11/11 workflows do commit final** com conclusão `success`, incluindo teste Chromium, paridade 243/1k/5k, GoTrue autenticado local e CAS/Sync/Offline/RLS.
- Comparação diferencial de **todos os resultados** do funil e do Decision Engine com a v276 publicada (sem tolerância de diferença em pontuação ou classificação).
- Perfis isolados por empresa/responsável e sem cache compartilhado entre sessões.
- Nenhum SQL de produção, alteração de CAS, credenciais ou troca de versão/cache PWA nesta PR de homologação.
- Publicação eventual em release v277 exige PR revisado, atualização conjunta de `src/config.js` + `sw.js`, todos os testes refeitos e smoke test público com contagem íntegra de oportunidades.

## Limitações das medições

Dados sintéticos, Chromium headless e recursos locais; não demonstram economia de latência de rede, métricas de Core Web Vitals nem comportamento com usuários humanos autenticados em produção. Nenhum benchmark autoriza alteração de políticas RLS ou de semântica dos negócios.

**Artefato:** `perf04-p3-engine-funis.json` anexado à execução do GitHub Actions da PERF-04.
