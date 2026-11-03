'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const perfCode = fs.readFileSync(path.join(root, 'src/performance.js'), 'utf8');
const appCode = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const storeCode = fs.readFileSync(path.join(root, 'src/store.js'), 'utf8');

function perfEnv() {
  let ms = 10;
  const w = { performance: { now: () => ms }, requestAnimationFrame: fn => fn() };
  vm.runInNewContext(perfCode, { window: w, Date, Number, Object, Math, JSON, console });
  return { P: w.IADPerformance, avanca: n => { ms += n; } };
}
test('opt-in: sem iniciar nao registra tempos nem exporta dados de oportunidades', () => {
  const {P, avanca} = perfEnv();
  const token = P.iniciarAbertura('NOME-QUE-NAO-PODE-APARECER');
  assert.equal(token, 0);
  avanca(100);
  assert.deepEqual(Object.keys(P.relatorio(true)), []);
  assert.doesNotMatch(P.exportarJSON(), /NOME-QUE-NAO-PODE-APARECER/);
});

test('clique ate dois frames: duracoes exatas, p50 e p95, nomes tecnicos', () => {
  const {P, avanca} = perfEnv();
  P.iniciar();
  for (let i = 0; i < 36; i++) {
    const token = P.iniciarAbertura('HEINEKEN-SIGILOSO');
    for (const [etapa, delta] of [['rota',2], ['html',3], ['dom',5], ['widgets',7],
                                   ['frame1',11], ['frame2',13]]) {
      avanca(delta);
      assert.equal(P.etapaAbertura(token, etapa), true);
    }
    assert.equal(P.aberturaPendente(), 0);
  }
  const rel = P.relatorio(true);
  assert.equal(rel['perf17.cockpit.clique-a-dois-frames'].chamadas, 36);
  assert.equal(rel['perf17.cockpit.clique-a-dois-frames'].p50Ultimas100Ms, 41);
  assert.equal(rel['perf17.cockpit.clique-a-dois-frames'].p95Ultimas100Ms, 41);
  assert.equal(rel['perf17.cockpit.etapa-dom'].p95Ultimas100Ms, 5);
  assert.doesNotMatch(P.exportarJSON(), /HEINEKEN-SIGILOSO/);
  assert.doesNotMatch(P.exportarJSON(), /[A-F0-9]{20,}/i);
});

test('duas aberturas concorrentes: primeiro token nao grava nem conclui segundo', () => {
  const {P, avanca} = perfEnv();
  P.iniciar();
  const primeiro = P.iniciarAbertura();
  P.etapaAbertura(primeiro, 'rota');
  const segundo = P.iniciarAbertura();
  avanca(99);
  assert.equal(P.etapaAbertura(primeiro,'html'),false);
  for (const etapa of ['rota','html','dom','widgets','frame1','frame2']) {
    avanca(1); assert.equal(P.etapaAbertura(segundo,etapa),true);
  }
  assert.equal(P.relatorio(true)['perf17.cockpit.clique-a-dois-frames'].chamadas,1);
});

test('etapas inválidas ou fora de ordem nao publicam P95 incompleto', () => {
  const {P} = perfEnv();
  P.iniciar();
  const t = P.iniciarAbertura();
  assert.equal(P.etapaAbertura(t,'nome-do-cliente'),false);
  assert.equal(P.etapaAbertura(t,'html'),false);
  assert.equal(P.aberturaPendente(),0);
  assert.equal(P.relatorio(true)['perf17.cockpit.clique-a-dois-frames'],undefined);
  const t2=P.iniciarAbertura();
  P.cancelarAbertura(t2);
  assert.equal(P.etapaAbertura(t2,'rota'),false);
  P.parar();
  assert.equal(P.iniciarAbertura(),0);
});

test('contrato: App mede abertura sem armazenar IDs e Store preserva revisão', () => {
  assert.match(appCode,/iniciarAbertura\(\)/);
  assert.match(appCode,/etapaAbertura\(tokenAbertura, 'html'\)/);
  assert.match(appCode,/etapaAbertura\(tokenAbertura, 'frame2'\)/);
  assert.match(appCode,/location\.hash !== '#\/op\/' \+ id/);
  assert.match(storeCode,/ultimaAdocao === chaveAdocao/);
  assert.match(storeCode,/if \(adotados \|\| padronizou\) salvar\(\)/);
});

function storeEnv() {
  let user = { id:'vendedor-a', tenantId:'tenant-a', papel:'vendedor' };
  const w = {
    console,
    localStorage:{ getItem(){return null},setItem(){},removeItem(){} },
    IADAuth:{ atual:()=>user, filtros:()=>({tenant:'todas',usuario:'todos'}) },
    IADPlaybook:{ TIPOS_TAREFA:[], TIPOS_TAREFA_RENOMEADOS:{} }
  };
  vm.runInNewContext(storeCode,{window:w,console,Date,Map,Set,JSON,Math},
    {filename:'store.js'});
  return {S:w.IADStore,usuario: u => {user=u;}};
}

test('adocao: repintura sem salvar nao varre dez colecoes novamente', () => {
  const e = storeEnv(), s=e.S, estado=s.obter();
  let visitas=0;
  estado.contas=new Proxy([{id:'conta-a',tenantId:'tenant-a'}],{
    get(alvo,chave,receiver) {
      if(chave==='forEach')visitas++;
      return Reflect.get(alvo,chave,receiver);
    }
  });
  s.salvar();
  assert.equal(s.adotarOrfaos(),0);
  const primeira=visitas;
  assert.ok(primeira>0);
  for(let i=0;i<100;i++) assert.equal(s.adotarOrfaos(),0);
  assert.equal(visitas,primeira,'mesma revisao nao pode varrer colecoes');

  estado.contas.push({id:'legada-sem-empresa'});
  s.salvar();
  assert.equal(s.adotarOrfaos(),1);
  assert.equal(estado.contas[1].tenantId,'tenant-a');
  assert.ok(visitas>primeira);
  const depois=visitas;
  assert.equal(s.adotarOrfaos(),0);
  assert.equal(visitas,depois);
});

test('adocao: trocar identidade, empresa e administrador invalida escopo', () => {
  const e=storeEnv(), s=e.S, est=s.obter();
  est.contas.push({id:'legada'});
  s.salvar();
  assert.equal(s.adotarOrfaos(),1);
  e.usuario({id:'admin',papel:'admin',tenantId:'tenant-a'});
  assert.equal(s.adotarOrfaos(),0);
  est.contas.push({id:'legada-2'});
  s.salvar();
  assert.equal(s.adotarOrfaos(),0,'admin nao adota empresa arbitraria');
  assert.equal(est.contas[1].tenantId,undefined);
  e.usuario({id:'vendedor-b',papel:'vendedor',tenantId:'tenant-b'});
  assert.equal(s.adotarOrfaos(),1);
  assert.equal(est.contas[1].tenantId,'tenant-b');
  assert.equal(est.contas[0].tenantId,'tenant-a');
});
