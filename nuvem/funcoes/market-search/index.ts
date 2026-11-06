/* RI-M01 /market-search — consulta MANUAL read-only, sem credenciais no browser.
 * A funcao nao cria/atualiza contas, contatos nem oportunidades.
 * Reutiliza IA_CHAVE_OPENAI e IA_CHAVE_ANTHROPIC de servidor; nenhuma API de leads obrigatoria.
 * verify_jwt=false no gateway, porque o OPTIONS precisa atravessar o CORS;
 * o JWT da pessoa e validado explicitamente pelo Auth REST antes da consulta.
 */
const ORIGINS=new Set(['https://www.iadcrm.com.br','https://iadcrm.com.br','https://maiaalex2306.github.io']);
function headers(origin){return {'content-type':'application/json','Access-Control-Allow-Origin':ORIGINS.has(origin)?origin:'https://www.iadcrm.com.br','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Vary':'Origin','Cache-Control':'no-store'};}
function output(body,status,origin){return new Response(JSON.stringify(body),{status,headers:headers(origin)});}
const str=(v,n=120)=>typeof v==='string'?v.trim().slice(0,n):'';
const digits=v=>String(v??'').replace(/\D/g,'');
function number(v,max=1e12){if(v===null||v===undefined||v==='')return null;const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>max)throw Error('Faixa numerica invalida');return n;}
// Allowed catalog keys; labels for segments are independently authorized
// through the tenant-scoped segmentos table before any paid provider call.
const UF_IBGE={AC:12,AL:27,AP:16,AM:13,BA:29,CE:23,DF:53,ES:32,GO:52,MA:21,MT:51,MS:50,MG:31,PA:15,PB:25,PR:41,PE:26,PI:22,RJ:33,RN:24,RS:43,RO:11,RR:14,SC:42,SP:35,SE:28,TO:17};
const MARKET_DDDS=new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99].map(String));
const BAND_LIMITS={ '0_10':[0,10],'11_100':[11,100],'101_200':[101,200],'201_500':[201,500],'501_1000':[501,1000],'1001_5000':[1001,5000],'5001_10000':[5001,10000],'10001_plus':[10001,null] };
function boundedList(value,name,max,map){
 if(value===undefined||value===null)return [];
 if(!Array.isArray(value)||value.length>max)throw Error(name+' invalido');
 const mapped=value.map(map);
 if(mapped.some(v=>v===null||v===''))throw Error(name+' invalido');
 return [...new Map(mapped.map(x=>[typeof x==='string'?x:JSON.stringify(x),x])).values()];
}
function filters(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Filtros ausentes');
 const uf=str(raw.uf,2).toUpperCase(),cidade=str(raw.cidade),regiao=str(raw.regiao),ddd=digits(raw.ddd).replace(/^0+(?=\d)/,''),segmento=str(raw.segmento),cnae=digits(raw.cnae).slice(0,7),porte=str(raw.porte,40);
 if(uf&&!Object.hasOwn(UF_IBGE,uf))throw Error('UF invalida');
 if(ddd&&!MARKET_DDDS.has(ddd))throw Error('DDD invalido');
 const municipios=boundedList(raw.municipios,'Municipios',15,v=>{
  if(!v||typeof v!=='object'||Array.isArray(v))return null;
  const codigoIBGE=String(v.codigoIBGE??''),nome=str(v.nome,120),state=str(v.uf,2).toUpperCase();
  return /^\d{7}$/.test(codigoIBGE)&&nome&&state===uf&&Number(codigoIBGE.slice(0,2))===UF_IBGE[state]?{codigoIBGE,nome,uf:state}:null;
 });
 const ddds=boundedList(raw.ddds,'DDDs',20,v=>{const c=digits(v).replace(/^0+(?=\d)/,'');return MARKET_DDDS.has(c)?c:null;});
 const segmentos=boundedList(raw.segmentos,'Segmentos',12,v=>{const name=str(v,120);return name&&name.length>=2?name:null;});
 const faixasFuncionarios=boundedList(raw.faixasFuncionarios,'Faixas de funcionarios',8,v=>Object.hasOwn(BAND_LIMITS,v)?v:null);
 if((cidade&&municipios.length)||(ddd&&ddds.length)||(segmento&&segmentos.length))throw Error('Filtros singulares e multiplos simultaneos');
 if(!uf&&!cidade&&!regiao&&!ddd&&!municipios.length&&!ddds.length)throw Error('Informe territorio');
 if(!segmento&&!segmentos.length&&!cnae)throw Error('Informe segmento ou CNAE');
 const funcionariosMin=number(raw.funcionariosMin,1e9),funcionariosMax=number(raw.funcionariosMax,1e9),faturamentoMin=number(raw.faturamentoMin),faturamentoMax=number(raw.faturamentoMax);
 if(faixasFuncionarios.length&&(funcionariosMin!==null||funcionariosMax!==null))throw Error('Nao misture faixas e limites de empregados');
 if(funcionariosMax!==null&&funcionariosMin!==null&&funcionariosMax<funcionariosMin)throw Error('Faixa de empregados invertida');
 if(faturamentoMax!==null&&faturamentoMin!==null&&faturamentoMax<faturamentoMin)throw Error('Faixa de faturamento invertida');
 const limit=raw.limit===undefined?20:Number(raw.limit);if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Limite 1 a 50');
 return {uf,cidade,regiao,ddd,segmento,cnae,porte,municipios,ddds,segmentos,faixasFuncionarios,funcionariosMin,funcionariosMax,faturamentoMin,faturamentoMax,limit,catalogRequired:Array.isArray(raw.segmentos)&&segmentos.length>0};
}

