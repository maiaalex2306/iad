# Diagnóstico de primeiro acesso — usuários convidados

## Importante
Executar no SQL Editor do Supabase com acesso administrativo. **Somente leitura.**
O selo "perfil habilitado" em Usuários significa `perfis.ativo=true` e `tenant_id` preenchido; não comprova identidade confirmada, senha definida ou login.

## Rosa Oliveira — recuperação sem excluir o cadastro
1. Localize a pessoa em **Authentication → Users** pelo e-mail cadastrado. Confira o mesmo UUID apresentado no CRM.
2. Rode a consulta abaixo. Ela **não revela senha e não muda registros**.
3. Se não existe linha em `auth.users`: conferir `public.convites` pelo e-mail e acionar "Enviar" na lista de convites do CRM. Não criar segunda identidade.
4. Se `email_confirmed_at` está nulo: completar confirmação ou reenviar link de convite adequado. Não editar `auth.users` diretamente.
5. Se o e-mail foi confirmado, usar **Esqueci minha senha** no CRM e concluir o link recebido; em seguida testar login em janela privada.
6. Validar como gestor: visualizar contas e oportunidades da Bio Water Care - Vale do Paraíba e **não** acessar outras empresas.

### Consulta 1 — situação da identidade
Substitua apenas o e-mail. Execute com perfil administrador do projeto Supabase.

```sql
select
  u.id,
  u.email,
  u.created_at,
  u.email_confirmed_at,
  u.last_sign_in_at,
  p.nome, p.papel, p.ativo as perfil_ativo,
  p.tenant_id, t.nome as empresa, t.ativo as empresa_ativa,
  case
    when p.id is null then 'PERFIL_AUSENTE'
    when u.email_confirmed_at is null then 'CONFIRMACAO_PENDENTE'
    when not coalesce(p.ativo, false) then 'PERFIL_BLOQUEADO'
    when p.tenant_id is null then 'SEM_EMPRESA'
    when t.id is null then 'EMPRESA_INEXISTENTE'
    when not coalesce(t.ativo, false) then 'EMPRESA_BLOQUEADA'
    else 'PERFIL_REGULAR_AUTENTICACAO_A_TESTAR'
  end as diagnostico
from auth.users u
left join public.perfis p on p.id = u.id
left join public.tenants t on t.id = p.tenant_id
where lower(u.email) = lower('SUBSTITUIR_EMAIL_AQUI');
```

### Consulta 2 — convite pendente

```sql
select c.email, c.nome, c.papel, c.tenant_id,
       t.nome as empresa, c.criado_em
from public.convites c
left join public.tenants t on t.id = c.tenant_id
where lower(c.email) = lower('SUBSTITUIR_EMAIL_AQUI');
```

### Consulta 3 — conferência de role e vínculo
Verifique se `perfis.papel='gestor'`, `perfis.ativo=true`, `tenants.ativo=true` e `perfis.tenant_id=tenants.id`.
Depois faça o teste funcional com a conta da pessoa. O SQL Editor como administrador **não simula** a RLS de um usuário comum.

## Regras de produção ainda necessárias
- Unificar fluxo de cadastro e convite em serviço administrativo idempotente.
- Consultar Auth para distinguir convite pendente, identidade criada e ativação concluída.
- Substituir manualmente o processo de `signup` após convite já enviado: não seguir dois caminhos concorrentes com o mesmo e-mail.
- Implementar auditoria de convite/ativação/alteração de papel e testes E2E para contas duplicadas, convite expirado, redefinição de senha, bloqueio e isolamento de tenant.
- Homologar em ambiente separado antes de publicar em produção.

## Arquivos alterados neste primeiro patch
- `src/app.js`: envia convite após registrar; mantém fallback de e-mail quando função remota indisponível.
- `src/views.js`: selo indica status **do perfil**, não inventa status do Auth.
- Este documento: procedimentos de diagnóstico e recuperação.

**Não declare homologação 100% sem os testes de autenticação e RLS.**

## Correção confirmada no código — links de senha descartados por redirecionamento

**Causa:** a inicialização em `src/app.js` chamava `abrirNoHoje()` antes de `adotarCredencialDoEndereco()`. Quando o Supabase devolvia `#access_token=...&type=recovery`, o `location.replace(...#/hoje)` podia apagar o fragmento antes de o CRM adotar a sessão. A recuperação acabava na tela de login, onde a senha antiga continuava sendo exigida.

**Correção na branch:** `abrirNoHoje()` não redireciona se `credencialNoEndereco()` detectar um token de recuperação/convite ou erro. A tela de senha especifica claramente a **nova senha** e sua repetição e usa `autocomplete="new-password"`.

**Validação de rota:** simulação isolada com as funções reais do código: recuperação, convite, erro de link expirado, deep-link, pipeline e primeiro acesso foram verificados; não houve teste completo em navegador com o serviço real.

**Procedimento após publicação da versão corrigida:**
1. Conferir se o Supabase permite `https://www.iadcrm.com.br/` como URL de redirecionamento em Authentication → URL Configuration. Essa é a URL oficial do GitHub Pages configurada no repositório, publicado a partir de `claude/decisoes-estagios-vendas-eckjo0` (root).
2. Confirmar que os arquivos efetivamente servidos contêm a correção (a branch do PR não representa deploy).
3. Solicitar **novo** link de recuperação para a identidade já existente. Links anteriores podem ter sido consumidos ou expirado.
4. Abrir o link no navegador, definir uma senha nova **não compartilhada**, digitando exatamente a mesma nos dois campos.
5. Confirmar que a alteração foi salva; sair e entrar com a nova senha em sessão privada.
6. Verificar como gestora a carteira da Bio Water Care e restrição de outros tenants.

**Não** editar `auth.users` com SQL para definir senha, recriar a conta nem atribuir temporariamente papel de administrador.

