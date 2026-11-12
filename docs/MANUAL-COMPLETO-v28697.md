# Manual completo do IaD CRM — v286.97

**Revisado em 08/11/2026.**
**Versão pública confirmada ao início da revisão:** v286.96. **Versão desta atualização documental:** v286.97, candidata até a conclusão de testes, merge e deploy.
**Repositório:** [maiaalex2306/iad](https://github.com/maiaalex2306/iad) · **Tela no CRM após login:** `#/playbook`.
**Documento canônico desta release:** este arquivo; os mesmos dez guias operacionais são incorporados ao Manual dentro do aplicativo, preservando os capítulos históricos do método.

> **Estados distintos:** funcionalidade implementada no repositório, testes automatizados aprovados, backend/Edge Function implantado, operação autenticada homologada e versão pública publicada não são equivalentes. As ações de inteligência não escrevem automaticamente no CRM. A importação da Inteligência de Mercado continua bloqueada no piloto.

## Painel — Aprenda Vendendo: primeiras 24 horas

A tela **Treinamento de Vendas** (rota `#/playbook`, antigo nome de menu “Método”) abre com o painel prático **Aprenda Vendendo — 24 horas**, antes do Manual. O roteiro de sete etapas acompanha as primeiras 24 horas corridas desde o clique voluntário em **Iniciar minha jornada**. As etapas têm janelas indicativas de 0–2, 2–5, 5–8, 8–12, 12–17, 17–21 e 21–24 horas.

O treinamento foi desenhado para aprender a operação essencial **executando atividades com registros reais autorizados**, terminando com uma shortlist de contatos e convites de reunião enviados. Concluir o roteiro não garante fechamento, confirmação de reuniões nem domínio absoluto do CRM: a resposta é decisão do comprador.

**Meta prática orientativa:** revisar 15–20 leads, identificar pelo menos cinco contatos e canais confiáveis, executar 5–10 abordagens personalizadas e registrar pelo menos três convites concretos para reunião com próximos passos. Cada marcação é manual e **não representa comprovação automática** de mensagem, lead importado, reunião agendada ou score IAD.

O avanço é salvo **apenas no navegador**, com chave isolada por usuário e empresa e sem armazenar contatos, mensagens ou outros dados da carteira. Para administradores, selecione uma empresa específica antes de iniciar. O progresso não é sincronizado entre dispositivos; quando o armazenamento local estiver indisponível, a interface informa que as marcações só serão mantidas durante a sessão.

Gestores podem consultar Inteligência Comercial e investigar dados externos em Inteligência de Mercado, respeitando o bloqueio atual de importação do piloto; vendedores devem usar sua carteira autorizada, Cadastros, Pipeline, Hoje e Tarefas. Se não houver leads iniciais, o operador deve obter uma lista autorizada, usar cadastro/importação revisada ou o processo configurado do Linked Helper. Nenhum lead é criado, enviado ou importado pelo treinamento.

As sete entregas verificáveis cobrem ambientação, ICP, qualificação de sinais, validação de interlocutores, abordagem, gestão de respostas/evidências e solicitação de reuniões. O Manual metodológico completo permanece imediatamente após o painel, com índice de capítulos e as oito decisões.

## Navegação rápida

- 1. Guia de operação: da oportunidade ao próximo compromisso
- 2. Pistas da carteira — instruções da v286.96
- 3. Inteligência de Mercado — pesquisa externa passo a passo
- 4. Máquina de Prospecção — o significado das seis etapas
- 5. LinkedIn — três fluxos, com responsabilidades diferentes
- 6. Persistência e recuperação — não perca uma edição
- 7. Perfis, empresas e acesso à inteligência
- 8. Assistente e pesquisa externa — modelos, limites e diagnóstico
- 9. Diagnóstico rápido: problema, causa provável e ação segura
- 10. Como a arquitetura sustenta rapidez e integridade

---

## 1. Guia de operação: da oportunidade ao próximo compromisso

Use esta sequência para transformar informação em atividade comercial controlada. O Painel mede resultados; a Inteligência Comercial identifica hipóteses, mas não executa contatos ou altera dados.

| Procedimento / conceito | Aplicação e cuidado |
|---|---|
| **1. Triar** | Na **Inteligência Comercial → Pistas da carteira**, abra **Entradas de hoje** ou ordene por **Mais recentes**. Diferencie **HIPÓTESE COMERCIAL** de **NOVO REGISTRO · REVISAR**. |
| **2. Identificar** | Leia a fala original, origem e datas. Confira o **Contato**, o link do **LinkedIn** e o **Telefone**. Se aparecer A confirmar, abra a conta e valide o interlocutor antes de ligar. |
| **3. Investigar** | Clique em **Analisar conta** para ver contatos, lacunas e perguntas; em **Abrir registro** para chegar à negociação. A evidência pertence à oportunidade indicada, não a qualquer negócio da empresa. |
| **4. Definir objetivo** | No Cockpit, escolha qual das oito decisões do comprador precisa avançar. Confirme papel, impacto, risco, critérios e próximo compromisso; não marque avanço porque uma proposta foi enviada. |
| **5. Executar** | Crie uma **Tarefa** com conta, negociação, canal, pessoa, decisão-alvo e data. Registre o que aconteceu, inclusive ausência de avanço. |
| **6. Aprender** | Compare o resultado da tarefa com o próximo passo e o desfecho. Use Painel e Aprendizado para medir conversão e qualidade das interações, sem confundir a quantidade de contatos com progresso do cliente. |

Regra de segurança: os cartões de inteligência são somente leitura. Qualquer modificação da carteira exige ação explícita nos módulos comerciais.


## 2. Pistas da carteira — instruções da v286.96

Este módulo lê somente o histórico interno autorizado. O detector local procura sinais textuais e valida citações de IA contra a fala atribuída ao prospect. A mesma empresa pode apresentar negociações diferentes.

| Procedimento / conceito | Aplicação e cuidado |
|---|---|
| **O que aparece** | O cartão distingue **HIPÓTESE COMERCIAL** (indício textual identificado) e **NOVO REGISTRO · REVISAR** (negociação incluída há até 14 dias, sem intenção explícita detectada). Nenhum dos dois equivale a compra confirmada. |
| **Entrada x fala** | **Entrada no CRM** indica quando a oportunidade foi criada na carteira; **Data da fala/registro** indica quando a mensagem ou atividade aconteceu. Uma conversa antiga importada hoje aparece em Entradas de hoje, sem alterar sua data original. |
| **Filtro hoje** | Clique em **Entradas de hoje (N)** para mostrar apenas registros criados na data local da sessão. Esse botão é um filtro de interface, não uma busca adicional no Supabase. |
| **Ordenar** | Use **Mais recentes** (padrão) ou **Maior prioridade**. Prioridade é uma regra do detector e não probabilidade de fechamento, receita prevista ou decisão tomada. |
| **Ver mais** | A tela renderiza **12 cartões por lote**. Clique em **Ver mais** para os seguintes; o limite de 12 não elimina as demais pistas calculadas. Sinais secundários aparecem em **Outros sinais desta conta**, com expansão sob demanda. |
| **Contato / LinkedIn / Telefone** | São campos visualmente identificados abaixo da empresa. O nome é associado ao evento/transcrição/negócio do mesmo tenant quando há vínculo confiável; URL LinkedIn só é clicável quando válida e HTTPS; telefone só quando seu formato permite discagem. |
| **A confirmar** | Se o evento não identifica corretamente o autor, a tela não inventa contato. O único contato cadastrado pode ser mostrado com ressalva de autoria desconhecida. Consulte a ficha da conta. |
| **Fonte e ação** | Leia **Por que apareceu**, a origem, as datas e a **Próxima ação recomendada**; esta última é uma hipótese operacional, nunca um envio automático. |
| **Demais frentes** | **Upsell:** histórico de venda ganha; **Cross-sell:** compras em pares do mesmo segmento; **Contas esquecidas:** ausência de interação documentada; **Notícias:** somente sinais já registrados; **Crescimento:** vendas internas, não mercado externo. |

Se uma negociação recém-importada não aparecer: confirme que a carteira foi sincronizada, o escopo de empresa/gestor, a data `criadoEm` e o botão Ver mais. Sem intenção reconhecida ela deve aparecer como REVISAR, não como falso pedido de proposta.


## 3. Inteligência de Mercado — pesquisa externa passo a passo

É o módulo para empresas e profissionais **fora** da carteira. A busca só ocorre quando o usuário clica em **Buscar empresas**. Diferentemente da Inteligência Comercial, depende de pesquisa externa, internet, cota e provedor configurado.

| Procedimento / conceito | Aplicação e cuidado |
|---|---|
| **1. Delimitar** | Escolha **UF**, municípios oficiais com código **IBGE**, **DDDs**, **segmentos autorizados** e faixas de funcionários. O catálogo municipal pode usar IBGE com fallback BrasilAPI; a seleção de segmentos deve respeitar a empresa atual. |
| **2. Refinar o ICP** | Abra **Filtros avançados** para região, CNAE, porte, faturamento e demais critérios apresentados. Use nomes próximos sugeridos apenas após revisão: correspondência semântica não cadastra segmento novo automaticamente. |
| **3. Motor e limite** | Selecione **ChatGPT + Claude**, **Somente ChatGPT** ou **Somente Claude**; escolha **até 20** ou **até 50** candidatas por consulta. O teto controla a resposta, não a cobertura total do território. |
| **4. Verificar antes** | O botão **Verificar acesso às IAs** confere credenciais/modelos sem realizar pesquisa web. Modelo disponível não garante ferramenta de busca, qualidade das fontes ou resultado no ICP. |
| **5. Buscar** | Clique em **Buscar empresas** uma vez e acompanhe o painel de progresso. A faixa animada **não mede percentual real**. Ocultar o painel não garante cancelamento do processamento nem estorno de cota. |
| **6. Interpretar** | Cada empresa é **candidata**, não cadastro verificado. Confira CNPJ, cidade, UF, segmento, porte, faixa de empregados, site, decisores, notícias e conflitos entre provedores. URL HTTPS citada ainda exige leitura humana. |
| **7. Priorizar** | O índice de revisão 0–100 serve para ordenar a triagem: **não** é chance de compra. Dado pendente, CNPJ ausente e possível duplicidade permanecem para investigação, sem qualificação fictícia. |
| **8. Importar** | Na versão publicada, **a importação automática da pesquisa externa está desabilitada no piloto**. A pesquisa não cria conta, contato ou oportunidade. Um futuro fluxo de importação depende de validação da identidade, aprovação explícita e habilitação de backend/frontend. |
| **Mensurar** | A seção de observabilidade registra reservas, pesquisas concluídas, ferramentas web e URLs citadas nos últimos sete dias; reserva de cota não prova busca completa. |

Use **Inteligência de Mercado** para descobrir fora do CRM e **Inteligência Comercial** para analisar exclusivamente a carteira já cadastrada. Não misture os dois contextos.


## 4. Máquina de Prospecção — o significado das seis etapas

As seis etapas organizam **uma pesquisa já retornada**; não representam seis agentes autônomos navegando em paralelo, nem seis pesquisas adicionais. Cada botão de investigação é separado e pode consumir outra cota.

| Procedimento / conceito | Aplicação e cuidado |
|---|---|
| **Finder** | Recebe candidatas apresentadas pelo motor externo, sem promessa de cobertura integral do mercado. |
| **Analyst** | Organiza dados empresariais e fontes citadas; **não** confirma juridicamente a identidade da empresa. |
| **Signal Hunter** | Lista notícias e movimentos para apuração. Há botão adicional **Buscar sinais externos com IA** para empresa com identidade mínima; consome cota. |
| **Enricher** | Organiza contatos fornecidos na pesquisa. **Pesquisar decisores profissionais** é uma investigação adicional, acionada manualmente e sujeita a cota. Não valida automaticamente cargo, e-mail ou vínculo. |
| **Qualifier** | Verifica se os critérios de ICP solicitados foram *declarados*; preenchimento não é comprovação independente da fonte. |
| **Prioritizer** | Ordena uma **shortlist de até 10 candidatas** para revisão humana. Índice de prontidão não é previsão de vendas. |
| **Investigação individual** | **Investigar empresa com IA** ou **Localizar identidade e CNPJ** pode ajudar com dados insuficientes; sem confirmação, a empresa continua pendente. |
| **Confiança nas fontes** | **URL citada pela IA** não é a mesma coisa que **página consultada**; a segunda não prova relação com a candidata. CNPJ sem dígito verificador válido, notícia sem vínculo e fonte inacessível são pendências. |
| **Falha parcial** | Um provedor pode falhar e outro responder. Confira avisos, origem de cada resultado, conclusão da ferramenta web e relatório de consumo antes de repetir a pesquisa. |

A IA nunca deve preencher automaticamente o CRM com resultados da Máquina de Prospecção. O vendedor valida a existência da empresa, a aderência e o interlocutor antes da abordagem.


## 5. LinkedIn — três fluxos, com responsabilidades diferentes

Linked Helper, LinkLeads desktop e console assistido do CRM não são a mesma ferramenta. O CRM não deve exigir senha do LinkedIn, interpretar abertura de perfil como conversa ou registrar curtidas/publicações sem confirmação.

| Procedimento / conceito | Aplicação e cuidado |
|---|---|
| **Linked Helper — entrada de respostas** | Uma ponte recebe os dados exportados; o operador importa e revisa por empresa. A rotina pode criar empresa, contato, oportunidade, tarefa e histórico de conversa segundo os registros autorizados. Resposta da SDR e fala do comprador ficam separadas. |
| **LinkLeads — app desktop** | É um aplicativo separado, aberto por `linkleads://` quando instalado. O menu do CRM oferece também o modo assistido; a existência de código no repositório não garante instalação ou login funcional em cada computador. |
| **Campanha assistida — arquivos** | Importe **CSV ou TXT** com perfis; o parser progressivo suporta arquivos de **até 100 MiB**, em lotes, sem carregar integralmente o arquivo na memória. A fila local persiste no **IndexedDB**, vinculada ao usuário, tenant e filtros. |
| **Revisão de perfis** | Abra o perfil, encontre publicação relevante e preencha manualmente o link/texto quando necessário. O navegador do CRM **não lê o DOM do LinkedIn** para detectar posts automaticamente. |
| **Curtir e comentar** | A IA pode preparar um rascunho; a curtida e o comentário são confirmados pelo operador. O console web não curte nem publica sozinho. Copiar o comentário não prova publicação. |
| **Pausa e ritmo** | Há uma **meta interna** de revisão de 20 perfis em 24 horas e espaçamento operacional; **não são limites oficiais do LinkedIn** nem promessa de segurança de conta. Pause ou encerre manualmente conforme o estado. |
| **Checkpoint e portabilidade** | Exporte/restaure o andamento em **JSON** por ação voluntária. O formato portátil limita até **10.000 registros** e arquivo de **12 MiB**. Checkpoint não transfere cookies, senha ou autenticação e não é sincronização automática entre computadores. |
| **Diferença de interfaces** | O console assistido atual tem importação progressiva de 100 MiB; telas antigas e outros caminhos podem conservar limites menores. Confira o nome da tela antes de comparar restrições. |
| **Qualidade comercial** | Conversa importada não vira automaticamente pedido de proposta. Recusa, cortesia, mensagem da SDR e resposta do prospect têm interpretações distintas; somente sinal rastreável deve aparecer na Inteligência Comercial. |

A automação do LinkedIn e integrações de desktop exigem testes próprios; a homologação do console assistido não constitui homologação automática do aplicativo desktop.


## 6. Persistência e recuperação — não perca uma edição

A **carteira principal está no Supabase/PostgreSQL**; o navegador utiliza estado de trabalho e pode guardar *pendências não confirmadas*. A presença de cache PWA não permite concluir que o CRM inteiro funcione sem servidor. A fila CAS e o envio legado têm salvaguardas próprias.

| Procedimento / conceito | Aplicação e cuidado |
|---|---|
| **Estado da carteira** | A fonte compartilhada é o servidor da empresa autorizada. Ao entrar, o CRM valida a sessão e carrega os dados; não interprete tela vazia durante falha de conexão como perda de oportunidades. |
| **Enquanto sincroniza** | A fila de pendências busca confirmar o envio. O outro aparelho só possui o novo dado após confirmação do servidor. Não confunda **edição local**, **tentativa de envio** e **ACK persistido**. |
| **Falha de conexão** | A tela **Sem conexão com o servidor** oferece **Tentar de novo**. Verifique rede, expiração de sessão, permissão/RLS e saúde do Supabase, sem apagar navegador ou trocar de banco. |
| **Edições CAS pendentes** | A tela específica informa a existência de operações ainda sem confirmação. Use **Conciliar e tentar novamente**; se persistir, use **Salvar cópia das edições** e procure suporte. Nunca aceite um conflito como gravação concluída. |
| **Conflito de revisão** | Duas abas ou pessoas podem alterar o mesmo negócio. CAS depende de revisão esperada e recibo/ACK; divergência não deve gerar upsert cego nem apagar a edição. O mecanismo completo é implantado gradualmente; não afirmar que todas as escritas usam CAS. |
| **Cópias e anexos** | Backup JSON do estado e exportação de edições pendentes não são a mesma operação. Anexos podem estar em armazenamento separado. Confirme que o arquivo exportado é legível e mantenha-o sob acesso restrito. |
| **Operação proibida** | Com qualquer pendência, não limpe cookies/localStorage/IndexedDB, não use **Descartar e recarregar**, não exclua a instalação PWA e não force um novo snapshot sem preservar as edições. |
| **Diagnóstico** | Registre versão de `src/config.js`, cache de `sw.js`, mensagem de erro, quantidade de pendências e horário, sem publicar tokens, nomes de clientes, dados pessoais ou arquivos de backup. |

Se o servidor reconhecer a gravação mas a tela ainda não atualizar, verifique a conciliação e o estado da sessão antes de repetir ações que criem duplicidades.


## 7. Perfis, empresas e acesso à inteligência

Os dados pertencem à empresa (tenant) e são limitados pela sessão e pelas políticas RLS do servidor. A capacidade de exibir uma opção de menu não substitui autorização no backend.

| Procedimento / conceito | Aplicação e cuidado |
|---|---|
| **Vendedor** | Trabalha as contas, contatos, oportunidades e tarefas autorizados. As inteligências destinadas a gestores não são liberadas automaticamente ao vendedor. |
| **Gestor** | Tem acesso à **Inteligência Comercial** e à **Inteligência de Mercado** segundo o escopo da própria empresa. Pode consultar hipóteses da carteira, pesquisar externamente e administrar catálogos autorizados, sem ignorar regras de custo/segurança. |
| **Administrador** | Pode selecionar empresa e responsável conforme suas permissões. Para pesquisar no Mercado, **selecione uma empresa específica**: a opção de todas as empresas não autoriza pesquisa genérica. |
| **Troca de filtros** | Ao mudar empresa, usuário, sessão ou revisão, os índices e visões autorizados são recalculados. Um contato de outro tenant não pode ser associado a uma pista do tenant atual. |
| **Fonte oficial do acesso** | Autenticação Supabase e políticas RLS fazem a proteção real. Validações do navegador e filtros de interface são defesa adicional, não permissão de banco. |
| **Segredos** | Somente a chave pública do Supabase pertence à configuração do navegador. **service_role**, chaves de OpenAI, Anthropic, Groq e credenciais de pontes ficam em serviços seguros, nunca no Manual ou no código público. |
| **Compartilhamento** | Cópias de pendências, exportações de carteira, transcrições, contatos e relatórios de investigação podem conter dados pessoais/comerciais. Transfira somente por canais autorizados e conforme a política da empresa. |

Para investigar divergência entre duas pessoas, compare primeiro empresa, usuário, papel, filtros e situação da sincronização, antes de concluir que a oportunidade desapareceu.


## 8. Assistente e pesquisa externa — modelos, limites e diagnóstico

O IaD possui dois fluxos de IA distintos: o **assistente** trabalha com dados/entrada do usuário e valida campos do CRM; a **pesquisa de mercado** investiga dados externos por clique. A capacidade depende do provedor realmente configurado no ambiente.

| Procedimento / conceito | Aplicação e cuidado |
|---|---|
| **Assistente (Edge Function)** | `nuvem/funcoes/assistente` admite fila de provedores **OpenAI, Anthropic e Groq** conforme credenciais. Modelo rápido e modelo analítico podem ser diferentes; a ordem de fallback é definida no servidor. |
| **Pesquisa externa** | `nuvem/funcoes/market-search` permite ChatGPT/Claude e exige chamada de busca web concluída. Um modelo que responde texto não significa que executou pesquisa confiável. |
| **Quando há falha de IA** | Falha de chave, quota, modelo inexistente, timeout, ferramenta web interrompida ou resposta incompleta têm diagnósticos diferentes. Não repita uma busca paga sem antes conferir se o servidor já reservou cota. |
| **Verificar acesso** | No Mercado, **Verificar acesso às IAs** testa credenciais/modelos sem buscar empresas; capacidade de busca web pode continuar não testada. |
| **HTTP 503 / AI_PROVIDER_NOT_READY** | Significa que o ambiente solicitado não confirmou provedor pronto; um teste de CORS/401 bem-sucedido não comprova resposta autenticada de modelo. A homologação de IA em staging permanece dependente de configuração/teste real. |
| **Análise de evidência** | A IA sugere classificação, dados de ficha, próximos passos ou leitura da ata. Toda sugestão exige conferência do vendedor; não substitui o motor determinístico de pontuação nem inventa decisão, pessoa ou orçamento. |
| **Progresso** | Um modal indica que a operação está aguardando/interpretando; não é percentual medido. Encerrar a visualização não demonstra cancelamento instantâneo do processamento remoto. |
| **Prontidão de produção** | Distinguir **código desenvolvido**, **CI aprovada**, **Edge Function implantada**, **modelo autenticado funcionando** e **resultado correto numa oportunidade real**. São marcos separados. |

Nunca registre chaves ou tokens em comentários de tarefas, mensagens ao suporte, capturas de tela ou exports de diagnóstico.


## 9. Diagnóstico rápido: problema, causa provável e ação segura

Use esta tabela antes de reenviar importações, alterar a carteira ou apagar dados. Cada hipótese depende da confirmação do registro e da sessão.

| Procedimento / conceito | Aplicação e cuidado |
|---|---|
| **Pista nova não aparece** | Confirme **Entradas de hoje**, escolha Mais recentes, clique **Ver mais**, confira data `criadoEm`, empresa autorizada, oportunidade aberta e sincronização. Sem fala de compra validada, procure o cartão REVISAR. |
| **Contato incorreto/ausente** | Consulte o evento de origem e o contato vinculado à oportunidade. Valide duplicidades, autoria da transcrição e associação do contato. Não relacione telefone só por ele estar citado no texto. |
| **Telefone não é clicável** | Confira o cadastro de contato e o formato completo do número. O rótulo Telefone aparece apenas quando existe número considerado válido; campo ausente não é preenchido por suposição. |
| **Mercado retorna poucos nomes** | O teto de 20/50 é por consulta, não universo total. Revise UF, cidades, DDD, faixas, segmentos permitidos, completude da ferramenta de busca e fonte de cada candidata. |
| **CNPJ/decisor pendente** | Acione investigação individual apenas se fizer sentido e confira fontes oficiais. A ferramenta pode consumir cota; sem confirmação, não importe nem presuma contato. |
| **Pesquisa não importa** | O piloto de Inteligência de Mercado tem importação **desabilitada**. Encontrar nome externo não equivale a inserir empresa no Pipeline. |
| **IA retorna 503** | Verifique função implantada, credencial/modelo, ordem de provedores e ambiente de homologação. Não tente resolver com service_role no navegador. |
| **LinkLeads não abre** | Confirme que o aplicativo desktop está instalado e o protocolo `linkleads://` foi registrado; use o modo assistido quando aplicável. Não conclua que a automação externa está validada só porque a tela do CRM abre. |
| **WhatsApp ou e-mail sem vínculo** | Confirme telefone/e-mail do contato, empresa e negociação. Sem vínculo confiável, a mensagem pode permanecer para revisão; não pontue decisões automaticamente. |
| **Carteira parece vazia** | Confira login, empresa/filtro do administrador, servidor e RLS. Se houver fila CAS pendente, concilie e exporte cópia antes de qualquer recuperação. |
| **Manual desatualizado** | Compare **Configuração → Versão** com o carimbo deste Manual e com o cache PWA. Reabra a tela e atualize normalmente; não limpe o armazenamento local quando houver alterações pendentes. |
| **Lentidão** | Use diagnóstico de desempenho em sessão real, com amostras P50/P95 por rota, rede e tamanho de carteira. Um benchmark sintético de Node/Chromium não comprova a experiência de todos os usuários. |

Se o erro persistir, informe apenas operação, versão, horário, etapa e mensagem técnica sanitizada. Não envie dados de clientes ou credenciais.


## 10. Como a arquitetura sustenta rapidez e integridade

A estratégia do IaD CRM combina código web leve com leitura controlada do servidor. Nenhum ganho de velocidade é válido se perder dados, trocar a empresa do registro ou permitir gravações sem confirmação.

| Procedimento / conceito | Aplicação e cuidado |
|---|---|
| **Interface** | HTML, CSS e JavaScript ES Modules, com rotas internas e módulos opcionais carregados sob demanda. O Manual, Inteligência Comercial e Mercado não precisam carregar tudo no início. |
| **PWA** | Service Worker guarda os **arquivos estáticos versionados** para instalação/carregamento. O estado atual da carteira depende do servidor e de sessão; cache de HTML/JS não é base de dados sincronizada. |
| **Banco** | Supabase/PostgreSQL com autenticação e RLS por tenant e usuário. A carteira autorizada abastece Store e visualizações comerciais. Nenhuma tabela privada deve ser exposta por remoção de RLS para acelerar consultas. |
| **Armazenamento complementar** | IndexedDB é utilizado por anexos, filas de campanhas LinkedIn e algumas pendências locais. Não significa que toda a carteira de produção seja uma base offline independente. |
| **Desempenho** | Cache de índices por revisão/escopo, renderização apenas do lote visível, busca sem recarregar tela inteira, carregamento lazy, detecção local com memoização de texto e monitoramento opt-in de durações. |
| **Métricas** | Instrumentação PERF mede navegação, abertura do Cockpit, sincronização, desenho de componentes e tarefas longas. **Dois frames** são aproximação de atualização visual, não medição física universal de paint. |
| **Medição de negócio** | Registrar **P50 e P95** com pelo menos 30 amostras comparáveis por rota: versão, usuário autorizado, rede, cache frio/quente e tamanho da carteira. Não somar durações de requisições paralelas. |
| **Sincronização incremental** | Há trabalho com deltas, revisão e CAS em módulos específicos, com habilitação controlada. O transporte integral não pode ser substituído sem provar paridade de exclusões, RLS, conflito, anexos e recuperação. |
| **Controle de release** | `window.IADVersao` em `src/config.js` deve coincidir com `CACHE` em `sw.js`. GitHub Actions, testes unitários e Chromium, canários read-only e verificação do domínio público antecedem homologação. |
| **Tecnologias de IA** | Supabase Edge Functions em TypeScript/Deno e chamadas a APIs externas. Linked Helper utiliza ponte/webhook; LinkLeads é desktop separado. A pesquisa externa é manual, não varredura automática de toda a carteira. |

O principal espaço de inovação futura continua sendo reduzir download e parse dos grandes históricos de oportunidades, mantendo fallback íntegro e métricas autenticadas antes/depois.


---

## Apêndice — método, indicadores e conceitos preservados

Os fundamentos abaixo foram revisados a partir do manual técnico anterior, mantendo o histórico metodológico. Qualquer instrução da primeira geração deve ser interpretada à luz da v286.97: servidor como fonte da carteira, IAD de 0 a 32 e ações explícitas.

### 1. Regra central e arquitetura de decisão

O IaD CRM distingue etapa do funil de evidência de decisão do comprador. O núcleo é formado por oito decisões: Problema, Prioridade, Impacto, Critérios, Stakeholders, Consenso, Risco e Processo. Cada dimensão tem cinco degraus (0 a 4), totalizando IAD de 0 a 32. Força do registro e autoria da fala são relevantes: iniciativa do vendedor, clique ou abertura de link não significam automaticamente decisão do cliente. A lógica determinística fica em `src/playbook.js` e `src/engine.js`, separada das sugestões de IA.

Elementos de gestão: Evidence Age, Velocity, Stakeholder Coverage, Proposal Gate, histórico e snapshots, riscos de funil, previsão fundamentada, tarefas, compromisso com data, desfecho e aprendizado semanal. A IA pode sugerir interpretações, nunca gravar silenciosamente uma pontuação ou avanço.

### 2. Mapa funcional por tela

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

### 3. Inteligência Comercial — exclusivamente dados internos

Arquivos: `src/ri/account-view.mjs`, `src/ri/opportunity-radar.mjs`, `src/ri/internal-cues.mjs`, `src/ri/conversation-intent.mjs`, `src/ri/portfolio-analytics.mjs` e `src/ri/account-briefing.mjs`.

O Radar é **read-only** e usa o snapshot autorizado do Store; a v286.96 acrescentou navegação por páginas sem descartar pistas após 12 cartões. Não consulta notícias na web nem modifica IAD, negociação ou tarefa. Seus grupos são:

1. **Pistas da carteira:** identifica intenção em fala real do prospect, com fonte, data, justificativa e próxima ação. A classificação local é imediata; evidência derivada de IA exige que a citação corresponda literalmente à fala do prospect. Transcrições separam SDR e comprador. São admitidas necessidades diferentes na mesma conta.
2. **Upsell:** identifica clientes com negócio ganho e produto registrado, para investigar ampliação. Não equivale a demanda confirmada.
3. **Cross-sell:** identifica itens comprados por pelo menos duas outras contas do mesmo segmento, sem atribuir interesse automático à conta analisada.
4. **Contas esquecidas:** ausência de interação documentada por 90 dias e ausência de próximo compromisso. Não prova inatividade real fora do CRM.
5. **Notícias e movimentos:** somente fontes externas já registradas no CRM, datadas, com link HTTPS e exigência de conferência; não pesquisa mercado nesta área.
6. **Segmentos em crescimento:** série de vendas **internas** dos últimos 180 dias versus os 180 anteriores, com mínimo amostral. Nunca extrapolar crescimento do mercado.

### RI-45 — Contatos nas Pistas da carteira

Abaixo do nome da empresa, a partir da v286.96, os cartões identificam os campos **Contato**, **LinkedIn** e **Telefone** em blocos próprios, com links somente quando válidos. A associação prioriza `contatoId` do evento, depois a correspondência literal da fala com evento de decisão identificado, depois o único contato vinculado à oportunidade; havendo somente um contato cadastrado na empresa, ele é exibido com ressalva de que a autoria é desconhecida. Quando a identificação é ambígua, apresenta **Contato a confirmar**.

As chaves de relacionamento combinam `tenantId`, `contaId` e `sourceOpportunityId`. Um perfil LinkedIn só vira link com HTTPS, hostname LinkedIn e caminho de perfil; o telefone usa `tel:` após validação do número. Nada é extraído arbitrariamente de conversas para preencher o cadastro. O índice fica em memória por renderização e não adiciona chamadas de rede.

### 4. Inteligência de Mercado — exclusivamente pesquisa externa

Arquivos: `src/ri/market-view.mjs`, `market-contract.mjs`, `market-investigation.mjs`, `market-signals.mjs`, `market-enricher.mjs`, `market-audit.mjs`, `market-city-cache.mjs`, `market-progress.mjs`, `sector-intelligence.mjs`, `market-tenant-scope.mjs` e Edge Function `nuvem/funcoes/market-search/index.ts`.

Busca é iniciada pelo vendedor por **Buscar empresas**, nunca por boot, refresh ou abertura silenciosa. Filtros incluem UF, municípios/códigos IBGE, DDD, segmento autorizado, porte/funcionários e ICP. A consulta combina OpenAI e/ou Anthropic conforme opção e configuração. Fontes, custos, cobertura e qualidade variam. Dados como número de funcionários e CNPJ podem permanecer pendentes ou não verificados; empresas não são fatos confirmados apenas por aparecerem em uma lista.

Os resultados não criam contas ou contatos automaticamente. O front e o servidor possuem regras próprias de autorização e confirmação; a flag de importação pode estar desativada. Distinga: candidato encontrado, fonte citada, identidade confirmada, importação autorizada e gravação confirmada. Progresso laranja é indeterminado/visual, não porcentagem real do provedor. Ao navegar, preservar escopo tenant e sessão; não enviar todo o CRM como contexto à IA externa.

### 5. Linked Helper, LinkLeads e console assistido

`src/integracoes.js` normaliza webhooks e dados recebidos por uma ponte Cloudflare Worker (`ponte/`). O usuário confere a importação; contatos, contas, oportunidades, tarefas e histórico são gravados conforme rotina já existente. As origens Linked Helper e LinkLeads são separadas por `linkleads_origem` e por ações distintas, evitando tratar a resposta de uma como a da outra.

`LinkLeads` é **aplicativo desktop próprio**, no repositório maiaalex2306/linkleads, acionado pelo protocolo `linkleads://`. Não significa que todo o CRM virou desktop. O modo assistido do navegador permanece como alternativa. A fila local de perfis usa IndexedDB; exportar/restaurar campanha por JSON é transporte voluntário, não sincronização bidirecional. O código histórico de Electron/execução no GitHub não comprova que login real e automação estejam homologados. Senhas, cookies e MFA do LinkedIn não devem ser copiados para o CRM.

Importação com IA deve diferenciar fala do comprador, mensagem da SDR, cortesia, recusa e pedido efetivo. Recusa não vira oportunidade automática. Quando registrada, a oportunidade aponta o contato real; não transformar hipótese de intenção em receita sem validação.

### 6. Tecnologias e componentes

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

### 7. Segurança, integridade e autorização

- O cliente jamais recebe chave `service_role` ou chave privada de IA; segredo pertence às funções de servidor. Publishable key não substitui RLS.
- Gestor/admin visualiza as inteligências conforme regras e escopo habilitado. Filtros de tenant e dono não podem vazar contato de outra empresa.
- Contato é associado por identificadores do próprio CRM; não inferir responsável por semelhança da empresa ou pela presença de telefone no texto da conversa.
- Links recebidos do usuário/IA passam por verificação de protocolo, host e finalidade antes de virarem ações na UI.
- A separação é mandatória: dados internos em Inteligência Comercial, pesquisa externa em Inteligência de Mercado.
- Recomendações não constituem avanço do IAD. A IA lê e sugere, o motor calcula e o usuário decide.

### 8. Performance, resultados de auditoria e limites

O código inclui carregamento sob demanda de Manual/Inteligência Comercial/Inteligência de Mercado, cache limitado a snapshot e revisão da sessão, índices no Store, caminhos incrementais de sincronização, otimizações de renderização e instrumentos PERF-02 a PERF-40. A instrumentação não é promessa de latência final.

Na auditoria PERF-40 de 07/11/2026, o diagnóstico administrativo em produção registrou 397 oportunidades lidas via SELECT * em 191,464 ms, versus SELECT somente ID em 0,961 ms; 473 tarefas em 92,753 ms. É amostra de conexão administrativa, não P95 de gestor autenticado. O peso de colunas JSONB e transmissão deve ser medido; não executar DDL/RLS como reação automática a uma consulta. Exigir pelo menos 30 amostras reais comparáveis por fluxo, com aparelhos, rede, sessão e cache controlados.



## Critérios de homologação documental e técnica

1. `src/views-manual.js` deve manter todos os capítulos anteriores com IDs estáveis e apresentar os 10 novos guias, cada um uma vez, no índice e no conteúdo.
2. O Manual deve permanecer sob carregamento lazy; a navegação inicial não pode importar o módulo grande. O arquivo deve continuar no cache estático versionado, sem cachear respostas autenticadas.
3. O Manual deve renderizar em Chromium desktop e mobile sem falha de JavaScript, truncamento, links indevidos ou tabela quebrada, inclusive em modo PWA offline apenas para conteúdo estático.
4. `src/config.js` e `sw.js` devem declarar a mesma versão. Confirmar os arquivos diretamente no domínio após a publicação.
5. Verificar que os exemplos de pesquisa externa refletem o bloqueio de importação no piloto, a diferença entre URL citada e fonte comprovada, e os limites de CPU/memória do importador CSV 100 MiB.
6. Confirmar que estados de CAS e integração Linked Helper/LinkLeads não sejam promovidos indevidamente a funcionalidades homologadas de produção.
7. Acesso ao Manual pela rota `#/playbook` dentro do CRM depende da sessão. A apresentação pública do método na tela de acesso não equivale ao Manual completo autenticado.
8. Manter o problema conhecido da IA de homologação separado dos testes de documentação, sem afirmar que HTTP 503 foi resolvido.

## Próximas evoluções documentais

Adicionar tutoriais interativos com dados sintéticos para cada tela, registro de evidência e gestão da carteira; versão de procedimento por função (vendedor, gestor e admin); links contextuais do botão de ajuda para o capítulo exato; e um mapa de cobertura automatizado que compara rotas, flags e controles visíveis com seus capítulos.

