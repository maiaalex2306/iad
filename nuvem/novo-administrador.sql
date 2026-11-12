-- IAD CRM — promover alguém a administrador
-- ------------------------------------------------------------------
-- Rode no SQL Editor do Supabase, DEPOIS de criar a conta no painel:
--
--   Authentication → Users → Add user → Create new user
--     Email: alexandre.maia@acp.tec.br
--     Password: a que você escolher
--     Auto Confirm User: LIGADO — sem isso a pessoa não entra enquanto não
--                        clicar num e-mail de confirmação.
--
-- Criar a conta ali dispara o gatilho ao_criar_usuario, que já cria o perfil.
-- O que falta é dizer que ele administra e em qual empresa fica.
--
-- A senha não aparece neste arquivo de propósito: ela é digitada no painel e
-- não passa pelo repositório, que é público.
--
-- Para promover outra pessoa, troque o e-mail nos quatro lugares abaixo.
-- (Não dá para usar variável: \set é do psql, e o SQL Editor do Supabase não
-- é psql — ele manda o texto direto para o banco.)

-- 1. A conta existe? Sem linha aqui, ela não foi criada no painel — volte lá.
select id, email, email_confirmed_at is not null as confirmado
  from auth.users
 where lower(email) = lower('alexandre.maia@acp.tec.br');

-- 2. Perfil, papel e empresa.
--    Fica na primeira empresa liberada; troque o subselect se quiser outra.
--    Administrador enxerga todas de qualquer jeito — a empresa dele só decide
--    onde os registros que ele criar vão nascer.
insert into public.perfis (id, nome, papel, ativo, tenant_id)
select u.id, 'Alexandre Maia', 'admin', true,
       (select id from public.tenants where ativo order by criado_em limit 1)
  from auth.users u
 where lower(u.email) = lower('alexandre.maia@acp.tec.br')
on conflict (id) do update
   set papel     = 'admin',
       ativo     = true,
       nome      = coalesce(nullif(public.perfis.nome, ''), excluded.nome),
       tenant_id = coalesce(public.perfis.tenant_id, excluded.tenant_id);

-- 3. Se a conta foi criada antes da correção 03, pode não haver perfil nenhum
--    e o insert acima não teria o que atualizar. Esta linha confirma.
select case when exists (
         select 1 from public.perfis p
           join auth.users u on u.id = p.id
          where lower(u.email) = lower('alexandre.maia@acp.tec.br')
            and p.papel = 'admin' and p.ativo)
       then 'OK — administrador criado e liberado'
       else 'FALTOU — confira se a conta existe no passo 1'
       end as resultado;

-- 4. Quem administra o sistema agora. Tenha sempre mais de um: administrador
--    único é o que transforma um bloqueio errado numa noite perdida.
select u.email, p.nome, p.papel, p.ativo as liberado, t.nome as empresa
  from public.perfis p
  join auth.users u on u.id = p.id
  left join public.tenants t on t.id = p.tenant_id
 where p.papel = 'admin'
 order by u.email;
