/* RI-M01 / interface manual de mercado (pesquisa nunca roda no boot).
 * Nenhum resultado e importado; a revisao de duplicidades e somente leitura.
 */
import {normalizeMarketFilters,normalizeMarketCompanies,proposePipelineAction} from './market-contract.mjs';
const fields=[
 ['uf','UF (ex.: SP)','text'],['cidade','Cidade (ex.: Jacarei)','text'],['ddd','DDD (ex.: 012)','text'],
 ['regiao','Regiao','text'],['segmento','Segmento (ex.: quimico)','text'],['cnae','CNAE','text'],
 ['porte','Porte','text'],['funcionariosMin','Funcionarios min.','number'],['funcionariosMax','Funcionarios max.','number'],
 ['faturamentoMin','Faturamento min. R$','number'],['faturamentoMax','Faturamento max. R$','number']
];
export function mountMarketDiscovery({root,snapshot,scope,getScopeToken,nuvem}={}){
 if(!root||!root.ownerDocument||!snapshot||!scope||typeof getScopeToken!=='function'||!nuvem)throw Error('Sessao e dados autorizados obrigatorios');
 const doc=root.ownerDocument,els=new Map();let currentRequest=0,controller=null,selected=new Set();
 const valid=()=>root.isConnected&&getScopeToken()===scope.token;
 const el=(tag,text='',className='')=>{const n=doc.createElement(tag);n.textContent=String(text);if(className)n.className=className;return n};
 const form=doc.createElement('form'),grid=el('div','','grid'),status=el('p','Defina o mercado desejado e clique em BUSCAR. Nenhuma empresa sera incluida no CRM.','small muted');
 for(const [name,label,type] of fields){
  const holder=el('label',label,'campo'),input=doc.createElement('input');
  input.type=type;input.name=name;input.autocomplete='off';input.maxLength=150;
  if(type==='number'){input.min='0';input.step='1';}
  holder.appendChild(input);grid.appendChild(holder);els.set(name,input);
 }
 const btn=el('button','BUSCAR EMPRESAS','btn');btn.type='submit';
 const results=el('div','','iad-market-results'),review=el('div','','iad-market-review');
 form.appendChild(grid);form.appendChild(btn);
 root.replaceChildren(el('h2','Pesquisar empresas fora do CRM'),el('p','Pesquisa iniciada manualmente. Fontes, custos e cobertura dependem do provedor contratado. Os dados nao sao fatos confirmados ate verificacao.','small muted'),form,status,results,review);
 const show=(message)=>{if(valid())status.textContent=message;};
 function renderCompanies(data,source,asOf){
  if(!valid())return;
  selected.clear();review.replaceChildren();results.replaceChildren();
  results.appendChild(el('h3',data.length+' empresas encontradas na web · '+source));
  results.appendChild(el('p','Dados consultados em '+asOf+'. Esta pagina nao representa necessariamente todas as empresas da regiao.','small muted'));
  const snapshotNow=snapshot;
  for(const company of data){
   const plan=proposePipelineAction(company,snapshotNow,{tenantId:scope.tenantId,userId:scope.userId});
   const card=el('section','','card'),title=el('h4',(company.nome||company.razaoSocial)+' · '+company.cidade+'/'+company.uf);
   const statusMatch=plan.match.status==='existing'?'Ja cadastrada — CNPJ exato':plan.match.status==='related'?'Possivel matriz/filial':plan.match.status==='review'?'Revisar possivel duplicidade':'Nao cadastrada';
   card.appendChild(title);
   card.appendChild(el('p','CNPJ '+company.cnpj+' · '+(company.segmento||'Setor nao informado')+' · '+(company.porte||'Porte nao informado'),'small muted'));
   card.appendChild(el('p','Situacao CRM: '+statusMatch+(plan.existingOpportunityId?' · Ja existe oportunidade em Prospecção':''),'small'));
   card.appendChild(el('p','Funcionarios: '+(company.funcionarios===null?'indisponivel':String(company.funcionarios))+' (nao confirmado) · Faturamento: '+(company.faturamento===null?'indisponivel':String(company.faturamento))+' (nao confirmado)','small'));
   if(company.telefone)card.appendChild(el('p','Telefone corporativo informado: '+company.telefone,'small'));
   if(company.contatos.length){
    card.appendChild(el('h5','Contatos fornecidos pela fonte — confirmar antes de usar'));
    for(const c of company.contatos)card.appendChild(el('p',[c.nome,c.cargo,c.email,c.telefone].filter(Boolean).join(' · '),'small'));
   }else card.appendChild(el('p','Nenhum decisor validado pela fonte nesta consulta.','small muted'));
   if(company.noticias.length){for(const n of company.noticias)card.appendChild(el('p','Noticia: '+n.titulo+' · '+n.data,'small'));}
   else card.appendChild(el('p','Noticias e oportunidades especificas ainda nao verificadas.','small muted'));
   if(company.fontes.length) {
    card.appendChild(el('h5','Fontes consultadas — abrir para verificar'));
    for(const f of company.fontes.slice(0,8)) {
     const link=doc.createElement('a');link.href=f.url;link.target='_blank';link.rel='noopener noreferrer';
     link.textContent=(f.titulo||f.url);card.appendChild(link);card.appendChild(el('p',''));
    }
   }else card.appendChild(el('p','Sem fontes verificaveis: nao utilizar como fato.','small muted'));
   if(company.insights.length){card.appendChild(el('h5','Insights — hipoteses a investigar'));for(const insight of company.insights)card.appendChild(el('p',insight,'small'));}
   if(company.conflitos?.length){
    card.appendChild(el('h5','Divergencias entre IAs — verificar antes de qualificar'));
    for(const item of company.conflitos)card.appendChild(el('p',item.campo+': '+item.valorOriginal+' / '+item.valorDivergente+' ('+item.provedor+')','small'));
   }
   if(company.providers.length)card.appendChild(el('p','Pesquisado por: '+company.providers.join(' + '),'small muted'));
   const label=el('label','Selecionar para revisao comercial','campo'),check=doc.createElement('input');
   check.type='checkbox';check.disabled=plan.match.status==='review'&&!plan.match.accountId;
   check.addEventListener('change',()=>{if(!valid())return;if(check.checked)selected.add(company.cnpj);else selected.delete(company.cnpj);renderSelection(data);});
   label.prepend(check);card.appendChild(label);results.appendChild(card);
  }
 }
 function renderSelection(data){
  review.replaceChildren();
  review.appendChild(el('h3','Selecao: '+selected.size+' empresa(s)'));
  if(!selected.size)return;
  for(const c of data.filter(c=>selected.has(c.cnpj))){
   const plan=proposePipelineAction(c,snapshot,{tenantId:scope.tenantId,userId:scope.userId});
   review.appendChild(el('p',(c.nome||c.razaoSocial)+' — '+(plan.match.status==='new'?'Candidata nova':'Exige avaliacao do cadastro existente')+(plan.existingOpportunityId?' (oportunidade existente)':''),'small'));
  }
  review.appendChild(el('p','A integracao no Pipeline exige uma transacao autorizada e idempotente. Esta etapa prepara a revisao sem alterar a carteira ou o CAS.','small muted'));
 }
 form.addEventListener('submit',async ev=>{
  ev.preventDefault();if(!valid())return;
  let filters;try{filters=normalizeMarketFilters(Object.fromEntries([...els].map(([k,v])=>[k,v.value])));}catch(e){show(e.message);return;}
  const session=nuvem.sessao(),config=nuvem.config();
  if(!session?.access_token||!config?.url||!config?.chave){show('Autenticacao de nuvem necessaria para pesquisar empresas.');return;}
  if(controller)controller.abort();controller=new AbortController();const seq=++currentRequest;
  results.replaceChildren();review.replaceChildren();btn.disabled=true;show('Pesquisando sites e noticias com as IAs configuradas no IaD...');
  try{
   const response=await fetch(config.url.replace(/\/$/,'')+'/functions/v1/market-search',{method:'POST',
    headers:{'Content-Type':'application/json','apikey':config.chave,'Authorization':'Bearer '+session.access_token},
    body:JSON.stringify({action:'search',filters}),signal:controller.signal});
   const payload=await response.json();
   if(seq!==currentRequest||!valid())return;
   if(!response.ok){
    const messages={'AI_NOT_CONFIGURED':'Nenhum motor de IA habilitado para pesquisa no IaD.',
      'AI_SEARCH_UNAVAILABLE':'As IAs configuradas nao conseguiram consultar a web agora.',
      'SEARCH_QUOTA_EXCEEDED':'Limite diario de pesquisas atingido. Nao houve nova chamada as IAs.',
      'SEARCH_QUOTA_UNAVAILABLE':'Controle de quota indisponivel. Pesquisa interrompida sem consultar as IAs.',
      'DDD_MAPPING_PENDING':'O DDD precisa ser mapeado para municipios antes da pesquisa.'};
    show(payload?.message||messages[payload?.error]||'Pesquisa indisponivel: '+(payload?.error||response.status));return;
   }
   const companies=normalizeMarketCompanies(payload.data||[],{source:payload.source||'Nao identificada',retrievedAt:payload.retrievedAt||''});
   const unavailable=Array.isArray(payload.failedProviders)?payload.failedProviders.filter(p=>p==='OpenAI'||p==='Anthropic'):[];
   const partialWarning=payload.partial===true?('ATENCAO: pesquisa parcial. Falha em '+(unavailable.join(' e ')||'um provedor')+'. '):'';
   const usageText=Array.isArray(payload.usage)?payload.usage.filter(u=>u&&['OpenAI','Anthropic'].includes(u.provider)).map(u=>{
    const inTokens=Number.isSafeInteger(u.inputTokens)?u.inputTokens:'nao informado';
    const outTokens=Number.isSafeInteger(u.outputTokens)?u.outputTokens:'nao informado';
    const searches=Number.isSafeInteger(u.webSearchRequests)?u.webSearchRequests:'nao informado';
    return u.provider+': '+inTokens+' tokens entrada, '+outTokens+' saida, '+searches+' buscas web';
   }).join(' | '):'';
   show(partialWarning+'Pesquisa web exploratoria: '+companies.length+' empresas com fontes; nao representa todas as empresas da regiao. Nenhuma gravacao realizada.'+(usageText?' Consumo informado: '+usageText+'. Custo em R$ a apurar.':''));
   renderCompanies(companies,payload.source||'Fornecedor',payload.retrievedAt||'data nao fornecida');
  }catch(e){if(seq===currentRequest&&valid()&&e.name!=='AbortError')show('Falha de rede ao consultar fonte empresarial. Nenhuma alteracao no CRM.');}
  finally{if(seq===currentRequest&&valid())btn.disabled=false;}
 });
 return ()=>{if(controller)controller.abort();currentRequest++;};
}
