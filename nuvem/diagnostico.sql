-- Diagnóstico — "o pipeline está vazio e eu tenho contas lá"
--
-- Rode no Supabase → SQL Editor. Ele roda como dono do banco, ou seja, POR CIMA
-- do RLS: é justamente isso que a gente quer aqui. O app enxerga o que o RLS
-- deixa; este arquivo enxerga o que existe. A diferença entre os dois é a
-- resposta.
--
-- Troque o e-mail da primeira linha pelo da pessoa que está vendo a tela vazia.

\set alvo 'alexandre.maia@biopartners.com.br'

-- 1) Quem é a pessoa, para o servidor.
select 'PERFIL' as bloco,
       u.email,
       p.id            as usuario_id,
       p.papel,
       p.ativo,
       p.tenant_id,
       t.nome          as empresa,
       t.ativo         as empresa_ativa
  from auth.users u
  left join public.perfis  p on p.id = u.id
  left join public.tenants t on t.id = p.tenant_id
 where lower(u.email) = lower(:'alvo');

-- 2) As correções que mudam quem vê o quê já foram aplicadas?
--    Sem sou_gestor(), a correção 5 nunca rodou aqui — e nesse caso o gestor
--    ainda é tratado como vendedor comum, vendo só o que tem o dono_id dele.
select 'CORREÇÕES' as bloco,
       to_regprocedure('public.sou_gestor()')  is not null as correcao_05_gestor,
       to_regprocedure('public.sou_admin()')   is not null as sou_admin,
       to_regprocedure('public.meu_tenant()')  is not null as meu_tenant;

-- 3) Onde estão, de fato, as contas e as oportunidades — por empresa.
--    Se aparecerem em uma empresa que não é a da linha PERFIL acima, o problema
--    é o carimbo dos registros, não a permissão.
select 'CONTAS POR EMPRESA' as bloco,
       coalesce(t.nome, '(sem empresa)') as empresa,
       c.tenant_id,
       count(*) as quantas
  from public.contas c
  left join public.tenants t on t.id = c.tenant_id
 group by 1, 2, 3 order by quantas desc;

select 'OPORTUNIDADES POR EMPRESA' as bloco,
       coalesce(t.nome, '(sem empresa)') as empresa,
       o.tenant_id,
       count(*) as quantas
  from public.oportunidades o
  left join public.tenants t on t.id = o.tenant_id
 group by 1, 2, 3 order by quantas desc;

-- 4) E de quem elas são. Com a correção 5 aplicada, o dono não importa para um
--    gestor; sem ela, é o dono que decide tudo.
select 'OPORTUNIDADES POR DONO' as bloco,
       coalesce(u.email, '(sem dono)') as dono,
       o.dono_id,
       count(*) as quantas
  from public.oportunidades o
  left join auth.users u on u.id = o.dono_id
 group by 1, 2, 3 order by quantas desc;

-- 5) A prova final: o que o RLS devolveria para esta pessoa, sem ela precisar
--    entrar no app. Repete a condição da política, com os valores dela.
with eu as (
  select p.id, p.papel, p.tenant_id
    from public.perfis p
    join auth.users u on u.id = p.id
   where lower(u.email) = lower(:'alvo')
)
select 'O QUE ELA VERIA' as bloco,
       (select count(*) from public.contas c, eu
         where c.tenant_id = eu.tenant_id
           and (eu.papel in ('gestor','admin') or c.dono_id = eu.id or c.dono_id is null)) as contas,
       (select count(*) from public.oportunidades o, eu
         where o.tenant_id = eu.tenant_id
           and (eu.papel in ('gestor','admin') or o.dono_id = eu.id or o.dono_id is null)) as oportunidades,
       (select count(*) from public.segmentos s, eu where s.tenant_id = eu.tenant_id) as segmentos;

-- Como ler o resultado
-- -------------------
-- · CONTAS POR EMPRESA aponta uma empresa diferente da do PERFIL
--     → os registros estão carimbados com outra empresa. O perfil dela precisa
--       apontar para essa empresa, ou os registros precisam ser movidos.
--
-- · correcao_05_gestor = false
--     → rode nuvem/correcao-05-gestor.sql. Sem ela o gestor é tratado como
--       vendedor comum e só vê o que tem o dono_id dele.
--
-- · "O QUE ELA VERIA" já traz zero, e os totais por empresa são altos
--     → é permissão, e as duas linhas acima dizem qual das duas.
--
-- · "O QUE ELA VERIA" traz números, mas o app mostra zero
--     → aí o problema é do app, e não do banco. Me mande este resultado.
