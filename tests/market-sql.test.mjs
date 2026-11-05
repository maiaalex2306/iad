import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const baseline=readFileSync(new URL('../nuvem/sql/ri-m01-market-import-confirmed.sql',import.meta.url),'utf8');

test('RPC nao deve permitir CNPJ formado por 12 primeiros caracteres repetidos',()=>{
 assert.match(baseline,/pg_catalog\.left\(v_cnpj,12\)\s*=\s*pg_catalog\.repeat\(pg_catalog\.left\(v_cnpj,1\),12\)/,
  'O banco precisa rejeitar CNPJ repetitivo, independentemente dos digitos verificadores');
});
test('RPC requer confirmacao explicita, tenant autorizado e recibo de idempotencia',()=>{
 assert.match(baseline,/p_confirmed IS DISTINCT FROM true/);
 assert.match(baseline,/v_tenant<>p_tenant/);
 assert.match(baseline,/market_import_receipts/);
 assert.match(baseline,/pg_advisory_xact_lock/);
});

test('RPC de importacao nao expõe IDs de contas de outro vendedor',()=>{
 // A rotina SECURITY DEFINER consulta contas alem das politicas RLS.
 // O retorno de um duplicado deve testar a visibilidade antes de divulgar ID.
 assert.match(baseline,/SELECT c\.id,c\.dono_id INTO v_existing,v_existing_owner FROM public\.contas c/);
 assert.equal((baseline.match(/SELECT c\\.id,c\\.dono_id INTO v_existing,v_existing_owner FROM public\\.contas c/g)||[]).length,2,
  'Both exact and related account matches must protect owner privacy');
 assert.match(baseline,/v_papel IN \('gestor','admin'\) OR v_existing_owner IS NULL OR v_existing_owner=v_user/);
 assert.match(baseline,/RETURN pg_catalog\.jsonb_build_object\('status','review_duplicate'\);/);
});
