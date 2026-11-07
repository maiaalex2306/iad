/* RI-M01 / interface manual de mercado (pesquisa nunca roda no boot).
 * Nenhum resultado e importado; a revisao de duplicidades e somente leitura.
 */
import {normalizeMarketFilters,normalizeMarketCompanies,proposePipelineAction,buildMarketImportRequest,isReviewableSourceURL,UF_IBGE,MARKET_DDDS,MARKET_BANDS} from './market-contract.mjs';
import {buildProspectWorkflow} from './prospect-agents.mjs';
import {mountMarketInvestigation} from './market-investigation.mjs';
import {mountMarketSignals} from './market-signals.mjs';
import {mountMarketEnricher} from './market-enricher.mjs';
import {mountMarketResearchMetrics} from './market-audit.mjs';
import {interpretSector} from './sector-intelligence.mjs';
import {verifyMarketTenantScope,marketTenantMessage} from './market-tenant-scope.mjs';
import {marketCityCacheForDocument} from './market-city-cache.mjs';
import {mountMarketSearchProgress} from './market-progress.mjs';
/**
 * Pull only the server-confirmed RI-M01 import into the local Pipeline.
 * Never upload local edits. Refuse the pull when CAS/pending state is unknown.
 * The server transaction remains committed even if local refresh fails.
 */
