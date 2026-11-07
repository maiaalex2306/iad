# ADR — LinkedIN Leads: navegador integrado e campanhas orientadas por fila
Status: Proposta arquitetural (não homologado / não publicado)
Data: 2026-11-07
Branch: `feature/linkedin-leads-ux-csv100m-20261107`

## 1. Requisito de produto corrigido
O operador não deve precisar abrir o LinkedIn em uma aba ou janela externa, pesquisar e preencher o post manualmente. O produto-alvo deve ter uma área de navegação LinkedIn **dentro do aplicativo IaD CRM Desktop**, ao lado dos controles de campanha. A versão Web/PWA permanece disponível para CRM, importação e monitoramento, mas não oferece capacidade de incorporar nem controlar o site de terceiros como uma subpágina comum.

UX principal: **Conectar conta** → **Importar CSV até 100 MiB** → **Configurar objetivo** → **Iniciar campanha** → **Ver progresso e exceções**. Informações de perfil e do post são resultados do processo, não campos de preenchimento do operador. O módulo não deve exibir a lista gigante de contatos já cadastrados no CRM como seletor inicial.

## 2. Estudo: comportamento público documentado do Linked Helper 2
1. Aplicativo desktop independente, funciona como navegador inteligente e executa o LinkedIn em instância própria. Não é extensão do Chrome e não é apenas botão `window.open`.
2. Uma instância e cache de navegação separados por conta; controles de campanhas/CRM fora do conteúdo da página LinkedIn.
3. O executor usa a área de navegação e restringe navegação manual concorrente enquanto roda.
4. A ação "Like and comment posts and articles" examina publicações recentes e procura publicações que ainda não receberam curtida da conta. Quando não existem publicações elegíveis, marca o perfil como `Skipped` e avança para o próximo item.
5. Comentário com IA baseado em conteúdo da publicação, nome, headline, tom, idioma e objetivo; o comentário é associado à curtida do post.
6. Campanhas executam no computador ou máquina remota com o aplicativo em execução, mesmo no modelo com dados armazenados na nuvem.
7. Há controles de atividade em janelas móveis e estados, mas não há garantia de evitar restrições de conta.

Fontes consultadas:
- https://support.linkedhelper.com/hc/en-us/articles/360017179880-LinkedIn-menu
- https://support.linkedhelper.com/hc/en-us/articles/360018627020-Like-and-comment-posts-and-articles
- https://support.linkedhelper.com/hc/en-us/articles/360016793020-LinkedIn-Accounts-menu
- https://support.linkedhelper.com/hc/en-us/articles/360015454919-Is-it-safe-to-use-Linked-Helper-Is-it-detectable
- https://support.linkedhelper.com/hc/pt/articles/37009797813010-Vers%C3%A3o-do-Linked-Helper-com-armazenamento-em-nuvem

O código interno exato do Linked Helper é proprietário. O comportamento acima é documentado pelo fabricante; não há comprovação pública do framework interno específico, da sua implementação de eventos ou dos seletores usados.

## 3. Limite técnico do IaD CRM Web/PWA atual
O IaD CRM publicado em GitHub Pages é uma aplicação web estática. `window.open()` cria outra aba/janela. Um `iframe` não substitui um navegador integrado:
- a política de mesma origem impede o CRM de ler/manipular DOM autenticado de linkedin.com;
- sites podem impedir incorporação por CSP `frame-ancestors` e `X-Frame-Options`;
- o acordo do LinkedIn restringe framing e automações não autorizadas.

Portanto, a experiência equivalente exige um **host desktop com navegador nativo isolado** e não apenas CSS/HTML do PWA.

## 4. Decisão tecnológica
**Preferência inicial para POC: Electron + WebContentsView**, com separação entre vista IaD CRM e vista LinkedIn na mesma janela nativa. `WebContentsView` é API oficial adequada para conteúdo externo. NÃO utilizar `<webview>` (desaconselhado pela documentação atual do Electron), `BrowserView` (depreciado), nem `iframe` no PWA.

Alternativa posterior: Tauri 2 + WebView2 no Windows tende a reduzir empacotamento, mas child webviews lado a lado exigem `unstable` atualmente. Avaliar depois da POC ou caso peso de memória torne Electron inviável.

Referências:
- https://www.electronjs.org/docs/latest/api/web-contents-view
- https://www.electronjs.org/docs/latest/api/webview-tag
- https://v2.tauri.app/reference/javascript/api/namespacewebview/

## 5. Componentes alvo

```text
IaD CRM Desktop (host Electron)
  |-- vista CRM (UI local ou remoto iadcrm.com.br)
  |-- vista LinkedIn (WebContentsView independente)
  |      |-- sessão persistente LOCAL, por conta, isolada
  |      +-- login manual feito somente dentro do domínio linkedin.com
  |-- gerenciador de campanhas
  |      |-- fila CSV / checkpoint / execução / pause / retry
  |      +-- motor de estados e journal de eventos idempotente
  |-- conector oficial por canal (permissões verificáveis; fail closed)
  +-- interface autorizada com IA do IaD CRM (somente contexto necessário)
```

