# LinkedIN Leads — plano de substituição do fluxo manual pelo executor tipo Linked Helper
Status: especificação P0 vinculada ao PR #201; SEM LIBERAÇÃO DE PRODUÇÃO
Data: 2026-11-07

## Critério de sucesso central

O operador importa o CSV, autentica no LinkedIn na área integrada **somente dentro de LinkedIN Leads**, define a campanha e clica **Iniciar**. Para cada lead, o módulo deve automaticamente:
1. resolver a identidade de perfil;
2. navegar ao perfil pelo browser da instância;
3. abrir publicações recentes;
4. selecionar uma publicação do próprio perfil que a conta não curtiu nem comentou;
5. coletar texto e **imagens reais** da publicação, com evidência de origem;
6. analisar texto+imagens em modelo multimodal e gerar um comentário específico sem inventar fatos;
7. realizar apenas interações para as quais existe autorização de canal, confirmando efeitos reais;
8. persistir identidade de perfil, post, resultado, timestamps, versão da IA e eventos, e avançar ao próximo lead.

Se não existir post elegível, registrar `SEM_POST` ou `JA_INTERAGIDO` e avançar. A partir de CAPTCHA/restrição, sessão inválida, retorno incerto ou problema de permissão, **suspender a automação** sem contornar bloqueios.

## Contrato funcional v1
- Uma conta, uma campanha ativa por instância, um post por perfil.
- Apenas curtir e comentar; **sem convites, mensagens, scraping de carteira ou operações em massa paralelas**.
- Seleção cronológica decrescente da primeira publicação elegível do autor, respeitando idade máxima e removendo duplicatas.
- A verificação de `curtido` e `comentado` deve refletir o estado real visível ao usuário; não inferir de botão clicado.
- A análise visual da IA exige mídia efetivamente disponibilizada pelo adaptador; se não houver acesso à imagem, **não alegar que a interpretou**.
- Registrar `postId` imutável e `accountId` para chave idempotente `accountId/campaignId/profileId/postId/actionType`.
- Uma ação de resultado incerto não pode ser repetida até conciliação verificável.
- Se não houver conexão temática legítima, não forçar gancho de água/efluentes.

## Componentes e lacunas

| Módulo | Existe | Falta para concluir |
|---|---|---|
| `src/linkedin-csv.mjs` + `src/linkedin-csv-stream.mjs` | streaming, normalização | PR #200: formatos de URLs e diagnóstico das 821 linhas |
| `src/linkedin-queue-db.mjs` | persistência local de CSV | adaptador de journal por post, lock entre processos e retomada transacional |
| `desktop/linkedin-leads/main.cjs` | POC com duas WebContentsView | smoke Windows com conta real, isolamento da sessão, navegação automática |
| `desktop/linkedin-leads/linkedin-adapter.cjs` | **não existe** | abrir perfis, inspecionar posts/estado de interações e coletar evidências; nenhuma suposição sobre DOM |
| `src/linkedin-campaign-runner.mjs` | **núcleo implementado no PR #201** | ligar adaptador real, storage transacional e políticas específicas de canal |
| `nuvem/funcoes/assistente/index.ts` | rascunho de texto `linkedin_comment_draft` | análise multimodal com dados de imagem autorizados, provenance e justificativas |
| `src/linkedin-leads-console.mjs` | tela manual existente | trocar por **Conectar, Importar, Iniciar/Pausar, Progresso**, sem formulário por lead |

## Gates inegociáveis

**G1 — Dados.** CSV real de 821 linhas classificado integralmente, com motivos de todas as rejeições; perfis válidos de LinkedIn/Sales/Recruiter não perdidos. Importação sintética 100 MiB sem travar UI.

**G2 — Browser Windows.** Login e MFA reais na vista integrada, navegação para perfis autorizados e retorno à campanha, sem janela externa, sem afetar demais rotas.

**G3 — Inspeção.** Em contas de teste, comprovar: postagem textual, postagem com imagem, post já curtido, post já comentado, usuário sem post, restrição de acesso. Registrar postId, data, autor, texto e mídia observáveis.

**G4 — IA multimodal.** Teste cego de comentários para 30 posts de domínio industrial com imagens, avaliação humana e rejeição de alucinações; nenhum comentário automático sem critério factual.

**G5 — Ação e idempotência.** Execução no canal permitido, confirmação de curtida e comentário, 0 comentários duplicados após falha de rede/reinício no conjunto de testes.

**G6 — Segurança.** Sessões isoladas, sem cookies/senhas no CRM, políticas de navegação, limites do canal e interrupção em challenges. Não usar técnica de ocultação ou contorno de bloqueios.

**G7 — Performance.** Medir separadamente importação CSV, carga do navegador, navegação por perfil, extração do post, tempo de IA, latência de ação e gravação; não inferir velocidade do sistema inteiro a partir de teste Node do CSV.

## Restrições de integração de terceiros
O LinkedIn declara como não autorizadas ferramentas de terceiros que coletem dados ou automatizem likes/comentários na página sem permissão. O navegador integrado não significa autorização, nem torna um executor invisível. Examinar se há integração autorizada para os endpoints necessários e interromper ações que não possam ser realizadas no canal permitido. Não implementar evasão, bypass CAPTCHA, fingerprint falsificado ou contorno de quota.

## Política de produção
A v286.91 WEB permanece a última liberação publicada e **não atende ao objetivo de automação**. Não lançar outro “release Linked Helper completo” com apenas parser, UI ou runner simulado. PRs #200 e #201 ficam em draft até os respectivos testes, e a publicação do executor exige G1–G7 verificáveis.
