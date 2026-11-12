'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const nuvem=fs.readFileSync(path.join(root,'src/nuvem.js'),'utf8');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const inicio=nuvem.indexOf('  function inspecionarPendenciasCAS(pagina) {');
const fim=nuvem.indexOf('  /* Recuperação solicitada explicitamente',inicio);
assert.ok(inicio>=0&&fim>inicio,'Função de diagnóstico paginado presente');
const codigo=nuvem.slice(inicio,fim);
function ambiente(n) {
  const ops=Array.from({length:n},(_,i)=>({
    recordId:'o'+i,tenantId:'t1',expectedRevision:1,patch:{titulo:'x'},operationId:'op'+i
  }));
  let reads=0,active=0,peak=0,posts=0,modifications=0;
  const fila={
    pending:()=>JSON.parse(JSON.stringify(ops)),
    pendingAcks:()=>[],
    satisfazRemoto:()=>false
  };
  const session={user:{id:'user1'},perfil:{tenant_id:'t1'}};
  const ctx={
    tenantsComFilaCAS:()=>['t1'],
    filaCASDaSessao:()=>fila,
    sessao:()=>session,
    chamar: async function(url,opts){
      if(opts&&opts.metodo&&opts.metodo!=='GET')posts++;
      reads++;active++;peak=Math.max(peak,active);
      await Promise.resolve();
      active--;
      return [{id:'dummy',tenant_id:'t1',revisao:1}];
    },
    Promise,Number,String,Array,Math,Object,Set,Error,encodeURIComponent
  };
  vm.createContext(ctx);
  vm.runInContext(codigo,ctx);
  return {ctx,stats:()=>({reads,active,peak,posts,modifications,ops:ops.length})};
}
test('CAS P0: 142 operações são paginadas sem eliminar pendências',async()=>{
  const v=ambiente(142);
  const primeira=await v.ctx.inspecionarPendenciasCAS();
  assert.equal(primeira.total,142);
  assert.equal(primeira.paginas,5);
  assert.equal(primeira.verificados,30);
  assert.equal(primeira.itens[0].numero,1);
  assert.equal(primeira.itens.at(-1).numero,30);
  const ultima=await v.ctx.inspecionarPendenciasCAS(5);
  assert.equal(ultima.verificados,22);
  assert.equal(ultima.itens[0].numero,121);
  assert.equal(ultima.itens.at(-1).numero,142);
  assert.deepEqual(v.stats(),{reads:52,active:0,peak:4,posts:0,modifications:0,ops:142});
});
test('CAS P0: bloqueia páginas inválidas sem tocar a fila',async()=>{
  const v=ambiente(142);
  await assert.rejects(()=>v.ctx.inspecionarPendenciasCAS(6),/inválida/);
  await assert.rejects(()=>v.ctx.inspecionarPendenciasCAS(0),/inválida/);
  await assert.rejects(()=>v.ctx.inspecionarPendenciasCAS(1.5),/inválida/);
  assert.equal(v.stats().reads,0);
});
test('CAS P0: sem operação não cria requests ou transações',async()=>{
  const v=ambiente(0);
  const r=await v.ctx.inspecionarPendenciasCAS();
  assert.equal(r.total,0);
  assert.equal(r.paginas,1);
  assert.equal(r.verificados,0);
  assert.equal(v.stats().reads,0);
});
test('CAS P0: tela informa paginação e preserva exportação e proteção',()=>{
  assert.match(app,/diagnosticarPendenciasCAS: function/);
  assert.match(app,/inspecionarPendenciasCAS\(pagina\)/);
  assert.match(app,/baixarCopiaPendenciasCAS: function/);
  assert.match(app,/comece pela primeira edição pendente da fila/);
  assert.match(nuvem,/function puxarCompleto\(forcar\)/);
  assert.match(nuvem,/fila\.pending\(\)\.length>0/);
});
