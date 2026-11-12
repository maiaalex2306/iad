'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../../src/sincronia.js'),'utf8');
function boot(disk,initial){
 const Store={state:initial,obter(){return this.state;},quandoMudar(fn){this.change=fn;}};
 const p={disponivel:()=>true,guardar:async(state,user)=>{
    disk.set(user,JSON.parse(JSON.stringify(state)));return true;
   },ler:async user=>disk.has(user)?{estado:disk.get(user),donoId:user}:null,
   limpar:async()=>disk.delete('user-1')};
 const n={sessao:()=>({user:{id:'user-1'}}),conectado:()=>false,
  haMudancas:()=>true};
 const w={IADStore:Store,IADPendencias:p,IADNuvem:n,IADAuth:{atual:()=>({id:'user-1'})},
  addEventListener:()=>{},document:{addEventListener:()=>{},visibilityState:'hidden'}};
 const timers=[];
 vm.runInNewContext(src,{window:w,setTimeout:(fn)=>{timers.push(fn);return timers.length;},
  clearTimeout:()=>{},Date,Promise,console});
 w.IADSincronia.ligar();
 return {S:w.IADSincronia,Store,timers};
}
test('new opportunity survives tab restart even if 600ms sync debounce has not fired',async()=>{
 const disk=new Map();
 const o={id:'offline-opp-1',tenantId:'tenant-a',titulo:'Criada offline'};
 const state={oportunidades:[o],contas:[],contatos:[],tarefas:[]};
 const first=boot(disk,state);
 first.Store.change();
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(disk.has('user-1'),'snapshot must persist before sync timer');
 assert.ok(first.timers.length>0,'upload must remain deferred');
 const second=boot(disk,{oportunidades:[],contas:[],contatos:[],tarefas:[]});
 const recovered=await second.S.filaPendente();
 assert.equal(recovered.estado.oportunidades[0].id,o.id);
 assert.equal(recovered.estado.oportunidades[0].titulo,o.titulo);
});
