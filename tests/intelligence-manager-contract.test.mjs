import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const market=readFileSync(new URL('../nuvem/funcoes/market-search/index.ts',import.meta.url),'utf8');
const config=readFileSync(new URL('../src/config.js',import.meta.url),'utf8');
test('RI-M18: bandeiras das duas áreas ativas sem abrir importação automática',()=>{
 assert.match(config,/IAD_RI_ENABLED\s*=\s*true/);
 assert.match(config,/IAD_MARKET_ENABLED\s*=\s*true/);
 assert.match(config,/IAD_MARKET_IMPORT_ENABLED\s*=\s*false/);
});
test('RI-M18: navegação protege as duas áreas com a mesma regra de Gestor/Admin',()=>{
 assert.match(app,/const autorizado = A\.ehGestor\(\)/);
 assert.match(app,/r\.hash !== '#\/inteligencia' && r\.hash !== '#\/mercado' && r\.hash !== '#\/linkedin-leads'/);
 assert.match(app,/hash === '#\/inteligencia' \|\| hash === '#\/mercado' \|\| hash === '#\/linkedin-leads'\) && !A\.ehGestor\(\)/);
 assert.doesNotMatch(app,/acesso inicial exclusivo do administrador/i);
});
test('RI-M18: backend de produção já aceita Gestor e Admin, antes da reserva paga',()=>{
 const gate=market.indexOf("!['admin','gestor'].includes(profile.papel)");
 const reserve=market.indexOf('/rest/v1/rpc/iad_market_search_reserve');
 assert.ok(gate>0&&reserve>gate,'gate de papel no backend deve anteceder reserva');
 assert.match(market,/PILOT_ADMIN_OR_MANAGER_ONLY/);
});
