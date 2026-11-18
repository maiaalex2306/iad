# PERF-01 — Tela Hoje: instrumentação e atualização localizada

## Estado
Branch de trabalho: `performance/iad-perf-01`; PR em revisão.
Base: `claude/decisoes-estagios-vendas-eckjo0` (produção v267).
Nenhum banco, política RLS, cadastro ou dado comercial é alterado.

## Diagnóstico confirmado na base
- `V.hoje()` chamava `E.fila()` antes de paginar (243 negócios na carteira observada).
- Cada uma das até 60 respostas da varredura automática executava
  `repintarConteudo('#/hoje', V.hoje)`, recalculando a fila inteira.
- O botão "Análise das pendências e ações" também redesenhava Hoje a cada
  progresso de uma leitura.
- O gargalo identificado é a combinação de repintura integral e cálculo
  redundante; não foram medidos tempos reais de CPU/rede da conta do cliente.

## Alterações
1. `src/perf-hoje.js`: atualização SOMENTE da orientação do cartão visível,
   quando o item continua na carteira e a sessão continua autenticada.
   Negócios fora da página corrente são desenhados normalmente ao navegar.
   Progresso do botão manual passa a atualizar contador e barra sem redesenhar.
2. `src/views.js`: adiciona pontos explícitos de atualização da orientação
   por ID, preserva o HTML existente e os cálculos/comportamento do IAD.
   Instrumenta a execução da fila e dos 10 cartões da página.
3. `src/ia.js`: callback compatível com os existentes passa também o item
   processado (argumento opcional terceiro).
4. `src/app.js`: elimina repinturas integrais da tela Hoje durante a varredura
   automática e progresso do botão; preserva renderização final da análise.
   Instrumenta geração do HTML de cada rota quando o usuário habilita métricas.
5. `src/performance.js`: métricas em memória, sem transmissão ao servidor,
   sem dados pessoais, desligadas por padrão.
6. `index.html`, `sw.js`, `src/config.js`: scripts carregados e PWA v268.

## Medição real no navegador (ambiente de homologação)
1. Abrir a versão homologada no Chrome e entrar com conta de TESTE.
2. F12 → Console. Digitar `IADPerformance.limpar(); IADPerformance.iniciar();`.
3. Abrir e navegar na tela Hoje, trocar páginas e filtros por 60 segundos.
4. Digitar `IADPerformance.parar()`. Apresentará uma tabela com
   `hoje.fila`, `hoje.cartoes`, `tela.#/hoje` etc.
5. Repetir com versão anterior e mesma carteira/dia/máquina/rede.
6. Complementar com Performance profiler do Chrome e Network:
   as métricas aqui NÃO captam tempo do layout/paint completo nem transferência
   de dados.
7. Não compartilhar HAR com tokens nem dados identificáveis.

## Critérios de aceite
- Antes/depois: mesmos IAD, prioridades, compromissos, tarefas e valores.
- Até 60 respostas de IA: **zero** chamadas extras de `E.fila()` pelo
  callback de orientação e, no máximo, um elemento de cartão atualizado
  por resposta quando visível.
- Navegação, filtros, troca de empresa e usuário não mostram conteúdo
  de sessão anterior.
- Barra de progresso funciona sem repintura integral por leitura.
- Sincronização com Supabase, reentrada e permissões intactas.
- Testes automatizados verdes + homologação real em navegador.
- Meta de engenharia: reduzir o tempo gasto com trabalho redundante;
  não declarar percentual de ganho sem baseline medido e comparação real.

## Limites da entrega
A chamada inicial `E.fila()` continua avaliando a carteira inteira.
`E.resumo()` e `Store.conta()` ainda têm trabalho duplicado; cache,
índices e sincronização incremental ficam para PERF-02/03, com regressão
de dados e versão antes de mudanças estruturais.

## Reversão
A alteração é frontend e reversível por revert do PR; como não muda
o esquema SQL nem o Supabase, rollback não exige migração de dados.
