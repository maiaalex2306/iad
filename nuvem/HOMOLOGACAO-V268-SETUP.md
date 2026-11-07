# IaD CRM v268 — homologação isolada, sem afetar produção

**Produção — NÃO ALTERAR:** https://www.iadcrm.com.br/
**Repo:** https://github.com/maiaalex2306/iad
**Branch de testes:** `performance/iad-perf-01`
**PR:** https://github.com/maiaalex2306/iad/pull/6
**Banco de produção:** `drhonmdffhnwamwzynrs` — jamais conectar esse projeto ao site de homologação.

## 1. Criar projeto novo no Supabase
Abra https://supabase.com/dashboard/projects → **New project**.
Nome sugerido `iadcrm-homolog`. Selecione região próxima e defina a senha
do banco em local seguro. NÃO apague nem modifique o projeto de produção.

Depois de criar, copie **Project URL** e **Publishable key** em
Settings → API Keys / Connect. A chave pública começa com `sb_publishable_`.
**Não forneça service_role / sb_secret_ ao navegador, Cloudflare Pages ou chat.**

### Esquema de teste
O arquivo histórico `nuvem/schema.sql` sozinho NÃO representa todas as
migrações de produção. A forma segura é exportar o **esquema atual**, sem dados,
do Supabase de produção usando Supabase CLI:
`supabase db dump -f esquema-producao.sql --schema public`
(com o projeto de produção ligado ao CLI). Revise o arquivo gerado.
Restaure a estrutura no novo projeto, verificando RLS, permissões, funções,
triggers e compatibilidade com `auth.users`. Documentação:
https://supabase.com/docs/reference/cli/global-flags

Um dump de esquema **não inclui as pessoas existentes**, nem copia
automaticamente configurações de Auth, Edge Functions ou seus segredos.
Configure um usuário de teste novo no Auth da homologação e um perfil
`admin` ou `gestor` vinculado a um tenant fictício no banco de testes.
**Não importe e-mails, CPFs, senhas ou dados comerciais reais sem anonimização.**

Recrie as Edge Functions necessárias para homologar os fluxos testados
em projeto separado; use chaves e endpoints de teste e não vincule
e-mail, Meta ou Cloudflare Workers que acionem campanhas reais.

## 2. Criar site de teste no Cloudflare Pages
Abra https://dash.cloudflare.com/ → **Workers & Pages** →
**Create application** → **Pages** → **Connect to Git** → GitHub.
Autorize apenas `maiaalex2306/iad`.

| Campo Cloudflare Pages | Valor obrigatório |
|--|--|
| Project name | `iadcrm-homolog` (se disponível) |
| Production branch do projeto de testes | `performance/iad-perf-01` |
| Root directory | `/` |
| Framework preset | None |
| Build command | `node scripts/build-homologacao.cjs` |
| Build output directory | `dist` |

**Não configure o output como `/` ou deixe o comando em branco**:
isso publicaria o `src/config.js` original, que aponta para PRODUÇÃO.

Em **Settings → Environment variables / Variables and Secrets** crie:
- `IAD_STAGING_URL`: URL do Supabase de homologação, exemplo
  `https://<ID-DE-TESTES>.supabase.co`;
- `IAD_STAGING_PUBLISHABLE_KEY`: publishable key do projeto de homologação.

O script foi construído para **recusar** URL do projeto real
`drhonmdffhnwamwzynrs`, chaves ausentes ou branch incorreta.
Ele gera `dist/` apenas com HTML, CSS, JavaScript e ícones,
cria aviso vermelho de homologação, desabilita indexação e
grava `src/config.js` de saída com o projeto de testes.

Após configurar as variáveis, faça **Retry deployment** se o primeiro
deploy falhar por ausência das duas configurações (falha segura).

Cloudflare fornecerá endereço `https://<nome>.pages.dev` quando
finalizar. Ele **não é** `www.iadcrm.com.br`.

## 3. Supabase Auth e testagem
No projeto NOVO, em Authentication → URL Configuration:
- Site URL = endereço real do projeto de teste no Cloudflare Pages
- Redirect URLs = mesmo endereço, com `/` final
- Provedor de e-mail habilitado conforme política de testes
- Configure apenas dados e identidades sintéticas.

Observe que somente o Supabase de homologação deve receber essas URLs.
**Não** altere Site URL e Redirect URLs do Supabase de produção.

## 4. Verificar isolamento ANTES de usar
1. Abrir `https://<nome>.pages.dev/src/config.js`: deve mostrar
   `v268-HOMOLOG` e URL do **projeto de testes**, nunca a de produção.
2. A homepage deve mostrar faixa vermelha **HOMOLOGAÇÃO**.
3. Verificar que o serviço de autenticação aponta para o projeto de testes
   e login de usuário TESTE funciona.
4. Popular dados sintéticos representativos: 243 oportunidades, tarefas,
   evidências, contatos e JSONB de diferentes tamanhos, em tenant de testes.
5. Ativar `IADPerformance.iniciar()` no Console, navegar Hoje/Pipeline,
   registrar `IADPerformance.parar()`.
6. Conferir IAD e todos os indicadores antes/depois com as mesmas
   amostras; medir Network e Performance do Chrome.
7. Não publicar o PR6 em produção sem avaliação real, incluindo
   sincronização e limites entre empresas.

## 5. Custos e privacidade
Projeto Supabase adicional pode consumir cota ou gerar cobrança.
Cloudflare Pages também possui cotas. Conferir os planos antes de ativar.
Não replicar base real sem anonimização. Para bloquear acesso
público aos testes, configurar proteção por Cloudflare Access
após validar o fluxo de login e retorno (Access pode impactar
links de recuperação).

## 6. Status desta preparação
- Preparação de build e testes no GitHub: feita.
- Criação de contas e projetos externos: **depende de sua autorização no
  painel Cloudflare e Supabase; não foi executada neste PR**.
- Homologação real e comparação de velocidade: **pendentes**.
