-- Correção 5 — três níveis de visibilidade.
--
--   Administrador  vê todas as empresas.
--   Gestor         vê tudo da empresa dele.
--   Usuário        vê o que é dele.
--
-- Até aqui só havia dois níveis: quem estava numa empresa via tudo dela. Ou
-- seja, todo mundo era gestor. Isso vale no banco, não só na tela — senão um
-- vendedor lê a carteira do colega trocando uma linha no navegador.

-- --------------------------------------------------------------- papel gestor
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('usuario', 'gestor', 'admin'));

create or replace function public.sou_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select papel in ('gestor', 'admin') from public.perfis where id = auth.uid()), false)
$$;

-- ------------------------------------------------------------------ dono
-- Contas e contatos não tinham dono: sem isso não há como dizer "o que é dela".
alter table public.contas    add column if not exists dono_id uuid references auth.users(id) on delete set null;
alter table public.contatos  add column if not exists dono_id uuid references auth.users(id) on delete set null;

create index if not exists idx_contas_dono        on public.contas(dono_id);
create index if not exists idx_contatos_dono      on public.contatos(dono_id);
create index if not exists idx_oportunidades_dono on public.oportunidades(dono_id);
create index if not exists idx_tarefas_dono       on public.tarefas(dono_id);

-- --------------------------------------------------------------- as políticas
-- Duas famílias de tabela, e a diferença é proposital:
--
--   Movimento (contas, contatos, oportunidades, tarefas) tem dono. O usuário vê
--   o que é dele; o gestor vê o da empresa inteira.
--
--   Configuração (produtos, segmentos, tipos de tarefa) é da empresa. Esconder
--   a lista de segmentos de quem precisa escolher um seria só atrapalhar.
--
-- Registro antigo, sem dono, é tratado como da empresa: some para ninguém.
do $$
declare t text;
begin
  foreach t in array array['contas', 'contatos', 'oportunidades', 'tarefas']
  loop
    execute format('drop policy if exists %I_tudo on public.%I', t, t);
    execute format($f$
      create policy %I_tudo on public.%I for all
        using (
          public.sou_admin()
          or (tenant_id = public.meu_tenant()
              and (public.sou_gestor() or dono_id = auth.uid() or dono_id is null))
        )
        with check (
          public.sou_admin()
          or (tenant_id = public.meu_tenant()
              and (public.sou_gestor() or dono_id = auth.uid() or dono_id is null))
        )
    $f$, t, t);
  end loop;

  foreach t in array array['produtos', 'segmentos', 'tipos_tarefa']
  loop
    execute format('drop policy if exists %I_tudo on public.%I', t, t);
    execute format($f$
      create policy %I_tudo on public.%I for all
        using (tenant_id = public.meu_tenant() or public.sou_admin())
        with check (tenant_id = public.meu_tenant() or public.sou_admin())
    $f$, t, t);
  end loop;
end $$;

-- ------------------------------------------- o gestor entra na função de papéis
create or replace function public.definir_papel_do_perfil(p_id uuid, p_papel text)
returns public.perfis language plpgsql security definer set search_path = public as $$
declare linha public.perfis;
begin
  if not public.sou_admin() then
    raise exception 'Só quem administra pode mudar papéis.';
  end if;
  if p_papel not in ('usuario', 'gestor', 'admin') then
    raise exception 'Papel inválido.';
  end if;
  if p_id = auth.uid() and p_papel <> 'admin' then
    raise exception 'Você não pode retirar o próprio acesso de administrador.';
  end if;
  update public.perfis set papel = p_papel where id = p_id returning * into linha;
  if linha.id is null then raise exception 'Usuário não encontrado.'; end if;
  return linha;
end $$;

revoke all on function public.definir_papel_do_perfil(uuid, text) from public;
grant execute on function public.definir_papel_do_perfil(uuid, text) to authenticated;

notify pgrst, 'reload schema';
