'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Queue=require('../src/cas-queue.js');
function harness(){
 const values=new Map();
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const op={tenantId:'tenant-a',userId:'user-a',recordId:'op-a',table:'oportunidades',expectedRevision:7,operationId:'id-a',patch:{etapa:'Proposta'}};
 return {storage,op,values};
}
test('P0 CAS: multiple instances share one in-flight delivery and preserve ACK',async()=>{
 const h=harness();
 let sends=0,resolveSend;
 const hold=new Promise(resolve=>resolveSend=resolve);
 const send=async()=>{sends++;return hold;};
 const a=Queue.create(h.storage,{userId:'user-a',tenantId:'tenant-a'},send);
 const b=Queue.create(h.storage,{userId:'user-a',tenantId:'tenant-a'},send);
 a.enqueue(h.op);
 const p1=a.flush(),p2=b.flush();
 assert.equal(sends,1,'only one network write across instances');
 resolveSend({estado:'ok',revisao_atual:8});
 const [r1,r2]=await Promise.all([p1,p2]);
 assert.equal(r1.sent,1);assert.equal(r2.sent,1);
 assert.deepEqual(a.pending(),[]);assert.deepEqual(b.pending(),[]);
});
test('P0 CAS: conflict preserves pending operation in every instance',async()=>{
 const h=harness(); let sends=0;
 const send=async()=>{sends++;return {estado:'conflito'};};
 const a=Queue.create(h.storage,{userId:'user-a',tenantId:'tenant-a'},send);
 const b=Queue.create(h.storage,{userId:'user-a',tenantId:'tenant-a'},send);
 a.enqueue(h.op);
 const [r1,r2]=await Promise.all([a.flush(),b.flush()]);
 assert.equal(sends,1);
 assert.equal(r1.blocked,true);assert.equal(r2.blocked,true);
 assert.equal(a.pending().length,1);assert.equal(b.pending()[0].operationId,'id-a');
});
test('P0 CAS: network failure does not erase queue and allows retry',async()=>{
 const h=harness();let count=0;
 const send=async()=>{if(++count===1)throw Error('offline');return {estado:'ok',revisao_atual:8};};
 const a=Queue.create(h.storage,{userId:'user-a',tenantId:'tenant-a'},send);
 const b=Queue.create(h.storage,{userId:'user-a',tenantId:'tenant-a'},send);
 a.enqueue(h.op);
 await assert.rejects(a.flush(),/offline/);
 assert.equal(b.pending().length,1);
 const r=await b.flush();
 assert.equal(r.sent,1);assert.equal(b.pending().length,0);
});
test('P0 CAS: separate identity/tenant locks remain isolated',async()=>{
 const h=harness();
 let resolves=[],calls=0;
 const send=()=>{calls++;return new Promise(resolve=>resolves.push(resolve));};
 const a=Queue.create(h.storage,{userId:'user-a',tenantId:'tenant-a'},send);
 const opB={...h.op,tenantId:'tenant-b',operationId:'id-b'};
 const b=Queue.create(h.storage,{userId:'user-a',tenantId:'tenant-b'},send);
 a.enqueue(h.op);b.enqueue(opB);
 const p1=a.flush(),p2=b.flush();
 assert.equal(calls,2);
 resolves.forEach(resolve=>resolve({estado:'ok',revisao_atual:8}));
 await Promise.all([p1,p2]);
 assert.equal(a.pending().length,0);assert.equal(b.pending().length,0);
});
test('P0 CAS: public version and service worker match',()=>{
 const fs=require('node:fs');
 const c=fs.readFileSync('src/config.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
 assert.match(c,/numero: 'v286.45'/);
 assert.match(sw,/const CACHE = 'iad-crm-v286.45'/);
});
