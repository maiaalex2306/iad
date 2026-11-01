-- PERF-11B: AUDITORIA ESTRITAMENTE SOMENTE LEITURA.
-- Não remove duplicados e não atribui fontes. Executável nos ambientes de produção/homologação.
WITH tipos AS (
 SELECT tenant_id,lower(btrim(nome)) AS chave,count(*) AS quantidade
 FROM public.tipos_tarefa GROUP BY tenant_id,lower(btrim(nome))
), fontes AS (
 SELECT tenant_id,lower(btrim(nome)) AS chave,count(*) AS quantidade
 FROM public.fontes GROUP BY tenant_id,lower(btrim(nome))
), referencia AS (
 SELECT
   count(*) AS oportunidades,
   count(*) FILTER (WHERE o.fonte_id = '') AS fontes_vazias,
   count(*) FILTER (WHERE nullif(btrim(o.fonte_id),'') IS NOT NULL AND f.id IS NULL) AS fontes_orfas_reais,
   count(*) FILTER (WHERE f.id IS NOT NULL AND f.tenant_id <> o.tenant_id) AS fontes_de_outro_tenant
 FROM public.oportunidades o LEFT JOIN public.fontes f ON f.id=o.fonte_id
)
SELECT (SELECT sum(quantidade) FROM tipos) AS tipos_total,
       (SELECT sum(quantidade-1) FROM tipos) AS tipos_duplicados,
       (SELECT sum(quantidade) FROM fontes) AS fontes_total,
       (SELECT sum(quantidade-1) FROM fontes) AS fontes_duplicadas,
       oportunidades, fontes_vazias, fontes_orfas_reais, fontes_de_outro_tenant
FROM referencia;
