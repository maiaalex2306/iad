# PERF-03D / v273 — Auditoria e plano de engenharia

Data: 2026-10-29. Base: produção v272 commit `7ce86dae3b05bdf74c74ea2722f4b89ca3443af3`.
Estado: **preparação, não implementada e não publicada**.

## Evidências verificadas
- Usuário confirmou cinco testes funcionais da v272 aprovados.
- Supabase IDA `drhonmdffhnwamwzynrs`: consulta somente leitura mostrou **389** oportunidades, **110** eventos no journal de tenant e **0** eventos no journal privado no instante da auditoria. Os zero eventos privados **não provam defeito**: dependem de alterações posteriores à instalação.
- `src/nuvem.js`: fluxo offline-first, envio por `upsert`; sincronização incremental já implementada em v272. `src/store.js` usa armazenamento local; `src/sincronia.js` coordena envio.
- Advisor de performance Supabase apontou **11** chaves estrangeiras sem índice de suporte, inclusive tabelas de sincronização; analisar cardinalidade e plano antes de indexar.
- Testes de CI v272 aprovados. Isso não certifica concorrência de gravação, recuperação de cursor expirado nem benchmark autenticado na produção.

## P0 — Consistência e concorrência
1. **CAS no servidor**: adicionar revisão imutável por linha comercial e RPC restrita de escrita condicional por tenant, usuário e revisão esperada. `UPDATE ... WHERE revisao=esperada RETURNING ...`; zero linhas = conflito explícito, jamais fallback silencioso para `upsert`. Não expor funções privilegiadas a `anon`; auditar permissões e RLS.
2. **Fila de saída durável**: guardar operações pendentes com ID de idempotência, base de revisão e identidade de usuário/tenant. Confirmar remoção da fila apenas após resposta válida do servidor. Repetição após falha de rede não pode duplicar ações.
3. **Resolução de conflito**: no retorno 409, apresentar ambas as versões, campos divergentes e ação explícita; preservar edição local. Evitar "último a gravar vence" indiscriminado.
4. **Exclusões**: soft-delete/tombstone versionado com retenção e expiração monitoradas; excluir eventos apenas depois de janela máxima de desconexão pactuada; rebootstrap para cursor expirado.
5. **Isolamento**: validação de sessão, tenant e dono no SQL; controle de sessão anterior e ACL de operações; não vazar IDs, contagens ou versões privadas.

## P1 — Carregamento realmente progressivo
1. Separar projeção leve de `oportunidades` da ficha pesada, sinais, tarefas e notas.
2. Consulta paginada com ordenação estável e cursor composto; server-side filter com RLS, contagem definitiva apenas com consulta autorizada completa.
3. Abrir Pipeline com primeira página útil, mostrar carregamento e atualizar filtros com contrato explícito.
4. Lazy load do Cockpit; pré-busca cancelável; invalidação por tenant e revisão.
5. Reconciliação de totais e hashes de escopo por tenant/dono; métricas p50/p95 de primeira tela, troca de aba, bytes, erros e conflitos.

## Arquivos-alvo a analisar e modificar
- `src/nuvem.js`: eliminar `upsert` não condicional nas atualizações; compatibilizar deltas, cursores, snapshots paginados e tombstones.
- `src/sincronia.js`: fila idempotente com ACK, erros 409, retomada offline e proteção de troca de identidade.
- `src/store.js`: revisões por entidade, conflitos, integridade e projeções sem publicação de dados parciais.
- `src/app.js` e `src/views.js`: paginação/lazy e indicadores de carregamento.
- `nuvem/perf-03d-cas.sql` (novo, só após revisão): RPC/constraints, índices seguros, RLS e tombstones.
- `nuvem/testes/perf-03d.test.cjs` e testes PostgreSQL/GoTrue/Chromium (novos): concorrência, RLS e falhas reais.
- `src/config.js` e `sw.js`: ajustar para v273 **somente quando** a implementação e os testes estiverem aprovados.

## Critérios de aceite (bloqueadores)
- Mesma oportunidade modificada simultaneamente por dois usuários: um grava, outro recebe conflito; nenhum dado se perde.
- Retentativa da mesma operação: efeito exatamente uma vez, mesmo com timeout após commit.
- Exclusão offline e reconexão: sem ressurreição.
- 2+ tenants, 5 usuários, 389 / 1.000 / 5.000 / 10.000 oportunidades: isolamento por usuário, dono e tenant.
- Sessão trocada e token expirado: nenhuma leitura de cache ou escrita cruzada.
- Comparar latência p50/p95 e bytes v272/v273 em navegador autenticado; registrar números reais, não estimados.
- SQL homologado em projeto isolado com testes RLS antes de considerar produção; backup/restauração verificados para migração de risco.

## Limites desta preparação
Nenhum código funcional v273 foi escrito ou executado; nenhuma migração v273 foi aplicada. O PR deve permanecer **draft** até os critérios acima serem cumpridos. Não alterar produção automaticamente.
