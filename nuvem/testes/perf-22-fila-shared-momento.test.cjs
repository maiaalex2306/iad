'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const current=fs.readFileSync(path.join(root,'src/engine.js'),'utf8');
const previous=cp.execFileSync('git',
  ['show','b08e935f50f4643272abf9b3a534dcefc7adf59e:src/engine.js'],
  {cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
const playbook=fs.readFileSync(path.join(root,'src/playbook.js'),'utf8');
const store=fs.readFileSync(path.join(root,'src/store.js'),'utf8');
const daysAgo=d=>{const a=new Date();a.setUTCDate(a.getUTCDate()-d);return a.toISOString().slice(0,10);};
function fixture(source,count,scenario='fortes'){
  let usuario={id:'vendedor',tenantId:'a',papel:'gestor'};
  let filtros={tenant:'todas',usuario:'todos'};
  const localStorage={getItem(){return null},setItem(){},removeItem(){}};
  const w={console,localStorage,
    IADAuth:{atual:()=>usuario,filtros:()=>filtros}};
  const ctx={window:w,console,Date,Math,Map,Set,JSON,Number};
  for(const [name,code] of [['playbook.js',playbook],['store.js',store],['engine.js',source]])
    vm.runInNewContext(code,ctx,{filename:name});
  const S=w.IADStore,E=w.IADEngine,P=w.IADPlaybook,s=S.obter();
  s.usuarios=[usuario];s.tenants=[{id:'a',nome:'Tenant A'},{id:'b',nome:'Tenant B'}];
  s.contas=[{id:'c1',tenantId:'a',donoId:'vendedor',nome:'Grupo A',segmento:'Industria'}];
  s.oportunidades=Array.from({length:count},(_,i)=>({
    id:'op'+i,tenantId:'a',donoId:'vendedor',contaId:'c1',
    titulo:'Negocio '+i,valor:10000+i,
    criadoEm:daysAgo(scenario==='recentes'?2:120),etapaDesde:daysAgo(60),
    fechamentoPrevisto:daysAgo(-30),
    etapa:i%2?'Diagnóstico':'Proposta',
    eventos:scenario==='recentes'?
      [{id:'e'+i,tipo:'decision',data:daysAgo(2),titulo:'Aceite de cliente',dimensao:'problema',forca:'declarado'}]:[],
    dims:Object.fromEntries(P.DIMENSOES.map(d=>[d.id,d.id==='problema'?2:0])),
    stakeholders:[],nutricao:null,desfecho:null
  }));
  s.tarefas=[];s.contatos=[];s.notas=[];s.recusas=[];s.descartes=[];
  s.sinais=Array.from({length:count},(_,i)=>({
    id:'sig'+i,tenantId:'a',donoId:'vendedor',
    oportunidadeId:'op'+i,contaId:'c1',
    peso:scenario==='fracos'?0:3,
    titulo:'Sinal de cliente '+i,quando:scenario==='antigos'?daysAgo(100):daysAgo(2)
  }));
  S.salvar();
  let leituras=0;
  const original=S.sinaisDaOportunidade;
  S.sinaisDaOportunidade=function(op){leituras++;return original(op);};
  return {S,E,P,s,ler:()=>leituras,reset:()=>{leituras=0;},
    usuario:u=>{usuario=u;},filtros:f=>{filtros=f;}};
}
function normal(x){return JSON.parse(JSON.stringify(x));}
test('paridade integral E.fila v286.18 vs candidata: 389 oportunidades com fortes, fracos, antigos e recentes',()=>{
  for(const scenario of ['fortes','fracos','antigos','recentes']){
    const a=fixture(previous,389,scenario),b=fixture(current,389,scenario);
    const left=a.E.fila(a.S.dados().oportunidades,a.S.dados().tarefas);
    const right=b.E.fila(b.S.dados().oportunidades,b.S.dados().tarefas);
    assert.deepEqual(normal(right),normal(left),'diferença na fila para '+scenario);
  }
});
test('389 / 1000 / 5000 oportunidades: metade das leituras dos sinais na fila, com ordem e scores idênticos',()=>{
  for(const n of [389,1000,5000]){
    const a=fixture(previous,n),b=fixture(current,n);
    a.reset();b.reset();
    const left=a.E.fila(a.S.dados().oportunidades,a.S.dados().tarefas);
    const right=b.E.fila(b.S.dados().oportunidades,b.S.dados().tarefas);
    assert.deepEqual(normal(right),normal(left),'pipeline/score não pode mudar, n='+n);
    assert.equal(a.ler(),2*n,'v286.18 calculava momento duas vezes por op');
    assert.equal(b.ler(),n,'candidata calcula uma vez por op');
    console.log('PERF22_FILA '+JSON.stringify({n,signalsReadsBefore:a.ler(),
      signalsReadsAfter:b.ler(),reductionPct:50}));
  }
});
test('evidência recente: nenhuma busca de sinais e nenhuma mudança na fila',()=>{
  const a=fixture(previous,389,'recentes'),b=fixture(current,389,'recentes');
  assert.deepEqual(normal(b.E.fila(b.S.dados().oportunidades,b.S.dados().tarefas)),
    normal(a.E.fila(a.S.dados().oportunidades,a.S.dados().tarefas)));
  assert.equal(a.ler(),0);
  assert.equal(b.ler(),0);
});
test('E.resumo e E.alertas públicos: contrato exato e sem campo auxiliar no JSON',()=>{
  const a=fixture(previous,2),b=fixture(current,2);
  for(let i=0;i<2;i++){
    const opA=a.s.oportunidades[i],opB=b.s.oportunidades[i];
    assert.deepEqual(normal(b.E.resumo(opB)),normal(a.E.resumo(opA)));
    assert.deepEqual(normal(b.E.alertas(opB)),normal(a.E.alertas(opA)));
    assert.deepEqual(Object.keys(b.E.resumo(opB)),Object.keys(a.E.resumo(opA)));
  }
});
test('troca de tenant/filtro e sinais privados preservam resultado e não se misturam entre chamadas',()=>{
  for(const scenario of ['fortes','antigos']){
    const a=fixture(previous,40,scenario),b=fixture(current,40,scenario);
    a.s.sinais.slice(0,20).forEach(s=>{s.tenantId='b';});
    b.s.sinais.slice(0,20).forEach(s=>{s.tenantId='b';});
    a.S.salvar();b.S.salvar();
    assert.deepEqual(normal(b.E.fila(b.S.dados().oportunidades,b.S.dados().tarefas)),
      normal(a.E.fila(a.S.dados().oportunidades,a.S.dados().tarefas)));
    a.usuario({id:'vendedor',tenantId:'a',papel:'vendedor'});
    b.usuario({id:'vendedor',tenantId:'a',papel:'vendedor'});
    assert.deepEqual(normal(b.E.fila(b.S.dados().oportunidades,b.S.dados().tarefas)),
      normal(a.E.fila(a.S.dados().oportunidades,a.S.dados().tarefas)));
    a.usuario(null);b.usuario(null);
    assert.equal(a.S.dados().oportunidades.length,0);
    assert.equal(b.S.dados().oportunidades.length,0);
  }
});
test('o diagnóstico é local: sem nova propriedade em oportunidades nem persistência de resultado',()=>{
  const f=fixture(current,3);
  const original=JSON.stringify(f.s.oportunidades);
  f.E.fila(f.S.dados().oportunidades,f.S.dados().tarefas);
  assert.equal(JSON.stringify(f.s.oportunidades),original);
  const again=f.E.fila(f.S.dados().oportunidades,f.S.dados().tarefas);
  assert.equal(again.itens.length+again.triagem.length,3);
});
