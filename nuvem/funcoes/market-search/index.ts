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
function filters(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Filtros ausentes');
 const uf=str(raw.uf,2).toUpperCase(),cidade=str(raw.cidade),regiao=str(raw.regiao),ddd=digits(raw.ddd).replace(/^0+(?=\d)/,''),segmento=str(raw.segmento),cnae=digits(raw.cnae).slice(0,7),porte=str(raw.porte,40);
 if(uf&&!/^[A-Z]{2}$/.test(uf))throw Error('UF invalida');
 if(ddd&&!/^\d{2}$/.test(ddd))throw Error('DDD invalido');
 if(!uf&&!cidade&&!regiao&&!ddd)throw Error('Informe territorio');
 if(!segmento&&!cnae)throw Error('Informe segmento ou CNAE');
 const funcionariosMin=number(raw.funcionariosMin,1e9),funcionariosMax=number(raw.funcionariosMax,1e9),faturamentoMin=number(raw.faturamentoMin),faturamentoMax=number(raw.faturamentoMax);
 if(funcionariosMax!==null&&funcionariosMin!==null&&funcionariosMax<funcionariosMin)throw Error('Faixa de empregados invertida');
 if(faturamentoMax!==null&&faturamentoMin!==null&&faturamentoMax<faturamentoMin)throw Error('Faixa de faturamento invertida');
 const limit=raw.limit===undefined?20:Number(raw.limit);if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Limite 1 a 50');
 return {uf,cidade,regiao,ddd,segmento,cnae,porte,funcionariosMin,funcionariosMax,faturamentoMin,faturamentoMax,limit};
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
function prompt(f) {
 return 'PESQUISE NA WEB empresas reais com recorte '+JSON.stringify(f)+'. Busque sites corporativos, bases publicas e noticias. Responda somente JSON com chave empresas (array): cada empresa possui cnpj, razaoSocial, nome, cidade, uf, segmento, porte, site, telefone, funcionarios, faturamento, fontes:[{url,titulo}], contatos:[{nome,cargo,email,telefone,fonte}], noticias:[{titulo,url,data}], insights:[]. Somente CNPJ e URLs encontrados e citados na web. Valores nao encontrados=null. NUNCA invente empresa ou pessoa. Para DDD/regiao pesquisa e exploratoria, sem promessa de cobertura total. Maximo '+f.limit+' empresas.';
}
async function queryAI(engine,key,f) {
 const instructions='Pesquisador B2B: use sempre a ferramenta web_search, inclua URLs citadas e retorne JSON sem inventar fatos.';
 let uri,headers,body;
 if(engine==='OpenAI') {
  uri='https://api.openai.com/v1/responses';headers={authorization:'Bearer '+key,'content-type':'application/json'};
  body={model:Deno.env.get('IA_MODELO_PESQUISA_OPENAI')||Deno.env.get('IA_MODELO_OPENAI')||'gpt-5',instructions,input:prompt(f),tools:[{type:'web_search',search_context_size:'medium'}],tool_choice:'required',max_tool_calls:2,max_output_tokens:3500,store:false};
 } else {
  uri='https://api.anthropic.com/v1/messages';headers={'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json'};
  body={model:Deno.env.get('IA_MODELO_PESQUISA_ANTHROPIC')||Deno.env.get('IA_MODELO_ANTHROPIC')||'claude-opus-5',system:instructions,max_tokens:3500,messages:[{role:'user',content:prompt(f)}],tools:[{type:'web_search_20250305',name:'web_search',max_uses:2}]};
 }
 const resp=await fetch(uri,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(35000)});
 if(!resp.ok)throw Error('IA_SEARCH_FAILED');
 return aiSummary(await resp.json(),engine);
}
// Filter only explicit geographic contradictions; missing fields remain unverified.
function normalizedPlace(value) {
 return str(value,120).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
}
function inRequestedPlace(entry,f) {
 if(f.uf && entry.uf && normalizedPlace(entry.uf)!==normalizedPlace(f.uf))return false;
 if(f.cidade && entry.cidade && normalizedPlace(entry.cidade)!==normalizedPlace(f.cidade))return false;
 return true;
}
function combineAI(results,limit,f) {
 const out=new Map();
 for(const r of results){
  if(!r.searched)continue;
  const list=Array.isArray(r.parsed.empresas)?r.parsed.empresas:[];
  for(const entry of list.slice(0,limit)){
   if(!entry||typeof entry!=='object')continue;
   if(!inRequestedPlace(entry,f))continue;
   const cnpj=cnpjReal(entry.cnpj);if(!cnpj)continue;
   const sources=(Array.isArray(entry.fontes)?entry.fontes:[]).map(f=>({url:canonicalUrl(f.url),titulo:str(f.titulo,150)})).filter(f=>f.url&&r.urls.has(f.url));
   if(!sources.length)continue;
   const urls=new Set(sources.map(f=>f.url));
   const contatos=(Array.isArray(entry.contatos)?entry.contatos:[]).filter(c=>c&&urls.has(canonicalUrl(c.fonte))).slice(0,10).map(c=>({nome:str(c.nome),cargo:str(c.cargo),email:str(c.email,180),telefone:str(c.telefone,60),fonte:canonicalUrl(c.fonte)}));
   const noticias=(Array.isArray(entry.noticias)?entry.noticias:[]).filter(n=>n&&urls.has(canonicalUrl(n.url))).slice(0,6).map(n=>({titulo:str(n.titulo),url:canonicalUrl(n.url),data:str(n.data,40)}));
   const existing=out.get(cnpj);
   if(existing){
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
   out.set(cnpj,{cnpj,razaoSocial:str(entry.razaoSocial||entry.nome),nome:str(entry.nome||entry.razaoSocial),cidade:str(entry.cidade),uf:str(entry.uf,2).toUpperCase(),porte:str(entry.porte),segmento:str(entry.segmento),site:str(entry.site,200),telefone:str(entry.telefone,60),funcionarios:entry.funcionarios??null,faturamento:entry.faturamento??null,contatos,noticias,insights:Array.isArray(entry.insights)?entry.insights.slice(0,6).map(s=>str(s,250)):[],fontes:sources,providers:[r.engine],conflitos:[],territorioCorroborado:false});
  }
 }
 return [...out.values()].slice(0,limit);
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
  if(url==='https://drhonmdffhnwamwzynrs.supabase.co'&&profile.papel!=='admin')
   return output({error:'PILOT_ADMIN_ONLY'},403,origin);
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
  if(body?.action!=='search')return output({error:'SEARCH_ONLY'},400,origin);
  let f;try{f=filters(body.filters)}catch(e){return output({error:'INVALID_FILTERS',message:e.message},422,origin)}
  const openai=aiKey('openai'),claude=aiKey('anthropic');
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
  if(openai)jobs.push({engine:'OpenAI',promise:queryAI('OpenAI',openai,f)});
  if(claude)jobs.push({engine:'Anthropic',promise:queryAI('Anthropic',claude,f)});
  const outcomes=await Promise.allSettled(jobs.map(x=>x.promise));
  // A provider returning JSON without a recorded web_search execution
  // is not a successful market search, even when its text looks plausible.
  const results=outcomes.filter(x=>x.status==='fulfilled'&&x.value?.searched===true).map(x=>x.value);
  const failedProviders=jobs.filter((x,i)=>outcomes[i].status==='rejected'||(outcomes[i].status==='fulfilled'&&outcomes[i].value?.searched!==true)).map(x=>x.engine);
  if(!results.length)return output({error:'AI_SEARCH_UNAVAILABLE',failedProviders},502,origin);
  const partial=failedProviders.length>0;
  return output({data:combineAI(results,f.limit,f),source:'Pesquisa web OpenAI / Claude',providers:results.map(x=>x.engine),failedProviders,partial,usage:results.map(x=>x.usage),retrievedAt:new Date().toISOString(),total:null,hasMore:null,coverage:'exploratoria',coverageStatus:'unknown',territoryVerified:false,warning:(partial?'Uma ou mais IAs nao concluiram a pesquisa; cobertura parcial. ':'')+'Pesquisa exploratoria; nao equivale ao universo integral de CNPJs. Nenhum registro foi importado.'},200,origin);
 }catch{return output({error:'SEARCH_UNAVAILABLE'},502,origin)}
});
