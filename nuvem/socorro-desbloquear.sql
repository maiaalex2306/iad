-- IAD CRM — socorro: destravar o acesso do administrador
-- ------------------------------------------------------------------
-- Rode isto no SQL Editor do Supabase. Ali quem executa é o dono do banco,
-- que passa por cima de todas as políticas — é por isso que este caminho
-- funciona mesmo quando o app já não deixa ninguém entrar. É a porta dos
-- fundos que todo sistema com bloqueio precisa ter.
--
-- Troque o e-mail abaixo se for outro administrador.

-- 1. Como está agora, antes de mexer.
select u.email,
       p.nome,
       p.papel,
       p.ativo          as pessoa_liberada,
       t.nome           as empresa,
       t.ativo          as empresa_liberada
  from public.perfis p
  join auth.users u  on u.id = p.id
  left join public.tenants t on t.id = p.tenant_id
 order by p.papel, u.email;

-- 2. Libera a pessoa e a empresa dela.
update public.perfis
   set ativo = true
 where id in (select id from auth.users where lower(email) = lower('maia.alex.2306@gmail.com'));

update public.tenants
   set ativo = true
 where id in (select p.tenant_id
                from public.perfis p
                join auth.users u on u.id = p.id
               where lower(u.email) = lower('maia.alex.2306@gmail.com'));

-- 3. Garante que ela é administradora — se o papel tiver se perdido junto.
update public.perfis
   set papel = 'admin'
 where id in (select id from auth.users where lower(email) = lower('maia.alex.2306@gmail.com'));

-- 4. Como ficou.
select u.email, p.nome, p.papel, p.ativo as pessoa_liberada,
       t.nome as empresa, t.ativo as empresa_liberada
  from public.perfis p
  join auth.users u on u.id = p.id
  left join public.tenants t on t.id = p.tenant_id
 where lower(u.email) = lower('maia.alex.2306@gmail.com');

-- ------------------------------------------------------------------
-- Se quiser liberar TODO MUNDO de uma vez e recomeçar do zero, use estas
-- duas linhas no lugar dos passos 2 e 3. Elas desfazem qualquer bloqueio
-- que exista no sistema inteiro.
--
--   update public.perfis  set ativo = true;
--   update public.tenants set ativo = true;
