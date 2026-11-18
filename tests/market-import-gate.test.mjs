import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../nuvem/sql/ri-m01-market-import-confirmed.sql',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/config.js',import.meta.url),'utf8');

test('controle de liberacao fica no servidor, sem acesso por anon e authenticated',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS iad_private\.market_import_release_gate/);
 assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
 assert.match(sql,/ALTER TABLE iad_private\.market_import_release_gate ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON iad_private\.market_import_release_gate FROM PUBLIC, anon, authenticated/);
});
test('verifica escopo tenant antes de consultar liberação',()=>{
 const check=sql.indexOf("v_tenant<>p_tenant");
 const gate=sql.indexOf('SELECT 1 FROM iad_private.market_import_release_gate');
 const firstWrite=sql.indexOf('INSERT INTO public.contas');
 assert.ok(check>0 && gate>check && firstWrite>gate, 'O gate deve preceder as escritas e suceder a checagem da identidade');
 assert.match(sql,/WHERE g\.tenant_id=v_tenant AND g\.enabled IS TRUE/);
 assert.match(sql,/RETURN pg_catalog\.jsonb_build_object\('status','import_disabled'\)/);
});
test('a importacao via RPC permanece inacessivel a anon, e depende de confirmacao humana',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.iad_market_import_confirmed\(jsonb,uuid,uuid,boolean\) FROM PUBLIC,anon/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.iad_market_import_confirmed\(jsonb,uuid,uuid,boolean\) TO authenticated/);
 assert.match(sql,/p_confirmed IS DISTINCT FROM true/);
 assert.match(ui,/window\.IAD_MARKET_IMPORT_ENABLED\s*=\s*false/);
});
test('replay e deduplicacao transacionais persistem no contrato',()=>{
 assert.match(sql,/PRIMARY KEY \(tenant_id,user_id,request_id\)/);
 assert.match(sql,/UNIQUE \(tenant_id,cnpj\)/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/v_replay\.cnpj<>v_cnpj/);
});
