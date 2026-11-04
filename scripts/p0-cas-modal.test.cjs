'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app.js','utf8');
const start=source.indexOf('  function vigiarGravacao(sinc) {');
const end=source.indexOf('  function minutosDe(ms)',start);
assert.ok(start>=0&&end>start,'real sync watchdog source exists');
function harness(blocked){
 let closed=0,cleared=0,shown=0,queued=0;
 const ctx={global:{IADSincronia:{temSessao:()=>true,estado:()=>({situacao:'erro',desde:1})}},
   semServidor:blocked?'Há edições CAS pendentes neste dispositivo.':'',
   avisadoEm:0,relogioDoAviso:35,caixaDoAviso:{isConnected:true,close(){closed++;}},
   clearTimeout(){cleared++;},setTimeout(){queued++;return 77;},
   REPETIR_O_AVISO:300000,ESPERA_PARA_INTERROMPER:12000,
   Date,Math,String,
   mostrarQueNaoEstaSalvando(){shown++}};
 vm.runInNewContext(source.slice(start,end)+'globalThis.check=vigiarGravacao;',ctx);
 return {check:ctx.check,ctx,state:()=>({closed,cleared,shown,queued})};
}
test('CAS blocked view suppresses repeated modal and cancels timer',()=>{
 const h=harness(true);h.check({situacao:'erro',desde:Date.now()-60000,naFila:true});
 assert.equal(h.state().shown,0);assert.equal(h.state().closed,1);
 assert.equal(h.state().cleared,1);assert.equal(h.state().queued,0);
 assert.equal(h.ctx.caixaDoAviso,null);
});
test('unrelated network failure retains original warning behavior',()=>{
 const h=harness(false);h.ctx.caixaDoAviso=null;
 h.check({situacao:'erro',desde:Date.now()-60000,naFila:true});
 assert.equal(h.state().shown,1);
});
test('CAS screen render closes any older sync failure dialog',()=>{
 const segment=source.slice(source.indexOf("conteudo.innerHTML = V.semServidor(semServidor)"),source.indexOf("conteudo.innerHTML = V.semServidor(semServidor)")+1100);
 assert.match(segment,/caixaDoAviso\.close\(\)/);
 assert.match(segment,/relogioDoAviso/);
});
test('does not promise automatic replay of permanent conflicts',()=>{
 const text=source.slice(source.indexOf('  function mostrarQueNaoEstaSalvando(sinc) {'),source.indexOf('  /* ---------- sair sozinho',source.indexOf('  function mostrarQueNaoEstaSalvando(sinc) {')));
 assert.match(text,/conciliação/);
 assert.doesNotMatch(text,/sobe sozinho assim que o envio voltar/);
});
test('release versions agree',()=>{
 assert.match(fs.readFileSync('src/config.js','utf8'),/numero: 'v286.43'/);
 assert.match(fs.readFileSync('sw.js','utf8'),/const CACHE = 'iad-crm-v286.43'/);
});
