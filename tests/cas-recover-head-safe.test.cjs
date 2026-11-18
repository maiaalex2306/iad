'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Queue=require('../src/cas-queue.js');
const src=fs.readFileSync('src/nuvem.js','utf8');
const app=fs.readFileSync('src/app.js','utf8');
const a=src.indexOf('  function conciliarCASJaAplicadasSomenteLeitura() {');
const b=src.indexOf('  /* P0 CAS: comparar em memoria',a);
assert.ok(a>=0&&b>a,'rotina de recuperação encontrada');
const codigo=src.slice(a,b);
function setup(quantidade, scenario='aplicada'){
  const db=new Map(),storage={getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v)};
  const fila=Queue.create(storage,{userId:'u1',tenantId:'t1'},async()=>{throw Error('RPC proibida');});
  for(let i=0;i<quantidade;i++)fila.enqueue({userId:'u1',tenantId:'t1',table:'oportunidades',
    recordId:'r'+i,operationId:'op'+i,expectedRevision:1,patch:{etapa:'proposta'}});
  const session={user:{id:'u1'},perfil:{tenant_id:'t1',papel:'gestor'}};
  let gets=0,posts=0;
  const ctx={Promise,Number,String,Array,Object,Error,encodeURIComponent,
    sessao:()=>session,tenantsComFilaCAS:()=>['t1'],filaCASDaSessao:()=>fila,
    diagnosticoPendenciasCAS:()=>({disponivel:true,quantidade:fila.pending().length+fila.pendingAcks().length}),
    chamar:async(path,opcoes)=>{
      gets++;if(opcoes&&opcoes.metodo&&opcoes.metodo!=='GET')posts++;
      if(scenario==='troca'&&gets===1)session.perfil.tenant_id='t2';
      const id=decodeURIComponent(path.match(/id=eq\.([^&]+)/)[1]);
      return [{id,tenant_id:'t1',revisao:2,etapa:scenario==='conflito'?'perdida':'proposta'}];
    }
  };
  vm.createContext(ctx);
  vm.runInContext(codigo,ctx);
  return {ctx,fila,session,reads:()=>gets,posts:()=>posts,storage};
}
test('CAS: 37 operações já aplicadas são conciliadas com prova, sem POST ou perda',async()=>{
 const h=setup(37);
 const r=await h.ctx.conciliarCASJaAplicadasSomenteLeitura();
 assert.equal(r.reconhecidas,37);
 assert.equal(r.recibosConciliados,37);
 assert.equal(r.restantes,0);
 assert.equal(h.fila.pending().length,0);
 assert.equal(h.fila.pendingAcks().length,0);
 assert.equal(h.reads(),74);
 assert.equal(h.posts(),0);
});
test('CAS: primeira operação conflitante mantém todas as 37 edições',async()=>{
 const h=setup(37,'conflito');
 const r=await h.ctx.conciliarCASJaAplicadasSomenteLeitura();
 assert.equal(r.reconhecidas,0);
 assert.equal(r.restantes,37);
 assert.equal(h.fila.pending().length,37);
 assert.match(r.motivo,/Primeira edição/);
 assert.equal(h.posts(),0);
});
test('CAS: alteração de sessão/empresa interrompe sem apagar fila',async()=>{
 const h=setup(2,'troca');
 await assert.rejects(h.ctx.conciliarCASJaAplicadasSomenteLeitura(),/Sessão ou empresa mudou/);
 assert.equal(h.fila.pending().length,2);
});
test('CAS: UI exige confirmação de backup e oferece leitura protegida',()=>{
 assert.match(app,/conciliarCASComprovadas: function/);
 assert.match(app,/você salvou a cópia das edições pendentes/);
 assert.match(app,/Reconhecer automaticamente edições já confirmadas/);
 assert.match(app,/Consultar carteira do servidor \(somente leitura\)/);
 assert.doesNotMatch(codigo,/retomarFilaCASSeguro|\.flush\(|metodo:\s*'POST'|metodo:\s*'DELETE'/);
});
