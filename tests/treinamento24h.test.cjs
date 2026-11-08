'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function harness(storageDisabled=false) {
 const db=new Map(), current={usuario:{id:'vendedor-1',papel:'vendedor'},tenantId:'tenant-a',admin:false,gestor:false,filtros:{tenant:'todas'}};
 let writes=0;
 const localStorage={
  getItem(k){if(storageDisabled)throw Error('storage disabled');return db.get(k)||null},
  setItem(k,v){if(storageDisabled)throw Error('storage disabled');db.set(k,v)},
  removeItem(k){db.delete(k)}
 };
 const w={localStorage,location:{hash:'#/playbook'},confirm:()=>true,
  document:{getElementById:()=>null},
  IADStore:{contexto:()=>current,nomesDoCatalogo:()=>['E-mail','WhatsApp'],salvar:()=>{writes++}},
  IADViewsManualDados:{FILTROS:[]},
  IADUI:{esc:t=>String(t??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),data:t=>String(t)},
  IADEngine:{}, IADVersao:{numero:'v286.98',data:'2026-11-08'}};
 w.window=w;
 vm.runInNewContext(read('src/playbook.js'),w);
 vm.runInNewContext(read('src/views-manual.js'),w,{filename:'src/views-manual.js'});
 return {w,db,current,writes:()=>writes};
}
test('TR-24: painel fica antes do Manual e tem sete etapas verificáveis',()=>{
 const {w}=harness(),html=w.IADViewsManual.playbook();
 const panel=html.indexOf('id="iad-treino-24h"'),manual=html.indexOf('Manual do IAD CRM');
 assert.ok(panel>=0&&panel<manual);
 assert.match(html,/Painel — Aprenda Vendendo/);
 assert.match(html,/0–2h/);
 assert.match(html,/21–24h/);
 assert.equal((html.match(/Etapa realizada/g)||[]).length,7);
 assert.match(html,/Iniciar minha jornada de 24 horas/);
 assert.match(html,/Peça ao gestor a lista/);
 assert.match(html,/Inteligência Comercial e Mercado são restritas a gestores/);
 assert.match(html,/Manual do IAD CRM/);
});
test('TR-24: estado só muda após clique e não altera dados comerciais',()=>{
 const {w,db,writes}=harness();
 assert.equal(db.size,0);
 w.IADViewsManual.marcarTreinamento('preparar',true);
 assert.equal(db.size,0,'não marca antes de iniciar');
 w.IADViewsManual.iniciarTreinamento();
 assert.equal(db.size,1);
 let html=w.IADViewsManual.playbook();
 assert.match(html,/0\/7/);
 w.IADViewsManual.marcarTreinamento('preparar',true);
 html=w.IADViewsManual.playbook();
 assert.match(html,/1\/7/);
 assert.match(html,/14%/);
 w.IADViewsManual.marcarTreinamento('nao-existe',true);
 assert.match(w.IADViewsManual.playbook(),/1\/7/);
 w.IADViewsManual.marcarTreinamento('preparar',false);
 assert.match(w.IADViewsManual.playbook(),/0\/7/);
 assert.equal(writes(),0);
 assert.equal([...db.values()].some(v=>/telefone|empresaNome|prospecto|leadId/i.test(v)),false);
});
test('TR-24: usuário e tenant isolados, admin precisa escolher empresa',()=>{
 const {w,db,current}=harness();
 w.IADViewsManual.iniciarTreinamento();
 w.IADViewsManual.marcarTreinamento('preparar',true);
 current.tenantId='tenant-b';
 assert.match(w.IADViewsManual.playbook(),/Jornada ainda não iniciada/);
 w.IADViewsManual.iniciarTreinamento();
 assert.equal(db.size,2);
 current.tenantId='tenant-a';
 assert.match(w.IADViewsManual.playbook(),/1\/7/);
 current.usuario.id='vendedor-2';
 assert.match(w.IADViewsManual.playbook(),/0\/7/);
 current.admin=true;current.gestor=true;current.filtros.tenant='todas';
 assert.match(w.IADViewsManual.playbook(),/Selecione uma empresa no filtro administrativo/);
 const n=db.size;w.IADViewsManual.iniciarTreinamento();assert.equal(db.size,n);
 current.filtros.tenant='tenant-b';
 w.IADViewsManual.iniciarTreinamento();
 assert.equal(db.size,n+1);
});
test('TR-24: sem armazenamento, fallback somente nesta sessão',()=>{
 const {w}=harness(true);
 w.IADViewsManual.iniciarTreinamento();
 w.IADViewsManual.marcarTreinamento('preparar',true);
 const html=w.IADViewsManual.playbook();
 assert.match(html,/1\/7/);
 assert.match(html,/Armazenamento local indisponível/);
});
test('TR-24: menu visível muda nome sem mudar rota e PWA mantém versão',()=>{
 const app=read('src/app.js'),sw=read('sw.js'),config=read('src/config.js');
 assert.match(app,/hash: '#\/playbook', ico: '🎓', nome: 'Treinamento de Vendas'/);
 assert.match(app,/render: V\.playbook/);
 assert.match(sw,/iad-crm-v286\.98/);
 assert.match(config,/numero: 'v286\.98'/);
 assert.match(read('README.md'),/Treinamento de Vendas/);
});
