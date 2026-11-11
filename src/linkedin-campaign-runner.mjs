/* Núcleo de execução LinkedIN Leads — domínio, não conector de LinkedIn.
 * Dependências explicitamente injetadas, sem scraping ou cookies.
 * Ações externas bloqueadas sem autorização de canal.
 * Sem adapter real, este módulo NÃO executa curtidas/comentários. */
export const CAMPAIGN_STATES=Object.freeze({
  PENDING:'PENDENTE',
  OPEN_PROFILE:'ABRINDO_PERFIL',
  FIND_POST:'PROCURANDO_POST',
  ANALYZE:'ANALISANDO_POST',
  DRAFT:'RASCUNHO_PRONTO',
  LIKED:'CURTIDA_CONFIRMADA',
  CONFIRMED:'COMENTARIO_CONFIRMADO',
  NO_POST:'SEM_POST',
  PREVIOUS:'JA_INTERAGIDO',
  UNAVAILABLE:'PERFIL_INACESSIVEL',
  WAITING_PERMISSION:'AGUARDANDO_AUTORIZACAO',
  REVIEW:'REVISAO_OBRIGATORIA',
  NO_RELEVANCE:'SEM_RELEVANCIA',
  ERROR:'ERRO_RECUPERAVEL'
});
const TERMINAL=new Set([
 CAMPAIGN_STATES.CONFIRMED,CAMPAIGN_STATES.NO_POST,
 CAMPAIGN_STATES.PREVIOUS,CAMPAIGN_STATES.UNAVAILABLE,CAMPAIGN_STATES.NO_RELEVANCE
]);
function fail(message){throw new Error(message);}
export function orderRecentPosts(posts,profileId,{maxAgeDays=90,now=Date.now()}={}){
 if(!Array.isArray(posts))fail('O conector deve retornar uma lista de posts.');
 const cutoff=now-Math.max(1,Math.min(365,Number(maxAgeDays)||90))*86400000;
 const known=new Set();
 return posts.filter(p=>{
   if(!p||!p.id||!p.url||known.has(p.id))return false;
   known.add(p.id);
   if(p.authorProfileId&&profileId&&p.authorProfileId!==profileId)return false;
   const d=Date.parse(p.createdAt||'');
   return Number.isFinite(d)&&d>=cutoff&&d<=now+60000;
 }).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
}
function assertSafeActionResult(result,action){
 if(!result||result.status!=='confirmed')fail('Ação '+action+' sem confirmação verificável.');
}
function commentText(reply){
 const text=String(reply?.comment||'').trim();
 if(text.length<35||text.length>1250)fail('IA retornou comentário vazio, incompleto ou excessivo.');
 return text;
}
export function createLinkedInCampaignExecutor({
 store,linkedin,ai,permissions,clock=()=>Date.now(),onEvent=()=>{}
}={}){
 if(!store||!linkedin||!ai||!permissions)fail('Conector, armazenamento, IA e política de autorização obrigatórios.');
 for(const [obj,methods] of [
  [store,['claim','release','get','put']],
  [linkedin,['openProfile','listPosts','getMyInteraction','like','comment']],
  [ai,['analyze']],
  [permissions,['canInspect','canInteract']]
 ]){
  for(const name of methods)if(typeof obj[name]!=='function')fail('Contrato ausente: '+name);
 }
 async function process({campaignId,accountId,lead,maxAgeDays=90}={}){
  if(!campaignId||!accountId||!lead?.perfil)fail('Campanha, conta e URL de perfil são obrigatórias.');
  const key=JSON.stringify([accountId,campaignId,lead.perfil]);
  const locked=await store.claim(key);
  if(!locked)return {state:'EM_EXECUCAO',key};
  let state=await store.get(key)||{state:CAMPAIGN_STATES.PENDING,key,lead:lead.perfil};
  const resume={...state};
  let externalAttempt=false;
  async function transition(next,detail={}){
   state={...state,...detail,key,lead:lead.perfil,state:next,updatedAt:new Date(clock()).toISOString()};
   await store.put(key,state);
   await onEvent({key,state:next,postId:state.postId||null});
   return state;
  }
  try{
   if(TERMINAL.has(state.state))return state;
   if(state.state===CAMPAIGN_STATES.REVIEW)return state;
   if(!(await permissions.canInspect({accountId,campaignId,lead})))
    return await transition(CAMPAIGN_STATES.WAITING_PERMISSION,{reason:'Acesso ao conteúdo não autorizado'});
   await transition(CAMPAIGN_STATES.OPEN_PROFILE);
   const profile=await linkedin.openProfile(lead.perfil);
   if(profile?.status==='not_found')
    return await transition(CAMPAIGN_STATES.UNAVAILABLE,{reason:'Perfil inacessível'});
   if(profile?.status!=='ok'||!profile?.id)
    return await transition(CAMPAIGN_STATES.REVIEW,{reason:'Sessão, desafio de segurança ou perfil não confirmado'});
   await transition(CAMPAIGN_STATES.FIND_POST);
   const posts=orderRecentPosts(await linkedin.listPosts(profile,{maxAgeDays}),profile.id,{maxAgeDays,now:clock()});
   if(!posts.length)return await transition(CAMPAIGN_STATES.NO_POST,{reason:'Sem publicações recentes acessíveis'});
   let selected=null,interaction=null;
   if(resume.postId&&[CAMPAIGN_STATES.LIKED,CAMPAIGN_STATES.DRAFT,CAMPAIGN_STATES.WAITING_PERMISSION].includes(resume.state)){
     selected=posts.find(p=>p.id===resume.postId);
     if(!selected)return await transition(CAMPAIGN_STATES.REVIEW,{reason:'Post anterior não pode ser revalidado'});
     interaction=await linkedin.getMyInteraction(selected);
   }else{
     for(const post of posts){
       const status=await linkedin.getMyInteraction(post);
       if(status?.liked===true||status?.commented===true)continue;
       if(status?.liked!==false||status?.commented!==false)
         return await transition(CAMPAIGN_STATES.REVIEW,{reason:'Interação anterior não verificável',postId:post.id});
       selected=post;interaction=status;break;
     }
     if(!selected)return await transition(CAMPAIGN_STATES.PREVIOUS,{reason:'Todas as publicações já receberam interação'});
   }
   if(interaction?.commented===true)return await transition(CAMPAIGN_STATES.REVIEW,{reason:'Comentário existente não atribuível com segurança ao executor',postId:selected.id});
   if(interaction?.liked!==true&&interaction?.liked!==false)
    return await transition(CAMPAIGN_STATES.REVIEW,{reason:'Estado da curtida desconhecido',postId:selected.id});
   let draft=resume.postId===selected.id?resume.draft:null;
   if(!draft){
     await transition(CAMPAIGN_STATES.ANALYZE,{postId:selected.id,postUrl:selected.url});
     if(!selected.text?.trim()&&!selected.media?.length)
       return await transition(CAMPAIGN_STATES.REVIEW,{reason:'Post sem texto ou mídia analisável'});
     const suggestion=await ai.analyze({
       lead:{name:lead.lead,company:lead.empresa,role:lead.cargo,profileUrl:lead.perfil},
       post:{id:selected.id,url:selected.url,text:selected.text||'',media:selected.media||[],createdAt:selected.createdAt},
       objective:'Compreender post e imagens; só relacionar água/efluentes se pertinente, nunca inventar problemas.'
     });
     if(suggestion?.relevant===false)
       return await transition(CAMPAIGN_STATES.NO_RELEVANCE,{postId:selected.id,reason:'IA considera o tema inadequado'});
     draft=commentText(suggestion);
     await transition(CAMPAIGN_STATES.DRAFT,{draft,postId:selected.id,postUrl:selected.url,
       reason:String(suggestion?.rationale||'').slice(0,1000)});
   }
   if(!(await permissions.canInteract({accountId,campaignId,lead,post:selected})))
    return await transition(CAMPAIGN_STATES.WAITING_PERMISSION,{reason:'Interação externa não autorizada',draft});
   // Rechecagem imediata antes das ações, inclusive após análise de IA.
   const current=await linkedin.getMyInteraction(selected);
   if(current?.commented===true)
    return await transition(CAMPAIGN_STATES.REVIEW,{reason:'Comentário detectado antes da publicação'});
   if(current?.liked!==true&&current?.liked!==false)
    return await transition(CAMPAIGN_STATES.REVIEW,{reason:'Curtida atual não verificável'});
   if(current.liked===true&&!resume.ownedLikeConfirmed)
     return await transition(CAMPAIGN_STATES.REVIEW,{reason:'Curtida externa detectada antes de iniciar a ação'});
   if(current.liked!==true){
     externalAttempt=true;
     const liked=await linkedin.like(selected);
     if(liked?.status!=='confirmed'){
       return await transition(CAMPAIGN_STATES.REVIEW,{reason:'Resultado da curtida incerto'});
     }
     const confirmed=await linkedin.getMyInteraction(selected);
     if(confirmed?.liked!==true)return await transition(CAMPAIGN_STATES.REVIEW,{reason:'Curtida não comprovada'});
     await transition(CAMPAIGN_STATES.LIKED,{draft,postId:selected.id,
       ownedLikeConfirmed:true,likedAt:new Date(clock()).toISOString()});
   }
   externalAttempt=true;
   const sent=await linkedin.comment(selected,draft);
   if(sent?.status!=='confirmed')
     return await transition(CAMPAIGN_STATES.REVIEW,{reason:'Resultado da publicação incerto — proibir repetição automática'});
   const verify=await linkedin.getMyInteraction(selected);
   if(verify?.commented!==true)
     return await transition(CAMPAIGN_STATES.REVIEW,{reason:'Comentário não comprovado — proibir repetição automática'});
   return await transition(CAMPAIGN_STATES.CONFIRMED,{draft,postId:selected.id,
     commentId:sent.commentId||null,commentedAt:new Date(clock()).toISOString()});
  }catch(error){
   return await transition(externalAttempt?CAMPAIGN_STATES.REVIEW:CAMPAIGN_STATES.ERROR,
     {reason:String(error?.message||error).slice(0,500)});
  }finally{
   await store.release(key);
  }
 }
 async function runQueue({leads,signal,onResult=()=>{},...args}={}){
  if(!leads||typeof leads[Symbol.asyncIterator]!=='function'&&typeof leads[Symbol.iterator]!=='function')
    fail('Fila iterável obrigatória.');
  const results=[];
  for await(const lead of leads){
   if(signal?.aborted)break;
   const result=await process({...args,lead});
   results.push(result);
   await onResult(result);
   if([CAMPAIGN_STATES.REVIEW,CAMPAIGN_STATES.WAITING_PERMISSION,CAMPAIGN_STATES.ERROR].includes(result.state))
     break; // fail-closed; não continuar com conta em estado incerto
  }
  return results;
 }
 return {process,runQueue};
}
