# IaD CRM v286.99 — auditoria de CI e otimização conservadora

Data: 08/11/2026. Base publicada: v286.98, commit `626b8b476ade4bf7e6a3b57b3eaa4c40b0f45b7e`.

## Resultado do diagnóstico

1. GitHub Pages e domínio oficial publicaram `config.js` e `sw.js` v286.98 coerentes.
2. A CI `RI-M23` falhava imediatamente, sem criar jobs, porque o título YAML `name:` continha dois-pontos seguido de espaço sem aspas: `Inteligência de Mercado: subsegmentos`. O novo workflow protege essa sintaxe em teste de contrato.
3. No Radar Comercial, a referência de conta por segmento era buscada com `[...accounts.values()].find(...)` em cada grupo. Isso aloca array, normaliza repetidamente e escala com número de contas × grupos.
4. O PR antigo PERF-42 implementou otimização semelhante, mas sobre base anterior às mudanças RI-46; **não** mesclar esse branch diretamente em produção, pois poderia reverter a paginação e a visualização das novas oportunidades.
5. Banco de produção consultado somente leitura: 407 oportunidades, 483 tarefas, 402 contas, 597 contatos. Espaço total (com índices) de `oportunidades`: 7544 kB; de `tarefas`: 1856 kB. Eventos JSONB: ~293 kB; orientação: ~268 kB; snapshots: ~81 kB; dimensões: ~57 kB.
6. PERF-40 registrou `SELECT *` de 397 oportunidades em ~191,5 ms e seleção só de ID em ~0,96 ms, **consultas diferentes**. Isso fundamenta priorizar sincronização incremental, mas não comprova ganho de 200 vezes no frontend.
7. Não há P50/P95 autenticados com amostras suficientes para declarar redução do tempo real de carregamento.
8. Projeto de IA `iadcrm-homolog`: `assistente` responde 503 `AI_PROVIDER_NOT_READY`, bloqueio anterior e independente do frontend. Não inserir chave no frontend nem alterar service_role.
9. Supabase Security Advisors apontaram 15 funções SECURITY DEFINER executáveis como anon, além de outras notificações. Algumas funções inspecionadas possuem guardas internas de `auth.uid()`/`sou_admin()`, mas isso não homologa o conjunto. **P0: revisão de privilégios e testes anon/autenticado/tenant antes de ampliar acessos.** Nenhuma permissão ou política foi alterada nesta release.

## Modificações v286.99

- Criar índice `segmentRepresentative` apenas em memória a partir das contas **já autorizadas**, após o Map principal ser construído. Preservar a ordem anterior, sobreposição de IDs e segregação por tenant.
- Substituir busca linear por `Map.get()` somente para o cartão de crescimento interno. Não mudar nenhum cálculo de oportunidade, pontuação, fonte, contato ou prioridade.
- Adicionar regressões 36 segmentos, 1400 contas adicionais, fontes privadas e IDs duplicados.
- Corrigir título YAML RI-M23 com aspas, adicionar teste de contrato YAML e comprovar na CI que jobs são efetivamente executados.
- Versionar `src/config.js` e `sw.js` conjuntamente em v286.99.

## Gates de aceite

- Testes do Radar: paridade RI-04, RI-07A, RI-08; preservar pistas recentes e 12 cartões das cinco outras frentes.
- CI RI-M23: **três jobs criados** e concluídos (incluindo canário 401/204). Se não houver jobs, a correção YAML não foi homologada.
- Suites de RLS/CAS/GoTrue, PWA, Manual e Chromium sem regressões.
- Benchmark 5k registros não pode perder desempenho de forma relevante; aferir P50/P95 reais de 30 ou mais amostras em sessão autorizada antes de alegar ganho comercial.
- GitHub Pages sucesso; `config.js` e `sw.js` públicos em v286.99; teste da página de login sem alterações.
- Rollback: commit anterior `626b8b476ade4bf7e6a3b57b3eaa4c40b0f45b7e`. Não apagar dados locais nem o banco.

## Pendências de maior impacto, não incluídas na release

P0: revisar todas as funções SECURITY DEFINER e o modelo de privilégios sem quebrar gatilhos/serviços; homologar IA real em staging; alinhar branch de publicação e branch principal com gates protegidos.

P1: executar PERF-03 sincronização incremental com tokens, tombstones, CAS e fallback integral, medindo P95 autenticado; diferenciar progresso de treinamento por checkbox de atividades realmente registradas, leads qualificados e reuniões confirmadas.

**Observação:** as correções aqui são conservadoras e limitadas ao código público, sem dados privados, DDL, RLS, credenciais ou atividades de vendas.
