# Manual completo do IaD CRM — arquitetura, funcionalidades e tecnologias

**Revisão:** 08/11/2026  
**Versão pública verificada durante esta auditoria:** v286.94  
**Versão candidata com atualização do Manual e contatos nas Pistas:** v286.95 (proposta; não é automaticamente produção).  
**Branch funcional:** claude/decisoes-estagios-vendas-eckjo0.  
**Código:** GitHub maiaalex2306/iad.

## 1. Regra central e arquitetura de decisão

O IaD CRM distingue etapa do funil de evidência de decisão do comprador. O núcleo é formado por oito decisões: Problema, Prioridade, Impacto, Critérios, Stakeholders, Consenso, Risco e Processo. Cada dimensão tem cinco degraus (0 a 4), totalizando IAD de 0 a 32. Força do registro e autoria da fala são relevantes: iniciativa do vendedor, clique ou abertura de link não significam automaticamente decisão do cliente. A lógica determinística fica em `src/playbook.js` e `src/engine.js`, separada das sugestões de IA.

Elementos de gestão: Evidence Age, Velocity, Stakeholder Coverage, Proposal Gate, histórico e snapshots, riscos de funil, previsão fundamentada, tarefas, compromisso com data, desfecho e aprendizado semanal. A IA pode sugerir interpretações, nunca gravar silenciosamente uma pontuação ou avanço.

## 2. Mapa funcional por tela

| Área | Capacidade implementada no código | Fonte e condição |
|---|---|---|
| Hoje | Fila priorizada, riscos, próximos passos e orientações | Registros do CRM e regras do motor |
| Painel | Indicadores, análise e aprendizado comercial | Carteira autorizada |
| Pipeline | Etapas, classificação por maturidade, filtros, lista/kanban, importação revisada e nutrição | Registros e ações explícitas |
| Cockpit | Oito decisões, evidências, interlocutores e proposta | Oportunidade escolhida |
| Tarefas | Planejamento, execução, relato, resultado e comprovação de decisão | Vinculação a conta e oportunidade |
| Conversas | Revisão de WhatsApp e associação a contatos | Integração e autorização configuradas |
| Cadastros | Empresas, pessoas, negociações e catálogos | Criação e edição controladas |
| Nutrição | Requalificação e retorno planejado | Ação explícita do usuário |
| Notas rápidas | Anotações e possível conversão em tarefas | Registro individual |
| Inteligência Comercial | Radar de oportunidades baseado no CRM | Leitura interna, sem busca externa |
| Inteligência de Mercado | Descoberta de empresas externas | Busca manual e fontes verificáveis |
| LinkLeads | Integração com app desktop externo e modo assistido | Dependência do app e da ponte |
| Método | Manual, cadência, critérios, arquitetura e limites | Conteúdo carregado sob demanda |
| Configuração | Nuvem, integrações, usuários, importação e diagnóstico | Permissão necessária |

O `README.md` histórico ainda citava a primeira geração local e um IAD de 0 a 16; estas informações não representam o mecanismo atual. O estado de referência deve ser conferido no código versionado e na instância pública.

## 3. Inteligência Comercial — exclusivamente dados internos

Arquivos: `src/ri/account-view.mjs`, `src/ri/opportunity-radar.mjs`, `src/ri/internal-cues.mjs`, `src/ri/conversation-intent.mjs`, `src/ri/portfolio-analytics.mjs` e `src/ri/account-briefing.mjs`.

O Radar é **read-only** e usa o snapshot autorizado do Store. Não consulta notícias na web nem modifica IAD, negociação ou tarefa. Seus grupos são:

1. **Pistas da carteira:** identifica intenção em fala real do prospect, com fonte, data, justificativa e próxima ação. A classificação local é imediata; evidência derivada de IA exige que a citação corresponda literalmente à fala do prospect. Transcrições separam SDR e comprador. São admitidas necessidades diferentes na mesma conta.
2. **Upsell:** identifica clientes com negócio ganho e produto registrado, para investigar ampliação. Não equivale a demanda confirmada.
3. **Cross-sell:** identifica itens comprados por pelo menos duas outras contas do mesmo segmento, sem atribuir interesse automático à conta analisada.
4. **Contas esquecidas:** ausência de interação documentada por 90 dias e ausência de próximo compromisso. Não prova inatividade real fora do CRM.
5. **Notícias e movimentos:** somente fontes externas já registradas no CRM, datadas, com link HTTPS e exigência de conferência; não pesquisa mercado nesta área.
6. **Segmentos em crescimento:** série de vendas **internas** dos últimos 180 dias versus os 180 anteriores, com mínimo amostral. Nunca extrapolar crescimento do mercado.

### RI-45 — Contatos nas Pistas da carteira

