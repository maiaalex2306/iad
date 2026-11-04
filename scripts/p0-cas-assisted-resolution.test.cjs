'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Queue=require('../src/cas-queue.js');
function harness(){
 const values=new Map();let failQueueOnce=false,writes=0;
 const storage={getItem:k=>values.get(k)||null,setItem(k,v){
  if(failQueueOnce&&k==='iad-crm:cas:v273:tenant1:user1'){
   failQueueOnce=false;throw Error('storage write interrupted');
  }
  values.set(k,v);
 }};
 const queue=Queue.create(storage,{userId:'user1',tenantId:'tenant1'},
   async()=>{writes++;throw Error('must never send remote write');});
 const op={userId:'user1',tenantId:'tenant1',table:'oportunidades',
  recordId:'lead1',operationId:'write-1',expectedRevision:7,
  patch:{etapa:'Novo',valor:1500}};
 queue.enqueue(op);
 const remote={id:'lead1',tenant_id:'tenant1',revisao:8,etapa:'Perdido',valor:1600};
 return {queue,op,remote,storage,values,writes:()=>writes,interrupt:()=>{failQueueOnce=true;}};
}
test('explicit server choice archives full local edit before unblocking',()=>{
 const h=harness();
 const r=h.queue.manterServidor(h.op.operationId,h.remote,8);
 assert.equal(r.arquivada,true);
 assert.equal(h.queue.pending().length,0);
 assert.equal(h.queue.archived().length,1);
 assert.deepEqual(h.queue.archived()[0].operation.patch,h.op.patch);
 assert.equal(h.writes(),0);
});
test('server revision drift and identity mismatch preserve entire journal',()=>{
 for(const modification of [{revisao:9},{id:'another'},{tenant_id:'another'},{revisao:null},{revisao:7}]){
  const h=harness();
  assert.throws(()=>h.queue.manterServidor(h.op.operationId,{...h.remote,...modification},8));
  assert.equal(h.queue.pending().length,1);
  assert.equal(h.queue.archived().length,0);
 }
});
test('already-applied edit cannot be archived as a conflicting edit',()=>{
 const h=harness();
 assert.throws(()=>h.queue.manterServidor(h.op.operationId,
   {...h.remote,etapa:'Novo',valor:1500},8));
 assert.equal(h.queue.pending().length,1);
});
test('storage interruption preserves durable archive; retry is idempotent',()=>{
 const h=harness();h.interrupt();
 assert.throws(()=>h.queue.manterServidor(h.op.operationId,h.remote,8),/interrupted/);
 assert.equal(h.queue.pending().length,1);
 assert.equal(h.queue.archived().length,1);
 const r=h.queue.manterServidor(h.op.operationId,h.remote,8);
 assert.equal(r.arquivada,true);
 assert.equal(h.queue.pending().length,0);
 assert.equal(h.queue.archived().length,1);
});
test('only queue head may be archived; no duplicate removal',()=>{
 const h=harness();
 assert.throws(()=>h.queue.manterServidor('write-2',h.remote,8));
 assert.equal(h.queue.pending().length,1);
});
test('comparison is read-only; archived operation appears in local export',async()=>{
 const cloud=fs.readFileSync('src/nuvem.js','utf8');
 const a=cloud.indexOf('  function conflitoCASPrimeiraOperacao(numero) {');
 const b=cloud.indexOf('  /* Cópia local explícita.',a);
 assert.ok(a>=0&&b>a);
 const h=harness();
 let gets=0,posts=0;
 const ctx={Promise,Number,Error,Object,Array,encodeURIComponent,
  tenantsComFilaCAS:()=>['tenant1'],filaCASDaSessao:()=>h.queue,
  chamar:async(url,opts)=>{gets++;if(opts)posts++;return [h.remote];},
  retomarFilaCASSeguro:async()=>{throw Error('must not auto flush');},
  diagnosticoPendenciasCAS:()=>({disponivel:true,quantidade:h.queue.pending().length+h.queue.pendingAcks().length})};
 vm.runInNewContext(cloud.slice(a,b)+
 'globalThis.preview=lerConflitoCAS;globalThis.resolve=resolverConflitoCASManterServidor;',ctx);
 const preview=await ctx.preview(1);
 assert.equal(preview.campos.length,2);
 assert.equal(preview.campos[0].campo,'etapa');
 assert.equal(preview.campos[0].local,'"Novo"');
 assert.equal(preview.campos[0].servidor,'"Perdido"');
 assert.equal(h.queue.pending().length,1);
 assert.equal(h.queue.archived().length,0);
 const result=await ctx.resolve(1,preview.revisaoServidor);
 assert.equal(result.arquivada,true);
 assert.equal(h.queue.pending().length,0);
 assert.equal(h.queue.archived().length,1);
 assert.equal(gets,2);assert.equal(posts,0);
 assert.equal(h.writes(),0);
 assert.match(cloud,/historicoResolvidoPreservado/);
});
test('comparison failure never archives or removes local operation',async()=>{
 const cloud=fs.readFileSync('src/nuvem.js','utf8'),
   a=cloud.indexOf('  function conflitoCASPrimeiraOperacao(numero) {'),
   b=cloud.indexOf('  /* Cópia local explícita.',a);
 const h=harness();
 const ctx={Promise,Number,Error,Object,Array,encodeURIComponent,
  tenantsComFilaCAS:()=>['tenant1'],filaCASDaSessao:()=>h.queue,
  chamar:async()=>[{...h.remote,revisao:10}],
  retomarFilaCASSeguro:async()=>{throw Error('must not auto flush');},
  diagnosticoPendenciasCAS:()=>({disponivel:true,quantidade:h.queue.pending().length+h.queue.pendingAcks().length})};
 vm.runInNewContext(cloud.slice(a,b)+'globalThis.resolve=resolverConflitoCASManterServidor;',ctx);
 await assert.rejects(ctx.resolve(1,8),/Revisao remota mudou/);
 assert.equal(h.queue.pending().length,1);
 assert.equal(h.queue.archived().length,0);
});
test('app requires explicit server choice and release is coordinated',()=>{
 const app=fs.readFileSync('src/app.js','utf8');
 assert.match(app,/Comparar e resolver conflito/);
 assert.match(app,/decisao!=='SERVIDOR'/);
 assert.match(app,/resolverConflitoCASManterServidor: function/);
 assert.match(fs.readFileSync('src/config.js','utf8'),/numero: 'v286.42'/);
 assert.match(fs.readFileSync('sw.js','utf8'),/const CACHE = 'iad-crm-v286.42'/);
});
