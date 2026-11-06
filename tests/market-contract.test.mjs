import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCnpj, normalizeMarketFilters, matchCrmAccount, normalizeMarketCompanies, proposePipelineAction, buildMarketImportRequest, isReviewableSourceURL, UF_IBGE, MARKET_DDDS, MARKET_BANDS} from '../src/ri/market-contract.mjs';
const tenantId='tenant-a',existing={id:'a1',tenantId,cnpj:'11.222.333/0001-81',nome:'Acme Indústria',razaoSocial:'Acme Indústria',site:'https://acme.example'};
test('CNPJ numerico e alfanumerico validos; DV incorreto rejeitado',()=>{
 assert.equal(normalizeCnpj('11.222.333/0001-81'),'11222333000181');
 const seed='12ABC34501DE',dv=(s,w)=>{const m=[...s].reduce((a,c,i)=>a+(c.charCodeAt(0)-48)*w[i],0)%11;return m<2?0:11-m};
 const d1=dv(seed,[5,4,3,2,9,8,7,6,5,4,3,2]),cnpj=seed+d1+dv(seed+d1,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
 assert.equal(normalizeCnpj(cnpj),cnpj);assert.equal(normalizeCnpj(cnpj.slice(0,-1)+(cnpj.endsWith('0')?'1':'0')),'');
});
test('BUSCAR exige geografia, segmento e limites financeiros coerentes',()=>{
 assert.equal(normalizeMarketFilters({ddd:'012',segmento:'Químico',funcionariosMin:200}).ddd,'12');
 assert.throws(()=>normalizeMarketFilters({uf:'SP'}),/segmento/i);
 assert.throws(()=>normalizeMarketFilters({segmento:'Químico'}),/geografia/i);
 assert.throws(()=>normalizeMarketFilters({uf:'SP',segmento:'Químico',funcionariosMin:800,funcionariosMax:200}),/funcionarios/i);
 assert.throws(()=>normalizeMarketFilters({uf:'SP',segmento:'Químico',limit:10000}),/Limite/i);
});
test('tenant correto: CNPJ igual reconhecido e CNPJ fora do tenant invisivel',()=>{
 assert.equal(matchCrmAccount({cnpj:existing.cnpj},[existing],tenantId).status,'existing');
 assert.equal(matchCrmAccount({cnpj:existing.cnpj},[{...existing,tenantId:'outro'}],tenantId).status,'new');
});
test('filial da mesma raiz nao e tratada como conta identica',()=>{
 const m=matchCrmAccount({cnpj:'11222333000262'},[existing],tenantId);
 assert.equal(m.status,'related');assert.equal(m.accountId,'a1');
});
test('coincidencia de nome ou dominio exige revisao',()=>{
 assert.equal(matchCrmAccount({razaoSocial:'Acme Indústria'},[existing],tenantId).status,'review');
 assert.equal(matchCrmAccount({site:'https://acme.example'},[existing],tenantId).status,'review');
});
test('empresa retornada sem CNPJ valido nao e inventada ou incluida',()=>{
 const v=normalizeMarketCompanies([{cnpj:'11222333000181',razaoSocial:'Acme Indústria',contatos:[{nome:'Ana',cargo:'Diretora'}]},{cnpj:'invalid',razaoSocial:'Inexistente'}],{source:'fonte-test',retrievedAt:'2026-11-04'});
 assert.equal(v.length,1);assert.equal(v[0].source,'fonte-test');assert.equal(v[0].contatos[0].email,'');assert.equal(v[0].funcionariosStatus,'nao_confirmado');
});
test('plano nunca grava no CRM e aponta oportunidades existentes',()=>{
 const snapshot={contas:[existing],oportunidades:[{id:'opp1',tenantId,contaId:'a1',etapa:'Prospecção'}]},before=JSON.stringify(snapshot);
 const result=proposePipelineAction({cnpj:existing.cnpj},snapshot,{tenantId,userId:'u1'});
 assert.equal(result.operation,'review_existing');assert.equal(result.existingOpportunityId,'opp1');assert.equal(result.writePerformed,false);assert.equal(JSON.stringify(snapshot),before);
 assert.throws(()=>proposePipelineAction({},snapshot,{tenantId:'',userId:'u1'}),/escopo/i);
});
test('fontes de pesquisa web verificadas sao preservadas no dossie',()=>{
 const source='https://example.org/empresa-a';
 const v=normalizeMarketCompanies([{cnpj:'11222333000181',nome:'Empresa A',fontes:[{url:source,titulo:'Empresa A verificada'}],providers:['OpenAI','Anthropic']}],{source:'IA Web',retrievedAt:'2026-11-04'});
 assert.equal(v.length,1);assert.equal(v[0].fontes[0].url,source);
 assert.deepEqual(v[0].providers,['OpenAI','Anthropic']);
});

test('normalizacao preserva divergencias de dados das IAs para revisao comercial',()=>{
 const v=normalizeMarketCompanies([{cnpj:'11222333000181',cidade:'Jacarei',
  conflitos:[{campo:'cidade',valorOriginal:'Jacarei',valorDivergente:'Campinas',provedor:'Anthropic'}],
  territorioCorroborado:false}],{source:'IA Web'});
 assert.equal(v.length,1);
 assert.equal(v[0].territorioCorroborado,false);
 assert.equal(v[0].conflitos.length,1);
 assert.equal(v[0].conflitos[0].valorDivergente,'Campinas');
});

test('importacao exige revisao, cnpj novo, fonte e ausencia de conflitos',()=>{
 const scope={tenantId,userId:'u1'},rid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const company={cnpj:'11222333000181',nome:'Empresa A',cidade:'Jacarei',uf:'SP',segmento:'Quimico',
  fontes:[{url:'https://example.org/empresa-a'}],conflitos:[]};
 const request=buildMarketImportRequest(company,{contas:[],oportunidades:[]},scope,rid);
 assert.equal(request.p_tenant,tenantId);
 assert.equal(request.p_request_id,rid);
 assert.equal(request.p_confirmed,true);
 assert.equal(request.p_empresa.cnpj,company.cnpj);
 assert.equal(request.p_empresa.fontes[0].url,company.fontes[0].url);
 assert.throws(()=>buildMarketImportRequest({...company,conflitos:[{campo:'cidade'}]}, {contas:[]},scope,rid),/diverg|revis/i);
 assert.throws(()=>buildMarketImportRequest({...company,fontes:[]}, {contas:[]},scope,rid),/fonte/i);
 assert.throws(()=>buildMarketImportRequest(company,{contas:[existing]},scope,rid),/cadastrad|exist/i);
 assert.throws(()=>buildMarketImportRequest(company,{contas:[]},scope,'bad'),/identificador/i);
});

test('pos-importacao confirma sincronizacao local apenas depois de puxar seguro',async()=>{
 const {refreshMarketPipelineAfterImport}=await import('../src/ri/market-view.mjs');
 const calls=[];
 const nuvem={diagnosticoPendenciasCAS:()=>({disponivel:true,quantidade:0}),haMudancas:()=>false,puxar:async()=>{calls.push('puxar');}};
 const result=await refreshMarketPipelineAfterImport({nuvem,importedCount:1,valid:()=>true});
 assert.equal(result.status,'synced');
 assert.deepEqual(calls,['puxar']);
});
test('pos-importacao nao baixa carteira com CAS pendente ou diagnostico indisponivel',async()=>{
 const {refreshMarketPipelineAfterImport}=await import('../src/ri/market-view.mjs');
 let called=0;
 for(const pending of [{disponivel:true,quantidade:1},{disponivel:false,quantidade:null}]){
  const nuvem={diagnosticoPendenciasCAS:()=>pending,haMudancas:()=>false,puxar:async()=>{called++}};
  const state=await refreshMarketPipelineAfterImport({nuvem,importedCount:1,valid:()=>true});
  assert.equal(state.status,'pending');
 }
 assert.equal(called,0,'Nunca sobrescrever estado local com CAS nao reconciliado');
});
test('falha de download nao desfaz importacao confirmada no servidor',async()=>{
 const {refreshMarketPipelineAfterImport}=await import('../src/ri/market-view.mjs');
 const nuvem={diagnosticoPendenciasCAS:()=>({disponivel:true,quantidade:0}),haMudancas:()=>false,puxar:async()=>{throw Error('rede fora')}};
 const state=await refreshMarketPipelineAfterImport({nuvem,importedCount:1,valid:()=>true});
 assert.equal(state.status,'pending');
 assert.equal(state.serverCommitted,true);
});

test('retorno de puxar sem conta/oportunidade importadas nao e sincronizacao comprovada',async()=>{
 const {refreshMarketPipelineAfterImport}=await import('../src/ri/market-view.mjs');
 const nuvem={diagnosticoPendenciasCAS:()=>({disponivel:true,quantidade:0}),haMudancas:()=>false,puxar:async()=>{}};
 const result=await refreshMarketPipelineAfterImport({nuvem,importedCount:1,valid:()=>true,
  tenantId:'tenant-a',importedIds:[{accountId:'ri-a',opportunityId:'ri-b'}],
  getSnapshot:()=>({contas:[],oportunidades:[]})});
 assert.equal(result.status,'pending');
 assert.equal(result.serverCommitted,true);
});
test('sync so e confirmada com IDs de conta e oportunidade visiveis no Store correto',async()=>{
 const {refreshMarketPipelineAfterImport}=await import('../src/ri/market-view.mjs');
 const nuvem={diagnosticoPendenciasCAS:()=>({disponivel:true,quantidade:0}),haMudancas:()=>false,puxar:async()=>{}};
 const importedIds=[{accountId:'ri-a',opportunityId:'ri-b'}];
 const args={nuvem,importedCount:1,valid:()=>true,tenantId:'tenant-a',importedIds,
 getSnapshot:()=>({contas:[{id:'ri-a',tenantId:'tenant-a'}],
 oportunidades:[{id:'ri-b',contaId:'ri-a',tenantId:'tenant-a'}]})};
 assert.equal((await refreshMarketPipelineAfterImport(args)).status,'synced');
 assert.equal((await refreshMarketPipelineAfterImport({...args,getSnapshot:()=>({
  contas:[{id:'ri-a',tenantId:'outro'}],oportunidades:[{id:'ri-b',contaId:'ri-a',tenantId:'outro'}]})})).status,'pending');
});

test('pesquisa preserva empresa sem CNPJ como pendente sem permitir importacao',()=>{
 const raw={nome:'Empresa de Pesquisa',razaoSocial:'Empresa de Pesquisa Ltda',cidade:'Mogi das Cruzes',uf:'SP',segmento:'Quimico',cnpj:null,fontes:[{url:'https://example.org/candidata',titulo:'Fonte publicada'}]};
 const rows=normalizeMarketCompanies([raw],{source:'IA Web'});
 assert.equal(rows.length,1);
 assert.equal(rows[0].identidadeStatus,'pendente_cnpj');
 assert.equal(rows[0].cnpj,'');
 assert.equal(rows[0].fontes.length,1);
 const plan=proposePipelineAction(rows[0],{contas:[],oportunidades:[]},{tenantId,userId:'u1'});
 assert.equal(plan.operation,'review_existing');
 assert.throws(()=>buildMarketImportRequest(rows[0],{contas:[],oportunidades:[]},{tenantId,userId:'u1'},'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),/revisao|CNPJ|cadastrada/i);
});
test('identidade pendente requer fonte e nome e nunca transforma CNPJ invalido em pendencia',()=>{
 const items=[
  {cnpj:null,nome:'Com Evidencia',fontes:[{url:'https://example.org/fonte'}]},
  {cnpj:null,nome:'Sem Evidencia',fontes:[]},
  {cnpj:null,fontes:[{url:'https://example.org/fonte'}]},
  {cnpj:'123invalid',nome:'Documento Invalido',fontes:[{url:'https://example.org/fonte'}]}
 ];
 const found=normalizeMarketCompanies(items,{source:'IA Web'});
 assert.equal(found.length,1);
 assert.equal(found[0].nome,'Com Evidencia');
});

test('contrato JSON multisselecao usa UF SP, Mogi IBGE, DDD 11, quimica e 2 faixas',()=>{
 const input={uf:'SP',municipios:[{codigoIBGE:'3530607',nome:'Mogi das Cruzes',uf:'SP'}],
  ddds:['11'],segmentos:['Química e Petroquímica'],faixasFuncionarios:['201_500','501_1000']};
 const f=normalizeMarketFilters(input);
 assert.equal(f.uf,'SP');
 assert.deepEqual(f.municipios,input.municipios);
 assert.deepEqual(f.ddds,['11']);
 assert.deepEqual(f.segmentos,['Química e Petroquímica']);
 assert.deepEqual(f.faixasFuncionarios,['201_500','501_1000']);
 assert.equal(f.funcionariosMin,null);
 assert.equal(f.funcionariosMax,null);
});
test('27 UFs, faixas sem lacunas e DDDs validos no contrato',()=>{
 assert.equal(Object.keys(UF_IBGE).length,27);
 assert.ok(MARKET_DDDS.includes('11'));
 assert.equal(MARKET_BANDS.length,8);
 let next=0;
 for(const band of MARKET_BANDS){
  assert.equal(band.min,next);
  next=band.max===null?null:band.max+1;
 }
 assert.equal(next,null);
});
test('deduplicacao dos filtros e rejeicao de codigo IBGE/DDD invalidos',()=>{
 const base={uf:'SP',municipios:[{codigoIBGE:'3530607',nome:'Mogi das Cruzes',uf:'SP'}],
  ddds:['11','11'],segmentos:['Química e Petroquímica','Química e Petroquímica'],faixasFuncionarios:['201_500','201_500']};
 const v=normalizeMarketFilters(base);
 assert.deepEqual(v.ddds,['11']);
 assert.deepEqual(v.segmentos,['Química e Petroquímica']);
 assert.deepEqual(v.faixasFuncionarios,['201_500']);
 assert.throws(()=>normalizeMarketFilters({...base,ddds:['00']}),/DDD/i);
 assert.throws(()=>normalizeMarketFilters({...base,municipios:[{...base.municipios[0],codigoIBGE:'3304557'}]}),/Municipios/i);
 assert.throws(()=>normalizeMarketFilters({...base,faixasFuncionarios:['invalid']}),/Faixas/i);
 assert.throws(()=>normalizeMarketFilters({...base,funcionariosMin:200}),/faixas ou limites/i);
});
test('resultado preserva qualificacao pendente das faixas de funcionarios sem confirmar porte',()=>{
 const c=normalizeMarketCompanies([{cnpj:null,nome:'Empresa exemplo',cidade:'Mogi das Cruzes',uf:'SP',
  funcionarios:null,faixaFuncionariosStatus:'pendente',fontes:[{url:'https://example.org/empresa'}]}]);
 assert.equal(c.length,1);
 assert.equal(c[0].faixaFuncionariosStatus,'pendente');
 assert.equal(c[0].funcionariosStatus,'nao_confirmado');
});
test('interface de Mercado nao usa lista global de segmentos nem executa pesquisa no boot',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../src/ri/market-view.mjs',import.meta.url),'utf8');
 assert.match(source,/snapshot\.segmentos/);
 assert.match(source,/x\.tenantId===scope\.tenantId/);
 assert.match(source,/servicodados\.ibge\.gov\.br\/api\/v1\/localidades\/estados/);
 assert.match(source,/faixasFuncionarios:bandPick\.get\(\)/);
 assert.match(source,/Aplicar exemplo/);
 assert.match(source,/IAD_MARKET_IMPORT_ENABLED!==true/);
});

class MarketTestNode{
 constructor(tag){this.tagName=tag;this.textContent='';this.children=[];this.style={};this.listeners=new Map();this.isConnected=true;this.value='';this.classList={add(){},remove(){},toggle(){}};}
 append(...nodes){nodes.forEach(node=>{this.children.push(node);node.parent=this;});}
 appendChild(node){this.append(node);return node;}
 prepend(node){this.children.unshift(node);node.parent=this;}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 addEventListener(event,fn){const a=this.listeners.get(event)||[];a.push(fn);this.listeners.set(event,a);}
 setAttribute(name,value){this[name]=value;}
 async fire(event,data={}){for(const fn of this.listeners.get(event)||[])await fn({preventDefault(){},...data});}
}
function fakeMarketDOM(){
 const doc={createElement:t=>new MarketTestNode(t),createTextNode:text=>{const n=new MarketTestNode('#text');n.textContent=text;return n;},addEventListener(){},removeEventListener(){}};
 const root=new MarketTestNode('root');root.ownerDocument=doc;
 const walk=(node,pred)=>{if(pred(node))return node;for(const child of node.children){const match=walk(child,pred);if(match)return match;}return null;};
 return {root,walk};
}
async function waitForMarketReady(root,walk){
 for(let i=0;i<25;i++){
  const btn=walk(root,n=>n.tagName==='button'&&n.textContent==='Buscar empresas');
  if(btn&&!btn.disabled)return;
  await new Promise(resolve=>setImmediate(resolve));
 }
 throw Error('Catálogo de Mercado não ficou pronto no mock autenticado');
}

test('DOM: botao de exemplo gera pesquisa JSON autenticada sem importar, respeitando tenant e IBGE',async()=>{
 const {mountMarketDiscovery}=await import('../src/ri/market-view.mjs');
 const {root,walk}=fakeMarketDOM(),originalFetch=globalThis.fetch,requests=[];
 const scope={tenantId:'tenant-a',userId:'u1',token:'scope-a'};
 const snapshot={contas:[],oportunidades:[],segmentos:[
  {tenantId:'tenant-a',ativo:true,nome:'Química e Petroquímica'},
  {tenantId:'tenant-b',ativo:true,nome:'Segmento privado de outro tenant'}
 ]};
 globalThis.fetch=async(url,options={})=>{
  if(String(url).includes('/rest/v1/perfis?'))return new Response(JSON.stringify([{tenant_id:'tenant-a',papel:'gestor',ativo:true}]),{status:200});
  if(String(url).includes('/rest/v1/segmentos?'))return new Response(JSON.stringify([{nome:'Química e Petroquímica',ativo:true}]),{status:200});
  requests.push({url:String(url),options});
  if(String(url).includes('servicodados.ibge.gov.br'))
   return new Response(JSON.stringify([{id:3530607,nome:'Mogi das Cruzes'},{id:3509502,nome:'Campinas'}]),{status:200});
  if(String(url).includes('/functions/v1/market-search'))
   return new Response(JSON.stringify({data:[],source:'Teste DOM',retrievedAt:'2026-11-05',usage:[]}),{status:200});
  throw Error('URL imprevista: '+url);
 };
 try{
  const cleanup=mountMarketDiscovery({root,snapshot,scope,getScopeToken:()=>scope.token,
   nuvem:{sessao:()=>({access_token:'jwt-test'}),config:()=>({url:'https://safe.supabase.co',chave:'public-test'})}});
  await waitForMarketReady(root,walk);
  const demo=walk(root,n=>n.tagName==='button'&&n.textContent.includes('Aplicar exemplo'));
  assert.ok(demo,'demo missing');await demo.fire('click');
  assert.equal(walk(root,n=>n.textContent==='Segmento privado de outro tenant'),null,'out-of-tenant segment leaked');
  const form=walk(root,n=>n.tagName==='form');assert.ok(form);
  await form.fire('submit');
  const post=requests.find(x=>x.url.includes('/functions/v1/market-search'));assert.ok(post);
  const body=JSON.parse(post.options.body);
  assert.equal(body.action,'search');assert.equal(body.provider,'both');
  assert.equal(body.filters.uf,'SP');
  assert.deepEqual(body.filters.municipios,[{codigoIBGE:'3530607',nome:'Mogi das Cruzes',uf:'SP'}]);
  assert.deepEqual(body.filters.ddds,['11']);
  assert.deepEqual(body.filters.segmentos,['Química e Petroquímica']);
  assert.deepEqual(body.filters.faixasFuncionarios,['201_500','501_1000']);
  assert.ok(!requests.some(x=>x.url.includes('iad_market_import_confirmed')),'import was called');
  cleanup();
 }finally{globalThis.fetch=originalFetch;}
});

test('PERF-36G: reabrir Mercado no mesmo documento não repete GET de municípios do IBGE',async()=>{
 const {mountMarketDiscovery}=await import('../src/ri/market-view.mjs');
 const {root,walk}=fakeMarketDOM(),oldFetch=globalThis.fetch;
 const scope={tenantId:'tenant-a',userId:'u1',token:'scope-a'};
 const snapshot={contas:[],oportunidades:[],segmentos:[{tenantId:'tenant-a',ativo:true,nome:'Química e Petroquímica'}]};
 let ibgeCalls=0;
 globalThis.fetch=async(url,options={})=>{
  const u=String(url);
  if(u.includes('/rest/v1/perfis?'))return new Response(JSON.stringify([{tenant_id:'tenant-a',papel:'gestor',ativo:true}]),{status:200});
  if(u.includes('/rest/v1/segmentos?'))return new Response(JSON.stringify([{nome:'Química e Petroquímica',ativo:true}]),{status:200});
  if(u.includes('servicodados.ibge.gov.br')){ibgeCalls++;return new Response(JSON.stringify([{id:3530607,nome:'Mogi das Cruzes'}]),{status:200});}
  throw Error('URL inesperada: '+u);
 };
 const nuvem={sessao:()=>({access_token:'jwt-test'}),config:()=>({url:'https://safe.supabase.co',chave:'public-test'})};
 let cleanupOne,cleanupTwo;
 try{
  cleanupOne=mountMarketDiscovery({root,snapshot,scope,getScopeToken:()=>scope.token,nuvem});
  await waitForMarketReady(root,walk);
  await walk(root,n=>n.tagName==='button'&&n.textContent.includes('Aplicar exemplo')).fire('click');
  assert.equal(ibgeCalls,1,'primeira consulta pública IBGE');
  cleanupOne();cleanupOne=null;
  const secondRoot=new MarketTestNode('root');
  secondRoot.ownerDocument=root.ownerDocument;
  cleanupTwo=mountMarketDiscovery({root:secondRoot,snapshot,scope,getScopeToken:()=>scope.token,nuvem});
  await waitForMarketReady(secondRoot,walk);
  await walk(secondRoot,n=>n.tagName==='button'&&n.textContent.includes('Aplicar exemplo')).fire('click');
  assert.equal(ibgeCalls,1,'reabertura deve aproveitar o cache do mesmo documento');
  const selected=walk(secondRoot,n=>n.tagName==='summary'&&n.textContent.includes('Mogi das Cruzes'));
  assert.ok(selected,'município oficial permanece selecionável');
 }finally{
  cleanupTwo?.();cleanupOne?.();globalThis.fetch=oldFetch;
 }
});

test('DOM: falha de IBGE usa BrasilAPI e preserva codigo municipal de sete digitos',async()=>{
 const {mountMarketDiscovery}=await import('../src/ri/market-view.mjs');
 const {root,walk}=fakeMarketDOM(),originalFetch=globalThis.fetch,requests=[];
 const scope={tenantId:'tenant-a',userId:'u1',token:'scope-a'};
 globalThis.fetch=async(url,options={})=>{
  if(String(url).includes('/rest/v1/perfis?'))return new Response(JSON.stringify([{tenant_id:'tenant-a',papel:'gestor',ativo:true}]),{status:200});
  if(String(url).includes('/rest/v1/segmentos?'))return new Response(JSON.stringify([{nome:'Química e Petroquímica',ativo:true}]),{status:200});
  requests.push({url:String(url),options});
  if(String(url).includes('servicodados.ibge.gov.br'))throw Error('IBGE temporariamente indisponivel');
  if(String(url).includes('brasilapi.com.br'))
   return new Response(JSON.stringify([{nome:'Mogi das Cruzes',codigo_ibge:'3530607'}]),{status:200});
  if(String(url).includes('/functions/v1/market-search'))
   return new Response(JSON.stringify({data:[],source:'Teste'}),{status:200});
  throw Error('unexpected');
 };
 try{
  const cleanup=mountMarketDiscovery({root,snapshot:{contas:[],oportunidades:[],segmentos:[{tenantId:'tenant-a',ativo:true,nome:'Química e Petroquímica'}]},scope,
   getScopeToken:()=>scope.token,nuvem:{sessao:()=>({access_token:'jwt-test'}),config:()=>({url:'https://safe.supabase.co',chave:'public-test'})}});
  await waitForMarketReady(root,walk);
  const demo=walk(root,n=>n.tagName==='button'&&n.textContent.includes('Aplicar exemplo'));await demo.fire('click');
  const form=walk(root,n=>n.tagName==='form');await form.fire('submit');
  const body=JSON.parse(requests.find(x=>x.url.includes('/functions/v1/market-search')).options.body);
  assert.equal(body.filters.municipios[0].codigoIBGE,'3530607');
  assert.ok(requests.some(x=>x.url.includes('brasilapi.com.br')));
  cleanup();
 }finally{globalThis.fetch=originalFetch;}
});

test('RI-M03: contrato preserva somente estados ICP permitidos, jamais verificado de IA',()=>{
 const rows=normalizeMarketCompanies([{
  cnpj:null,nome:'Empresa de pesquisa',cidade:'Mogi das Cruzes',uf:'SP',fontes:[{url:'https://example.org/empresa'}],
  qualificacaoICP:{municipio:'declarado',ddd:'pendente',segmento:'verificado',funcionarios:'declarado',statusGeral:'confirmado'}
 }]);
 assert.equal(rows.length,1);
 const q=rows[0].qualificacaoICP;
 assert.equal(q.municipio,'declarado');
 assert.equal(q.ddd,'pendente');
 assert.equal(q.segmento,'nao_solicitado');
 assert.equal(q.statusGeral,'pendente');
 assert.equal(rows[0].identidadeStatus,'pendente_cnpj');
});
test('RI-M03: ICP declarado nao prova correspondencia e a importacao segue condicionada a CNPJ',()=>{
 const rows=normalizeMarketCompanies([{
  cnpj:null,nome:'Empresa com porte declarado',cidade:'Mogi das Cruzes',uf:'SP',
  qualificacaoICP:{municipio:'declarado',ddd:'declarado',segmento:'declarado',funcionarios:'declarado',statusGeral:'declarado_nao_verificado'},
  fontes:[{url:'https://example.org/empresa'}]
 }]);
 assert.equal(rows[0].qualificacaoICP.statusGeral,'declarado_nao_verificado');
 assert.throws(()=>buildMarketImportRequest(rows[0],{contas:[],oportunidades:[]},{tenantId:'tenant-a',userId:'u1'},'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),/CNPJ|revis/i);
});
test('RI-M03: interface identifica individualmente municipio DDD segmento e faixa de empregados',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../src/ri/market-view.mjs',import.meta.url),'utf8');
 for(const part of ['Aderencia ao ICP','Municipio','DDD','Segmento','Faixa de funcionarios','nao verificados'])
  assert.ok(source.includes(part),'missing ICP label '+part);
});

test('RI-M04: DOM de Mercado verifica modelos autenticados sem filtros, quotas ou importacao',async()=>{
 const {mountMarketDiscovery}=await import('../src/ri/market-view.mjs');
 const {root,walk}=fakeMarketDOM(),oldFetch=globalThis.fetch,requests=[];
 const scope={tenantId:'tenant-a',userId:'u1',token:'scope-preflight'};
 globalThis.fetch=async(url,opt={})=>{
  if(String(url).includes('/rest/v1/perfis?'))return new Response(JSON.stringify([{tenant_id:'tenant-a',papel:'gestor',ativo:true}]),{status:200});
  if(String(url).includes('/rest/v1/segmentos?'))return new Response(JSON.stringify([]),{status:200});
  requests.push({url:String(url),options:opt});
  if(String(url).includes('/functions/v1/market-search')){
   const request=JSON.parse(opt.body);
   assert.equal(request.action,'preflight');
   assert.equal(request.provider,'both');
   assert.ok(!request.filters);
   return new Response(JSON.stringify({action:'preflight',results:[
    {provider:'OpenAI',status:'MODEL_AVAILABLE',webSearchSupport:'unknown'},
    {provider:'Anthropic',status:'MODEL_AVAILABLE',webSearchSupport:'supported'}
   ]}),{status:200});
  }
  throw Error('Unexpected URL '+url);
 };
 try{
  const cleanup=mountMarketDiscovery({root,snapshot:{contas:[],oportunidades:[],segmentos:[]},scope,
   getScopeToken:()=>scope.token,
   nuvem:{sessao:()=>({access_token:'jwt-test'}),config:()=>({url:'https://safe.supabase.co',chave:'public-key'})}});
  const button=walk(root,n=>n.tagName==='button'&&n.textContent.includes('Verificar acesso'));
  assert.ok(button);
  await button.fire('click');
  const preflightRequests=requests.filter(x=>x.url.includes('/functions/v1/market-search'));
  assert.equal(preflightRequests.length,1);
  assert.match(String(preflightRequests[0].options.headers.Authorization),/^Bearer /);
  assert.ok(!requests.some(x=>x.url.includes('iad_market_import_confirmed')||x.url.includes('iad_market_search_reserve')));
  const status=walk(root,n=>typeof n.textContent==='string'&&n.textContent.includes('Nenhuma cota de pesquisa consumida'));
  assert.ok(status,'diagnostic result missing in UI');
  cleanup();
 }finally{globalThis.fetch=oldFetch;}
});

test('RI-M05: interface apresenta metricas de rejeicao sem dados de empresa e sem importacao',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../src/ri/market-view.mjs',import.meta.url),'utf8');
 for(const label of ['rejectedTerritory','rejectedEmployees','rejectedInvalidCnpj',
  'rejectedMissingName','rejectedUncitedSource','mergedDuplicates'])
  assert.ok(source.includes(label),'missing visual diagnostic '+label);
 assert.match(source,/IAD_MARKET_IMPORT_ENABLED!==true/);
});

test('RI-M06 DOM: seis etapas e shortlist aparecem na pesquisa real simulada sem gravar CRM',async()=>{
 const {mountMarketDiscovery}=await import('../src/ri/market-view.mjs');
 const {root,walk}=fakeMarketDOM(),oldFetch=globalThis.fetch,requests=[];
 const scope={tenantId:'tenant-a',userId:'user1',token:'ri-m06'};
 const snapshot={contas:[],oportunidades:[],segmentos:[{tenantId:'tenant-a',ativo:true,nome:'Química e Petroquímica'}]};
 globalThis.fetch=async(url,options={})=>{
  if(String(url).includes('/rest/v1/perfis?'))return new Response(JSON.stringify([{tenant_id:'tenant-a',papel:'gestor',ativo:true}]),{status:200});
  if(String(url).includes('/rest/v1/segmentos?'))return new Response(JSON.stringify([{nome:'Química e Petroquímica',ativo:true}]),{status:200});
  requests.push(String(url));
  if(String(url).includes('servicodados.ibge.gov.br'))
   return new Response(JSON.stringify([{id:3530607,nome:'Mogi das Cruzes'}]),{status:200});
  if(String(url).includes('/functions/v1/market-search'))return new Response(JSON.stringify({
   source:'OpenAI + Claude',retrievedAt:'2026-11-05',usage:[],
   data:[{cnpj:'11222333000181',nome:'Indústria Exemplo',cidade:'Mogi das Cruzes',uf:'SP',
    segmento:'Química',fontes:[{url:'https://example.org/industria'}],
    contatos:[{nome:'Ana Exemplo',cargo:'Diretora Industrial'}],
    qualificacaoICP:{municipio:'declarado',segmento:'declarado'},
    providers:['OpenAI','Anthropic']}]
  }),{status:200});
  throw Error('URL inesperada '+url);
 };
 try{
  const cleanup=mountMarketDiscovery({root,snapshot,scope,getScopeToken:()=>scope.token,
   nuvem:{sessao:()=>({access_token:'jwt-test'}),config:()=>({url:'https://safe.supabase.co',chave:'test'})}});
  await waitForMarketReady(root,walk);
  const demo=walk(root,n=>n.tagName==='button'&&n.textContent.includes('Aplicar exemplo'));
  assert.ok(demo);await demo.fire('click');
  const form=walk(root,n=>n.tagName==='form');assert.ok(form);
  await form.fire('submit');
  assert.ok(walk(root,n=>n.id==='iad-prospect-agents'));
  for(const stage of ['Finder','Analyst','Signal Hunter','Enricher','Qualifier','Prioritizer'])
   assert.ok(walk(root,n=>n.textContent?.startsWith(stage+' · ')),stage+' não aparece no painel');
  assert.ok(walk(root,n=>n.textContent?.includes('Shortlist para investigação')));
  assert.ok(walk(root,n=>n.textContent?.includes('Índice de prontidão para revisão')));
  assert.ok(walk(root,n=>n.textContent?.includes('Próximo passo recomendado:')));
  const reviewLabel=walk(root,n=>n.tagName==='label'&&n.textContent==='Selecionar para revisao comercial');
  assert.ok(reviewLabel,'empresa precisa permitir seleção de revisão');
  const check=walk(reviewLabel,n=>n.tagName==='input'&&n.type==='checkbox');
  assert.ok(check);check.checked=true;await check.fire('change');
  assert.ok(walk(root,n=>n.textContent?.includes('ICP, fonte ou duplicidade exige revisão antes de importar')),
   'ICP incompleto não pode ser enviado à importação, mesmo após seleção humana');
  assert.ok(!requests.some(x=>x.includes('iad_market_import_confirmed')));
  cleanup();
 }finally{globalThis.fetch=oldFetch;}
});

test('P0: URLs públicas HTTPS são revisáveis, mas hosts locais/privados nunca são habilitados',()=>{
 for(const valid of ['https://example.org/empresa','https://www.empresa.com.br/pesquisa?q=teste'])
  assert.equal(isReviewableSourceURL(valid),true,valid);
 for(const invalid of ['http://example.org','https://localhost/empresa',
  'https://127.0.0.1:8443/empresa','https://192.168.0.1/empresa',
  'https://[::1]/','https://corp.internal/api',
  'https://admin:senha@example.org/empresa','https://empresa.local/info',
  'https://example.org:8443/','javascript:alert(1)','ftp://empresa.com.br'])
  assert.equal(isReviewableSourceURL(invalid),false,invalid);
});
test('P0: importação rejeita fonte HTTPS interna ou com credenciais',()=>{
 const scope={tenantId,userId:'u1'},rid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const base={cnpj:'11222333000181',nome:'Empresa A',cidade:'Jacareí',uf:'SP',
  segmento:'Química',fontes:[{url:'https://example.org/empresa-a'}]};
 for(const url of ['https://localhost/empresa','https://127.0.0.1/empresa',
  'https://usuario:senha@example.org/empresa','http://example.org/empresa']){
  assert.throws(()=>buildMarketImportRequest({...base,fontes:[{url}]},
   {contas:[],oportunidades:[]},scope,rid),/Fonte HTTPS/i);
 }
});
test('P0: interface só torna clicáveis fontes públicas e mostra lacunas de ICP',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../src/ri/market-view.mjs',import.meta.url),'utf8');
 assert.match(source,/safeSources=company\.fontes\.filter\(f=>isReviewableSourceURL\(f\?\.url\)\)/);
 assert.match(source,/totals\.icpIncomplete/);
});

test('RI-M08 DOM: botão Analyst consulta CNPJ individual sem atualizar Pipeline ou shortlist',async()=>{
 const {mountMarketInvestigation}=await import('../src/ri/market-investigation.mjs');
 const {root,walk}=fakeMarketDOM(),doc=root.ownerDocument,requests=[],original=globalThis.fetch;
 const candidate={cnpj:'11222333000181',nome:'Empresa A',cidade:'Jacarei',uf:'SP',segmento:'Quimico'};
 let seq=1;
 globalThis.fetch=async(url,opts={})=>{
  requests.push({url:String(url),method:opts.method,body:JSON.parse(opts.body)});
  return new Response(JSON.stringify({
   action:'investigate',source:'Busca web independente',retrievedAt:'2026-11-05',providers:['OpenAI'],usage:[{provider:'OpenAI',webSearchRequests:1}],
   data:[{...candidate,razaoSocial:'Empresa A',fontes:[{url:'https://example.org/empresa-a',titulo:'Página citada'}],contatos:[],noticias:[]}]
  }),{status:200});
 };
 try{
  const stop=mountMarketInvestigation({card:root,company:candidate,doc,
   nuvem:{sessao:()=>({access_token:'test-auth'}),config:()=>({url:'https://safe.supabase.co',chave:'public-test'})},
   valid:()=>true,provider:()=> 'OpenAI',getSequence:()=>seq});
  const b=walk(root,x=>x.tagName==='button'&&x.textContent.includes('INVESTIGAR EMPRESA'));
  assert.ok(b);
  await b.fire('click');
  assert.equal(requests.length,1);
  assert.equal(requests[0].method,'POST');
  assert.equal(requests[0].body.action,'investigate');
  assert.deepEqual(requests[0].body.target,{cnpj:candidate.cnpj,nome:candidate.nome});
  assert.equal(requests[0].body.filters.limit,1);
  assert.ok(!requests.some(x=>x.url.includes('iad_market_import_confirmed')));
  assert.ok(walk(root,x=>x.tagName==='h5'&&x.textContent.includes('Analyst')));
  assert.ok(walk(root,x=>x.tagName==='a'&&x.href==='https://example.org/empresa-a'));
  assert.ok(walk(root,x=>x.textContent?.includes('NÃO foi incorporado ao CRM')));
  assert.equal(b.disabled,true);
  await b.fire('click');assert.equal(requests.length,1,'Um segundo clique não deve cobrar nova pesquisa');
  stop();seq++;
 }finally{globalThis.fetch=original;}
});
test('RI-M08 DOM: sem sessão não consome pesquisa nem quota',async()=>{
 const {mountMarketInvestigation}=await import('../src/ri/market-investigation.mjs');
 const {root,walk}=fakeMarketDOM(),doc=root.ownerDocument,old=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('No HTTP expected');};
 try{
  const stop=mountMarketInvestigation({card:root,
   company:{cnpj:'11222333000181',nome:'Empresa A',uf:'SP',cidade:'Jacarei',segmento:'Quimico'},
   doc,nuvem:{sessao:()=>null,config:()=>({})},valid:()=>true,provider:()=> 'both',getSequence:()=>0});
  const b=walk(root,x=>x.tagName==='button'&&x.textContent.includes('INVESTIGAR'));
  assert.ok(b);await b.fire('click');assert.equal(calls,0);
  assert.ok(walk(root,x=>x.textContent?.includes('Sessão de nuvem necessária')));
  stop();
 }finally{globalThis.fetch=old;}
});

