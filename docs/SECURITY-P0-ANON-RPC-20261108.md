# SECURITY-P0 — Restrição de RPCs administrativas anônimas

**Data:** 08/11/2026 · **Frontend publicado:** v286.99 (sem mudança de versão por esta correção exclusiva de ACL).  
**Projetos:** produção `IDA` (sa-east-1) e homologação `iadcrm-homolog` (us-east-1).

## Evidências anteriores

O Security Advisor identificou 15 RPCs `SECURITY DEFINER` de `public` executáveis por `anon`; nove são operações administrativas que exigem login ou privilégios de gestor/admin no próprio corpo da função. A aplicação chama essas RPCs pelo cliente `src/nuvem.js` após autenticação. Os grants explícitos estavam presentes para `anon`, `authenticated` e `service_role`.

Um grant `EXECUTE` a `anon` numa função privilegiada é exposição de API desnecessária mesmo que existam guardas internas. O problema de grants não autoriza concluir exploração: os corpos analisados já possuem verificações de autenticação/perfil.

## Intervenção

`nuvem/sql/security-p0-anon-admin-rpc-20261108.sql` revoga **exclusivamente EXECUTE de anon** nas 9 funções administrativas nomeadas no SQL. Preserva `authenticated`, `service_role`, parâmetros, código, RLS, tabelas, dados e triggers. O script é idempotente e rejeita execução se houver função ausente, grants inesperados de PUBLIC ou perda de acesso das contas autenticadas.

**Homologação real anterior ao merge:** aplicado via conexão administrativa apenas ao projeto `iadcrm-homolog`. Verificação do catálogo após a alteração: 9/9 funções presentes; 0/9 executáveis pelo papel `anon`; 9/9 por `authenticated` e 9/9 por `service_role`. O Advisor de homologação reduziu o aviso `anon_security_definer_function_executable` de 15 para 6.

**Critérios pré-produção:** CI das RPCs, autenticação, RLS e CAS; catálogo de funções idêntico em produção; backend da IA/market-search não é afetado; checar Advisor novamente após aplicação; smoke da página pública.

## Limites

As seis funções anônimas restantes incluem funções auxiliares de leitura/autorizações e triggers. Elas exigem avaliação própria porque podem compor políticas RLS ou fluxos de cadastro. Também permanecem avisos de `authenticated SECURITY DEFINER`; esses não podem ser resolvidos retirando todo o acesso, pois o app os utiliza. É necessário auditar o código interno, testes negativos e dependências.

A autenticação real do CRM em navegador com credenciais de gerente/SDR não foi executada neste processo. A verificação de grants prova o controle de acesso à função, mas não demonstra todos os fluxos de negócio.

**Rollback protegido:** `nuvem/sql/security-p0-anon-admin-rpc-rollback-20261108.sql`, somente se uma regressão comprovada exigir restaurar o acesso anônimo anterior. Nunca apagar cookies, snapshots ou dados da carteira para tentar resolver problemas de permissões.
