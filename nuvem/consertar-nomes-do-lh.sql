-- IAD CRM — consertar as contas que nasceram com o nome da pessoa
-- ==================================================================
-- O QUE ACONTECEU
--
-- Até a v183, quando o Linked Helper entregava um lead e o app não reconhecia
-- o campo da empresa, a conta nascia chamada "Contato Fabio Alves" e a
-- negociação, "Fabio Alves — origem LH". O nome da pessoa no lugar do nome da
-- empresa não é rótulo feio: é dado errado. O relatório por empresa fica
-- errado, e no dia em que a empresa de verdade aparecer nasce uma conta
-- duplicada ao lado.
--
-- A leitura foi corrigida na v183. Este arquivo é para o que já entrou antes.
--
-- COMO FUNCIONA
--
-- O nome da empresa não foi guardado em lugar nenhum — não dá para recuperá-lo
-- por SQL. O que existe é o headline do LinkedIn, que o app grava nas notas da
-- negociação e quase sempre traz a empresa ("Gerente de Produção na Metalúrgica
-- X"). A consulta 2 mostra isso ao lado de cada conta, com um palpite extraído
-- do headline.
--
-- O palpite NÃO é aplicado sozinho. Você lê, decide, e escreve os nomes certos
-- na lista do passo 3. Palpite virando fato sem ninguém olhar é exatamente o
-- defeito que trouxe a gente até aqui.

-- ------------------------------------------------------------------
-- 1. QUAIS CONTAS ESTÃO ASSIM
-- Troque o id da empresa e rode. São as contas cujo nome o app inventou.
-- ------------------------------------------------------------------
select c.id, c.nome, count(o.id) as negociacoes
  from public.contas c
  left join public.oportunidades o on o.conta_id = c.id
 where c.tenant_id = '00000000-0000-0000-0000-000000000000'   -- <<< id da empresa
   and (c.nome like 'Contato %' or c.nome like '%(empresa não informada)')
 group by c.id, c.nome
 order by c.nome;

-- ------------------------------------------------------------------
-- 2. O QUE DÁ PARA SABER SOBRE CADA UMA
--
-- `headline` é a linha do LinkedIn que o app guardou nas notas. `palpite` é o
-- que vem depois de " na ", " at " ou " | " dentro dela — é chute, e está aqui
-- só para você reconhecer a empresa mais rápido, não para ser copiado no
-- escuro.
-- ------------------------------------------------------------------
select c.id       as conta_id,
       c.nome     as nome_errado,
       ct.nome    as pessoa,
       ct.cargo   as cargo,
       ct.linkedin,
       nullif(split_part(o.notas, E'\n', 3), '')                       as headline,
       nullif(btrim((regexp_match(
         coalesce(split_part(o.notas, E'\n', 3), ''),
         '(?:\s+na\s+|\s+at\s+|\s+@\s+|\s*\|\s*)(.+)$'))[1]), '')      as palpite
  from public.contas c
  left join public.contatos ct      on ct.conta_id = c.id
  left join public.oportunidades o  on o.conta_id = c.id
 where c.tenant_id = '00000000-0000-0000-0000-000000000000'   -- <<< id da empresa
   and (c.nome like 'Contato %' or c.nome like '%(empresa não informada)')
 order by c.nome;

-- ------------------------------------------------------------------
-- 3. APLICAR OS NOMES CERTOS
--
-- Escreva um par por linha: o id da conta (da consulta 2) e o nome da empresa.
-- Só as contas que você listar aqui são tocadas. O título das negociações é
-- refeito a partir do nome da conta, para os dois pararem de divergir.
--
-- Descomente o bloco, preencha, rode.
-- ------------------------------------------------------------------
-- begin;
--
-- with novos(conta_id, nome_novo) as (
--   values
--     ('cta_exemplo1', 'Metalúrgica X Ltda'),
--     ('cta_exemplo2', 'Usinagem Y S.A.')
-- )
-- update public.contas c
--    set nome = n.nome_novo
--   from novos n
--  where c.id = n.conta_id
--    and c.tenant_id = '00000000-0000-0000-0000-000000000000';   -- <<< id da empresa
--
-- -- O título passa a sair do nome da conta. Só mexe nos que o app gerou,
-- -- reconhecíveis pelo sufixo — negócio renomeado à mão fica como está.
-- update public.oportunidades o
--    set titulo = c.nome || ' — origem LH'
--   from public.contas c
--  where c.id = o.conta_id
--    and o.tenant_id = '00000000-0000-0000-0000-000000000000'    -- <<< id da empresa
--    and o.origem = 'Linked Helper'
--    and o.titulo like '% — origem LH';
--
-- commit;

-- ------------------------------------------------------------------
-- 4. CONFERIR
-- Repita a consulta 1: só devem sobrar as que você ainda não identificou.
-- E no app, recarregue — desde a v180 a carteira vem do servidor a cada
-- abertura, então não há cópia local para desfazer o conserto.
-- ------------------------------------------------------------------
