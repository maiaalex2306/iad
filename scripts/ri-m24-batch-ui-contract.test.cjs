'use strict';
const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const base=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(base,p),'utf8');
const ui=read('src/ri/market-view.mjs');
const edge=read('nuvem/funcoes/market-search/index.ts');
const css=read('assets/paleta-acp.css');
const sw=read('sw.js'),config=read('src/config.js');
test('RI-M24: cada família/cidade é paga somente por clique explícito',()=>{
 assert.match(ui,/nextBatchBtn\.addEventListener\('click'/);
 assert.match(ui,/batchIntent='continuar';form\.requestSubmit\(\)/);
 assert.match(ui,/Pesquisar próximo lote — consome cota/);
 assert.match(ui,/if\(researchBusy\)/);
 assert.match(ui,/researchBusy=true/);
 assert.match(ui,/batchSession\.next\+\+/);
 assert.match(ui,/confirmed\.municipioIBGE!==cell\.municipioIBGE/);
 assert.match(ui,/confirmed\.individuallySearched!==true/);
 assert.doesNotMatch(ui,/setInterval\([^)]*requestSubmit/);
});
test('RI-M24: frontend não gera requests fora da célula autorizada',()=>{
 assert.match(ui,/batch:\{municipioIBGE:cell\.municipioIBGE,familyIndex:cell\.familyIndex\}/);
 assert.match(edge,/discoveryBatchCell\(body\?\.batch,f,action\)/);
 assert.match(edge,/INVALID_DISCOVERY_BATCH/);
 assert.match(edge,/queryAI\('OpenAI',openai,searchFilters,target,action\)/);
 assert.match(edge,/queryAI\('Anthropic',claude,searchFilters,target,action\)/);
 assert.match(edge,/municipios:\[\],discoveryCell:discoveryBatch/);
 assert.match(edge,/iad_market_search_reserve/);
});
test('RI-M24: DOM de lotes é limitado e a contagem de cobertura não é inventada',()=>{
 assert.match(ui,/batchRenderLimit=120/);
 assert.match(ui,/ordered\.slice\(0,batchRenderLimit\)/);
 assert.match(ui,/Mostrar mais /);
 assert.match(ui,/Lotes concluídos:/);
 assert.match(ui,/não representa cobertura exaustiva/);
 assert.match(ui,/Ao sair desta tela os resultados acumulados não são salvos/);
 assert.match(css,/\.iad-market-batch-meter.*--acp-accent/s);
});
test('RI-M24: cache offline e versão publicada avançam atomicamente',()=>{
 assert.match(config,/numero: 'v286\.88'/);
 assert.match(sw,/const CACHE = 'iad-crm-v286\.88'/);
 assert.match(sw,/\.\/src\/ri\/market-batches\.mjs/);
});
