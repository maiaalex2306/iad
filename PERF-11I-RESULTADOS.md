# PERF-11I — Gate de pré-liberação v287 e auditoria de homologação

**Data:** 01/11/2026. **Produção:** v286. **Status de liberação v287:** BLOQUEADO POR AMBIENTE DE HOMOLOGAÇÃO INCOMPLETO.

## O que foi verificado

Auditoria direta, estritamente de leitura, nos projetos Supabase de homologação e produção; não foram copiadas bases, não foram alterados SQL, estruturas ou registros. Os resultados abaixo são um instantâneo desta data, não substituem uma consulta atualizada antes do próximo deploy.

| Indicador | Homologação | Produção |
|---|---:|---:|
| Contas Auth | 1 | 7 |
| Perfis | 1 | 7 |
| Tenants | 1 | 2 |
| Administradores | 1 | 2 |
| Gestores | 0 | 3 |
| Vendedores | 0 | 2 |
| Oportunidades | 243 | 389 |
| Empresas presentes nas oportunidades | 1 | 2 |
| Tabelas em public com RLS ativo | 21/21 | 23/23 |
| iad_sync_usuario_eventos | Ausente | Presente |
| iad_sync_usuario_versoes | Ausente | Presente |

A diferença 243 vs 389 **não demanda cópia do banco de produção**: os testes de carga já utilizam 389 oportunidades sintéticas com módulo real e Chromium. A deficiência é a falta de **matriz multiempresa/multipapel** em homologação e duas tabelas de sincronização por usuário, necessárias para validar os fluxos da candidata.

## RLS: provas reais já executadas, sem escrita

Usando transações de leitura e identidade de teste no projeto de homologação:
- Role autenticada sem identidade: 0 oportunidades acessíveis — PASS.
- Identidade inexistente: 0 oportunidades acessíveis — PASS.
- Identidade existente de administrador: 243 oportunidades acessíveis — PASS.

Isso **não** prova RLS de gestor/vendedor nem acesso cruzado entre empresas. Os usuários e dados específicos ainda não existem na homologação. Não foi executada qualquer gravação.

## Próximo passo desenvolvido

- Arquivo `nuvem/perf-11i-preflight-readonly.sql`: consulta só de contagens e existência de tabelas, nunca e-mails, usuários identificáveis ou conteúdo comercial.
- `scripts/perf11i-readiness.cjs`: valida o contrato de relatório v1, verifica RLS em todas as tabelas públicas, os dois objetos de sync por usuário, perfis mínimos (admin, gestor e dois vendedores), dois tenants e oportunidades em duas empresas.
- Saídas explícitas: `BLOQUEADO` (exit 2) ou `PRECONDICOES_ATENDIDAS` (exit 0). O segundo estado **não significa** homologação E2E nem autorização de publicação.
- `nuvem/testes/perf-11i-readiness.test.cjs`: verifica falha fechada para missing schema, RLS desativada, perfis ausentes, JSON malformado e corretude do CLI.
- Workflow GitHub Actions `perf-11i-release-preflight.yml`: sintaxe, suíte de testes, falha fechada e preservação do versionamento público.

**Resultados observados:** 7/7 testes dedicados e 161/161 testes integrais aprovados, sem falhas, na execução inicial. A validação aplicada ao estado atual da homologação resultaria em **BLOQUEADO**, com 8 impedimentos, o comportamento desejado do gate.

## Sequência de correção sem tocar na produção

1. Na **homologação**, provisionar uma segunda empresa e identidades de teste segregadas (administrador, gestor e dois vendedores), preferencialmente utilizando dados sintéticos e sem reusar usuários reais de produção.
2. Versionar e aplicar exclusivamente na **homologação** as estruturas de sincronização por usuário ausentes, após revisão das dependências e políticas RLS. Não copiar dados reais.
3. Executar testes E2E da API Supabase com autenticação dos perfis, matriz SELECT/INSERT/UPDATE/DELETE, tentativas cross-tenant e tarefas, anexos, CAS e sincronização.
4. Medir P50/P95 ponta a ponta no navegador com sessão real, incluindo HEINEKEN e Suzano quando o ambiente permitir, rede, primeiro acesso, cache quente, nove abas, offline e PWA.
5. Só depois, consolidar PRs #34 → #36 → #37 → #39 → #40 → #41 → PERF-11I, atualizar versão e cache PWA e avaliar liberação controlada v287.

**Este pacote não aplica SQL, não altera Auth, não cria usuário e não publica produção.**
