# LinkedIN Leads — autenticação nova dentro do IaD CRM Desktop

## Fluxo obrigatório: login primeiro
Ao iniciar o aplicativo exclusivo LinkedIN Leads no Windows, o painel esquerdo abre `https://www.iadcrm.com.br/#/linkedin-leads` e o painel direito abre **`https://www.linkedin.com/login`**. O operador digita usuário, senha e eventualmente MFA **diretamente na página oficial do LinkedIn no painel direito**, nunca no CRM.

A sessão do LinkedIn é **temporária e exclusiva por abertura de janela**: nenhum cookie, token de login ou senha é persistido pelo aplicativo. O menu **LinkedIn → Novo login (limpar sessão)** elimina cookies, armazenamento e cache da sessão atual e solicita login de novo. **Sair e exigir novo login** realiza o mesmo reset. A sessão do CRM, à esquerda, continua separada para não perder os 443 perfis importados/estado da fila local ao reautenticar o LinkedIn.

## Limite técnico importante
Isso usa duas `WebContentsView` na **mesma janela nativa Electron**, sem inserir um `iframe` de login do LinkedIn dentro do site (páginas externas podem proibir frame). O módulo desktop é opcional e separado das demais rotas do CRM, que continuam na web. A versão web, sozinha, não exibe login LinkedIn dentro da página.

Não há formulário de senha LinkedIn no CRM, armazenamento da senha, interceptação de cookies, DOM injection, automação de curtidas/comentários ou bypass de MFA/CAPTCHA. Se o LinkedIn recusar login no navegador embutido, é um bloqueio externo e precisa ser homologado em Windows; não será contornado.

## Executar e testar
```powershell
cd desktop/linkedin-leads
npm install
npm test
npm start
```

## Gerar versão portátil Windows
```powershell
npm run package:win
```

O executável portátil não assinado gerado em `dist` deve ser testado em Windows real com autenticação e MFA de uma conta de teste antes de ser distribuído. **Esta versão não implementa o executor automatizado de campanhas**. A aplicação carrega o CRM da versão pública, sem alterar Supabase nem RLS.
