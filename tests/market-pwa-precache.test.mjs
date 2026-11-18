import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sw=readFileSync(resolve(repo,'sw.js'),'utf8');
const view=readFileSync(resolve(repo,'src/ri/market-view.mjs'),'utf8');
test('PWA offline pré-carrega todas as dependências estáticas da aba Mercado',()=>{
 const block=sw.match(/const ARQUIVOS\s*=\s*\[([\s\S]*?)\];/);
 assert.ok(block,'lista ARQUIVOS não encontrada');
 const cached=new Set([...block[1].matchAll(/['"]((?:\.\/)[^'"]+)['"]/g)].map(x=>x[1]));
 assert.ok(cached.has('./src/ri/market-view.mjs'));
 const deps=[...view.matchAll(/^import\s+.+?\s+from\s+['"]\.\/(.+?\.mjs)['"]/gm)].map(x=>'./src/ri/'+x[1]);
 assert.ok(deps.length>=8,'detectou todas as importações ESM necessárias');
 for(const p of deps){
  assert.ok(existsSync(resolve(repo,p)),p+' deve existir');
  assert.ok(cached.has(p),p+' deve estar no PWA offline');
 }
 assert.ok(cached.has('./src/ri/market-city-cache.mjs'));
 assert.equal([...cached].filter(x=>/market-city-cache\.mjs$/.test(x)).length,1,'cache apenas uma vez');
});
test('PWA continua restrito a recursos estáticos do shell',()=>{
 assert.ok(sw.includes('CAMINHOS_ESTATICOS'));
 assert.ok(sw.includes("if (e.request.method !== 'GET') return;"));
 assert.ok(sw.includes("if (url.origin !== self.location.origin) return;"));
 assert.ok(!/['"]\.\/rest\/v1\//.test(sw));
});
