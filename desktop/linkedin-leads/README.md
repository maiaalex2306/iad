# IaD CRM Desktop — LinkedIN Leads (prévia técnica)

## Objetivo
Abrir **IaD CRM e LinkedIn na mesma janela nativa** no Windows, com sessões distintas. Não é uma extensão de navegador. A vista esquerda carrega `https://www.iadcrm.com.br/#/linkedin-leads` e a direita carrega o LinkedIn.

## Comportamento entregue
- LinkedIn abre na metade direita; os links para `linkedin.com` abertos pelo CRM através de `window.open` são redirecionados para a vista integrada.
- Login e MFA são feitos pelo usuário **dentro do domínio real do LinkedIn**; o CRM não recebe senha nem cookies.
- Cookie/session partition do LinkedIn persistente por **perfil local do sistema operacional** ou variável opcional `IAD_LINKEDIN_LOCAL_PROFILE`. A vista do CRM usa outro armazenamento.
- O sistema operacional abre uma única janela com navegador integrado; não controla automaticamente posts, curtidas ou comentários.
- URL de navegação restrita aos domínios apropriados; pop-ups não autorizados são bloqueados; isolamento de contexto, sandbox e webSecurity habilitados.

## Executar para teste (Node/npm)
```powershell
cd desktop/linkedin-leads
npm install
npm test
npm start
```

## Empacotamento Windows
```powershell
npm run package:win
```
O resultado é uma **prévia portátil não assinada**. O fluxo autenticado precisa de validação humana em Windows e LinkedIn antes de publicação empresarial. Não distribuí-la como automação de campanhas.

## Limitações
A versão web continua sem navegador integrado. O desktop é somente uma janela nativa para o web CRM e LinkedIn, não possui executor de automação, scraping, contorno de bloqueio nem API de publicação. O login do usuário em LinkedIn pode exigir fluxos de SSO/terceiros: a política de navegação bloqueia redirecionamentos externos que não tenham sido avaliados. Algumas funcionalidades do LinkedIn podem ser incompatíveis com navegadores embutidos; homologar no Windows.

A versão inicial admite apenas **um perfil LinkedIn por perfil local do sistema operacional**. Não é adequada para máquinas compartilhadas por diferentes usuários do CRM sem um mecanismo explícito de segregação/sair da conta. Dados do CSV 100 MiB devem ser gravados em armazenamento separado e paginado; a importação streaming ainda está em desenvolvimento na branch.

## Não fazer
- Não registrar credenciais, cookies, `li_at`, respostas de autenticação, arquivos confidenciais em logs.
- Não desabilitar sandbox/webSecurity.
- Não interceptar pedidos HTTP ou injetar scripts na view LinkedIn.
- Não publicar curtidas ou comentários sem verificar o canal e o modo de autorização.
