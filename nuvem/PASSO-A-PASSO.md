# Ligar o IAD CRM ao Supabase

Uma vez só, cerca de vinte minutos. Ao final, a equipe compartilha a mesma
carteira e o login passa a ser verificado no servidor — não mais no navegador.

## 1. Criar o projeto

1. Crie a conta em https://supabase.com (grátis, sem cartão).
2. **New project**. Dê um nome (`iad-crm`), escolha uma senha para o banco —
   guarde-a, embora o app não precise dela — e a região mais próxima
   (`South America (São Paulo)`).
3. Aguarde alguns minutos enquanto o projeto sobe.

## 2. Criar as tabelas

1. No menu lateral, **SQL Editor** → **New query**.
2. Cole o conteúdo inteiro de `nuvem/schema.sql` e clique em **Run**.
3. Deve terminar com "Success. No rows returned". Em **Table Editor** aparecem
   as tabelas `tenants`, `perfis`, `contas`, `contatos`, `oportunidades`,
   `tarefas`, `produtos`, `segmentos` e `tipos_tarefa`.

O que esse arquivo faz além de criar tabelas: liga o Row Level Security e
escreve as regras de quem vê o quê. É por isso que o isolamento entre empresas
passa a ser real — quem recusa devolver a carteira alheia é o banco, não o app.

## 3. Copiar os dois valores

Em **Project Settings** → **API**, copie:

- **Project URL** — algo como `https://xxxxxxxxxxxx.supabase.co`
- **anon public** (ou *publishable key*) — a chave pública

A chave pública pode ficar no app: ela só permite o que as políticas RLS
permitirem. A chave `service_role`, que aparece na mesma tela, **nunca** deve
ser colada em lugar nenhum do app — ela ignora todas as políticas.

## 4. Conectar o app

1. No IAD CRM: **⚙︎ Dados** → seção **Nuvem (Supabase)** → **Configurar**.
2. Cole a URL e a chave pública. Salve.
3. **Criar acesso na nuvem** com seu nome, e-mail e senha.
4. O Supabase manda um e-mail de confirmação — este é real, sai de verdade.
   Confirme e volte.
5. **Entrar na nuvem** com o mesmo e-mail e senha.
6. **Definir minha empresa** — o nome da sua empresa. É ela que separa a sua
   carteira das demais.
7. **Sincronizar agora**: envia o que existe neste aparelho e traz o que houver.

## 5. Colocar o time

Para cada vendedor: ele repete os passos 4.3 a 4.5 no aparelho dele. Depois,
para que caia na sua empresa em vez de criar outra, rode no **SQL Editor**:

```sql
-- veja os perfis e os ids
select p.id, u.email, p.nome, p.tenant_id from public.perfis p
  join auth.users u on u.id = p.id;

select id, nome from public.tenants;

-- ligue o vendedor à sua empresa
update public.perfis
   set tenant_id = 'COLE-O-ID-DA-EMPRESA'
 where id = 'COLE-O-ID-DO-USUARIO';
```

Para tornar alguém administrador — vê todas as empresas:

```sql
update public.perfis set papel = 'admin' where id = 'COLE-O-ID-DO-USUARIO';
```

## O que muda no dia a dia

O app continua funcionando offline com a última cópia baixada; a sincronização
é sob demanda, pelo botão. Isso é deliberado: o vendedor em área com sinal ruim
não fica travado.

## Limites do plano gratuito

500 MB de banco, 1 GB de arquivos, 50 mil usuários ativos por mês. O projeto
**pausa após sete dias sem nenhum acesso** — com o time usando, nunca acontece;
se acontecer, um clique no painel do Supabase reativa. Não há backup automático
no plano gratuito: continue exportando o JSON de vez em quando.
