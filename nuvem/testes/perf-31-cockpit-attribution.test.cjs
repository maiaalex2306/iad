'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const views=fs.readFileSync(path.join(root,'src/views.js'),'utf8');
const performanceCode=fs.readFileSync(path.join(root,'src/performance.js'),'utf8');
const sentinel='HEINEKEN_PRIVATE_TOKEN_982714';
function fixture(){
 let clock=0;
 const w={performance:{now:()=>clock},console};
 vm.runInNewContext(performanceCode,{window:w,Date,Math,Number,JSON,Object,console});
 const p=w.IADPerformance;
 const store={tarefasDaOportunidade:()=>[{status:'aberta'},{status:'aberta'},{status:'fechada'}]};
 const E={contarSinaisRecentes:()=>4};
 w.IADWhatsapp={carregadas:()=>true,naoLidasDaOp:()=>7};
 w.IADEmail={carregadas:()=>true,naoLidasDaOp:()=>9};
 const start=views.indexOf('  function abasDoCockpit(op) {');
 const end=views.indexOf('  /* Aba isolada:',start);
 assert.ok(start>0&&end>start);
 const avaliar=()=>vm.runInNewContext(views.slice(start,end)+'\nabasDoCockpit({id:"op1"});',{
   global:{IADWhatsapp:w.IADWhatsapp,IADEmail:w.IADEmail,IADPerformance:p},
   Store:store,E,ABAS_COCKPIT:[['tarefas','Tarefas'],['whatsapp','WhatsApp'],['sinais','Sinais'],['email','E-mail']],
   AJUDA_COCKPIT:{},abaCockpit:'decisao',esc:x=>String(x),Math,Date,Object
 });
 return {w,p,avaliar,advance:n=>{clock+=n;}};
}
test('PERF-31: all four counters preserve HTML and record fixed safe metric names',()=>{
 const f=fixture();
 const baseline=f.avaliar();
 f.p.iniciar();
 const measured=f.avaliar();
 assert.equal(measured,baseline);
 for(const [name,expected] of [['tarefas',2],['whatsapp',7],['sinais',4],['email',9]]){
   assert.match(measured,new RegExp('>'+expected+'<'));
   const m=f.p.relatorioDiagnostico()['perf31.badge.'+name];
   assert.equal(m.chamadas,1,name);
 }
 const safe=f.p.exportarDiagnosticoJSON();
 assert.doesNotMatch(safe,/op1/);
 assert.match(safe,/perf31.badge.whatsapp/);
});
test('PERF-31: initial header/content and per-badge metrics on allowlist, no leaked IDs',()=>{
 const f=fixture();
 f.p.iniciar();
 for(const metric of ['perf31.cockpit.abas.inicial','perf31.cockpit.conteudo.inicial',
   'perf31.badge.tarefas','perf31.badge.whatsapp','perf31.badge.sinais','perf31.badge.email']){
   f.p.registrar(metric,37);
   assert.equal(f.p.relatorioDiagnostico()[metric].p95Ultimas100Ms,37);
 }
 f.p.registrar('perf31.badge.whatsapp.'+sentinel,1234);
 assert.equal(f.p.relatorioDiagnostico()['perf31.badge.whatsapp.'+sentinel],undefined);
 assert.doesNotMatch(f.p.exportarDiagnosticoJSON(),new RegExp(sentinel));
 for(const metric of ['perf31.cockpit.abas.inicial','perf31.cockpit.conteudo.inicial'])
   assert.match(views,new RegExp(metric.replaceAll('.','\\.')));
});
test('PERF-31: screen contains separate initial/counter group and no hidden data',()=>{
 const start=views.indexOf('  function configDesempenho() {');
 const end=views.indexOf('\n  function configApp() {',start);
 assert.ok(start>=0&&end>start);
 const f=fixture();
 f.p.iniciar();f.p.registrar('perf31.badge.email',45);
 const html=vm.runInNewContext(views.slice(start,end)+'\nconfigDesempenho();',{
   global:{IADPerformance:f.p},esc:x=>String(x),Number,Math,Object
 });
 assert.match(html,/Gargalos de abertura e notificações/);
 assert.match(html,/Badge: e-mails não lidos/);
 assert.match(html,/45\.0 ms/);
 assert.doesNotMatch(html,new RegExp(sentinel));
});
