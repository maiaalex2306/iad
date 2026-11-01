-- PERF-11K: massa 100% sintética somente para iadcrm-homolog.
-- NÃO rodar em produção. Não altera usuários Auth, permissões nem dados existentes.
-- Executar uma única vez em homologação; falha se qualquer marcador já existir.
-- Para desfazer use nuvem/perf-11k-rollback-homolog.sql e confira contagens.
BEGIN;
SET LOCAL statement_timeout='60000ms';
DO $fixture$
DECLARE
  v_tenant uuid;
  v_ops integer;
  v_contas integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE nome='PERF11K_SINTETICO_PERFORMANCE')
    OR EXISTS (SELECT 1 FROM public.contas WHERE id LIKE '__perf11k_acc_%')
    OR EXISTS (SELECT 1 FROM public.oportunidades WHERE id LIKE '__perf11k_op_%')
  THEN
    RAISE EXCEPTION 'Fixture PERF11K já existe; interrompido para não duplicar registros.';
  END IF;

  INSERT INTO public.tenants(nome,cnpj,ativo)
  VALUES ('PERF11K_SINTETICO_PERFORMANCE','',true)
  RETURNING id INTO v_tenant;

  INSERT INTO public.contas(id,tenant_id,dono_id,nome,segmento,cidade,uf,descricao)
  SELECT '__perf11k_acc_'||lpad(i::text,4,'0'),
         v_tenant,NULL,
         'TESTE PERF11K - Conta artificial '||i,
         'Cenario sintetico','Municipio ficticio','SP','APENAS HOMOLOGACAO, SEM CLIENTE REAL'
  FROM generate_series(1,141) AS i;

  INSERT INTO public.oportunidades
    (id,tenant_id,dono_id,conta_id,titulo,etapa,valor,eventos,snapshots,stakeholders)
  SELECT '__perf11k_op_'||lpad(i::text,4,'0'),
    v_tenant,NULL,
    '__perf11k_acc_'||lpad((((i-1)%141)+1)::text,4,'0'),
    CASE WHEN i=1 THEN 'PERF11K - Negocio complexo sintetico A'
         WHEN i=2 THEN 'PERF11K - Negocio complexo sintetico B'
         ELSE 'PERF11K - Negocio sintetico '||i END,
    'Diagnóstico', 10000+i*100,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'id','syn-ev-'||i||'-'||j,
       'tipo','decision','data','2026-10-15',
       'dimensao',CASE (j%8)
          WHEN 0 THEN 'problema' WHEN 1 THEN 'prioridade' WHEN 2 THEN 'impacto'
          WHEN 3 THEN 'stakeholders' WHEN 4 THEN 'criterios' WHEN 5 THEN 'processo'
          WHEN 6 THEN 'consenso' ELSE 'risco' END,
       'titulo','Evidencia artificial PERF11K '||j,
       'canal','reuniao','forca','confirmado') ORDER BY j),'[]'::jsonb)
     FROM generate_series(1,CASE WHEN i=1 THEN 141 WHEN i=2 THEN 120 ELSE 10 END) AS j),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'data','2026-10-15','iad',12,'dims','{}'::jsonb) ORDER BY j),'[]'::jsonb)
     FROM generate_series(1,CASE WHEN i=1 THEN 18 WHEN i=2 THEN 20 ELSE 0 END) AS j),
    '[]'::jsonb
  FROM generate_series(1,146) AS i;

  SELECT count(*) INTO v_contas FROM public.contas WHERE tenant_id=v_tenant;
  SELECT count(*) INTO v_ops FROM public.oportunidades WHERE tenant_id=v_tenant;
  IF v_contas<>141 OR v_ops<>146 THEN
    RAISE EXCEPTION 'Fixture incompleta: contas %, oportunidades %',v_contas,v_ops;
  END IF;
END;
$fixture$;
COMMIT;
