-- Correção 4 — ninguém muda o próprio papel nem a própria empresa.
--
-- URGENTE. Rode no SQL Editor do Supabase.
--
-- O buraco: a política de perfis deixa cada um atualizar a própria linha — o
-- que é certo para nome e WhatsApp, e desastroso para papel e empresa. Com a
-- chave pública que fica no app, um usuário comum podia mandar:
--
--   PATCH /rest/v1/perfis?id=eq.<ele mesmo>   {"papel":"admin"}
--
-- e passar a enxergar todas as empresas. Ou trocar o tenant_id e cair na
-- carteira de outra. Confirmado num PostgreSQL de teste: os dois funcionavam.
--
-- RLS decide quais LINHAS, não quais COLUNAS. Então a restrição de coluna vem
-- do próprio Postgres, e as mudanças que só o administrador pode fazer passam a
-- exigir uma função que confere quem está pedindo.

revoke insert, update on public.perfis from authenticated;
grant update (nome, whatsapp) on public.perfis to authenticated;

-- Inserir perfil é trabalho do gatilho, que roda com poderes próprios.
-- Ninguém precisa inserir à mão — e quem podia, podia nascer administrador.

create or replace function public.definir_empresa_do_perfil(p_id uuid, p_tenant uuid)
returns public.perfis language plpgsql security definer set search_path = public as $$
declare linha public.perfis;
begin
  if not public.sou_admin() then
    raise exception 'Só quem administra pode mudar a empresa de alguém.';
  end if;
  update public.perfis set tenant_id = p_tenant where id = p_id returning * into linha;
  if linha.id is null then raise exception 'Usuário não encontrado.'; end if;
  return linha;
end $$;

create or replace function public.definir_papel_do_perfil(p_id uuid, p_papel text)
returns public.perfis language plpgsql security definer set search_path = public as $$
declare linha public.perfis;
begin
  if not public.sou_admin() then
    raise exception 'Só quem administra pode mudar papéis.';
  end if;
  if p_papel not in ('usuario', 'admin') then
    raise exception 'Papel inválido.';
  end if;
  /* Sem isto, o único administrador se rebaixa e ninguém mais administra. */
  if p_id = auth.uid() and p_papel <> 'admin' then
    raise exception 'Você não pode retirar o próprio acesso de administrador.';
  end if;
  update public.perfis set papel = p_papel where id = p_id returning * into linha;
  if linha.id is null then raise exception 'Usuário não encontrado.'; end if;
  return linha;
end $$;

revoke all on function public.definir_empresa_do_perfil(uuid, uuid) from public;
revoke all on function public.definir_papel_do_perfil(uuid, text) from public;
grant execute on function public.definir_empresa_do_perfil(uuid, uuid) to authenticated;
grant execute on function public.definir_papel_do_perfil(uuid, text) to authenticated;

notify pgrst, 'reload schema';
