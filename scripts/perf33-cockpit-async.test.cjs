'use strict';
/* PERF-33: isolated, deterministic browser-DOM contracts. No customer data or network. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const views=fs.readFileSync('src/views.js','utf8');
const app=fs.readFileSync('src/app.js','utf8');
function cut(source,first,last){
 const a=source.indexOf(first),b=source.indexOf(last,a+first.length);
 assert.ok(a>=0&&b>a,'expected segment: '+first+' -> '+last);
 return source.slice(a,b);
}
function harness(options={}){
 let revision=3,uid='u1',tenant='t1',papel='vendedor',filters={tenant:'t1',usuario:'todos'};
 let rendered=0,updates=0,headingUpdates=0,bodyUpdates=0,viewCalls=0;
 const tab={_html:'<nav>old</nav>',set outerHTML(v){this._html=v;headingUpdates++;},get outerHTML(){return this._html;}};
 const body={_html:'<textarea>draft text</textarea>',set innerHTML(v){this._html=v;bodyUpdates++;},get innerHTML(){return this._html;}};
 const current={hash:'#/op/op1'};
 const ctx={
  A:{atual:()=>uid?{id:uid,tenantId:tenant,papel}:null,filtros:()=>filters},
  Store:{revisao:()=>revision},
  location:current,
  document:{querySelector:(s)=> options.missingDom?null:s==='.abas-cockpit'?tab:s==='.corpo-aba'?body:null},
  global:{IADNuvem:{mandaNoAcesso:()=>options.cloud!==false,sessao:()=>options.session===false?null:{id:'session'}},
    IADPerformance: {medir:(_key,fn)=>{updates++;return fn();}}},
  V:{abaAtualDoCockpit:()=>options.active||'decisao',
    cabecalhoDoCockpit:()=>{viewCalls++;return options.hidden?null:'<nav>fresh</nav>';},
    painelDaAbaCockpit:()=>{viewCalls++;return options.hidden?null:{abas:'<nav>active</nav>',corpo:'<div>new messages</div>'};}},
  render:()=>{rendered++;},JSON,Object,String,Math
 };
 const source=cut(app,'  function assinaturaDaAtualizacaoDoCanal() {','  /* Os e-mails, do mesmo jeito:');
 vm.runInNewContext(source+'\nglobalThis.run={snapshot:assinaturaDaAtualizacaoDoCanal,refresh:atualizarCanalSemReabrirCockpit};',ctx);
 return {ctx,tab,body,current,snapshot:ctx.run.snapshot,refresh:ctx.run.refresh,
  setRevision:v=>revision=v,setId:v=>uid=v,setTenant:v=>tenant=v,setRole:v=>papel=v,setFilters:v=>filters=v,
  stats:()=>({rendered,updates,headingUpdates,bodyUpdates,viewCalls})};
}
test('PERF-33 background email: only badges updated, draft and accordion DOM preserved',()=>{
 const h=harness(),s=h.snapshot();
 h.refresh('email',s);
 assert.equal(h.stats().rendered,0);
 assert.equal(h.stats().viewCalls,1,'no Decision Engine or tab body on background load');
 assert.equal(h.stats().bodyUpdates,0);
 assert.equal(h.body.innerHTML,'<textarea>draft text</textarea>');
 assert.equal(h.tab.outerHTML,'<nav>fresh</nav>');
 assert.equal(h.stats().updates,1);
});
test('PERF-33 visible WhatsApp/email tab refreshes body without replacing cockpit',()=>{
 for(const channel of ['whatsapp','email']){
  const h=harness({active:channel});h.refresh(channel,h.snapshot());
  assert.equal(h.stats().rendered,0);
  assert.equal(h.stats().viewCalls,1);
  assert.equal(h.stats().bodyUpdates,1);
  assert.equal(h.body.innerHTML,'<div>new messages</div>');
  assert.equal(h.tab.outerHTML,'<nav>active</nav>');
 }
});
test('PERF-33 structural changes fall back to complete render, no stale partial patch',()=>{
 for(const change of [
  h=>h.setRevision(4),h=>h.setTenant('t2'),h=>h.setRole('admin'),
  h=>h.setFilters({tenant:'t2',usuario:'todos'}),h=>h.setId(null),
  h=>{h.current.hash='#/pipeline';}
 ]){
  const h=harness();const old=h.snapshot();change(h);
  h.refresh('whatsapp',old);
  assert.equal(h.stats().rendered,1);
  assert.equal(h.stats().headingUpdates,0);
  assert.equal(h.stats().bodyUpdates,0);
 }
 for(const options of [{missingDom:true},{hidden:true},{session:false}]){
  const h=harness(options);h.refresh('email',h.snapshot());
  assert.equal(h.stats().rendered,1);
  assert.equal(h.stats().headingUpdates,0);
 }
});
test('PERF-33 view header checks visibility before calculating notifications',()=>{
 const code=cut(views,'  function cabecalhoDoCockpit(id) {','  /* Aba isolada:');
 let count=0,canSee=true;
 const ctx={Store:{oportunidade:id=>id==='op1'?{id}:null,visivel:()=>canSee},
  abasDoCockpit:()=>{count++;return '<tabs/>';},String};
 vm.runInNewContext(code+'\nglobalThis.header=cabecalhoDoCockpit',ctx);
 assert.equal(ctx.header('op1'),'<tabs/>');
 assert.equal(count,1);
 canSee=false;
 assert.equal(ctx.header('op1'),null);
 assert.equal(ctx.header('missing'),null);
 assert.equal(count,1,'no notification calculation for unauthorized cards');
});
test('PERF-33 background Promise paths call selective updater after loading',async()=>{
 const conversation=cut(app,'  function pintarConversas(forcar) {','  /* A colheita anda junto');
 const email=cut(app,'  function pintarEmails(forcar) {','  App.recarregarEmails = function');
 const calls=[];
 const ctx={
  W:{disponivel:()=>true,carregar:async(forcar)=>{calls.push('whatsapp.load:'+forcar);}},
  Mail:{disponivel:()=>true,carregar:async(forcar)=>{calls.push('email.load:'+forcar);},carregarCaixas:async(forcar)=>{calls.push('email.boxes:'+forcar);}},
  assinaturaDaAtualizacaoDoCanal:()=> 'safe-snapshot',
  atualizarCanalSemReabrirCockpit:(channel,sig)=>{calls.push('update:'+channel+':'+sig);},
  colher:()=>{calls.push('collect');},render:()=>{throw Error('full render not allowed');},console,Promise
 };
 vm.runInNewContext(conversation+email+'\nglobalThis.run={whatsapp:pintarConversas,email:pintarEmails};',ctx);
 await ctx.run.whatsapp(false);await ctx.run.email(true);
 assert.equal(calls.join('|'),'whatsapp.load:false|collect|update:whatsapp:safe-snapshot|email.load:true|email.boxes:true|update:email:safe-snapshot');
});
test('PERF-33 coordinated release is checked without pinning a legacy version',()=>{
 const cfg=fs.readFileSync('src/config.js','utf8');
 const sw=fs.readFileSync('sw.js','utf8');
 const c=cfg.match(/numero: '(v\d+\.\d+)'/);
 assert.ok(c);assert.match(c[1],/^v286\.\d+$/);
 assert.ok(sw.includes("const CACHE = 'iad-crm-"+c[1]+"'"));
 const helper=fs.readFileSync('scripts/verificar-versao-shell.cjs','utf8');
 assert.ok(helper.includes("assert.equal(b[1],'iad-crm-'+a[1]"));
});
