/* PERF-01 — testes de atualização localizada e instrumentação, sem Supabase.
   node --test nuvem/testes/perf-hoje-01.test.cjs */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname,'../..');
const ui = fs.readFileSync(path.join(root,'src/perf-hoje.js'),'utf8');
const perf = fs.readFileSync(path.join(root,'src/performance.js'),'utf8');
const app = fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const views = fs.readFileSync(path.join(root,'src/views.js'),'utf8');
const ia = fs.readFileSync(path.join(root,'src/ia.js'),'utf8');
const index = fs.readFileSync(path.join(root,'index.html'),'utf8');
const worker = fs.readFileSync(path.join(root,'sw.js'),'utf8');

function simular() {
  const cards = Array.from({length:10},(_,i)=>({
    id:'op-'+i, html:'original',
    getAttribute(k) { return k==='data-op-id'?this.id:null; },
    set innerHTML(v){this.html=v;},get innerHTML(){return this.html;}
  }));
  let filaChamadas=0;
  let orientacaoChamadas=0;
  let sessao={id:'teste'};
  const jobs=Array.from({length:243},(_,i)=>({resumo:{op:{id:'op-'+i,orientacao:{leitura:'análise-'+i}}}}));
  const status={
    contador:{textContent:'0 de 60'},
    barra:{style:{width:'0%'}},
    fase:{textContent:'Analisando…'},
    querySelector(sel) {
      return ({'[data-iad-contador]':this.contador,
        '[data-iad-barra]':this.barra,
        '[data-iad-fase]':this.fase})[sel]||null;
    }
  };
  let rota='#/hoje';
  const doc={
    querySelectorAll(sel) { return sel==='.iad-orientacao-foco[data-op-id]'?cards:[]; },
    querySelector(sel) {return sel==='.analise-dia[data-iad-progresso]'?status:null;}
  };
  const store={
    oportunidade(id) {return jobs.find(x=>x.resumo.op.id===id)?.resumo.op||null;}
  };
  const win={
    location:{get hash(){return rota;}},
    IADAuth:{atual:()=>sessao},
    IADStore:store,
    IADViews:{orientacaoFoco:(item)=>{
      orientacaoChamadas++;
      return '<section>'+item.resumo.op.orientacao.leitura+'</section>';
    }},
    IADPerformance:null
  };
  vm.runInNewContext(ui,{window:win,document:doc});
  return {cards,jobs,status,mod:win.IADPerfHoje,
    custos:()=>({fila:filaChamadas,orientacao:orientacaoChamadas}),
    trocarRota(s){rota=s;}, trocarUsuario(u){sessao=u;},
    trocarReferencia(i){jobs[i]={resumo:{op:{id:'op-'+i}}};},
    fila(){filaChamadas++;}};
}

test('60 respostas atualizam somente cartões visíveis e não recalculam a fila',()=>{
  const a=simular();
  for(let i=0;i<60;i++){
    a.jobs[i].resumo.op.orientacao.leitura='resultado-'+i;
    a.mod.atualizarOrientacao(a.jobs[i]);
  }
  assert.equal(a.custos().fila,0);
  assert.equal(a.custos().orientacao,10);
  assert.match(a.cards[0].html,/resultado-0/);
  assert.match(a.cards[9].html,/resultado-9/);
  assert.equal(a.cards.length,10);
  /* Na versão antiga eram até 60 repinturas completas x 243 negócios. */
});

test('alteração de sessão, rota ou referência antiga não pinta dados fora de contexto',()=>{
 const a=simular();
 a.trocarRota('#/pipeline');
 assert.equal(a.mod.atualizarOrientacao(a.jobs[0]),false);
 a.trocarRota('#/hoje');
 a.trocarUsuario(null);
 assert.equal(a.mod.atualizarOrientacao(a.jobs[0]),false);
 a.trocarUsuario({id:'teste'});
 const velho=a.jobs[0];
 a.trocarReferencia(0);
 assert.equal(a.mod.atualizarOrientacao(velho),false);
 assert.equal(a.cards[0].html,'original');
});

test('progresso de IA é atualizado sem reconstruir o HTML da página',()=>{
 const a=simular();
 assert.equal(a.mod.atualizarProgresso(15,60,'Analisando'),true);
 assert.equal(a.status.contador.textContent,'15 de 60');
 assert.equal(a.status.barra.style.width,'25%');
 assert.match(a.status.fase.textContent,/Analisando/);
 assert.equal(a.mod.atualizarProgresso(100,60,'Concluído'),true);
 assert.equal(a.status.barra.style.width,'100%');
 a.trocarRota('#/tarefas');
 assert.equal(a.mod.atualizarProgresso(5,60,'Ignorado'),false);
});

test('instrumentação é desativada por padrão e coleta apenas medidas após iniciar',()=>{
 let t=0;
 const w={performance:{now(){t+=2;return t;}}};
 const ctx={window:w,console:{table(){}},Date};
 vm.runInNewContext(perf,ctx);
 const p=w.IADPerformance;
 assert.equal(p.ativo(),false);
 assert.equal(p.medir('fila',()=>123),123);
 assert.equal(Object.keys(p.relatorio()).length,0);
 p.iniciar();
 assert.equal(p.medir('fila',()=>456),456);
 const r=p.relatorio();
 assert.equal(r.fila.chamadas,1);
 assert.equal(r.fila.totalMs,2);
 p.parar();
 assert.equal(p.medir('fila',()=>123),123);
 assert.equal(p.relatorio().fila.chamadas,1);
});

test('integração: dados comerciais/IA intactos, sem recálculo no callback automático',()=>{
 assert.match(app,/IA\.varrerOrientacoes\(foco\.itens, function \(feitos, total, item\)/);
 const callback = app.slice(app.indexOf('IA.varrerOrientacoes(foco.itens'),app.indexOf('/* Repintar só o conteúdo'));
 assert.match(callback,/IADPerfHoje\.atualizarOrientacao\(item\)/);
 assert.doesNotMatch(callback,/repintarConteudo\('#\/hoje'/);
 assert.match(ia,/aoAndar\(n \+ 1, pendentes\.length, item\)/);
 assert.match(views,/data-op-id/);
 assert.match(views,/orientacaoFoco: blocosDaOrientacao/);
 assert.match(views,/hoje\.fila/);
 assert.match(views,/hoje\.cartoes/);
 assert.match(app,/atualizarProgresso\(feitos, total/);
 assert.match(index,/<script src="src\/performance\.js"><\/script>/);
 assert.match(index,/<script src="src\/perf-hoje\.js"><\/script>/);
 assert.match(worker,/iad-crm-v268/);
 assert.match(worker,/src\/perf-hoje\.js/);
});
