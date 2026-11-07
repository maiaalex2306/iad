-- IaD CRM | Cadastro exclusivamente administrativo | migração incremental
-- PR3 v265. Executar no Supabase SQL Editor apenas após revisão/backup.
-- Preserva contas e perfis existentes. Não redefine senhas.
-- Exige que correcao-03, -04, -07 e -08 estejam aplicadas.
begin;

alter table public.convites
  add column if not exists whatsapp text not null default '';

-- Bloqueia criação de novas identidades sem reserva de e-mail pelo administrador.
-- A exceção ocorre SOMENTE antes da instalação da primeira empresa (bootstrap).
-- Convites continuam protegidos por RLS: INSERT/UPDATE apenas admin.
create or replace function public.ao_criar_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  c public.convites%rowtype;
  primeira_instalacao boolean;
  convite_encontrado boolean;
begin
  select * into c from public.convites
  where lower(email) = lower(new.email)
  for update;
  convite_encontrado := found;

  select not exists (select 1 from public.tenants)
    into primeira_instalacao;

  if not convite_encontrado and not primeira_instalacao then
    -- Não autorizar cadastro aberto com criação silenciosa de perfil.
    raise exception 'Cadastro permitido apenas por convite do administrador.'
      using errcode = '42501';
  end if;

  insert into public.perfis (id, nome, whatsapp, tenant_id, papel)
  values (
    new.id,
    coalesce(nullif(c.nome,''),nullif(new.raw_user_meta_data->>'nome',''),''),
    coalesce(nullif(c.whatsapp,''),nullif(new.raw_user_meta_data->>'whatsapp',''),''),
    c.tenant_id,
    coalesce(c.papel,'usuario')
  )
  on conflict (id) do update
  set nome = coalesce(nullif(public.perfis.nome,''),nullif(excluded.nome,''),''),
      whatsapp = coalesce(nullif(public.perfis.whatsapp,''),nullif(excluded.whatsapp,''),''),
      tenant_id = coalesce(excluded.tenant_id,public.perfis.tenant_id),
      papel = coalesce(excluded.papel,public.perfis.papel);

  if c.email is not null then
    delete from public.convites where email = c.email;
  end if;

  return new;
end $$;

commit;
notify pgrst, 'reload schema';
