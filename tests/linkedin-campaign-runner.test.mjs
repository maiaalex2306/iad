import test from 'node:test';
import assert from 'node:assert/strict';
import {createLinkedInCampaignExecutor,orderRecentPosts,CAMPAIGN_STATES as S} from '../src/linkedin-campaign-runner.mjs';
const now=Date.parse('2026-11-07T12:00:00Z');
const lead={lead:'Diretora industrial',perfil:'https://www.linkedin.com/in/diretora-industrial/',empresa:'Indústria Teste',cargo:'Diretora'};
const p=(id,days=1,media=[])=>({id,url:'https://www.linkedin.com/posts/'+id,authorProfileId:'profile-1',
 text:'Nova unidade industrial com foco em eficiência e inovação.',createdAt:new Date(now-days*86400000).toISOString(),media});
function fixture({posts=[p('old',4),p('new',1,[{kind:'image',alt:'ETEs industriais',bytes:'test-image'}])],
 interacted={},permit=true,inspect=true,onLike,onComment,relevant=true}={}){
 const records=new Map(),claims=new Set(),events=[],calls={opened:0,posts:0,likes:[],comments:[],ai:[]};
 const store={
  claim:async key=>{if(claims.has(key))return false;claims.add(key);return true;},
  release:async key=>{claims.delete(key);},
  get:async key=>records.get(key)||null,
  put:async(key,value)=>{records.set(key,{...value});}
 };
 const states=new Map(Object.entries(interacted).map(([id,v])=>[id,{...v}]));
 const linkedin={
  openProfile:async()=>{calls.opened++;return {id:'profile-1',status:'ok'};},
  listPosts:async()=>{calls.posts++;return posts;},
  getMyInteraction:async post=>({...{liked:false,commented:false},...states.get(post.id)}),
  like:async post=>{
   calls.likes.push(post.id);
   if(onLike)return onLike(post,states);
   states.set(post.id,{...states.get(post.id),liked:true,commented:false});
   return {status:'confirmed'};
  },
  comment:async(post,text)=>{
   calls.comments.push([post.id,text]);
   if(onComment)return onComment(post,states);
   states.set(post.id,{...states.get(post.id),liked:true,commented:true});
   return {status:'confirmed',commentId:'comment-'+post.id};
  }
 };
 const ai={analyze:async payload=>{
  calls.ai.push(payload);
  return {relevant,rationale:'Foto e texto indicam modernização industrial; vínculo hídrico é plausível.',
   comment:'Parabéns pela expansão! O monitoramento de água e efluentes pode apoiar a eficiência operacional dessa nova etapa. Seria valioso trocar experiências.'};
 }};
 const permissions={
  canInspect:async()=>inspect,
  canInteract:async()=>permit
 };
 const engine=createLinkedInCampaignExecutor({store,linkedin,ai,permissions,clock:()=>now,
  onEvent:e=>{events.push(e);}});
 const args={campaignId:'camp-1',accountId:'user-1',lead};
 const read=()=>records.get(JSON.stringify(['user-1','camp-1',lead.perfil]));
 return {engine,store,records,events,calls,states,args,read,permissions};
}
test('Processa o post mais recente ainda não curtido/comentado e envia imagem à IA',async()=>{
 const f=fixture();
 const r=await f.engine.process(f.args);
 assert.equal(r.state,S.CONFIRMED);
 assert.deepEqual(f.calls.likes,['new']);
 assert.equal(f.calls.comments.length,1);
 assert.equal(f.calls.comments[0][0],'new');
 assert.equal(f.calls.ai.length,1);
 assert.equal(f.calls.ai[0].post.media[0].kind,'image');
 assert.equal(f.calls.ai[0].post.media[0].alt,'ETEs industriais');
 assert.deepEqual(f.events.map(x=>x.state),[
   S.OPEN_PROFILE,S.FIND_POST,S.ANALYZE,S.DRAFT,S.LIKED,S.CONFIRMED
 ]);
});
test('Seleciona o primeiro ainda não interagido, e nunca repete post já comentado',async()=>{
 const f=fixture({interacted:{new:{liked:true,commented:true}}});
 const r=await f.engine.process(f.args);
 assert.equal(r.state,S.CONFIRMED);
 assert.deepEqual(f.calls.likes,['old']);
 assert.equal(f.calls.comments[0][0],'old');
});
test('Sem publicação recente: marca motivo, sem chamar a IA ou fazer ações',async()=>{
 const f=fixture({posts:[p('old',120)]});
 const r=await f.engine.process(f.args);
 assert.equal(r.state,S.NO_POST);
 assert.equal(f.calls.ai.length,0);assert.equal(f.calls.likes.length,0);
});
test('Posts todos já curtidos/comentados são ignorados',async()=>{
 const f=fixture({interacted:{new:{liked:true,commented:false},old:{liked:false,commented:true}}});
 const r=await f.engine.process(f.args);
 assert.equal(r.state,S.PREVIOUS);
 assert.equal(f.calls.ai.length,0);
});
test('IA entende a falta de pertinência e não força comentário comercial',async()=>{
 const f=fixture({relevant:false});
 const r=await f.engine.process(f.args);
 assert.equal(r.state,S.NO_RELEVANCE);
 assert.equal(f.calls.likes.length,0);assert.equal(f.calls.comments.length,0);
});
test('Sem autorização de ações externas: produz rascunho, sem clicar no LinkedIn',async()=>{
 const f=fixture({permit:false});
 const r=await f.engine.process(f.args);
 assert.equal(r.state,S.WAITING_PERMISSION);
 assert.ok(r.draft?.includes('água e efluentes'));
 assert.equal(f.calls.likes.length,0);
 assert.equal(f.calls.comments.length,0);
});
test('Retoma rascunho sem chamar IA de novo quando autorização é concedida',async()=>{
 const f=fixture({permit:false});
 const a=await f.engine.process(f.args);
 assert.equal(a.state,S.WAITING_PERMISSION);
 f.permissions.canInteract=async()=>true;
 const b=await f.engine.process(f.args);
 assert.equal(b.state,S.CONFIRMED);
 assert.equal(f.calls.ai.length,1);
 assert.equal(f.calls.likes.length,1);
});
test('Retoma após curtida confirmada sem curtir duas vezes',async()=>{
 const f=fixture({interacted:{new:{liked:true,commented:false}}});
 const key=JSON.stringify(['user-1','camp-1',lead.perfil]);
 await f.store.put(key,{state:S.LIKED,key,lead:lead.perfil,postId:'new',ownedLikeConfirmed:true,
   draft:'Parabéns pela iniciativa! A evolução da gestão da água e dos efluentes é uma oportunidade para troca de experiências na indústria.'});
 const r=await f.engine.process(f.args);
 assert.equal(r.state,S.CONFIRMED);
 assert.deepEqual(f.calls.likes,[]);
 assert.equal(f.calls.comments.length,1);
 assert.equal(f.calls.ai.length,0);
});
test('Resultado incerto ao comentar impõe revisão e nunca reexecuta automaticamente',async()=>{
 const f=fixture({onComment:async()=>{throw Error('Conexão caiu após publicar');}});
 const a=await f.engine.process(f.args);
 assert.equal(a.state,S.REVIEW);
 assert.equal(f.calls.likes.length,1);
 assert.equal(f.calls.comments.length,1);
 const b=await f.engine.process(f.args);
 assert.equal(b.state,S.REVIEW);
 assert.equal(f.calls.comments.length,1);
});
test('Falha na confirmação da curtida interrompe antes do comentário',async()=>{
 const f=fixture({onLike:async()=>({status:'unknown'})});
 const r=await f.engine.process(f.args);
 assert.equal(r.state,S.REVIEW);
 assert.equal(f.calls.comments.length,0);
});
test('Não acessa posts quando inspeção não autorizada',async()=>{
 const f=fixture({inspect:false});
 const r=await f.engine.process(f.args);
 assert.equal(r.state,S.WAITING_PERMISSION);
 assert.equal(f.calls.opened,0);
});
test('Fila para na primeira incerteza e não segue enviando ações',async()=>{
 const f=fixture({onLike:async()=>({status:'unknown'})});
 const results=await f.engine.runQueue({campaignId:'camp-1',accountId:'user-1',
   leads:[lead,{...lead,perfil:'https://www.linkedin.com/in/outra/'}]});
 assert.equal(results.length,1);
 assert.equal(results[0].state,S.REVIEW);
});
test('Ordena publicações por data e mantém apenas o autor correto',()=>{
 const items=[p('early',3),{...p('other',1),authorProfileId:'another'},p('fresh',0.5),p('early',3)];
 assert.deepEqual(orderRecentPosts(items,'profile-1',{now}).map(x=>x.id),['fresh','early']);
});