test('RI-M09 DOM: Signal Hunter faz uma busca adicional e não grava nem altera lista original',async()=>{
 const {mountMarketSignals}=await import('../src/ri/market-signals.mjs');
 const {root,walk}=fakeMarketDOM(),doc=root.ownerDocument,original=globalThis.fetch,requests=[];
 const company={cnpj:'11222333000181',nome:'Empresa A',cidade:'Jacarei',uf:'SP',segmento:'Quimico'};
 let sequence=1;
 globalThis.fetch=async(url,opt={})=>{
  requests.push({url:String(url),body:JSON.parse(opt.body),method:opt.method});
  return new Response(JSON.stringify({action:'signals',sinais:[
   {cnpj:company.cnpj,tipo:'expansao',titulo:'Expansão da planta industrial',
    resumo:'Projeto industrial citado pelo provedor',dataPublicacao:'2026-11-01',
    url:'https://example.org/empresa-a'}
  ],providers:['OpenAI'],verifiedSignals:0,partial:false,usage:[{provider:'OpenAI',webSearchRequests:1}]}),{status:200});
 };
 try{
  const stop=mountMarketSignals({card:root,company,doc,valid:()=>true,getSequence:()=>sequence,
   provider:()=> 'OpenAI',nuvem:{sessao:()=>({access_token:'jwt-test'}),
    config:()=>({url:'https://safe.supabase.co',chave:'publishable-test'})}});
  const button=walk(root,n=>n.tagName==='button'&&n.textContent.includes('BUSCAR SINAIS EXTERNOS'));
  assert.ok(button);
  await button.fire('click');
  assert.equal(requests.length,1);assert.equal(requests[0].body.action,'signals');
  assert.deepEqual(requests[0].body.target,{cnpj:company.cnpj,nome:company.nome});
  assert.equal(requests[0].body.provider,'OpenAI');
  assert.ok(walk(root,n=>n.textContent==='Signal Hunter — eventos externos para revisão'));
  assert.ok(walk(root,n=>n.tagName==='a'&&n.href==='https://example.org/empresa-a'));
  assert.ok(walk(root,n=>n.textContent?.includes('Nenhum vínculo com compra foi confirmado')));
  assert.ok(!requests.some(x=>x.url.includes('iad_market_import_confirmed')));
  assert.equal(button.disabled,true);
  await button.fire('click');
  assert.equal(requests.length,1,'clique duplo não cobra duas investigações');
  stop();sequence++;
 }finally{globalThis.fetch=original;}
});
test('RI-M09 DOM: Signal Hunter bloqueia sem sessão e rejeita links perigosos no payload',async()=>{
 const {mountMarketSignals}=await import('../src/ri/market-signals.mjs');
 const {root,walk}=fakeMarketDOM(),doc=root.ownerDocument,original=globalThis.fetch;let calls=0;
 const company={cnpj:'11222333000181',nome:'Empresa A',cidade:'Jacarei',uf:'SP',segmento:'Quimico'};
 globalThis.fetch=async()=>{calls++;throw Error('no http expected');};
 try{
  const stop=mountMarketSignals({card:root,company,doc,valid:()=>true,getSequence:()=>1,
   nuvem:{sessao:()=>null,config:()=>({})}});
  const b=walk(root,n=>n.tagName==='button'&&n.textContent.includes('BUSCAR SINAIS'));
  assert.ok(b);await b.fire('click');
  assert.equal(calls,0);
  assert.ok(walk(root,n=>n.textContent?.includes('Autenticação necessária')));
  stop();
 }finally{globalThis.fetch=original;}
});

