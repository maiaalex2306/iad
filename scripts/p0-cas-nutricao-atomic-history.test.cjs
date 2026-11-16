'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Queue=require('../src/cas-queue.js');
const nuvem=fs.readFileSync('src/nuvem.js','utf8');
const store=fs.readFileSync('src/store.js','utf8');
const app=fs.readFileSync('src/app.js','utf8');
function make(){
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 let sends=0;const dispatched=[];
 const queue=Queue.create(storage,{tenantId:'tenant1',userId:'user1'},async op=>{
  sends++;dispatched.push(op);return {estado:'ok',revisao_atual:5};
 });
 const old={desde:'2026-11-16',motivo:'Outro motivo (descreva abaixo)',
  motivoTexto:'Neste momento optamos por não seguir.',revisarEm:'2027-02-14',
  porQuem:'autor-servidor'};
 const desired={desde:'2026-11-16',motivo:'Sem orçamento neste ciclo; volta no próximo',
  motivoTexto:'',revisarEm:'2027-02-14',porQuem:'autor-local'};
 const op={userId:'user1',tenantId:'tenant1',table:'oportunidades',
  recordId:'opp1',operationId:'old-cas-12345678',expectedRevision:0,
  patch:{proximo_compromisso:null,nutricao:desired}};
 const remote={id:'opp1',tenant_id:'tenant1',revisao:4,proximo_compromisso:null,
   nutricao:old,historico_nutricao:[]};
 queue.enqueue(op);
 return {queue,op,remote,old,desired,dispatched,sends:()=>sends,storage};
}
test('P0: uma transação CAS inclui motivo novo e histórico anterior com autoria',async()=>{
 const h=make(),r=h.queue.reaplicarLocal(h.op.operationId,h.remote,4,
  ['nutricao'],'new-cas-12345678');
 assert.equal(r.enfileirada,true);
 const next=h.queue.pending()[0];
 assert.equal(next.expectedRevision,4);
 assert.deepEqual(next.patch.nutricao,h.desired);
 assert.equal(next.patch.historico_nutricao.length,1);
 const history=next.patch.historico_nutricao[0];
 assert.equal(history.motivoTexto,h.old.motivoTexto);
 assert.equal(history.porQuem,h.old.porQuem);
 assert.equal(history.revisaoAnterior,4);
 assert.equal(history.tipoMovimento,'conciliacao_cas');
 assert.equal(history.operacaoCasOriginal,h.op.operationId);
 assert.equal(next.patch.proximo_compromisso,undefined);
 assert.deepEqual(h.queue.archived()[0].operation.patch,h.op.patch);
 assert.equal(h.sends(),0);
 await h.queue.flush();
 assert.equal(h.sends(),1);
 assert.deepEqual(h.dispatched[0].patch,next.patch);
 assert.equal(h.queue.pendingAcks().length,1);
});
test('P0: historico existente deve ser acrescentado, nunca substituído',()=>{
 const h=make();
 h.remote.historico_nutricao=[{motivo:'Anterior a todos',porQuem:'autor-mais-antigo'}];
 h.queue.reaplicarLocal(h.op.operationId,h.remote,4,['nutricao'],'new-cas-12345678');
 const entries=h.queue.pending()[0].patch.historico_nutricao;
 assert.equal(entries.length,2);
 assert.deepEqual(entries[0],{motivo:'Anterior a todos',porQuem:'autor-mais-antigo'});
 assert.equal(entries[1].motivo,h.old.motivo);
});
test('P0: histórico ausente ou adulterado interrompe antes de arquivar/alterar a fila',()=>{
 for(const value of [null,undefined,{},'not-an-array']){
  const h=make();h.remote.historico_nutricao=value;
  assert.throws(()=>h.queue.reaplicarLocal(h.op.operationId,h.remote,4,
    ['nutricao'],'new-cas-12345678'),/Histórico remoto/);
  assert.deepEqual(h.queue.pending()[0],h.op);
  assert.equal(h.queue.archived().length,0);
 }
});
test('P0: histórico não pode ser sobrescrito diretamente por seleção do usuário',()=>{
 const h=make();h.op.patch.historico_nutricao=[];
 // Original already persisted; add an explicit second operation to test protected selection
 h.queue.enqueue({...h.op,operationId:'second-op-12345678'});
 assert.throws(()=>h.queue.reaplicarLocal(h.op.operationId,h.remote,4,
  ['historico_nutricao'],'new-cas-12345678'));
 assert.equal(h.queue.pending().length,2);
});
test('P0: revisão e identidade devem impedir escrever histórico obsoleto',()=>{
 for(const delta of [{revisao:5},{id:'outro'},{tenant_id:'outra'}]){
  const h=make();assert.throws(()=>h.queue.reaplicarLocal(h.op.operationId,
   {...h.remote,...delta},4,['nutricao'],'new-cas-12345678'));
  assert.equal(h.queue.archived().length,0);
  assert.equal(h.queue.pending().length,1);
 }
});
test('P0: patch idêntico após correção pode ser reconhecido sem apagar histórico',()=>{
 const h=make(),remote={...h.remote,nutricao:h.desired,
   historico_nutricao:[{...h.old,tipoMovimento:'conciliacao_cas'}],revisao:5};
 assert.equal(h.queue.satisfazRemoto(h.op,remote),true);
 const r=h.queue.reconhecerAplicada(h.op.operationId,remote);
 assert.equal(r.reconhecida,true);
 assert.equal(h.queue.pending().length,0);
 assert.equal(h.queue.pendingAcks().length,1);
 assert.equal(h.sends(),0);
});
test('P0: código de conflito REAL do Supabase aciona prova GET idempotente',async()=>{
 const h=make();
 const q=Queue.create(h.storage,{tenantId:'tenant1',userId:'user1'},
   async()=>({estado:'conflito_ou_inacessivel'}));
 const updated={...h.remote,nutricao:h.desired,revisao:5,
  historico_nutricao:[{...h.old,tipoMovimento:'conciliacao_cas'}]};
 const begin=nuvem.indexOf('  function retomarFilaCAS() {');
 const end=nuvem.indexOf('  /* Diagnóstico P0 somente quantitativo',begin);
 assert.ok(begin>=0&&end>begin);
 let proofs=0,reads=0;
 const ctx={Promise,Error,String,Number,encodeURIComponent,
  tenantsComFilaCAS:()=>['tenant1'],filaCASDaSessao:()=>q,
  Store:{obter:()=>({oportunidades:[]}),memorizarRevisoesRemotas:()=>{}},
  paraApp:x=>({id:x.id,tenantId:x.tenant_id,revisao:x.revisao}),
  chamar:async()=>{reads++;return [updated];},
  conciliarCASJaAplicadasSomenteLeitura:async()=>{
   proofs++;
   assert.ok(q.satisfazRemoto(h.op,updated),'all local patch fields must match');
   q.reconhecerAplicada(h.op.operationId,updated);
   return {reconhecidas:1,recibosConciliados:0};
  }};
 vm.runInNewContext(nuvem.slice(begin,end)+'globalThis.retake=retomarFilaCASSeguro;',ctx);
 await ctx.retake();
 assert.equal(q.pending().length,0);
 assert.equal(q.pendingAcks().length,0);
 assert.equal(proofs,1);
 assert.equal(reads,1);
});
test('P0: RLS sem prova jamais remove a fila',async()=>{
 const h=make();
 const q=Queue.create(h.storage,{tenantId:'tenant1',userId:'user1'},
   async()=>({estado:'conflito_ou_inacessivel'}));
 const begin=nuvem.indexOf('  function retomarFilaCAS() {');
 const end=nuvem.indexOf('  /* Diagnóstico P0 somente quantitativo',begin);
 let proofs=0;
 const ctx={Promise,Error,String,Number,encodeURIComponent,
  tenantsComFilaCAS:()=>['tenant1'],filaCASDaSessao:()=>q,
  Store:{obter:()=>({oportunidades:[]}),memorizarRevisoesRemotas:()=>{}},
  paraApp:x=>x,chamar:async()=>[],
  conciliarCASJaAplicadasSomenteLeitura:async()=>{
    proofs++;return {reconhecidas:0,recibosConciliados:0};
  }};
 vm.runInNewContext(nuvem.slice(begin,end)+'globalThis.retake=retomarFilaCASSeguro;',ctx);
 await assert.rejects(ctx.retake(),/Conflito de revisão no servidor/);
 assert.equal(proofs,1);
 assert.equal(q.pending().length,1);
});
test('P0: colocação normal em nutrição preserva motivo anterior sem falsa retomada',()=>{
 const begin=store.indexOf('  function colocarEmNutricao(id, dados) {');
 const end=store.indexOf('  function retomarNutricao(id, porque) {',begin);
 assert.ok(begin>=0&&end>begin);
 const opp={id:'opp1',nutricao:{desde:'2026-11-15',motivo:'Anterior',
   motivoTexto:'Desinteresse neste momento',porQuem:'autor1',revisarEm:'2027-02-14'}};
 let saved=0;
 const ctx={Object,JSON,contexto:()=>({usuario:{id:'autor2'}}),
  oportunidade:()=>opp,hoje:()=> '2026-11-16',salvar:()=>{saved++;}};
 vm.runInNewContext(store.slice(begin,end)+'globalThis.colocar=colocarEmNutricao;',ctx);
 ctx.colocar('opp1',{motivo:'Sem orçamento neste ciclo; volta no próximo',
    revisarEm:'2027-02-14'});
 assert.equal(opp.nutricao.porQuem,'autor2');
 assert.equal(opp.historicoNutricao.length,1);
 assert.equal(opp.historicoNutricao[0].porQuem,'autor1');
 assert.equal(opp.historicoNutricao[0].motivoTexto,'Desinteresse neste momento');
 assert.equal(opp.historicoNutricao[0].tipoMovimento,'alteracao_nutricao');
 assert.equal('retomadaEm' in opp.historicoNutricao[0],false);
 ctx.colocar('opp1',{motivo:'Sem orçamento neste ciclo; volta no próximo',
    revisarEm:'2027-02-14'});
 assert.equal(opp.historicoNutricao.length,1,'no duplicates on repeated same edit');
 assert.equal(saved,2);
});
test('P0: interface exige confirmação humana para reaplicação local',()=>{
 assert.match(app,/resolverConflitoCASReaplicarLocal: function/);
 assert.match(app,/palavra!=='APLICAR'/);
 assert.match(app,/inc[lL]uiNutricao/);
 assert.match(app,/historico_nutricao/);
});
test('PWA cache and UI version remain aligned',()=>{
 const config=fs.readFileSync('src/config.js','utf8');
 const sw=fs.readFileSync('sw.js','utf8');
 const v=(config.match(/numero: '(v286\.\d+)'/)||[])[1];
 assert.ok(v);
 assert.equal((sw.match(/iad-crm-(v286\.\d+)/)||[])[1],v);
});
