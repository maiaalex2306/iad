# RI-46 — Entradas recentes e identificação visual de contatos

Data da auditoria: 2026-11-08. Candidata: v286.96. Baseline: v286.95.

## Causa verificada

O código publicava no máximo 12 pistas. O detector reduzia todas as contas elegíveis para 12 registros, depois o Radar aplicava novamente uma lista fixa de 12. A ordenação usava a prioridade/tipo de intenção antes da data da entrada. O histórico de uma conta era consolidado em um único cartão e somente três sinais relacionados ficavam acessíveis.

Consulta administrativa de leitura ao projeto de produção, em 08/11/2026: 407 oportunidades totais; 10 criadas no dia, todas abertas, com notas e eventos de conversa LinkedIn; 15 atualizadas no dia. As novas negociações continham conversas antigas: nenhuma das conversas LinkedIn registradas possuía data de fala do dia. Esses dados não provam que as 10 sejam intenções comerciais inequívocas.

## Modificação

1. Os cartões de pistas se apresentam em lotes de 12, com Ver mais. O módulo mantém os itens para paginação sem descartar o restante do resultado.
2. A ordem inicial é por entrada recente no CRM (campo persistido criadoEm), e o gestor pode alternar para Maior prioridade.
3. O filtro Entradas de hoje usa a data local da sessão e indica quantos registros pertencem ao dia.
4. Negociação recente (até 14 dias) sem citação de intenção reconhecida aparece como NOVO REGISTRO · REVISAR. A interface não a classifica como pedido de proposta nem avanço comercial.
5. A data de entrada e a data da fala/registro são exibidas separadamente.
6. Negociações independentes na mesma conta mantêm seus próprios IDs e aparecem individualmente quando recentes; sinais adicionais da conta permitem expansão sob demanda.
7. Contato, LinkedIn e Telefone são campos visuais com rótulos diferentes, links seguros e nenhum campo artificial quando ausente.
8. Toda análise continua somente leitura dos registros autorizados, sem fonte externa, chamada adicional, importação automática, alteração de RLS, CAS ou banco.

## Homologação necessária

- Testes unitários: mais de 12 pistas; entrada de hoje com transcrição antiga; fallback revisão; múltiplas oportunidades na mesma empresa; filtros de empresa/dono; nenhum dado de outro tenant; nenhum registro fechado.
- Chromium local com dados sintéticos: desktop e mobile, 12 cartões iniciais, filtro hoje, Ver mais, ordenação, label Telefone, abertura de LinkedIn e tel:, zero gravações e zero requests externos.
- Benchmark 5 mil oportunidades, memoização por escopo/revisão e nenhuma regressão nas outras cinco categorias do Radar.
- Verificar src/config.js e sw.js na versão v286.96 em Pages e no domínio público.
- Em sessão real, comparar todas as oportunidades criadas no dia com entradas exibidas; checar permissão do gestor e sincronização.
- A indisponibilidade pré-existente de IA na homologação continua um bloqueio independente do módulo de pistas; não afirmar que LLM foi homologado.

## Melhorias posteriores

Registrar o motivo da triagem (intenção reconhecida, fala ausente, recusa, origem incerta) de forma explicável; oferecer confirmação pelo vendedor antes de converter registro novo em plano de ação. Capturar distribuição de latência P50/P95 reais e evitar aumentar o custo de sincronização só para preencher o Radar.
