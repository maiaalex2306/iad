/* RI-M01 / interface manual de mercado (pesquisa nunca roda no boot).
 * Nenhum resultado e importado; a revisao de duplicidades e somente leitura.
 */
import {normalizeMarketFilters,normalizeMarketCompanies,proposePipelineAction,buildMarketImportRequest,UF_IBGE,MARKET_DDDS,MARKET_BANDS} from './market-contract.mjs';
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
 const valid=()=>root.isConnected&&getScopeToken()===scope.token;
 const el=(tag,text='',className='')=>{const n=doc.createElement(tag);n.textContent=String(text);if(className)n.className=className;return n};
 const form=doc.createElement('form'),grid=el('div','','grid'),status=el('p','Selecione o territorio, o segmento e as faixas de funcionarios. Nada sera importado automaticamente.','small muted');
 grid.style.display='grid';grid.style.gridTemplateColumns='repeat(auto-fit,minmax(245px,1fr))';grid.style.gap='14px';grid.style.alignItems='start';
 // Every picker derives its options from a versioned source, never free text.
 function picker(label,placeholder,limit=15){
  const wrapper=el('div','','campo'),title=el('span',label,'small'),details=doc.createElement('details'),summary=doc.createElement('summary'),search=doc.createElement('input'),options=el('div','','market-options');
  details.style.border='1px solid var(--borda,#ded8e5)';details.style.borderRadius='9px';details.style.padding='9px';
  summary.textContent=placeholder;summary.style.cursor='pointer';
  search.type='search';search.placeholder='Filtrar opcoes';search.autocomplete='off';search.style.width='100%';search.style.margin='8px 0';
  options.style.maxHeight='190px';options.style.overflow='auto';options.style.display='grid';options.style.gap='5px';
  details.append(summary,search,options);wrapper.append(title,details);
  let items=[],chosen=new Map();
  function render(){
   summary.textContent=chosen.size?chosen.size+' selecionado(s): '+[...chosen.values()].slice(0,2).map(x=>x.label).join(', ')+(chosen.size>2?'…':''):placeholder;
   options.replaceChildren();
   const term=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
   const shown=items.filter(x=>x.label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(term)).slice(0,65);
   if(!shown.length)options.appendChild(el('span','Nenhuma opcao encontrada','small muted'));
   for(const item of shown){
    const lbl=el('label','','campo'),input=doc.createElement('input');
    input.type='checkbox';input.checked=chosen.has(item.key);
    input.addEventListener('change',()=>{
     if(input.checked&&chosen.size>=limit){input.checked=false;status.textContent='Limite de '+limit+' opcoes nesse filtro.';return;}
     if(input.checked)chosen.set(item.key,item);else chosen.delete(item.key);
     render();
    });
    lbl.style.display='flex';lbl.style.alignItems='center';lbl.style.gap='8px';
    lbl.append(input,doc.createTextNode(item.label));options.appendChild(lbl);
   }
   if(items.length>65&&!term)options.appendChild(el('span','Digite para localizar outras opcoes.','small muted'));
  }
  search.addEventListener('input',render);
  return {wrapper,get:()=>[...chosen.values()],setItems(next){
   items=next;const keys=new Set(items.map(x=>x.key));chosen=new Map([...chosen].filter(([k])=>keys.has(k)));render();
  },choose(keys){const wanted=new Set(keys);chosen=new Map(items.filter(x=>wanted.has(x.key)).slice(0,limit).map(x=>[x.key,x]));render();},clear(){chosen.clear();render();}};
 }
 const ufBox=el('label','Estado (UF)','campo'),ufSelect=doc.createElement('select');
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
 const cityCache=new Map();
 async function loadCities(uf){
  cityPick.clear();cityPick.setItems([]);
  if(cityRequest){cityRequest.abort();cityRequest=null;}
  cityLoading=false;
  if(!uf)return [];
  if(cityCache.has(uf)){cityPick.setItems(cityCache.get(uf));return cityCache.get(uf);}
  const request=new AbortController();cityRequest=request;cityLoading=true;
  status.textContent='Consultando municipios oficiais do IBGE para '+uf+'…';
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
   cityCache.set(uf,items);cityPick.setItems(items);status.textContent=items.length+' municipios carregados via '+source+'. Selecione as cidades.';
   return items;
  }catch(error){
   if(error?.name!=='AbortError'&&ufSelect.value===uf&&valid())status.textContent='Nao foi possivel carregar o catalogo oficial de municipios. Tente selecionar o estado novamente.';
   return [];
  }finally{if(cityRequest===request)cityLoading=false;}
 }
 ufSelect.addEventListener('change',()=>{loadCities(ufSelect.value);});
 const demoBtn=el('button','Aplicar exemplo: Mogi/SP · Quimica · 201–1.000 funcionarios','btn');
 demoBtn.type='button';demoBtn.style.gridColumn='1/-1';
 demoBtn.addEventListener('click',async()=>{
  ufSelect.value='SP';const cities=await loadCities('SP');
  const mogi=cities.find(x=>x.label==='Mogi das Cruzes');
  if(!mogi){show('Nao foi possivel validar Mogi das Cruzes no catalogo de municipios. Exemplo nao aplicado.');return;}
  cityPick.choose([mogi.key]);
  dddPick.choose(['11']);
  const selected=tenantSegments.find(x=>/qu[ií]mic/i.test(String(x.nome||'')));
  if(selected)segmentPick.choose([String(selected.nome)]);
  bandPick.choose(['201_500','501_1000']);
  aiSelect.value='both';
 });
 const advanced=doc.createElement('details'),advancedGrid=el('div','','grid');
 advanced.style.gridColumn='1/-1';advanced.style.padding='7px';advanced.style.border='1px solid var(--borda,#ded8e5)';advanced.style.borderRadius='9px';
 const advancedHead=doc.createElement('summary');advancedHead.textContent='Filtros avancados (regiao, CNAE, porte e faturamento)';advanced.append(advancedHead,advancedGrid);
 advancedGrid.style.display='grid';advancedGrid.style.gridTemplateColumns='repeat(auto-fit,minmax(170px,1fr))';advancedGrid.style.gap='8px';
 for(const [name,label,type] of fields){
  const holder=el('label',label,'campo'),input=doc.createElement('input');input.type=type;input.name=name;input.autocomplete='off';input.maxLength=150;
  if(type==='number'){input.min='0';input.step='1';}
  holder.appendChild(input);advancedGrid.appendChild(holder);els.set(name,input);
 }
 grid.append(ufBox,cityPick.wrapper,dddPick.wrapper,segmentPick.wrapper,bandPick.wrapper,advanced);
 if(!tenantSegments.length)status.textContent='Nenhum segmento autorizado encontrado na carteira. Consulte o cadastro de segmentos.';
 const aiHolder=el('label','Motor de pesquisa','campo'),aiSelect=doc.createElement('select');
 for(const [value,label] of [['both','ChatGPT + Claude'],['OpenAI','Somente ChatGPT'],['Anthropic','Somente Claude']]){
  const option=doc.createElement('option');option.value=value;option.textContent=label;aiSelect.appendChild(option);
 }
 aiHolder.appendChild(aiSelect);grid.appendChild(aiHolder);aiSelect.value='both';
 const btn=el('button','BUSCAR EMPRESAS','btn');btn.type='submit';
 const results=el('div','','iad-market-results'),review=el('div','','iad-market-review');
 form.appendChild(grid);form.appendChild(demoBtn);form.appendChild(btn);
 root.replaceChildren(el('h2','Pesquisar empresas fora do CRM'),el('p','Pesquisa iniciada manualmente. Fontes, custos e cobertura dependem do provedor contratado. Os dados nao sao fatos confirmados ate verificacao.','small muted'),form,status,results,review);
 const show=(message)=>{if(valid())status.textContent=message;};
 const failureDescription=failures=>{
  if(!Array.isArray(failures))return '';
  const labels={TIMEOUT:'tempo limite excedido',FETCH_FAILURE:'falha de conexao',INVALID_JSON:'resposta invalida',
   WEB_SEARCH_NOT_COMPLETED:'busca web nao concluida',UNKNOWN_FAILURE:'erro nao classificado'};
  const safe=failures.slice(0,2).filter(x=>x&&['OpenAI','Anthropic'].includes(x.provider)).map(x=>{
   const category=String(x.category||'');
   const description=labels[category]||(/^IA_HTTP_(4|5)[0-9]{2}$/.test(category)?'API HTTP '+category.slice(-3):'erro do provedor');
   return (x.provider==='OpenAI'?'ChatGPT':'Claude')+': '+description;
  });
  return safe.join(' | ');
 };
 // Stable review key for candidates without CNPJ; never an import identity.
 const researchKey=c=>c.cnpj||'pending:'+String(c.nome||c.razaoSocial||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()+'|'+String(c.cidade||'').toLowerCase()+'|'+String(c.uf||'');
 function renderCompanies(data,source,asOf){
  if(!valid())return;
  selected.clear();importKeys.clear();review.replaceChildren();results.replaceChildren();
  const pending=data.filter(c=>!c.cnpj).length;
  const pendingICP=data.filter(c=>c.qualificacaoICP?.statusGeral!=='declarado_nao_verificado').length;
  results.appendChild(el('h3',data.length+' empresas candidatas encontradas na web · '+source));
  results.appendChild(el('p',pendingICP+' candidata(s) com pelo menos um criterio ICP pendente ou sem detalhamento; nenhum dado de porte foi confirmado independentemente.','small muted'));
  results.appendChild(el('p',pending+' candidata(s) com CNPJ pendente, somente para revisao; nenhuma pode ser importada sem validacao.','small muted'));
  results.appendChild(el('p','Dados consultados em '+asOf+'. Esta pagina nao representa necessariamente todas as empresas da regiao.','small muted'));
  const snapshotNow=snapshot;
  for(const company of data){
   const plan=proposePipelineAction(company,snapshotNow,{tenantId:scope.tenantId,userId:scope.userId});
   const card=el('section','','card'),title=el('h4',(company.nome||company.razaoSocial)+' · '+company.cidade+'/'+company.uf);
   const statusMatch=plan.match.status==='existing'?'Ja cadastrada — CNPJ exato':plan.match.status==='related'?'Possivel matriz/filial':plan.match.status==='review'?'Revisar possivel duplicidade':'Nao cadastrada';
   card.appendChild(title);
   card.appendChild(el('p',(company.cnpj?'CNPJ '+company.cnpj:'CNPJ pendente — validar identidade')+' · '+(company.segmento||'Setor nao informado')+' · '+(company.porte||'Porte nao informado'),'small muted'));
   card.appendChild(el('p','Situacao CRM: '+statusMatch+(plan.existingOpportunityId?' · Ja existe oportunidade em Prospecção':''),'small'));
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
  for(const c of chosen){
   const plan=proposePipelineAction(c,snapshot,{tenantId:scope.tenantId,userId:scope.userId});
   const rejected=!c.cnpj||plan.match.status!=='new'||!!c.conflitos?.length||!c.fontes?.length;
   if(!rejected)eligible.push(c);
   review.appendChild(el('p',(c.nome||c.razaoSocial)+' — '+(rejected?'Exige revisao ou ja esta cadastrada':'Nova empresa elegivel para confirmacao')+(plan.existingOpportunityId?' (oportunidade existente)':''),'small'));
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
  if(cityLoading){show('Aguarde a consulta de cidades no IBGE.');return;}
  let filters;try{filters=normalizeMarketFilters({
   ...Object.fromEntries([...els].map(([k,v])=>[k,v.value])),
   uf:ufSelect.value,
   municipios:cityPick.get().map(x=>x.value),
   ddds:dddPick.get().map(x=>x.value),
   segmentos:segmentPick.get().map(x=>x.value),
   faixasFuncionarios:bandPick.get().map(x=>x.value)
  });}catch(e){show(e.message);return;}
  const session=nuvem.sessao(),config=nuvem.config();
  if(!session?.access_token||!config?.url||!config?.chave){show('Autenticacao de nuvem necessaria para pesquisar empresas.');return;}
  if(controller)controller.abort();controller=new AbortController();const seq=++currentRequest;
  results.replaceChildren();review.replaceChildren();btn.disabled=true;show('Pesquisando sites e noticias com as IAs configuradas no IaD...');
  try{
   const response=await fetch(config.url.replace(/\/$/,'')+'/functions/v1/market-search',{method:'POST',
    headers:{'Content-Type':'application/json','apikey':config.chave,'Authorization':'Bearer '+session.access_token},
    body:JSON.stringify({action:'search',filters,provider:aiSelect.value}),signal:controller.signal});
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
      'SEGMENT_NOT_AUTHORIZED':'O segmento selecionado nao pertence ao catalogo autorizado desta empresa. Atualize os filtros.',
      'SEGMENT_CATALOG_UNAVAILABLE':'Nao foi possivel validar os segmentos da empresa. Nenhum credito de pesquisa foi consumido.'};
    const failure=failureDescription(payload?.failures);
    show((payload?.message||messages[payload?.error]||'Pesquisa indisponivel: '+(payload?.error||response.status))+(failure?' Motivo: '+failure+'.':''));return;
   }
   const companies=normalizeMarketCompanies(payload.data||[],{source:payload.source||'Nao identificada',retrievedAt:payload.retrievedAt||''});
   const unavailable=Array.isArray(payload.failedProviders)?payload.failedProviders.filter(p=>p==='OpenAI'||p==='Anthropic'):[];
   const partialWarning=payload.partial===true?('ATENCAO: pesquisa parcial. Falha em '+(unavailable.join(' e ')||'um provedor')+'. '+failureDescription(payload.failures)+'. '):'';
   const usageText=Array.isArray(payload.usage)?payload.usage.filter(u=>u&&['OpenAI','Anthropic'].includes(u.provider)).map(u=>{
    const inTokens=Number.isSafeInteger(u.inputTokens)?u.inputTokens:'nao informado';
    const outTokens=Number.isSafeInteger(u.outputTokens)?u.outputTokens:'nao informado';
    const searches=Number.isSafeInteger(u.webSearchRequests)?u.webSearchRequests:'nao informado';
    return u.provider+': '+inTokens+' tokens entrada, '+outTokens+' saida, '+searches+' buscas web';
   }).join(' | '):'';
   show(partialWarning+'Pesquisa exploratoria: '+companies.length+' candidatas com fontes, '+companies.filter(c=>!c.cnpj).length+' com CNPJ pendente; cobertura total desconhecida. Nenhuma gravacao realizada.'+(usageText?' Consumo informado: '+usageText+'. Custo em R$ a apurar.':''));
   renderCompanies(companies,payload.source||'Fornecedor',payload.retrievedAt||'data nao fornecida');
  }catch(e){if(seq===currentRequest&&valid()&&e.name!=='AbortError')show('Falha de rede ao consultar fonte empresarial. Nenhuma alteracao no CRM.');}
  finally{if(seq===currentRequest&&valid())btn.disabled=false;}
 });
 return ()=>{if(controller)controller.abort();if(cityRequest)cityRequest.abort();currentRequest++;};
}
