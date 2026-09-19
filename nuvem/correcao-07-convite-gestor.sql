-- Correção 7 — o convite não aceitava Gestor.
--
-- Rode no SQL Editor do Supabase, uma vez.
--
-- O que aconteceu: a tabela de convites nasceu na correção 3, quando só
-- existiam dois papéis. A correção 5 criou o terceiro — Gestor, que enxerga a
-- empresa inteira — e ampliou a regra em perfis, mas esqueceu de ampliar a
-- mesma regra aqui. Resultado: cadastrar alguém como Gestor falhava com
-- "new row for relation convites violates check constraint convites_papel_check",
-- e cadastrar como Usuário ou Administrador funcionava.
--
-- Erro meu na correção 5. As duas tabelas guardam o mesmo conceito e passaram
-- a discordar sobre o que é um papel válido.

alter table public.convites drop constraint if exists convites_papel_check;
alter table public.convites add constraint convites_papel_check
  check (papel in ('usuario', 'gestor', 'admin'));

-- Confere que as duas tabelas voltaram a concordar. Devolve as duas regras,
-- e as duas têm de listar os três papéis.
select conrelid::regclass as tabela, pg_get_constraintdef(oid) as regra
from pg_constraint
where conname in ('convites_papel_check', 'perfis_papel_check')
order by 1;

notify pgrst, 'reload schema';
