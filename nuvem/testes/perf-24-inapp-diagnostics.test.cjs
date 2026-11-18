'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const raiz = path.resolve(__dirname, '../..');
const perf = fs.readFileSync(path.join(raiz,'src/performance.js'),'utf8');
const views = fs.readFileSync(path.join(raiz,'src/views.js'),'utf8');
const app = fs.readFileSync(path.join(raiz,'src/app.js'),'utf8');
const segredo = 'HEINEKEN_CLIENTE_PRIVADO_938512';
function ambiente() {
  let instante = 0;
  const w = {performance:{now:()=>instante},console};
  vm.runInNewContext(perf,{window:w,console,Date,Number,Object,Math,JSON});
  return {p:w.IADPerformance,avancar:n=>{instante+=n}};
}
function htmlDaAba(performance) {
  const inicio=views.indexOf('  function configDesempenho() {');
  const fim=views.indexOf('\n  function configApp() {',inicio);
  assert.ok(inicio>=0 && fim>inicio,'exibir a função real da aba');
  const trecho=views.slice(inicio,fim);
  return vm.runInNewContext(trecho+'\nconfigDesempenho();',{
    global:{IADPerformance:performance},
    esc:valor=>String(valor).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
    Number,Math,Object
  });
}
function appDaAba(performance) {
  const inicio=app.indexOf('    perf24Iniciar: function () {');
  const fim=app.indexOf('    /* ---------------- a lista que sai',inicio);
  assert.ok(inicio>=0 && fim>inicio,'extrair as ações reais');
  let renders=0,downloads=[];
  const funcs=vm.runInNewContext('({' + app.slice(inicio,fim) + '\n})',{
    global:{IADPerformance:performance},
    render:()=>{renders++},
    baixar:(conteudo,nome,tipo)=>downloads.push({conteudo,nome,tipo})
  });
  return {funcs,numeroRenders:()=>renders,downloads};
}
test('PERF-24: medição sempre desligada por padrão e painel vazio útil',()=>{
 const e=ambiente();
 assert.equal(e.p.ativo(),false);
 const html=htmlDaAba(e.p);
 assert.match(html,/Diagnóstico de desempenho/);
 assert.match(html,/Medição DESLIGADA/);
 assert.match(html,/Iniciar medição/);
 assert.match(html,/de 30 recomendadas/);
 assert.match(html,/Nenhuma medição deste grupo/);
 assert.doesNotMatch(html,new RegExp(segredo));
 assert.match(views,/\['perf', 'Desempenho'\]/);
 assert.match(views,/perf: configDesempenho/);
});
test('PERF-24: iniciar, parar, limpar e atualizar são ações operacionais, não inertes',()=>{
 const e=ambiente(),a=appDaAba(e.p);
 assert.equal(e.p.ativo(),false);
 a.funcs.perf24Iniciar();
 assert.equal(e.p.ativo(),true);
 assert.match(htmlDaAba(e.p),/Medição ATIVA/);
 e.avancar(3);e.p.registrar('tela.cockpit',3);
 a.funcs.perf24Atualizar();
 assert.match(htmlDaAba(e.p),/3\.0 ms/);
 a.funcs.perf24Parar();
 assert.equal(e.p.ativo(),false);
 assert.equal(e.p.relatorioDiagnostico()['tela.cockpit'].chamadas,1);
 a.funcs.perf24Limpar();
 assert.deepEqual(Object.keys(e.p.relatorioDiagnostico()),[]);
 assert.equal(a.numeroRenders(),4);
});
test('PERF-24: permite p50/p95 do usuário após 30 aberturas reais',()=>{
 const e=ambiente();e.p.iniciar();
 for(let n=1;n<=40;n++)e.p.registrar('perf17.cockpit.clique-a-dois-frames',n);
 const m=e.p.relatorioDiagnostico()['perf17.cockpit.clique-a-dois-frames'];
 assert.equal(m.chamadas,40);
 assert.equal(m.p50Ultimas100Ms,20);
 assert.equal(m.p95Ultimas100Ms,38);
 const html=htmlDaAba(e.p);
 assert.match(html,/mínimo recomendado atingido/);
 assert.match(html,/38\.0 ms/);
 assert.match(html,/20\.0 ms/);
 assert.match(html,/Abertura: clique até dois frames/);
});
test('PERF-24: só envia ao download local métricas conhecidas; nenhuma URI ou cliente',()=>{
 const e=ambiente();e.p.iniciar();
 const proibido='perf23.rede.rest.'+segredo;
 const proibido2='tela.cockpit?email=privado@example.com';
 for(let i=0;i<300;i++){
  e.p.registrar('perf23.rede.rest',i+1);
  e.p.registrar(proibido,i);
  e.p.registrar(proibido2,i);
 }
 const r=e.p.relatorioDiagnostico();
 assert.ok(r['perf23.rede.rest']);
 assert.equal(r[proibido],undefined);
 assert.equal(r[proibido2],undefined);
 assert.equal(Object.keys(r).length,1);
 assert.equal(r['perf23.rede.rest'].amostrasPercentis,100);
 assert.equal(r['perf23.rede.rest'].p95Ultimas100Ms,295);
 const raw=e.p.exportarJSON();
 assert.match(raw,new RegExp(segredo),'relatório de engenharia antigo preservado');
 const publico=e.p.exportarDiagnosticoJSON();
 assert.doesNotMatch(publico,new RegExp(segredo));
 assert.doesNotMatch(publico,/example.com/);
 assert.doesNotMatch(htmlDaAba(e.p),new RegExp(segredo));
 const a=appDaAba(e.p);
 a.funcs.perf24Baixar();
 assert.equal(a.downloads.length,1);
 assert.equal(a.downloads[0].conteudo,publico);
 assert.match(a.downloads[0].nome,/diagnostico-performance\.json/);
 assert.match(a.downloads[0].tipo,/application\/json/);
 assert.deepEqual(Object.keys(JSON.parse(publico).metricas),['perf23.rede.rest']);
});
test('PERF-24: avisos metodológicos deixam claros os limites',()=>{
 const e=ambiente();
 const h=htmlDaAba(e.p);
 assert.match(h,/dois frames não comprovam a apresentação visual/);
 assert.match(h,/não some seus tempos/);
 const j=JSON.parse(e.p.exportarDiagnosticoJSON());
 assert.equal(j.escopo,'esta-sessao');
 assert.match(j.metodologia,/não devem ser somadas/);
 assert.equal(j.versaoEsquema,1);
 assert.match(app,/perf24Baixar: function/);
 assert.match(app,/perf24Iniciar: function/);
});

