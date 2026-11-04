'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Queue=require('../src/cas-queue.js');
const source=fs.readFileSync('src/nuvem.js','utf8');
const begin=source.indexOf('  function retomarFilaCAS() {');
const end=source.indexOf('  /* CAS P0: reenvios simult',begin);
assert.ok(begin>=0&&end>begin,'CAS recovery logic found');
function setup(){
 const data=new Map(),storage={
  getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)
 };
 const identity={userId:'u',tenantId:'t'};
 const mk=n=>({userId:'u',tenantId:'t',operationId:'id'+n,recordId:'op'+n,
   table:'oportunidades',expectedRevision:7,patch:{etapa:'Proposta'}});
 let sends=0,readFails=false,reads=0,conflict=false;
 const send=async op=>{sends++;return conflict&&op.operationId==='id2'
  ? {estado:'conflito'}:{estado:'ok',revisao_atual:8};};
 const queue=()=>Queue.create(storage,identity,send);
 const local=[{id:'op1',tenantId:'t',revisao:7},{id:'op2',tenantId:'t',revisao:7}];
 const Store={obter:()=>({oportunidades:local}),memorizarRevisoesRemotas:()=>{}};
 const ctx={Promise,Error,String,Number,encodeURIComponent,Store,
  tenantsComFilaCAS:()=>['t'],filaCASDaSessao:()=>queue(),
  chamar:async url=>{reads++;if(readFails)throw Error('offline');
   const id=url.includes('op2')?'op2':'op1';
   return [{id,tenantId:'t',revisao:8}];},paraApp:r=>r};
 vm.runInNewContext(source.slice(begin,end)+'globalThis.restore=retomarFilaCAS;',ctx);
 return {queue,local,mk,restore:ctx.restore,sends:()=>sends,reads:()=>reads,
  offline:v=>readFails=v,conflict:v=>conflict=v};
}
test('server ACK survives a failed remote reconciliation and reload',async()=>{
 const e=setup();e.queue().enqueue(e.mk(1));
 e.offline(true);
 await assert.rejects(e.restore(),/offline/);
 assert.equal(e.sends(),1);
 assert.equal(e.queue().pending().length,0);
 assert.equal(e.queue().pendingAcks().length,1);
 assert.equal(e.local[0].revisao,7);
 e.offline(false);
 await e.restore();
 assert.equal(e.sends(),1,'server is not called again for acknowledged operation');
 assert.equal(e.local[0].revisao,8);
 assert.equal(e.queue().pendingAcks().length,0);
});
test('written receipt before queue removal prevents duplicate send on crash',async()=>{
 const e=setup(),q=e.queue(),op=e.mk(1);
 q.enqueue(op);
 let key,receiptKey;
 // Verify normal committed operation is not sent again while receipt awaits reconciliation.
 await q.flush();
 assert.equal(e.sends(),1);
 q.enqueue(op);
 assert.equal(q.pending().length,0);
 await e.restore();
 assert.equal(e.sends(),1);
 assert.equal(e.queue().pendingAcks().length,0);
});
test('conflicting later operation remains protected while earlier ACK is verified',async()=>{
 const e=setup();e.conflict(true);
 e.queue().enqueue(e.mk(1));e.queue().enqueue(e.mk(2));
 await assert.rejects(e.restore(),/Conflito de revisão/);
 assert.equal(e.local[0].revisao,8);
 assert.equal(e.local[1].revisao,7);
 assert.equal(e.queue().pendingAcks().length,0);
 assert.equal(e.queue().pending().length,1);
 assert.equal(e.queue().pending()[0].operationId,'id2');
});
test('invalid receipt journal blocks access and cannot be silently erased',()=>{
 const source=fs.readFileSync('src/cas-queue.js','utf8');
 assert.match(source,/Recibos CAS invalidos/);
 assert.match(source,/persistReceipt\(op,res\.revisao_atual\)/);
 assert.match(source,/confirmReceipt/);
 const cloud=fs.readFileSync('src/nuvem.js','utf8');
 assert.match(cloud,/fila\.pendingAcks\(\)\.length/);
 assert.match(cloud,/recibosConfirmadosPendentesDeConciliacao/);
});
test('application and PWA version aligned',()=>{
 const cfg=fs.readFileSync('src/config.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
 assert.match(cfg,/numero: 'v286.43'/);
 assert.match(sw,/const CACHE = 'iad-crm-v286.43'/);
});
