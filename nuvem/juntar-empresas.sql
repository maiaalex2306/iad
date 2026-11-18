-- Juntar empresas duplicadas numa só.
--
-- O problema que ele resolve: "acP", "AcP", "Advanced Channel Partners" e
-- "AcP - Advanced Channel Partners" são a mesma empresa escrita de quatro
-- jeitos, e no banco são quatro cofres separados. Ninguém percebe até a
-- carteira "sumir" — ela está inteira, dentro de um dos quatro, e a pessoa
-- está olhando por outro.
--
-- O que ele faz: muda o dono de todas as linhas da empresa que sai para a que
-- fica, move as pessoas junto, e só então apaga a que sobrou vazia.
--
-- O que ele NÃO faz: não mistura conteúdo. Se as duas tiverem uma conta
-- chamada "Marilan", as duas continuam existindo depois, como duas contas da
-- mesma empresa. Juntar cadastro é decisão humana e fica para o app, na tela
-- de Cadastros.

-- ------------------------------------------------------------- 1. quem é quem
-- Rode primeiro. Empresas com o mesmo nome achatado, ou com o mesmo CNPJ, são
-- as candidatas — é exatamente a comparação que o app passou a fazer ao criar.
select t.id,
       t.nome,
       regexp_replace(lower(unaccent(coalesce(t.nome,''))), '[^a-z0-9]+', ' ', 'g') as nome_achatado,
       regexp_replace(coalesce(t.cnpj,''), '\D', '', 'g') as cnpj_limpo,
       t.criado_em,
       (select count(*) from public.perfis        p where p.tenant_id = t.id) as pessoas,
       (select count(*) from public.contas        c where c.tenant_id = t.id) as contas,
       (select count(*) from public.contatos      c where c.tenant_id = t.id) as contatos,
       (select count(*) from public.oportunidades o where o.tenant_id = t.id) as oportunidades,
       (select count(*) from public.tarefas       x where x.tenant_id = t.id) as tarefas
  from public.tenants t
 order by nome_achatado, t.criado_em;

-- Se `unaccent` não existir no projeto, use esta versão, sem acento tratado:
--
-- select t.id, t.nome,
--        regexp_replace(lower(coalesce(t.nome,'')), '[^a-z0-9]+', ' ', 'g') as nome_achatado,
--        regexp_replace(coalesce(t.cnpj,''), '\D', '', 'g') as cnpj_limpo
--   from public.tenants t order by 3;

-- ------------------------------------------------------------ 2. escolher
-- FICA:  a que tem a carteira, ou a de nome certo. É para onde tudo vai.
-- SAI:   a duplicada, que será esvaziada e apagada.
--
-- Escolha pela consulta acima e troque os dois ids abaixo. Uma dupla por vez:
-- juntar três numa tacada é o jeito de juntar a errada sem perceber.

-- ------------------------------------------------------------- 3. conferir
-- O que vai mudar de dono. Leia os nomes antes de executar o passo 4.
with fica as (select '00000000-0000-0000-0000-000000000000'::uuid as id),   -- <<< FICA
     sai  as (select '11111111-1111-1111-1111-111111111111'::uuid as id)    -- <<< SAI
select 'conta'        as tipo, nome   as o_que from public.contas        where tenant_id = (select id from sai)
union all
select 'contato',            nome            from public.contatos      where tenant_id = (select id from sai)
union all
select 'oportunidade',       titulo          from public.oportunidades where tenant_id = (select id from sai)
union all
select 'tarefa',             titulo          from public.tarefas       where tenant_id = (select id from sai)
union all
select 'pessoa',             p.id::text      from public.perfis p      where p.tenant_id = (select id from sai)
 limit 500;

-- --------------------------------------------------------------- 4. juntar
-- Descomente, troque os dois ids, rode. Tudo numa transação: ou vai inteiro,
-- ou não vai nada.
--
-- begin;
--
--   -- As nove tabelas de negócio mudam de dono.
--   update public.contas        set tenant_id = '00000000-...FICA' where tenant_id = '11111111-...SAI';
--   update public.contatos      set tenant_id = '00000000-...FICA' where tenant_id = '11111111-...SAI';
--   update public.oportunidades set tenant_id = '00000000-...FICA' where tenant_id = '11111111-...SAI';
--   update public.tarefas       set tenant_id = '00000000-...FICA' where tenant_id = '11111111-...SAI';
--   update public.produtos      set tenant_id = '00000000-...FICA' where tenant_id = '11111111-...SAI';
--
--   -- Segmentos e tipos de tarefa são catálogo: mover cria repetido, porque a
--   -- empresa que fica já tem os dela. Apaga em vez de mover.
--   delete from public.segmentos    where tenant_id = '11111111-...SAI';
--   delete from public.tipos_tarefa where tenant_id = '11111111-...SAI';
--
--   -- As mensagens do WhatsApp, se a tabela já existir no projeto.
--   -- update public.mensagens_whatsapp set tenant_id = '00000000-...FICA' where tenant_id = '11111111-...SAI';
--   -- update public.whatsapp_numeros   set tenant_id = '00000000-...FICA' where tenant_id = '11111111-...SAI';
--
--   -- As pessoas mudam de empresa. Sem isto elas ficariam órfãs quando a
--   -- empresa for apagada (`on delete set null`), e entrariam no app sem
--   -- enxergar carteira nenhuma — que é o sintoma mais confuso que existe aqui.
--   update public.perfis set tenant_id = '00000000-...FICA' where tenant_id = '11111111-...SAI';
--
--   -- Agora ela está vazia e pode sair.
--   delete from public.tenants where id = '11111111-...SAI';
--
-- commit;

-- ------------------------------------------------------- 5. conferir depois
-- Repita a consulta 1. A empresa que saiu não pode mais aparecer, e a que
-- ficou tem de estar com a soma das duas.

-- ============================================================================
-- Depois de juntar
-- ============================================================================
-- No aplicativo, cada pessoa precisa sair e entrar de novo uma vez. A empresa
-- dela mudou no servidor e a sessão no navegador ainda guarda a antiga.
--
-- E confira o endereço do webhook do Linked Helper de cada empresa: ele carrega
-- o identificador no parâmetro `e`, e o da empresa que saiu deixou de existir.
-- O botão "Webhook", em Cadastros, monta o endereço novo.
