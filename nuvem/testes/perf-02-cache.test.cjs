/* PERF-02: cache da fila protegido por revisão, data e escopo. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'src/perf-02.js'),'utf8');
function preparar() {
  let rev=1, dia='2026-10-29', user={id:'u1',papel:'gestor',tenantId:'a'};
  let filtros={tenant:'a',usuario:'todos'}, numero=0;
  const S={
    revisao:()=>rev, hoje:()=>dia,
    contexto:()=>({usuario:user,tenantId:user&&user.tenantId,
      admin:!!(user&&user.papel==='admin'),gestor:!!(user&&user.papel!=='usuario'),filtros})
  };
  const E={fila: (ops,tarefas)=>{
    numero++; return {itens:ops.map(op=>({resumo:{op,iad:op.iad||0},urgencia:3})),
      triagem:[],urgentes:[],valorUrgente:tarefas.length};
  }};
  const w={IADStore:S,IADEngine:E};
  vm.runInNewContext(source,{window:w});
  const dados=()=>({oportunidades:[{id:'x',iad:1}],tarefas:[]});
  return {mod:w.IADPerf02,dados,
    n:()=>numero, alterar:()=>rev++, dia:v=>dia=v,
    user:v=>user=v,filtros:v=>filtros=v, store:S, engine:E};
}
test('reaproveita fila entre leituras com arrays novos, sem refazer E.fila',()=>{
  const x=preparar();
  const a=x.mod.filaDados(x.dados());
  const b=x.mod.filaDados(x.dados());
  assert.equal(x.n(),1);
  assert.notEqual(a,b);
  assert.notEqual(a.itens,b.itens);
  a.itens.length=0;
  assert.equal(x.mod.filaDados(x.dados()).itens.length,1);
  assert.equal(x.mod.estatisticas().hits,2);
});
test('invalida na mutação, dia seguinte e mudança de filtros e papel',()=>{
  const x=preparar();
  x.mod.filaDados(x.dados()); assert.equal(x.n(),1);
  x.alterar(); x.mod.filaDados(x.dados()); assert.equal(x.n(),2);
  x.dia('2026-10-30'); x.mod.filaDados(x.dados()); assert.equal(x.n(),3);
  x.filtros({tenant:'b',usuario:'todos'});x.mod.filaDados(x.dados());assert.equal(x.n(),4);
  x.user({id:'u1',papel:'admin',tenantId:'a'});x.mod.filaDados(x.dados());assert.equal(x.n(),5);
  x.user({id:'u2',papel:'usuario',tenantId:'b'});x.mod.filaDados(x.dados());assert.equal(x.n(),6);
  assert.equal(x.mod.estatisticas().invalidacoes,5);
});
test('sem login nunca reutiliza fila e impede cache entre sessões',()=>{
  const x=preparar(); x.mod.filaDados(x.dados());
  x.user(null); x.mod.filaDados(x.dados());x.mod.filaDados(x.dados());
  assert.equal(x.n(),3);
  x.user({id:'u1',papel:'gestor',tenantId:'a'});
  x.mod.filaDados(x.dados()); assert.equal(x.n(),4);
  assert.equal(x.mod.estatisticas().misses,2);
});
test('cálculo que altera dados no meio da execução não entra no cache',()=>{
  const x=preparar();
  x.engine.fila=(ops,tarefas)=>{x.alterar();return {itens:[],triagem:[],urgentes:[],valorUrgente:0};};
  x.mod.filaDados(x.dados());x.mod.filaDados(x.dados());
  assert.equal(x.mod.estatisticas().misses,2);
  assert.equal(x.mod.estatisticas().ativo,false);
});
test('interface e versão PWA carregam PERF-02 na ordem correta',()=>{
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const config=fs.readFileSync(path.join(root,'src/config.js'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
  const views=fs.readFileSync(path.join(root,'src/views.js'),'utf8');
  assert.ok(index.indexOf('src/engine.js') < index.indexOf('src/perf-02.js'));
  assert.ok(index.indexOf('src/perf-02.js') < index.indexOf('src/views.js'));
  assert.match(sw,/iad-crm-v[0-9]+/);
  assert.match(config,/numero: 'v[0-9]+'/);
  const swV=sw.match(/iad-crm-(v[0-9]+)/)?.[1];
  const cfgV=config.match(/numero: '(v[0-9]+)'/)?.[1];
  assert.equal(swV,cfgV,'PWA e código devem indicar mesma versão');
  assert.match(sw,/src\/perf-02.js/);
  assert.match(app,/IADPerf02\.filaDados\(est\)/);
  assert.match(views,/IADPerf02\.filaDados\(est\)/);
});
