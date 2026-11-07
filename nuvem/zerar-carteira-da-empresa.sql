-- IAD CRM — zerar a carteira de UMA empresa, mantendo a empresa e as pessoas
-- ==================================================================
-- PARA QUE SERVE
--
-- Depois de uma fase de testes, o que atrapalha não é o sistema: é o resto.
-- Contas inventadas, oportunidades de prova, tarefas que ninguém vai fazer.
-- Este arquivo apaga esse resto de UMA empresa e deixa tudo o mais de pé:
--
--   FICA: a empresa (nome, CNPJ, a ponte do Linked Helper), as pessoas e os
--         papéis delas, os números de WhatsApp cadastrados.
--   SAI:  contas, contatos, oportunidades e tarefas daquela empresa.
--         E, se você descomentar o bloco 5, também as listas de configuração
--         (produtos, segmentos, tipos de tarefa, fontes) e as conversas de
--         WhatsApp.
--
-- Não é o `limpeza-seletiva.sql`, que apaga a empresa inteira e deixa as
-- pessoas sem empresa nenhuma. Aqui a Rosa continua gestora da AcP no minuto
-- seguinte; só a carteira começa vazia.
--
-- APAGA DE VERDADE E NÃO TEM DESFAZER.
--
-- ------------------------------------------------------------------
-- ANTES DE RODAR, DUAS COISAS — nesta ordem, ou o trabalho volta sozinho
--
-- 1. Rode o `correcao-16-tudo-em-dia.sql` primeiro. Sem ele o banco continua
--    atrás do aplicativo, e a carteira nova vai ser recusada no envio do mesmo
--    jeito que a velha foi. Zerar sem isso troca uma carteira errada por
--    nenhuma carteira.
--
-- 2. Depois de rodar ESTE arquivo, apague a cópia local em CADA aparelho que
--    tinha a carteira daquela empresa: no app, Configuração → Dados →
--    "Apagar tudo" (ele preserva os acessos). O envio acontece ANTES da
--    descida: um aparelho que ainda tenha os registros antigos os empurra de
--    volta para o servidor no primeiro login, e o zero desaparece sem aviso.
--    Isso vale inclusive para o aparelho de quem rodou este SQL.
--
-- O identificador da empresa aparece no app em Cadastros → Usuários →
-- a empresa → Webhook, no pedaço `e=` do endereço.

-- ------------------------------------------------------------------
-- 1. O QUE EXISTE HOJE — leia antes de escolher
-- Nenhum id para digitar aqui. Ache a linha da empresa certa e copie o id.
-- ------------------------------------------------------------------
select t.id,
       t.nome,
       (select count(*) from public.perfis        p where p.tenant_id = t.id) as pessoas,
       (select count(*) from public.contas        c where c.tenant_id = t.id) as contas,
       (select count(*) from public.contatos      c where c.tenant_id = t.id) as contatos,
       (select count(*) from public.oportunidades o where o.tenant_id = t.id) as oportunidades,
       (select count(*) from public.tarefas       x where x.tenant_id = t.id) as tarefas
  from public.tenants t
 order by t.nome;

-- ------------------------------------------------------------------
-- 2. O QUE VAI SUMIR — com nome, não com número
-- Troque o id nas duas linhas e rode. É a última chance de reconhecer algo
-- que você não queria perder.
-- ------------------------------------------------------------------
select 'conta' as tipo, nome as qual from public.contas
 where tenant_id = '00000000-0000-0000-0000-000000000000'   -- <<< id da empresa
union all
select 'oportunidade', titulo from public.oportunidades
 where tenant_id = '00000000-0000-0000-0000-000000000000'   -- <<< id da empresa
 limit 200;

-- ------------------------------------------------------------------
-- 3. APAGAR A CARTEIRA
--
-- O id fica escrito UMA vez, na primeira linha. Nos arquivos em que ele se
-- repete a cada comando, o erro clássico é trocar sete de oito ocorrências e
-- apagar metade da empresa errada.
--
-- Descomente o bloco inteiro, ponha o id, rode.
-- ------------------------------------------------------------------
-- do $$
-- declare
--   alvo uuid := '00000000-0000-0000-0000-000000000000';   -- <<< id da empresa
--   n_tar int; n_opo int; n_con int; n_cta int;
-- begin
--   -- A ordem não é exigida pelo banco: as tabelas de negócio só apontam para
--   -- `tenants`, não umas para as outras. Ela segue o sentido do trabalho.
--   delete from public.tarefas       where tenant_id = alvo;  get diagnostics n_tar = row_count;
--   delete from public.oportunidades where tenant_id = alvo;  get diagnostics n_opo = row_count;
--   delete from public.contatos      where tenant_id = alvo;  get diagnostics n_con = row_count;
--   delete from public.contas        where tenant_id = alvo;  get diagnostics n_cta = row_count;
--
--   raise notice 'Apagados: % tarefa(s), % oportunidade(s), % contato(s), % conta(s).',
--     n_tar, n_opo, n_con, n_cta;
-- end $$;

-- ------------------------------------------------------------------
-- 4. CONFERIR
-- Repita a consulta 1. A empresa escolhida tem de aparecer com zero em
-- contas, contatos, oportunidades e tarefas — e com `pessoas` inalterado.
-- As outras empresas têm de estar com os mesmos números de antes.
-- ------------------------------------------------------------------

-- ------------------------------------------------------------------
-- 5. OPCIONAL — as listas de configuração e as conversas de teste
--
-- Só descomente se você quer recomeçar TAMBÉM os produtos, segmentos, tipos
-- de tarefa e fontes. Eles não são carteira: são o catálogo. Quem já ajustou
-- preço de produto ou lista de segmentos perde esse ajuste aqui.
--
-- `whatsapp_numeros` fica de fora de propósito: é cadastro de canal, e
-- apagá-lo obriga a refazer a conexão do número na Meta.
-- ------------------------------------------------------------------
-- do $$
-- declare alvo uuid := '00000000-0000-0000-0000-000000000000';   -- <<< id da empresa
-- begin
--   delete from public.produtos          where tenant_id = alvo;
--   delete from public.segmentos         where tenant_id = alvo;
--   delete from public.tipos_tarefa      where tenant_id = alvo;
--   delete from public.fontes            where tenant_id = alvo;
--   delete from public.mensagens_whatsapp where tenant_id = alvo;
-- end $$;
