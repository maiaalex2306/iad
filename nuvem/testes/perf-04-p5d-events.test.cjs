'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const w={};vm.runInNewContext(fs.readFileSync('src/p5d-events.js','utf8'),{window:w});
function setup(){
 let revision=0,listener=null,scope={usuarioId:'u1',tenantId:'t1',papel:'vendedor',revisao:0};
 const store={revisao:()=>revision,inscreverMudancas:(fn)=>{listener=fn;return()=>{listener=null;}}};
 const ctrl=w.IADP5dEventos.criar(store,()=>({...scope,revisao:revision}));
 return {ctrl,scope,emit:(type,id)=>{revision++;listener({tipo:type,id,revisao:revision});},skip:()=>{revision++;},getListener:()=>listener};
}
test('primeira leitura integral, depois deltas por id',()=>{
 const e=setup();assert.equal(e.ctrl.consumir().completo,true);
 e.emit('atualizada','a');e.emit('criada','b');
 assert.deepEqual(Array.from(e.ctrl.consumir().ids),['a','b']);
 assert.equal(e.ctrl.consumir().completo,false);
});
test('exclusão e mudança desconhecida forçam reconstrução segura',()=>{
 const e=setup();e.ctrl.consumir();e.emit('excluida','a');
 assert.deepEqual(Array.from(e.ctrl.consumir().ids),['a']);
 e.emit('full',null);
 assert.equal(e.ctrl.consumir().completo,true);
 e.skip();assert.equal(e.ctrl.consumir().completo,true);
});
test('troca de tenant e filtros invalida e descarta deltas',()=>{
 const e=setup();e.ctrl.consumir();e.emit('atualizada','a');
 e.scope.tenantId='t2';
 let x=e.ctrl.consumir();assert.equal(x.completo,true);assert.equal(x.ids.length,0);
 e.scope.filtroUsuario='outro';assert.equal(e.ctrl.consumir().completo,true);
 e.scope.usuarioId='u2';assert.equal(e.ctrl.consumir().completo,true);
});
test('revogação desinscreve e bloqueia leitura',()=>{
 const e=setup();e.ctrl.consumir();e.ctrl.revogar();
 assert.equal(e.getListener(),null);
 assert.throws(()=>e.ctrl.consumir(),/revogado/);
});
