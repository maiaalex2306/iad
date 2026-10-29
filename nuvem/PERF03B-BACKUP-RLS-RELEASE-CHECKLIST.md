# PERF-03B — Backup restaurável e aceite RLS (IaD CRM v271)

Data: 2026-10-29. Este pacote de auditoria **não executa SQL de produção** e **não deve ser publicado por merge** antes do aceite.

## Projetos confirmados via conector
- Produção: `IDA` — ref `drhonmdffhnwamwzynrs`, PostgreSQL 17.6, v271 no GitHub Pages.
- Homologação hospedada: `iadcrm-homolog` — ref `bvlfzeblpewlqhssprpv`, PostgreSQL 17.11, 243 oportunidades sintéticas.
- Organização Supabase: Free; conforme docs Supabase, backups diários automáticos são Pro/Team/Enterprise, **Free exige dump manual**.
- Em homologação, migração `perf_03b_journal_homolog_20261029` aplicada e verificada (2 tabelas, 8 triggers, RLS).
- Em produção, migração **não aplicada**; sem journal: frontend faz fallback ao sincronismo completo.

## Limite do acesso atual
O conector do Supabase permite SQL e migrações, mas **não expõe ação de exportar pg_dump, baixar backups ou comprovar restauração**. Não afirmar que existe backup restaurável de produção se nenhum artefato foi exportado e restaurado.

## Execução do backup local por operador autorizado (Windows PowerShell)
1. Usar computador autorizado, Supabase CLI atualizado, acesso ao projeto e destino em volume criptografado, fora do GitHub/OneDrive público.
2. Obter a **connection string** por meio do Dashboard Supabase > Connect, sem colá-la em chat, e definir `$env:IAD_PROD_DB_URL` somente na sessão local. Cuidado com histórico de comandos e visibilidade de argumentos de processos.
3. Executar `powershell -ExecutionPolicy Bypass -File scripts/perf03b-backup-restauravel.ps1 -Destino 'D:\\IAD-Backups'`.
4. Verificar `roles.sql`, `schema.sql`, `data.sql` e `manifesto.json` com SHA-256 e tamanhos não nulos. O campo `restore_verified` permanece `false` até a restauração de ensaio.
5. Armazenar outra cópia criptografada, em local diferente, com política de retenção e acesso mínimo. Os dumps contêm dados comerciais e de autenticação; jamais commitá-los.

## Teste obrigatório de restauração, ANTES da migração
- Restaurar os três arquivos em **projeto PostgreSQL/Supabase descartável e separado**, em ordem `roles.sql`, `schema.sql`, `data.sql`, seguindo instruções atuais do Supabase. Não sobrescrever `iadcrm-homolog` (possui testes ativos) nem o projeto de produção.
- Comparar contagens de entidades, vínculos entre contas/oportunidades/tarefas, permissões RLS, perfis de teste e funções. Corrigir incompatibilidades de extensões, roles ou Auth antes de declarar o restore aprovado.
- Backups do PostgreSQL **não incluem conteúdo binário do Supabase Storage**. Fazer cópia própria dos objetos, quando houver, além dos metadados e configurações externas.
- Registrar o horário UTC, hash de cada dump, destino do ensaio, duração de restauração, testes SQL e responsável pela aprovação.
- Em caso de erro, **rejeitar a liberação**, sem executar SQL de produção.
- O clone de dados reais também é sensível: não colocar dados de clientes em projeto de homologação acessível a equipe ampla; utilizar ambiente de restauração isolado com políticas equivalentes ou melhores que as de produção.

## Testes de permissões
- Supabase **local descartável** (CI), com usuários reais GoTrue, 2 tenants e JWTs: `scripts/perf03b-auth-rls-matrix.cjs`.
- Gestor A: journal e contas apenas do tenant A; Gestor B: tenant B; vendedor A: sem journal e só suas contas; administrador: journal e contas de ambos tenants.
- Anon: sem SELECT; usuário autenticado: sem INSERT no journal; gestor A: escrita em tenant B rejeitada; tombstone de DELETE visível apenas para quem tem escopo.
- Supabase **hospedado de homologação** tem apenas um perfil `admin`; por ora não comporta teste com login real gestor/vendedor sem provisionar contas de QA. O teste no SQL Editor com `SET LOCAL ROLE authenticated` e claims JWT **é simulação de RLS**, não autenticação por GoTrue.
- SQL de produção: não executado, nem mesmo migração.

## Gates de aprovação
1. Backup de produção exportado, com hashes e restore de ensaio aprovados — **PENDENTE**.
2. Matriz de Auth/RLS local real (CI) — verificar workflow mais recente da branch `qa/perf03b-backup-rls-20261029`.
3. Teste JWT real em homologação hospedada como gestor/vendedor de dois tenants — **PENDENTE** de usuários de teste.
4. RLS e seguranca de função SECURITY DEFINER: revisar alerts Supabase (inclusive EXECUTE anon em várias funções), sem alterações genéricas intempestivas.
5. Diferença v270/v271 com login real, Cacau Show, Tarefas e tempo p95 — **PENDENTE**.
6. Migração de produção autorizada somente após todos os gates e janela de implantação.

## Rollback
- Código: GitHub `backup/producao-v270-20261029`. Um rollback de frontend **não** reverte dados.
- Banco: não aplicar migração sem backup restaurável. O journal é aditivo e não muda diretamente dados de negócios, mas seus triggers podem afetar escrita e latência. Para desativar numa emergência, reverter triggers por tabela após análise; preservar journal para auditoria e não apagar dados automaticamente.
- Evitar restauração total precipitada: pode perder lançamentos posteriores ao backup. Priorizar desativar triggers e voltar ao sincronismo integral enquanto se investiga.

Referências: https://supabase.com/docs/guides/platform/backups e https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