test('RI-M10 DOM: pesquisa de decisores exige clique, não cria contato ou oportunidade',async()=>{
 const {mountMarketEnricher}=await import('../src/ri/market-enricher.mjs');
 const {root,walk}=fakeMarketDOM(),doc=root.ownerDocument,original=globalThis.fetch,requests=[];
 const company={cnpj:'11222333000181',nome:'Empresa A',uf:'SP',cidade:'Jacarei',segmento:'Quimico'};
 let seq=1;
 globalThis.fetch=async(url,options={})=>{
  requests.push({url:String(url),method:options.method,body:JSON.parse(options.body)});
  return new Response(JSON.stringify({action:'enrich',decisores:[{
   cnpj:company.cnpj,nome:'Ana Exemplo',cargo:'Diretora Industrial',fonte:'https://example.org/empresa-a',
   emailCorporativo:'ana@empresa-industrial.com.br',linkedin:null,
   status:'VINCULO_PROFISSIONAL_CITADO_NAO_VERIFICADO'
  }],providers:['OpenAI'],usage:[{provider:'OpenAI',webSearchRequests:1}],verifiedContacts:0}),{status:200});
 };
 try{
  const stop=mountMarketEnricher({card:root,company,doc,valid:()=>true,getSequence:()=>seq,
   provider:()=> 'OpenAI',nuvem:{sessao:()=>({access_token:'jwt-test'}),
    config:()=>({url:'https://safe.supabase.co',chave:'public-test'})}});
  const button=walk(root,n=>n.tagName==='button'&&n.textContent.includes('PESQUISAR DECISORES'));
  assert.ok(button);assert.equal(requests.length,0);
  await button.fire('click');
  assert.equal(requests.length,1);
  assert.equal(requests[0].body.action,'enrich');
  assert.equal(requests[0].body.target.cnpj,company.cnpj);
  assert.ok(!requests.some(x=>x.url.includes('iad_market_import_confirmed')));
  assert.ok(walk(root,n=>n.textContent?.includes('Enricher — profissionais citados')));
  assert.ok(walk(root,n=>n.textContent?.includes('NÃO foram verificados')));
  assert.ok(walk(root,n=>n.tagName==='a'&&n.href==='https://example.org/empresa-a'));
  assert.equal(button.disabled,true);
  await button.fire('click');assert.equal(requests.length,1);
  stop();seq++;
 }finally{globalThis.fetch=original;}
});
test('RI-M10 DOM: sem sessão não executa enriquecimento nem utiliza quota',async()=>{
 const {mountMarketEnricher}=await import('../src/ri/market-enricher.mjs');
 const {root,walk}=fakeMarketDOM(),doc=root.ownerDocument,original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('Network should not run');};
 try{
  const stop=mountMarketEnricher({card:root,company:{cnpj:'11222333000181',
   nome:'Empresa A',uf:'SP',cidade:'Jacarei',segmento:'Quimico'},
   doc,valid:()=>true,getSequence:()=>1,nuvem:{sessao:()=>null,config:()=>({})}});
  const b=walk(root,n=>n.tagName==='button'&&n.textContent.includes('PESQUISAR DECISORES'));
  assert.ok(b);await b.fire('click');assert.equal(calls,0);
  assert.ok(walk(root,n=>n.textContent?.includes('Autenticação necessária')));
  stop();
 }finally{globalThis.fetch=original;}
});

