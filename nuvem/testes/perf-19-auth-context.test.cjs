'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const srcStore=fs.readFileSync(path.join(root,'src/store.js'),'utf8');
const srcAuth=fs.readFileSync(path.join(root,'src/auth.js'),'utf8');

function preparar(){
  const disco=new Map();
  let leituras=0;
  const localStorage={
    getItem:k=>{leituras++;return disco.get(k)??null;},
    setItem:(k,v)=>disco.set(k,String(v)),
    removeItem:k=>disco.delete(k)
  };
  const w={localStorage, console};
  const vmCtx={window:w,localStorage,console,Map,Set,Date,JSON,Math,Number};
  vm.runInNewContext(srcStore,vmCtx,{filename:'store.js'});
  vm.runInNewContext(srcAuth,vmCtx,{filename:'auth.js'});
  const S=w.IADStore,A=w.IADAuth;
  const estado=S.obter();
  const admin={id:'admin',papel:'admin',tenantId:'tenant-a'};
  const gestor={id:'gestor',papel:'gestor',tenantId:'tenant-a'};
  const vendedor={id:'vendedor',papel:'vendedor',tenantId:'tenant-a'};
  const outro={id:'outro',papel:'vendedor',tenantId:'tenant-b'};
  estado.tenants=[{id:'tenant-a'},{id:'tenant-b'}];
  estado.usuarios=[admin,gestor,vendedor,outro];
  return {
    S,A,estado,admin,gestor,vendedor,outro,
    trocar:u=>{if(u)A.abrirSessao(u);else A.encerrarSessao();},
    zerar:()=>{leituras=0;},
    ler:()=>leituras
  };
}
function esperado(x,lista,comDono){
  const u=x.A.atual(),f=x.A.filtros();
  if(!u) return [];
  return lista.filter(r=>{
    if(u.papel==='admin'){
      if(f.tenant!=='todas'&&r.tenantId!==f.tenant)return false;
      if(comDono&&f.usuario!=='todos'&&r.donoId!==f.usuario)return false;
      return true;
    }
    if(r.tenantId!==u.tenantId)return false;
    if(!comDono||u.papel==='gestor')return true;
    return !r.donoId||r.donoId===u.id;
  });
}
function igualdadeRefs(atual,previsto){
  assert.deepEqual(Array.from(atual,x=>x.id),previsto.map(x=>x.id));
  assert.ok(Array.from(atual).every((r,i)=>r===previsto[i]),'ordem e referencias');
}

test('389, 5000, 10000: Auth é consultado por operação, não por registro',()=>{
  for(const quantidade of [389,5000,10000]){
    const x=preparar(),e=x.estado;
    e.oportunidades=Array.from({length:quantidade},(_,i)=>({
      id:'op'+i,tenantId:i%9===0?'tenant-b':'tenant-a',
      donoId:i%7===0?'outro':'vendedor',contaId:'conta-'+(i%384)
    }));
    e.tarefas=Array.from({length:quantidade*2},(_,i)=>({
      id:'ta'+i,tenantId:i%11===0?'tenant-b':'tenant-a',
      donoId:i%5===0?'outro':'vendedor',oportunidadeId:'op'+(i%quantidade)
    }));
    e.contatos=Array.from({length:Math.floor(quantidade/2)},(_,i)=>({
      id:'ct'+i,tenantId:i%5===0?'tenant-b':'tenant-a',
      donoId:i%3===0?'outro':'vendedor',contaId:'conta-'+(i%384)
    }));
    e.notas=Array.from({length:800},(_,i)=>({
      id:'nt'+i,donoId:i%2?'vendedor':'outro',criadoEm:'2026-11-03'
    }));
    e.sinais=Array.from({length:Math.floor(quantidade/3)},(_,i)=>({
      id:'si'+i,tenantId:i%11===0?'tenant-b':'tenant-a',
      donoId:i%3===0?'outro':'vendedor',contaId:'conta-'+(i%384)
    }));
    x.trocar(x.vendedor);
    x.S.salvar();
    x.zerar();
    const r=x.S.dados();
    const chamadas=x.ler();
    assert.ok(chamadas<=4,`N=${quantidade}, chamadas localStorage=${chamadas}`);
    assert.ok(r.oportunidades.length>0 && r.tarefas.length>0);
    x.zerar();assert.strictEqual(x.S.dados(),r);assert.ok(x.ler()<=4);
    console.log('PERF19_AUTH_CALLS '+JSON.stringify({n:quantidade,total:e.oportunidades.length+e.tarefas.length+e.contatos.length+e.sinais.length+e.notas.length,localStorageReads:chamadas}));
  }
});

