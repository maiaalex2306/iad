# PERF-11L — Portão autenticado de RLS e P95 de HTTP

Data: 01/11/2026. **Fase de código/CI: homologada.** **Fase autenticada real: pendente, bloqueia a v287.**

## Situação verificada
- Homologação Supabase `iadcrm-homolog`: 389 oportunidades, 2 empresas e 23 tabelas públicas protegidas por RLS.
- Só existe **1 conta Auth e 1 perfil**. Não existem gestor e vendedores de teste suficientes.
- A candidata permanece em PR draft; produção v286.
- O perfil de navegador IaD CRM não tem sessão autenticada salva.

## O que foi desenvolvido
`scripts/perf11l-auth-probe.cjs` valida **quatro sessões independentes reais** diretamente pelo Supabase Auth oficial. A URL é fixa em `https://bvlfzeblpewlqhssprpv.supabase.co`, impedindo acidentalmente acesso à instância de produção. A execução só começa com `PERF11L_ENABLE=1`.

Cenários:
1. Login de administrador, gestor, vendedor 1 e vendedor 2. Papéis devem ser `admin`, `gestor`, `usuario`, `usuario` respectivamente, perfis ativos e UUIDs distintos.
2. Pelo menos dois tenants representados pelos quatro perfis.
3. Leitura autenticada das tabelas `contas`, `oportunidades` e `tarefas`; gestor e vendedor não podem ler outro tenant; vendedor não pode ler registro de outro `dono_id`. Registros compartilhados com dono nulo são permitidos se estiverem no mesmo tenant.
4. Isolamento dos journals `iad_sync_usuario_eventos` e `iad_sync_usuario_versoes`: vendedor só lê suas próprias linhas, gestor/admin não lê o journal privado.
5. Trinta requisições autenticadas de oportunidades do administrador: P50, P95 e máximo em milissegundos de HTTP+JSON, sem registrar os registros ou usuários.
6. Resposta inválida, falta de identidade, falta de RLS ou página potencialmente truncada **interrompem** a homologação.

O relatório de saída `perf11l-results/api-rls.json` contém apenas papel, etiqueta técnica, contagens de linhas e tempo. Não registra nomes reais, IDs, URLs com filtros, tokens, senhas, e-mails, corpos dos registros ou conteúdo de clientes. A conta de Auth pode criar sessão do GoTrue; nenhuma escrita comercial é enviada por este teste.

## GitHub Actions
`.github/workflows/perf-11l-auth-probe.yml` mantém dois jobs distintos:
- `safety-and-mock`: executa a suíte completa e o teste de Auth com servidor em memória, **sem credenciais nem rede de homologação**. Sucesso: **179/179 testes** no workflow inicial corrigido, 0 falhas.
- `live-staging-only`: executado **apenas** por `workflow_dispatch`, com credenciais armazenadas em GitHub Actions Secrets. Sem secrets, falha explicitamente; não há sucesso enganoso. O job ainda não foi executado autenticado.

O primeiro CI falhou por checkout Git superficial (referências históricas ausentes). Foi corrigido com `fetch-depth: 0` e toda a suíte passou. Não houve modificação de dados do banco por causa dessa correção.

## Preparação segura (ação autorizada no projeto de homologação)
A partir do painel oficial de Auth do projeto de homologação, criar **três contas de teste adicionais** (1 gestor e 2 vendedores), usando o fluxo legítimo de convites/cadastro que gera `public.perfis`. A conta de administrador de homologação existente é a quarta. Distribuir os perfis entre duas empresas, preferencialmente dois vendedores na mesma empresa e gestor na outra. Não criar linhas diretamente em `auth.users`, não copiar contas de produção e não compartilhar senhas nesta conversa.

Supabase Auth de homologação: https://supabase.com/dashboard/project/bvlfzeblpewlqhssprpv/auth/users

No GitHub, inserir na configuração Actions secrets (sem colocar em PR ou logs) estas variáveis:
- `PERF11L_STAGING_KEY` (chave publishable/anon da homologação)
- `PERF11L_ADMIN_EMAIL`, `PERF11L_ADMIN_PASSWORD`
- `PERF11L_GESTOR_EMAIL`, `PERF11L_GESTOR_PASSWORD`
- `PERF11L_VENDEDOR1_EMAIL`, `PERF11L_VENDEDOR1_PASSWORD`
- `PERF11L_VENDEDOR2_EMAIL`, `PERF11L_VENDEDOR2_PASSWORD`.

Depois acionar manualmente o workflow PERF-11L na branch candidata. O fluxo usa HTTPS e emite apenas contagens e tempos. Mesmo quando esse teste passar, ainda será preciso navegador autenticado com medições de DOM/cockpit, sincronização CAS, PWA e anexos. HTTP P95 não é P95 de apresentação na tela.

## Limites e decisões
- **Não foi criado nenhum usuário Auth real:** o conector disponível não expõe criação oficial de identidades; usar inserção SQL direta no Auth seria incorreto.
- **Sem alteração de esquema, SQL de produção, merge ou deploy.**
- A PERF-11L reduz o risco de falha de permissão e permite medir a latência da API quando houver credenciais, mas **não é uma otimização de velocidade da aplicação por si só**.
- V287 permanece **BLOQUEADA** até RLS real multiusuário, CAS/sincronização, navegador autenticado, anexos e P95 ponta a ponta.
