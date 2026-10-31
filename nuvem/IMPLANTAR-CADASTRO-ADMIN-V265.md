# IaD CRM v265 — Cadastro centralizado pelo Administrador
## Objetivo
Somente um administrador autenticado pode cadastrar pessoas (nome, e-mail, WhatsApp,
empresa e papel: usuario, gestor, admin). O servidor reserva o convite e chama o
Supabase Auth Admin API. O destinatário recebe um link INDIVIDUAL, valida o link
e informa **Nova senha** e **Repita a nova senha**. A senha antiga não é exigida.

**Não adotar 12345 nem nenhuma senha fixa:** ela permitiria assumir qualquer
conta ainda não ativada. O link do Supabase cumpre o mesmo objetivo de primeiro
acesso sem distribuir senhas compartilhadas.

## Como implantar (a ordem é obrigatória)
1. **Antes de qualquer mudança, backup** da configuração de Auth, banco e da
   versão atual. Preserve os usuários existentes (inclusive Rosa Oliveira).
2. Em ambiente de homologação, aplique pelo SQL Editor a migração
   `nuvem/correcao-28-cadastro-administrativo.sql`, **após**
   `correcao-03`, `correcao-04`, `correcao-07` e `correcao-08`.
   Ela guarda WhatsApp no convite e exige reserva administrativamente
   autorizada no gatilho de criação de novos usuários.
   Não edita o cadastro ou a senha de quem já existe.
3. Implante `nuvem/funcoes/convite/index.ts` em Supabase → Edge Functions
   → `convite`. A função exige a chave `IAD_CHAVE_SECRETA` no ambiente
   (segredo, **nunca** no GitHub), além das variáveis Supabase já existentes.
   Opcionalmente configure `IAD_URL_SITE=https://www.iadcrm.com.br`.
   Confirme a proteção do endpoint pela checagem de JWT e de `perfis.papel='admin'`.
4. Em Authentication → Providers → configuração geral, desative **Allow new
   users to sign up** (cadastro público), sem desativar o provedor de e-mail
   nem o login por senha. Faça essa mudança só após testar convites pela
   API administrativa em homologação.
5. Em Authentication → Emails → Templates → **Invite user**, substitua
   o conteúdo pelo arquivo `nuvem/TEMPLATE-CONVITE-ADMIN.html`.
   Assunto sugerido: `IaD CRM — Seu cadastro foi aprovado: defina sua senha`.
   O template usa `{{ .ConfirmationURL }}`, `{{ .Email }}`,
   `{{ .Data.nome }}`, `{{ .Data.empresa }}` e `{{ .Data.papel }}`.
   Confirme SMTP (SPF/DKIM) e entregabilidade para o domínio.
6. Confirme **Site URL** e **Redirect URLs** em Authentication → URL
   Configuration: `https://www.iadcrm.com.br/`.
7. Teste em homologação todos os casos abaixo; só então integre o PR nº 3
   à branch de Pages, `claude/decisoes-estagios-vendas-eckjo0`.
   O GitHub Pages publica a pasta raiz e deve indicar versão v265.

## Testes de aceite
- Administrador registra novo e-mail, escolhe Bio Water Care, papel Gestor.
- E-mail contém nome, empresa e papel corretos e link real do Supabase.
- Clique abre `/recuperar.html`, mostra **duas senhas** e dois controles
  independentes **Mostrar senha**.
- Senhas diferentes: não envia alteração para Auth; iguais: atualiza a senha
  com a sessão do convite (não com credencial armazenada).
- Depois de salvar, login funciona, `perfis.papel='gestor'` e tenant correto.
- O gestor lê a carteira da empresa, nunca a de outra empresa.
- Usuário não administrador não pode chamar `convite` (HTTP 403).
- Endpoint de signup público fica desabilitado e navegador não mostra
  `Criar meu acesso` para usuários não autenticados.
- Reenviar convite pendente não cria perfil duplicado.
- Conta já criada não pode receber um segundo cadastro: use
  **Esqueci minha senha** para recuperar; nenhum perfil é excluído.
- Link expirado exibe opção de solicitar outro sem autenticar.
- SMTP indisponível mostra erro e mantém diagnóstico de convite pendente.

## Caso Rosa Oliveira
A identidade `eed64148-d699-4eff-bb7d-13bd9a557525` já existe;
não tente convidá-la de novo nem defina senha fixa. Após publicar a página
de recuperação independente e verificar sua URL, solicite **Esqueci minha
senha** para `rosa.oliveira@biopartners.com.br` e confirme a alteração
com dois campos. Teste login em navegador privado como gestora.
Se falhar, verifique o erro de rede/estado de Auth sem divulgar token, link
completo ou senha no chat.

## Atenção
A branch do PR não aplica SQL nem implanta a Edge Function automaticamente.
Mudar somente arquivos no GitHub **não** conclui a implementação. O deploy
em produção depende das etapas acima e de testes E2E contra ambiente real.
