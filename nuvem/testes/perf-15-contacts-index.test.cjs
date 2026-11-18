'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../..');
function ambiente() {
  let usuario={id:'u1',papel:'gestor',tenantId:'a'};
  let filtros={tenant:'todas',usuario:'todos'};
  const w={console,localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    IADAuth:{atual(){return usuario;},filtros(){return filtros;}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'src/store.js'),'utf8'),{
    window:w,console,Date,Map,Set,JSON,Math
  },{filename:'store.js'});
  const S=w.IADStore,e=S.obter();
  e.tenants=[{id:'a',nome:'A'},{id:'b',nome:'B'}];
  e.contatos=[
    {id:'a1',contaId:'c1',tenantId:'a',donoId:'u1'},
    {id:'b1',contaId:'c1',tenantId:'b',donoId:'u2'},
    {id:'a2',contaId:'c1',tenantId:'a',donoId:'u2'},
    {id:'a1',contaId:'c1',tenantId:'a',donoId:'u1'},
    {id:'num',contaId:1,tenantId:'a',donoId:'u1'},
    {id:'str',contaId:'1',tenantId:'a',donoId:'u1'},
    {id:'none',tenantId:'a',donoId:'u1'}
  ];
  S.salvar();
  return {S,e,user:u=>{usuario=u;},filters:f=>{filtros=f;}};
}
function igual(x,contaId) {
  const esperado=x.e.contatos.filter(c=>c.contaId===contaId&&x.S.visivel(c,true));
  const atual=x.S.contatosDaConta(contaId);
  assert.deepEqual(Array.from(atual,c=>c.id),Array.from(esperado,c=>c.id));
  assert.ok(atual.every((c,i)=>c===esperado[i]));
}
test('índice de contatos mantém a ordem, IDs duplicados e tipos de chave',()=>{
  const x=ambiente();
  for(const id of ['c1',1,'1',undefined,null,'inexistente']) igual(x,id);
});
test('não mistura dados entre tenants, gestores, vendedores ou filtros administrativos',()=>{
  const x=ambiente();
  igual(x,'c1');
  x.user({id:'u1',papel:'vendedor',tenantId:'a'});igual(x,'c1');
  x.user({id:'u2',papel:'gestor',tenantId:'b'});igual(x,'c1');
  x.user({id:'admin',papel:'admin',tenantId:'a'});igual(x,'c1');
  x.filters({tenant:'a',usuario:'u1'});igual(x,'c1');
  x.filters({tenant:'b',usuario:'todos'});igual(x,'c1');
  x.user(null);igual(x,'c1');
});
test('salvar e substituir invalidam o índice sem deixar contatos antigos',()=>{
  const x=ambiente();
  igual(x,'c1');
  x.e.contatos.push({id:'novo',contaId:'c1',tenantId:'a',donoId:'u1'});
  x.S.salvar();igual(x,'c1');
  assert.ok(x.S.contatosDaConta('c1').some(c=>c.id==='novo'));
  x.S.limpar();
  assert.equal(x.S.contatosDaConta('c1').length,0);
});