test('RI-M16 DOM: perfil de outra empresa bloqueia busca sem reservar cota ou chamar IA',async()=>{
 const {mountMarketDiscovery}=await import('../src/ri/market-view.mjs');
 const {root,walk}=fakeMarketDOM(),oldFetch=globalThis.fetch,requests=[];
 const scope={tenantId:'tenant-bio',userId:'admin-acp',token:'scope-mismatch'};
 globalThis.fetch=async(url,opt={})=>{
  const u=String(url);requests.push(u);
  if(u.includes('/rest/v1/perfis?'))return new Response(JSON.stringify([{tenant_id:'tenant-acp',papel:'admin',ativo:true}]),{status:200});
  if(u.includes('/rest/v1/segmentos?'))return new Response(JSON.stringify([{nome:'Química e Petroquímica',ativo:true}]),{status:200});
  if(u.includes('servicodados.ibge.gov.br'))return new Response('[]',{status:200});
  throw Error('Nenhuma IA deveria ser consultada: '+u);
 };
 try{
  const cleanup=mountMarketDiscovery({root,
   snapshot:{contas:[],oportunidades:[],segmentos:[{tenantId:'tenant-bio',ativo:true,nome:'Química e Petroquímica'}]},
   scope,getScopeToken:()=>scope.token,
   nuvem:{sessao:()=>({access_token:'synthetic'}),config:()=>({url:'https://safe.supabase.co',chave:'public-key'})}});
  for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));
  const btn=walk(root,n=>n.tagName==='button'&&n.textContent==='Buscar empresas');
  assert.ok(btn.disabled,'o botão pago deve permanecer bloqueado');
  const form=walk(root,n=>n.tagName==='form');await form.fire('submit');
  assert.ok(!requests.some(u=>u.includes('/functions/v1/market-search')||u.includes('/rpc/iad_market_search_reserve')));
  const status=walk(root,n=>n.tagName==='p'&&String(n.textContent).includes('empresa vinculada'));
  assert.ok(status,'a divergência entre tenants deve ser compreensível');
  cleanup();
 }finally{globalThis.fetch=oldFetch;}
});
