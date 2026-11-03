'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../../src/email.js'), 'utf8');
function fixture() {
  let messages=[];
  const data={contas:[],contatos:[],oportunidades:[]};
  for(let i=0;i<40;i++) {
    const id='a'+i;
    data.contas.push({id,site:'https://www.empresa'+i+'.com.br/home'});
    data.contatos.push({id:'c'+i,contaId:id,email:'pessoa'+i+'@empresa'+i+'.com.br',emailPessoal:'extra'+i+'@empresa'+i+'.com.br'});
    data.oportunidades.push({id:'op'+i,contaId:id,desfecho:null,dims:{problema:i%5}});
    if(i%4===0)data.oportunidades.push({id:'op-alt'+i,contaId:id,desfecho:null,dims:{problema:4}});
  }
  const Store={
    dados:()=>data,
    conta:id=>data.contas.find(c=>c.id===id)||null,
    contato:id=>data.contatos.find(c=>c.id===id)||null,
    oportunidade:id=>data.oportunidades.find(o=>o.id===id)||null
  };
  const window={
    IADStore:Store,
    IADAuth:{usuarios:()=>[{email:'user@interno.net'}]},
    IADNuvem:{conectado:()=>true,estado:()=>({email:'user@interno.net'}),emailsDaNuvem:()=>Promise.resolve(messages)},
    IADEngine:{iad:op=>op.dims.problema}
  };
  vm.runInNewContext(code,{window,Map,Set,Promise,Date,JSON,Math,Object,String,Number,console});
  const api=window.IADEmail;
  return {api,data,carregar:async m=>{messages=m;await api.carregar(true);}};
}
function paridade(f) {
  const all=f.api.conversas();
  for(const c of all) {
    const base=c.mensagens.find(m=>m.direcao==='entrada')||c.mensagens[0];
    const direct=f.api.casar(base);
    assert.equal(c.op&&c.op.id,direct.op&&direct.op.id);
    assert.equal(c.conta&&c.conta.id,direct.conta&&direct.conta.id);
    assert.equal(c.contato&&c.contato.id,direct.contato&&direct.contato.id);
    assert.equal(c.como,direct.como);
  }
  for(const op of f.data.oportunidades) {
    const old=f.api.conversasDaOportunidade(op.id).reduce((n,c)=>n+c.naoLidas,0);
    assert.equal(f.api.naoLidasDaOp(op.id),old,'unread '+op.id);
  }
}
test('PERF-28: batch index preserves legacy direct matching on 4000 messages',async()=>{
 const f=fixture(),messages=[];
 for(let i=0;i<4000;i++){
   const z=i%40;
   const sender=i%9===0?'user@interno.net':i%7===0?'unknown@empresa'+z+'.com.br':
     i%5===0?'x@gmail.com':'pessoa'+z+'@empresa'+z+'.com.br';
   messages.push({id:'m'+i,thread:'thread-'+Math.floor(i/4),
      enviada_em:'2026-11-'+String(i%20+1).padStart(2,'0'),
      direcao:i%6===0?'saida':'entrada',
      de:sender,para:'pessoa'+z+'@empresa'+z+'.com.br',
      lida:i%3!==0,assunto:'thread',
      ...(i%31===0?{oportunidade_id:'op'+z}:{})});
 }
 await f.carregar(messages);
 paridade(f);
 f.data.contatos[0].email='alterado@empresa0.com.br';
 f.data.oportunidades[1].desfecho={tipo:'ganho'};
 paridade(f);
 f.data.contas[0].site='https://www.outro.com.br';
 paridade(f);
});
test('PERF-28: no data or logout has no stale shared index',async()=>{
 const f=fixture();await f.carregar([{id:'1',de:'pessoa0@empresa0.com.br',direcao:'entrada',lida:false}]);
 paridade(f);f.api.esquecer();assert.equal(f.api.conversas().length,0);
 assert.equal(f.api.naoLidasDaOp('op0'),0);
});
