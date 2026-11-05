-- RI-M01 production canary: apply AFTER the base quota and import migrations.
-- The web search Edge Function is restricted to the CRM admin role.
-- Import is intentionally unavailable to every browser account until
-- dual-provider authenticated research and browser/CAS E2E pass in production.
-- Never grant import access during research-only pilot.
REVOKE EXECUTE ON FUNCTION public.iad_market_import_confirmed(jsonb,uuid,uuid,boolean) FROM authenticated;
REVOKE ALL ON FUNCTION public.iad_market_import_confirmed(jsonb,uuid,uuid,boolean) FROM PUBLIC, anon;
