# PERF-11G — Observabilidade local de P95, privacidade e liberação

**Relação:** PR #39 (PERF-11F) → PERF-11G. Desenvolvimento isolado da produção, que continua em v286.

## Diagnóstico

O CRM já possuía `IADPerformance` para medições locais, mas exigia ações manuais no console e não classificava P95 ou long tasks. As métricas usam nomes técnicos; algumas chamadas concatenam a rota e poderiam trazer identificadores se a aplicação passasse um nome dinâmico. Uma coleta sem normalização poderia tornar os exports difíceis de auditar e ainda vazar o nome de um cliente.

## Alterações

1. Coleta **desligada por padrão**. Somente `IADPerformance.iniciar()` ativa medição, e `IADPerformance.parar()` desliga e desconecta o observador.
2. `PerformanceObserver` detecta long tasks do navegador quando suportado, registrando **exclusivamente a duração**. URL, nomes, IDs, recursos e atribuições de performance são descartados.
3. Normalização explícita de métricas: rotas de oportunidade são agrupadas; detalhes específicos são agrupados; nomes desconhecidos recebem marcador técnico `metrica.outra`. Sem chaves dinâmicas de cliente nos relatórios.
4. Buffer máximo de **100 durações por métrica**, e conjunto finito de chaves de medição. Contagens agregadas e percentis continuam disponíveis, sem armazenar conteúdo comercial.
5. `IADPerformance.avaliar()` retorna `amostra-insuficiente`, `dentro-do-limite` ou `acima-do-limite`, exclusivamente para limites de triagem, com pelo menos **20 amostras** e P95 medido das últimas 100.
6. `exportarJSON()` mantém o contrato `iad-perf-10-p7` (compatibilidade retroativa), acrescentando `diagnostico`. **Nenhuma chamada de rede, envio automático ou alteração de banco.**

### Limites iniciais de triagem (não SLO homologado em produção)
- Gerar cockpit: P95 <= 250 ms
- Inserir HTML do cockpit: P95 <= 120 ms
- Gerar Pipeline: P95 <= 250 ms
- Gerar HTML de aba: P95 <= 120 ms
- Atualizar DOM de aba: P95 <= 120 ms
- Dois frames do cockpit: P95 <= 300 ms
- Primeiro frame após aba: P95 <= 250 ms
- Long task do navegador: P95 <= 200 ms

Os limites permitem localizar problemas; não representam provas de responsividade real nem consideram automaticamente latência de rede.

## Como operar após implantação e com autorização de teste
- Ativar no console do navegador: `IADPerformance.iniciar()`
- Navegar no Pipeline, abrir cards, alternar abas, executar pesquisa
- Consultar percentis: `IADPerformance.relatorio()`
- Consultar classificação: `IADPerformance.avaliar()`
- Exportar relatório local: `IADPerformance.exportarJSON()`
- Desligar: `IADPerformance.parar()`

Nunca compartilhar dados confidenciais ou credenciais em logs. O relatório contém somente chaves técnicas, contagens e durações agregadas.

## Portões de aceite

1. Testes dedicados: desativação padrão, início/parada idempotentes, anonimização, limites com no mínimo 20 amostras, 100 amostras por indicador, rejeição de durações inválidas, compatibilidade P7.
2. Suíte CJS integral verde com permissões/funcionalidade preservadas.
3. Chromium v286 vs candidata, nas duas ordens, com os mesmos 13 SHA-256 de HTML, e teste de ativação do monitor somente **após as medições** para não contaminar o benchmark.
4. Garantia de que `src/config.js` e `sw.js` continuam v286. Nenhum SQL, merge ou deploy.
5. Homologação autenticada com dados reais **permanece necessária** antes da publicação v287: HEINEKEN/Suzano, 389 negócios, permissões, anexos reais IndexedDB, rede, sincronização e P95 end-to-end.

**PERF-11D:** experimento que piorou P95 ficou fora do pacote.
