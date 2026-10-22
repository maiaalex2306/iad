-- IAD CRM — correção 08: o nome vem junto com o convite
-- ------------------------------------------------------------------
-- O que quebrou: quem entra pelo convite chega sem nome.
--
-- O gatilho lê o nome de raw_user_meta_data, que é o que a tela "Criar meu
-- acesso" preenche. O convite do GoTrue não passa por essa tela: ele cria a
-- conta a partir do e-mail e nada mais. Sem metadados, nome vira '' — e a
-- pessoa aparece na lista do administrador como um traço, com empresa e papel
-- certos e sem identidade. Meio cadastro é pior do que nenhum: dá para
-- confundir com falha de importação, e ninguém sabe de quem é a linha.
--
-- A correção guarda o nome já no convite, onde o administrador o conhece, e
-- deixa o gatilho usá-lo quando não houver metadados.

alter table public.convites add column if not exists nome text not null default '';

-- A ordem importa: o que a própria pessoa digitou ao criar o acesso vale mais
-- do que o que o administrador escreveu ao registrá-la. nullif troca o texto
-- vazio por nulo para o coalesce poder seguir adiante — sem ele, um '' venceria
-- o nome do convite por ser um valor legítimo.
create or replace function public.ao_criar_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.convites;
begin
  select * into c from public.convites where lower(email) = lower(new.email);

  insert into public.perfis (id, nome, whatsapp, tenant_id, papel)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'nome', ''), nullif(c.nome, ''), ''),
          coalesce(new.raw_user_meta_data->>'whatsapp', ''),
          c.tenant_id,
          coalesce(c.papel, 'usuario'))
  on conflict (id) do update
     set tenant_id = coalesce(excluded.tenant_id, public.perfis.tenant_id),
         papel     = coalesce(excluded.papel, public.perfis.papel),
         nome      = coalesce(nullif(public.perfis.nome, ''), nullif(excluded.nome, ''), '');

  if c.email is not null then
    delete from public.convites where email = c.email;
  end if;

  return new;
end $$;

-- ------------------------------------------------- consertar quem já entrou
-- Quem chegou pelo convite antes desta correção está com o nome vazio, e a
-- pessoa só poderia consertar entrando — o que ela ainda não consegue fazer.
-- Então o administrador conserta. Não dá para reaproveitar o grant de update
-- em (nome, whatsapp): aquele vale para a própria linha, pela RLS. Escrever na
-- linha de outra pessoa exige security definer, e a função confere o papel de
-- quem chama antes de escrever — a mesma regra de definir_papel_do_perfil.
create or replace function public.definir_nome_do_perfil(p_id uuid, p_nome text)
returns public.perfis language plpgsql security definer set search_path = public as $$
declare linha public.perfis;
begin
  if not public.sou_admin() then
    raise exception 'Só quem administra muda o nome de outra pessoa.';
  end if;
  update public.perfis set nome = coalesce(p_nome, '') where id = p_id returning * into linha;
  return linha;
end $$;

revoke all on function public.definir_nome_do_perfil(uuid, text) from public;
grant execute on function public.definir_nome_do_perfil(uuid, text) to authenticated;
