# RI-08 — Intenções e oportunidades nas conversas do LinkedHelper

## Objetivo
Converter falas reais do prospect em hipóteses comerciais rastreáveis, preservando o IAD, histórico, dono, tenant, permissões e negócios já existentes.

## Arquitetura implementada
- `src/ri/conversation-intent.mjs`: detector rápido por regras e validação literal de intenções de IA; nenhuma busca externa.
- `src/ri/internal-cues.mjs`: varredura limitada de eventos/notas e transcrições do LinkedHelper já importadas, com separação SDR/prospect e até quatro sinais visíveis em cada cartão de conta.
- `src/ri/account-view.mjs`: lista necessidades distintas dentro de uma mesma conta, sem duplicar negócios.
- `src/ia.js`: passa à Edge Function apenas falas do prospect, alinhadas ao lead, em lote já existente.
- `nuvem/funcoes/assistente/index.ts`: classificador semântico com até duas citações literais verificadas por lead; falhas geram lista vazia. Nenhuma segunda chamada de IA.
- `src/app.js`: conserva as intenções aprovadas com a transcrição do novo lote de mensagens (apenas se a fala está entre as novidades).
- `src/views.js`: apresenta intenções no modal de importação e ordena o grupo de mensagens substanciais por intenção detectada.
- `tests/ri08-conversation-intent.test.mjs`: casos de recusa, cortesia, demanda múltipla, citações da SDR, isolamento de tenant, oportunidade encerrada, eventos futuros e ausência de escrita.

## Restrições mantidas
- A IA não altera o IAD, valor, etapa, data, proposta ou venda.
- Não cria negócio, tarefa ou envio de mensagem automaticamente: somente as rotinas de importação existentes continuam fazendo o que já faziam, com intervenção do usuário.
- A classificação por IA depende de implantação da Edge Function `assistente` atualizada e credenciais existentes.
- Verificação da conta Supabase em 06/11/2026: o projeto `iadcrm-homolog` (`bvlfzeblpewlqhssprpv`) lista somente a função `market-search`; **não possui `assistente`**, portanto o teste semântico real ainda não pode ser homologado nele sem instalação controlada de dependências e credenciais.
- A triagem por regras opera mesmo sem IA, apenas sobre eventos já armazenados no CRM.
- O pacote não revisa os dados de produção; não mexe no schema SQL nem realiza migração.
- Conservar a publicação coordenada do PWA (versão e service worker) para o release final. Não alterar `config.js` / `sw.js` neste PR de homologação.

## Limites conhecidos
- Conversas não importadas continuam na ponte; a Inteligência Comercial não recebe dados privados ainda não incorporados ao CRM.
- O histórico antigo só é analisável se já ficou registrado em eventos de oportunidade.
- O parse da transcrição exige autor identificável e SDR conhecida; em caso contrário, ignora para evitar falsos positivos.
- Classificador semântico do fluxo de importação depende do cadastro de empresa. Sem empresa, permanece a triagem local após a importação.
- Regras locais são heurísticas; não representam inferência completa por modelo em lotes históricos.
- O radar mostra até 12 contas e quatro necessidades por conta; não são totais de potencial econômico.

## Homologação pendente em staging
1. CI e testes sintéticos.
2. Testar captura real de duas conversas, uma recusa e uma resposta de interesse no LinkedHelper com a ponte existente.
3. Publicar **somente em staging** a função `assistente` e o frontend com cache coerente.
4. Verificar RLS/tenant/gestor e SDR, autor de cada trecho e no máximo um registro de conversa por entrega idempotente.
5. Comparar fluxo de importação e desempenho com versão anterior; medir P95 e custos sem enviar segredos ou dados pessoais a logs.
6. Apenas então decidir o release de produção, com rollback preservado.

**Status:** código candidato em PR, não homologação real de produção.