**Sessão**: senha digitada pelo usuário na própria página LinkedIn em vista separada; nenhum campo de senha no CRM, nenhum cookie/senha/token compartilhado por ponte IPC ou Supabase. `nodeIntegration=false`, `contextIsolation=true`, `sandbox=true` no conteúdo remoto; IPC mínimo e tipado; URLs permitidas validadas; sem `executeJavaScript` arbitrário enviado pelo frontend.

## 6. Campanha desejada
```text
AGUARDANDO
  -> PERFIL_IDENTIFICADO
  -> PUBLICACOES_DISPONIVEIS
  -> ELEGIBILIDADE_VERIFICADA
  -> POST_ELEGIVEL / SEM_POST / JA_INTERAGIDO / SEM_PERMISSAO
  -> ANALISE_IA
  -> REVISAO_HUMANA (primeira etapa; publicação não automática)
  -> CURTIDA_CONFIRMADA_POR_CANAL_AUTORIZADO
  -> COMENTARIO_CONFIRMADO_POR_CANAL_AUTORIZADO
  -> CONCLUIDO
  -> PROXIMO_PERFIL
```
A análise de IA só deve ocorrer após identificar um post elegível. Se tema não comportar conexão legítima com água/efluentes, evitar comentário comercial. Verificar curtida **e comentário existentes** antes de criar interação. Uma ação só é registrada como executada após confirmação verificável do canal, não após mero clique do operador.

Se nenhum post elegível: registrar motivo e avançar. Separar `SEM_POST`, `TODOS_JA_INTERAGIDOS`, `PERFIL_INACESSIVEL`, `BLOQUEIO_DO_CANAL` e `ERRO_REDE`.

## 7. CSV de até 100 MiB
Processamento local em streaming e gravação em lotes com backpressure, sem carregar 100 MiB completos no thread principal. Fila persistente indexada, importação retomável, deduplicação por perfil normalizado e checkpoint por campanha. A UI mostra contadores e apenas registros da página atual; jamais um seletor com milhares de opções. Custo de importação deve ser medido com amostras reais de 3, 25 e 100 MiB.

Evitar armazenar o CSV completo na memória do webview ou no Store/CAS do CRM. Para POC web, IndexedDB; para app desktop estável, SQLite WAL com transações em lote.

## 8. Compliance e segurança
A API pública do LinkedIn não dá acesso irrestrito a ler qualquer perfil/post e realizar likes/comentários em terceiros. Autorização de conta e autorização de API são distintas. O LinkedIn proíbe software de terceiros que extraia ou automatize atividades sem permissão: https://www.linkedin.com/help/linkedin/answer/a1340567?lang=pt

Consequência: o protótipo pode oferecer login e navegador integrado para **navegação do usuário**, plus análise de conteúdo com consentimento e aprovação humana; descoberta automática de posts e interação/publicação programática exigem avaliar permissões oficiais e contrato aplicável. Não implantar técnicas de ocultação/evasão de detecção, bypass de CAPTCHA ou contorno de bloqueios. Nunca afirmar proteção garantida por pausas.

## 9. Gates de aceite
- Navegador LinkedIn renderizado **dentro da mesma janela nativa do aplicativo**; nunca `window.open()` do PWA.
- Autenticação manual no domínio oficial; senha não persiste no CRM/Supabase; sessão isolada por usuário.
- Importação de CSV de 100 MiB com memória limitada e sem travar UI; barras de progresso e cancelamento.
- Resumo de filas, skip, pausa, retomada após reinício e reconciliação idempotente.
- A IA usa texto válido do post e contexto conhecido, não inventa problemas nem resultados de cliente.
- Testes de navegação, isolamento de sessão, URL maliciosa, recuperação de erro, desempenho, segurança IPC, quotas autorizadas.
- Para qualquer publicação automatizada: revisão contratual de permissões e testes ponta a ponta no canal autorizado.
- Preservar telas, sincronização, permissões, Store/CAS, Inteligência Comercial e Inteligência de Mercado do CRM.

## 10. Decisão sobre a implementação PWA v286.90 e a branch de CSV
A v286.90 publicada é **campanha assistida**, não atende ao requisito final. A branch `feature/linkedin-leads-ux-csv100m-20261107` contém componentes iniciais de importação CSV em lotes e fila IndexedDB, mas **não contém navegador desktop, conector aprovado nem execução real**. Não publicar a branch apenas porque o CSV melhorou; é necessário completar e homologar o aplicativo desktop antes de declarar a arquitetura equivalente ao Linked Helper.
