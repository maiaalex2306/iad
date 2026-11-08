# IaD CRM — Gestão comercial orientada à decisão

> **Documentação atualizada em 08/11/2026.** A versão publicada e verificada antes desta revisão é **v286.96**. A **v286.97** foi a atualização do Manual; a **v286.98** acrescenta o painel prático Aprenda Vendendo — 24 horas e renomeia o menu Método para Treinamento de Vendas. O [Manual Completo v286.97](docs/MANUAL-COMPLETO-v28697.md) e a tela **Método** (`#/playbook`) são a documentação operacional principal. Os arquivos v286.95 e RI-46 são históricos.

**O funil organiza. A decisão fecha.** O sistema mede evidência das decisões do comprador, não apenas tarefas realizadas pelo vendedor.

## Como começar

Faça login em [iadcrm.com.br](https://www.iadcrm.com.br/), entre na opção **Treinamento de Vendas**. Comece pelo painel **Aprenda Vendendo — 24 horas** e depois abra o grupo **Funcionalidades atuais e solução de problemas**. Os capítulos explicam os fluxos comerciais, inteligências, Linked Helper, campanhas assistidas, IA, permissões, sincronização e diagnóstico. O grupo **Método IAD, telas e rotina comercial** preserva o guia original das oito decisões.

O **IAD possui oito dimensões, cada uma de 0 a 4 pontos (total 0 a 32)**: Problema, Prioridade, Impacto, Critérios, Stakeholders, Consenso, Risco e Processo de compra. Só as evidências do cliente movem a maturidade da decisão; a IA interpreta e sugere, mas não pontua nem altera decisões automaticamente.

## Áreas do produto

| Área | Capacidade principal | Restrição |
|---|---|---|
| Hoje, Painel, Pipeline, Cockpit e Tarefas | Fila, execução, evidências, maturidade e gestão de negócios | A carteira autorizada pelo servidor é a fonte |
| Cadastros, Nutrição, Notas e Revisão | Qualidade de dados, fluxo comercial e rotinas do vendedor | Edição explícita, conforme permissões |
| Inteligência Comercial | Pistas, upsell/cross-sell, contas esquecidas, sinais internos e crescimento das vendas cadastradas | **Somente leitura interna; sem consulta web** |
| Inteligência de Mercado | Pesquisa externa por território, DDD, segmento, ICP e IA, com investigação adicional | **Busca por clique; importação bloqueada no piloto** |
| Linked Helper | Importação revisada de leads/conversas por ponte e empresa | SDR não é prospect; não presumir compra |
| LinkLeads / LinkedIN Leads | Aplicativo desktop separado e console assistido com CSV/TXT de até 100 MiB, fila IndexedDB e checkpoint | Publicações e curtidas no modo assistido exigem confirmação humana |
| Conversas e E-mail | Associação de comunicações a contatos e negociações | Fonte externa e vínculo precisam estar configurados e validados |
| Método e Configuração | Manual, identidade, integrações, PWA, diagnóstico e segurança | Alguns controles dependem de perfil/ambiente |

**Guia da jornada prática:** [Treinamento Aprenda Vendendo — 24 horas](docs/TREINAMENTO-VENDAS-24H-v28698.md). O antigo nome do menu era Método; a rota `#/playbook` foi preservada.

## Tecnologias e segurança

O frontend utiliza HTML5, CSS responsivo, JavaScript/ES Modules e PWA com cache do **app shell estático**. O estado principal da carteira fica no **Supabase/PostgreSQL**, com Auth, RLS por empresa e sincronização; o navegador pode manter pendências e dados auxiliares de fluxo, incluindo IndexedDB. **O CRM completo não é uma base offline independente.**

As Edge Functions usam TypeScript/Deno e segredos de servidor. O assistente oferece provedores OpenAI, Anthropic e Groq conforme configuração; Inteligência de Mercado usa pesquisa externa com OpenAI e/ou Anthropic. Os resultados exigem conferência. A plataforma integra pontes de Linked Helper/LinkLeads, e-mail e WhatsApp, cada qual sujeita à implantação e permissões próprias.

**Nunca coloque service_role, tokens de usuários, chaves privadas, senhas ou cookies de LinkedIn no frontend, no Manual ou em relatórios.**

## Versionamento, testes e publicação

- `src/config.js` apresenta `window.IADVersao`; `sw.js` apresenta a versão do cache. Devem coincidir na mesma release.
- `src/views-manual.js` contém o Manual, carregado sob demanda pelo `src/app.js`.
- Testes: Node.js, GitHub Actions e Chromium/Playwright, além de checagens de acesso, tenant e RLS.
- O deploy de um arquivo estático não prova funcionamento de IA autenticada, sincronização com dados reais ou ausência de conflito. Homologar serviços e dados separadamente.
- Em caso de edições pendentes, **não limpe dados do navegador**, não use descarte e não sobrescreva a carteira antes de conciliar e preservar cópia.

## Documentos

- [Manual Completo v286.97](docs/MANUAL-COMPLETO-v28697.md) — referência atual, passos por tela e tecnologias.
- [Manual de base v286.95](docs/MANUAL-COMPLETO-v28695.md) — histórico técnico.
- [RI-46 — Pistas recentes](docs/RI46-PISTAS-RECENTES-20261108.md) — filtros, contato/telefone e paginação.
- [PERF-40 — Auditoria de sincronização](docs/PERF40-AUDITORIA-SINCRONIZACAO-20261107.md) — medições e limites.
- [RI-08 — Intenção comercial](docs/RI08-LINKEDHELPER-INTENCOES-HOMOLOGACAO.md) e [LinkLeads v286.94](docs/LINKLEADS-INTEGRACAO-v28694.md) — verificações específicas.

**Critério de resultado:** medir P50/P95 em sessão real e a conversão de pistas em abordagens, reuniões, propostas e ganhos, sem inventar percentuais.
