-- RI-M01: quota for manually initiated AI market research.
-- Apply to HOMOLOGATION first; do not apply to production before E2E gates.
-- No CRM account, contact, opportunity or CAS table is touched.
-- By design, each accepted research consumes one credit even if provider fails.
-- Daily limits are operational ceilings (3/user, 12/tenant), NOT an exact BRL budget.
CREATE SCHEMA IF NOT EXISTS iad_private;
REVOKE ALL ON SCHEMA iad_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS iad_private.market_search_daily (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  day_utc date NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 3),
  PRIMARY KEY(tenant_id, user_id, day_utc)
);
REVOKE ALL ON iad_private.market_search_daily FROM PUBLIC, anon, authenticated;
ALTER TABLE iad_private.market_search_daily ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.iad_market_search_reserve()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
 v_user uuid := auth.uid();
 v_tenant uuid;
 v_day date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
 v_used_user integer := 0;
 v_used_tenant integer := 0;
BEGIN
 IF v_user IS NULL THEN
  RETURN pg_catalog.jsonb_build_object('allowed',false,'scope','auth');
 END IF;
 SELECT p.tenant_id INTO v_tenant
 FROM public.perfis p
 WHERE p.id=v_user AND p.ativo IS TRUE AND p.papel IN ('vendedor','gestor','admin');
 -- Admin without tenant context must not pool research costs across companies.
 IF v_tenant IS NULL THEN
  RETURN pg_catalog.jsonb_build_object('allowed',false,'scope','tenant');
 END IF;

 -- Serializable per-tenant admission: all actors of a tenant share the same
 -- advisory transaction lock before reading and changing counters.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text, 314159));
 SELECT COALESCE(SUM(q.used),0) INTO v_used_tenant
 FROM iad_private.market_search_daily q
 WHERE q.tenant_id=v_tenant AND q.day_utc=v_day;
 SELECT COALESCE(MAX(q.used),0) INTO v_used_user
 FROM iad_private.market_search_daily q
 WHERE q.tenant_id=v_tenant AND q.user_id=v_user AND q.day_utc=v_day;
 IF v_used_user >= 3 THEN
  RETURN pg_catalog.jsonb_build_object('allowed',false,'scope','user','remaining',0);
 END IF;
 IF v_used_tenant >= 12 THEN
  RETURN pg_catalog.jsonb_build_object('allowed',false,'scope','tenant','remaining',0);
 END IF;

 INSERT INTO iad_private.market_search_daily(tenant_id,user_id,day_utc,used)
 VALUES(v_tenant,v_user,v_day,1)
 ON CONFLICT(tenant_id,user_id,day_utc) DO UPDATE
 SET used = iad_private.market_search_daily.used + 1;

 RETURN pg_catalog.jsonb_build_object('allowed',true,'scope','ok',
   'remaining_user',2-v_used_user,'remaining_tenant',11-v_used_tenant);
END;
$function$;
REVOKE ALL ON FUNCTION public.iad_market_search_reserve() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iad_market_search_reserve() TO authenticated;
