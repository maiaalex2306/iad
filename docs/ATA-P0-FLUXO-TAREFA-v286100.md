# ATA-P0 — Recuperação e análise de ata anexada à tarefa (v286.100)

**Auditoria:** 11/11/2026. **Origem:** relato de ata carregada na tarefa de "Valeo — origem LH", com tela exibindo IAD 25/32 e "15d sem evidência".

## Constatações na produção (SQL somente leitura)

A oportunidade Valeo contém 39 eventos no histórico; a última evidência de decisão é de **27/10/2026**, sem novas evidências em **11/11/2026**. Duas tarefas da oportunidade foram concluídas em 11/11: uma com `com_relato=true` e outra `com_relato=false`. `com_relato` informa que houve texto/relato na conclusão; **não comprova que a IA extraiu, processou ou gravou novas evidências**. Os conteúdos anexados residem em **IndexedDB local do navegador** e não são recuperáveis por consulta à base Supabase.

A captura fornecida não contém os bytes do arquivo. Não foi possível determinar se o PDF é digital, digitalizado, protegido ou se o documento é DOCX/TXT; nenhuma leitura do arquivo real foi declarada.

## Causas confirmadas no código v286.99

1. **Editar tarefa já concluída + anexar documento:** gravava o arquivo local, porém não enviava o conteúdo à análise quando a situação permanecia `feita`. Era necessário mudar a situação de maneira artificial.
2. **Salvar durante a leitura do anexo:** o input de arquivo era processado de forma assíncrona. O formulário podia fechar e transmitir `documentosIA=[]` antes de `lerVarios` responder, gerando tarefa concluída sem leitura.
3. **Reprocessamento inexistente:** não existia botão direto para recuperar e analisar uma ata já guardada na tarefa.
4. **Indicador enganoso:** `com_relato` aparecia como "com ata", sugerindo sucesso da IA sem comprovação.

## Mudanças v286.100

- `src/ui.js`: desabilita Salvar durante a extração, impede `submit` por Enter enquanto houver leitura pendente; recupera o botão e fornece erro de extração quando a leitura falhar.
- `src/app.js`: quando **uma tarefa concluída** recebe documento legível pela tela Editar, após gravar o anexo é acionada a análise. Se a extração falhar, o aplicativo comunica o motivo; não cria evidências fictícias.
- `src/app.js`: ação `reanalisarAtaTarefa` lê os arquivos localmente associados à tarefa, verifica a oportunidade autorizada, mostra seus nomes antes de enviar à IA e rejeita metadados de outra tarefa/negócio.
- `src/arquivos.js`: `obter(id)` permite recuperar os bytes existentes sem depender de novo upload. O arquivo continua no IndexedDB, sem novo transporte automático de blobs.
- `src/views.js`: botão **Analisar ata** nas tarefas concluídas do Cockpit e da lista geral de Tarefas. O texto **com relato** deixa de afirmar que a IA leu com sucesso.
- `src/app.js`: anexos de novas conclusões passam a receber `tarefaId`. Para anexos anteriores sem esse vínculo, somente atas da **mesma oportunidade e mesma data de conclusão** são candidatas; há aviso de vínculo não comprovado e confirmação manual. A análise não atribui falsamente a esses anexos um `tarefaId`.
- Exceções de IA agora encerram a janela de progresso e geram diagnóstico em vez de deixá-la aberta indefinidamente.
- `src/config.js` e `sw.js`: versão e cache `v286.100` coerentes, sem modificar as outras regras.

**Nenhum SQL, RLS, chave, Edge Function, dado de cliente ou pontuação preexistente foi alterado por esta correção.** A análise bem-sucedida continua utilizando os controles existentes do IaD para registrar somente evidências detectadas e pontuar conforme as regras do motor. Repetir manualmente uma análise já aplicada pode duplicar evidências; o sistema alerta quando encontra evidências anteriores daquela tarefa.

## Como testar no CRM

1. No **mesmo navegador e aparelho** utilizados para anexar a ata, abra **Pipeline → Valeo → Tarefas**, localize a tarefa concluída e clique em **Analisar ata**.
2. Confira os nomes dos anexos. Se arquivos antigos não tiverem vínculo com a tarefa, confirme explicitamente apenas os que correspondem à reunião.
3. Veja o resultado do leitor, da IA e as evidências geradas. Verifique Histórico e Decisão; **o índice 25/32 só deve mudar se o material trouxer evidências adicionais válidas**.
4. Se o sistema informar que não há arquivo local, use **Editar tarefa** para selecionar novamente a ata no mesmo navegador e salvar: uma tarefa já concluída com documento novo será analisada após a gravação.
5. Se o PDF for só imagem/escaneado, forneça uma versão com texto selecionável ou OCR externo aprovado. Não tratar erro de extração como fala do comprador.
6. Não apagar cookies, IndexedDB ou dados do site enquanto houver documentos locais/edições pendentes.

## Homologação

`tests/task-ata-analysis.test.cjs`: sintaxe e contratos.  
`scripts/task-ata-analysis-chromium.cjs`: navegador real com dados sintéticos, persistência IndexedDB, travamento durante leitura, envio da ata vinculado à oportunidade, recusa de anexo de outro negócio, sem contato com dados reais.  
`.github/workflows/task-ata-analysis.yml`: testes isolados do domínio.

**Gate de liberação:** CI dos módulos afetados aprovada, Chromium aprovado, sem regressões de Auth/RLS/CAS/Manual; publicação GitHub Pages concluída; confirmação pública de versão e cache. A IA de staging RI-08 historicamente 503 é um gate independente e **não pode ser declarado resolvido** com esta alteração de frontend.

**Rollback frontend:** voltar ao commit `6158106d2b1dd0fb769390c94999b9036b679119` mantendo DB, volumes, IndexedDB e pendências.


## Compatibilidade com a ata anexada antes da correção

O formulário antigo de **Editar tarefa** gravava documentos sem `tarefaId` e com categoria **Outro**. A recuperação aceita um anexo único dessa categoria, da mesma oportunidade e data da conclusão, após confirmação manual explícita, mas **não atribui sua autoria a uma tarefa sem prova técnica**. Se houver mais de um arquivo antigo elegível na mesma data, o fluxo exige selecionar/reanexar o arquivo correto no formulário, para evitar analisar uma ata de outra reunião.

A CI PERF-03A foi ajustada para usar `psql` dentro do container PostgreSQL iniciado pela própria Supabase CLI, evitando dependência de mirrors Ubuntu e a falha de DNS constatada no runner.
