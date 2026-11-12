-- IAD CRM — socorro: "Seu usuário ainda não tem empresa na nuvem"
-- ==================================================================
-- O QUE ESTA MENSAGEM SIGNIFICA
--
-- A sua linha em `public.perfis` está com `tenant_id` nulo. Sem ela, o app
-- não sabe em que empresa gravar, e por isso NÃO ENVIA nada — é de propósito:
-- subir sem carimbo de empresa deixaria a carteira invisível para todo mundo,
-- inclusive para você. O preço é que o que está na tela existe só no
-- navegador, e recarregar perde.
--
-- ANTES DE RODAR ISTO, faça uma cópia do que está na tela:
--   Configuração → Backup → "Baixar cópia". Leva dois segundos e é a rede
--   de segurança caso alguma coisa abaixo não seja o que você esperava.
--
-- E NÃO clique em "Definir minha empresa" no app antes de ler o item 3: nas
-- versões até a v208 esse botão só sabia CRIAR empresa nova, e criar uma
-- segunda empresa esconderia a carteira inteira que já está no servidor.
--
-- Rode no Supabase → SQL Editor → New query. Ali quem executa é o dono do
-- banco, que passa por cima de todas as políticas — é a porta dos fundos.
--
-- Troque o e-mail nas três ocorrências abaixo se for outra pessoa.

-- ------------------------------------------------------------------
-- 1. O RETRATO. Rode SÓ ISTO primeiro e leia antes de mexer em nada.
--
-- Se `empresa` vier em branco e `carteira_desta_empresa` vier 0, a pergunta
-- vira "a qual empresa este usuário pertencia?" — e o item 2 responde.
-- ------------------------------------------------------------------
select u.email,
       p.nome,
       p.papel,
       p.ativo                              as pessoa_liberada,
       p.tenant_id,
       t.nome                               as empresa,
       (select count(*) from public.oportunidades o
         where o.tenant_id = p.tenant_id)   as carteira_desta_empresa
  from public.perfis p
  join auth.users u on u.id = p.id
  left join public.tenants t on t.id = p.tenant_id
 where lower(u.email) = lower('alexandre.maia@biosolvit.com');

-- ------------------------------------------------------------------
-- 2. ONDE ESTÁ A CARTEIRA. Quais empresas existem e quanto cada uma tem.
--
-- A linha com mais negociações e contas é quase sempre a sua. Copie o `id`
-- dela — é o que entra no item 3.
--
-- `donos` diz quantas pessoas já apontam para cada empresa: a que tem donos
-- e carteira é a viva; a que tem zero dos dois costuma ser sobra de um teste.
-- ------------------------------------------------------------------
select t.id,
       t.nome,
       t.ativo,
       (select count(*) from public.perfis        p where p.tenant_id = t.id) as donos,
       (select count(*) from public.contas        c where c.tenant_id = t.id) as contas,
       (select count(*) from public.oportunidades o where o.tenant_id = t.id) as negociacoes,
       (select count(*) from public.tarefas       x where x.tenant_id = t.id) as tarefas
  from public.tenants t
 order by negociacoes desc, contas desc, t.nome;

-- ------------------------------------------------------------------
-- 3. A RELIGAÇÃO. Descomente UMA das duas opções abaixo.
--
-- Opção A — você reconheceu a empresa no item 2 (o caso normal).
--   Cole o id dela no lugar do texto entre aspas. É um UUID, com hífens.
-- ------------------------------------------------------------------
-- update public.perfis
--    set tenant_id = 'COLE-AQUI-O-ID-DA-EMPRESA'::uuid
--  where id in (select id from auth.users
--                where lower(email) = lower('alexandre.maia@biosolvit.com'));

-- ------------------------------------------------------------------
-- Opção B — a empresa com carteira é uma só, e você quer que o banco escolha
--   por você. Faz exatamente o que a opção A faria, sem digitar o id: pega a
--   empresa com mais negociações.
--
--   Só use se o item 2 mostrou UMA empresa claramente maior que as outras.
--   Com duas parecidas, escolher pela contagem é adivinhar — e adivinhar aqui
--   põe a sua carteira dentro da empresa de outra pessoa.
-- ------------------------------------------------------------------
-- update public.perfis
--    set tenant_id = (select t.id from public.tenants t
--                      order by (select count(*) from public.oportunidades o
--                                 where o.tenant_id = t.id) desc
--                      limit 1)
--  where id in (select id from auth.users
--                where lower(email) = lower('alexandre.maia@biosolvit.com'));

-- ------------------------------------------------------------------
-- 4. CONFERÊNCIA. Rode o item 1 de novo: `empresa` tem que vir preenchida e
--    `carteira_desta_empresa` tem que bater com o item 2.
--
-- Depois, no app: recarregue a página (agora pode — o perfil está religado e
-- a próxima gravação sobe), e em Configuração → Nuvem clique em
-- "Sincronizar agora".
--
-- Se o que estava na tela era trabalho que ainda não subiu, NÃO recarregue
-- antes: clique primeiro em "Tentar salvar de novo" na faixa laranja. Com o
-- perfil religado, o envio passa.
-- ------------------------------------------------------------------
