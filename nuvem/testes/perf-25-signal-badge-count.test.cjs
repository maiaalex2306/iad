'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const storeCode=fs.readFileSync(path.join(root,'src/store.js'),'utf8');
const engineCode=fs.readFileSync(path.join(root,'src/engine.js'),'utf8');
const playbookCode=fs.readFileSync(path.join(root,'src/playbook.js'),'utf8');
const viewsCode=fs.readFileSync(path.join(root,'src/views.js'),'utf8');
const date=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
function fixture(n){
  let u={id:'u1',papel:'gestor',tenantId:'a'};
  let filtros={tenant:'todas',usuario:'todos'};
  const w={console,localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    IADAuth:{atual:()=>u,filtros:()=>filtros}};
  const ctx={window:w,localStorage:w.localStorage,console,Date,Math,Map,Set,Number,JSON};
  for(const [name,source] of [['playbook.js',playbookCode],['store.js',storeCode],['engine.js',engineCode]])
    vm.runInNewContext(source,ctx,{filename:name});
  const S=w.IADStore,E=w.IADEngine,P=w.IADPlaybook,e=S.obter();
  const op={id:'op',contaId:'acc',tenantId:'a',donoId:'u1',
    stakeholders:['p1','p2','p1'],criadoEm:date(-120),
    dims:Object.fromEntries(P.DIMENSOES.map(d=>[d.id,0])),eventos:[]};
  e.usuarios=[u];
  e.tenants=[{id:'a',nome:'A'},{id:'b',nome:'B'}];
  e.contas=[{id:'acc',nome:'Conta A',tenantId:'a',donoId:'u1'}];
  e.contatos=[{id:'p1',contaId:'acc',tenantId:'a',donoId:'u1'},
    {id:'p2',contaId:'acc',tenantId:'a',donoId:'u2'}];
  e.oportunidades=[op];
  let reads=0;
  e.sinais=Array.from({length:n},(_,i)=>{
    const when=date(i%7===0?-100: i%5===0?-2: -(i*7%20));
    const z={id:'s'+i,tenantId:i%11===0?'b':'a',
      donoId:i%3===0?'u2':'u1',
      peso:i%4===0?5:0,hora:String(i%24).padStart(2,'0')+':00',
      titulo:'sintetico'};
    if(i%5===0)z.oportunidadeId='op';
    else if(i%5===1)z.contatoId='p1';
    else if(i%5===2)z.contatoId='p2';
    else if(i%5===3)z.contaId='acc';
    else {z.contatoId='sem-conta';z.contaId='acc';}
    Object.defineProperty(z,'quando',{enumerable:true,configurable:true,
      get(){reads++;return when}});
    return z;
  });
  S.salvar();
  return {S,E,P,e,op,reads:()=>reads,reset:()=>{reads=0},
    usuario:x=>{u=x},filtros:x=>{filtros=x}};
}
function compare(x,janelas=[undefined,1,7,30,90,365]){
  for(const janela of janelas){
    const old=x.E.sinaisRecentes(x.op,janela).length;
    const now=x.E.contarSinaisRecentes(x.op,janela);
    assert.equal(now,old,'paridade com janela '+janela);
    assert.equal(now,x.S.contarSinaisDaOportunidade(x.op,
      s=>x.E.diasEntre(s.quando)<= (janela||x.P.JANELA_SINAL)));
  }
}
test('PERF-25: contagem idêntica à listagem de 0/1/389/1000/5000/10000 sinais',()=>{
  for(const n of [0,1,389,1000,5000,10000]){
    const x=fixture(n);
    compare(x);
  }
});
test('PERF-25: mudança imediata de gestor, vendedor, administrador e filtros de tenant',()=>{
  const x=fixture(1000);
  compare(x);
  x.usuario({id:'u1',papel:'vendedor',tenantId:'a'});compare(x);
  x.usuario({id:'u1',papel:'admin',tenantId:'a'});compare(x);
  x.filtros({tenant:'a',usuario:'u2'});compare(x);
  x.filtros({tenant:'b',usuario:'todos'});compare(x);
  x.usuario({id:'u2',papel:'gestor',tenantId:'b'});compare(x);
  x.usuario(null);compare(x);
  assert.equal(x.E.contarSinaisRecentes(x.op),0,'logout não pode mostrar sinal');
});
test('PERF-25: índices se invalidam quando novos sinais são salvos ou excluídos',()=>{
  const x=fixture(389),a=x.E.contarSinaisRecentes(x.op);
  x.e.sinais.push({id:'adicionado',oportunidadeId:'op',tenantId:'a',donoId:'u1',
    quando:date(-1),hora:'12:00'});
  x.S.salvar();
  assert.equal(x.E.contarSinaisRecentes(x.op),a+1);
  compare(x);
  x.S.excluirSinal('adicionado');
  assert.equal(x.E.contarSinaisRecentes(x.op),a);
});
test('PERF-25: contar não aciona API que ordena lista inteira e não vaza buckets',()=>{
  const x=fixture(5000);
  const expected=x.E.sinaisRecentes(x.op).length;
  const func=x.S.sinaisDaOportunidade;
  x.S.sinaisDaOportunidade=()=>{throw Error('ordenacao desnecessaria');};
  assert.equal(x.E.contarSinaisRecentes(x.op),expected);
  x.S.sinaisDaOportunidade=func;
  assert.equal(x.S.contarSinaisDaOportunidade(null,()=>true),0);
});
test('PERF-25: com 10000 sinais, menos leituras de data e mesma contagem',()=>{
  const x=fixture(10000);
  x.reset();
  const before=x.E.sinaisRecentes(x.op).length;
  const readsBefore=x.reads();
  x.reset();
  const after=x.E.contarSinaisRecentes(x.op);
  const readsAfter=x.reads();
  assert.equal(after,before);
  assert.ok(readsAfter<readsBefore*0.35,
    'leitura das datas deve cair pelo menos 65%: '+readsBefore+' -> '+readsAfter);
  console.log('PERF25_BADGE '+JSON.stringify({
    totalSignals:10000,visibleRecent:after,dateReadsBefore:readsBefore,
    dateReadsAfter:readsAfter,
    avoidedPct:+(100*(1-readsAfter/readsBefore)).toFixed(2)}));
});
test('PERF-25: só o badge mudou; tela de Sinais e demais indicadores mantidos',()=>{
  assert.match(viewsCode,/const sinaisAgora = medirContador\('perf31\.badge\.sinais', function \(\) \{/);
  assert.match(viewsCode,/return E\.contarSinaisRecentes \? E\.contarSinaisRecentes\(op\)/);
  assert.match(viewsCode,/const lista = Store\.sinaisDaOportunidade \? Store\.sinaisDaOportunidade\(op\) : \[\]/);
  const x=fixture(389);
  assert.equal(x.E.contarSinaisRecentes(x.op),x.E.sinaisRecentes(x.op).length);
  assert.ok(Array.isArray(x.E.sinaisRecentes(x.op)));
});
