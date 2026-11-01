# PERF-11B — relatório de implementação e homologação técnica

**Repositório:** `maiaalex2306/iad` · **base:** PERF-11A, PR #34 · **PR:** #36 · **produção:** v286 (confirmada por `src/config.js` e `sw.js`).

## Diagnóstico real — Supabase de produção (consultas somente leitura)

| Indicador | Resultado |
|---|---:|
| Oportunidades | 389 |
| Tipos de tarefa | 813 |
| Repetições de tipos por tenant/nome normalizado | 793 |
| Fontes | 160 |
| Repetições de fontes por tenant/nome normalizado | 128 |
| Fonte em branco (`fonte_id = ''`) | 5 |
| Fonte não vazia apontando para registro inexistente | **0** |
| Fonte não vazia apontando para outro tenant | **0** |

**Retificação:** os cinco `fonte_id` vazios não são referências órfãs. Não há base para atribuir qualquer origem a essas oportunidades. Nenhuma atualização foi aplicada à produção.

## Defeito reproduzido e corrigido no código

O teste diferencial executou o bootstrap **duas vezes** com a mesma empresa:
- Na v286, os IDs do catálogo padrão são aleatórios e mudam após reiniciar a migração.
- Na PERF-11B, os IDs são estáveis por **empresa + nome normalizado**; o segundo bootstrap obtém os mesmos IDs.
- Fontes homônimas de empresas diferentes não compartilham a mesma referência.
- Fontes legadas sem tenant só são adotadas automaticamente quando a origem do lote é inequivocamente monoempresa.
- IDs legados são preservados; nenhuma exclusão, consolidação ou reatribuição foi feita.

A prevenção não elimina os duplicados já gravados. A reconciliação histórica permanece uma operação independente, exigindo mapeamento de dependências e validação de integridade.

## Benchmark CPU do Decision Engine real, sobre 389 oportunidades sintéticas

Microbenchmark Node.js com **5 aquecimentos + 30 medições** de cada cenário; perfis sintéticos extensos para HEINEKEN e Suzano.

| Métrica | Cálculo integral (389 oportunidades) | Pesquisa seletiva (2 oportunidades) |
|---|---:|---:|
| Quantidade de `E.resumo` | 389 | 2 |
| P50 | 20,60 ms | 1,37 ms |
| P95 | 34,29 ms | 3,51 ms |

**Resultado:** redução aproximada de 89,8% no P95 **do processamento isolado**. Não representa o tempo de carregamento de produção ou o desempenho real da UI. Os dois resumos selecionados foram comparados integralmente e permaneceram idênticos aos correspondentes do cálculo completo.

## Testes e segurança
- 132 testes CJS aprovados, 0 falhas, incluindo paridade exata do Decision Engine, idempotência, teste diferencial da v286, isolamento multiempresa, cache, anexos e regressões preexistentes.
- O teste autenticado GoTrue/CAS da PERF-11A foi aprovado e é requisito para este PR.
- SQL de produção: **nenhum executado**. Dados e permissões de produção preservados.

## Portões não concluídos
- Teste de navegação **autenticada** sobre HEINEKEN, Suzano e as 389 oportunidades reais, incluindo filtros, abas, gravação, offline e cache PWA.
- Testar a transição IndexedDB v1→v2 com anexos reais preexistentes.
- Regressão multiempresa completa da inicialização e sincronização dos catálogos no navegador conectado.
- Planejar, simular, validar e autorizar a consolidação dos 793/128 duplicados atuais, se o retorno de performance justificar; sem exclusões automáticas.
- Só depois dessas etapas, qualificar a v287 para publicação.

**Status:** implementação concluída e CI automatizado aprovado; **homologação de experiência autenticada e publicação ainda pendentes**.
