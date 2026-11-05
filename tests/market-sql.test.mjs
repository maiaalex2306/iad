import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const baseline=readFileSync(new URL('../nuvem/sql/ri-m01-market-import-confirmed.sql',import.meta.url),'utf8');

test('RPC nao deve permitir CNPJ formado por 14 caracteres repetidos',()=>{
 assert.match(baseline,/v_cnpj\s*=\s*pg_catalog\.repeat\(pg_catalog\.left\(v_cnpj,1\),14\)/,
  'O banco precisa rejeitar CNPJ repetitivo, independentemente dos digitos verificadores');
});
test('RPC requer confirmacao explicita, tenant autorizado e recibo de idempotencia',()=>{
 assert.match(baseline,/p_confirmed IS DISTINCT FROM true/);
 assert.match(baseline,/v_tenant<>p_tenant/);
 assert.match(baseline,/market_import_receipts/);
 assert.match(baseline,/pg_advisory_xact_lock/);
});
