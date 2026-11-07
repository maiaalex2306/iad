/* LinkedIN Leads — workflow puro, sem rede e sem acesso a credenciais.
   Os estados nunca implicam curtida/publicação comprovada pelo LinkedIn:
   confirmação manual e retorno de API são evidências distintas. */
export const TERMINAIS = Object.freeze(['sem_post','confirmado','descartado']);
export function campaignSummary(rows) {
  const result={total:0,pendentes:0,perfilAberto:0,semPost:0,curtidas:0,rascunhos:0,confirmados:0,falhas:0};
  for(const r of Array.isArray(rows)?rows:[]){
    result.total++;
    if(r.estado==='sem_post')result.semPost++;
    if(r.estado==='confirmado')result.confirmados++;
    if(r.estado==='erro')result.falhas++;
    if(r.perfilAbertoEm)result.perfilAberto++;
    if(r.curtidaConfirmada)result.curtidas++;
    if(r.estado==='rascunho'||r.estado==='confirmado')result.rascunhos++;
    if(!TERMINAIS.includes(r.estado||'pendente'))result.pendentes++;
  }
  return result;
}
/* Procura só os próximos pendentes, sem reciclar automaticamente o fim da fila.
   Necessário para não processar o mesmo perfil duas vezes sem revisão. */
export function nextPending(rows,current=null){
  const list=Array.isArray(rows)?rows:[];
  if(!list.length)return null;
  const index=list.indexOf(current);
  for(let i=Math.max(0,index+1);i<list.length;i++){
    if(!TERMINAIS.includes(list[i].estado||'pendente'))return list[i];
  }
  return null;
}
export function skipWithoutPost(rows,current,when=new Date().toISOString()){
  if(!current||!Array.isArray(rows)||!rows.includes(current))throw Error('Lead não está na fila.');
  if(current.estado==='confirmado')throw Error('Lead concluído não pode ser marcado sem post.');
  current.estado='sem_post';current.semPostEm=when;current.postUrl='';current.post='';
  return nextPending(rows,current);
}
export function setProfileOpened(row,when=new Date().toISOString()){
  if(!row||TERMINAIS.includes(row.estado))throw Error('Lead encerrado não pode ser reaberto sem revisão.');
  row.perfilAbertoEm=when;row.estado='perfil_aberto';return row;
}
export function setLikeConfirmed(row,when=new Date().toISOString()){
  if(!row||TERMINAIS.includes(row.estado))throw Error('Lead encerrado.');
  if(!row.postUrl)throw Error('Primeiro identifique a publicação.');
  row.curtidaConfirmada=true;row.curtidaConfirmadaEm=when;row.estado='curtido';
  return row;
}
export function setCommentConfirmed(row,comment,when=new Date().toISOString()){
  if(!row||TERMINAIS.includes(row.estado))throw Error('Lead encerrado.');
  if(!row.postUrl||String(comment||'').trim().length<20)throw Error('Publicação e comentário são obrigatórios.');
  if(!row.curtidaConfirmada)throw Error('Confirme a curtida antes de finalizar.');
  row.estado='confirmado';row.comentarioConfirmadoEm=when;row.comentarioPublicado=String(comment).slice(0,1300);
  return row;
}
/* Usado SOMENTE se houver conector autorizado: nunca presumir quotas oficiais.
   Se o canal não declarou permissão, bloqueia por padrão. */
export function externalActionGate({approved=false,scopes=[],neededScope='',now=Date.now(),
  lastActionAt=0,minIntervalMs=0,retryAfterAt=0,remaining=null,stop=false}={}){
  if(!approved||!neededScope||!Array.isArray(scopes)||!scopes.includes(neededScope))
    return {ok:false,reason:'Integração ou permissão oficial ausente.',nextAt:null};
  if(stop)return {ok:false,reason:'Campanha pausada pelo operador.',nextAt:null};
  if(remaining!==null&&(!Number.isFinite(remaining)||remaining<=0))
    return {ok:false,reason:'Orçamento de ações esgotado ou desconhecido.',nextAt:null};
  const delayedUntil=Math.max(Number(retryAfterAt)||0,(Number(lastActionAt)||0)+Math.max(0,Number(minIntervalMs)||0));
  if(delayedUntil>now)return {ok:false,reason:'Aguardar janela autorizada.',nextAt:delayedUntil};
  return {ok:true,reason:'Dentro da política configurada.',nextAt:now};
}
