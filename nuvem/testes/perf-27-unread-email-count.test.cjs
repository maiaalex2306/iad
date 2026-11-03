'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const codigo = fs.readFileSync(path.join(__dirname, '../../src/email.js'), 'utf8');
function criar() {
  const dados = {
    contas:[{id:'a',site:'cliente.com'},{id:'b',site:'outro.com'}],
    contatos:[{id:'c',contaId:'a',email:'ana@cliente.com'},{id:'d',contaId:'b',email:'outro@outro.com'}],
    oportunidades:[{id:'op-a',contaId:'a',desfecho:null},{id:'op-b',contaId:'b',desfecho:null}]
  };
  let mensagens=[];
  const Store={
    dados:()=>dados,
    conta:id=>dados.contas.find(x=>x.id===id)||null,
    contato:id=>dados.contatos.find(x=>x.id===id)||null,
    oportunidade:id=>dados.oportunidades.find(x=>x.id===id)||null
  };
  const w={
    IADNuvem:{conectado:()=>true,emailsDaNuvem:()=>Promise.resolve(mensagens),estado:()=>({email:'vendedor@interno.com'})},
    IADStore:Store,
    IADAuth:{usuarios:()=>[{email:'vendedor@interno.com'}]},
    IADEngine:{iad:()=>0}
  };
  vm.runInNewContext(codigo,{window:w,console,Promise,Map,Set,Date,Number,Object,Math,JSON});
  return {e:w.IADEmail,dados,definir:async x=>{mensagens=x;await w.IADEmail.carregar(true);}};
}
function comparar(e) {
  for(const id of ['op-a','op-b','sem-op']) {
    const esperado=e.conversasDaOportunidade(id).reduce((s,c)=>s+c.naoLidas,0);
    assert.equal(e.naoLidasDaOp(id),esperado,'paridade '+id);
  }
}
test('PERF-27: threads antigas, recebidas fora de ordem e sem mensagens novas',async()=>{
  const a=criar();
  await a.definir([
    {id:'1',thread:'x',enviada_em:'2026-11-02',direcao:'saida',para:'ana@cliente.com',lida:false},
    {id:'2',thread:'x',enviada_em:'2026-11-03',direcao:'entrada',de:'outro@outro.com',lida:false},
    {id:'3',thread:'x',enviada_em:'2026-11-01',direcao:'entrada',de:'ana@cliente.com',lida:true},
    {id:'4',thread:'y',enviada_em:'2026-11-01',direcao:'entrada',de:'ana@cliente.com',lida:false},
    {id:'5',thread:'z',enviada_em:'2026-11-01',direcao:'entrada',de:'vendedor@interno.com',lida:false},
    {id:'6',thread:'t',enviada_em:'2026-11-01',direcao:'entrada',de:'outro@outro.com',lida:true}
  ]);
  comparar(a.e);
  assert.equal(a.e.naoLidasDaOp('op-a'),2);
  assert.equal(a.e.naoLidasDaOp('op-b'),0);
  a.dados.contatos[0].email='mudou@cliente.com';
  comparar(a.e);
});
test('PERF-27: associação gravada, domínio, e mudança de responsável',async()=>{
  const a=criar();
  await a.definir([
    {id:'1',thread:'x',enviada_em:'2026-10-01',direcao:'entrada',de:'desconhecido@cliente.com',lida:false},
    {id:'2',thread:'y',enviada_em:'2026-10-01',direcao:'entrada',de:'alguem@gmail.com',oportunidade_id:'op-b',lida:false},
    {id:'3',thread:'z',enviada_em:'2026-10-01',direcao:'entrada',de:'ana@cliente.com',lida:false}
  ]);
  comparar(a.e);
  a.dados.oportunidades[0].desfecho={tipo:'ganho'};
  comparar(a.e);
});
test('PERF-27: carteira de milhares de e-mails e casos com datas empatadas',async()=>{
  const a=criar(),msgs=[];
  for(let i=0;i<4000;i++){
    msgs.push({id:'m'+i,thread:'t'+Math.floor(i/4),
      enviada_em:'2026-11-'+String(1+i%15).padStart(2,'0'),
      direcao:i%3===0?'saida':'entrada',
      de:i%2?'ana@cliente.com':'outro@outro.com',
      para:'ana@cliente.com',lida:i%7!==0});
  }
  await a.definir(msgs);
  comparar(a.e);
  a.e.esquecer();
  assert.equal(a.e.naoLidasDaOp('op-a'),0);
});
