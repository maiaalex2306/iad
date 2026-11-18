# PERF-40 — Auditoria da latência real e instrumentação segura

## Escopo
Alterações instrumentais, opt-in e em branch independente da RI-08.
**Não altera** upload diário, download integral, RLS, CAS, checkpoint,
paginação, mapa de marcas, cache, dados, permissões, endpoints ou fluxo offline.
Não publicar sem validação autenticada e testes comparativos.

## Evidências read-only obtidas em 07/11/2026
Produção Supabase `IDA`, projeto `drhonmdffhnwamwzynrs`:
- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` de `oportunidades` com `ORDER BY id LIMIT 500`: 397 linhas, execução **191,464 ms**, index scan na PK, 399 blocos em cache.
- Mesma consulta para **somente `id`**: 397 linhas, **0,961 ms**, index-only scan. Essa variante NÃO substitui a carteira integral: o CRM depende dos campos restantes.
- `tarefas` `SELECT * ORDER BY id LIMIT 500`: 473 linhas, **92,753 ms**, index scan na PK, 212 blocos em cache.
- Colunas JSONB da tabela oportunidades: `eventos` ~287 KiB, `orientacao` ~267,5 KiB, `snapshots` ~78,8 KiB e `dims` ~55 KiB de armazenamento lógico agregado. Volume de payload e custo de desserialização/TOAST merecem análise. Não há evidência de índice ausente na PK.
- Supabase Advisors de produção continuam reportando 11 FKs sem índice de cobertura. São hipóteses de ajuste, **não** justificativa automática para DDL ou mudança de política RLS.
- São observações da conexão administrativa do diagnóstico; **não são o P95 de sessão autenticada** e não executam as políticas RLS de gestor/vendedor.

## Medições introduzidas
As métricas `perf40.sync.table.{contas,contatos,oportunidades,tarefas,produtos,segmentos,tipos_tarefa,fontes,sinais,notas}`
cronometram cada busca integral, incluindo todas as páginas e conversão.
`perf40.sync.full.download` cronometra o download conjunto, 
`perf40.sync.full.persist` cronometra somente a gravação local,
`perf40.sync.full.marks` cobre o cálculo/gravação de marcas pós-snapshot.
Leituras paralelas se sobrepõem: **não somar durações entre tabelas** para obter o tempo total.

As medidas são geradas somente com `IADPerformance.iniciar()`; o relatório
e o JSON usam uma allowlist de nomes fixos e armazenam apenas durações, não
IDs, URLs, dados comerciais, payloads ou credenciais. A coleta não é transmitida.
Progresso do download e integridade não foram alterados.

## Critérios de homologação
1. CI com testes de snapshot, erro de página, CAS pendente e modo opt-out.
2. Com consentimento, medir mínimo 30 amostras em cada rota, comparando cold/warm,
   versão e rede. Extração P50/P95 pelo painel de desempenho.
3. Medir métricas por tabela e relacionar ao tempo total `perf23.sync.puxar`;
   investigar `oportunidades` e `tarefas` primeiro.
4. Executar E2E de dois tenants e gestor/vendedor/admin sintéticos com Supabase
   de homologação, sem dados privados de produção.
5. Somente mudar `select=*`, checkpoint, marcas ou índices depois de provas
   de paridade, exclusões, RLS, CAS e operação offline; manter fallback integral.
6. Publicação coordenada de `src/config.js` + `sw.js`, com rollback documentado.

### Bloqueio separado: RI-08
O PR #181 possui CI aprovada, mas falta a execução real de LLM no projeto de
homologação (HTTP 503 reportado para `assistente` por ausência dos segredos de provedor).
Isso não impede o desenvolvimento de telemetria, mas impede a homologação integral da RI-08.

**Status:** candidato de diagnóstico; não homologação ou implantação de produção.
