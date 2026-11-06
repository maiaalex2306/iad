# IaD CRM — Auditoria de velocidade e plano de desempenho
Data: 06/11/2026. Base auditada: **v286.63**; candidata de inicialização: **v286.64 / PERF-35**.

## Escopo e método
Leitura do código GitHub, métricas cumulativas `pg_stat_statements`, inspeção `EXPLAIN ANALYZE` somente leitura, e benchmark sintético em Chromium isolado. Não houve teste com conta autenticada do cliente. Métricas de banco são **históricas**, não latências medidas na mesma execução; não deduzir ganho real a partir do plano SQL.

## Conclusões sustentadas
| Fato | Evidência | Implicação |
|---|---|---|
| HTML carrega 37 scripts clássicos de forma bloqueante | `index.html` v286.63 | Atributo `defer` preserva dependências, mas mede ganho pequeno sob teste |
| Código inicial é extenso | `src/views.js` ~691 KB, `src/app.js` ~581 KB, `src/nuvem.js` ~120 KB, `src/store.js` ~101 KB, sem considerar dependências | Priorizar divisão por rota e avaliação de parse/execução; não reescrever módulos sem paridade |
| Cold boot sob latência de 45 ms/arquivo | Sem `defer`: mediana 369 ms; com `defer`: 363 ms; ganho **6 ms (1,63%)**; 4 repetições por configuração, Chromium headless | Útil, mas **não é** solução da lentidão geral |
| Cockpit sintético no CI | 32 aberturas em 389 oportunidades: P95 clique→2 frames ~33,5 ms; etapa HTML P95 0,9 ms, etapa DOM P95 1,7 ms | Não reproduz ~1,3 s informados no diagnóstico local anterior; abrir investigação de condições reais |
| Postgres contém 392 contas, 582 contatos, 397 oportunidades, 473 tarefas | SQL contagens produção 06/11 | Poucas linhas, mas payloads podem ser grandes |
| Tamanho interno de 4 tabelas | `pg_column_size` agregado: contas 247.564 B; contatos 163.919 B; oportunidades 1.181.368 B; tarefas 446.984 B; **2.039.835 B** no formato interno | Não confundir com bytes de rede JSON nem dados de tenant específico |
| Leitura direta de oportunidades | `EXPLAIN ANALYZE SELECT * ... ORDER BY id LIMIT 500`: ~0,96 ms no executor Postgres | Scan de 397 linhas isoladamente não é a explicação do atraso ponta a ponta |
| Histórico PostgREST, consulta completa oportunidades | `pg_stat_statements`: exemplos de 114 chamadas, média ~503,4 ms; outras formas de leitura e escrita com múltiplas chamadas | Medir serialização, RLS, rede e paginação; estatística cumulativa **não equivale ao tempo atual da UI** |
| Sincronização protegida já existe | `nuvem.js`: cursor delta, cache de marcas, CAS e validação de ACK | Nunca substituir por sincronização ingênua ou desabilitar controles só para acelerar |
| Download completo em 10 tabelas | `puxarCompleto` usa `Promise.all`, 500 por página e página vazia para encerrar com segurança | Investigar eliminação de requisições finais com contagem exata validada, sem confiar em página curta se PostgREST limitar lote |
| PERF-04 já possui otimizações | Cache do pipeline, LRU do cockpit, limites de cards, invalidação por revisão e recorte | Evitar retrabalho; comparar perfil real e código antes de novos caches |

## Decisões de arquitetura, por prioridade
| Ordem | Ação | Critério observável | Segurança |
|---|---|---|---|
| P0 | RUM opt-in da sessão real: 30+ amostras por Hoje, Painel, Pipeline, Tarefas, Cockpit, Contas, Cadastros e tarefas nas abas | P50/P95 das fases HTML, DOM, paint aproximado, long tasks e rede por classe (sem URLs) | Métricas locais sem IDs/nomes/PII, isoladas por login |
| P0 | Medir inicialização e rede por tipo: autenticação, `puxar` completa/delta, CAS, transferência, render | Separar duração de chamadas do trabalho na main thread; comparar sessões com/sem cache | Nunca afrouxar RLS, ACK CAS ou proteção vazio-sobre-cheio |
| P1 | Carregamento por rota de `app.js`/`views.js` e serviços de baixo uso | Menos JS analisado/baixado no login; verificar tempo de startup e navegação de todas as rotas | Preservar a ordem de dependências e links de convite/recuperação |
| P1 | Snapshot inicial por envelope versionado com cursor/versão e paginação segura | Quantidade de requisições, bytes e latência P95 por tamanho de carteira | Somente após E2E de 2 usuários, 2 tenants e mudanças concorrentes |
| P1 | Invalidar DOM somente no bloco afetado, manter virtualização nas listas | Reduzir fase HTML real para abaixo de orçamento; paridade DOM e acessibilidade | Sem estados obsoletos, sem trocar visibilidade por velocidade |
| P1 | Otimização SQL/PostgREST após dados de consulta real | Índices somente quando EXPLAIN mostra uso; evitar indexar excessivamente | RLS permanece no servidor |
| P2 | Pesquisas IA: jobs assíncronos idempotentes, caching do mesmo alvo/filtro, coalescência, orçamento | Respostas sem bloquear navegação, tempo por provedor, consumo por execução | Não reutilizar achados sem recorte de tenant e revisão de fonte |

## Metas de engenharia (metas, não resultados já medidos)
- INP: <= 200 ms no p75 dos usuários, desktop e celular separadamente (métrica de experiência web; não a equiparar a dois frames).
- Navegação quente: objetivo inicial P95 <= 200 ms, com campo real e limiares por tela calibrados após captura.
- Primeiro login, sincronização e retomada após sono: estabelecer baseline medido antes de prometer percentual de melhora.
- Nenhum aumento de 4xx/5xx, no número de upserts redundantes ou nas divergências de tenant/CAS.
- Teste regressivo em 400, 2.000 e 10.000 oportunidades, incluindo registros com longos eventos históricos; atenção para capacidade do aparelho.

## PERF-35 — Evidência e limite
37 scripts clássicos mudam apenas para `defer` (sem `async`, sem alterar ordem). Script inline de recuperação permanece síncrono. Benchmark `scripts/perf35-boot-browser.cjs` executa baseline e candidato no mesmo Chromium com latência artificial de 45 ms por script, sem terceiros e sem service worker. A mediana de 4 execuções por cenário melhorou 369→363 ms, ou 1,63%. Não apresentar como economia garantida no domínio, nem como correção do cockpit.
