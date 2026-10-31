# PERF-03C / IaD CRM v272 — Dossiê de implementação e aceite parcial

**Data:** 2026-10-29  
**Issue:** #10 · **PR:** #11 (DRAFT) · **Branch:** `performance/iad-perf-03c`  
**Produção:** v271 no GitHub Pages e journal PERF-03B já instalado no Supabase IDA.  
**PERF-03C:** NÃO integrada, NÃO publicada, migração privada NÃO executada no Supabase de produção.

## 1. O que foi implementado

### Deltas por responsável — novo journal de escrita transacional
Arquivo `nuvem/perf-03c-journal-privado.sql`.

- Duas tabelas novas: `iad_sync_usuario_versoes` e `iad_sync_usuario_eventos`.
- Checkpoint por par `(tenant_id, usuario_id)`, sem gaps visíveis causados por ações de colegas.
- RLS requer autenticação, empresa do perfil e correspondência de `auth.uid()`, negando a administradores/gestores o acesso ao stream privado.
- Trigger `iad_sync_usuario_evento` nas oito tabelas comerciais grava apenas eventos permitidos ao vendedor.
- Entidades de movimento com `dono_id`: A→B gera **D** para A e **I** para B; uma exclusão gera **D** para quem via a linha. Linhas sem dono são compartilhadas dentro do tenant, conforme RLS comercial atual.
- Tabelas de configuração (produtos, segmentos, tipos e fontes) são compartilhadas dentro da empresa.
- A função interna SECURITY DEFINER tem `EXECUTE` revogado de `PUBLIC/anon/authenticated`; não pode virar RPC aberta.
- A migração NÃO altera os registros comerciais e não é aplicada automaticamente por GitHub Actions a qualquer projeto real.

### Deltas de administradores multiempresa
`src/nuvem.js`:

- Usa `iad_sync_versoes` da PERF-03B para localizar alterações por empresa, paginando o mapa de tenants.
- Faz leitura por `tenant_id`, compõe mudanças num conjunto e confirma cursores por empresa depois do commit local.
- IDs retornados pela API são validados contra o tenant do evento. Alteração de filtro de empresa invalida o checkpoint anterior e exige reconciliação completa.
- Se um lote falhar, não aplica parcialmente o snapshot nem avança o cursor.
- Para gestores mantém PERF-03B. Para vendedores consulta APENAS o novo stream privado; se a migração estiver ausente, volta ao download completo v271, protegido por RLS.

### Primeira carga: progresso seguro, **não lazy completo**
`src/nuvem.js` e `src/app.js`:

- Os dez conjuntos são paginados/baixados com progresso visível.
- Só depois que TODOS terminarem é que o estado comercial é publicado no Store.
- Ao entrar sem carteira carregada, a interface mostra o progresso em vez de apresentar contadores e decisões parciais.
- **Não** implementa ainda SQL de projeções leves, paginação de cards por demanda, hidratação individual de oportunidade nem eliminação do download integral inicial. Essas serão a próxima subfase PERF-03C-2.

## 2. Como testar
GitHub Actions `.github/workflows/perf-03c.yml`, sem credenciais reais:
- Node (carteiras 243, 1.000, 5.000 e 10.000, delta de dois tenants, mudança de owner, exclusão, falha de rede, bootstrap, fallback);
- regressões PERF-03B/03A/02/01 e build v272-HOMOLOG protegido contra projeto Supabase de produção;
- Chromium real para Pipeline → Cockpit → Tarefas;
- Supabase local descartável: GoTrue real com cinco usuários autenticados e dois tenants, journal por usuário, escrita cruzada negada, anônimo negado, tombstone e mudança de titularidade.
- Antes de liberar, verificar os jobs e evidências do **HEAD mais recente** do PR 11 (não usar resultados de commits anteriores).

## 3. Limites/bloqueadores para aceite integral
1. Ambiente Supabase **hospedado de homologação**: executar a migração ali somente depois do aceite dos testes locais. Não executar em produção até revisão de segurança e gate de deploy.
2. **CAS e conflitos**: o envio v271 continua como upsert baseado em hashes, sem validação de versão server-side. Não afirmar proteção contra edição concorrente que sobrescreve dados do colega.
3. **Reconciliação**: não remover eventos antigos do journal antes de adicionar retenção+cursor mínimo com fallback para snapshot. Incluir reconciliação periódica por hash/contagem para detectar perdas.
4. **Primeira carga sob demanda**: construir endpoint de projeção (campos mínimos, paginação por tenant/role), lazy hydrate por oportunidade e métricas end-to-end.
5. **Performance real:** tempo p50/p95 do usuário autenticado no CRM não foi medido; os benchmarks CI são sintéticos.
6. **Escala do fan-out:** medir escrita proporcional ao número de vendedores. Feed privado grava no máximo um evento por vendedor visível dentro da empresa. É necessário benchmark de muitas alterações simultâneas antes de produção.
7. **Cache/logout:** cursor da versão fica apenas em memória; nova sessão sempre baixa snapshot completo para não reciclar estado de usuário anterior. Tokens não são persistidos no novo journal.
8. **Documentação de segurança:** funções SECURITY DEFINER e advisors Supabase precisam de revisão antes de homologação hospedada e rollout.

## 4. Estratégia de implantação futura (SOMENTE APÓS NOVA AUTORIZAÇÃO)
1. CI do PR 11 integralmente verde.
2. Testar SQL PRIVADO no projeto `iadcrm-homolog` com perfis gestor, vendedor A/B e administrador, 2 empresas fictícias.
3. Homologar UI v272 apontada para `iadcrm-homolog` com 243/1k/5k/10k oportunidades, registrando custo de rede, p95 e contagem de requests. Controle de RLS real e testes de regressão.
4. Entregar PERF-03C-2: lazy fetch e CAS, resolver limites.
5. Preparar plano de rollback para desativar trigger `iad_sync_usuario_evento`, sem destruir as tabelas/journal de auditoria; código v271 faz fallback integral.
6. Merge em produção somente com solicitação explícita. A migração privada em produção requer outra autorização, verificação de esquema e testes de impacto em escrita.

**P0:** integridade + RLS + ausência de vazamento.  
**P1:** CAS + reconciliação.  
**P2:** primeira carga realmente sob demanda + métricas.  
**P3:** otimização de fan-out/retention.

