'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),path = require('node:path'),vm=require('node:vm');
const codigo = fs.readFileSync(path.join(__dirname,'../../src/whatsapp.js'),'utf8');
function fixture() {
 let mensagens=[],consultas=0;
 const dados={contatos:[],oportunidades:[]};
 for(let i=0;i<75;i++) {
   const contato='c'+i;
   // 75 independent Brazilian numbers; include 8-digit ambiguity between area codes.
   const numero='55'+String(11+i%20).padStart(2,'0')+'9'+String(10000000+i).padStart(8,'0');
   dados.contatos.push({id:contato,telefone:numero,telefoneComercial:'',contaId:'a'+i});
   dados.oportunidades.push({id:'op'+i,contaId:'a'+i,stakeholders:[contato],desfecho:null});
 }
 const store={
   dados:()=>{consultas++;return dados;},
   contato:id=>dados.contatos.find(c=>c.id===id)||null,
   oportunidade:id=>dados.oportunidades.find(o=>o.id===id)||null
 };
 const W={
   IADStore:store,
   IADNuvem:{conectado:()=>true,mensagensWhatsapp:()=>Promise.resolve(mensagens),
     marcarLidasWhatsapp:()=>Promise.resolve(),vincularWhatsapp:()=>Promise.resolve()}
 };
 vm.runInNewContext(codigo,{window:W,Map,Set,Date,Math,Object,Array,JSON,String,Number,Promise,console});
 return {api:W.IADWhatsapp,dados,consultas:()=>consultas,
    carregar:async list=>{mensagens=list;await W.IADWhatsapp.carregar(true);}};
}
function conferir(f,ids) {
 const todas=f.api.conversas();
 for(const id of ids) {
  const esperado=todas.filter(c=>c.op && c.op.id===id).reduce((n,c)=>n+c.naoLidas,0);
  assert.equal(f.api.naoLidasDaOp(id),esperado,'paridade '+id);
 }
}
test('PERF-30: 12000 mensagens lidas/historicas retornam zero sem consultas comerciais',async()=>{
 const f=fixture(),lista=[];
 for(let i=0;i<12000;i++){
  lista.push({id:'m'+i,telefone:f.dados.contatos[i%75].telefone,
     enviada_em:'2026-11-02T12:00:00Z',direcao:i%2?'entrada':'saida',
     lida:true,origem:i%3===0?'historico':'novo'});
 }
 await f.carregar(lista);
 const antes=f.consultas();
 for(let n=0;n<80;n++)assert.equal(f.api.naoLidasDaOp('op0'),0);
 assert.equal(f.consultas(),antes,'zero unread nao deve consultar Store');
 conferir(f,['op0','op35','op74']);
});
test('PERF-30: paridade de mensagens fora de ordem, historico e vinculos gravados',async()=>{
 const f=fixture(),numeros=f.dados.contatos.map(c=>c.telefone);
 const lista=[];
 for(let i=0;i<3500;i++){
  const ix=i%75;
  lista.push({id:'m'+i,telefone:numeros[ix],
   telefone_curto:null,origem:i%9===0?'historico':'nova',
   enviada_em:'2026-10-'+String((i*7)%28+1).padStart(2,'0')+'T00:00:00Z',
   direcao:i%3===0?'saida':'entrada',lida:i%6!==1,
   ...(i%101===0?{contato_id:'c'+ix,oportunidade_id:'op'+ix}:{})});
 }
 // One saved binding in older message, one newer contact binding.
 lista.push({id:'older',telefone:numeros[0],direcao:'entrada',lida:false,
   contato_id:'c0',oportunidade_id:'op1',enviada_em:'2026-01-01'});
 lista.push({id:'newer',telefone:numeros[0],direcao:'saida',lida:true,
   contato_id:'c0',oportunidade_id:'op0',enviada_em:'2026-12-01'});
 await f.carregar(lista);
 conferir(f,['op0','op1','op2','op25','op60','op74','missing']);
 f.dados.oportunidades[0].desfecho={tipo:'ganho'};
 conferir(f,['op0','op1','op2','op74']);
 lista[1].lida=true;
 conferir(f,['op0','op1','op74']);
});
test('PERF-30: leitura otimista, alteracao de vinculo e logout nao vazam contador',async()=>{
 const f=fixture(),phone=f.dados.contatos[0].telefone;
 await f.carregar([{id:'a',telefone:phone,direcao:'entrada',lida:false,origem:'nova',enviada_em:'2026-10-01'}]);
 assert.equal(f.api.naoLidasDaOp('op0'),1);
 await f.api.marcarLidas(f.api.curto(phone));
 assert.equal(f.api.naoLidasDaOp('op0'),0);
 await f.carregar([{id:'b',telefone:phone,direcao:'entrada',lida:false,
     contato_id:'c0',oportunidade_id:'op1',enviada_em:'2026-10-02'}]);
 conferir(f,['op0','op1']);
 f.api.esquecer();
 assert.equal(f.api.naoLidasDaOp('op0'),0);
});
