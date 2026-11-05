import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCnpj, normalizeMarketFilters, matchCrmAccount, normalizeMarketCompanies, proposePipelineAction, buildMarketImportRequest, UF_IBGE, MARKET_DDDS, MARKET_BANDS} from '../src/ri/market-contract.mjs';
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
 assert.match(source,/Aplicar exemplo: Mogi\/SP/);
 assert.match(source,/IAD_MARKET_IMPORT_ENABLED!==true/);
});

class MarketTestNode{
 constructor(tag){this.tagName=tag;this.textContent='';this.children=[];this.style={};this.listeners=new Map();this.isConnected=true;this.value='';}
 append(...nodes){nodes.forEach(node=>{this.children.push(node);node.parent=this;});}
 appendChild(node){this.append(node);return node;}
 prepend(node){this.children.unshift(node);node.parent=this;}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 addEventListener(event,fn){const a=this.listeners.get(event)||[];a.push(fn);this.listeners.set(event,a);}
 async fire(event,data={}){for(const fn of this.listeners.get(event)||[])await fn({preventDefault(){},...data});}
}
function fakeMarketDOM(){
 const doc={createElement:t=>new MarketTestNode(t),createTextNode:text=>{const n=new MarketTestNode('#text');n.textContent=text;return n;}};
 const root=new MarketTestNode('root');root.ownerDocument=doc;
 const walk=(node,pred)=>{if(pred(node))return node;for(const child of node.children){const match=walk(child,pred);if(match)return match;}return null;};
 return {root,walk};
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
  const demo=walk(root,n=>n.tagName==='button'&&n.textContent.includes('Aplicar exemplo: Mogi/SP'));
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
test('DOM: falha de IBGE usa BrasilAPI e preserva codigo municipal de sete digitos',async()=>{
 const {mountMarketDiscovery}=await import('../src/ri/market-view.mjs');
 const {root,walk}=fakeMarketDOM(),originalFetch=globalThis.fetch,requests=[];
 const scope={tenantId:'tenant-a',userId:'u1',token:'scope-a'};
 globalThis.fetch=async(url,options={})=>{
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
  const demo=walk(root,n=>n.tagName==='button'&&n.textContent.includes('Aplicar exemplo: Mogi/SP'));await demo.fire('click');
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
