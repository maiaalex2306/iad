'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const views=fs.readFileSync('src/views.js','utf8');
const app=fs.readFileSync('src/app.js','utf8');
test('detalhes fechados não constroem conteúdo pesado e expandem sob demanda',()=>{
 const ini=views.indexOf('  function detalheDiferido(');
 const fim=views.indexOf('  /* As linhas com rótulo',ini);
 assert.ok(ini>0&&fim>ini);
 const op={id:'opp_7',tenantId:'empresa-a'};
 let chamadas=[];
 const ctx={esc:String,Store:{oportunidade:id=>id==='opp_7'?op:null,visivel:()=>true},
  blocoDimensoes:()=>{chamadas.push('dimensoes');return '<button id="pontuar">Pontuar</button>';},
  blocoGrupo:()=>{chamadas.push('grupo');return '<div id="pessoas">15 contatos</div>';},
  curvaIAD:()=>{chamadas.push('curva');return '<svg>curva</svg>';},
  resumoNoCockpit:()=>({coverage:{mapeados:15}})};
 vm.runInNewContext(views.slice(ini,fim)+';globalThis.t={detalheDiferido,conteudoDetalheCockpit}',ctx);
 const h=ctx.t.detalheDiferido('As 8 decisões','pontue aqui',op,'dimensoes');
 assert.match(h,/data-cockpit-pendente="1"/);
 assert.match(h,/ontoggle="if\(this.open\)App\.carregarDetalheCockpit\(this\)"/);
 assert.doesNotMatch(h,/pontuar|<button id=/);
 assert.equal(chamadas.length,0);
 assert.match(ctx.t.conteudoDetalheCockpit('opp_7','dimensoes'),/Pontuar/);
 assert.equal(chamadas.join(','),'dimensoes');
 assert.match(ctx.t.conteudoDetalheCockpit('opp_7','grupo'),/15 contatos/);
 assert.match(ctx.t.conteudoDetalheCockpit('opp_7','curva'),/curva/);
 assert.equal(ctx.t.conteudoDetalheCockpit('outra','dimensoes'),null);
 assert.equal(ctx.t.conteudoDetalheCockpit('opp_7','invalido'),null);
});
test('as três seções da Decisão são lazy e Proposal Gate preservado',()=>{
 const a=views.slice(views.indexOf('  function abaDecisao('),views.indexOf('  function abaHistorico('));
 for(const k of ['dimensoes','grupo','curva'])assert.match(a,new RegExp("detalheDiferido\\([\\s\\S]*?'"+k+"'"));
 assert.doesNotMatch(a,/detalhe\('As 8 decisões'/);
 assert.match(a,/detalhe\('Proposal Gate'/);
});
test('apertura segura não injeta conteúdo duas vezes ou em rota errada',()=>{
 const ini=app.indexOf('    carregarDetalheCockpit: function (elemento) {');
 const fim=app.indexOf('    abaCockpit: function (aba) {',ini);
 assert.ok(ini>0&&fim>ini);
 const text=app.slice(ini,fim).trim().replace(/,\s*$/,'');
 let calls=0,dom='',attrs={'data-cockpit-op':'opp_7','data-cockpit-secao':'dimensoes'};
 const target={set innerHTML(v){dom=v;},removeAttribute(){this.done=true;}};
 const elm={isConnected:true,open:true,getAttribute:k=>attrs[k],querySelector:()=>target.done?null:target};
 const ctx={location:{hash:'#/op/opp_7'},global:{IADPerformance:null},
  V:{conteudoDetalheCockpit:()=>{calls++;return '<b>Decisões</b>';}}};
 vm.runInNewContext('globalThis.h=({'+text+'}).carregarDetalheCockpit',ctx);
 ctx.h(elm);assert.equal(calls,1);assert.match(dom,/Decisões/);
 ctx.h(elm);assert.equal(calls,1);
 target.done=false;ctx.location.hash='#/op/other';ctx.h(elm);assert.equal(calls,1);
});
