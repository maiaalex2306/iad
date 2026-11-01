# PERF-11E — Homologação técnica da aba "As 8 decisões"

**Base:** PERF-11B/C, PR #36, commit `f58b6f55f9840d74b082dcff78594f1555ef4d2b`.
**Escopo do PR:** somente `src/views.js`, teste diferencial e workflow. Nenhuma alteração em banco, versão pública ou cache PWA.

## Diagnóstico e correção

`blocoDimensoes(op)` invocava `E.lacunas(op)` uma vez por dimensão (8 vezes) e recalculava a mesma prova de nível 3 de cada dimensão.
A versão proposta calcula as lacunas **uma vez por abertura** e reutiliza o resultado nas 8 dimensões; o resultado de `podeComprovar(op,d.id,3)` é reutilizado na montagem dos degraus. Cada nova abertura recalcula tudo a partir do estado atual.

Não há memoização entre usuários, empresas, revisões, abas ou oportunidades. O Decision Engine permanece como única fonte de regras e critérios.

## Evidências verificadas pelo GitHub Actions

- **389** oportunidades sintéticas; HTML gerado **idêntico byte a byte** ao gerado pelo código anterior para as 389.
- Chamadas `E.lacunas(op)`: **3.112 → 389**, redução determinística de **87,5%**.
- Benchmark CPU Node.js com 20 aquecimentos + 200 amostras, usando os módulos reais de Store/Engine e histórico extenso de HEINEKEN/Suzano simulados:
  - Execução A P95: **1,543 ms → 1,103 ms**, melhoria ~28,5%.
  - Execução B P95: **2,114 ms → 1,399 ms**, melhoria ~33,8%.
- **147 testes CJS aprovados, 0 falhas** na execução ampliada do workflow do PERF-11E.

**Importante:** tempos acima medem apenas a geração de HTML em Node.js, NÃO o tempo até a interface estar interativa, o carregamento de rede, o Supabase ou o P95 total do navegador.

## Experimento rejeitado

Foi construído separadamente um experimento PERF-11D que memorizava eventos e stakeholders durante `E.resumo`. Embora a paridade financeira/comercial tenha passado e a HEINEKEN sintética tenha reduzido 18→1 varreduras de eventos, o P95 da carteira completa **piorou** em várias execuções. Por decisão de engenharia, **não integrar PERF-11D**. Usar os testes de desempenho tanto para aceitar quanto para rejeitar alterações.

## Portões ainda abertos

1. Sessão autenticada de navegador de homologação; medir todos os 389 cards reais e as nove abas, com P50/P95, cache quente/frio, tarefas, mudança de empresa e busca.
2. Confirmar migração IndexedDB com anexos reais preexistentes, duas abas simultâneas e offline.
3. Revalidar políticas RLS por papéis e tenants na homologação, inclusive gravações.
4. Só depois dos portões e de avaliação do deploy, preparar `v287` e `sw.js`. Não executar SQL nem alterar produção antes.
