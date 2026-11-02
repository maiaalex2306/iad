'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const s=fs.readFileSync(require('node:path').resolve(__dirname,'../../src/store.js'),'utf8');
test('snapshot de dados depende de revisao e escopo',()=>{
 assert.match(s,/\[revisaoDados, ctx\.usuario && ctx\.usuario\.id/);
 assert.match(s,/filtros\.tenant, filtros\.usuario/);
 assert.match(s,/snapshotVisivel\.estado === estado/);
});
test('nenhum cache persiste no navegador',()=> {
 const i=s.indexOf('let snapshotVisivel = null;'),j=s.indexOf('/* ---------- notas rápidas',i);
 assert.ok(i>0&&j>i);
 const x=s.slice(i,j);
 assert.doesNotMatch(x,/localStorage|sessionStorage|indexedDB/);
 assert.match(x,/return resultado/);
});


test('troca de identidade, escopo e revisao nunca reutiliza dados de outra pessoa',()=>{
 const vm=require('node:vm');
 let user={id:'u1',papel:'admin',tenantId:'a'},filters={tenant:'todas',usuario:'todos'};
 const window={console,IADAuth:{atual:()=>user,filtros:()=>filters}};
 const ctx={window,console,Date,Math,JSON,Map,Set,localStorage:{getItem(){return null},setItem(){},removeItem(){}}};
 vm.runInNewContext(s,ctx);
 const store=window.IADStore,base=store.obter();
 base.contas=[{id:'a1',tenantId:'a',donoId:'u1'},{id:'b1',tenantId:'b',donoId:'u2'}];
 base.oportunidades=[{id:'op1',tenantId:'a',donoId:'u1'},{id:'op2',tenantId:'b',donoId:'u2'}];
 const initial=store.dados();assert.equal(initial.oportunidades.length,2);
 assert.equal(store.dados(),initial);
 filters={tenant:'a',usuario:'todos'};
 const scoped=store.dados();assert.notEqual(scoped,initial);assert.equal(scoped.oportunidades.length,1);
 user={id:'u2',papel:'usuario',tenantId:'b'};
 const other=store.dados();assert.equal(other.oportunidades.length,1);
 assert.equal(other.oportunidades[0].id,'op2');
 user={id:'u1',papel:'admin',tenantId:'a'};filters={tenant:'todas',usuario:'todos'};
 base.oportunidades.push({id:'op3',tenantId:'a',donoId:'u1'});store.salvar();
 assert.equal(store.dados().oportunidades.length,3);
});
