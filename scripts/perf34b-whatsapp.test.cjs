'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('src/app.js','utf8');
const start=app.indexOf('  /* PERF-34B: o refresh manual');
const end=app.indexOf('  /* PERF-33: canais carregam',start);
assert.ok(start>=0&&end>start,'manual reload segment found');
const code=app.slice(start,end);
function harness(){
 let calls=[],resolveLoad;
 const promise=new Promise(r=>resolveLoad=r);
 const ctx={App:{},W:{disponivel:()=>true,carregar:(force)=>{calls.push('load:'+force);return promise;}},colher:()=>{calls.push('collect');},assinaturaDaAtualizacaoDoCanal:()=>{calls.push('snapshot');return 'u1/t1/rev1';},atualizarCanalSemReabrirCockpit:(channel,sig)=>{calls.push('update:'+channel+':'+sig);},render:()=>{throw Error('whole cockpit render is forbidden');}};
 vm.runInNewContext(code,ctx);
 return {ctx,calls,resolveLoad};
}
test('manual WhatsApp request uses targeted update after loading',async()=>{
 const h=harness();
 const p=h.ctx.App.recarregarConversas();
 assert.deepEqual(h.calls,['snapshot','load:true']);
 h.resolveLoad();
 await p;
 assert.deepEqual(h.calls,['snapshot','load:true','collect','update:whatsapp:u1/t1/rev1']);
});
test('manual refresh returns promise so failures remain observable',async()=>{
 const h=harness();
 assert.equal(typeof h.ctx.App.recarregarConversas().then,'function');
 h.resolveLoad();
});
test('coordinated PWA version',()=>{
 const cfg=fs.readFileSync('src/config.js','utf8');
 const sw=fs.readFileSync('sw.js','utf8');
 assert.match(cfg,/numero: 'v286.33'/);
 assert.match(sw,/const CACHE = 'iad-crm-v286.33'/);
});
