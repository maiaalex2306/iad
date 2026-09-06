-- Limpeza: deixa só o administrador e apaga o resto para recomeçar.
--
-- APAGA DE VERDADE, E NÃO TEM DESFAZER. Rode a consulta de conferência
-- primeiro e leia o resultado antes de executar o bloco de baixo.

-- ---------------------------------------------------------------- 1. conferir
-- Quem existe hoje, e com quanto dado. Rode só isto primeiro.
select u.email,
       p.papel,
       t.nome as empresa,
       (select count(*) from public.oportunidades o where o.tenant_id = p.tenant_id) as oportunidades,
       (select count(*) from public.contas c where c.tenant_id = p.tenant_id) as empresas_cadastradas
  from auth.users u
  left join public.perfis p on p.id = u.id
  left join public.tenants t on t.id = p.tenant_id
 order by u.created_at;

-- ---------------------------------------------------------------- 2. apagar
-- Só execute depois de conferir acima. Apaga tudo, menos o administrador.
begin;

  -- As tabelas de negócio saem junto com as empresas (on delete cascade),
  -- e perfis.tenant_id volta a ficar vazio (on delete set null).
  delete from public.tenants;

  -- Todo usuário que não seja o administrador. perfis sai junto (on delete cascade).
  delete from auth.users
   where email <> 'maia.alex.2306@gmail.com';

  -- O que sobra vira administrador, sem empresa, pronto para recomeçar.
  update public.perfis
     set papel = 'admin', tenant_id = null
   where id = (select id from auth.users where email = 'maia.alex.2306@gmail.com');

commit;

-- ---------------------------------------------------------------- 3. conferir de novo
select u.email, p.papel, p.tenant_id
  from auth.users u left join public.perfis p on p.id = u.id;
