'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const storeSrc=fs.readFileSync(path.join(root,'src/store.js'),'utf8');
const viewsSrc=fs.readFileSync(path.join(root,'src/views.js'),'utf8');

function preparar(){
  let usuario={id:'u-a',papel:'gestor',tenantId:'tenant-a'};
  let filtros={tenant:'todas',usuario:'todos'};
  const w={console,localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    IADAuth:{atual:()=>usuario,filtros:()=>filtros}};
  vm.runInNewContext(storeSrc,{window:w,console,Date,Map,Set,JSON,Math},
    {filename:'store.js'});
  return {S:w.IADStore,e:w.IADStore.obter(),user:u=>{usuario=u;},
    filters:f=>{filtros=f;}};
}
function comparar(x,contaId) {
  const baseline=x.S.dados().oportunidades.filter(op=>op.contaId===contaId);
  const indice=x.S.oportunidadesDaConta(contaId);
  assert.deepEqual(Array.from(indice,op=>op.id),baseline.map(op=>op.id));
  assert.ok(Array.from(indice).every((op,i)=>op===baseline[i]),'referencias e ordem');
  assert.notStrictEqual(indice,x.S.oportunidadesDaConta(contaId),'nao expor bucket de cache');
}
test('paridade do bucket com ID tipado, duplicado e nao associado',()=>{
  const x=preparar(),e=x.e;
  e.oportunidades=[
    {id:'a1',contaId:'c',tenantId:'tenant-a',donoId:'u-a'},
    {id:'b1',contaId:'c',tenantId:'tenant-b',donoId:'u-b'},
    {id:'a2',contaId:'c',tenantId:'tenant-a',donoId:'u-b'},
    {id:'a1',contaId:'c',tenantId:'tenant-a',donoId:'u-a'},
    {id:'numeric',contaId:1,tenantId:'tenant-a',donoId:'u-a'},
    {id:'string',contaId:'1',tenantId:'tenant-a',donoId:'u-a'},
    {id:'null',contaId:null,tenantId:'tenant-a',donoId:'u-a'},
    {id:'undefined',tenantId:'tenant-a',donoId:'u-a'},
    {id:'nan',contaId:NaN,tenantId:'tenant-a',donoId:'u-a'}
  ];
  x.S.salvar();
  for(const id of ['c',1,'1',null,undefined,NaN,'no-match']) comparar(x,id);
});
test('tenant, papel e filtros administrativos reavaliados sem salvar',()=>{
  const x=preparar();
  x.e.oportunidades=[
    {id:'a-u1',contaId:'c',tenantId:'tenant-a',donoId:'u-a'},
    {id:'a-u2',contaId:'c',tenantId:'tenant-a',donoId:'u-b'},
    {id:'a-shared',contaId:'c',tenantId:'tenant-a'},
    {id:'b-u2',contaId:'c',tenantId:'tenant-b',donoId:'u-b'}
  ];
  x.S.salvar();
  comparar(x,'c');
  x.user({id:'u-a',papel:'vendedor',tenantId:'tenant-a'});comparar(x,'c');
  x.user({id:'u-b',papel:'gestor',tenantId:'tenant-b'});comparar(x,'c');
  x.user({id:'admin',papel:'admin',tenantId:'tenant-a'});comparar(x,'c');
  x.filters({tenant:'tenant-a',usuario:'u-a'});comparar(x,'c');
  x.filters({tenant:'tenant-b',usuario:'todos'});comparar(x,'c');
  x.user(null);comparar(x,'c');
});
test('salvar, mudanças, exclusão, substituição e limpar invalidam o índice',()=>{
  const x=preparar(),S=x.S,e=x.e;
  e.oportunidades=[{id:'um',contaId:'c',tenantId:'tenant-a',donoId:'u-a'}];S.salvar();
  comparar(x,'c');
  e.oportunidades.push({id:'dois',contaId:'c',tenantId:'tenant-a',donoId:'u-a'});
  S.salvar();comparar(x,'c');assert.equal(S.oportunidadesDaConta('c').length,2);
  e.oportunidades[0].contaId='outra';S.salvar();
  comparar(x,'c');comparar(x,'outra');
  S.limpar(); assert.equal(S.oportunidadesDaConta('c').length,0);
});
test('cockpit não varre a carteira toda para encontrar negócio da mesma conta',()=>{
  const inicio=viewsSrc.indexOf('function outrasAbertasDaConta(op)');
  assert.ok(inicio>0);
  const fim=viewsSrc.indexOf('function barraDeAcoes(op)',inicio);
  const bloco=viewsSrc.slice(inicio,fim);
  assert.match(bloco,/Store\.oportunidadesDaConta\(op\.contaId\)/);
  assert.doesNotMatch(bloco,/Store\.dados\(\)\.oportunidades\.filter/);
  assert.match(bloco,/o\.id !== op\.id && !o\.desfecho/);
});
test('389/5k/10k oportunidades: consultas repetidas reduzem leituras totais',()=>{
  for(const n of [389,5000,10000]){
    const x=preparar(),e=x.e;
    let leituras=0;
    e.oportunidades=Array.from({length:n},(_,i)=>({
      id:'o'+i,tenantId:'tenant-a',donoId:'u-a',desfecho:null,
      get contaId(){leituras++;return 'c'+(i%384);}
    }));
    x.S.salvar();
    const id='c10';
    leituras=0;
    for(let i=0;i<100;i++) x.S.dados().oportunidades.filter(o=>o.contaId===id);
    const baseline=leituras;
    leituras=0;
    for(let i=0;i<100;i++) x.S.oportunidadesDaConta(id);
    const optimizado=leituras;
    assert.ok(baseline>=n*100);
    assert.ok(optimizado<baseline/10,`n=${n}: ${optimizado} vs ${baseline}`);
  }
});