test('RLS local exato: admin, gestor, vendedor, logout, troca de filtros e tenant',()=>{
  const x=preparar(),e=x.estado;
  const registros=[
    {id:'a',tenantId:'tenant-a',donoId:'vendedor'},
    {id:'b',tenantId:'tenant-a',donoId:'outro'},
    {id:'c',tenantId:'tenant-a',donoId:null},
    {id:'d',tenantId:'tenant-b',donoId:'outro'},
    {id:'e',tenantId:'tenant-b'},
    {id:'f',tenantId:null}
  ];
  for(const k of ['contas','contatos','oportunidades','tarefas','sinais'])e[k]=registros.slice();
  e.notas=[
    {id:'n1',donoId:'vendedor'},
    {id:'n2',donoId:'outro'},
    {id:'n3',donoId:null}
  ];
  x.S.salvar();
  for(const u of [x.admin,x.gestor,x.vendedor,x.outro,null]){
    x.trocar(u);
    if(u===x.admin){
      for(const f of [{tenant:'todas',usuario:'todos'},
        {tenant:'tenant-a',usuario:'todos'},
        {tenant:'todas',usuario:'vendedor'},
        {tenant:'tenant-b',usuario:'outro'}]){
        x.A.definirFiltros(f);
        const esperadoLocal=esperado(x,registros,true);
        const r=x.S.dados();
        for(const k of ['contas','contatos','oportunidades','tarefas','sinais'])
          igualdadeRefs(r[k],esperadoLocal);
        igualdadeRefs(r.notas,e.notas.filter(n=>n.donoId===u.id));
      }
    }else{
      const esperadoLocal=esperado(x,registros,true);
      const r=x.S.dados();
      for(const k of ['contas','contatos','oportunidades','tarefas','sinais'])
        igualdadeRefs(r[k],esperadoLocal);
      igualdadeRefs(r.notas,e.notas.filter(n=>u&&n.donoId===u.id));
    }
  }
});

test('Permissões de catálogo por empresa continuam independentes do dono',()=>{
  const x=preparar(),e=x.estado;
  e.segmentos=[
    {id:'cat-a',tenantId:'tenant-a',donoId:'outro'},
    {id:'cat-b',tenantId:'tenant-b',donoId:'vendedor'},
    {id:'cat-nulo',tenantId:null}
  ];
  x.S.salvar();x.trocar(x.vendedor);
  igualdadeRefs(x.S.dados().segmentos,esperado(x,e.segmentos,false));
  x.trocar(x.admin);
  x.A.definirFiltros({tenant:'tenant-b',usuario:'vendedor'});
  igualdadeRefs(x.S.dados().segmentos,esperado(x,e.segmentos,false));
});

test('Consultas de cockpit usam um contexto por bucket e não por linha',()=>{
  const x=preparar(),e=x.estado;
  x.trocar(x.gestor);
  e.contas=[{id:'ca',tenantId:'tenant-a'}];
  e.oportunidades=Array.from({length:2000},(_,i)=>({
    id:'o'+i,contaId:'ca',tenantId:i%2?'tenant-a':'tenant-b',donoId:'vendedor'
  }));
  e.contatos=Array.from({length:2000},(_,i)=>({
    id:'c'+i,contaId:'ca',tenantId:i%2?'tenant-a':'tenant-b',donoId:'vendedor'
  }));
  e.tarefas=Array.from({length:2000},(_,i)=>({
    id:'t'+i,oportunidadeId:'o1',tenantId:i%2?'tenant-a':'tenant-b',donoId:'vendedor'
  }));
  e.sinais=Array.from({length:2000},(_,i)=>({
    id:'s'+i,contaId:'ca',oportunidadeId:'o1',tenantId:i%2?'tenant-a':'tenant-b',
    donoId:'vendedor',quando:'2026-11-03'
  }));
  x.S.salvar();
  const tests=[
    ()=>x.S.oportunidadesDaConta('ca'),
    ()=>x.S.contatosDaConta('ca'),
    ()=>x.S.tarefasDaOportunidade('o1'),
    ()=>x.S.sinaisDaOportunidade({id:'o1',contaId:'ca',stakeholders:[]}),
    ()=>x.S.sinaisDaConta('ca'),
    ()=>x.S.sinais()
  ];
  for(const invoke of tests){
    x.zerar();
    const result=invoke();
    assert.equal(result.length,1000);
    assert.ok(x.ler()<=4,`leituras=${x.ler()}`);
  }
  x.trocar(x.outro);
  assert.equal(x.S.oportunidadesDaConta('ca').length,1000);
  x.trocar(null);
  assert.equal(x.S.oportunidadesDaConta('ca').length,0);
  assert.equal(x.S.tarefasDaOportunidade('o1').length,0);
});
