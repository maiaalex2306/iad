-- IAD CRM — CONFERIR: o banco está em dia?
-- =====================================================================
--  ESTE ARQUIVO NÃO MUDA NADA. Só pergunta e responde.
--
--  Rode quando quiser saber se ficou faltando alguma coisa — depois de uma
--  correção, depois de uma versão nova do app, ou quando aparecer a faixa
--  "o banco está atrás do aplicativo". Ele lista TODA tabela, coluna e
--  função que o aplicativo usa, diz quais existem e, para as que faltam,
--  qual arquivo rodar.
--
--  COMO LER O RESULTADO
--    situacao = 'ok'     → está lá, nada a fazer.
--    situacao = 'FALTA'  → rode o arquivo indicado em `rode`.
--  As linhas que faltam vêm primeiro. Se a primeira linha disser 'ok',
--  está tudo em dia e não há mais nada a ler.
--
--  OS GRUPOS
--    1 carteira  → contas, contatos, negócios, tarefas, notas, sinais.
--                  É o que trava a sincronização quando falta.
--    2 acesso    → empresas, perfis, convites e as funções de permissão.
--    3 e-mail    → só importa se você usa a caixa de e-mail do app.
--    4 whatsapp  → só importa se você usa o WhatsApp do app.
--
--  COMO RODAR
--    Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- =====================================================================

/* A pergunta "isto existe?", escrita uma vez. Antes o mesmo CASE aparecia
   três vezes — na coluna da situação, na do arquivo e na ordenação —, e três
   cópias de uma regra é a receita para duas delas envelhecerem.

   `create or replace` numa função temporária não mexe em nada do banco: ela
   morre quando a sessão fecha. Este arquivo continua não alterando nada. */
create or replace function pg_temp.existe(p_tipo text, p_alvo text, p_coluna text)
returns boolean language sql stable as $$
  select case p_tipo
    when 'tabela' then exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = p_alvo)
    when 'coluna' then exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = p_alvo and column_name = p_coluna)
    else exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = p_alvo)
  end;
$$;

