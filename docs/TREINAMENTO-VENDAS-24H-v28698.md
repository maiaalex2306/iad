# Treinamento de Vendas — Painel Aprenda Vendendo (v286.98)

**Revisão:** 08/11/2026  
**Rota:** `#/playbook` (mantida para preservar deep links, apesar do novo nome de menu **Treinamento de Vendas**).  
**Implementação:** `src/views-manual.js` (lazy), `assets/styles.css`, `src/app.js`.  
**Fonte principal dos dados comerciais:** Supabase/PostgreSQL e Store autorizado; o treinamento só registra a conclusão manual de etapas, sem escrever na carteira.

## Objetivo de 24 horas

Conduzir a primeira jornada prática de uso do CRM, com execução real de prospecção e gestão comercial. A pessoa deve sair apta a localizar leads, filtrar e priorizar oportunidades, validar canais de contato, preparar abordagens, trabalhar tarefas e registrar pedidos de reunião. **A meta de resultado é uma carteira inicial de prospects acionáveis**, e não uma promessa de reuniões automaticamente agendadas.

**Indicadores orientativos de entrega (não medidos pelo checklist):**

- 15–20 leads da carteira revisados conforme ICP e fonte.
- Pelo menos 5 contatos e respectivos canais verificados.
- 5–10 abordagens personalizadas realmente realizadas e registradas.
- Pelo menos 3 convites específicos de reunião enviados.
- Próximo contato com data/ação para cada lead abordado.

## Roteiro

| Janela após iniciar | Etapa | Ação observável / entrega |
|---|---|---|
| 0–2h | Ambientação | Entrar na empresa correta, compreender Hoje, Cadastros, Pipeline, Tarefas; localizar conta, contato, oportunidade |
| 2–5h | ICP e lista | Filtrar 15–20 leads, comparar com segmento/território/porte, separar ao menos 10 empresas relevantes |
| 5–8h | Qualificação | Revisar histórico e sinais, distinguir fala do prospect de recusa/cortesia e priorizar até 8 leads |
| 8–12h | Contato e descoberta | Verificar nome, cargo, canal, hipóteses de problema e perguntas das oito decisões para pelo menos 5 leads |
| 12–17h | Abordagem | Executar 5–10 contatos reais, personalizados e respeitosos, deixando registro de cada ação |
| 17–21h | Evidências e follow-up | Registrar somente evidências do comprador, tarefas e retornos com data, sem presumir resposta |
| 21–24h | Solicitar reuniões | Revisar 5 contatos priorizados, enviar no mínimo 3 convites e criar seguimentos; reunião só é marcada após aceite |

As janelas são orientativas, medidas em horas corridas desde clique voluntário em **Iniciar minha jornada de 24 horas**. Etapas podem continuar após 24 horas sem ocultação, perda de histórico ou promessa de resultado garantido. Interações dependem de expediente, disponibilidade do cliente e canal autorizado.

## Fontes de leads e permissões

1. Use primeiro os **registros autorizados já cadastrados** no CRM.
2. Quando não houver carteira, obtenha lista autorizada, use Cadastros/importação revisada ou o processo existente do Linked Helper; nenhum lead é criado pelo painel.
3. Inteligência Comercial (somente interno) e Inteligência de Mercado (pesquisa externa manual) estão restritas a Gestores/Administradores. Não sugerir que um vendedor sem permissão possa utilizá-las.
4. A importação da pesquisa externa de Mercado está bloqueada no piloto até homologação independente. Pesquisar empresas não garante gravá-las no Pipeline.
5. O console web LinkedIN Leads prepara e organiza campanhas, mas não executa automaticamente ações no LinkedIn, e não deve ser apresentado como fonte comprovada de mensagens enviadas.

## Progresso e privacidade

O painel apresenta sete caixas marcadas **manualmente** e uma barra indicando a proporção de etapas realizadas (0/7 a 7/7). Este número **não** é conversão de vendas, indicador de atividade confirmada, indicador IAD, nem número de reuniões.

Estado salvo por usuário e tenant em `localStorage`, sob chave `iad:treino24:v1:<user-id>:<tenant-id>`. O conteúdo salvo contém apenas timestamp de início e IDs das etapas marcadas. Nenhuma informação de empresa, lead, contato, telefone, e-mail ou mensagem é persistida pelo painel. O progresso não é sincronizado entre dispositivos e a interface informa sobre fallback volátil se não houver armazenamento local.

Administradores precisam filtrar uma empresa específica para iniciar a jornada. Reiniciar exige confirmação e apaga somente as marcações do treinamento naquele usuário/tenant. Logout não limpa automaticamente o progresso de treinamento, que permanece protegido pelo isolamento da chave, mas é **local ao navegador**, portanto deve ser tratado como uma conveniência e não auditoria empresarial.

## Critérios de aceite

- Rota `#/playbook` e links anteriores preservados, nome de menu **Treinamento de Vendas**.
- Painel renderizado **antes** do título e índice do Manual, sem carregar no shell inicial.
- Sete etapas, janelas de tempo, objetivos verificáveis e CTA de navegação interna.
- Desktop e mobile 375px sem rolagem horizontal, checkboxes funcionais e acessíveis por teclado.
- Cliques de iniciar, marcar, desmarcar e reiniciar operam somente no estado local do treinamento.
- Isolamento por usuário/tenant, bloqueio para admin com filtro de todas as empresas e fallback sem `localStorage`.
- Nenhuma chamada de IA, pesquisa externa, envio LinkedIn, criação de oportunidades ou mudança em Store, Supabase ou CAS ao completar treinamento.
- Versão `src/config.js` e `sw.js` consistente (v286.98). Regressões do Manual histórico e PWA mantidas.

## Evoluções posteriores

1. Implementar trilhas por cargo (SDR, vendedor, gestor), sem conceder permissões adicionais.
2. Reconciliar etapas **com evidências reais autorizadas** em dashboard opt-in; separar atividade enviada, mensagem respondida, convite aceito e reunião confirmada.
3. Suporte a progressos sincronizados via tabela própria com RLS/retention apenas depois de auditoria de privacidade, conflitos e consentimento — não usar `localStorage` para provar produtividade da equipe.
4. Conectar a ajuda contextual de cada etapa à ação específica na interface e incorporar teste de cobertura de novos recursos no Manual.
