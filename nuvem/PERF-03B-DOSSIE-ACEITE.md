# IaD CRM — Dossiê PERF-03B (candidata v271)
Data: 29/10/2026 · PR #9 · branch performance/iad-perf-03b · base de produção v270
**MANTER PR EM DRAFT. NÃO FAZER MERGE, NÃO EXECUTAR SQL NO SUPABASE DE PRODUÇÃO SEM APROVAÇÃO.**

## 1. Relato visual do usuário
- Tela Pipeline em Kanban, 243 de 360 negociações visíveis.
- Abrir "Cacau Show — Water Intelligence 360°" demora para montar cockpit.
- Abrir aba "Tarefas" no mesmo cockpit demora mesmo com apenas duas tarefas concluídas.
- Capturas fornecidas demonstram sequência e conteúdo, mas NÃO contêm um cronômetro: não atribuir segundos à experiência real.

## 2. Causa técnica confirmada
- src/app.js: `App.abaCockpit` chamava `render()`, reescrevendo todo `#conteudo` para trocar apenas a aba.
- src/views.js: `V.cockpit` sempre refazia `E.resumo(op)`; `renovarPotencial()` zerava base global, recalculada com `E.baseDoPotencial()`.
- No resumo do cockpit, o filtro de tarefas atrasadas podia passar por `Store.dados().tarefas`, atravessando toda a carteira.
- Na nuvem, `N.puxar` baixava as dez tabelas integralmente por paginação, mesmo após pequenas mudanças. A subida já utilizava hashes e exclusões pendentes, porém faz reconciliação completa periódica.

## 3. Correções PERF-03B
- `src/views.js`: memoização do resumo por revisão/dia/identidade/tenant/filtros/negócio, contagem de atrasos pelo índice da oportunidade, basePotencial só recalculada quando muda a revisão ou o contexto. Bloqueia rota direta se o negócio não estiver visível ao usuário.
- `src/app.js`: troca somente `.abas-cockpit` e `.corpo-aba` sem reconstruir cabeçalho, ficha nem navegação. Reinicializa anexos/propostas. Instrumentação em `tela.cockpit`, `dom.cockpit`, `perf03b.trocar-aba`.
- `nuvem/perf-03b-journal.sql`: novo journal de revisões commit-ordenadas por tenant, auditado por triggers nas OITO tabelas comerciais. Versões são incrementadas numa linha transacional por tenant e atualizações só de timestamp não geram eventos. RLS cobre o acesso a versões/eventos. Notas e sinais privados não entram no journal compartilhado.
- `src/nuvem.js`: modo opt-in automático **apenas se o journal homologado existir** para usuário/gestor com tenant único. Lê a versão ANTES do snapshot completo, depois lê apenas IDs alterados/deletados; consulta as entidades atuais com autorização no PostgREST, processa inclusões e exclusões atomicamente e rejeita mudanças locais durante leitura. Em caso de falha, cancela cursor sem sobrescrever os dados em memória. Usuário admin multiempresa, projeto sem migração e sincronização forçada continuam com leitura completa v270.
- `src/config.js` e `sw.js` versão candidata v271.

## 4. Evidências técnicas
- Testes Node: update, insert, delete, atomicidade de falhas, cache e navegação; regressões v270 anteriores.
- GitHub Actions Chromium: 243 oportunidades sintéticas; alternância Decisão→Tarefas **0,9 ms** na execução verificada; cabeçalho preservado; retorno a Decisão aprovado. NÃO equivale a tempo real da conta Cacau Show nem inclui Supabase remoto.
- SQL/RLS em Supabase local descartável + teste integral de PostgREST real configurado no workflow. Consultar **resultado mais recente** do workflow antes do aceite final.
- Testes de privacidade com dois tenants/contas, perfil autenticado e permissões no banco; nunca usar dados reais no ambiente de QA.

## 5. Limites declarados
- Primeira abertura após recarregar navegador ainda requer um download completo para estabelecer snapshot confiável. O incremental acelera puxadas posteriores **na mesma sessão**.
- Administradores multiempresa continuam no protocolo integral para evitar perda de eventos em outras empresas. A expansão exige checkpoint por tenant.
- Sinais e notas privadas continuam em downloads completos por segurança de RLS, pois não podem expor eventos por usuário no journal compartilhado.
- Envio normal por hashes e reenvio integral periódico NÃO foram substituídos por change tracking de escrita. O protocolo entrega ganhos principalmente no **download incremental**, não promete redução de todo upload.
- O journal de eventos não deve sofrer limpeza arbitrária enquanto existirem checkpoints ativos. Se for adotada retenção, adicionar cursor mínimo e fallback obrigatório para reconciliação antes de remover eventos.
- O journal serializa commits de alterações por tenant: medir custo extra de escrita em lotes intensos, além de ganho de download.
- Não resolve todas as dependências de mídia/IA/WhatsApp que possam bloquear UI; observabilidade e testes de produção autenticados continuam necessários.
- Em falha de upload ou escrita simultânea, o cliente NÃO pode descartar os registros locais para aplicar delta. Não apresentar sincronização como concluída sem confirmação.

## 6. Plano seguro para implantação (se autorizado depois)
1. Analisar e aprovar CI Node + Chromium + integração Supabase local, especialmente exclusões, 2 tenants e integridade da tabela de eventos.
2. Aplicar `nuvem/perf-03b-journal.sql` em projeto de homologação SEPARADO, com esquema e RLS atualizados; validar triggers e acesso com perfis de gestor, vendedor e admin.
3. Publicar v271-HOMOLOG em site isolado e comparar navegação + sincronização contra v270 usando 243/1.000/5.000 oportunidades sintéticas.
4. Verificar que versões mais antigas da aplicação continuam funcionando, pois o journal é aditivo.
5. Planejar migração do banco de produção em janela controlada com backup e observabilidade, somente mediante autorização explícita.
6. Após validar a migração de banco, aprovar o PR e publicar v271, medindo p50/p95 e falhas de sincronização em navegador autenticado.
7. Manter backup da v270 e plano de rollback, mas **o rollback de código NÃO deve apagar o journal SQL nem sua trilha de eventos**.

## 7. Próximas evoluções
- PERF-03C: deltas multi-tenant para administradores, controle granular de sujidade no envio, reconciliação programada e primeira carga progressiva por módulo.
- PERF-04: observabilidade de ações/latência real via PerformanceObserver (Long Tasks / INP), sem enviar dados comerciais.
