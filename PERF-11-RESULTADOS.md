# PERF-11 — Homologação parcial, sem publicação

**Origem:** v286 (commit a844883082340fef513dac53f984d4143b88cc27). Branch de trabalho: `performance/perf-11-pipeline-indices-v287-candidate`.

## Implementações

- Pré-filtro antes do cálculo de `E.resumo` quando a consulta restringe a carteira por campos de cadastro.
- Cache parcial exclusivamente em memória, com chave por revisão, dia e escopo de acesso; o caminho P5e opcional conserva o algoritmo integral.
- Busca indexada dos metadados IndexedDB, upgrade v1→v2 não destrutivo, anexos preservados.
- Sincronização: mapa de oportunidade por ID na reconciliação CAS, em lugar de varredura linear repetida.
- **RLS somente no projeto de homologação Supabase**: 4 políticas com initplan; SQL com rollback explícito. Nenhuma tabela ou dado de produção alterado.

## Evidências

- GitHub Actions: testes sintáticos, regressões, comparação de filtros, casos sintéticos de 389 oportunidades, cache, anexos, CAS e cockpit.
- Supabase homolog (`bvlfzeblpewlqhssprpv`), consulta autenticada `SELECT COUNT(*) FROM oportunidades` via `EXPLAIN ANALYZE` sobre 243 oportunidades: **37,078 ms → 0,489 ms** de execução SQL (**-98,7%**). Comparação de duas execuções individuais, não é medição P95 nem prova de UX; sujeita a cache/carga.
- Alertas do advisor RLS `auth_rls_initplan`: **10 → 6** após otimizar as quatro políticas; avisos remanescentes fora do escopo.

## Portões pendentes (não alegar homologação completa)

1. Ensaiar matriz RLS com 3 papéis (admin, gestor, usuario), exclusões de outras empresas e operações CRUD em perfis autenticados reais de homologação.
2. Abrir todos os cards, inclusive registros extensos de HEINEKEN e Suzano, em navegador autenticado com dados reais e aferir P50/P95/long tasks; dados reais de produção não devem ser copiados para homolog sem autorização.
3. Validar concorrência multiempresa, migração IndexedDB de abas antigas, CAS e sincronização offline em navegadores de referência.
4. Corrigir a origem dos tipos/fontes duplicados em uma fase separada, preservando IDs referenciados, com backup lógico verificado.
5. Só após aprovação, revisar SQL de produção, versão/cache PWA e publicação.

**Status:** CI técnico inicial aprovado; RLS aplicada somente em homologação; release de produção não autorizada por esta auditoria.
