'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../../src/cas-queue.js');
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};}
const identity={userId:'u1',tenantId:'tenant1'};
test('two concurrent flushes send exactly once and both observe ACK',async()=>{
 let resolve, calls=0;const pending=new Promise(r=>resolve=r);
 const queue=create(storage(),identity,async()=>{calls++;await pending;return {estado:'ok',revisao_atual:2};});
 queue.enqueue({...identity,operationId:'op1',recordId:'record1'});
 const a=queue.flush(),b=queue.flush();assert.equal(calls,1);
 resolve();const [r1,r2]=await Promise.all([a,b]);
 assert.equal(r1.sent,1);assert.equal(r2.sent,1);
 assert.equal(r1.busy,undefined);assert.equal(r2.busy,undefined);
 assert.equal(queue.pending().length,0);assert.equal(calls,1);
});
test('blocked conflict remains persisted, not erased',async()=>{
 let calls=0;const queue=create(storage(),identity,async()=>{calls++;return {estado:'conflito'};});
 queue.enqueue({...identity,operationId:'op2',recordId:'record2'});
 const [a,b]=await Promise.all([queue.flush(),queue.flush()]);
 assert.equal(a.blocked,true);assert.equal(b.blocked,true);assert.equal(queue.pending().length,1);
 await queue.flush();assert.equal(calls,2);assert.equal(queue.pending().length,1);
});
test('retry after acknowledged in-flight finishes',async()=>{
 const queue=create(storage(),identity,async()=>({estado:'ok',revisao_atual:7}));
 queue.enqueue({...identity,operationId:'op3',recordId:'record3'});
 await queue.flush();
 queue.enqueue({...identity,operationId:'op4',recordId:'record4'});
 const next=await queue.flush();assert.equal(next.sent,1);assert.equal(queue.pending().length,0);
});
