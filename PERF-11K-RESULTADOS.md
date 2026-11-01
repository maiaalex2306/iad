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

Execução final GitHub Actions: 3 jobs aprovados, **171/171 testes**, 13 assinaturas HTML exatamente iguais. P95 de trabalho JavaScript + DOM, **100 amostras úteis por operação principal e 10 aquecimentos**:

| Operação | Ordem v286 primeiro | Ordem candidata primeiro |
|---|---:|---:|
| Pipeline | 28,4 → 21,6 ms (−23,9%) | 29,0 → 20,6 ms (−29,0%) |
| Busca seletiva | 17,8 → 2,0 ms (−88,8%) | 17,7 → 2,1 ms (−88,1%) |
| Cockpit complexo | 7,3 → 2,0 ms (−72,6%) | 7,2 → 2,2 ms (−69,4%) |

Os testes Chromium usam código do CRM e carteira artificial local de 389 oportunidades. **Não são testes de login, Supabase ou latência de rede**.

## Investigação SQL

A leitura sequencial de oportunidades em PostgreSQL demorou 0,540 ms na homologação com 243 registros e 0,549 ms depois com 389, em duas medidas isoladas. Na produção, uma primeira medição apresentou um pico de 141,6 ms, mas três seguintes ficaram em 0,760–0,826 ms. Não é evidência suficiente de gargalo persistente no banco ou justificativa para modificar índices de produção.

## Liberação da v287

Pré-requisitos agora atendidos: dois tenants, 389 oportunidades, duas tabelas privadas de sincronização e RLS nas 23 tabelas públicas.

**Quatro requisitos permanecem pendentes:** quantidade de contas de autenticação, quantidade de perfis, um gestor e dois vendedores de teste. O portão PERF-11I retorna corretamente **BLOQUEADO**.

Próxima etapa: criar três identidades adicionais pelo Supabase Auth oficial no ambiente de homologação; testar sessões simultâneas, CAS, sincronização, isolamento, anexos e P95 ponta a ponta. Sem alteração no ambiente de produção ou publicação da v287.

## Estabilidade do benchmark e fail-closed

Uma execução de 30 amostras da ordem candidata-primeiro falhou legitimamente no requisito de cockpit: apenas **9,7% de redução do P95** (mínimo exigido: 15%), embora a mediana tenha melhorado. A falha permaneceu no histórico de CI.

Amostragem aumentada para **100 amostras e 10 aquecimentos por cenário principal**, sem alterar os thresholds. Ambas as ordens passaram: pesquisa acima de 30% de melhora no P95, cockpit acima de 15%, Pipeline sem regressão maior que 20%. A coleta de 100 medições reduz a sensibilidade a picos isolados, mas não é garantia universal de desempenho. O relatório JSON é exportado como artefato para cada job.

**Segurança adicional da reversão:** o rollback passou a verificar todas as tabelas públicas com `tenant_id`. Caso existam perfis, tarefas ou quaisquer outras dependências associadas ao tenant sintético, a limpeza é bloqueada em vez de apagar registros criados posteriormente por outros testes.
