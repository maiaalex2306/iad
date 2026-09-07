-- IAD CRM — promover alguém a administrador
-- ------------------------------------------------------------------
-- Rode no SQL Editor do Supabase, DEPOIS de criar a conta no painel:
--
--   Authentication → Users → Add user → Create new user
--     Email: alexandre.maia@acp.tec.br
--     Password: (escolha uma; veja o aviso no fim deste arquivo)
--     Auto Confirm User: ligado — sem isso a pessoa não entra sem clicar
--                        num e-mail de confirmação.
--
-- Criar a conta ali dispara o gatilho ao_criar_usuario, que já cria o perfil.
-- O que falta é dizer que ele administra e em qual empresa fica.
--
-- A senha não aparece em lugar nenhum deste arquivo, de propósito: ela é
-- digitada no painel e não passa pelo repositório.

-- Troque aqui, e só aqui.
\set email 'alexandre.maia@acp.tec.br'

-- 1. A conta existe? Se não vier linha, a conta não foi criada no painel.
select id, email, email_confirmed_at is not null as confirmado
  from auth.users where lower(email) = lower(:'email');

-- 2. Perfil, papel e empresa. Fica na mesma empresa do administrador atual;
--    troque o subselect se quiser outra. Administrador enxerga todas de
--    qualquer jeito — a empresa dele só decide onde os registros dele nascem.
insert into public.perfis (id, nome, papel, ativo, tenant_id)
select u.id, 'Alexandre Maia', 'admin', true,
       (select id from public.tenants where ativo order by criado_em limit 1)
  from auth.users u
 where lower(u.email) = lower(:'email')
on conflict (id) do update
   set papel = 'admin',
       ativo = true,
       nome  = coalesce(nullif(public.perfis.nome, ''), excluded.nome),
       tenant_id = coalesce(public.perfis.tenant_id, excluded.tenant_id);

-- 3. Como ficou — e quem mais administra o sistema.
select u.email, p.nome, p.papel, p.ativo as liberado, t.nome as empresa
  from public.perfis p
  join auth.users u on u.id = p.id
  left join public.tenants t on t.id = p.tenant_id
 where p.papel = 'admin'
 order by u.email;

-- ------------------------------------------------------------------
-- AVISO SOBRE A SENHA
--
-- Não reaproveite a senha @Bento2306. Ela esteve publicada no código deste
-- repositório, que é público, continua no histórico do Git e foi escrita em
-- conversa. Qualquer pessoa que tenha visto qualquer um desses três lugares
-- a conhece. Usá-la de novo — em outra conta, com outro e-mail — entrega o
-- administrador novo junto com o antigo.
--
-- Escolha uma senha que nunca tenha sido escrita em lugar nenhum, e troque
-- também a do maia.alex.2306@gmail.com, que ainda está com ela.