/* PERF-26: métricas preexistentes no cockpit passam a ser visíveis na tela, mantendo allowlist. */
test('PERF-26: cabeçalho e nove abas aparecem no diagnóstico e exportação segura',()=>{
 const e=ambiente();e.p.iniciar();
 const aceitas=['perf10.cockpit.abas.cabecalho','perf10.cockpit.aba.conteudo',
   'perf10.aba.decisao','perf10.aba.historico','perf10.aba.tarefas',
   'perf10.aba.whatsapp','perf10.aba.sinais','perf10.aba.email',
   'perf10.aba.propostas','perf10.aba.produtos','perf10.aba.arquivos'];
 for(const nome of aceitas)e.p.registrar(nome,12);
 e.p.registrar('perf10.aba.sinais.'+segredo,999);
 const m=e.p.relatorioDiagnostico();
 for(const nome of aceitas)assert.equal(m[nome].p95Ultimas100Ms,12);
 assert.equal(m['perf10.aba.sinais.'+segredo],undefined);
 const html=htmlDaAba(e.p);
 assert.match(html,/Troca de abas do cockpit/);
 assert.match(html,/Conteúdo: sinais/);
 assert.match(html,/Troca de aba: cabeçalho/);
 const json=e.p.exportarDiagnosticoJSON();
 assert.doesNotMatch(json,new RegExp(segredo));
 assert.equal(Object.keys(JSON.parse(json).metricas).length,11);
 assert.doesNotMatch(html,new RegExp(segredo));
});
