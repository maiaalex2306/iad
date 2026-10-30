const test=require('node:test');
const assert=require('node:assert/strict');
const Queue=require('../../src/cas-queue.js');
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}}
const id={userId:'u1',tenantId:'t1'};
const op={userId:'u1',tenantId:'t1',operationId:'evt1',recordId:'o1',expectedRevision:2,patch:{titulo:'novo'}};
test('journal durable across instances and scoped identity',()=>{
 const s=storage();const a=Queue.create(s,id,async()=>({estado:'ok'}));
 a.enqueue(op);assert.equal(Queue.create(s,id,async()=>{}).pending().length,1);
 assert.equal(Queue.create(s,{userId:'u2',tenantId:'t1'},async()=>{}).pending().length,0);
 assert.throws(()=>a.enqueue({...op,userId:'u2'}));
});
test('same idempotency key can only repeat identical request',()=>{
 const q=Queue.create(storage(),id,async()=>({estado:'ok'}));
 q.enqueue(op);assert.equal(q.enqueue(op),1);
 assert.throws(()=>q.enqueue({...op,patch:{titulo:'diferente'}}));
});
test('ack removes queue entry; conflict retains operation',async()=>{
 const q=Queue.create(storage(),id,async()=>({estado:'conflito_ou_inacessivel'}));
 q.enqueue(op);assert.equal((await q.flush()).blocked,true);assert.equal(q.pending().length,1);
 const good=Queue.create(storage(),id,async()=>({estado:'ok'}));
 good.enqueue(op);assert.equal((await good.flush()).sent,1);assert.equal(good.pending().length,0);
});
test('transport failures retain operation',async()=>{
 const q=Queue.create(storage(),id,async()=>{throw Error('offline')});
 q.enqueue(op);await assert.rejects(q.flush());assert.equal(q.pending().length,1);
});