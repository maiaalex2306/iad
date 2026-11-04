'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Queue=require('../src/cas-queue.js');
function harness(){
 const m=new Map(),storage={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};
 const identity={userId:'user1',tenantId:'tenant1'};
 let writes=0;
 const queue=Queue.create(storage,identity,async()=>{writes++;throw Error('backend should not be written');});
 const op={userId:'user1',tenantId:'tenant1',table:'oportunidades',
  recordId:'record1',operationId:'operation1',expectedRevision:7,
  patch:{etapa:'Proposta',pontuacao:22,extras:{a:1,b:2}}};
 queue.enqueue(op);
 return {queue,op,writes:()=>writes,storage};
}
function remote(extra={}){
 return {id:'record1',tenant_id:'tenant1',revisao:8,
  etapa:'Proposta',pontuacao:22,extras:{b:2,a:1},...extra};
}
test('all patch fields already applied => durable receipt, no backend write',()=>{
 const x=harness();
 assert.equal(x.queue.satisfazRemoto(x.op,remote()),true);
 const result=x.queue.reconhecerAplicada(x.op.operationId,remote());
 assert.equal(result.reconhecida,true);
 assert.equal(x.queue.pending().length,0);
 assert.equal(x.queue.pendingAcks().length,1);
 assert.equal(x.writes(),0);
});
test('remote mismatch leaves the original journal untouched',()=>{
 const x=harness();
 for(const candidate of [
  remote({pontuacao:23}),
  remote({etapa:'Outro'}),
  remote({tenant_id:'tenant2'}),
  remote({id:'different'}),
  remote({revisao:7}),
  remote({revisao:null}),
  remote({extras:{a:1}}),
  remote({etapa:null})
 ]){
  assert.equal(x.queue.satisfazRemoto(x.op,candidate),false);
  assert.throws(()=>x.queue.reconhecerAplicada(x.op.operationId,candidate));
  assert.equal(x.queue.pending().length,1);
  assert.equal(x.queue.pendingAcks().length,0);
 }
});
test('only queue head can be acknowledged; cannot forge an operation',()=>{
 const x=harness();
 assert.throws(()=>x.queue.reconhecerAplicada('other-operation',remote()));
 assert.equal(x.queue.pending().length,1);
});
test('read-only inspector classifies already applied but does not modify journal',async()=>{
 const src=fs.readFileSync('src/nuvem.js','utf8');
 const a=src.indexOf('  function inspecionarPendenciasCAS() {'),
       b=src.indexOf('  /* Cópia local explícita.',a);
 assert.ok(a>=0&&b>a);
 const x=harness();
 const ctx={Promise,Number,String,Array,encodeURIComponent,
  tenantsComFilaCAS:()=>['tenant1'],
  filaCASDaSessao:()=>x.queue,
  chamar:async()=>[remote()]};
 vm.runInNewContext(src.slice(a,b)+'globalThis.inspect=inspecionarPendenciasCAS;',ctx);
 const result=await ctx.inspect();
 assert.equal(result.itens[0].estado,'ja_aplicada');
 assert.equal(x.queue.pending().length,1);
 assert.doesNotMatch(JSON.stringify(result),/record1|tenant1|pontuacao|Proposta/);
});
test('explicit recovering path verifies one row and never sends a write',async()=>{
 const src=fs.readFileSync('src/nuvem.js','utf8'),
   a=src.indexOf('  function reconhecerEdicaoCASJaAplicada(numero) {'),
   b=src.indexOf('  /* Cópia local explícita.',a);
 assert.ok(a>=0&&b>a);
 const x=harness();
 let gets=0,post=0;
 const ctx={Promise,Number,Error,encodeURIComponent,
  tenantsComFilaCAS:()=>['tenant1'],
  filaCASDaSessao:()=>x.queue,
  chamar:async(url,opts)=>{gets++;if(opts)post++;return [remote()];},
  retomarFilaCASSeguro:async()=>({sent:0})};
 vm.runInNewContext(src.slice(a,b)+'globalThis.recover=reconhecerEdicaoCASJaAplicada;',ctx);
 const result=await ctx.recover(1);
 assert.equal(result.reconhecida,true);
 assert.equal(gets,1);assert.equal(post,0);assert.equal(x.writes(),0);
 assert.equal(x.queue.pendingAcks().length,1);
 assert.equal(x.queue.pending().length,0);
});
test('failed remote proof retains all pending work',async()=>{
 const src=fs.readFileSync('src/nuvem.js','utf8'),
   a=src.indexOf('  function reconhecerEdicaoCASJaAplicada(numero) {'),
   b=src.indexOf('  /* Cópia local explícita.',a);
 const x=harness();
 const ctx={Promise,Number,Error,encodeURIComponent,
  tenantsComFilaCAS:()=>['tenant1'],
  filaCASDaSessao:()=>x.queue,
  chamar:async()=>[remote({pontuacao:999})],
  retomarFilaCASSeguro:async()=>{}};
 vm.runInNewContext(src.slice(a,b)+'globalThis.recover=reconhecerEdicaoCASJaAplicada;',ctx);
 await assert.rejects(ctx.recover(1),/Campos divergentes/);
 assert.equal(x.queue.pending().length,1);
 assert.equal(x.queue.pendingAcks().length,0);
 assert.equal(x.writes(),0);
});
test('shell version matches app',()=>{
 const cfg=fs.readFileSync('src/config.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
 assert.match(cfg,/numero: 'v286.41'/);
 assert.match(sw,/const CACHE = 'iad-crm-v286.41'/);
});