function normalize(data){
 const rows=Array.isArray(data)?data:Array.isArray(data?.empresas)?data.empresas:Array.isArray(data?.companies)?data.companies:Array.isArray(data?.data)?data.data:Array.isArray(data?.resultados)?data.resultados:null;
 if(!rows)throw Error('Resposta do fornecedor nao reconhecida');
 return rows.slice(0,50).map(x=>({
  cnpj:str(x.cnpj||x.CNPJ,20),razaoSocial:str(x.razaoSocial||x.razao_social||x.nome,160),
  nome:str(x.nomeFantasia||x.nome_fantasia||x.nome||x.razaoSocial,160),
  cidade:str(x.cidade||x.municipio),uf:str(x.uf,2).toUpperCase(),porte:str(x.porte,70),
  segmento:str(x.segmento||x.cnaePrimario?.descricao||x.cnaePrimario,120),cnae:str(x.cnae||x.cnaePrimario?.codigo,15),
  site:str(x.site||x.website||x.websites?.[0],200),
  telefone:str(typeof x.telefone==='string'?x.telefone:x.telefones?.[0]?.numero,50),
  funcionarios:x.funcionarios??null,faturamento:x.faturamento??null,
  contatos:Array.isArray(x.decisores)?x.decisores.slice(0,15).map(y=>({nome:str(y.nome),cargo:str(y.cargo||y.funcao),email:str(y.email,140),telefone:str(y.telefone,50),fonte:'Econodata'})):[],
  noticias:[],insights:[]
 }));
}

/* Pesquisa web nativa dos dois provedores ja integrados ao IaD.
   Exigimos web_search_call / server_tool_use e URL citada pelo provedor. */
function aiKey(id) {
 const direct=(Deno.env.get('IA_CHAVE_'+id.toUpperCase())||'').trim();
 const legacy=(Deno.env.get('IA_PROVEDOR')||'').trim().toLowerCase()===id?(Deno.env.get('IA_CHAVE')||'').trim():'';
 return direct||legacy;
}
function canonicalUrl(s) {
 try { const u=new URL(String(s||''));return (u.protocol==='https:'||u.protocol==='http:')&&!u.username&&!u.password?u.href:''; } catch{return '';}
}
function cnpjReal(s){
 const v=String(s||'').toUpperCase().replace(/[^0-9A-Z]/g,'');
 if(!/^[A-Z0-9]{12}[0-9]{2}$/.test(v))return '';
 // Match the transactional import guard: a repeated 12-char CNPJ root
 // is invalid even when the mathematical check digits happen to match.
 if(v.slice(0,12)===v[0].repeat(12))return '';
 const digit=(s,w)=>{const mod=[...s].reduce((sum,c,i)=>sum+(c.charCodeAt(0)-48)*w[i],0)%11;return mod<2?'0':String(11-mod)};
 return v[12]===digit(v.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2])&&v[13]===digit(v.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2])?v:'';
}
// Investigação individual explícita: somente CNPJ com DV válido, nome limitado.
// Não usar o alvo para conceder privilégios; a RPC de quota continua obrigatória.
function targetedCompany(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  Object.keys(raw).some(k=>!['cnpj','nome'].includes(k)))throw Error('Alvo de investigação inválido');
 const cnpj=cnpjReal(raw.cnpj),nome=str(raw.nome,160);
 if(!cnpj||nome.length<3||/[\r\n\u0000-\u001f<>]/.test(nome))throw Error('CNPJ ou nome inválido para investigação');
 return {cnpj,nome};
}
function parseAI(s) {
 const text=String(s||'').trim();
 const fence=text.match(/```(?:json)?\s*([\s\S]*?)```/i);
 try{return JSON.parse(fence?fence[1]:text)}catch {
  try{return JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1))}catch{return {}}
 }
}
function aiSummary(result,engine) {
 const blocks=engine==='OpenAI'?(Array.isArray(result.output)?result.output:[]):(Array.isArray(result.content)?result.content:[]);
 // A web_search *attempt* is not evidence of a completed search.
 // OpenAI exposes a per-tool status; Anthropic may return HTTP 200
 // while embedding web_search_tool_result_error in the message body.
 // Claude pause_turn/tool_use/max_tokens is not a finished research turn.
 const finalResponse=engine==='OpenAI'
  ? result.status==='completed' || result.status===undefined
  : result.stop_reason==='end_turn' || result.stop_reason==null;
 const completedSearch=engine==='OpenAI'
  ? blocks.some(b=>b.type==='web_search_call'&&b.status==='completed')
  : blocks.some(b=>{
     if(b.type!=='server_tool_use'||b.name!=='web_search'||!b.id)return false;
     return blocks.some(r=>r.type==='web_search_tool_result'&&r.tool_use_id===b.id&&
      Array.isArray(r.content)&&!r.content.some(x=>x?.type==='web_search_tool_result_error'));
    });
 const searched=finalResponse&&completedSearch;
 const textBlocks=engine==='OpenAI'?blocks.filter(b=>b.type==='message').flatMap(b=>b.content||[]):blocks.filter(b=>b.type==='text');
 const texts=textBlocks.map(b=>b.text||'').join('\n');
 const urls=new Set();
 for(const b of blocks) {
  for(const item of (Array.isArray(b.content)?b.content:[])){
   if(item.url&&canonicalUrl(item.url))urls.add(canonicalUrl(item.url));
   for(const an of (Array.isArray(item.annotations)?item.annotations:[])){const u=canonicalUrl(an.url||(an.url_citation&&an.url_citation.url));if(u)urls.add(u)}
  }
  for(const an of (Array.isArray(b.citations)?b.citations:[])){const u=canonicalUrl(an.url);if(u)urls.add(u)}
 }
 // Preserve provider-reported usage; no price conversion without a vetted
 // per-model price table, exchange rate and billed web search quantities.
 const safeCount=v=>Number.isSafeInteger(v)&&v>=0?v:null;
 const metering=result&&typeof result.usage==='object'?result.usage:{};
 const usage={
  provider:engine,
  inputTokens:safeCount(engine==='OpenAI'?metering.input_tokens:metering.input_tokens),
  outputTokens:safeCount(metering.output_tokens),
  webSearchRequests:engine==='OpenAI'
   ?blocks.filter(b=>b.type==='web_search_call').length
   :safeCount(metering.server_tool_use?.web_search_requests),
  costBRL:null
 };
 return {engine,searched,urls,parsed:parseAI(texts),usage};
}
// RI-M09: sinais externos são HIPÓTESES auditáveis, não intenção de compra.
const SIGNAL_TYPES=new Set(['expansao','investimento','contratacao','licenciamento',
 'projeto','mudanca_operacional','outro']);
