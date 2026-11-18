# LinkLeads × IaD CRM — v286.94

O **LinkLeads** é o app desktop de prospecção (repositório `maiaalex2306/linkleads`): roda no computador do
vendedor, com a sessão do LinkedIn dele, e faz convites, sequências, comentários com IA e o mapeamento do grupo
comprador. O IaD CRM continua sendo onde a decisão é administrada.

## O que mudou no IaD CRM

| Onde | Mudança |
|---|---|
| Menu | "LinkedIN Leads" passou a se chamar **LinkLeads**. Entrar nele abre o app pelo link `linkleads://abrir?origem=iadcrm&empresa=<id>&empresaNome=<nome>`, uma vez por entrada (atualização de dados não reabre). Se o app não abrir, a tela explica e expande o **modo assistido** (o console antigo, intacto). |
| Pipeline | Botão **LinkLeads** ao lado de **Importar LH**. Mesmo fluxo: conferir, classificar, importar e dar baixa na ponte. |
| Ponte | **Sem mudança no Worker.** O LinkLeads entrega no mesmo balde da empresa (`?k=<escrita>&e=<empresa>`), no formato do Linked Helper, com `linkleads_origem: "linkleads"`. `IADIntegracoes.buscar('linkleads')` leva só esses; `buscar()` (Importar LH) leva só os outros. Cada botão dá baixa só no que importou. |
| Papel na compra | O LinkLeads usa a **mesma taxonomia** do playbook (`P.PAPEIS`). O papel vem em `linkleads_papel` e, se confirmado pelo vendedor no LinkLeads (`linkleads_papel_confirmado: 1`), a IA da importação **não o substitui**. Papel fora do playbook é ignorado. |
| Oportunidade | Título "— origem LinkLeads", `origem: 'LinkLeads'`, fonte **LinkLeads** no catálogo (separada de Linked Helper para o painel por fonte e campanha). Notas trazem o papel, a leitura da resposta pela IA do LinkLeads e o comitê. **Nada disso é evidência**: a evidência continua sendo só a fala do cliente. |

## Configuração (uma vez por vendedor)

No LinkLeads: Configurações → Integrações → Webhook → formato **Linked Helper**, URL = o mesmo endereço de entrada
da ponte desta empresa (chave de **escrita** + `e=`), evento **Resposta recebida**, Ligado.

## Testes

- `node --test tests/linkleads-integracao.test.mjs`: separação por origem no mesmo balde, papel confirmado, papel
  inválido descartado, item do Linked Helper inalterado.
- `node scripts/linkleads-integracao-browser.cjs`: Chromium real, sem Supabase/LinkedIn/ponte reais. Cobre menu, link
  com a empresa certa, abertura uma vez por entrada, aviso sem app, importação pelo botão LinkLeads (origem, fonte,
  papel, notas, baixa seletiva) e o Importar LH intacto.
- `node scripts/linkedin-leads-browser.cjs` (já existente) passa: o modo assistido não regrediu.
- As 3 falhas da suíte completa (`perf-ri04-crosssell-index`, `perf39-kanban-index`, `PERF-36K1 … v286.74`) já
  falhavam na v286.93 de produção, antes desta mudança.
