# PERF-02 — Decision Engine: índices e cache de fila (v269)
Data: 2026-10-29
Branch: `performance/iad-perf-02`
Base: v268 no GitHub Pages
**Não integrar automaticamente sem CI verde e homologação em navegador autenticado.**

## Gargalo encontrado
- `E.fila` avalia os 243 negócios da carteira;
- `resumo` chamava `tarefasAtrasadas` que filtrava `Store.dados().tarefas` de novo PARA CADA negócio;
- `Store.conta` e `Store.oportunidade` usavam `Array.find` em toda pesquisa;
- A tela Hoje e a varredura automática podiam calcular a mesma fila sucessivamente sem mudanças nos dados.

## Mudanças implantadas
1. `src/store.js`: índice por ID de conta e oportunidade, preservando a primeira ocorrência e a identidade dos objetos; revisão monotônica incrementada em toda chamada de `salvar()` (inclusive `semSincronizar` e sincronização).
2. `src/engine.js`: uma única passagem na lista de tarefas autorizadas do `Store.dados()` constrói o mapa de atrasos para a execução de `fila()`. Os consumidores independentes de `resumo(op)` mantêm comportamento anterior.
3. `src/perf-02.js`: cache EM MEMÓRIA da fila, chaveado por revisão do Store, dia e escopo (id, papel, tenant, filtros). Limpa no logout/ausência de sessão; não grava banco, não usa armazenamento local, não transmite dados. Retorna novas cópias das listas.
4. `src/views.js` e `src/app.js`: a tela Hoje e as duas análises usam o mesmo cálculo seguro por revisão; telas externas permanecem intactas.
5. `index.html`, `src/config.js`, `sw.js`: versão v269 e scripts para PWA.
6. Build de homologação permite `performance/iad-perf-02` com indicador `v269-HOMOLOG` e recusa explicitamente o projeto Supabase de produção.

## Testes e aceite
- CI: `node --test nuvem/testes/perf-02-cache.test.cjs` e `node --test nuvem/testes/perf-02-engine.test.cjs`.
- Cobertura: 243 oportunidades reais em classes e etapas simuladas, tarefa concluída/vencida, alteração de valor, mutação de Store, exclusão/limpeza, troca de filtro/usuário/tenant, mudança de dia, logout e PWA.
- Esperado: resultados iguais da fila vs `E.resumo` fora do índice; sem mudança de IAD, ordem, valor, priorização ou acesso entre tenants.
- Homologação: utilizar apenas usuários sintéticos em projeto Supabase separado; comparar na mesma máquina e mesma base a v268/v269 para mediana e p95, com três ciclos ou mais. Atenção: `IADPerformance` mede o tempo JS, não inclui layout e rede.
- Métricas disponíveis: `IADPerf02.estatisticas()` (hits, misses, invalidações); `IADPerformance.iniciar()` e `IADPerformance.parar()`.
- Nenhuma alegação de percentual de aceleração sem medições reais.

## Não incluído
- Não muda SQL, RLS, login, permissões ou regras do Decision Engine.
- Não implementa transferência incremental de Supabase ou cache persistido entre sessões.
- Não modifica projeção financeira.
- Cache protege arrays superiores, não faz congelamento profundo dos registros (que continuam sendo os objetos oficiais do Store).
- Alterações diretas em `Store.obter()` SEM chamar `salvar()` não são suportadas para cache. Todos os mutadores regulares usam `salvar()`.

## Liberação
1. CI verde e revisão do PR;
2. publicação em ambiente de homologação isolado;
3. comparação matemática com v268, browser e 2 usuários/tenants;
4. backup da branch produção;
5. merge somente depois do aceite e verificação em `www.iadcrm.com.br/src/config.js` e `sw.js`.
