'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../../src/email.js'),'utf8');
function fixture(){
 let msgs=[],scans=0;
 const data={contas:[{id:'a',site:'cliente.com'},{id:'b',site:'outro.com'}],
 contatos:[{id:'c',contaId:'a',email:'ana@cliente.com'},{id:'d',contaId:'b',email:'outro@outro.com'}],
 oportunidades:[{id:'oa',contaId:'a',desfecho:null,dims:{problema:1}},{id:'ob',contaId:'b',desfecho:null,dims:{problema:2}}]};
 const store={dados:()=>{scans++;return data;},conta:id=>data.contas.find(x=>x.id===id)||null,
 contato:id=>data.contatos.find(x=>x.id===id)||null,
 oportunidade:id=>data.oportunidades.find(x=>x.id===id)||null};
 const w={IADStore:store,IADAuth:{usuarios:()=>[{email:'vendedor@interno.net'}]},
 IADNuvem:{conectado:()=>true,estado:()=>({email:'vendedor@interno.net'}),
 emailsDaNuvem:()=>Promise.resolve(msgs)},IADEngine:{iad:op=>op.dims.problema}};
 vm.runInNewContext(code,{window:w,Map,Set,Promise,Date,JSON,Math,Object,String,Number,console});
 const e=w.IADEmail;
 return {e,data,scans:()=>scans,carregar:async m=>{msgs=m;await e.carregar(true);}};
}
function parity(f) {
 for(const id of ['oa','ob','nao-existe']){
  const expected=f.e.conversasDaOportunidade(id).reduce((sum,c)=>sum+c.naoLidas,0);
  assert.equal(f.e.naoLidasDaOp(id),expected,id);
 }
}
test('PERF-29 zero unread skips all CRM matching and index work for 10000 messages',async()=>{
 const f=fixture(),all=[];
 for(let i=0;i<10000;i++)all.push({id:'m'+i,thread:'t'+(i%1000),direcao:i%4?'entrada':'saida',
 lida:true,de:'ana@cliente.com',enviada_em:'2026-11-02'});
 await f.carregar(all);
 const before=f.scans();
 for(let i=0;i<100;i++) assert.equal(f.e.naoLidasDaOp('oa'),0);
 assert.equal(f.scans(),before,'zero unread must not scan Store.dados');
 parity(f);
});
test('PERF-29 direct path: 1-3 unread threads keeps legacy matching with runtime edits',async()=>{
 const f=fixture(),m=[
 {id:'1',thread:'first',direcao:'saida',para:'ana@cliente.com',enviada_em:'2026-11-01',lida:false},
 {id:'2',thread:'first',direcao:'entrada',de:'ana@cliente.com',enviada_em:'2026-11-02',lida:false},
 {id:'3',thread:'second',direcao:'entrada',de:'outro@outro.com',enviada_em:'2026-11-01',lida:false},
 {id:'4',thread:'third',direcao:'entrada',de:'vendedor@interno.net',enviada_em:'2026-11-01',lida:false}
 ];
 await f.carregar(m);
 parity(f);
 m[1].lida=true;
 parity(f);
 f.data.contatos[0].email='outro@cliente.com';
 parity(f);
});
test('PERF-29 indexed path: 4+ unread threads, tenant/user and message changes',async()=>{
 const f=fixture(),m=[];
 for(let i=0;i<4000;i++)m.push({id:'m'+i,thread:'t'+Math.floor(i/2),
 direcao:i%2?'saida':'entrada',de:i%4?'ana@cliente.com':'outro@outro.com',
 para:'ana@cliente.com',enviada_em:'2026-11-02',lida:i%7!==0});
 await f.carregar(m);parity(f);
 f.data.oportunidades[0].desfecho={tipo:'ganho'};
 parity(f);f.e.esquecer();
 assert.equal(f.e.naoLidasDaOp('oa'),0);
});