function signalPublicURL(value){
 const url=canonicalUrl(value);
 if(!url)return '';
 try{
  const u=new URL(url),host=u.hostname.toLowerCase().replace(/\\.$/,'');
  if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||
     host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
     host.endsWith('.internal')||host.endsWith('.lan')||host.endsWith('.onion')||
     host.endsWith('.home.arpa')||host.startsWith('[')||!host.includes('.')||
     /^[0-9.]+$/.test(host))return '';
  return u.href;
 }catch{return ''}
}
function signalDate(value){
 if(typeof value!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(value))return null;
 const date=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value||
    date.getTime()>Date.now())return null;
 return value;
}
function combineSignals(results,target){
 const all=new Map(),stats={relatados:0,semCnpjExato:0,semFonteCitada:0,
  tipoInvalido:0,dataInvalida:0,duplicados:0};
 for(const r of results){
  if(!r.searched)continue;
  const list=Array.isArray(r.parsed?.sinais)?r.parsed.sinais:[];
  for(const item of list.slice(0,15)){
   stats.relatados++;
   if(!item||typeof item!=='object'||cnpjReal(item.cnpj)!==target.cnpj){
    stats.semCnpjExato++;continue;
   }
   const tipo=str(item.tipo,40).toLowerCase(),titulo=str(item.titulo,160);
   if(!SIGNAL_TYPES.has(tipo)||titulo.length<8){stats.tipoInvalido++;continue;}
   const url=signalPublicURL(item.url);
   if(!url||!r.urls.has(url)){stats.semFonteCitada++;continue;}
   const rawDate=item.dataPublicacao;
   const publicationDate=signalDate(rawDate);
   if(rawDate!==null&&rawDate!==undefined&&rawDate!==''&&!publicationDate){
    stats.dataInvalida++;continue;
   }
   const key=tipo+'|'+url;
   if(all.has(key)){stats.duplicados++;continue;}
   all.set(key,{cnpj:target.cnpj,tipo,titulo,
    resumo:str(item.resumo,350),dataPublicacao:publicationDate,
    url,provider:r.engine,
    status:'FONTE_CITADA_NAO_VERIFICADA'});
  }
 }
 const sinais=[...all.values()].sort((a,b)=>
  (b.dataPublicacao||'').localeCompare(a.dataPublicacao||'')||
  a.titulo.localeCompare(b.titulo,'pt-BR')).slice(0,8);
 return {sinais,diagnostico:{...stats,apresentados:sinais.length}};
}
function prompt(f,target=null,mode='investigate') {
 if(mode==='signals'&&target)return 'PESQUISA WEB EXTERNA DE SINAIS DOCUMENTADOS da empresa com CNPJ exato '+JSON.stringify(target)+
  ', contexto territorial '+JSON.stringify(f)+
  '. Busque SOMENTE acontecimentos sobre esta entidade jurídica: expansões, investimentos, contratações executivas, licenças, projetos e mudanças operacionais. Prefira notícias corporativas e documentos públicos, com data de publicação. Responda ESTRITAMENTE JSON {"sinais":[{"cnpj":"...","tipo":"expansao|investimento|contratacao|licenciamento|projeto|mudanca_operacional|outro","titulo":"...","resumo":"...","dataPublicacao":"YYYY-MM-DD ou null","url":"https://..."}]}. Máximo 8. Cada URL deve ser citada pela sua ferramenta web_search. Sem CNPJ exato, evento, data ou fonte confiável, omita o item. Não deduza interesse em comprar ou orçamento de vendas; retorno vazio é aceitável.';

 if(target)return 'INVESTIGAÇÃO INDEPENDENTE DE UMA EMPRESA ESPECÍFICA. Pesquise na WEB somente a empresa com CNPJ e nome '+JSON.stringify(target)+', localizada no recorte '+JSON.stringify(f)+'. Use fontes primárias e páginas corporativas quando disponíveis. Responda somente JSON com chave empresas, com NO MÁXIMO UMA empresa, contendo cnpj, razaoSocial, nome, cidade, uf, ddd, segmento, porte, site, telefone, funcionarios, faturamento, fontes:[{url,titulo}], contatos:[{nome,cargo,email,telefone,fonte}], noticias:[{titulo,url,data}], insights:[]. Se não conseguir obter o MESMO CNPJ com fonte web citada, devolva {"empresas":[]}. Nunca substitua por CNPJ parecido ou outra filial. Contatos, cargos, números e notícias somente com URL citada; desconhecidos devem ser null ou lista vazia. Evite inventar conclusões e intenção de compra.';
 return 'PESQUISE NA WEB empresas reais com recorte '+JSON.stringify(f)+'. Busque sites corporativos, bases publicas e noticias. Responda somente JSON com chave empresas (array): cada empresa possui cnpj, razaoSocial, nome, cidade, uf, ddd, segmento, porte, site, telefone, funcionarios, faturamento, fontes:[{url,titulo}], contatos:[{nome,cargo,email,telefone,fonte}], noticias:[{titulo,url,data}], insights:[]. Quando uma empresa mencionada nas fontes ainda nao tiver CNPJ encontrado, use cnpj=null e preserve-a como candidata pendente. Nunca invente CNPJ. Toda empresa precisa ter nome e URL realmente citada pela ferramenta web. Valores nao encontrados=null. NUNCA invente empresa ou pessoa. Para DDD/regiao pesquisa e exploratoria, sem promessa de cobertura total. Para filtros em listas aplique OU dentro do campo e E entre campos (municipios, DDDs, segmentos e faixas de empregados). Informe o numero de funcionarios apenas com fonte verificavel; caso contrario use null. Maximo '+f.limit+' empresas.';
}
async function queryAI(engine,key,f,target=null,mode='investigate') {
 const instructions='Pesquisador B2B: use sempre a ferramenta web_search, inclua URLs citadas e retorne JSON sem inventar fatos.';
 let uri,headers,body;
 if(engine==='OpenAI') {
  uri='https://api.openai.com/v1/responses';headers={authorization:'Bearer '+key,'content-type':'application/json'};
  body={model:Deno.env.get('IA_MODELO_PESQUISA_OPENAI')||Deno.env.get('IA_MODELO_OPENAI')||'gpt-5',instructions,input:prompt(f,target,mode),tools:[{type:'web_search',search_context_size:'low'}],tool_choice:'required',max_tool_calls:2,max_output_tokens:2200,store:false};
 } else {
  uri='https://api.anthropic.com/v1/messages';headers={'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'};
  body={model:Deno.env.get('IA_MODELO_PESQUISA_ANTHROPIC')||Deno.env.get('IA_MODELO_ANTHROPIC')||'claude-opus-5',system:instructions,max_tokens:2200,messages:[{role:'user',content:prompt(f,target,mode)}],tools:[{type:'web_search_20250305',name:'web_search',max_uses:2}]};
 }
 // Short searches need enough time for the hosted web tool, but always stay
 // below Supabase's 150s request idle limit. No hidden retry or extra quota.
 const started=Date.now();
 let resp;
 try{
  resp=await fetch(uri,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(80000)});
 }catch(err){
  const code=err?.name==='TimeoutError'||err?.name==='AbortError'?'TIMEOUT': 'FETCH_FAILURE';
  console.warn('[market-search] provider_transport',JSON.stringify({provider:engine,category:code,elapsedMs:Date.now()-started}));
  throw Error('IA_'+code);
 }
 if(!resp.ok){
  console.warn('[market-search] provider_http',JSON.stringify({provider:engine,status:resp.status,elapsedMs:Date.now()-started}));
  throw Error('IA_HTTP_'+resp.status);
 }
 let data;
 try{data=await resp.json()}catch{
  console.warn('[market-search] provider_invalid_json',JSON.stringify({provider:engine,elapsedMs:Date.now()-started}));
  throw Error('IA_INVALID_JSON');
 }
 const summary=aiSummary(data,engine);
 console.info('[market-search] provider_result',JSON.stringify({provider:engine,searched:summary.searched,elapsedMs:Date.now()-started}));
 return summary;
}
// Filter only explicit geographic contradictions; missing fields remain unverified.
function normalizedPlace(value) {
 return str(value,120).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
}
function inRequestedPlace(entry,f) {
 if(f.uf && entry.uf && normalizedPlace(entry.uf)!==normalizedPlace(f.uf))return false;
 if(f.cidade && entry.cidade && normalizedPlace(entry.cidade)!==normalizedPlace(f.cidade))return false;
 if(f.municipios.length&&entry.cidade&&!f.municipios.some(m=>normalizedPlace(m.nome)===normalizedPlace(entry.cidade)))return false;
 const sourceDDD=digits(entry.ddd).replace(/^0+(?=\d)/,'');
 if(f.ddd&&sourceDDD&&sourceDDD!==f.ddd)return false;
 if(f.ddds.length&&sourceDDD&&!f.ddds.includes(sourceDDD))return false;
 return true;
}
// Qualification reflects only self-reported fields from an AI result. Even
// exact matches are NOT independently verified against the linked sources.
function reportedICP(entry,f,employees){
 const asked={
  municipio:f.municipios.length>0||!!f.cidade,
  ddd:f.ddds.length>0||!!f.ddd,
  segmento:f.segmentos.length>0||!!f.segmento,
  funcionarios:f.faixasFuncionarios.length>0||f.funcionariosMin!==null||f.funcionariosMax!==null
 };
 const segment=normalizedPlace(entry.segmento),ddd=digits(entry.ddd).replace(/^0+(?=\d)/,'');
 const selectedSegments=f.segmentos.length?f.segmentos:(f.segmento?[f.segmento]:[]);
 const values={
  municipio:asked.municipio?(entry.cidade?'declarado':'pendente'):'nao_solicitado',
  ddd:asked.ddd?(ddd?'declarado':'pendente'):'nao_solicitado',
  segmento:asked.segmento?(segment?(selectedSegments.some(x=>normalizedPlace(x)===segment)?'declarado':'a_confirmar'):'pendente'):'nao_solicitado',
  funcionarios:asked.funcionarios?(Number.isSafeInteger(employees)&&employees>=0?'declarado':'pendente'):'nao_solicitado'
 };
 const requested=Object.values(values).filter(x=>x!=='nao_solicitado');
 return {...values,statusGeral:requested.length&&requested.every(x=>x==='declarado')?'declarado_nao_verificado':'pendente'};
}
function combineAI(results,limit,f,diagnostics={}) {
 const out=new Map();
 // Aggregate-only diagnostics; never log names, IDs, URLs or prompts.
 const counts={candidates:0,rejectedTerritory:0,rejectedEmployees:0,
  rejectedInvalidCnpj:0,rejectedMissingName:0,rejectedUncitedSource:0,
  mergedDuplicates:0,accepted:0};
 for(const r of results){
  if(!r.searched)continue;
  const list=Array.isArray(r.parsed.empresas)?r.parsed.empresas:[];
  for(const entry of list.slice(0,limit)){
   counts.candidates++;
   if(!entry||typeof entry!=='object'){counts.rejectedMissingName++;continue;}
   if(!inRequestedPlace(entry,f)){counts.rejectedTerritory++;continue;}
   // OR between the selected ranges; missing/ambiguous employee counts stay
   // visible for research, never labeled as confirmed ICP matches.
   const reported=entry.funcionarios;
   const employees=typeof reported==='number'?reported:(typeof reported==='string'&&/^\d+$/.test(reported)?Number(reported):null);
   if(f.faixasFuncionarios.length&&Number.isSafeInteger(employees)&&employees>=0&&
      !f.faixasFuncionarios.some(id=>{const [min,max]=BAND_LIMITS[id];return employees>=min&&(max===null||employees<=max)})){counts.rejectedEmployees++;continue;}
   const icp=reportedICP(entry,f,employees);
   // Preserve legacy numeric employee filters: an explicit out-of-band
   // number is not a prospect that matches this requested ICP.
   if(Number.isSafeInteger(employees)&&employees>=0&&(
      (f.funcionariosMin!==null&&employees<f.funcionariosMin)||
      (f.funcionariosMax!==null&&employees>f.funcionariosMax))){counts.rejectedEmployees++;continue;}
   const rawCnpj=str(entry.cnpj,40),cnpj=cnpjReal(rawCnpj);
   // Invalid supplied CNPJ is discarded; genuinely missing CNPJ can be
   // displayed as a non-importable research candidate with web evidence.
   if(rawCnpj&&!cnpj){counts.rejectedInvalidCnpj++;continue;}
   const nome=str(entry.nome||entry.razaoSocial,160);
   if(!nome){counts.rejectedMissingName++;continue;}
   const sources=(Array.isArray(entry.fontes)?entry.fontes:[]).map(f=>({url:canonicalUrl(f.url),titulo:str(f.titulo,150)})).filter(f=>f.url&&r.urls.has(f.url));
   if(!sources.length){counts.rejectedUncitedSource++;continue;}
   const normalizedName=normalizedPlace(nome).replace(/[^a-z0-9]/g,'');
   if(!cnpj&&normalizedName.length<4){counts.rejectedMissingName++;continue;}
   const researchKey=cnpj?'cnpj:'+cnpj:'pending:'+normalizedName+'|'+normalizedPlace(entry.cidade||f.cidade)+'|'+str(entry.uf||f.uf,2).toUpperCase();
   const urls=new Set(sources.map(f=>f.url));
   const contatos=(Array.isArray(entry.contatos)?entry.contatos:[]).filter(c=>c&&urls.has(canonicalUrl(c.fonte))).slice(0,10).map(c=>({nome:str(c.nome),cargo:str(c.cargo),email:str(c.email,180),telefone:str(c.telefone,60),fonte:canonicalUrl(c.fonte)}));
   const noticias=(Array.isArray(entry.noticias)?entry.noticias:[]).filter(n=>n&&urls.has(canonicalUrl(n.url))).slice(0,6).map(n=>({titulo:str(n.titulo),url:canonicalUrl(n.url),data:str(n.data,40)}));
   const existing=out.get(researchKey);
   if(existing){
    counts.mergedDuplicates++;
    // Same CNPJ is an identity key, not proof that all provider facts agree.
    for(const campo of ['cidade','uf','razaoSocial','segmento']){
     const first=str(existing[campo],160),other=str(entry[campo],160);
     if(first&&other&&normalizedPlace(first)!==normalizedPlace(other)){
      if(existing.conflitos.length<12&&!existing.conflitos.some(x=>x.campo===campo&&x.valorDivergente===other))
       existing.conflitos.push({campo,valorOriginal:first,valorDivergente:other,provedor:r.engine});
      if(campo==='cidade'||campo==='uf')existing.territorioCorroborado=false;
     }
    }
    if(!existing.providers.includes(r.engine))existing.providers.push(r.engine);
    // Never promote a conflicting field to confirmed merely because two
    // providers cite URLs; declarations stay explicitly unverified.
    if(existing.conflitos.length)existing.qualificacaoICP.statusGeral='pendente';
    for(const key of ['municipio','ddd','segmento','funcionarios']){
     if(existing.qualificacaoICP[key]!=='declarado'&&icp[key]==='declarado')
      existing.qualificacaoICP[key]='declarado';
    }
    for(const src of sources)if(!existing.fontes.some(x=>x.url===src.url))existing.fontes.push(src);
    // Merge only contacts whose source was independently cited by this
    // provider; never borrow another provider's global citation set.
    for(const c of contatos){
     if(existing.contatos.length>=10)break;
     if(!existing.contatos.some(x=>x.nome===c.nome&&x.cargo===c.cargo&&x.fonte===c.fonte))existing.contatos.push(c);
    }
    for(const n of noticias){
     if(existing.noticias.length>=6)break;
     if(!existing.noticias.some(x=>x.url===n.url))existing.noticias.push(n);
    }
    continue;
   }
   out.set(researchKey,{cnpj,identidadeStatus:cnpj?'cnpj_validado':'pendente_cnpj',razaoSocial:str(entry.razaoSocial||entry.nome),nome:str(entry.nome||entry.razaoSocial),cidade:str(entry.cidade),uf:str(entry.uf,2).toUpperCase(),porte:str(entry.porte),segmento:str(entry.segmento),site:str(entry.site,200),telefone:str(entry.telefone,60),funcionarios:entry.funcionarios??null,faixaFuncionariosStatus:f.faixasFuncionarios.length?(Number.isSafeInteger(employees)?'aderente_nao_verificado':'pendente'):'nao_solicitado',qualificacaoICP:icp,faturamento:entry.faturamento??null,contatos,noticias,insights:Array.isArray(entry.insights)?entry.insights.slice(0,6).map(s=>str(s,250)):[],fontes:sources,providers:[r.engine],conflitos:[],territorioCorroborado:false});
  }
 }
 counts.accepted=Math.min(out.size,limit);
 Object.assign(diagnostics,counts);
 return [...out.values()].slice(0,limit);
}


