-- IAD CRM — correção 09: bloquear e desbloquear empresas e usuários
-- ------------------------------------------------------------------
-- As colunas `ativo` existem em tenants e perfis desde o começo e nunca
-- decidiram nada: a tela mostrava "ativo" para todo mundo, olhando se a pessoa
-- tinha empresa. Bloquear era, na prática, escrever SQL.
--
-- Excluir ficou de fora de propósito. Desligar um vendedor não pode apagar a
-- carteira que ele atendia, e cliente continua cliente depois que o vendedor
-- sai. Bloqueio faz o mesmo trabalho — a pessoa não entra mais — e é
-- reversível, que é o que uma operação de administração precisa ser.
--
-- Onde o bloqueio pega: em meu_tenant(), sou_gestor() e sou_admin(). Todas as
-- políticas de todas as tabelas passam por essas três funções, então o
-- bloqueio vale no banco inteiro sem tocar em nenhuma política. Bloqueio que
-- só existe na tela não é bloqueio: basta o navegador para contorná-lo.

alter table public.tenants alter column ativo set default true;
alter table public.perfis  alter column ativo set default true;
update public.tenants set ativo = true where ativo is null;
update public.perfis  set ativo = true where ativo is null;
alter table public.tenants alter column ativo set not null;
alter table public.perfis  alter column ativo set not null;

-- ------------------------------------------------------------ o bloqueio pega
-- Sem empresa, nenhuma política de tabela de dados dá acesso: todas comparam
-- tenant_id com meu_tenant(). Então basta esta função devolver nulo para o
-- bloqueio valer em toda parte — na empresa bloqueada e no usuário bloqueado.
create or replace function public.meu_tenant()
returns uuid language sql stable security definer set search_path = public as $$
  select p.tenant_id
    from public.perfis p
    left join public.tenants t on t.id = p.tenant_id
   where p.id = auth.uid()
     and p.ativo
     and coalesce(t.ativo, true)
$$;

-- Papel de quem está bloqueado não vale mais. Repare que o administrador não
-- perde o papel quando a EMPRESA dele é bloqueada: é ele quem desbloqueia, e
-- tirar o acesso dele junto trancaria o sistema por fora.
create or replace function public.sou_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select papel in ('gestor', 'admin') and ativo
                     from public.perfis where id = auth.uid()), false)
$$;

create or replace function public.sou_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'admin' and ativo
                     from public.perfis where id = auth.uid()), false)
$$;

-- --------------------------------------------------------- por que não entrei
-- Quem está bloqueado consegue ler a própria linha de perfis, mas não a da
-- empresa — meu_tenant() já devolveu nulo. Sem isto o app saberia que a pessoa
-- não tem acesso e não saberia dizer por quê, e "não aparece nada" é a pior
-- explicação possível para quem está do outro lado.
create or replace function public.minha_situacao()
returns table (perfil_ativo boolean, empresa_ativa boolean, empresa_nome text)
language sql stable security definer set search_path = public as $$
  select p.ativo,
         coalesce(t.ativo, true),
         coalesce(t.nome, '')
    from public.perfis p
    left join public.tenants t on t.id = p.tenant_id
   where p.id = auth.uid()
$$;

-- ------------------------------------------------------ atribuições do adm
-- Todas exigem administrador, e todas são security definer: quem decide é o
-- banco. A tela pode esconder o botão; esconder não é impedir.

create or replace function public.definir_bloqueio_do_perfil(p_id uuid, p_ativo boolean)
returns public.perfis language plpgsql security definer set search_path = public as $$
declare linha public.perfis; sobram int;
begin
  if not public.sou_admin() then
    raise exception 'Só quem administra bloqueia ou desbloqueia pessoas.';
  end if;

  -- Bloquear a si mesmo tranca o sistema por fora: quem desbloquearia?
  if p_id = auth.uid() and not p_ativo then
    raise exception 'Você não pode bloquear a si mesmo. Peça a outro administrador.';
  end if;

  -- Rede de baixo. Hoje ela não chega a ser alcançada: quem chama é
  -- administrador ativo, então ele mesmo sempre sobra na conta, e o único
  -- caso que zeraria — bloquear a si mesmo — já foi recusado acima. Fica
  -- porque a regra que importa é "nunca ficar sem administrador ativo", e a
  -- checagem de cima protege isso por consequência, não por definição: no dia
  -- em que ela mudar, esta continua valendo.
  if not p_ativo then
    select count(*) into sobram from public.perfis
     where papel = 'admin' and ativo and id <> p_id;
    if sobram = 0 then
      raise exception 'Este é o último administrador ativo. Promova outro antes de bloquear este.';
    end if;
  end if;

  update public.perfis set ativo = p_ativo where id = p_id returning * into linha;
  if linha.id is null then raise exception 'Pessoa não encontrada.'; end if;
  return linha;
end $$;

create or replace function public.definir_bloqueio_da_empresa(p_id uuid, p_ativo boolean)
returns public.tenants language plpgsql security definer set search_path = public as $$
declare linha public.tenants;
begin
  if not public.sou_admin() then
    raise exception 'Só quem administra bloqueia ou desbloqueia empresas.';
  end if;
  update public.tenants set ativo = p_ativo where id = p_id returning * into linha;
  if linha.id is null then raise exception 'Empresa não encontrada.'; end if;
  return linha;
end $$;

create or replace function public.definir_dados_da_empresa(p_id uuid, p_nome text, p_cnpj text)
returns public.tenants language plpgsql security definer set search_path = public as $$
declare linha public.tenants;
begin
  if not public.sou_admin() then
    raise exception 'Só quem administra edita empresas.';
  end if;
  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'A empresa precisa de um nome.';
  end if;
  update public.tenants set nome = btrim(p_nome), cnpj = coalesce(btrim(p_cnpj), '')
   where id = p_id returning * into linha;
  if linha.id is null then raise exception 'Empresa não encontrada.'; end if;
  return linha;
end $$;

create or replace function public.definir_dados_do_perfil(p_id uuid, p_nome text, p_whatsapp text)
returns public.perfis language plpgsql security definer set search_path = public as $$
declare linha public.perfis;
begin
  if not public.sou_admin() then
    raise exception 'Só quem administra edita os dados de outra pessoa.';
  end if;
  update public.perfis
     set nome = coalesce(btrim(p_nome), ''), whatsapp = coalesce(btrim(p_whatsapp), '')
   where id = p_id returning * into linha;
  if linha.id is null then raise exception 'Pessoa não encontrada.'; end if;
  return linha;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'definir_bloqueio_do_perfil(uuid, boolean)',
    'definir_bloqueio_da_empresa(uuid, boolean)',
    'definir_dados_da_empresa(uuid, text, text)',
    'definir_dados_do_perfil(uuid, text, text)',
    'minha_situacao()']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
