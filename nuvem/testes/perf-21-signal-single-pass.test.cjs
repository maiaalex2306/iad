'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const current=fs.readFileSync(path.join(root,'src/engine.js'),'utf8');
const previous=cp.execFileSync('git',['show','6e73498f0b7558a6f2cd97be4fbe9d45c66708c6:src/engine.js'],{
  cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
const playbook=fs.readFileSync(path.join(root,'src/playbook.js'),'utf8');
const store=fs.readFileSync(path.join(root,'src/store.js'),'utf8');
const dateOffset=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
function ambiente(engineSource,signalCount,scenario){
  const usuario={id:'a',tenantId:'tenant-a',papel:'gestor'};
  const w={console,localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    IADAuth:{atual:()=>usuario,filtros:()=>({tenant:'todas',usuario:'todos'})}};
  const ctx={window:w,console,Date,Map,Set,Math,JSON,Number};
  for(const [name,source] of [['playbook.js',playbook],['store.js',store],['engine.js',engineSource]]){
    vm.runInNewContext(source,ctx,{filename:name});
  }
  const S=w.IADStore,P=w.IADPlaybook,E=w.IADEngine,e=S.obter();
  e.tenants=[{id:'tenant-a'}];
  e.contas=[{id:'c',nome:'Empresa',tenantId:'tenant-a',segmento:'Industria'}];
  e.usuarios=[usuario];
  const op={id:'op',titulo:'Teste',contaId:'c',tenantId:'tenant-a',donoId:'a',
    etapa:'Diagnóstico',valor:100000,
    criadoEm:dateOffset(scenario==='recente'?-2:-120),
    etapaDesde:dateOffset(-90),fechamentoPrevisto:dateOffset(60),
    eventos:scenario==='evidencia-recente'?
      [{id:'ev0',tipo:'decision',data:dateOffset(-2),dimensao:'problema',titulo:'Teste'}]:[],
    dims:Object.fromEntries(P.DIMENSOES.map((d,i)=>[d.id,i===0?2:0])),
    stakeholders:[],desfecho:null,adiamentos:0};
  e.oportunidades=[op];e.contatos=[];e.tarefas=[];e.notas=[];e.recusas=[];
  e.sinais=Array.from({length:signalCount},(_,i)=>({
    id:'sig'+i,tenantId:'tenant-a',donoId:'a',
    oportunidadeId:'op',contaId:'c',
    peso:scenario==='fracos'?0:i%3===0?5:1,
    titulo:'Sinal '+i,
    quando:scenario==='antigos'?dateOffset(-100):i%7===0?dateOffset(-2):dateOffset(-13),
    hora:'12:00'
  }));
  S.salvar();
  let calls=0;
  const original=S.sinaisDaOportunidade;
  S.sinaisDaOportunidade=function(...args){calls++;return original(...args);};
  return {E,S,op,P,calls:()=>calls,reset:()=>{calls=0}};
}
function plain(value){return JSON.parse(JSON.stringify(value));}

test('PERF-21 momento: saída idêntica antes/depois com sinais antigos, recentes e fracos',()=>{
  for(const sc of ['normal','fracos','antigos','recente','evidencia-recente']){
    for(const n of [0,1,20,150,1200]){
      const a=ambiente(previous,n,sc),b=ambiente(current,n,sc);
      assert.deepEqual(plain(b.E.momento(b.op)),plain(a.E.momento(a.op)),
        'paridade de momento cenário='+sc+' tamanho='+n);
    }
  }
});

test('PERF-21 resumo: preservar alertas, Decision Engine e cálculo comercial completo',()=>{
  for(const sc of ['normal','fracos','antigos','recente','evidencia-recente']){
    const a=ambiente(previous,150,sc),b=ambiente(current,150,sc);
    assert.deepEqual(plain(b.E.resumo(b.op)),plain(a.E.resumo(a.op)),
      'divergência no resumo '+sc);
    assert.deepEqual(plain(b.E.alertas(b.op)),plain(a.E.alertas(a.op)),
      'divergência alerta público '+sc);
    assert.deepEqual(plain(b.E.sinaisRecentes(b.op)),plain(a.E.sinaisRecentes(a.op)),
      'divergência sinais recentes '+sc);
    assert.deepEqual(plain(b.E.idadeDoSinal(b.op)),plain(a.E.idadeDoSinal(a.op)),
      'divergência idade do sinal '+sc);
  }
});

test('PERF-21: um acesso por alerta em vez de dois para histórico com sinal forte',()=>{
  for(const n of [1,150,1000,5000]){
    const a=ambiente(previous,n,'normal'),b=ambiente(current,n,'normal');
    a.reset();b.reset();
    const oldResult=a.E.momento(a.op),newResult=b.E.momento(b.op);
    assert.deepEqual(plain(newResult),plain(oldResult));
    assert.ok(oldResult,'histórico deve criar momento comercial');
    assert.equal(a.calls(),2,'v286.17 acessos anteriores');
    assert.equal(b.calls(),1,'v286.18 acesso único');
    console.log('PERF21_SIGNAL_FETCH '+JSON.stringify({signals:n,before:a.calls(),after:b.calls(),reductionPct:50}));
  }
});

test('PERF-21: evidência nova evita acessar sinais quando não existe alerta possível',()=>{
  const a=ambiente(previous,2500,'evidencia-recente');
  const b=ambiente(current,2500,'evidencia-recente');
  assert.equal(a.E.momento(a.op),null);assert.equal(b.E.momento(b.op),null);
  assert.equal(a.calls(),2);
  assert.equal(b.calls(),0);
});

test('PERF-21: E.resumo não repete consultas dos sinais nem afeta a visibilidade entre empresas',()=>{
  const a=ambiente(previous,150,'normal'),b=ambiente(current,150,'normal');
  a.E.resumo(a.op);b.E.resumo(b.op);
  assert.equal(a.calls(),2);
  assert.equal(b.calls(),1);
  const consulta=b.E.sinaisRecentes(b.op);
  assert.equal(consulta.length,150);
  assert.equal(b.calls(),2,'API pública conserva funcionamento independente');
  b.S.obter().sinais.forEach(s=>{s.tenantId='tenant-b';});
  b.S.salvar();
  assert.equal(b.E.momento(b.op),null,'nenhum sinal de outro tenant deve criar alerta');
});
