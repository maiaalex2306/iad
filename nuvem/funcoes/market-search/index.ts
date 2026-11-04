/* RI-M01 /market-search — consulta MANUAL read-only, sem credenciais no browser.
 * A funcao nao cria/atualiza contas, contatos nem oportunidades.
 * ECONODATA_API_KEY e segredo de servidor; sem ele: 503, nunca dados falsos.
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
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS')return new Response('',{status:204,headers:headers(origin)});
 if(req.method!=='POST')return output({error:'METHOD_NOT_ALLOWED'},405,origin);
 if(origin&&!ORIGINS.has(origin))return output({error:'ORIGIN_NOT_ALLOWED'},403,origin);
 if(Number(req.headers.get('content-length')||0)>12000)return output({error:'REQUEST_TOO_LARGE'},413,origin);
 const access=req.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9._-]{60,}$/.test(access))return output({error:'AUTH_REQUIRED'},401,origin);
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!anon)return output({error:'SERVER_NOT_CONFIGURED'},503,origin);
 try {
  const identity=await fetch(url+'/auth/v1/user',{headers:{Authorization:access,apikey:anon},signal:AbortSignal.timeout(6500)});
  if(!identity.ok)return output({error:'AUTH_REQUIRED'},401,origin);
  const user=await identity.json();if(!/^[0-9a-f-]{36}$/i.test(String(user?.id||'')))return output({error:'AUTH_REQUIRED'},401,origin);
  const profileRes=await fetch(url+'/rest/v1/perfis?select=tenant_id,papel,ativo&id=eq.'+encodeURIComponent(user.id)+'&limit=1',{headers:{Authorization:access,apikey:anon},signal:AbortSignal.timeout(6500)});
  if(!profileRes.ok)return output({error:'AUTH_SCOPE_UNAVAILABLE'},403,origin);
  const profile=(await profileRes.json())?.[0];
  if(!profile||profile.ativo===false||!['vendedor','gestor','admin'].includes(profile.papel)||(!profile.tenant_id&&profile.papel!=='admin'))
   return output({error:'AUTH_SCOPE_UNAVAILABLE'},403,origin);
  let body;try{body=await req.json()}catch{return output({error:'INVALID_JSON'},400,origin)}
  if(body?.action!=='search')return output({error:'SEARCH_ONLY'},400,origin);
  let f;try{f=filters(body.filters)}catch(e){return output({error:'INVALID_FILTERS',message:e.message},422,origin)}
  // DDD deve ser expandido por mapa territorial Anatel/IBGE, nunca por telefone.
  if(f.ddd&&!f.cidade&&!f.uf)return output({error:'DDD_MAPPING_PENDING',message:'DDD precisa de mapa de municipios antes da consulta. Informe cidade e UF.'},422,origin);
  const key=Deno.env.get('ECONODATA_API_KEY');
  if(!key)return output({error:'PROVIDER_NOT_CONFIGURED',message:'Pesquisa externa ainda nao configurada: a API empresarial precisa de credencial licenciada.'},503,origin);
  const providerFilters={};if(f.uf)providerFilters.uf=f.uf;if(f.cidade)providerFilters.cidade=f.cidade;if(f.cnae)providerFilters.cnaePrimario=f.cnae;if(f.segmento)providerFilters.segmento=f.segmento;if(f.porte)providerFilters.porte=f.porte;
  if(f.funcionariosMin!==null||f.funcionariosMax!==null)providerFilters.funcionarios={...(f.funcionariosMin!==null?{de:f.funcionariosMin}:{}),...(f.funcionariosMax!==null?{ate:f.funcionariosMax}:{})};
  if(f.faturamentoMin!==null||f.faturamentoMax!==null)providerFilters.faturamento={...(f.faturamentoMin!==null?{de:f.faturamentoMin}:{}),...(f.faturamentoMax!==null?{ate:f.faturamentoMax}:{})};
  const resp=await fetch('https://api.econodata.com.br/v4/companies/search_list',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({filtros:providerFilters,limit:f.limit}),signal:AbortSignal.timeout(18000)});
  if(!resp.ok)return output({error:'PROVIDER_UNAVAILABLE',status:resp.status},502,origin);
  const raw=await resp.json();let rows;try{rows=normalize(raw)}catch{return output({error:'PROVIDER_RESPONSE_UNKNOWN'},502,origin)}
  return output({data:rows,source:'Econodata',retrievedAt:new Date().toISOString(),limit:f.limit,
   total:Number.isFinite(Number(raw?.meta?.total))?Number(raw.meta.total):null,
   hasMore:Boolean(raw?.meta?.hasMore||raw?.pagination?.next)},200,origin);
 }catch{return output({error:'SEARCH_UNAVAILABLE'},502,origin)}
});
