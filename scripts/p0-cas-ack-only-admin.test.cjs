'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Queue=require('../src/cas-queue.js');
const src=fs.readFileSync('src/nuvem.js','utf8');
const begin=src.indexOf('  function tenantsComFilaCAS() {');
const end=src.indexOf('  /* CAS P0: reenvios simult',begin);
assert.ok(begin>=0&&end>begin,'real tenant discovery and resume implementation found');
function fixture(role='admin'){
 const map=new Map();
 const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),
  removeItem:k=>map.delete(k),key:i=>Array.from(map.keys())[i]??null,
  get length(){return map.size;}};
 const session={user:{id:'admin-1'},perfil:{tenant_id:'A',papel:role}};
 const queue=t=>Queue.create(storage,{userId:'admin-1',tenantId:t},
  async()=>({estado:'ok',revisao_atual:8}));
 const op={userId:'admin-1',tenantId:'B',recordId:'opp-b',operationId:'write-b',
  expectedRevision:7,table:'oportunidades',patch:{etapa:'Proposta'}};
 const ctx={Promise,Error,Number,String,Set,encodeURIComponent,decodeURIComponent,
  sessao:()=>session,global:{localStorage:storage},filaCASDaSessao:t=>queue(t),
  Store:{obter:()=>({oportunidades:[{id:'opp-b',tenantId:'B',revisao:7}]}),
   memorizarRevisoesRemotas:()=>{}},
  chamar:async()=>[{id:'opp-b',tenantId:'B',revisao:8}],paraApp:v=>v};
 vm.runInNewContext(src.slice(begin,end)+
  'globalThis.listTenants=tenantsComFilaCAS;globalThis.restore=retomarFilaCAS;',ctx);
 return {queue,op,storage,ctx,map};
}
test('admin discovers ACK-only tenant B even after queue key is removed',async()=>{
 const f=fixture();
 f.queue('B').enqueue(f.op);await f.queue('B').flush();
 assert.equal(f.queue('B').pendingAcks().length,1);
 const key='iad-crm:cas:v273:B:admin-1';
 f.storage.removeItem(key);
 assert.deepEqual([...f.ctx.listTenants()],['A','B']);
 await f.ctx.restore();
 assert.equal(f.queue('B').pendingAcks().length,0);
});
test('non-admin never enumerates another tenant receipt',async()=>{
 const f=fixture('usuario');
 f.queue('B').enqueue(f.op);await f.queue('B').flush();
 f.storage.removeItem('iad-crm:cas:v273:B:admin-1');
 assert.deepEqual([...f.ctx.listTenants()],['A']);
 assert.equal(f.queue('B').pendingAcks().length,1);
});
test('encoded tenant IDs round-trip from ACK-only keys',async()=>{
 const f=fixture();
 const op={...f.op,tenantId:'tenant:multi/region',operationId:'weird'};
 f.queue(op.tenantId).enqueue(op);await f.queue(op.tenantId).flush();
 f.storage.removeItem('iad-crm:cas:v273:'+encodeURIComponent(op.tenantId)+':admin-1');
 assert.ok([...f.ctx.listTenants()].includes(op.tenantId));
});
test('release and service worker version match',()=>{
 const cfg=fs.readFileSync('src/config.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
 assert.match(cfg,/numero: 'v286.39'/);
 assert.match(sw,/const CACHE = 'iad-crm-v286.39'/);
});