with esperado(grupo, tipo, alvo, coluna, arquivo) as (
  values
    ('3 e-mail', 'tabela', 'caixas_email', '', 'nuvem/correcao-18-emails.sql'),
    ('1 carteira', 'tabela', 'contas', '', 'nuvem/schema.sql'),
    ('1 carteira', 'tabela', 'contatos', '', 'nuvem/schema.sql'),
    ('2 acesso', 'tabela', 'convites', '', 'nuvem/correcao-03-convites.sql'),
    ('3 e-mail', 'tabela', 'emails', '', 'nuvem/correcao-18-emails.sql'),
    ('1 carteira', 'tabela', 'fontes', '', 'nuvem/schema.sql'),
    ('4 whatsapp', 'tabela', 'mensagens_whatsapp', '', 'nuvem/whatsapp.sql'),
    ('1 carteira', 'tabela', 'notas', '', 'nuvem/correcao-23-notas-rapidas.sql'),
    ('1 carteira', 'tabela', 'oportunidades', '', 'nuvem/schema.sql'),
    ('2 acesso', 'tabela', 'perfis', '', 'nuvem/schema.sql'),
    ('1 carteira', 'tabela', 'produtos', '', 'nuvem/schema.sql'),
    ('1 carteira', 'tabela', 'segmentos', '', 'nuvem/schema.sql'),
    ('3 e-mail', 'tabela', 'segredos_email', '', 'nuvem/correcao-21-senha-da-caixa.sql'),
    ('1 carteira', 'tabela', 'sinais', '', 'nuvem/correcao-17-sinais.sql'),
    ('1 carteira', 'tabela', 'tarefas', '', 'nuvem/schema.sql'),
    ('2 acesso', 'tabela', 'tenants', '', 'nuvem/schema.sql'),
    ('1 carteira', 'tabela', 'tipos_tarefa', '', 'nuvem/schema.sql'),
    ('4 whatsapp', 'tabela', 'whatsapp_numeros', '', 'nuvem/whatsapp.sql'),
    ('3 e-mail', 'coluna', 'caixas_email', 'envia', 'nuvem/correcao-20-caixa-que-envia.sql'),
    ('3 e-mail', 'coluna', 'caixas_email', 'marcas', 'nuvem/correcao-26-a-minha-resposta.sql'),
    ('3 e-mail', 'coluna', 'caixas_email', 'pastas', 'nuvem/correcao-19-analise-do-email.sql'),
    ('3 e-mail', 'coluna', 'caixas_email', 'senha_em', 'nuvem/correcao-21-senha-da-caixa.sql'),
    ('3 e-mail', 'coluna', 'caixas_email', 'ultimo_uid', 'nuvem/correcao-19-analise-do-email.sql'),
    ('1 carteira', 'coluna', 'contas', 'descricao', 'nuvem/correcao-11-conta-campos.sql'),
    ('1 carteira', 'coluna', 'contas', 'dono_id', 'nuvem/correcao-05-gestor.sql'),
    ('1 carteira', 'coluna', 'contas', 'linkedin', 'nuvem/correcao-11-conta-campos.sql'),
    ('1 carteira', 'coluna', 'contas', 'necessidades', 'nuvem/correcao-11-conta-campos.sql'),
    ('1 carteira', 'coluna', 'contas', 'pais', 'nuvem/correcao-11-conta-campos.sql'),
    ('1 carteira', 'coluna', 'contatos', 'dono_id', 'nuvem/correcao-05-gestor.sql'),
    ('1 carteira', 'coluna', 'contatos', 'email_pessoal', 'nuvem/correcao-13-contatos-dois-canais.sql'),
    ('1 carteira', 'coluna', 'contatos', 'telefone_comercial', 'nuvem/correcao-13-contatos-dois-canais.sql'),
    ('2 acesso', 'coluna', 'convites', 'nome', 'nuvem/correcao-08-nome-do-convite.sql'),
    ('3 e-mail', 'coluna', 'emails', 'analisada_em', 'nuvem/correcao-19-analise-do-email.sql'),
    ('3 e-mail', 'coluna', 'emails', 'analise', 'nuvem/correcao-19-analise-do-email.sql'),
    ('3 e-mail', 'coluna', 'emails', 'analise_erro', 'nuvem/correcao-19-analise-do-email.sql'),
    ('3 e-mail', 'coluna', 'emails', 'analise_tentativas', 'nuvem/correcao-19-analise-do-email.sql'),
    ('1 carteira', 'coluna', 'oportunidades', 'campanha', 'nuvem/correcao-06-origem.sql'),
    ('1 carteira', 'coluna', 'oportunidades', 'dono', 'nuvem/correcao-02-colunas.sql'),
    ('1 carteira', 'coluna', 'oportunidades', 'fonte_id', 'nuvem/correcao-14-fontes.sql'),
    ('1 carteira', 'coluna', 'oportunidades', 'historico_nutricao', 'nuvem/correcao-16-tudo-em-dia.sql'),
    ('1 carteira', 'coluna', 'oportunidades', 'itens', 'nuvem/correcao-16-tudo-em-dia.sql'),
    ('1 carteira', 'coluna', 'oportunidades', 'nutricao', 'nuvem/correcao-12-colunas-que-faltavam.sql'),
    ('1 carteira', 'coluna', 'oportunidades', 'orientacao', 'nuvem/correcao-16-tudo-em-dia.sql'),
    ('1 carteira', 'coluna', 'oportunidades', 'origem', 'nuvem/correcao-06-origem.sql'),
    ('1 carteira', 'coluna', 'oportunidades', 'prazo_contrato_meses', 'nuvem/correcao-15-itens-e-cobranca.sql'),
    ('1 carteira', 'coluna', 'oportunidades', 'sdr', 'nuvem/correcao-06-origem.sql'),
    ('1 carteira', 'coluna', 'oportunidades', 'sdr_email', 'nuvem/correcao-06-origem.sql'),
    ('1 carteira', 'coluna', 'oportunidades', 'valor_mensal', 'nuvem/correcao-15-itens-e-cobranca.sql'),
    ('1 carteira', 'coluna', 'produtos', 'tipo_cobranca', 'nuvem/correcao-15-itens-e-cobranca.sql'),
    ('1 carteira', 'coluna', 'segmentos', 'atualizado_em', 'nuvem/correcao-02-colunas.sql'),
    ('1 carteira', 'coluna', 'segmentos', 'oportunidades', 'nuvem/correcao-10-segmentos.sql'),
    ('1 carteira', 'coluna', 'segmentos', 'personas', 'nuvem/correcao-10-segmentos.sql'),
    ('1 carteira', 'coluna', 'segmentos', 'subsegmentos', 'nuvem/correcao-10-segmentos.sql'),
    ('1 carteira', 'coluna', 'tarefas', 'adiamentos', 'nuvem/correcao-12-colunas-que-faltavam.sql'),
    ('1 carteira', 'coluna', 'tarefas', 'com_relato', 'nuvem/correcao-12-colunas-que-faltavam.sql'),
    ('1 carteira', 'coluna', 'tarefas', 'descricao', 'nuvem/correcao-12-colunas-que-faltavam.sql'),
    ('1 carteira', 'coluna', 'tarefas', 'hora', 'nuvem/correcao-12-colunas-que-faltavam.sql'),
    ('1 carteira', 'coluna', 'tarefas', 'origem', 'nuvem/correcao-12-colunas-que-faltavam.sql'),
    ('1 carteira', 'coluna', 'tarefas', 'sem_registro', 'nuvem/correcao-12-colunas-que-faltavam.sql'),
    ('2 acesso', 'coluna', 'tenants', 'ponte_chave', 'nuvem/correcao-16-tudo-em-dia.sql'),
    ('2 acesso', 'coluna', 'tenants', 'ponte_url', 'nuvem/correcao-16-tudo-em-dia.sql'),
    ('1 carteira', 'coluna', 'tipos_tarefa', 'atualizado_em', 'nuvem/correcao-02-colunas.sql'),
    ('2 acesso', 'funcao', 'ao_criar_usuario', '', 'nuvem/schema.sql'),
    ('2 acesso', 'funcao', 'criar_minha_empresa', '', 'nuvem/schema.sql'),
    ('2 acesso', 'funcao', 'definir_bloqueio_da_empresa', '', 'nuvem/correcao-09-bloqueio.sql'),
    ('2 acesso', 'funcao', 'definir_bloqueio_do_perfil', '', 'nuvem/correcao-09-bloqueio.sql'),
    ('2 acesso', 'funcao', 'definir_dados_da_empresa', '', 'nuvem/correcao-09-bloqueio.sql'),
    ('2 acesso', 'funcao', 'definir_dados_do_perfil', '', 'nuvem/correcao-09-bloqueio.sql'),
    ('2 acesso', 'funcao', 'definir_empresa_do_perfil', '', 'nuvem/correcao-04-permissoes.sql'),
    ('2 acesso', 'funcao', 'definir_nome_do_perfil', '', 'nuvem/correcao-08-nome-do-convite.sql'),
    ('2 acesso', 'funcao', 'definir_papel_do_perfil', '', 'nuvem/correcao-04-permissoes.sql'),
    ('2 acesso', 'funcao', 'definir_ponte_da_empresa', '', 'nuvem/correcao-16-tudo-em-dia.sql'),
    ('2 acesso', 'funcao', 'meu_tenant', '', 'nuvem/schema.sql'),
    ('2 acesso', 'funcao', 'minha_situacao', '', 'nuvem/correcao-09-bloqueio.sql'),
    ('2 acesso', 'funcao', 'sou_admin', '', 'nuvem/schema.sql'),
    ('2 acesso', 'funcao', 'sou_gestor', '', 'nuvem/correcao-05-gestor.sql')
)
select
  e.grupo,
  case e.tipo
    when 'tabela' then 'tabela ' || e.alvo
    when 'coluna' then 'coluna ' || e.alvo || '.' || e.coluna
    else 'funcao ' || e.alvo || '()'
  end as item,
  case when pg_temp.existe(e.tipo, e.alvo, e.coluna) then 'ok' else 'FALTA' end as situacao,
  case when pg_temp.existe(e.tipo, e.alvo, e.coluna) then '—' else e.arquivo end as rode
from esperado e
/* O que falta vem primeiro, e por um campo explícito: ordenar pela palavra
   'ok'/'FALTA' depende da ordem alfabética do idioma do banco, e já veio
   invertido uma vez por causa disso. */
order by (case when pg_temp.existe(e.tipo, e.alvo, e.coluna) then 1 else 0 end),
         e.grupo, e.tipo, e.alvo, e.coluna;
