-- Limpeza seletiva: apaga UMA empresa por vez, escolhida por você.
--
-- Diferente do limpeza.sql, que é a opção nuclear: aquele apaga todas as
-- empresas e todos os usuários para recomeçar do zero. Este aqui serve para o
-- caso normal — tirar do caminho a empresa de teste, a que nasceu de um
-- convite errado, ou a que existiu e não existe mais.
--
-- APAGA DE VERDADE E NÃO TEM DESFAZER. As três consultas de conferência não
-- são formalidade: rode e leia cada uma antes de descomentar o bloco de baixo.

-- ------------------------------------------------------------- 1. o que existe
-- Cada empresa, com o peso dela. Empresa com zero em tudo é candidata segura;
-- empresa com oportunidades é conversa, não limpeza.
select t.id,
       t.nome,
       t.criado_em,
       (select count(*) from public.perfis        p where p.tenant_id = t.id) as pessoas,
       (select count(*) from public.contas        c where c.tenant_id = t.id) as contas,
       (select count(*) from public.contatos      c where c.tenant_id = t.id) as contatos,
       (select count(*) from public.oportunidades o where o.tenant_id = t.id) as oportunidades,
       (select count(*) from public.tarefas       x where x.tenant_id = t.id) as tarefas
  from public.tenants t
 order by t.criado_em;

-- --------------------------------------------------------- 2. quem fica órfão
-- `perfis.tenant_id` é `on delete set null`: ninguém é apagado junto com a
-- empresa, as pessoas apenas ficam sem empresa e param de enxergar qualquer
-- coisa. Se aparecer alguém aqui que ainda vai usar o sistema, mude a empresa
-- dela ANTES de apagar — depois fica mais difícil descobrir para onde ia.
select u.email, p.papel
  from public.perfis p
  join auth.users u on u.id = p.id
 where p.tenant_id = '00000000-0000-0000-0000-000000000000';   -- <<< o id da empresa

-- ------------------------------------------------------ 3. o que vai junto
-- As nove tabelas de negócio saem em cascata com a empresa. Esta consulta é a
-- última chance de ver o que está prestes a sumir, com nome e não com número.
select 'conta' as tipo, nome from public.contas
 where tenant_id = '00000000-0000-0000-0000-000000000000'      -- <<< o id da empresa
union all
select 'oportunidade', titulo from public.oportunidades
 where tenant_id = '00000000-0000-0000-0000-000000000000'      -- <<< o id da empresa
 limit 200;

-- -------------------------------------------------------------- 4. apagar
-- Descomente o bloco, troque o id, rode. Uma empresa por vez, de propósito:
-- apagar duas numa tacada é o jeito de apagar a errada sem perceber.
--
-- begin;
--   delete from public.tenants
--    where id = '00000000-0000-0000-0000-000000000000';        -- <<< o id da empresa
-- commit;

-- ------------------------------------------------------- 5. conferir depois
-- Repita a consulta 1. A empresa apagada não pode mais aparecer, e as outras
-- têm de estar com os mesmos números de antes.

-- ============================================================================
-- As linhas da demonstração
-- ============================================================================
-- A demonstração nasce no navegador e só vai para o servidor se alguém
-- sincronizar com ela carregada. Quando isso acontece, ela vira carteira de
-- verdade dentro da SUA empresa — e aí não dá para apagar pela empresa, porque
-- a empresa é legítima.
--
-- Estas são as contas que a demonstração cria. Confira antes de apagar: se
-- você tiver um cliente de verdade com um destes nomes, tire-o da lista.
--
-- select id, nome, criado_em from public.contas
--  where tenant_id = '00000000-0000-0000-0000-000000000000'    -- <<< a SUA empresa
--    and nome in ('ACME Agroindustrial', 'Vale Verde Cooperativa',
--                 'Litoral Papel e Celulose', 'Grupo Nordeste Alimentos');
--
-- Apagar a conta leva junto contatos, oportunidades e tarefas dela, em
-- cascata. Rode a consulta acima primeiro e olhe os nomes.
--
-- begin;
--   delete from public.contas
--    where tenant_id = '00000000-0000-0000-0000-000000000000'  -- <<< a SUA empresa
--      and nome in ('ACME Agroindustrial', 'Vale Verde Cooperativa',
--                   'Litoral Papel e Celulose', 'Grupo Nordeste Alimentos');
-- commit;
