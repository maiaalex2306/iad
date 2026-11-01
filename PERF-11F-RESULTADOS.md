# PERF-11F — Homologação com Chromium, baseline v286 vs candidata v287

Status: **homologação de renderização isolada APROVADA; homologação autenticada de produção PENDENTE**.

## Ambiente e método

- Repositório `maiaalex2306/iad`; baseline v286: commit `a844883082340fef513dac53f984d4143b88cc27`.
- Candidata: PR #34 → PR #36 → PR #37 → PERF-11F.
- Chromium Headless real (Playwright 1.56.1) no GitHub Actions Ubuntu, Node 22.
- Código do CRM carregado diretamente do Git para cada versão, incluindo Store, Auth, Engine, Pipeline e Views, CSS real. Harness substitui **somente boot do app e acesso à nuvem**. Os dados são **100% sintéticos**.
- 389 oportunidades, duas contas de teste complexas (HEINEKEN 131 eventos, 18 snapshots, 15 stakeholders; Suzano 130 eventos, 26 snapshots, 11 stakeholders), duas empresas e 500 tarefas.
- Em ambas as ordens (`baseline-first` e `candidate-first`): 5 aquecimentos + 30 amostras de Pipeline completo, busca seletiva e cockpit, medidos por `performance.now()` imediatamente após a geração e inserção do HTML no DOM; nove abas, 15 amostras por aba.
- Separada a métrica de *trabalho JS+DOM* da métrica de *dois requestAnimationFrame*. O tempo até dois frames é dominado pelo ritmo de atualização e não equivale à latência de rede.
- SHA-256 de `innerHTML` verificado como idêntico entre baseline e candidata para **Pipeline, resultado da pesquisa, cockpit HEINEKEN, cockpit Suzano e todas as nove abas** (13 contextos). Isso comprova paridade exata do HTML para esses dados sintéticos, não garante paridade universal de dados reais.

## Resultados de P95 — trabalho JavaScript + inserção de HTML no DOM

| Cenário | Baseline v286 (ms) | Candidata (ms) | Redução |
|---|---:|---:|---:|
| Pipeline completo, v286 primeiro | 30,7 | 21,4 | **30,3%** |
| Pipeline completo, candidata primeiro | 29,3 | 27,8 | **5,1%** |
| Pesquisa HEINEKEN, v286 primeiro | 21,1 | 2,3 | **89,1%** |
| Pesquisa HEINEKEN, candidata primeiro | 22,5 | 1,7 | **92,4%** |
| Cockpit HEINEKEN, v286 primeiro | 5,1 | 2,0 | **60,8%** |
| Cockpit HEINEKEN, candidata primeiro | 4,9 | 1,8 | **63,3%** |

**Interpretação:** os ganhos mais confiáveis nesta amostra são os da pesquisa seletiva (**89–92%**) e da montagem do cockpit (**61–63%**). O Pipeline completo melhorou nos dois ordenamentos, mas com variabilidade relevante (**5–30%**), então não é apropriado divulgar um percentual único como garantido.

Os tempos P95 até dois frames variaram de ~33ms a ~53ms; a melhora dessa métrica foi pequena/inconsistente (0,4–12,5% no Pipeline). Não confundir tempo de *work* com tempo total até a UI estar interativa.

## Testes de integridade

- **147/147 testes CJS aprovados em cada uma das duas ordens de execução** (0 falhas).
- Todos os 13 SHA-256 de HTML iguais entre baseline e candidata.
- Pesquisa por HEINEKEN não retornou Suzano.
- Abertura de ambas as oportunidades sintéticas e das nove abas realizada.
- A versão pública e o cache PWA continuam v286, verificados pela suíte e previamente nas URLs públicas.
- Testes GoTrue/CAS autenticados já aprovados na série de PRs anterior (#36), mas **não substituem** login no navegador do CRM nem todos os testes E2E.

## Limitações e portões ainda abertos

1. Navegador autenticado no IaD CRM para medir as 389 oportunidades **reais**, especialmente HEINEKEN e Suzano; ainda não existe sessão salva no perfil de homologação. Não solicitar senha pelo chat.
2. Comparar P50/P95 end-to-end (click→interactive), latência Supabase/REST, sincronização, carregamento inicial e cache frio/quente com sessão e rede reais, em ambiente controlado.
3. Testar autenticação expirada, múltiplas empresas, acesso de vendedor/gestor/admin, tarefas e gravações, com permissão e dados isolados.
4. Validar upgrade do IndexedDB v1→v2 com anexos preexistentes reais e múltiplas abas (já há simulação automatizada aprovada).
5. Planejar rollback/validação do deploy para v287. **Nenhum SQL, exclusão de dados, merge ou publicação feitos por este pacote.**
6. O experimento PERF-11D que piorou P95 da carteira foi isolado e **não foi incluído**.

## Conclusão

A PERF-11F adiciona um teste de navegador repetível e um critério objetivo de paridade visual de HTML, com relatórios JSON como artefatos de CI. Os ganhos de trabalho JS/DOM foram comprovados no **ambiente sintético** em dois ordenamentos independentes. A liberação para produção ainda depende do portão autenticado com dados reais, e os PRs seguem como draft.
