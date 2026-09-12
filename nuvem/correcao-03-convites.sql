-- Correção 3 — só o administrador cria empresas e decide de quem é cada pessoa.
--
-- Rode no SQL Editor do Supabase. Instalações novas já saem assim.
--
-- O que muda: o usuário comum deixa de poder criar empresa. Quem entra sem
-- vínculo não vê formulário de empresa nenhum — vê um recado para procurar quem
-- administra. E o administrador registra a pessoa antes, dizendo a empresa; no
-- cadastro, o vínculo é aplicado sozinho.

-- ------------------------------------------------------------------ convites
create table if not exists public.convites (
  email      text primary key,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  papel      text not null default 'usuario' check (papel in ('usuario', 'admin')),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em  timestamptz default now()
);

alter table public.convites enable row level security;

drop policy if exists convites_admin on public.convites;
create policy convites_admin on public.convites for all
  using (public.sou_admin()) with check (public.sou_admin());

-- ------------------------------------------------- o vínculo nasce com o usuário
-- O gatilho já criava o perfil. Agora ele também procura um convite pelo e-mail
-- e aplica empresa e papel — é isso que faz a pessoa entrar já no lugar certo,
-- sem escolher nada e sem poder escolher errado.
create or replace function public.ao_criar_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.convites;
begin
  select * into c from public.convites where lower(email) = lower(new.email);

  insert into public.perfis (id, nome, whatsapp, tenant_id, papel)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'nome', ''),
          coalesce(new.raw_user_meta_data->>'whatsapp', ''),
          c.tenant_id,
          coalesce(c.papel, 'usuario'))
  on conflict (id) do update
     set tenant_id = coalesce(excluded.tenant_id, public.perfis.tenant_id),
         papel     = coalesce(excluded.papel, public.perfis.papel);

  -- Convite usado não fica para trás.
  if c.email is not null then
    delete from public.convites where email = c.email;
  end if;

  return new;
end $$;

drop trigger if exists trg_ao_criar_usuario on auth.users;
create trigger trg_ao_criar_usuario after insert on auth.users
  for each row execute function public.ao_criar_usuario();

-- ------------------------------------------------- criar empresa é do administrador
-- Insert direto passa a exigir administrador.
drop policy if exists tenants_criacao on public.tenants;
create policy tenants_criacao on public.tenants for insert
  with check (public.sou_admin());

-- E a função que o app chama também. A exceção é a primeira empresa de todas:
-- sem ela não haveria como começar, porque não existe administrador com empresa.
create or replace function public.criar_minha_empresa(p_nome text, p_cnpj text default '')
returns public.tenants
language plpgsql security definer set search_path = public as $$
declare
  nova    public.tenants;
  atual   uuid;
  primeira boolean;
begin
  if auth.uid() is null then
    raise exception 'Entre na nuvem antes de criar a empresa.';
  end if;

  select not exists (select 1 from public.tenants) into primeira;
  if not primeira and not public.sou_admin() then
    raise exception 'Só quem administra cria empresas. Peça a ele para ligar você à empresa certa.';
  end if;

  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'A empresa precisa de um nome.';
  end if;

  select tenant_id into atual from public.perfis where id = auth.uid();
  if atual is not null and primeira then
    raise exception 'Seu usuário já está ligado a uma empresa.';
  end if;

  insert into public.tenants (nome, cnpj)
    values (btrim(p_nome), coalesce(btrim(p_cnpj), ''))
    returning * into nova;

  -- Quem cria a primeira empresa entra nela e vira administrador: é o dono
  -- montando a casa. O administrador que cria outras empresas não muda de lugar.
  if primeira then
    insert into public.perfis (id, tenant_id, papel)
      values (auth.uid(), nova.id, 'admin')
      on conflict (id) do update set tenant_id = excluded.tenant_id, papel = 'admin';
  end if;

  return nova;
end $$;

revoke all on function public.criar_minha_empresa(text, text) from public;
grant execute on function public.criar_minha_empresa(text, text) to authenticated;

notify pgrst, 'reload schema';
