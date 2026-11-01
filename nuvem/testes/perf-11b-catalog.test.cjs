'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const uuidA='11111111-1111-4111-8111-111111111111';
const uuidB='22222222-2222-4222-8222-222222222222';
const playbook = fs.readFileSync('src/playbook.js','utf8');
const source = fs.readFileSync('src/store.js','utf8');
function criar(tenant, papel='usuario') {
  const window = {
    console,
    IADAuth:{
      atual:()=>({id: 'u1', papel, tenantId: tenant}),
      filtros:()=>({tenant,usuario:'todos'})
    }
  };
  const localStorage={getItem:()=>null,removeItem(){},setItem(){}};
  const ctx={window,console,localStorage,Math,Date,Map,Set,JSON};
  vm.runInNewContext(playbook,ctx,{filename:'playbook.js'});
  vm.runInNewContext(source,ctx,{filename:'store.js'});
  const S=window.IADStore;
  function aplicar(custom) {
    const e=S.estadoVazio();
    e.tenants=[{id:tenant,nome:'Empresa',ativo:true}];
    e.contas=[{id:'acc1',tenantId:tenant,donoId:'u1',nome:'Empresa cliente'}];
    e.oportunidades=[{id:'opp1',tenantId:tenant,donoId:'u1',contaId:'acc1',
      titulo:'Pipeline',etapa:'Diagnóstico',eventos:[],snapshots:[],
      dims:{problema:0,prioridade:0,impacto:0,criterios:0,stakeholders:0,consenso:0,risco:0,processo:0}}];
    if(custom)Object.assign(e,custom);
    S.substituir(e);
    return S.obter();
  }
  return {S,aplicar};
}
const catalogos=e=>({
  tipos:e.tiposTarefa.map(x=>({id:x.id,nome:x.nome,tenantId:x.tenantId})),
  fontes:e.fontes.map(x=>({id:x.id,nome:x.nome,tenantId:x.tenantId}))
});
test('mesmo tenant, novo bootstrap repetido não gera novos IDs',()=>{
  const x=criar(uuidA);
  const primeiro=catalogos(x.aplicar());
  const segundo=catalogos(x.aplicar());
  assert.deepEqual(segundo,primeiro);
  assert.ok(primeiro.tipos.length>0 && primeiro.fontes.length>0);
  assert.ok(primeiro.tipos.every(x=>x.tenantId===uuidA));
  assert.ok(primeiro.fontes.every(x=>x.tenantId===uuidA));
  assert.equal(new Set(primeiro.tipos.map(x=>x.id)).size,primeiro.tipos.length);
  assert.equal(new Set(primeiro.fontes.map(x=>x.id)).size,primeiro.fontes.length);
});
test('dois tenants independentes não reutilizam IDs',()=>{
  const a=catalogos(criar(uuidA).aplicar());
  const b=catalogos(criar(uuidB).aplicar());
  assert.equal(a.tipos.length,b.tipos.length);
  assert.equal(a.fontes.length,b.fontes.length);
  assert.equal(a.tipos.filter(x=>b.tipos.some(y=>x.id===y.id)).length,0);
  assert.equal(a.fontes.filter(x=>b.fontes.some(y=>x.id===y.id)).length,0);
});
test('IDs legados de catálogos persistentes e referências existentes são preservados',()=>{
  const m=criar(uuidA);
  const oldT={id:'tpt_legacy',nome:'Reunião',tenantId:uuidA,ativo:true};
  const oldF={id:'fnt_legacy',nome:'LinkedIn',tenantId:uuidA,ativo:true};
  const e=m.aplicar({
    tiposTarefa:[oldT], fontes:[oldF]
  });
  assert.ok(e.tiposTarefa.some(x=>x.id==='tpt_legacy'));
  assert.equal(e.fontes[0].id,'fnt_legacy');
  assert.equal(e.tiposTarefa.some(x=>x.nome==='Reunião'&&x.id!=='tpt_legacy'),false);
  assert.equal(e.oportunidades.length,1);
});
test('fontes livres geradas para origem são estáveis entre reinicializações',()=>{
  const m=criar(uuidA);
  const primeira=m.aplicar({fontes:[{id:'fnt_base',nome:'Outra fonte',tenantId:uuidA}],
    oportunidades:[{id:'opp1',tenantId:uuidA,donoId:'u1',contaId:'acc1',
      origem:'Feira industrial',eventos:[],snapshots:[],dims:{}}]});
  const f1=primeira.oportunidades[0].fonteId;
  assert.ok(f1);
  const segunda=m.aplicar({fontes:[{id:'fnt_base',nome:'Outra fonte',tenantId:uuidA}],
    oportunidades:[{id:'opp1',tenantId:uuidA,donoId:'u1',contaId:'acc1',
      origem:'Feira industrial',eventos:[],snapshots:[],dims:{}}]});
  assert.equal(segunda.oportunidades[0].fonteId,f1);
});
