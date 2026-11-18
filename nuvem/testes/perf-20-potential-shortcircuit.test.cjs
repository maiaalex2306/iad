'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const code=fs.readFileSync(path.join(root,'src/engine.js'),'utf8');
const views=fs.readFileSync(path.join(root,'src/views.js'),'utf8');
const DIMENSOES=['problema','prioridade','impacto','stakeholders','criterios','processo','consenso','risco']
  .map(id=>({id}));
const P={DIMENSOES,IAD_QUE_ANDOU:8};
function setup(oportunidades,contas,recusas=[]){
  let dadosConsultados=0;
  let contatosConsultados=0;
  const porId=new Map(contas.map(c=>[c.id,c]));
  const Store={
    dados(){dadosConsultados++;return {oportunidades};},
    conta(id){return porId.get(id);},
    recusas(){return recusas;},
    contatosDaConta(){contatosConsultados++;return [];}
  };
  const w={IADPlaybook:P,IADStore:Store};
  vm.runInNewContext(code,{window:w,Date,Number,Math,JSON,Map,Set,console},{filename:'engine.js'});
  return {E:w.IADEngine,consultas:()=>dadosConsultados,contatos:()=>contatosConsultados};
}
function antigo(ops,contas,recusas){
  const porId=new Map(contas.map(c=>[c.id,c]));
  const segmentos={};let ganhos=0,andaram=0;
  for(const op of ops){
    const conta=porId.get(op.contaId);
    const seg=(conta&&conta.segmento)||'Sem segmento';
    if(!seg||seg==='Sem segmento')continue;
    if(op.desfecho&&op.desfecho.tipo==='ganho'){
      segmentos[seg]='ganho';ganhos++;continue;
    }
    if(segmentos[seg]==='ganho')continue;
    const pontos=P.DIMENSOES.reduce((n,d)=>n+(op.dims[d.id]||0),0);
    if(pontos>=P.IAD_QUE_ANDOU){segmentos[seg]='andou';andaram++;}
  }
  const recusados={};
  for(const r of recusas){
    const key=String(r.linkedin||'').trim().toLowerCase()
      .replace(/^https?:\/\//,'').replace(/^www\./,'')
      .replace(/\?.*$/,'').replace(/\/+$/,'');
    if(key)recusados[key]=r;
  }
  return {segmentos,temHistorico:(ganhos+andaram)>0,recusados};
}
function normal(v){return JSON.parse(JSON.stringify(v));}
function novoOp(id,contaId,dimValue,desfecho,contador){
  const dims={};
  for(const {id:k} of DIMENSOES){
    Object.defineProperty(dims,k,{enumerable:true,get(){
      if(contador)contador.reads++;
      return dimValue;
    }});
  }
  return {id,contaId,dims,desfecho};
}
test('Resultado idêntico ao algoritmo anterior: segmentos ganhos, maduros e não maduros',()=>{
  const contas=[{id:'a',segmento:'Quimico'},{id:'b',segmento:'Alimentos'},
    {id:'c',segmento:'Saude'},{id:'d',segmento:''}];
  const ops=[
    novoOp('1','a',1,null),novoOp('2','a',2,null),novoOp('3','a',0,null),
    novoOp('4','b',0,null),novoOp('5','b',0,{tipo:'ganho'}),
    novoOp('6','b',2,null),novoOp('7','c',0,null),novoOp('8','d',2,null),
    novoOp('9','inexistente',2,null),
    novoOp('10','a',2,{tipo:'perdido_concorrente'}),
    novoOp('11','a',0,{tipo:'ganho'})
  ];
  const refusas=[{linkedin:'https://www.linkedin.com/in/user/?x=y',motivo:'Não'}];
  const esperado=antigo(ops,contas,refusas);
  const {E}=setup(ops,contas,refusas);
  assert.deepEqual(normal(E.baseDoPotencial()),normal(esperado));
  assert.deepEqual(normal(E.baseDoPotencial(ops.slice(0,7))),
    normal(antigo(ops.slice(0,7),contas,refusas)));
});
test('Carteiras sintéticas 389/5000/10000: eliminar IAD redundante sem mudar resultado',()=>{
  for(const size of [389,5000,10000]){
    const counters={reads:0};
    const contas=Array.from({length:384},(_,i)=>({id:'c'+i,segmento:'Segmento '+(i%24)}));
    const ops=Array.from({length:size},(_,i)=>novoOp('op'+i,'c'+(i%384),
      i<24?1:0,i===size-1?{tipo:'ganho'}:null,counters));
    const esperado=antigo(ops,contas,[]);
    const originalReads=counters.reads;
    counters.reads=0;
    const {E}=setup(ops,contas);
    const atual=E.baseDoPotencial();
    const optimizedReads=counters.reads;
    assert.deepEqual(normal(atual),normal(esperado),'paridade do baseline '+size);
    assert.ok(optimizedReads<originalReads/5,
      'redução >=80% na leitura de dimensoes: '+optimizedReads+' vs '+originalReads);
    console.log('PERF20_BASE '+JSON.stringify({oportunidades:size,dimReadsBefore:originalReads,
      dimReadsAfter:optimizedReads,avoidedPct:Math.round((1-optimizedReads/originalReads)*10000)/100}));
  }
});
test('Segmento ganho em último item prevalece sobre a maturidade já conhecida',()=>{
  const contas=[{id:'c',segmento:'Industria'}];
  const ops=[novoOp('1','c',2,null),novoOp('2','c',0,null),
    novoOp('3','c',0,{tipo:'ganho'})];
  const {E}=setup(ops,contas);
  assert.equal(E.baseDoPotencial().segmentos.Industria,'ganho');
  assert.deepEqual(normal(E.baseDoPotencial()),normal(antigo(ops,contas,[])));
});
test('Oportunidade encerrada não consulta carteira nem stakeholders',()=>{
  const contas=[{id:'c',segmento:'Quimico'}];
  const op=novoOp('1','c',2,{tipo:'ganho'});
  const w=setup([op],contas);
  assert.equal(w.E.potencial(op),null);
  assert.equal(w.consultas(),0);
  assert.equal(w.contatos(),0);
});
test('Camada de views preserva comportamento e não monta base para closed',()=>{
  assert.match(views,/function potencialDe\(op\)\s*\{[\s\S]*?if \(!op \|\| op\.desfecho\) return null;/);
  assert.match(code,/function potencial\(op, base\)\s*\{[\s\S]*?if \(!op \|\| op\.desfecho\) return null;/);
});