Abaixo do nome da empresa, o cartão apresenta **Contato: nome**, **LinkedIn** e **telefone**, quando registrados e autorizados. A associação prioriza `contatoId` do evento, depois a correspondência literal da fala com evento de decisão identificado, depois o único contato vinculado à oportunidade; havendo somente um contato cadastrado na empresa, ele é exibido com ressalva de que a autoria é desconhecida. Quando a identificação é ambígua, apresenta **Contato a confirmar**.

As chaves de relacionamento combinam `tenantId`, `contaId` e `sourceOpportunityId`. Um perfil LinkedIn só vira link com HTTPS, hostname LinkedIn e caminho de perfil; o telefone usa `tel:` após validação do número. Nada é extraído arbitrariamente de conversas para preencher o cadastro. O índice fica em memória por renderização e não adiciona chamadas de rede.

## 4. Inteligência de Mercado — exclusivamente pesquisa externa

Arquivos: `src/ri/market-view.mjs`, `market-contract.mjs`, `market-investigation.mjs`, `market-signals.mjs`, `market-enricher.mjs`, `market-audit.mjs`, `market-city-cache.mjs`, `market-progress.mjs`, `sector-intelligence.mjs`, `market-tenant-scope.mjs` e Edge Function `nuvem/funcoes/market-search/index.ts`.

Busca é iniciada pelo vendedor por **Buscar empresas**, nunca por boot, refresh ou abertura silenciosa. Filtros incluem UF, municípios/códigos IBGE, DDD, segmento autorizado, porte/funcionários e ICP. A consulta combina OpenAI e/ou Anthropic conforme opção e configuração. Fontes, custos, cobertura e qualidade variam. Dados como número de funcionários e CNPJ podem permanecer pendentes ou não verificados; empresas não são fatos confirmados apenas por aparecerem em uma lista.

Os resultados não criam contas ou contatos automaticamente. O front e o servidor possuem regras próprias de autorização e confirmação; a flag de importação pode estar desativada. Distinga: candidato encontrado, fonte citada, identidade confirmada, importação autorizada e gravação confirmada. Progresso laranja é indeterminado/visual, não porcentagem real do provedor. Ao navegar, preservar escopo tenant e sessão; não enviar todo o CRM como contexto à IA externa.

## 5. Linked Helper, LinkLeads e console assistido

`src/integracoes.js` normaliza webhooks e dados recebidos por uma ponte Cloudflare Worker (`ponte/`). O usuário confere a importação; contatos, contas, oportunidades, tarefas e histórico são gravados conforme rotina já existente. As origens Linked Helper e LinkLeads são separadas por `linkleads_origem` e por ações distintas, evitando tratar a resposta de uma como a da outra.

`LinkLeads` é **aplicativo desktop próprio**, no repositório maiaalex2306/linkleads, acionado pelo protocolo `linkleads://`. Não significa que todo o CRM virou desktop. O modo assistido do navegador permanece como alternativa. A fila local de perfis usa IndexedDB; exportar/restaurar campanha por JSON é transporte voluntário, não sincronização bidirecional. O código histórico de Electron/execução no GitHub não comprova que login real e automação estejam homologados. Senhas, cookies e MFA do LinkedIn não devem ser copiados para o CRM.

Importação com IA deve diferenciar fala do comprador, mensagem da SDR, cortesia, recusa e pedido efetivo. Recusa não vira oportunidade automática. Quando registrada, a oportunidade aponta o contato real; não transformar hipótese de intenção em receita sem validação.

## 6. Tecnologias e componentes

| Camada | Tecnologia verificada no repositório | Responsabilidade |
|---|---|---|
| Interface | HTML5, CSS3, JavaScript, ES Modules | Telas, navegação, formulários, componentes e validações |
| PWA | Web App Manifest e Service Worker | Instalação e cache versionado do shell |
| Backend de dados | Supabase, PostgreSQL | Persistência, Auth, controles por tenant e RLS |
| Funções server-side | Supabase Edge Functions, TypeScript/Deno | IA, pesquisa externa, convites, e-mail e WhatsApp |
| IA assistente | OpenAI, Anthropic, Groq conforme secrets | Interpretação e apoio, com fallback configurado |
| IA pesquisa externa | OpenAI/Anthropic com ferramentas de pesquisa web | Descoberta manual e investigações de empresas |
| Integração comercial | Cloudflare Worker, webhooks, protocolo LinkLeads | Coleta intermediada e segregada de leads |
| Armazenamento local complementar | IndexedDB | Anexos e fila de campanhas; não é a fonte principal do CRM |
| Sincronização | Store, Nuvem, Sincronia, filas, revisão/CAS | Confirmar persistência, reexecução e resolução de divergências |
| Testes | Node.js test runner, Playwright/Chromium, GitHub Actions | Contratos, regressão, browser, isolamento e integridade |
| Implantação | GitHub e site público iadcrm.com.br | Código estático e recursos versionados |

