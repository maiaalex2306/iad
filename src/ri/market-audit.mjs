/* RI-M11: indicadores agregados de pesquisa EXTERNA, escopo tenant.
 * Não executa IAs, não consome quota e não lê carteira comercial interna.
 */
export function mountMarketResearchMetrics({root,doc,nuvem,valid}={}){
 if(!root||!doc||typeof valid!=='function')return ()=>{};
 const section=doc.createElement('section');section.className='card iad-market-research-metrics';
 const title=doc.createElement('h3');title.textContent='Observabilidade das pesquisas externas';
 const note=doc.createElement('p');note.textContent=
  'Últimos 7 dias. Cada reserva é diferente de uma pesquisa concluída. Dados anteriores à implantação do diário não aparecem aqui.';
 const button=doc.createElement('button');button.type='button';button.className='btn';
 button.textContent='ATUALIZAR INDICADORES DE PESQUISA (SEM CUSTO DE IA)';
 const content=doc.createElement('div');content.className='iad-market-research-metrics-content';
 section.append(title,note,button,content);
 root.appendChild(section);
 let abort=null,closed=false,busy=false;
 const addLine=text=>{const p=doc.createElement('p');p.textContent=text;content.appendChild(p);};
 button.addEventListener('click',async()=>{
  if(closed||!valid()||busy)return;
  const session=nuvem?.sessao?.(),cfg=nuvem?.config?.();
  content.replaceChildren();
  if(!session?.access_token||!cfg?.url||!cfg?.chave){
   addLine('Sessão autenticada necessária para consultar as métricas.');return;
  }
  busy=true;button.disabled=true;abort=new AbortController();
  addLine('Consultando apenas indicadores agregados da empresa autorizada...');
  try{
   const response=await fetch(cfg.url.replace(/\/$/,'')+'/functions/v1/market-search',{
    method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.chave,
     Authorization:'Bearer '+session.access_token},
    body:JSON.stringify({action:'metrics'}),signal:abort.signal
   });
   const data=await response.json();
   if(closed||!valid())return;
   content.replaceChildren();
   if(!response.ok){addLine('Indicadores indisponíveis: '+String(data?.error||response.status));return;}
   const m=data.metrics;
   if(!m||m.scope!=='tenant')return addLine('Resposta de métricas inválida.');
   const counts=['executions','completed','partial','failed','inProgress','staleStarted',
    'webSearches','citedSources','recordsReturned'];
   if(counts.some(key=>!Number.isSafeInteger(m[key])||m[key]<0))
    return addLine('Dados agregados inválidos: resultado não apresentado.');
   addLine('Execuções registradas: '+m.executions+' | concluídas: '+m.completed+
    ' | parciais: '+m.partial+' | falhas: '+m.failed);
   addLine('Em andamento: '+m.inProgress+' | possivelmente interrompidas (mais de 5 min): '+m.staleStarted);
   addLine('Buscas web executadas: '+m.webSearches+' | URLs citadas: '+m.citedSources+
    ' | resultados apresentados: '+m.recordsReturned);
   if(m.actions)addLine('Tipos: Finder '+(m.actions.search||0)+', Analyst '+(m.actions.investigate||0)+
    ', Signal Hunter '+(m.actions.signals||0)+', Enricher '+(m.actions.enrich||0));
   if(m.truncated===true)addLine('Limite de 400 execuções atingido: totais desta consulta são parciais.');
   addLine('Indicadores técnicos, ainda não equivalentes a empresas verificadas, reuniões ou receita gerada.');
  }catch(e){
   if(!closed&&valid()&&e?.name!=='AbortError'){
    content.replaceChildren();addLine('Falha de rede ao consultar métricas; nenhuma pesquisa paga foi iniciada.');
   }
  }finally{busy=false;button.disabled=false;abort=null;}
 });
 return ()=>{closed=true;if(abort)abort.abort();};
}
