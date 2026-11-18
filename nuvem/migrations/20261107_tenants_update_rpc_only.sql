-- IaD CRM v286.83 / SECURITY-TENANTS-01
-- Impede UPDATE direto de public.tenants por anon/authenticated.
-- Dados e schema preservados. Mantem SELECT e INSERT inalterados.
-- Administracao de empresa: RPC definir_dados_da_empresa/definir_bloqueio_da_empresa.
-- Configuracao da ponte LinkedHelper: RPC definir_ponte_da_empresa.
-- Essas RPCs sao SECURITY DEFINER e fazem checagem de papel/autorizacao.
-- Homologado no projeto iadcrm-homolog em 2026-11-07.
-- Aplicar em producao somente apos verificacao de paridade das funcoes RPC.
REVOKE UPDATE ON TABLE public.tenants FROM anon, authenticated;

-- Provas pos-migracao (somente leitura):
-- SELECT has_table_privilege('anon','public.tenants','UPDATE') AS anon_update,
--        has_table_privilege('authenticated','public.tenants','UPDATE') AS auth_update,
--        has_table_privilege('service_role','public.tenants','UPDATE') AS service_update,
--        has_function_privilege('authenticated',
--          'public.definir_ponte_da_empresa(uuid,text,text)','EXECUTE') AS ponte_rpc,
--        has_function_privilege('authenticated',
--          'public.definir_dados_da_empresa(uuid,text,text)','EXECUTE') AS dados_rpc;

-- Rollback EXCLUSIVAMENTE se houver regressao comprovada em API nao-RPC,
-- com aprovacao operacional e teste de autorizacao:
-- GRANT UPDATE ON TABLE public.tenants TO anon, authenticated;
-- ATENCAO: o rollback restaura a permissao excessiva original.