Arquivos principais: `src/app.js` (roteamento), `src/views.js` (telas), `src/views-manual.js` (Manual lazy), `src/store.js` (dados e índices), `src/auth.js` (acesso), `src/engine.js` e `playbook.js` (decisões), `src/nuvem.js`/`sincronia.js`/`cas-queue.js` (persistência), `src/ia.js` (orquestração de IA) e `src/ri/` (inteligências).

**Condição de rede:** o Service Worker pode carregar arquivos da interface previamente instalados offline. Porém login, autenticação, atualização de carteira, IA e pesquisa de mercado exigem servidor/rede. Não prometer operação comercial integral offline.

## 7. Segurança, integridade e autorização

- O cliente jamais recebe chave `service_role` ou chave privada de IA; segredo pertence às funções de servidor. Publishable key não substitui RLS.
- Gestor/admin visualiza as inteligências conforme regras e escopo habilitado. Filtros de tenant e dono não podem vazar contato de outra empresa.
- Contato é associado por identificadores do próprio CRM; não inferir responsável por semelhança da empresa ou pela presença de telefone no texto da conversa.
- Links recebidos do usuário/IA passam por verificação de protocolo, host e finalidade antes de virarem ações na UI.
- A separação é mandatória: dados internos em Inteligência Comercial, pesquisa externa em Inteligência de Mercado.
- Recomendações não constituem avanço do IAD. A IA lê e sugere, o motor calcula e o usuário decide.

## 8. Performance, resultados de auditoria e limites

O código inclui carregamento sob demanda de Manual/Inteligência Comercial/Inteligência de Mercado, cache limitado a snapshot e revisão da sessão, índices no Store, caminhos incrementais de sincronização, otimizações de renderização e instrumentos PERF-02 a PERF-40. A instrumentação não é promessa de latência final.

Na auditoria PERF-40 de 07/11/2026, o diagnóstico administrativo em produção registrou 397 oportunidades lidas via SELECT * em 191,464 ms, versus SELECT somente ID em 0,961 ms; 473 tarefas em 92,753 ms. É amostra de conexão administrativa, não P95 de gestor autenticado. O peso de colunas JSONB e transmissão deve ser medido; não executar DDL/RLS como reação automática a uma consulta. Exigir pelo menos 30 amostras reais comparáveis por fluxo, com aparelhos, rede, sessão e cache controlados.

## 9. Homologação exigida para a v286.95

1. Confirmar que `src/config.js` e `sw.js` exibem a mesma nova versão e que `src/ri/radar-contact.mjs` está no precache.
2. Executar testes de sintaxe, RI-45, RI-08, inteligência comercial, renderização do Manual e Playwright/Chromium.
3. Verificar contatos com um e vários stakeholders, evento de decisão com `contatoId`, fala citada, ausência de vínculo, falta de telefone e URL maliciosa.
4. Executar testes com gestor e administrador filtrando tenant/dono; não renderizar nomes, URLs nem telefones de outra empresa.
5. Verificar zero alteração de carteira, zero chamada adicional ao servidor e nenhuma importação implícita no radar.
6. Verificar deploy público, atualização PWA/cache, reabertura offline do Manual e rollback coerente.
7. Separar aprovação de CI da homologação real das Edge Functions, pesquisa e aplicativo LinkLeads.

## 10. Indicadores de resultado e oportunidades de inovação

Medir **pistas com interlocutor identificado**, percentual de pistas com LinkedIn e telefone válidos, tempo para qualificar, proporção de pistas que geram próxima interação, conversão em proposta, ciclo até a decisão, propostas ganhas e oportunidades esquecidas reativadas. Definir o denominador e capturar linha de base antes de atribuir ganho de performance. Não inventar percentuais de conversão.

Melhoria recomendada: botão de **confirmar interlocutor** no cartão, com link para ficha do contato; um segundo passo pode propor tarefa e próximo contato com data e proprietário para aprovação explícita. Outra melhoria é identificar **qualidade dos dados de relacionamento** por conta, sem varrer rede externa na Inteligência Comercial.

## 11. Documentos e limites de evidência

Referências internas verificadas nesta revisão: `docs/RI08-LINKEDHELPER-INTENCOES-HOMOLOGACAO.md`, `docs/LINKLEADS-INTEGRACAO-v28694.md`, `docs/PERF40-AUDITORIA-SINCRONIZACAO-20261107.md`, testes e workflows em `tests/`, `scripts/` e `.github/workflows/`.

**Nota de estado:** funcionalidade no código, teste sintético aprovado, credencial configurada, serviço externo operacional e publicação pública são estados distintos. A existência de um arquivo, PR ou workflow não autoriza alegar que todos os provedores e dispositivos estejam homologados.
