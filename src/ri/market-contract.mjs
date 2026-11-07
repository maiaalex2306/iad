/* RI-M01: contratos puros. Nenhuma consulta, importacao ou gravacao automatica. */
const str=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const folded=v=>str(v,300).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const digits=v=>String(v??'').replace(/\D/g,'');
const domain=v=>{const s=str(v,300).toLowerCase();try{return new URL(s.match(/^https?:\/\//)?s:'https://'+s).hostname.replace(/^www\./,'')}catch{return ''}};
// A URL citada pela IA pode ser aberta para revisão, nunca é prova independente.
// Bloquear esquema inseguro, credenciais e hosts internos mesmo com HTTPS.
export function isReviewableSourceURL(raw){
 if(typeof raw!=='string'||raw.length>500)return false;
 try{
  const u=new URL(raw.trim());
  if(u.protocol!=='https:'||!u.hostname||u.username||u.password||
     (u.port&&u.port!=='443'))return false;
  const host=u.hostname.toLowerCase().replace(/\.$/,'');
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
     host.endsWith('.internal')||host.endsWith('.lan')||
     host.endsWith('.home.arpa')||host.endsWith('.onion'))return false;
  if(host.startsWith('[')||/^[0-9.]+$/.test(host)||!host.includes('.'))return false;
  return true;
 }catch{return false;}
}

export function normalizeCnpj(raw){
 const v=String(raw??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(!/^[A-Z0-9]{12}[0-9]{2}$/.test(v)||/^([0-9A-Z])\1{11}/.test(v.slice(0,12)))return '';
 const digit=(s,w)=>{const mod=[...s].reduce((a,c,i)=>a+(c.charCodeAt(0)-48)*w[i],0)%11;return mod<2?'0':String(11-mod)};
 return v[12]===digit(v.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2])&&v[13]===digit(v.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2])?v:'';
}
function amount(v,name){if(v===undefined||v===null||v==='')return null;const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>1e12)throw Error(name+': valor invalido');return n;}
// Region/facet contract. The labels are the real Brazil DDD codes and
// employment ranges, never guessed from a business name or phone number.
export const UF_IBGE=Object.freeze({AC:12,AL:27,AP:16,AM:13,BA:29,CE:23,DF:53,ES:32,GO:52,MA:21,MT:51,MS:50,MG:31,PA:15,PB:25,PR:41,PE:26,PI:22,RJ:33,RN:24,RS:43,RO:11,RR:14,SC:42,SP:35,SE:28,TO:17});
export const MARKET_DDDS=Object.freeze([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99].map(String));
export const MARKET_BANDS=Object.freeze([
 {id:'0_10',label:'0 a 10',min:0,max:10},
 {id:'11_100',label:'11 a 100',min:11,max:100},
 {id:'101_200',label:'101 a 200',min:101,max:200},
 {id:'201_500',label:'201 a 500',min:201,max:500},
 {id:'501_1000',label:'501 a 1.000',min:501,max:1000},
 {id:'1001_5000',label:'1.001 a 5.000',min:1001,max:5000},
 {id:'5001_10000',label:'5.001 a 10.000',min:5001,max:10000},
 {id:'10001_plus',label:'Acima de 10.000',min:10001,max:null}
]);
const marketList=(v,name,max,fn)=>{
 if(v===undefined||v===null)return [];
 if(!Array.isArray(v)||v.length>max)throw Error(name+': selecao invalida');
 const out=v.map(fn);
 if(out.some(x=>x===null))throw Error(name+': item invalido');
 return [...new Map(out.map(x=>[typeof x==='string'?x:JSON.stringify(x),x])).values()];
};
export function normalizeMarketFilters(raw={}){
 const uf=str(raw.uf,2).toUpperCase(),cidade=str(raw.cidade,120),ddd=digits(raw.ddd).replace(/^0+(?=\d)/,''),regiao=str(raw.regiao,100),segmento=str(raw.segmento,120),cnae=digits(raw.cnae).slice(0,7),porte=str(raw.porte,60);
 if(uf&&!Object.hasOwn(UF_IBGE,uf))throw Error('UF invalida');
 if(ddd&&!MARKET_DDDS.includes(ddd))throw Error('DDD invalido');
 const municipios=marketList(raw.municipios,'Municipios',15,v=>{
  if(!v||typeof v!=='object'||Array.isArray(v))return null;
  const codigoIBGE=String(v.codigoIBGE??''),nome=str(v.nome,120),state=str(v.uf,2).toUpperCase();
  return /^\d{7}$/.test(codigoIBGE)&&nome&&state===uf&&Number(codigoIBGE.slice(0,2))===UF_IBGE[state]?{codigoIBGE,nome,uf:state}:null;
 });
 if(municipios.length&&cidade)throw Error('Cidade singular e municipios simultaneos');
 const ddds=marketList(raw.ddds,'DDDs',20,v=>{const c=digits(v).replace(/^0+(?=\d)/,'');return MARKET_DDDS.includes(c)?c:null});
 const segmentos=marketList(raw.segmentos,'Segmentos',12,v=>{const t=str(v,120);return t&&t.length>=2?t:null});
 const faixasFuncionarios=marketList(raw.faixasFuncionarios,'Faixas de funcionarios',8,v=>MARKET_BANDS.some(b=>b.id===v)?v:null);
 if(ddd&&ddds.length)throw Error('DDD singular e multiplos simultaneos');
 if(segmento&&segmentos.length)throw Error('Segmento singular e multiplos simultaneos');
 if(!uf&&!cidade&&!ddd&&!regiao&&!municipios.length&&!ddds.length)throw Error('Informe uma geografia: UF, cidade, DDD ou regiao');
 if(!segmento&&!segmentos.length&&!cnae)throw Error('Informe segmento ou CNAE');
 const funcionariosMin=amount(raw.funcionariosMin,'funcionarios'),funcionariosMax=amount(raw.funcionariosMax,'funcionarios');
 const faturamentoMin=amount(raw.faturamentoMin,'faturamento'),faturamentoMax=amount(raw.faturamentoMax,'faturamento');
 if(faixasFuncionarios.length&&(funcionariosMin!==null||funcionariosMax!==null))throw Error('Escolha faixas ou limites numericos, sem misturar');
 if(funcionariosMin!==null&&funcionariosMax!==null&&funcionariosMin>funcionariosMax)throw Error('Faixa de funcionarios invertida');
 if(faturamentoMin!==null&&faturamentoMax!==null&&faturamentoMin>faturamentoMax)throw Error('Faixa de faturamento invertida');
 const limit=raw.limit===undefined?20:Number(raw.limit);if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Limite por pagina deve estar entre 1 e 50');
 return {uf,cidade,ddd,regiao,segmento,cnae,porte,municipios,ddds,segmentos,faixasFuncionarios,funcionariosMin,funcionariosMax,faturamentoMin,faturamentoMax,limit};
}

export function matchCrmAccount(company,accounts,tenantId){
 if(!str(tenantId)||!Array.isArray(accounts))throw Error('Escopo de CRM invalido');
 const visible=accounts.filter(a=>a&&a.tenantId===tenantId),cnpj=normalizeCnpj(company?.cnpj);
 if(cnpj){
  const found=visible.find(a=>normalizeCnpj(a.cnpj)===cnpj);
  if(found)return {status:'existing',accountId:found.id,reason:'cnpj_exato'};
  const related=visible.find(a=>{const n=normalizeCnpj(a.cnpj);return n&&n.slice(0,8)===cnpj.slice(0,8)});
  if(related)return {status:'related',accountId:related.id,reason:'mesma_raiz_filial_distinta'};
 }
 const d=domain(company?.site),n=folded(company?.razaoSocial||company?.nome);
 const maybe=visible.find(a=>(d&&domain(a.site)===d)||(n&&folded(a.razaoSocial||a.nome)===n));
 if(maybe)return {status:'review',accountId:maybe.id,reason:'nome_ou_dominio_sem_identidade_exata'};
 return {status:cnpj?'new':'review',accountId:null,reason:cnpj?'cnpj_nao_encontrado':'cnpj_ausente_ou_invalido'};
}
export function normalizeMarketCompanies(companies,{source='',retrievedAt=''}={}){
 if(!Array.isArray(companies))throw Error('Resposta do provedor invalida');
 const seen=new Set(),output=[];
 for(const x of companies.slice(0,50)){
  if(!x||typeof x!=='object')continue;
  const rawCnpj=str(x.cnpj,40),cnpj=normalizeCnpj(rawCnpj);
  // A claimed but invalid identifier is never silently downgraded to pending.
  if(rawCnpj&&!cnpj)continue;
  const name=str(x.nome||x.nomeFantasia||x.razaoSocial);
  // Candidata exploratória sem fonte NÃO é descartada: permanece sem
  // status de validação, fora da shortlist qualificada e nunca importável.
  if(!cnpj&&!name)continue; // Preserva contratos antigos de CNPJ válido sem nome preenchido.
  const key=cnpj?'cnpj:'+cnpj:'pending:'+folded(name)+'|'+folded(x.cidade)+'|'+str(x.uf,2).toUpperCase();
  if(seen.has(key))continue;seen.add(key);
  const contacts=Array.isArray(x.contatos)?x.contatos.slice(0,15):[];
  // Never accept a user/LLM claim of "verified": only display
  // declared, pending, or requiring separate source review.
  const rawICP=x.qualificacaoICP&&typeof x.qualificacaoICP==='object'?x.qualificacaoICP:{};
  const validICP=new Set(['declarado','pendente','a_confirmar','nao_solicitado']);
  const qualificacaoICP={};
  for(const field of ['municipio','ddd','segmento','funcionarios'])
   qualificacaoICP[field]=validICP.has(rawICP[field])?rawICP[field]:'nao_solicitado';
  const stages=Object.values(qualificacaoICP).filter(x=>x!=='nao_solicitado');
  qualificacaoICP.statusGeral=stages.length&&stages.every(x=>x==='declarado')&&
   rawICP.statusGeral==='declarado_nao_verificado'?'declarado_nao_verificado':'pendente';
  output.push({cnpj,fonteStatus:Array.isArray(x.fontes)&&x.fontes.some(v=>isReviewableSourceURL(v?.url))?'citada_pelo_provedor':'pendente_sem_fonte',identidadeStatus:cnpj?'cnpj_validado':'pendente_cnpj',nome:name,razaoSocial:str(x.razaoSocial),
   cidade:str(x.cidade),uf:str(x.uf,2).toUpperCase(),segmento:str(x.segmento||x.cnaePrimario),cnae:str(x.cnae),porte:str(x.porte),site:str(x.site),telefone:str(x.telefone),
   qualificacaoICP,funcionarios:x.funcionarios??null,faixaFuncionariosStatus:['pendente','aderente_nao_verificado','nao_solicitado'].includes(x.faixaFuncionariosStatus)?x.faixaFuncionariosStatus:'nao_solicitado',faturamento:x.faturamento??null,faturamentoStatus:'nao_confirmado',funcionariosStatus:'nao_confirmado',
   source:str(source),retrievedAt:str(retrievedAt,40),
   fontes:Array.isArray(x.fontes)?x.fontes.slice(0,15).filter(v=>v&&/^https?:\/\//i.test(str(v.url,500))).map(v=>({url:str(v.url,500),titulo:str(v.titulo,180)})):[],
   providers:Array.isArray(x.providers)?x.providers.slice(0,3).filter(v=>v==='OpenAI'||v==='Anthropic'):[],
   territorioCorroborado:x.territorioCorroborado===true,
   conflitos:Array.isArray(x.conflitos)?x.conflitos.slice(0,12).filter(v=>v&&['cidade','uf','razaoSocial','segmento'].includes(v.campo)).map(v=>({campo:v.campo,valorOriginal:str(v.valorOriginal),valorDivergente:str(v.valorDivergente),provedor:str(v.provedor,30)})):[],
   contatos:contacts.filter(c=>c&&str(c.nome)).map(c=>({nome:str(c.nome),cargo:str(c.cargo),email:str(c.email,200),telefone:str(c.telefone,50),fonte:str(c.fonte||source)})),
   noticias:Array.isArray(x.noticias)?x.noticias.slice(0,10).map(y=>({titulo:str(y.titulo),url:str(y.url,300),data:str(y.data,40)})):[],
   insights:Array.isArray(x.insights)?x.insights.slice(0,8).map(v=>str(v,300)):[]
  });
 }
 return output;
}
export function proposePipelineAction(company,snapshot,scope){
 if(!str(scope?.tenantId)||!str(scope?.userId))throw Error('Escopo autenticado de empresa obrigatorio');
 const match=matchCrmAccount(company,snapshot?.contas||[],scope.tenantId);
 const opportunities=(snapshot?.oportunidades||[]).filter(o=>o&&o.tenantId===scope.tenantId&&o.contaId===match.accountId);
 return {operation:match.status==='new'?'review_new':'review_existing',match,
 existingOpportunityId:opportunities.find(o=>o.etapa==='Prospecção')?.id||null,
 requiresExplicitConfirmation:true,writePerformed:false};
}
/**
 * Build a reviewed, single-company transactional import request.
 * This is only a command payload; the server must independently validate
 * JWT ownership, tenant, CNPJ checksum, deduplication and idempotency.
 * Contacts are deliberately not imported automatically.
 */
export function buildMarketImportRequest(company,snapshot,scope,requestId){
 const plan=proposePipelineAction(company,snapshot,scope);
 if(plan.match.status!=='new')throw Error('Empresa ja cadastrada ou exige revisao de duplicidade.');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId||'')))
  throw Error('Identificador da importacao invalido.');
 if(Array.isArray(company?.conflitos)&&company.conflitos.length)
  throw Error('Divergencias entre IAs exigem revisao antes da importacao.');
 if(!normalizeCnpj(company?.cnpj))throw Error('CNPJ invalido.');
 const fontes=(Array.isArray(company?.fontes)?company.fontes:[])
  .slice(0,8).map(x=>({url:str(x?.url,400),titulo:str(x?.titulo,160)}))
  .filter(x=>isReviewableSourceURL(x.url));
 if(!fontes.length)throw Error('Fonte HTTPS obrigatoria antes da importacao.');
 const uf=str(company?.uf,2).toUpperCase(),cidade=str(company?.cidade,120),segmento=str(company?.segmento,120);
 if(!/^[A-Z]{2}$/.test(uf)||!cidade||!segmento||!str(company?.nome||company?.razaoSocial))
  throw Error('Dados de identidade e localizacao exigem revisao.');
 return {
  p_tenant:scope.tenantId,p_request_id:requestId,p_confirmed:true,
  p_empresa:{cnpj:normalizeCnpj(company.cnpj),nome:str(company.nome||company.razaoSocial),
   razaoSocial:str(company.razaoSocial),cidade,uf,segmento,porte:str(company.porte,70),
   site:str(company.site,200),telefone:str(company.telefone,50),fontes}
 };
}