export async function refreshMarketPipelineAfterImport({nuvem,importedCount,valid,tenantId,importedIds,getSnapshot}={}){
 if(!Number.isSafeInteger(importedCount)||importedCount<1)return {status:'unchanged',serverCommitted:false};
 if(typeof valid!=='function'||!valid())return {status:'pending',serverCommitted:true};
 if(!nuvem||typeof nuvem.puxar!=='function'||
    typeof nuvem.diagnosticoPendenciasCAS!=='function'||
    typeof nuvem.haMudancas!=='function')return {status:'pending',serverCommitted:true};
 try{
  const cas=nuvem.diagnosticoPendenciasCAS();
  if(!cas||cas.disponivel!==true||!Number.isSafeInteger(cas.quantidade)||cas.quantidade>0||
     nuvem.haMudancas())return {status:'pending',serverCommitted:true};
  if(!valid())return {status:'pending',serverCommitted:true};
  await nuvem.puxar();
  if(!valid())return {status:'pending',serverCommitted:true};
  // A successful HTTP pull is not evidence that the imported records
  // reached this tenant's local portfolio. Verify both entity types.
  if(Array.isArray(importedIds)&&importedIds.length){
   if(!tenantId||typeof getSnapshot!=='function')return {status:'pending',serverCommitted:true};
   const current=getSnapshot();
   if(!current||!Array.isArray(current.contas)||!Array.isArray(current.oportunidades))
    return {status:'pending',serverCommitted:true};
   const visible=importedIds.every(({accountId,opportunityId})=>
    typeof accountId==='string'&&!!accountId&&typeof opportunityId==='string'&&!!opportunityId&&
    current.contas.some(x=>x?.id===accountId&&x.tenantId===tenantId)&&
    current.oportunidades.some(x=>x?.id===opportunityId&&x.contaId===accountId&&x.tenantId===tenantId)
   );
   if(!visible)return {status:'pending',serverCommitted:true};
  }
  return {status:'synced',serverCommitted:true};
 }catch{
  return {status:'pending',serverCommitted:true};
 }
}
// Advanced legacy criteria remain supported without mixing singular and
// multiple filters. City/DDD/segments and employees use the new facet contract.
const fields=[
 ['regiao','Regiao','text'],['cnae','CNAE','text'],
 ['porte','Porte','text'],['faturamentoMin','Faturamento min. R$','number'],
 ['faturamentoMax','Faturamento max. R$','number']
];
export function mountMarketDiscovery({root,snapshot,scope,getScopeToken,nuvem,getSnapshot}={}){
 if(!root||!root.ownerDocument||!snapshot||!scope||typeof getScopeToken!=='function'||!nuvem)throw Error('Sessao e dados autorizados obrigatorios');
 const doc=root.ownerDocument,els=new Map();let currentRequest=0,controller=null,selected=new Set(),importKeys=new Map(),importing=false;
 const cancelInvestigations=new Set();
 const valid=()=>root.isConnected&&getScopeToken()===scope.token;
 const el=(tag,text='',className='')=>{const n=doc.createElement(tag);n.textContent=String(text);if(className)n.className=className;return n};
 root.classList.add('iad-market-ui');
 const form=doc.createElement('form'),grid=el('div','','grid'),status=el('p','Selecione o territorio, o segmento e as faixas de funcionarios. Nada sera importado automaticamente.','small muted');
 grid.className='iad-market-filter-grid';status.setAttribute('role','status');
 // Every picker derives its options from a versioned source, never free text.
 function picker(label,placeholder,limit=15){
  const wrapper=el('div','','campo iad-market-filter'),title=el('span',label,'iad-market-filter-label'),details=doc.createElement('details'),summary=doc.createElement('summary'),search=doc.createElement('input'),options=el('div','','market-options'),panel=el('div','','iad-market-picker-panel');
  details.className='iad-market-picker';
  summary.textContent=placeholder;
  search.type='search';search.placeholder='Filtrar opções';search.autocomplete='off';search.setAttribute('aria-label','Filtrar '+label);
  panel.append(search,options);details.append(summary,panel);wrapper.append(title,details);
  details.addEventListener('toggle',()=>{if(details.open){for(const d of root.querySelectorAll('.iad-market-picker[open]'))if(d!==details)d.open=false;}});
  let items=[],chosen=new Map();
  function render(){
   summary.textContent=chosen.size?chosen.size+' selecionado(s): '+[...chosen.values()].slice(0,2).map(x=>x.label).join(', ')+(chosen.size>2?'…':''):placeholder;
   summary.title=summary.textContent;
   options.replaceChildren();
   const term=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
   const exact=items.filter(x=>x.label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(term));
   // RI-M14: a palavra usada pelo mercado pode diferir do rótulo oficial.
   // Mostrar correspondências como SUGESTÃO; nunca selecionar automaticamente.
   const suggested=new Set();
   if(label==='Segmentos cadastrados'&&term.length>=3){
    const semantic=interpretSector(search.value,{allowedNames:items.map(x=>x.label),limit:5});
    for(const c of semantic.candidates){
     const item=items.find(x=>x.label===c.name);
     if(item&&!exact.some(x=>x.key===item.key))suggested.add(item.key);
    }
   }
   const shown=[...exact,...items.filter(x=>suggested.has(x.key))].slice(0,65);
   if(!shown.length)options.appendChild(el('span','Nenhuma opcao encontrada','small muted'));
   for(const item of shown){
    const lbl=el('label','','campo'),input=doc.createElement('input');
    input.type='checkbox';input.checked=chosen.has(item.key);
    input.addEventListener('change',()=>{
     if(input.checked&&chosen.size>=limit){input.checked=false;show('Limite de '+limit+' opcoes nesse filtro.');return;}
     if(input.checked)chosen.set(item.key,item);else chosen.delete(item.key);
     render();
    });
    lbl.className='iad-market-option';
    lbl.append(input,doc.createTextNode(item.label+(suggested.has(item.key)?' · nome relacionado (revisar)':'')));options.appendChild(lbl);
   }
   if(items.length>65&&!term)options.appendChild(el('span','Digite para localizar outras opcoes.','small muted'));
  }
  search.addEventListener('input',render);
  return {wrapper,get:()=>[...chosen.values()],getItems:()=>[...items],setItems(next){
   items=next;const keys=new Set(items.map(x=>x.key));chosen=new Map([...chosen].filter(([k])=>keys.has(k)));render();
  },choose(keys){const wanted=new Set(keys);chosen=new Map(items.filter(x=>wanted.has(x.key)).slice(0,limit).map(x=>[x.key,x]));render();},clear(){chosen.clear();render();}};
 }
 const ufBox=el('label','Estado (UF)','campo iad-market-filter'),ufSelect=doc.createElement('select');
 ufSelect.name='uf';const emptyState=doc.createElement('option');emptyState.value='';emptyState.textContent='Selecione o estado';ufSelect.appendChild(emptyState);
 for(const uf of Object.keys(UF_IBGE).sort()){const opt=doc.createElement('option');opt.value=uf;opt.textContent=uf;ufSelect.appendChild(opt);}
 ufBox.appendChild(ufSelect);
 const cityPick=picker('Cidades (codigos IBGE)','Selecione uma ou mais cidades',15),dddPick=picker('DDDs','Selecione um ou mais DDDs',20),segmentPick=picker('Segmentos cadastrados','Selecione um ou mais segmentos',12),bandPick=picker('Faixas de funcionarios','Selecione uma ou mais faixas',8);
 dddPick.setItems(MARKET_DDDS.map(k=>({key:k,label:'DDD '+k,value:k})));
 bandPick.setItems(MARKET_BANDS.map(b=>({key:b.id,label:b.label,value:b.id})));
 const tenantSegments=Array.isArray(snapshot.segmentos)?snapshot.segmentos.filter(x=>x&&x.tenantId===scope.tenantId&&x.ativo!==false):[];
 const segmentSeen=new Set();
 segmentPick.setItems(tenantSegments.filter(x=>{const n=String(x.nome||'').trim();if(!n||segmentSeen.has(n.toLowerCase()))return false;segmentSeen.add(n.toLowerCase());return true;}).map(x=>({key:String(x.nome),label:String(x.nome),value:String(x.nome)})).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR')));
 let cityRequest=null,cityLoading=false;
 const cityCache=marketCityCacheForDocument(doc);
 async function loadCities(uf){
  cityPick.clear();cityPick.setItems([]);
  if(cityRequest){cityRequest.abort();cityRequest=null;}
  cityLoading=false;
  if(!uf)return [];
  const cached=cityCache.get(uf);
  if(cached&&valid()&&ufSelect.value===uf){
   cityPick.setItems(cached);
   show(cached.length+' municípios reutilizados do catálogo público da sessão. Selecione as cidades.');
   return cached;
  }
  const request=new AbortController();cityRequest=request;cityLoading=true;
  show('Consultando municipios oficiais do IBGE para '+uf+'…');
  try{
   // The public IBGE endpoint can be temporarily unavailable. A second
   // IBGE-derived catalog avoids blocking the entire region selector.
   let rows=[],source='IBGE';
   try{
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(9500)]);
    const res=await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados/'+UF_IBGE[uf]+'/municipios?orderBy=nome',{signal});
    if(!res.ok)throw Error('IBGE HTTP '+res.status);
    rows=await res.json();
    if(!Array.isArray(rows)||!rows.length)throw Error('IBGE vazio');
   }catch(error){
    if(request.signal.aborted)return [];
    source='BrasilAPI (dados IBGE)';
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(9500)]);
    const response=await fetch('https://brasilapi.com.br/api/ibge/municipios/v1/'+uf,{signal});
    if(!response.ok)throw Error('BrasilAPI HTTP '+response.status);
    const fallback=await response.json();
    if(!Array.isArray(fallback)||!fallback.length)throw Error('Catalogo alternativo vazio');
    rows=fallback.map(x=>({...x,id:Number(String(x.codigo_ibge||'').slice(0,7))}));
   }
   if(rows.length>2000)throw Error('Catalogo municipal inesperado');
   const seen=new Set();
   const items=rows.filter(x=>{
    const id=String(x?.id||''),nome=String(x?.nome||'').trim();
    if(!/^\d{7}$/.test(id)||!id.startsWith(String(UF_IBGE[uf]))||!nome||seen.has(id))return false;
    seen.add(id);return true;
   }).map(x=>({key:String(x.id),label:x.nome,value:{codigoIBGE:String(x.id),nome:x.nome,uf}})).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'));
   if(!items.length)throw Error('Nenhum municipio valido');
   if(ufSelect.value!==uf||!valid())return [];
   cityCache.put(uf,items);cityPick.setItems(items);show(items.length+' municipios carregados via '+source+'. Selecione as cidades.');
   return items;
  }catch(error){
   if(error?.name!=='AbortError'&&ufSelect.value===uf&&valid())show('Nao foi possivel carregar o catalogo oficial de municipios. Tente selecionar o estado novamente.',{error:true});
   return [];
  }finally{if(cityRequest===request)cityLoading=false;}
 }
 ufSelect.addEventListener('change',()=>{loadCities(ufSelect.value);});
 const demoBtn=el('button','Aplicar exemplo','btn iad-market-btn-example');
 demoBtn.type='button';
 demoBtn.addEventListener('click',async()=>{
  // Não consultar IBGE quando tenant/catálogo ainda não autorizam a busca.
  if(!catalogReady){show(catalogBlockReason);return;}
  ufSelect.value='SP';const cities=await loadCities('SP');
  const mogi=cities.find(x=>x.label==='Mogi das Cruzes');
  if(!mogi){show('Nao foi possivel validar Mogi das Cruzes no catalogo de municipios. Exemplo nao aplicado.');return;}
  cityPick.choose([mogi.key]);
  dddPick.choose(['11']);
  const selected=segmentPick.getItems().find(x=>/qu[ií]mic/i.test(x.label));
  if(selected)segmentPick.choose([selected.key]);
  bandPick.choose(['201_500','501_1000']);
  aiSelect.value='both';
  show('Exemplo aplicado: Mogi das Cruzes, DDD 11 e filtros selecionados. Revise o segmento e clique em Buscar empresas.');
 });
 const advanced=doc.createElement('details'),advancedGrid=el('div','','grid');
 advanced.className='iad-market-advanced';
 const advancedHead=doc.createElement('summary');advancedHead.textContent='Filtros avancados (regiao, CNAE, porte e faturamento)';advanced.append(advancedHead,advancedGrid);
 advancedGrid.className='iad-market-advanced-grid';
 for(const [name,label,type] of fields){
  const holder=el('label',label,'campo'),input=doc.createElement('input');input.type=type;input.name=name;input.autocomplete='off';input.maxLength=150;
  if(type==='number'){input.min='0';input.step='1';}
  holder.appendChild(input);advancedGrid.appendChild(holder);els.set(name,input);
 }
 grid.append(ufBox,cityPick.wrapper,dddPick.wrapper,segmentPick.wrapper,bandPick.wrapper,advanced);
 if(!tenantSegments.length)status.textContent='Nenhum segmento autorizado encontrado na carteira. Consulte o cadastro de segmentos.';
 const aiHolder=el('label','Motor de pesquisa','campo iad-market-engine'),aiSelect=doc.createElement('select');
 for(const [value,label] of [['both','ChatGPT + Claude'],['OpenAI','Somente ChatGPT'],['Anthropic','Somente Claude']]){
  const option=doc.createElement('option');option.value=value;option.textContent=label;aiSelect.appendChild(option);
 }
 aiHolder.appendChild(aiSelect);aiSelect.value='both';
 const limitHolder=el('label','Candidatas por pesquisa (teto, não cobertura)','campo iad-market-engine');
 const batchLimit=doc.createElement('select');
 for(const [size,label] of [[20,'Até 20 — pesquisa rápida'],[50,'Até 50 — exploração ampliada']]){
  const opt=doc.createElement('option');opt.value=String(size);opt.textContent=label;batchLimit.appendChild(opt);
 }
 batchLimit.value='20';limitHolder.appendChild(batchLimit);
 const preflightBtn=el('button','Verificar acesso às IAs','btn iad-market-btn-check');
 preflightBtn.type='button';
 const btn=el('button','Buscar empresas','btn iad-market-btn-search');btn.type='submit';
 const results=el('div','','iad-market-results'),review=el('div','','iad-market-review');
 const actions=el('div','','iad-market-actions'),actionButtons=el('div','','iad-market-action-buttons');
  actionButtons.append(demoBtn,preflightBtn,btn);actions.append(aiHolder,limitHolder,actionButtons);
  form.append(grid,actions);
 root.replaceChildren(el('h2','Pesquisar empresas fora do CRM'),el('p','Pesquisa iniciada manualmente. Fontes, custos e cobertura dependem do provedor contratado. Os dados nao sao fatos confirmados ate verificacao.','small muted'),form,status,results,review);
 const progress=mountMarketSearchProgress({doc,host:root});
  const closePickers=(event)=>{for(const d of root.querySelectorAll('.iad-market-picker[open]')){if(event.type==='keydown'&&event.key==='Escape')d.open=false;else if(event.type==='pointerdown'&&!d.contains(event.target))d.open=false;}};
  doc.addEventListener('pointerdown',closePickers);doc.addEventListener('keydown',closePickers);
 const stopResearchMetrics=mountMarketResearchMetrics({root,doc,nuvem,valid});
 const show=(message,{error=null}={})=>{if(valid()){
  status.textContent=message;
  const isError=error===null?/nao foi|não foi|indispon|erro|inválid|inval|autoriza|bloquead|falha/i.test(message):Boolean(error);
  status.classList.toggle('iad-market-error',isError);
 }};
  // RI-M12: the API authorizes segments using the LIVE tenant catalog, not
  // the stale Store snapshot. Populate the facet from the same source before
  // allowing a paid request; never bypass server-side validation.
  const catalogController=new AbortController();
  let catalogReady=false,catalogBlockReason='Aguarde a validação do catálogo e da empresa autenticada.';
  btn.disabled=true;
  (async()=>{
   const session=nuvem.sessao(),cfg=nuvem.config();
   if(!session?.access_token||!cfg?.url||!cfg?.chave){
    catalogBlockReason='Conecte-se à nuvem para validar o catálogo de segmentos.';show(catalogBlockReason);return;
   }
   show('Conferindo segmentos autorizados desta empresa no servidor...');
   try{
    const base=cfg.url.replace(/\/$/,'');
    const headers={apikey:cfg.chave,Authorization:'Bearer '+session.access_token};
    // Parallel reads: verify the active profile/tenant before any paid search.
    // The backend uses profile.tenant_id to scope catalog, quotas and audit.
    const [profileResponse,catalogResponse]=await Promise.all([
     fetch(base+'/rest/v1/perfis?select=tenant_id,papel,ativo&id=eq.'+
      encodeURIComponent(scope.userId)+'&limit=1',{headers,signal:catalogController.signal}),
     fetch(base+'/rest/v1/segmentos?select=nome,ativo&tenant_id=eq.'+
      encodeURIComponent(scope.tenantId)+'&ativo=eq.true&limit=120',
      {headers,signal:catalogController.signal})
    ]);
    if(!valid())return;
    if(!profileResponse.ok){catalogBlockReason='Falha ao validar o perfil autenticado. Nenhuma pesquisa foi realizada.';show(catalogBlockReason);return;}
    const profiles=await profileResponse.json();
    const auth=verifyMarketTenantScope({selectedTenant:scope.tenantId,selectedUser:scope.userId,
     profile:Array.isArray(profiles)?profiles[0]:null});
    if(!auth.ok){catalogBlockReason=marketTenantMessage(auth.code);show(catalogBlockReason);return;}
    if(!catalogResponse.ok)throw Error('catalog-http');
    const rows=await catalogResponse.json();
    if(!Array.isArray(rows))throw Error('catalog-format');
    if(!valid())return;
    const seen=new Set(),options=[];
    for(const item of rows){
     const label=String(item?.nome||'').trim(),key=label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
     if(item?.ativo===false||!label||seen.has(key))continue;
     seen.add(key);options.push({key:label,label,value:label});
    }
    options.sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'));
    const prev=segmentPick.get().map(v=>v.value),authorized=new Set(options.map(x=>x.key));
    segmentPick.setItems(options);
    // Preserve prior selection only when it is part of the server-authorized catalog.
    segmentPick.choose(prev.filter(v=>authorized.has(v)));
    catalogReady=options.length>0;btn.disabled=!catalogReady;
    if(!options.length){catalogBlockReason='Nenhum segmento ativo autorizado no servidor para esta empresa. Confira Cadastros antes de pesquisar.';show(catalogBlockReason);}
    else if(prev.length&&!prev.every(v=>authorized.has(v)))
     show('Os segmentos locais foram atualizados com o catálogo do servidor. Revise sua seleção antes de buscar.');
    else show('Catálogo autorizado atualizado. Selecione os filtros e clique em Buscar empresas.');
   }catch(e){
    if(e?.name!=='AbortError'&&valid()){catalogBlockReason='Não foi possível validar o catálogo no servidor. A pesquisa permanece bloqueada para evitar custo e rejeição. Confira a conexão e recarregue a tela.';show(catalogBlockReason);}
   }
  })();
 const failureDescription=failures=>{
  if(!Array.isArray(failures))return '';
  const labels={TIMEOUT:'tempo limite excedido',FETCH_FAILURE:'falha de conexao',INVALID_JSON:'resposta invalida',
   WEB_SEARCH_NOT_COMPLETED:'busca web não concluída',
    OUTPUT_TOKEN_LIMIT:'limite de saída atingido antes de concluir a pesquisa',
    WEB_TOOL_MISSING:'ferramenta de busca não foi executada',
    WEB_TOOL_INCOMPLETE:'ferramenta de busca interrompida',
    WEB_TOOL_FAILED:'ferramenta de busca retornou erro',
    SERVER_TOOL_PAUSED:'pesquisa interrompida pelo provedor antes da resposta final',
    PROVIDER_RESPONSE_INCOMPLETE:'resposta encerrada antes da conclusão',
    PROVIDER_RESPONSE_FAILED:'provedor não concluiu a resposta',
    UNKNOWN_FAILURE:'erro não classificado'};
  const safe=failures.slice(0,2).filter(x=>x&&['OpenAI','Anthropic'].includes(x.provider)).map(x=>{
   const category=String(x.category||'');
   const description=labels[category]||(/^IA_HTTP_(4|5)[0-9]{2}$/.test(category)?'API HTTP '+category.slice(-3):'erro do provedor');
   return (x.provider==='OpenAI'?'ChatGPT':'Claude')+': '+description;
  });
  return safe.join(' | ');
 };
 // Diagnostic validates provider model access, not web research execution.
 let preflightController=null,preflightBusy=false;
 preflightBtn.addEventListener('click',async()=>{
  if(!valid()||preflightBusy)return;
  const session=nuvem.sessao(),config=nuvem.config();
  if(!session?.access_token||!config?.url||!config?.chave){
   show('Sessao de nuvem necessaria para verificar as IAs.');return;
  }
  preflightBusy=true;preflightBtn.disabled=true;
  preflightController=new AbortController();
  show('Verificando as credenciais e os modelos. Nenhuma pesquisa web sera executada...');
  const labels={
   MODEL_AVAILABLE:'credencial e modelo acessiveis',MODEL_NO_WEB_SEARCH:'modelo acessivel, sem suporte a busca web',
   NOT_CONFIGURED:'credencial nao configurada',AUTH_REJECTED:'credencial rejeitada (401)',
   ACCESS_DENIED:'acesso negado (403)',MODEL_NOT_FOUND:'modelo inexistente ou indisponivel (404)',
   PROVIDER_RATE_LIMIT:'limite do provedor (429)',PROVIDER_HTTP_ERROR:'erro HTTP do provedor',
   INVALID_RESPONSE:'resposta de modelo invalida',TIMEOUT:'tempo limite excedido',NETWORK_ERROR:'falha de conexao'
  };
  try{
   const response=await fetch(config.url.replace(/\/$/,'')+'/functions/v1/market-search',{
    method:'POST',headers:{'Content-Type':'application/json','apikey':config.chave,'Authorization':'Bearer '+session.access_token},
    body:JSON.stringify({action:'preflight',provider:aiSelect.value}),signal:preflightController.signal
   });
   const data=await response.json();
   if(!valid())return;
   if(!response.ok){
    show(data?.error==='PREFLIGHT_RATE_LIMIT'?'Diagnostico recente. Aguarde 30 segundos para repetir.':
     data?.error==='PILOT_ADMIN_OR_MANAGER_ONLY'?'Diagnostico disponivel apenas para administradores e gestores.':
     'Diagnostico indisponivel: '+String(data?.error||response.status));return;
   }
   const detail=(Array.isArray(data.results)?data.results:[]).filter(x=>['OpenAI','Anthropic'].includes(x?.provider)).map(x=>{
    const providerName=x.provider==='OpenAI'?'ChatGPT':'Claude';
    const message=labels[x.status]||'situacao desconhecida';
    const web=x.webSearchSupport==='supported'?' · busca web suportada':
     x.webSearchSupport==='not_supported'?' · busca web nao suportada':' · busca web ainda nao testada';
    return providerName+': '+message+web;
   });
   show((detail.join(' | ')||'Nenhum motor consultado')+'. Nenhuma cota de pesquisa consumida. Esta verificacao nao realiza busca web.');
  }catch(e){
   if(valid()&&e?.name!=='AbortError')show('Nao foi possivel concluir a verificacao dos modelos: falha de rede.');
  }finally{
   preflightBusy=false;preflightBtn.disabled=false;preflightController=null;
  }
 });
 // Stable review key for candidates without CNPJ; never an import identity.
 const researchKey=c=>c.cnpj||'pending:'+String(c.nome||c.razaoSocial||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()+'|'+String(c.cidade||'').toLowerCase()+'|'+String(c.uf||'');
 function renderCompanies(data,source,asOf){
  if(!valid())return;
  const workflow=buildProspectWorkflow({companies:data,snapshot,scope});
  const ranked=new Map(workflow.candidates.map(x=>[x.company,x]));
  const ordered=workflow.candidates.map(x=>x.company);
  for(const stop of cancelInvestigations)stop();cancelInvestigations.clear();
  selected.clear();importKeys.clear();review.replaceChildren();results.replaceChildren();
  const machine=el('section','','card');machine.id='iad-prospect-agents';
  machine.appendChild(el('h3','Máquina de Prospecção — seis etapas auditáveis'));
  machine.appendChild(el('p','As seis etapas organizam a pesquisa já retornada pelo ChatGPT/Claude. Não representam seis buscas independentes, nem validam automaticamente intenção de compra, e-mail ou CNPJ de uma empresa.','small muted'));
  const jobs=el('div','','iad-prospect-jobs');
  jobs.style.display='grid';jobs.style.gridTemplateColumns='repeat(auto-fit,minmax(155px,1fr))';jobs.style.gap='8px';
  for(const stage of workflow.stages){
   const job=el('section','','card');job.style.padding='10px';
   job.appendChild(el('strong',stage.name+' · '+stage.count));
   job.appendChild(el('p',stage.note,'small muted'));
   jobs.appendChild(job);
  }
  machine.appendChild(jobs);
  const totals=workflow.summary;
  machine.appendChild(el('p','Triagem: '+totals.candidates+' candidatas; '+totals.shortlisted+' na fila priorizada de revisão, '+totals.awaitingReview+' exigem checagem extra, '+totals.existing+' já cadastradas.','small'));
  machine.appendChild(el('p',totals.icpIncomplete+' candidata(s) com ICP incompleto ou ausente — pendentes de revisão.','small muted'));
  machine.appendChild(el('p',workflow.method,'small muted'));
  const top=el('section');
  top.appendChild(el('h4','Shortlist para investigação — até 10 candidatas'));
  if(!workflow.shortlist.length)top.appendChild(el('p','Nenhuma candidata reúne as condições mínimas para entrar na shortlist de revisão.','small muted'));
  for(let i=0;i<workflow.shortlist.length;i++){
   const row=workflow.shortlist[i],company=row.company;
   top.appendChild(el('p','#'+(i+1)+' · '+(company.nome||company.razaoSocial)+
    ' · índice de revisão '+row.score+'/100 · '+row.reasons.slice(0,2).join('; '),'small'));
   top.appendChild(el('p','Próxima ação sugerida: '+row.nextAction,'small muted'));
  }
  machine.appendChild(top);
  // Hipóteses incompletas permanecem numa fila de INVESTIGAÇÃO, não na
  // shortlist do ICP nem em importações automáticas.
  const pendingResearch=workflow.candidates.filter(x=>
   x.status==='verificacao_obrigatoria'||x.status==='duplicidade_a_revisar').slice(0,10);
  if(pendingResearch.length){
   const queue=el('section','','iad-market-research-queue');
   queue.appendChild(el('h4','Prioridade de investigação — dados pendentes'));
   queue.appendChild(el('p','Fila exploratória para validação humana; empresas ainda não qualificadas e não prontas para importação.','small muted'));
   for(let i=0;i<pendingResearch.length;i++){
    const row=pendingResearch[i],c=row.company;
    queue.appendChild(el('p','#'+(i+1)+' · '+(c.nome||c.razaoSocial)+
     ' · prontidão '+row.score+'/100 · '+row.nextAction,'small'));
   }
   machine.appendChild(queue);
  }
  results.appendChild(machine);
  const pending=data.filter(c=>!c.cnpj).length;
  const pendingICP=data.filter(c=>c.qualificacaoICP?.statusGeral!=='declarado_nao_verificado').length;
  results.appendChild(el('h3',data.length+' empresas candidatas encontradas na web · '+source));
  results.appendChild(el('p',pendingICP+' candidata(s) com pelo menos um criterio ICP pendente ou sem detalhamento; nenhum dado de porte foi confirmado independentemente.','small muted'));
  results.appendChild(el('p',pending+' candidata(s) com CNPJ pendente, somente para revisao; nenhuma pode ser importada sem validacao.','small muted'));
  results.appendChild(el('p','Dados consultados em '+asOf+'. Esta pagina nao representa necessariamente todas as empresas da regiao.','small muted'));
  const snapshotNow=snapshot;
  for(const company of ordered){
   const plan=proposePipelineAction(company,snapshotNow,{tenantId:scope.tenantId,userId:scope.userId});
   const card=el('section','','card'),title=el('h4',(company.nome||company.razaoSocial)+' · '+company.cidade+'/'+company.uf);
   const statusMatch=plan.match.status==='existing'?'Ja cadastrada — CNPJ exato':plan.match.status==='related'?'Possivel matriz/filial':plan.match.status==='review'?'Revisar possivel duplicidade':'Nao cadastrada';
   card.appendChild(title);
   const evaluation=ranked.get(company);
   if(evaluation){
    card.appendChild(el('p','Índice de prontidão para revisão: '+evaluation.score+'/100 · '+evaluation.status.replace(/_/g,' '),'small'));
    card.appendChild(el('p',evaluation.reasons.join(' · '),'small muted'));
    card.appendChild(el('p','Próximo passo recomendado: '+evaluation.nextAction,'small'));
   }
   if(company.fonteStatus==='pendente_sem_fonte'||!company.fontes?.length)
    card.appendChild(el('p','NOME SUGERIDO PELA IA, SEM FONTE CITADA. Ainda não é empresa verificada. Pesquise a identidade e descarte se não houver evidência pública.','small muted'));
   card.appendChild(el('p',(company.cnpj?'CNPJ '+company.cnpj:'CNPJ pendente — validar identidade')+' · '+(company.segmento||'Setor nao informado')+' · '+(company.porte||'Porte nao informado'),'small muted'));
   card.appendChild(el('p','Situacao CRM: '+statusMatch+(plan.existingOpportunityId?' · Ja existe oportunidade em Prospecção':''),'small'));
   cancelInvestigations.add(mountMarketInvestigation({card,company,doc,nuvem,valid,
    provider:()=>aiSelect.value,getSequence:()=>currentRequest}));
   cancelInvestigations.add(mountMarketSignals({card,company,doc,nuvem,valid,
    provider:()=>aiSelect.value,getSequence:()=>currentRequest}));
   cancelInvestigations.add(mountMarketEnricher({card,company,doc,nuvem,valid,
    provider:()=>aiSelect.value,getSequence:()=>currentRequest}));
   card.appendChild(el('p','Funcionarios: '+(company.funcionarios===null?'indisponivel':String(company.funcionarios))+' (nao confirmado) · Faturamento: '+(company.faturamento===null?'indisponivel':String(company.faturamento))+' (nao confirmado)','small'));
   const icp=company.qualificacaoICP;
   if(icp){
    const labels={municipio:'Municipio',ddd:'DDD',segmento:'Segmento',funcionarios:'Faixa de funcionarios'};
    const desc={declarado:'informado pela IA (verificar fonte)',pendente:'pendente de informacao',a_confirmar:'classificacao a confirmar',nao_solicitado:'nao solicitado'};
    card.appendChild(el('h5','Aderencia ao ICP — dados informados mas nao verificados'));
    for(const key of Object.keys(labels)){
     if(icp[key]==='nao_solicitado')continue;
     card.appendChild(el('p',labels[key]+': '+(desc[icp[key]]||'pendente de verificacao'),'small muted'));
    }
   }
   if(company.faixaFuncionariosStatus==='pendente')card.appendChild(el('p','Faixa de funcionarios pendente: a IA nao informou quantidade comprovada.','small muted'));
   if(company.telefone)card.appendChild(el('p','Telefone corporativo informado: '+company.telefone,'small'));
   if(company.contatos.length){
    card.appendChild(el('h5','Contatos fornecidos pela fonte — confirmar antes de usar'));
    for(const c of company.contatos)card.appendChild(el('p',[c.nome,c.cargo,c.email,c.telefone].filter(Boolean).join(' · '),'small'));
   }else card.appendChild(el('p','Nenhum decisor validado pela fonte nesta consulta.','small muted'));
   if(company.noticias.length){for(const n of company.noticias)card.appendChild(el('p','Noticia: '+n.titulo+' · '+n.data,'small'));}
   else card.appendChild(el('p','Noticias e oportunidades especificas ainda nao verificadas.','small muted'));
   const safeSources=company.fontes.filter(f=>isReviewableSourceURL(f?.url));
   if(safeSources.length) {
    card.appendChild(el('h5','URLs HTTPS citadas — conferir conteúdo'));
    for(const f of safeSources.slice(0,8)) {
     const link=doc.createElement('a');link.href=f.url;link.target='_blank';link.rel='noopener noreferrer';
     link.textContent=(f.titulo||f.url);card.appendChild(link);card.appendChild(el('p',''));
    }
   }else card.appendChild(el('p','Sem URL HTTPS pública para revisão: não utilizar como fato.','small muted'));
   if(company.insights.length){card.appendChild(el('h5','Insights — hipoteses a investigar'));for(const insight of company.insights)card.appendChild(el('p',insight,'small'));}
   if(company.conflitos?.length){
    card.appendChild(el('h5','Divergencias entre IAs — verificar antes de qualificar'));
    for(const item of company.conflitos)card.appendChild(el('p',item.campo+': '+item.valorOriginal+' / '+item.valorDivergente+' ('+item.provedor+')','small'));
   }
   if(company.providers.length)card.appendChild(el('p','Pesquisado por: '+company.providers.join(' + '),'small muted'));
   const label=el('label','Selecionar para revisao comercial','campo'),check=doc.createElement('input');
   check.type='checkbox'; // pending candidates may be selected for research review; never for import.
   check.addEventListener('change',()=>{if(!valid())return;const key=researchKey(company);if(check.checked)selected.add(key);else selected.delete(key);renderSelection(data);});
   label.prepend(check);card.appendChild(label);results.appendChild(card);
  }
 }
 function renderSelection(data){
  review.replaceChildren();
  review.appendChild(el('h3','Selecao: '+selected.size+' empresa(s)'));
  if(!selected.size)return;
  const chosen=data.filter(c=>selected.has(researchKey(c))),eligible=[];
  const evaluation=buildProspectWorkflow({companies:chosen,snapshot,scope});
  const qualifying=new Set(evaluation.candidates.filter(x=>x.status==='candidata_para_revisao').map(x=>researchKey(x.company)));
  for(const c of chosen){
   const plan=proposePipelineAction(c,snapshot,{tenantId:scope.tenantId,userId:scope.userId});
   const rejected=!qualifying.has(researchKey(c))||!c.cnpj||plan.match.status!=='new'||!!c.conflitos?.length||!c.fontes?.some(f=>isReviewableSourceURL(f?.url));
   if(!rejected)eligible.push(c);
   review.appendChild(el('p',(c.nome||c.razaoSocial)+' — '+(rejected?'ICP, fonte ou duplicidade exige revisão antes de importar':'Candidata com ICP declarado completo, sujeita à confirmação')+(plan.existingOpportunityId?' (oportunidade existente)':''),'small'));
  }
  review.appendChild(el('p','A importacao cria somente conta e oportunidade em Prospeccao. Contatos nao sao gravados automaticamente. Confirme CNPJ, municipio e evidencia diretamente nas fontes.','small muted'));
  if(!eligible.length)return;
  // Production research canary: no import command until explicit E2E approval.
  if(globalThis.IAD_MARKET_IMPORT_ENABLED!==true){
   review.appendChild(el('p','PILOTO DE PESQUISA: importacao no Pipeline desativada ate homologacao real. Revise empresas e fontes sem gravar dados comerciais.','small muted'));
   return;
  }
  const approval=el('label','Confirmo que verifiquei a identidade, localizacao e fontes de cada empresa elegivel e autorizo a inclusao no Pipeline.','campo');
  const agree=doc.createElement('input');agree.type='checkbox';agree.checked=false;
  approval.prepend(agree);review.appendChild(approval);
  const importBtn=el('button','IMPORTAR '+eligible.length+' EMPRESA(S) REVISADA(S)','btn');
  importBtn.type='button';importBtn.disabled=true;review.appendChild(importBtn);
  agree.addEventListener('change',()=>{importBtn.disabled=!agree.checked||importing||!valid();});
  const resultArea=el('p','','small');review.appendChild(resultArea);
  importBtn.addEventListener('click',async()=>{
   if(importing||!agree.checked||!valid())return;
   const session=nuvem.sessao(),config=nuvem.config();
   if(!session?.access_token||!config?.url||!config?.chave){resultArea.textContent='Sessao de nuvem obrigatoria para importar.';return;}
   if(!globalThis.crypto?.randomUUID){resultArea.textContent='O navegador precisa suportar identificadores seguros para importar.';return;}
   importing=true;importBtn.disabled=true;agree.disabled=true;
   let imported=0,reviewed=0,failed=0;const importedIds=[];
   for(const company of eligible){
    if(!valid())break;
    try{
     let requestId=importKeys.get(company.cnpj);
     if(!requestId){requestId=globalThis.crypto.randomUUID();importKeys.set(company.cnpj,requestId);}
     const body=buildMarketImportRequest(company,snapshot,{tenantId:scope.tenantId,userId:scope.userId},requestId);
     const response=await fetch(config.url.replace(/\/$/,'')+'/rest/v1/rpc/iad_market_import_confirmed',{
      method:'POST',headers:{'Content-Type':'application/json','apikey':config.chave,'Authorization':'Bearer '+session.access_token},
      body:JSON.stringify(body)
     });
     if(!response.ok){failed++;continue;}
     const data=await response.json();
     if(data?.status==='imported'||data?.status==='already_imported'){
      imported++;
      importedIds.push({accountId:data.accountId,opportunityId:data.opportunityId});
      selected.delete(researchKey(company));
     }
     else if(data?.status==='existing'||data?.status==='review_duplicate'){reviewed++;selected.delete(researchKey(company));}
     else failed++;
    }catch{failed++;}
   }
   const reconciliation=await refreshMarketPipelineAfterImport({nuvem,importedCount:imported,valid,tenantId:scope.tenantId,importedIds,getSnapshot});
   if(valid()){
    const stateMessage=reconciliation.status==='synced'
     ?'Carteira local atualizada de forma segura. Confira as oportunidades no Pipeline.'
     :imported>0
      ?'Gravacao confirmada no servidor, mas atualizacao local pendente (edicoes CAS, alteracoes locais ou erro de rede). Resolva a sincronizacao antes de conferir o Pipeline.'
      :'Nenhuma nova conta foi inserida.';
    resultArea.textContent='Importacao: '+imported+' confirmada(s), '+reviewed+' para revisao de duplicidade, '+failed+' falha(s). '+stateMessage;
    show('Revisao comercial finalizada. Nenhum contato pessoal foi criado automaticamente.');
   }
   importing=false;agree.disabled=false;agree.checked=false;importBtn.disabled=true;
  });
 }
 form.addEventListener('submit',async ev=>{
  ev.preventDefault();if(!valid())return;
  if(!catalogReady){show(catalogBlockReason);return;}
   if(cityLoading){show('Aguarde a consulta de cidades no IBGE.');return;}
  let filters;try{filters=normalizeMarketFilters({
   ...Object.fromEntries([...els].map(([k,v])=>[k,v.value])),
   uf:ufSelect.value,
   municipios:cityPick.get().map(x=>x.value),
   ddds:dddPick.get().map(x=>x.value),
   segmentos:segmentPick.get().map(x=>x.value),
   faixasFuncionarios:bandPick.get().map(x=>x.value),
   limit:Number(batchLimit.value)
  });}catch(e){show(e.message);return;}
  const session=nuvem.sessao(),config=nuvem.config();
  if(!session?.access_token||!config?.url||!config?.chave){show('Autenticacao de nuvem necessaria para pesquisar empresas.');return;}
  if(controller)controller.abort();
  for(const stop of cancelInvestigations)stop();cancelInvestigations.clear();
  controller=new AbortController();const seq=++currentRequest;
  results.replaceChildren();review.replaceChildren();btn.disabled=true;demoBtn.disabled=true;
  const providerLabel=aiSelect.value==='both'?'ChatGPT e Claude':aiSelect.value==='OpenAI'?'ChatGPT':'Claude';
  show('Pesquisando sites e noticias com as IAs configuradas no IaD...');
  progress.start(providerLabel);progress.waiting();
  let responseReceived=false;
  try{
   const response=await fetch(config.url.replace(/\/$/,'')+'/functions/v1/market-search',{method:'POST',
    headers:{'Content-Type':'application/json','apikey':config.chave,'Authorization':'Bearer '+session.access_token},
    body:JSON.stringify({action:'search',filters,provider:aiSelect.value}),signal:controller.signal});
   responseReceived=true;
   const payload=await response.json();
   if(seq!==currentRequest||!valid())return;
   if(!response.ok){
    const messages={'AI_NOT_CONFIGURED':'Nenhum motor de IA habilitado para pesquisa no IaD.',
      'AI_SEARCH_UNAVAILABLE':'A pesquisa web nao foi concluida.',
      'INVALID_PROVIDER':'Motor de IA invalido.',
      'AI_PROVIDER_NOT_CONFIGURED':'O motor selecionado nao esta configurado.',
      'SEARCH_QUOTA_EXCEEDED':'Limite diario de pesquisas atingido. Nao houve nova chamada as IAs.',
      'SEARCH_QUOTA_UNAVAILABLE':'Controle de quota indisponivel. Pesquisa interrompida sem consultar as IAs.',
      'DDD_MAPPING_PENDING':'O DDD precisa ser mapeado para municipios antes da pesquisa.',
      'SEGMENT_NOT_AUTHORIZED':'O segmento selecionado não corresponde ao catálogo ativo autorizado no servidor para esta empresa. Confira os segmentos em Cadastros, selecione novamente e repita a pesquisa.',
      'SEGMENT_CATALOG_UNAVAILABLE':'Nao foi possivel validar os segmentos da empresa. Nenhum credito de pesquisa foi consumido.'};
    const failure=failureDescription(payload?.failures);
    const message=(payload?.message||messages[payload?.error]||'Pesquisa indisponivel: '+(payload?.error||response.status))+(failure?' Motivo: '+failure+'.':'');
    show(message,{error:true});progress.fail(message);return;
   }
   progress.processing();
   const companies=normalizeMarketCompanies(payload.data||[],{source:payload.source||'Nao identificada',retrievedAt:payload.retrievedAt||''});
   const unavailable=Array.isArray(payload.failedProviders)?payload.failedProviders.filter(p=>p==='OpenAI'||p==='Anthropic'):[];
   const partialWarning=payload.partial===true?('ATENCAO: pesquisa parcial. Falha em '+(unavailable.join(' e ')||'um provedor')+'. '+failureDescription(payload.failures)+'. '):'';
   const usageText=Array.isArray(payload.usage)?payload.usage.filter(u=>u&&['OpenAI','Anthropic'].includes(u.provider)).map(u=>{
    const inTokens=Number.isSafeInteger(u.inputTokens)?u.inputTokens:'nao informado';
    const outTokens=Number.isSafeInteger(u.outputTokens)?u.outputTokens:'nao informado';
    const searches=Number.isSafeInteger(u.webSearchRequests)?u.webSearchRequests:'nao informado';
    return u.provider+': '+inTokens+' tokens entrada, '+outTokens+' saida, '+searches+' buscas web';
   }).join(' | '):'';
   const diagnostics=payload?.diagnostics;
   const rejectedText=diagnostics&&Number.isSafeInteger(diagnostics.candidates)&&
    Number.isSafeInteger(diagnostics.accepted)&&diagnostics.candidates>=0&&
    diagnostics.accepted>=0&&diagnostics.accepted<=diagnostics.candidates
     ?' Registros relatados pelas IAs: '+diagnostics.candidates+
      '; apos deduplicacao e filtros: '+diagnostics.accepted+
      '; rejeitados por territorio: '+(Number.isSafeInteger(diagnostics.rejectedTerritory)?diagnostics.rejectedTerritory:0)+
      ', quantidade de funcionarios: '+(Number.isSafeInteger(diagnostics.rejectedEmployees)?diagnostics.rejectedEmployees:0)+
      ', CNPJ invalido: '+(Number.isSafeInteger(diagnostics.rejectedInvalidCnpj)?diagnostics.rejectedInvalidCnpj:0)+
      ', nome insuficiente: '+(Number.isSafeInteger(diagnostics.rejectedMissingName)?diagnostics.rejectedMissingName:0)+
      ', sem fonte citada — mantidos SOMENTE para investigação: '+(Number.isSafeInteger(diagnostics.pendingUncitedSource)?diagnostics.pendingUncitedSource:0)+
      ', excluídos por falta de fonte: '+(Number.isSafeInteger(diagnostics.rejectedUncitedSource)?diagnostics.rejectedUncitedSource:0)+
      ', duplicados agrupados: '+(Number.isSafeInteger(diagnostics.mergedDuplicates)?diagnostics.mergedDuplicates:0)+'.'
     :'';
   const sourcedCount=companies.filter(c=>(c.fontes||[]).some(f=>isReviewableSourceURL(f?.url))).length;
   const withoutSource=companies.length-sourcedCount;
   show(partialWarning+'Pesquisa exploratoria: '+companies.length+' nomes candidatos; '+sourcedCount+' com URL HTTPS citada pelo provedor; '+withoutSource+' SEM fonte individual (apenas investigação, jamais qualificação/importação); '+companies.filter(c=>!c.cnpj).length+' com CNPJ pendente. Cobertura total desconhecida, fontes ainda nao verificadas. Nenhuma gravacao realizada.'+rejectedText+(usageText?' Consumo informado: '+usageText+'. Custo em R$ a apurar.':''));
   renderCompanies(companies,payload.source||'Fornecedor',payload.retrievedAt||'data nao fornecida');
   // Planejamento amplo não equivale a consultar cada combinação municipal e
   // setorial. Expor as 18 famílias sem afirmar cobertura exaustiva.
   const plan=payload.discoveryPlan;
   if(plan?.sectorExpansion==='automotivo_mobilidade'&&Array.isArray(plan.families)&&plan.families.length){
    const details=doc.createElement('details');
    details.className='iad-market-discovery-plan';
    const summary=doc.createElement('summary');
    summary.textContent='Automotivo e Mobilidade — '+plan.families.length+
     ' famílias de subsegmentos consideradas na descoberta';
    details.appendChild(summary);
    details.appendChild(el('p','Escopo solicitado: '+String(plan.municipalityCount||0)+
     ' municípios; '+String(plan.families.length)+' famílias; teto '+String(plan.requestedLimit||20)+
     ' nomes por consulta. As famílias são hipóteses de busca; uma única rodada NÃO pesquisa cada combinação.','small muted'));
    for(const family of plan.families.slice(0,25))details.appendChild(el('p','• '+String(family).slice(0,280),'small'));
    results.prepend(details);
   }
   progress.finish({count:companies.length,partial:payload.partial===true});
  }catch(e){if(seq===currentRequest&&valid()&&e?.name!=='AbortError'){
   const message=responseReceived?'A pesquisa respondeu, mas os resultados não puderam ser processados. Nenhuma alteração no CRM.':'Falha de conexão durante a pesquisa. Confira o resultado antes de repetir, pois a solicitação pode ter sido recebida pelo servidor.';
   show(message,{error:true});progress.fail(message);
  }}
  finally{if(seq===currentRequest&&valid()){btn.disabled=false;demoBtn.disabled=false;}}
 });
 return ()=>{progress.dispose();doc.removeEventListener('pointerdown',closePickers);doc.removeEventListener('keydown',closePickers);root.classList.remove('iad-market-ui');catalogController.abort();stopResearchMetrics();if(controller)controller.abort();for(const stop of cancelInvestigations)stop();cancelInvestigations.clear();if(preflightController)preflightController.abort();if(cityRequest)cityRequest.abort();currentRequest++;};
}
