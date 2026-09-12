-- Correção 1 — criar a empresa e ligar o próprio perfil a ela, numa operação só.
--
-- Rode este arquivo no SQL Editor do Supabase se você já executou o schema.sql
-- antes desta correção. Em instalações novas ele já vem dentro do schema.
--
-- O que estava errado: o app inseria em tenants pedindo a linha de volta. O
-- Postgres, ao devolver a linha de um insert, também aplica as políticas de
-- SELECT — e a de tenants diz "você vê a empresa que é a sua". Nesse instante o
-- usuário ainda não tinha empresa, então não podia ler a que acabara de criar, e
-- a operação inteira era recusada.
--
-- Além disso, criar a empresa e ligar o perfil eram dois passos: se o segundo
-- falhasse, sobrava uma empresa órfã e o usuário ficava travado. Aqui é atômico.

create or replace function public.criar_minha_empresa(p_nome text, p_cnpj text default '')
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  nova  public.tenants;
  atual uuid;
begin
  if auth.uid() is null then
    raise exception 'Entre na nuvem antes de criar a empresa.';
  end if;

  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'A empresa precisa de um nome.';
  end if;

  select tenant_id into atual from public.perfis where id = auth.uid();
  if atual is not null then
    raise exception 'Seu usuário já está ligado a uma empresa.';
  end if;

  insert into public.tenants (nome, cnpj)
    values (btrim(p_nome), coalesce(btrim(p_cnpj), ''))
    returning * into nova;

  -- Insert em vez de update: se o gatilho de criação do perfil não tiver
  -- rodado (usuário criado antes dele existir), ainda assim funciona.
  insert into public.perfis (id, tenant_id)
    values (auth.uid(), nova.id)
    on conflict (id) do update set tenant_id = excluded.tenant_id;

  return nova;
end $$;

-- security definer roda com os poderes de quem criou a função, então o acesso
-- precisa ser estreitado na mão: só quem está autenticado chama.
revoke all on function public.criar_minha_empresa(text, text) from public;
grant execute on function public.criar_minha_empresa(text, text) to authenticated;

-- Limpeza: empresas que ficaram sem nenhum perfil por causa do erro acima.
delete from public.tenants t
 where not exists (select 1 from public.perfis p where p.tenant_id = t.id);

-- O PostgREST (a camada que o app conversa) guarda um cache do que existe no
-- banco. Criar a função não basta se ele ainda não sabe que ela existe — daí
-- o "Could not find the function ... in the schema cache". Isto avisa.
notify pgrst, 'reload schema';
