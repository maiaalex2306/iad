/* RI-M19 — acompanhamento acessível da pesquisa manual.
 * A Edge Function responde em uma única requisição: não há percentuais reais,
 * fases por provedor nem cancelamento garantido do processamento no servidor.
 * Ocultar o diálogo não cancela o request nem altera cota ou importação.
 */
export function mountMarketSearchProgress({doc,host}={}){
 if(!doc?.createElement||!host?.append)throw Error('Documento e superfície obrigatórios');
 const make=(tag,content,cls)=>{
  const node=doc.createElement(tag);
  if(content!==undefined)node.textContent=String(content);
  if(cls)node.className=cls;
  return node;
 };
 const overlay=make('div',undefined,'iad-market-progress');
 overlay.hidden=true;
 const dialog=make('section',undefined,'iad-market-progress-dialog');
 dialog.setAttribute('role','dialog');
 dialog.setAttribute('aria-modal','true');
 dialog.setAttribute('aria-labelledby','iad-market-progress-title');
 dialog.setAttribute('aria-describedby','iad-market-progress-description');
 const eyebrow=make('span','INTELIGÊNCIA DE MERCADO','iad-market-progress-eyebrow');
 const title=make('h3','Preparando pesquisa','iad-market-progress-title');
 title.id='iad-market-progress-title';
 const info=make('p','Aguarde a confirmação do servidor.','iad-market-progress-description');
 info.id='iad-market-progress-description';
 const bar=make('progress',undefined,'iad-market-progress-bar');
 bar.max=100;bar.removeAttribute?.('value'); // sem porcentagem inventada
 const phase=make('p','Preparando solicitação','iad-market-progress-phase');
 phase.setAttribute('role','status');phase.setAttribute('aria-live','polite');
 const elapsed=make('p','Tempo decorrido: 0 s','iad-market-progress-time');
 const note=make('p','A resposta é recebida de uma só vez. Não há percentual confiável para mostrar.','iad-market-progress-note');
 const actions=make('div',undefined,'iad-market-progress-actions');
 const close=make('button','Ocultar acompanhamento','btn iad-market-progress-close');
 close.type='button';actions.append(close);
 dialog.append(eyebrow,title,info,bar,phase,elapsed,note,actions);
 overlay.append(dialog);
 const reopen=make('button','Pesquisa em andamento · acompanhar','btn iad-market-progress-reopen');
 reopen.type='button';reopen.hidden=true;
 host.append(overlay,reopen);
 let timer=null,started=0,state='idle',dismissed=false;
 const stopTimer=()=>{if(timer!==null){clearInterval(timer);timer=null;}};
 const updateTime=()=>{if(started)elapsed.textContent='Tempo decorrido: '+Math.max(0,Math.floor((Date.now()-started)/1000))+' s';};
 function reveal(){overlay.hidden=false;reopen.hidden=true;dismissed=false;}
 function hide(){
  overlay.hidden=true;dismissed=true;
  reopen.hidden=state!=='running';
 }
 function start(provider){
  stopTimer();started=Date.now();state='running';
  title.textContent='Pesquisando empresas';
  info.textContent='Solicitação manual iniciada com '+String(provider||'as IAs selecionadas')+'.';
  phase.textContent='Preparando envio autenticado ao servidor';
  bar.hidden=false;bar.removeAttribute?.('value');
  note.textContent='Os provedores respondem pelo servidor. O acompanhamento não estima porcentagens.';
  close.textContent='Ocultar acompanhamento';
  updateTime();timer=setInterval(updateTime,1000);
  reveal();
 }
 function waiting(){
  if(state==='running')phase.textContent='Solicitação enviada. Aguardando resposta das IAs e da pesquisa web.';
 }
 function processing(){
  if(state==='running')phase.textContent='Resposta recebida. Organizando candidatas e fontes citadas.';
 }
 function finish({count=0,partial=false}={}){
  if(state!=='running')return;
  state='done';stopTimer();updateTime();bar.hidden=true;
  title.textContent=partial?'Pesquisa parcialmente concluída':'Pesquisa concluída';
  phase.textContent='Resposta recebida e organizada no painel.';
  info.textContent=Number.isSafeInteger(count)&&count>0
   ?count+' empresa(s) candidata(s) apresentada(s) para revisão.'
   :'Nenhuma empresa candidata foi apresentada para os filtros informados.';
  note.textContent='Os dados devem ser verificados antes de qualquer decisão ou importação.';
  close.textContent='Ver resultados';
  if(!dismissed)reveal();
  reopen.hidden=true;
 }
 function fail(message){
  if(state!=='running')return;
  state='error';stopTimer();updateTime();bar.hidden=true;
  title.textContent='Não foi possível concluir a pesquisa';
  phase.textContent='A solicitação terminou sem resultados confirmados.';
  info.textContent=String(message||'O servidor não concluiu a solicitação.').slice(0,650);
  note.textContent='O painel de pesquisa mantém a mensagem e os filtros. Uma nova tentativa exige ação do usuário.';
  close.textContent='Fechar';
  if(!dismissed)reveal();
  reopen.hidden=true;
 }
 const closeClick=()=>hide();
 const reopenClick=()=>reveal();
 const keyDown=(event)=>{if(event?.key==='Escape'&&!overlay.hidden)hide();};
 close.addEventListener('click',closeClick);
 reopen.addEventListener('click',reopenClick);
 doc.addEventListener?.('keydown',keyDown);
 return Object.freeze({
  start,waiting,processing,finish,fail,
  hide,reveal,
  getState:()=>state,
  overlay,reopen,
  dispose(){
   stopTimer();state='disposed';overlay.hidden=true;reopen.hidden=true;
   doc.removeEventListener?.('keydown',keyDown);
  }
 });
}
