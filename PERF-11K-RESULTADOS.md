# PERF-11K — Homologação de volume e performance

Data: 01/11/2026. Banco modificado: **somente iadcrm-homolog**. Produção: v286 sem alterações.

## Dataset verificável

Aplicado `nuvem/perf-11k-fixture-homolog.sql` com uma segunda empresa totalmente sintética, 141 contas e 146 negócios artificiais. Com isso, homologação passou para **389 oportunidades, 384 contas e 2 empresas**. Dois casos artificiais possuem históricos de 141 e 120 eventos.

O script `nuvem/perf-11k-rollback-homolog.sql` foi preparado, com validação do identificador da empresa e quantidade dos dados antes da exclusão. Não foi executado. Nenhum registro real de produção foi copiado.

## Teste real de políticas PostgreSQL

Usando transações revertidas por ROLLBACK, foram verificadas visibilidades:
- Vendedor da empresa A: 243 oportunidades, 0 negócios artificiais da empresa B.
- Gestor da empresa A: 243 oportunidades, 0 negócios da empresa B.
- Administrador: 389 oportunidades, incluindo os 146 negócios sintéticos.
- Tentativa de modificar negócio de outra empresa pelo vendedor: **0 registros afetados**.

Esses testes simulam papéis no banco e não substituem logins independentes pela API.

## Comparação Chromium

Execução final GitHub Actions: 3 jobs aprovados, **171/171 testes**, 13 assinaturas HTML exatamente iguais. P95 de trabalho JavaScript + DOM:

| Operação | Ordem v286 primeiro | Ordem candidata primeiro |
|---|---:|---:|
| Pipeline | 28,7 → 22,3 ms (−22,3%) | 20,9 → 16,4 ms (−21,5%) |
| Busca seletiva | 24,2 → 1,8 ms (−92,6%) | 16,5 → 1,7 ms (−89,7%) |
| Cockpit complexo | 4,9 → 1,8 ms (−63,3%) | 3,1 → 1,4 ms (−54,8%) |

Os testes Chromium usam código do CRM e carteira artificial local de 389 oportunidades. **Não são testes de login, Supabase ou latência de rede**.

## Investigação SQL

A leitura sequencial de oportunidades em PostgreSQL demorou 0,540 ms na homologação com 243 registros e 0,549 ms depois com 389, em duas medidas isoladas. Na produção, uma primeira medição apresentou um pico de 141,6 ms, mas três seguintes ficaram em 0,760–0,826 ms. Não é evidência suficiente de gargalo persistente no banco ou justificativa para modificar índices de produção.

## Liberação da v287

Pré-requisitos agora atendidos: dois tenants, 389 oportunidades, duas tabelas privadas de sincronização e RLS nas 23 tabelas públicas.

**Quatro requisitos permanecem pendentes:** quantidade de contas de autenticação, quantidade de perfis, um gestor e dois vendedores de teste. O portão PERF-11I retorna corretamente **BLOQUEADO**.

Próxima etapa: criar três identidades adicionais pelo Supabase Auth oficial no ambiente de homologação; testar sessões simultâneas, CAS, sincronização, isolamento, anexos e P95 ponta a ponta. Sem alteração no ambiente de produção ou publicação da v287.