/* Autenticacao e permissao precedem esta leitura de metadados.
 * Nunca realiza geracao de tokens, pesquisa web ou reserva de quota.
 * GET /models e documentado pelas APIs, mas NAO comprova web_search. */
const preflightCooldown=new Map();
function selectedModel(engine){
 return engine==='OpenAI'
  ? Deno.env.get('IA_MODELO_PESQUISA_OPENAI')||Deno.env.get('IA_MODELO_OPENAI')||'gpt-5'
  : Deno.env.get('IA_MODELO_PESQUISA_ANTHROPIC')||Deno.env.get('IA_MODELO_ANTHROPIC')||'claude-opus-5';
}
async function modelPreflight(engine){
 const started=Date.now(),key=aiKey(engine==='OpenAI'?'openai':'anthropic');
 if(!key)return {provider:engine,status:'NOT_CONFIGURED',elapsedMs:0,webSearchSupport:'unknown'};
 const model=str(selectedModel(engine),110);
 const url=engine==='OpenAI'
  ?'https://api.openai.com/v1/models/'+encodeURIComponent(model)
  :'https://api.anthropic.com/v1/models/'+encodeURIComponent(model);
 const headers=engine==='OpenAI'
  ?{Authorization:'Bearer '+key}
  :{'x-api-key':key,'anthropic-version':'2023-06-01'};
 let status='UNAVAILABLE',webSearchSupport='unknown',httpStatus=null,resolvedModel=null;
 try{
  const response=await fetch(url,{method:'GET',headers,signal:AbortSignal.timeout(8000)});
  httpStatus=response.status;
  if(response.ok){
   try{
    const meta=await response.json();
    if(meta?.id&&typeof meta.id==='string'){
     resolvedModel=str(meta.id,110);
     const supported=meta?.capabilities?.server_tools?.web_search?.supported;
     webSearchSupport=supported===true?'supported':supported===false?'not_supported':'unknown';
     status=webSearchSupport==='not_supported'?'MODEL_NO_WEB_SEARCH':'MODEL_AVAILABLE';
    }else status='INVALID_RESPONSE';
   }catch{status='INVALID_RESPONSE';}
  }else if(response.status===401)status='AUTH_REJECTED';
  else if(response.status===403)status='ACCESS_DENIED';
  else if(response.status===404)status='MODEL_NOT_FOUND';
  else if(response.status===429)status='PROVIDER_RATE_LIMIT';
  else status='PROVIDER_HTTP_ERROR';
 }catch(e){status=e?.name==='TimeoutError'||e?.name==='AbortError'?'TIMEOUT':'NETWORK_ERROR';}
 const out={provider:engine,status,elapsedMs:Date.now()-started,webSearchSupport};
 if(resolvedModel)out.model=resolvedModel;
 if(httpStatus!==null)out.httpStatus=httpStatus;
 console.info('[market-search] model_preflight',JSON.stringify({provider:engine,status,elapsedMs:out.elapsedMs}));
 return out;
}

Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=='POST')return output({error:'METHOD_NOT_ALLOWED'},405,origin);
 if(origin&&!ORIGINS.has(origin))return output({error:'ORIGIN_NOT_ALLOWED'},403,origin);
 if(Number(req.headers.get('content-length')||0)>12000)return output({error:'REQUEST_TOO_LARGE'},413,origin);
 const access=req.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9._-]{60,}$/.test(access))return output({error:'AUTH_REQUIRED'},401,origin);
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('IAD_CHAVE_PUBLICA')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!anon)return output({error:'SERVER_NOT_CONFIGURED'},503,origin);
 try {
  const identity=await fetch(url+'/auth/v1/user',{headers:{Authorization:access,apikey:anon},signal:AbortSignal.timeout(6500)});
  if(!identity.ok)return output({error:'AUTH_REQUIRED'},401,origin);
  const user=await identity.json();if(!/^[0-9a-f-]{36}$/i.test(String(user?.id||'')))return output({error:'AUTH_REQUIRED'},401,origin);
  const profileRes=await fetch(url+'/rest/v1/perfis?select=tenant_id,papel,ativo&id=eq.'+encodeURIComponent(user.id)+'&limit=1',{headers:{Authorization:access,apikey:anon},signal:AbortSignal.timeout(6500)});
  if(!profileRes.ok)return output({error:'AUTH_SCOPE_UNAVAILABLE'},403,origin);
  const profile=(await profileRes.json())?.[0];
  if(!profile||profile.ativo===false||!['usuario','gestor','admin'].includes(profile.papel)||(!profile.tenant_id&&profile.papel!=='admin'))
   return output({error:'AUTH_SCOPE_UNAVAILABLE'},403,origin);
  // Release pilot: only an authenticated tenant admin may spend provider credits
  // in the production project. Homologation remains available to normal users.
  // Use the trusted server-side Supabase project URL, never a client header.
  if(url==='https://drhonmdffhnwamwzynrs.supabase.co'&&!['admin','gestor'].includes(profile.papel))
   return output({error:'PILOT_ADMIN_OR_MANAGER_ONLY'},403,origin);
  // Byte-limited streaming read: never buffer an unbounded body even if the
  // client omits or lies about Content-Length. Enforce the same 12 KB cap
  // for multibyte UTF-8 input, before contacting any AI provider.
  let body;
  try {
   if(!req.body)return output({error:'INVALID_JSON'},400,origin);
   const reader=req.body.getReader();
   const decoder=new TextDecoder('utf-8',{fatal:true});
   let bytes=0,raw='',overflow=false;
   try {
    while(true){
     const chunk=await reader.read();
     if(chunk.done)break;
     bytes+=chunk.value.byteLength;
     if(bytes>12000){overflow=true;break;}
     raw+=decoder.decode(chunk.value,{stream:true});
    }
    if(!overflow)raw+=decoder.decode();
   } finally {
    if(overflow)await reader.cancel().catch(()=>{});
    reader.releaseLock();
   }
   if(overflow)return output({error:'REQUEST_TOO_LARGE'},413,origin);
   body=JSON.parse(raw);
  }catch{return output({error:'INVALID_JSON'},400,origin)}
  if(body?.action==='preflight'){
   const selected=body.provider===undefined?'both':body.provider;
   if(!['both','OpenAI','Anthropic'].includes(selected))
    return output({error:'INVALID_PROVIDER'},422,origin);
   // Best-effort per-isolate cooldown; no paid model generation or search.
   const cooldownKey=user.id+'|'+selected;
   const last=preflightCooldown.get(cooldownKey)||0;
   if(Date.now()-last<30000)return output({error:'PREFLIGHT_RATE_LIMIT'},429,origin);
   if(preflightCooldown.size>500)preflightCooldown.clear();
   preflightCooldown.set(cooldownKey,Date.now());
   const choices=selected==='both'?['OpenAI','Anthropic']:[selected];
   const results=await Promise.all(choices.map(modelPreflight));
   return output({action:'preflight',results,
    note:'Metadados de modelo: nao executa web_search, nao usa quota de pesquisa e nao homologa a busca real.'},200,origin);
  }
  const action=body?.action;
  if(!['search','investigate','signals'].includes(action))return output({error:'SEARCH_ONLY'},400,origin);
  let target=null;
  if(action==='investigate'||action==='signals'){
   try{target=targetedCompany(body.target)}
   catch{return output({error:'INVALID_INVESTIGATION_TARGET'},422,origin)}
  }
  let f;try{f=filters(body.filters)}catch(e){return output({error:'INVALID_FILTERS',message:e.message},422,origin)}
  if(target){
   if(!f.uf||!f.cidade||!f.segmento||f.municipios.length||f.ddds.length||f.segmentos.length)
    return output({error:'INVESTIGATION_REQUIRES_EXACT_TERRITORY'},422,origin);
   f={...f,limit:1};
  }
  // Explicit provider selection helps diagnose a failed provider without
  // charging for both. Invalid values are rejected before quota reservation.
  const provider=body.provider===undefined?'both':body.provider;
  if(!['both','OpenAI','Anthropic'].includes(provider))
   return output({error:'INVALID_PROVIDER'},422,origin);
  // User-provided segment names must belong to this authenticated tenant,
  // not to a catalog controlled by another tenant or an arbitrary prompt.
  if(f.catalogRequired){
   if(!profile.tenant_id)return output({error:'SEGMENT_CATALOG_UNAVAILABLE'},503,origin);
   let catalog;
   try{
    const response=await fetch(url+'/rest/v1/segmentos?select=nome,ativo&tenant_id=eq.'+encodeURIComponent(profile.tenant_id)+'&ativo=eq.true&limit=120',{
     headers:{Authorization:access,apikey:anon},signal:AbortSignal.timeout(6500)});
    if(!response.ok)return output({error:'SEGMENT_CATALOG_UNAVAILABLE'},503,origin);
    catalog=await response.json();
   }catch{return output({error:'SEGMENT_CATALOG_UNAVAILABLE'},503,origin)}
   if(!Array.isArray(catalog))return output({error:'SEGMENT_CATALOG_UNAVAILABLE'},503,origin);
   const allowed=new Set(catalog.filter(x=>x?.ativo!==false).map(x=>normalizedPlace(x.nome)));
   if(!f.segmentos.length||f.segmentos.some(x=>!allowed.has(normalizedPlace(x))))
    return output({error:'SEGMENT_NOT_AUTHORIZED'},422,origin);
  }
  const openai=aiKey('openai'),claude=aiKey('anthropic');
  if((provider==='OpenAI'&&!openai)||(provider==='Anthropic'&&!claude))
   return output({error:'AI_PROVIDER_NOT_CONFIGURED',provider},503,origin);
  if(!openai&&!claude)return output({error:'AI_NOT_CONFIGURED',message:'A pesquisa precisa de uma das IAs ja configuradas no IaD.'},503,origin);
  // Reserve one research credit in Postgres BEFORE any external paid API call.
  // This RPC authenticates the actor from JWT, checks active tenant membership,
  // serializes concurrent requests per tenant and enforces daily quotas.
  // No database quota service -> no AI calls (fail closed).
  let quota;
  try {
   const reserved=await fetch(url+'/rest/v1/rpc/iad_market_search_reserve',{
    method:'POST',
    headers:{Authorization:access,apikey:anon,'content-type':'application/json'},
    body:'{}',signal:AbortSignal.timeout(6500)
   });
   if(!reserved.ok)return output({error:'SEARCH_QUOTA_UNAVAILABLE'},503,origin);
   quota=await reserved.json();
  }catch{return output({error:'SEARCH_QUOTA_UNAVAILABLE'},503,origin)}
  if(quota?.allowed===false)return output({error:'SEARCH_QUOTA_EXCEEDED',scope:quota.scope||'unknown'},429,origin);
  if(quota?.allowed!==true)return output({error:'SEARCH_QUOTA_UNAVAILABLE'},503,origin);
  const jobs=[];
  if(openai&&provider!=='Anthropic')jobs.push({engine:'OpenAI',promise:queryAI('OpenAI',openai,f,target,action)});
  if(claude&&provider!=='OpenAI')jobs.push({engine:'Anthropic',promise:queryAI('Anthropic',claude,f,target,action)});
  const outcomes=await Promise.allSettled(jobs.map(x=>x.promise));
  // A provider returning JSON without a recorded web_search execution
  // is not a successful market search, even when its text looks plausible.
  const results=outcomes.filter(x=>x.status==='fulfilled'&&x.value?.searched===true).map(x=>x.value);
  const failedProviders=jobs.filter((x,i)=>outcomes[i].status==='rejected'||(outcomes[i].status==='fulfilled'&&outcomes[i].value?.searched!==true)).map(x=>x.engine);
  // Only coarse diagnostic categories: no prompts, API keys, identities or company data.
  const failures=[];
  for(let i=0;i<outcomes.length;i++){
   const outcome=outcomes[i];
   if(outcome.status==='rejected'){
    const reason=String(outcome.reason?.message||'').slice(0,100);
    const category=/^IA_HTTP_\d{3}$/.test(reason)?reason:/^IA_(TIMEOUT|FETCH_FAILURE|INVALID_JSON)$/.test(reason)?reason.slice(3):'UNKNOWN_FAILURE';
    failures.push({provider:jobs[i].engine,category});
    console.warn('[market-search] provider_failure',JSON.stringify({provider:jobs[i].engine,category}));
   }else if(outcome.value?.searched!==true){
    failures.push({provider:jobs[i].engine,category:'WEB_SEARCH_NOT_COMPLETED'});
    console.warn('[market-search] provider_failure',JSON.stringify({provider:jobs[i].engine,category:'WEB_SEARCH_NOT_COMPLETED'}));
   }
  }
  if(!results.length)return output({error:'AI_SEARCH_UNAVAILABLE',failedProviders,failures},502,origin);
  const partial=failedProviders.length>0;
  if(action==='signals'){
   const signals=combineSignals(results,target);
   // Não inserir eventos nas tabelas nem afetar score ou Pipeline.
   console.info('[market-search] signals_summary',JSON.stringify({
    completedProviders:results.length,...signals.diagnostico}));
   return output({action:'signals',sinais:signals.sinais,diagnostico:signals.diagnostico,
    providers:results.map(x=>x.engine),failedProviders,failures,partial,
    usage:results.map(x=>x.usage),retrievedAt:new Date().toISOString(),
    verifiedSignals:0,signalStatus:'HIPOTESES_COM_URL_CITADA',
    warning:'Sinais externos relatados pela IA e associados a URLs citadas. A ligação do evento com o CNPJ, a data e o conteúdo ainda exigem revisão humana. Não significa intenção de compra. Nenhum dado foi importado.'},200,origin);
  }
  const diagnostics={};
  // Um provedor pode mencionar outras empresas no texto. Nunca permitir que
  // elas contaminem uma investigação com CNPJ exato, nem herdar suas fontes.
  const focusedResults=target?results.map(r=>({...r,parsed:{empresas:
   (Array.isArray(r.parsed?.empresas)?r.parsed.empresas:[])
    .filter(entry=>cnpjReal(entry?.cnpj)===target.cnpj).slice(0,1)}})):results;
  const companies=combineAI(focusedResults,f.limit,f,diagnostics);
  console.info('[market-search] filtering_summary',JSON.stringify({completedProviders:results.length,...diagnostics}));
  return output({action,data:companies,diagnostics,
   source:'Pesquisa web OpenAI / Claude',
   providers:results.map(x=>x.engine),failedProviders,failures,partial,
   usage:results.map(x=>x.usage),retrievedAt:new Date().toISOString(),
   ...(target?{targetMatch:companies.length?'CNPJ_RELATADO_PELO_PROVEDOR':'CNPJ_NAO_CORROBORADO'}:{}),
   total:null,hasMore:target?false:null,coverage:'exploratoria',coverageStatus:'unknown',
   territoryVerified:false,warning:(partial?'Uma ou mais IAs nao concluiram a pesquisa; cobertura parcial. ':'')+
   (target?'Investigação adicional com pesquisa web independente. O CNPJ foi relatado pela IA, mas vínculo empresarial e fontes exigem revisão humana. ':
    'Pesquisa exploratoria; nao equivale ao universo integral de CNPJs. ')+
   'Nenhum registro foi importado.'},200,origin);
 }catch{return output({error:'SEARCH_UNAVAILABLE'},502,origin)}
});
