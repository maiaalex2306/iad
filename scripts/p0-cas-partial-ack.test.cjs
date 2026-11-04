'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Queue=require('../src/cas-queue.js');
const source=fs.readFileSync('src/nuvem.js','utf8');
const begin=source.indexOf('  function retomarFilaCAS() {');
const end=source.indexOf('  /* CAS P0: reenvios simult',begin);
assert.ok(begin>=0&&end>begin,'recovery implementation available');
function environment(){
 const data=new Map();
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 const identity={userId:'u',tenantId:'t'};
 const mk=(n,revision)=>({userId:'u',tenantId:'t',table:'oportunidades',
  recordId:'op'+n,operationId:'id'+n,expectedRevision:revision,patch:{etapa:'Proposta'}});
 let sends=0;
 const send=async op=>{sends++;return op.operationId==='id2'
   ? {estado:'conflito'}:{estado:'ok',revisao_atual:8};};
 const queue=Queue.create(storage,identity,send);
 queue.enqueue(mk(1,7));queue.enqueue(mk(2,7));
 const local=[{id:'op1',tenantId:'t',revisao:7},{id:'op2',tenantId:'t',revisao:7}];
 let reads=[];
 const Store={obter:()=>({oportunidades:local}),memorizarRevisoesRemotas:()=>{}};
 const ctx={Promise,Error,String,Number,encodeURIComponent,
   tenantsComFilaCAS:()=>['t'],filaCASDaSessao:()=>Queue.create(storage,identity,send),
   chamar:async url=>{reads.push(url);return [{id:'op1',tenantId:'t',revisao:8}];},
   paraApp:r=>r,Store};
 vm.runInNewContext(source.slice(begin,end)+'\nglobalThis.restore=retomarFilaCAS;',ctx);
 return {queue,local,reads,sends:()=>sends,restore:ctx.restore};
}
test('partial ACK retained on blocked CAS response; unconfirmed op remains',async()=>{
 const e=environment();const r=await e.queue.flush();
 assert.equal(r.blocked,true);
 assert.equal(r.sent,1);
 assert.equal(r.acks.length,1);
 assert.equal(r.acks[0].operationId,'id1');
 assert.equal(e.queue.pending().length,1);
 assert.equal(e.queue.pending()[0].operationId,'id2');
});
test('resume reconciles already-confirmed operation BEFORE surfacing conflict',async()=>{
 const e=environment();
 await assert.rejects(e.restore(),/Conflito de revisão no servidor/);
 assert.equal(e.local[0].revisao,8);
 assert.equal(e.local[1].revisao,7);
 assert.equal(e.reads.length,1);
 assert.equal(e.queue.pending()[0].operationId,'id2');
 assert.equal(e.sends(),2);
});
test('durable ACK is reconciled once; conflict remains without fabricated ACK',async()=>{
 const e=environment();
 await e.queue.flush(); // first acknowledged, second conflicting
 assert.equal(e.queue.pendingAcks().length,1);
 await assert.rejects(e.restore(),/Conflito de revisão no servidor/);
 assert.equal(e.reads.length,1);
 assert.equal(e.queue.pendingAcks().length,0);
 assert.equal(e.queue.pending().length,1);
 await assert.rejects(e.restore(),/Conflito de revisão no servidor/);
 assert.equal(e.reads.length,1,'conflicting operation has no manufactured receipt');
});
test('PWA version matches',()=>{
 const config=fs.readFileSync('src/config.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
 assert.match(config,/numero: 'v286.43'/);
 assert.match(sw,/const CACHE = 'iad-crm-v286.43'/);
});
