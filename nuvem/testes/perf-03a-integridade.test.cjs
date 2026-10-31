'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../..');

function montarNuvem() {
  const estado={contas:[],contatos:[],oportunidades:[{id:'local',titulo:'Não apagar'}],
    tarefas:[],produtos:[],segmentos:[],tiposTarefa:[],fontes:[],sinais:[],notas:[]};
  let saves=0;
  const store={obter:()=>estado,semSincronizar:f=>f(),salvar:()=>{saves++;}};
  const localStorage={getItem:()=>null,setItem(){},removeItem(){}};
  const w={IADStore:store,IADConfig:{supabase:{url:'https://teste.supabase.co',chave:'sb_publishable_teste'}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'src/nuvem.js'),'utf8'),
    {window:w,localStorage,Date,JSON,Set,Promise,console,fetch(){throw new Error('Chamada sem stub')}});
  return {N:w.IADNuvem,estado,saves:()=>saves};
}
function id(n){return 'id'+String(n).padStart(6,'0');}
test('puxa 1.205 oportunidades com servidor limitando resposta a 100 linhas por chamada',async()=>{
  const {N,estado,saves}=montarNuvem();
  const registros=Array.from({length:1205},(_,i)=>({id:id(i),titulo:'OP '+i}));
  let paginas=0;
  N.__trocarChamar((caminho)=>{
    const x=new URL(caminho,'https://teste.supabase.co');
    if(!x.pathname.endsWith('/oportunidades'))return Promise.resolve([]);
    paginas++;
    const limite=(x.searchParams.get('id')||'').replace(/^gt\./,'');
    const selecionadas=registros.filter(r=>r.id>limite).slice(0,100);
    return Promise.resolve(selecionadas);
  });
  const total=await N.puxar();
  assert.equal(total,1205);
  assert.equal(estado.oportunidades.length,1205);
  assert.equal(estado.oportunidades[1204].id,id(1204));
  assert.equal(paginas,14);
  assert.equal(saves(),1);
});
test('falha na página posterior nunca substitui carteira local, nem metade das tabelas',async()=>{
  const {N,estado,saves}=montarNuvem();
  N.__trocarChamar((path)=>{
    if(!path.includes('/oportunidades?'))return Promise.resolve([]);
    if(path.includes('&id=gt.'))return Promise.reject(new Error('Caiu a rede'));
    return Promise.resolve(Array.from({length:500},(_,i)=>({id:id(i)})));
  });
  await assert.rejects(()=>N.puxar(),/Caiu a rede/);
  assert.equal(estado.oportunidades[0].id,'local');
  assert.equal(saves(),0);
});
test('resposta repetida não gera laço infinito nem sobrescreve dados',async()=>{
  const {N,estado}=montarNuvem();
  N.__trocarChamar(path=>path.includes('/oportunidades?')
    ? Promise.resolve([{id:id(0)}]) : Promise.resolve([]));
  await assert.rejects(()=>N.puxar(),/Paginação repetida/);
  assert.equal(estado.oportunidades[0].id,'local');
});

test('Service Worker somente intercepta arquivos estáticos da própria origem',async()=>{
 const src=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 const eventos={};const gravacoes=[];
 const self={
   registration:{scope:'https://www.iadcrm.com.br/'},
   location:{origin:'https://www.iadcrm.com.br',href:'https://www.iadcrm.com.br/sw.js'},
   addEventListener:(tipo,fn)=>{eventos[tipo]=fn}
 };
 const caches={open:async()=>({put:async(chave)=>{gravacoes.push(String(chave))}}),
   match:async()=>null};
 const fetch=async()=>({ok:true,type:'basic',headers:{get:()=>''},clone(){return this;}});
 vm.runInNewContext(src,{self,URL,Request,Response,Set,caches,fetch,console});
 function evento(url){
   let resposta=null;const pedido={request:new Request(url),respondWith(x){resposta=x;}};
   eventos.fetch(pedido);return resposta;
 }
 assert.equal(evento('https://teste.supabase.co/rest/v1/oportunidades?select=*'),null);
 assert.equal(evento('https://www.iadcrm.com.br/rest/v1/oportunidades'),null);
 assert.equal(evento('https://www.iadcrm.com.br/?access_token=segredo'),null);
 assert.equal(evento('https://www.iadcrm.com.br/recuperar.html?token_hash=segredo'),null);
 assert.ok(evento('https://www.iadcrm.com.br/src/engine.js'));
 await evento('https://www.iadcrm.com.br/src/config.js');
 await Promise.resolve();await Promise.resolve();
 assert.ok(gravacoes.some(x=>x.endsWith('/src/config.js')));
 assert.ok(gravacoes.every(x=>!x.includes('supabase')&&!x.includes('token')));
});
