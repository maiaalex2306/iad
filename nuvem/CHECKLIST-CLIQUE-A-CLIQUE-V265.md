# IaD CRM — Instalar cadastro exclusivo do administrador (v265)

**Ambiente em produção:** https://www.iadcrm.com.br/
**GitHub Pages:** branch `claude/decisoes-estagios-vendas-eckjo0`, pasta raiz.
**Supabase:** projeto `drhonmdffhnwamwzynrs`.
**Atenção:** o PR 3 ainda NÃO está publicado. Não apague a usuária Rosa e não defina senha padrão 12345.

## Links de trabalho
- [PR 3 — ainda em revisão](https://github.com/maiaalex2306/iad/pull/3)
- [Migração SQL](https://github.com/maiaalex2306/iad/blob/fix/recuperacao-isolada-v265-20261026/nuvem/correcao-28-cadastro-administrativo.sql)
- [Código completo da Edge Function convite](https://github.com/maiaalex2306/iad/blob/fix/recuperacao-isolada-v265-20261026/nuvem/funcoes/convite/index.ts)
- [Modelo HTML do e-mail](https://github.com/maiaalex2306/iad/blob/fix/recuperacao-isolada-v265-20261026/nuvem/TEMPLATE-CONVITE-ADMIN.html)
- [SQL Editor do seu Supabase](https://supabase.com/dashboard/project/drhonmdffhnwamwzynrs/sql/new)
- [Edge Functions do seu Supabase](https://supabase.com/dashboard/project/drhonmdffhnwamwzynrs/functions)
- [Authentication / Users](https://supabase.com/dashboard/project/drhonmdffhnwamwzynrs/auth/users)
- [Authentication / Sign In - Providers](https://supabase.com/dashboard/project/drhonmdffhnwamwzynrs/auth/providers)
- [Authentication / URL Configuration](https://supabase.com/dashboard/project/drhonmdffhnwamwzynrs/auth/url-configuration)
- [Seu site oficial](https://www.iadcrm.com.br/)
- [GitHub Actions — publicações](https://github.com/maiaalex2306/iad/actions)

## Executar na ordem — primeiro em homologação
1. **Backup e reversão:** salve exportação do banco, cópia da configuração Auth,
   template do convite atual e código atual da Edge Function `convite`.
   Se não houver backup verificável, NÃO execute a migração SQL em produção.
2. **Conferir migrações prévias:** confirme que foram aplicadas
   `correcao-03-convites.sql`, `correcao-04-permissoes.sql`,
   `correcao-07-convite-gestor.sql` e `correcao-08-nome-do-convite.sql`.
   Em um ambiente de homologação que reflita a produção, abra a [migração nova](https://github.com/maiaalex2306/iad/blob/fix/recuperacao-isolada-v265-20261026/nuvem/correcao-28-cadastro-administrativo.sql),
   clique no ícone **Copy raw file** e cole no [SQL Editor](https://supabase.com/dashboard/project/drhonmdffhnwamwzynrs/sql/new) correspondente. Execute **Run**.
   Essa migração não remove contas existentes. Não repita a execução às cegas.
3. **Atualizar função convite:** abra [Edge Functions](https://supabase.com/dashboard/project/drhonmdffhnwamwzynrs/functions), selecione a função `convite`,
   clique **Code / Edit**, e substitua pelo conteúdo integral de [index.ts](https://github.com/maiaalex2306/iad/blob/fix/recuperacao-isolada-v265-20261026/nuvem/funcoes/convite/index.ts).
   Clique **Deploy updates**. Se a função ainda não existir, crie uma com nome `convite`, pelo editor, com esse código.
   **Importante:** a função exige token de usuário válido e papel `admin` consultado no banco.
4. **Segredos da função:** na área **Edge Functions → Secrets** verifique as variáveis:
   `IAD_CHAVE_SECRETA` com a *secret key* do Supabase (começa com `sb_secret_`),
   `IAD_CHAVE_PUBLICA` se necessária (publishable key) e
   `IAD_URL_SITE=https://www.iadcrm.com.br` opcional.
   O Supabase injeta `SUPABASE_URL`. Não copie nem envie nenhuma chave por chat.
   Se o gateway devolver erro de JWT com a chave moderna, reveja o controle de
   **Verify JWT** da Edge Function: a própria função valida o JWT via Auth e o
   papel de administrador no banco. Nunca remova a validação interna.
5. **E-mail de convite:** abra [Authentication](https://supabase.com/dashboard/project/drhonmdffhnwamwzynrs/auth/users)
   e clique **Emails** no menu lateral → **Templates** → **Invite user**.
   Insira o assunto `IaD CRM — Seu acesso foi aprovado: defina sua senha`.
   Cole no editor HTML o conteúdo completo do
   [template do convite](https://github.com/maiaalex2306/iad/blob/fix/recuperacao-isolada-v265-20261026/nuvem/TEMPLATE-CONVITE-ADMIN.html).
   Salve. Preserve `{{ .ConfirmationURL }}` no modelo: sem ela, o botão não ativa nada.
   Confira SMTP/limites de envio para contas externas.
6. **URL de retorno:** em [URL Configuration](https://supabase.com/dashboard/project/drhonmdffhnwamwzynrs/auth/url-configuration),
   confirme (já estava correto nas capturas) **Site URL** = `https://www.iadcrm.com.br`
   e em **Redirect URLs** inclua `https://www.iadcrm.com.br/`.
7. **Cadastro público:** só após provar convite/ativação em homologação,
   abra [Sign In / Providers](https://supabase.com/dashboard/project/drhonmdffhnwamwzynrs/auth/providers).
   Na configuração de Auth procure `Allow new users to sign up` e desligue-o,
   mantendo o login por e-mail/senha habilitado. Algumas versões do dashboard
   localizam a opção em **Authentication → Settings / General**.
8. **Homologação:** com conta administradora e email de TESTE ainda inexistente,
   cadastrar **nome, e-mail, WhatsApp, empresa, papel Gestor**; conferir e-mail,
   clicar link, conferir dois campos + Mostrar/Ocultar, testar senhas divergentes
   e iguais; entrar no CRM e confirmar acesso somente à empresa prevista.
   Confira também retorno **403** ao tentar enviar convite como usuário comum.
9. **Publicar frontend:** depois de validar Supabase e testes do PR, abra
   [PR 3](https://github.com/maiaalex2306/iad/pull/3) → **Ready for review**
   → **Merge pull request** → **Confirm merge**. Isso dispara publicação do Pages
   na branch correta. Acompanhe [Actions](https://github.com/maiaalex2306/iad/actions)
   até `pages build and deployment` apresentar **Success**.
10. **Validar no site:** acesse `https://www.iadcrm.com.br/src/config.js`
    e confirme `v265`; no site oficial, novo cadastro público não deve
    aparecer. `https://www.iadcrm.com.br/recuperar.html` deverá existir.
11. **Recuperar a Rosa:** ela JÁ EXISTE como gestora confirmada. Não a convide
    novamente. Solicite novo link em `/recuperar.html`, escolha uma nova senha,
    digite duas vezes, e teste o login em janela privada. Não compartilhe
    senha nem URL com tokens.

## Gates — NÃO considere homologado sem conferir
- Edge Function em produção com código atualizado e segredos corretos.
- Migração SQL aplicada e auditada, com backup.
- E-mail real entregue contendo link válido.
- Senha definida e confirmada duas vezes; login de gestor confirmado.
- Não administrador não consegue convidar.
- Novo usuário sem convite não consegue criar conta.
- Isolamento real entre empresas, sem acessos cruzados.

Os testes CI verdes no PR usam mocks, não o Supabase real.
