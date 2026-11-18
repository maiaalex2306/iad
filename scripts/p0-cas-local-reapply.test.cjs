'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Queue=require('../src/cas-queue.js');
const cloud=fs.readFileSync('src/nuvem.js','utf8');
const app=fs.readFileSync('src/app.js','utf8');
function harness(){
 const state=new Map();let errorKey='',sends=0,serverRevision=8;
 const storage={getItem:k=>state.get(k)||null,setItem(k,v){
   if(errorKey===k){errorKey='';throw Error('simulated storage interruption');}
   state.set(k,v);
 }};
 const op={userId:'user1',tenantId:'tenant1',table:'oportunidades',recordId:'lead1',
   expectedRevision:7,operationId:'original-id-12345',patch:{etapa:'Negociação',valor:1500}};
 const out=[];
 const queue=Queue.create(storage,{userId:'user1',tenantId:'tenant1'},async o=>{
   sends++;out.push(o);
   if(serverRevision!==o.expectedRevision)return {estado:'conflito'};
   serverRevision++;
   return {estado:'ok',revisao_atual:serverRevision};
 });
 queue.enqueue(op);
 return {queue,op,storage,state,out,sends:()=>sends,revision:x=>{serverRevision=x;},
  interruptQueue:()=>{errorKey='iad-crm:cas:v273:tenant1:user1';},
  interruptHistory:()=>{errorKey='iad-crm:cas:v273:tenant1:user1:resolved-v1';},
  remote:()=>({id:'lead1',tenant_id:'tenant1',revisao:8,etapa:'Perdido',valor:2000})};
}
test('P0: local field gets a new revision/id; old full patch is durably archived',async()=>{
 const h=harness();
 const r=h.queue.reaplicarLocal(h.op.operationId,h.remote(),8,['etapa'],'new-operation-id-123');
 assert.equal(r.enfileirada,true);
 assert.equal(h.sends(),0,'no remote write during journal rewrite');
 assert.equal(h.queue.archived().length,1);
 assert.deepEqual(h.queue.archived()[0].operation.patch,h.op.patch);
 assert.equal(h.queue.archived()[0].motivo,'usuario_reaplicou_local');
 const next=h.queue.pending()[0];
 assert.equal(next.expectedRevision,8);
 assert.equal(next.operationId,'new-operation-id-123');
 assert.deepEqual(next.patch,{etapa:'Negociação'},'do not overwrite other remote fields');
 await h.queue.flush();
 assert.equal(h.sends(),1);
 assert.equal(h.out[0].expectedRevision,8);
 assert.deepEqual(h.out[0].patch,{etapa:'Negociação'});
 assert.equal(h.queue.pending().length,0);
 assert.equal(h.queue.pendingAcks().length,1,'durable ack pending remote reconciliation');
});
test('P0: stale revision and identity must not change queue or archive',()=>{
 const modifications=[{revisao:9},{id:'other'},{tenant_id:'other'},{revisao:7},{revisao:null}];
 for(const delta of modifications){
  const h=harness();
  assert.throws(()=>h.queue.reaplicarLocal(h.op.operationId,{...h.remote(),...delta},8,['etapa'],'fresh-id-123456'));
  assert.equal(h.queue.pending().length,1);
  assert.equal(h.queue.archived().length,0);
  assert.equal(h.sends(),0);
 }
});
test('P0: invalid fields or id, duplicate fields, protected fields are rejected',()=>{
 for(const fields of [[],['outro'],['etapa','etapa'],['id'],['revisao']]){
  const h=harness();
  assert.throws(()=>h.queue.reaplicarLocal(h.op.operationId,h.remote(),8,fields,'fresh-id-123456'));
  assert.equal(h.queue.pending().length,1);
  assert.equal(h.queue.archived().length,0);
 }
 const h=harness();
 assert.throws(()=>h.queue.reaplicarLocal(h.op.operationId,h.remote(),8,['etapa'],'short'));
 assert.equal(h.queue.pending().length,1);
});
test('P0: archive interruption never mutates original pending record',()=>{
 const h=harness();h.interruptHistory();
 assert.throws(()=>h.queue.reaplicarLocal(h.op.operationId,h.remote(),8,['etapa'],'fresh-id-123456'),/interruption/);
 assert.deepEqual(h.queue.pending()[0],h.op);
 assert.equal(h.queue.archived().length,0);
});
test('P0: queue interruption after archive can resume same operation idempotently',()=>{
 const h=harness();h.interruptQueue();
 assert.throws(()=>h.queue.reaplicarLocal(h.op.operationId,h.remote(),8,['etapa'],'fresh-id-123456'),/interruption/);
 assert.deepEqual(h.queue.pending()[0],h.op);
 assert.equal(h.queue.archived().length,1,'original backed up before mutation');
 h.queue.reaplicarLocal(h.op.operationId,h.remote(),8,['etapa'],'another-random-id-123');
 assert.equal(h.queue.pending()[0].operationId,'fresh-id-123456');
 assert.equal(h.queue.archived().length,1);
});
test('P0: remote already equals chosen local field does not create redundant write',()=>{
 const h=harness();
 const remote={...h.remote(),etapa:'Negociação'};
 const result=h.queue.reaplicarLocal(h.op.operationId,remote,8,['etapa'],'new-operation-id-123');
 assert.equal(result.enfileirada,false);
 assert.equal(h.queue.pending().length,0);
 assert.equal(h.queue.archived().length,1);
 assert.equal(h.sends(),0);
});
test('P0: conflict after explicit reapply stays protected without second forced revision',async()=>{
 const h=harness();
 h.queue.reaplicarLocal(h.op.operationId,h.remote(),8,['etapa'],'new-operation-id-123');
 h.revision(9);
 const r=await h.queue.flush();
 assert.equal(r.blocked,true);
 assert.equal(h.queue.pending().length,1);
 assert.equal(h.queue.pending()[0].expectedRevision,8);
 assert.equal(h.queue.archived().length,1);
});
test('P0: cloud rechecks remote revision/session before local rebase',async()=>{
 const from=cloud.indexOf('  function conflitoCASPrimeiraOperacao(numero) {');
 const to=cloud.indexOf('  /* Cópia local explícita.',from);
 assert.ok(from>=0&&to>from);
 const h=harness();
 const session={user:{id:'user1'},perfil:{tenant_id:'tenant1'}};
 let rev=8,gets=0,posts=0;
 const ctx={Promise,Number,Error,Object,Array,String,Set,Date,JSON,encodeURIComponent,
   tenantsComFilaCAS:()=>['tenant1'],
   filaCASDaSessao:()=>h.queue,
   chamar:async(url,opts)=>{gets++;if(opts)posts++;return [{...h.remote(),revisao:rev}];},
   sessao:()=>session,
   global:{crypto:{randomUUID:()=> 'new-operation-id-123'}},
   retomarFilaCASSeguro:async()=>({sent:1}),
   diagnosticoPendenciasCAS:()=>({disponivel:true,quantidade:h.queue.pending().length+h.queue.pendingAcks().length})};
 vm.runInNewContext(cloud.slice(from,to)+
   'globalThis.preview=lerConflitoCAS;globalThis.reapply=resolverConflitoCASReaplicarLocal;',ctx);
 const d=await ctx.preview(1);
 assert.equal(d.revisaoServidor,8);
 rev=9;
 await assert.rejects(ctx.reapply(1,8,['etapa']),/revisão ou identidade mudou/i);
 assert.equal(h.queue.pending().length,1);
 assert.equal(h.queue.archived().length,0);
 rev=8;
 const result=await ctx.reapply(1,8,['etapa']);
 assert.equal(result.confirmada,true);
 assert.equal(h.queue.pending()[0].expectedRevision,8);
 assert.equal(posts,0,'cloud comparison must be GET only; flush uses queue sender');
 assert.equal(gets,3);
});
test('P0: UI always offers both server and local resolution, with explicit confirmation',()=>{
 assert.match(app,/Recuperar minha edição \(comparar campo a campo\)/);
 assert.match(app,/resolverConflitoCASReaplicarLocal: function/);
 assert.match(app,/palavra!=='APLICAR'/);
 assert.match(app,/decisao!=='SERVIDOR'/);
 assert.match(app,/c\.truncado/);
 assert.match(cloud,/global\.crypto\.randomUUID\(\)/);
});
test('PWA version parity',()=>{
 const cfg=fs.readFileSync('src/config.js','utf8');
 const sw=fs.readFileSync('sw.js','utf8');
 assert.equal((cfg.match(/numero: '(v[0-9.]+)'/)||[])[1],
   (sw.match(/const CACHE = 'iad-crm-(v[0-9.]+)'/)||[])[1]);
});
