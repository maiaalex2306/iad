'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const edge=read('nuvem/funcoes/market-search/index.ts');
const css=read('assets/paleta-acp.css');
const progress=read('src/ri/market-progress.mjs');
const view=read('src/ri/market-view.mjs');
const from=edge.indexOf('const AUTOMOTIVE_DISCOVERY_FAMILIES='),to=edge.indexOf('async function queryAI(',from);
assert.ok(from>0&&to>from,'Must find pure prompt and researchLocation functions');
const funcs=vm.runInNewContext("function normalizedPlace(v){return String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toLowerCase()}\n"+edge.slice(from,to)+';({prompt,researchLocation,discoveryTaxonomy,discoveryInstructions})');
const f={uf:'SP',cidade:'',municipios:[{nome:'São José dos Campos',uf:'SP',codigoIBGE:'3549904'}],ddds:['12'],segmentos:['Automotivo e Mobilidade'],faixasFuncionarios:['101_200','201_500'],limit:20};
test('ambos os motores recebem localização do filtro brasileiro, não do usuário',()=>{
 const loc=funcs.researchLocation(f);
 assert.deepEqual(JSON.parse(JSON.stringify(loc)),{type:'approximate',country:'BR',region:'SP',city:'São José dos Campos'});
 assert.deepEqual(JSON.parse(JSON.stringify(funcs.researchLocation({...f,municipios:[...f.municipios,{nome:'Taubaté'}]}))),
  {type:'approximate',country:'BR',region:'SP'});
 assert.match(edge,/search_context_size:'medium',user_location:researchLocation\(f\)/);
 assert.match(edge,/max_uses:3,user_location:researchLocation\(f\)/);
});
test('prompt de descoberta busca mais empresas e fontes individuais sem fabricar CNPJ ou porte',()=>{
 const p=funcs.prompt(f);
 for(const fragment of ['MAPEAMENTO B2B','São José dos Campos','Automotivo e Mobilidade','CNPJ','"funcionarios":null',
   'fontes','JSON','3-4','diversidade','filial','web_search','sem importação automática']){
  assert.ok(p.toLowerCase().includes(fragment.toLowerCase()),'Missing requirement '+fragment);
 }
 assert.ok(p.includes('até 20 empresas')||p.includes('20 empresas'));
 const tiny=funcs.prompt({...f,limit:3});
 assert.ok(tiny.includes('até 3 empresas'));
});
test('orçamento de pesquisa é explícito, limitado e não altera quota/identidade',()=>{
 assert.match(edge,/max_tool_calls:3,max_output_tokens:6000,include:\['web_search_call.action.sources'\],store:false/);
 assert.match(edge,/max_tokens:6000/);
 assert.match(edge,/iad_market_search_reserve/);
 assert.match(edge,/function cnpjReal\(/);
 assert.match(edge,/r\.urls\.has\(f\.url\)/);
 assert.match(edge,/Promise\.allSettled\(jobs\.map/);
 assert.doesNotMatch(edge,/await\s+Promise\.all\(jobs\.map/);
});
test('animação usa tokens ACP, sem porcentagem falsa, com reduced motion',()=>{
 assert.match(css,/--acp-accent,#ff682c/);
 assert.match(css,/iad-market-progress-grow/);
 assert.match(css,/iad-market-progress-glint/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(progress,/aria-label','Pesquisa em andamento; percentual real indisponível/);
 assert.match(progress,/bar\.removeAttribute\?\.\('value'\)/);
 assert.match(progress,/track\.setAttribute\('data-state','done'\)/);
 assert.match(progress,/track\.hidden=true;track\.setAttribute\('data-state','error'\)/);
});
test('fila pendente visível não contamina shortlist nem autoriza importação',()=>{
 assert.match(view,/Prioridade de investigação — dados pendentes/);
 assert.match(view,/Fila exploratória para validação humana/);
 assert.match(view,/workflow\.candidates\.filter/);
 assert.match(view,/c\.cnpj\|\|/);
 assert.match(view,/buildMarketImportRequest/);
});
