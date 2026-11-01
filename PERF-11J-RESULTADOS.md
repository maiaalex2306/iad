# PERF-11J — Migração efetiva do journal privado e provas de RLS em homologação

**Data:** 01/11/2026. **Ambiente alterado:** somente Supabase `iadcrm-homolog` (`bvlfzeblpewlqhssprpv`). **Produção `IDA`: nenhuma alteração**.

## 1. Diagnóstico / mudança realizada

A homologação estava incompleta: faltavam `public.iad_sync_usuario_versoes` e `public.iad_sync_usuario_eventos`, presentes em produção. O SQL original já estava versionado em `nuvem/perf-03c-journal-privado.sql`, com definição de tabelas, PK/FKs, índices, políticas RLS, permissões, função interna e triggers.

Foi aplicada na **homologação** pelo conector Supabase uma migração registrada como:
- **Migration ID:** `20261101205609`
- **Nome:** `perf_11j_sync_usuario_homolog_20261101`
- **Fonte:** `nuvem/perf-03c-journal-privado.sql`
- **Resultado:** `success:true`.

Não foi executada no banco de produção; nenhuma cópia de dados, credenciais ou identidades entre ambientes.

## 2. Pós-migração verificada no banco real

- Duas tabelas criadas e vazias, com políticas `SELECT` específicas para `authenticated`.
- **8 triggers** internos `iad_sync_usuario_evento` ativos nas tabelas de negócio planejadas.
- **23/23 tabelas públicas** com RLS habilitada.
- Papel `authenticated`: `SELECT` nas tabelas de journal (restrito por RLS); sem `INSERT` diretamente.
- Papel `anon`: sem `SELECT` nos journals.
- Função `iad_sync_registrar_usuario()`: sem `EXECUTE` direto para `authenticated`.
- Índices `(tenant_id, usuario_id, versao)` e `(tenant_id,usuario_id,criado_em)`, equivalentes ao esquema previamente inspecionado.

## 3. Testes executados no PostgreSQL da homologação

Duas transações independentes abriram o tenant B sintético e duas oportunidades sintéticas temporárias. O perfil Auth existente foi trocado temporariamente para `usuario` e `gestor`, e `request.jwt.claim.sub` foi simulado com `SET LOCAL ROLE authenticated`. Após cada verificação, **`ROLLBACK` completo**.

| Cenário | Esperado | Observado |
|---|---:|---:|
| Vendedor lê oportunidade da própria empresa | 1 | 1 |
| Vendedor lê oportunidade de outra empresa | 0 | 0 |
| Vendedor recebe evento privado da própria empresa | 1 | 1 |
| Vendedor recebe evento privado de outra empresa | 0 | 0 |
| Vendedor acessa cursor privado | 1 | 1 |
| Gestor lê oportunidade da própria empresa | 1 | 1 |
| Gestor lê oportunidade de outra empresa | 0 | 0 |
| Gestor lê feed privado de vendedores | 0 | 0 |
| Gestor lê cursor privado de vendedores | 0 | 0 |

Releitura após ambos os `ROLLBACK`: **243 oportunidades, 1 tenant, 1 admin, 0 gestores, 0 vendedores, 0 eventos privados, 0 cursores privados e zero registros sintéticos residuais**.

Esses testes **comprovam regras de backend sob papéis simulados e dados sintéticos**. Não substituem a autenticação via API Supabase com quatro contas independentes; o perfil real existente foi alterado apenas de forma transitória, sem persistência.

Script reproduzível (usar **somente em homologação**): `nuvem/testes/perf-11j-rls-rollback.sql`.

## 4. GitHub Actions e regressões

- 5 testes novos validando o DDL, o contrato de segurança, a sequência de eventos e a reversão dos probes.
- Total: **166/166 testes CJS aprovados**, 0 falhas.
- Workflow: `.github/workflows/perf-11j-staging-sync.yml`.
- A execução em CI analisa o código **sem credenciais** e não escreve no banco. Os testes SQL vivos foram executados separadamente no Supabase homologado.

## 5. Portão de liberação ainda BLOQUEADO

Os dois déficits de esquema foram sanados. Continuam seis pré-condições não atendidas no gate PERF-11I:

1. `auth_users`: 1 conta, mínimo 4.
2. `profiles`: 1 perfil, mínimo 4.
3. `tenants`: 1 empresa persistida, mínimo 2.
4. `managers`: 0, mínimo 1.
5. `sellers`: 0, mínimo 2.
6. `tenant_coverage`: 1 empresa com oportunidades, mínimo 2.

**Não adicionar usuários diretamente a `auth.users` por SQL**. Criar contas de teste via fluxo regular do Supabase Auth/convites, inserir empresas e oportunidades 100% sintéticas na homologação, validar RLS/CAS através da API autenticada e medir UX completa.

## 6. Performance e segurança adicionais

A migração do journal privado habilita deltas seguros por usuário, mas **não prova redução de P95** de abertura de card ou busca. Os gatilhos representam trabalho adicional na escrita; seus custos com dois ou mais vendedores ainda precisam ser medidos antes da produção. Os ganhos do Pipeline e do cockpit foram comprovados anteriormente somente em navegador com dados sintéticos.

Supabase Database Advisors consultados após a migração, em homologação **e produção**:
- 15 alertas de `SECURITY DEFINER` executável por `anon` e 17 por `authenticated` em ambos os ambientes (avisos preexistentes, não causados pela nova função de sync).
- Senhas vazadas: proteção sinalizada como não ativada; revisão Auth necessária.
- `segredos_email` tem RLS habilitada sem policies (padrão de negação; revisar se intencional).
- Performance: 11 avisos de índices de FK ausentes, dois relativos às tabelas privadas recém-incluídas. Evitar adicionar índices sem medição da proporção leitura/escrita.

Esses são **avisos de auditoria**, não comprovação de exploração. Não revogar acessos de funções existentes sem verificar chamadas legítimas de login/cadastro, triggers e integrações; nenhuma permissão de produção foi modificada.

## 7. Próximo passo recomendado

Concluir PERF-11J provisionando **identidades de teste reais e segregadas** no projeto de homologação pelo Auth oficial, adicionar segunda empresa sintética e dataset estável. Executar matriz RLS end-to-end (admin, gestor, dois vendedores), CRUD/CAS, troca de empresa, sincronização, IndexedDB com anexos e P95 de rede/DOM. Só então considerar a v287 com plano de rollback.

**Sem credenciais reais nem autorização para operar na aplicação autenticada, a homologação end-to-end permanece pendente.**
