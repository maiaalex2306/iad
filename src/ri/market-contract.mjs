/* RI-M01: contratos puros. Nenhuma consulta, importacao ou gravacao automatica. */
const str=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const folded=v=>str(v,300).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const digits=v=>String(v??'').replace(/\D/g,'');
const domain=v=>{const s=str(v,300).toLowerCase();try{return new URL(s.match(/^https?:\/\//)?s:'https://'+s).hostname.replace(/^www\./,'')}catch{return ''}};
export function normalizeCnpj(raw){
 const v=String(raw??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(!/^[A-Z0-9]{12}[0-9]{2}$/.test(v)||/^([0-9A-Z])\1{11}/.test(v.slice(0,12)))return '';
 const digit=(s,w)=>{const mod=[...s].reduce((a,c,i)=>a+(c.charCodeAt(0)-48)*w[i],0)%11;return mod<2?'0':String(11-mod)};
 return v[12]===digit(v.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2])&&v[13]===digit(v.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2])?v:'';
}
function amount(v,name){if(v===undefined||v===null||v==='')return null;const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>1e12)throw Error(name+': valor invalido');return n;}
export function normalizeMarketFilters(raw={}){
 const uf=str(raw.uf,2).toUpperCase(),cidade=str(raw.cidade,120),ddd=digits(raw.ddd).replace(/^0+(?=\d)/,''),regiao=str(raw.regiao,100),segmento=str(raw.segmento,120),cnae=digits(raw.cnae).slice(0,7),porte=str(raw.porte,60);
 if(uf&&!/^[A-Z]{2}$/.test(uf))throw Error('UF invalida');
 if(ddd&&!/^\d{2}$/.test(ddd))throw Error('DDD deve ter 2 digitos');
 if(!uf&&!cidade&&!ddd&&!regiao)throw Error('Informe uma geografia: UF, cidade, DDD ou regiao');
 if(!segmento&&!cnae)throw Error('Informe segmento ou CNAE');
 const funcionariosMin=amount(raw.funcionariosMin,'funcionarios'),funcionariosMax=amount(raw.funcionariosMax,'funcionarios');
 const faturamentoMin=amount(raw.faturamentoMin,'faturamento'),faturamentoMax=amount(raw.faturamentoMax,'faturamento');
 if(funcionariosMin!==null&&funcionariosMax!==null&&funcionariosMin>funcionariosMax)throw Error('Faixa de funcionarios invertida');
 if(faturamentoMin!==null&&faturamentoMax!==null&&faturamentoMin>faturamentoMax)throw Error('Faixa de faturamento invertida');
 const limit=raw.limit===undefined?20:Number(raw.limit);if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('Limite por pagina deve estar entre 1 e 50');
 return {uf,cidade,ddd,regiao,segmento,cnae,porte,funcionariosMin,funcionariosMax,faturamentoMin,faturamentoMax,limit};
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
  const cnpj=normalizeCnpj(x.cnpj);if(!cnpj||seen.has(cnpj))continue;seen.add(cnpj);
  const contacts=Array.isArray(x.contatos)?x.contatos.slice(0,15):[];
  output.push({cnpj,nome:str(x.nome||x.nomeFantasia||x.razaoSocial),razaoSocial:str(x.razaoSocial),
   cidade:str(x.cidade),uf:str(x.uf,2).toUpperCase(),segmento:str(x.segmento||x.cnaePrimario),cnae:str(x.cnae),porte:str(x.porte),site:str(x.site),telefone:str(x.telefone),
   funcionarios:x.funcionarios??null,faturamento:x.faturamento??null,faturamentoStatus:'nao_confirmado',funcionariosStatus:'nao_confirmado',
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