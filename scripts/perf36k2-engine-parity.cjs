'use strict';
/* PERF-36K2 — comparação com Engine v286.75, sem rede ou dados de clientes.
 * Todas as dependências de Playbook são as regras REAIS do repositório.
 * Nenhum cache é compartilhado entre oportunidades, tenants ou execuções. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const stable = cp.execFileSync('git',
  ['show','44dc0e27bdfb909a883451767d013cd8476b4552:src/engine.js'],
  {cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const candidate = fs.readFileSync(path.join(root,'src/engine.js'),'utf8');
const playbook = fs.readFileSync(path.join(root,'src/playbook.js'),'utf8');
const today = new Date().toISOString().slice(0,10);
const day = d => {
  const x = new Date(today+'T12:00:00Z');
  x.setUTCDate(x.getUTCDate()+d);
  return x.toISOString().slice(0,10);
};
const store = {
  hoje: () => today,
  conta: id => ({id,nome:'Conta sintética'}),
  contato: id => ({id,nome:id,papel:'Champion / Mobilizer',perfil:'mobilizador',sentimento:'favoravel'}),
  dados: () => ({tarefas:[],sinais:[],oportunidades:[],contas:[],contatos:[]}),
  sinaisDaOportunidade: op => op.sinais || [],
  contarSinaisDaOportunidade: op => (op.sinais||[]).length,
  recusas: () => []
};
function load(source) {
  const sandbox = {window:{IADStore:store},Date,Math,JSON,console};
  vm.runInNewContext(playbook,sandbox,{filename:'src/playbook.js'});
  vm.runInNewContext(source,sandbox,{filename:'src/engine.js'});
  return {E:sandbox.window.IADEngine,P:sandbox.window.IADPlaybook};
}
const old = load(stable);
const next = load(candidate);
const normalize = x => JSON.parse(JSON.stringify(x));
function fixture(n,seed=0,tenantId='tenant-a') {
  const P=old.P,dim=P.DIMENSOES;
  const events=Array.from({length:n},(_,i)=>({
    id:'ev'+seed+'-'+i,
    tipo:i%7===0?'activity':'decision',
    dimensao:i%31===0?'__proto__':dim[(i+seed)%dim.length].id,
    contatoId:'ct'+(i%4),forca:i%5===0?'documentado':i%4===0?'confirmado':'relato',
    data:day(-(i%45)),canal:i%2===0?'e-mail':'reuniao',
    titulo:'Evidencia sintética',frase:i%3===0?'Decisão do cliente':''
  }));
  return {
    id:'op'+seed,tenantId,donoId:'u'+seed,contaId:'ca'+(seed%9),
    titulo:'Negociação de teste',etapa:seed%2?'Diagnóstico':'Proposta',
    valor:10000,criadoEm:day(-90),etapaDesde:day(-17),
    fechamentoPrevisto:day(35),dims:Object.fromEntries(dim.map((d,i)=>[d.id,(i+seed)%5])),
    stakeholders:['ct0','ct1'],eventos:events,sinais:[],
    snapshots:[{data:day(-3),dimensaoAlterada:'problema',de:1,para:2}],
    desfecho:null,insight:{estado:seed%2?'formulado':'aceito'},
    proximoCompromisso: seed%3===0 ? {data:day(2),texto:'Enviar proposta',dono:'cliente'} : null
  };
}
function deepEqual(a,b,label){
  assert.deepEqual(normalize(a),normalize(b),label);
}
test('PERF-36K2: todos os resultados e APIs públicas permanecem iguais',()=>{
  const sizes=[0,1,8,16,32,150,500,1500];
  let checks=0;
  for (const n of sizes) for (let seed=0;seed<5;seed++){
    const op=fixture(n,seed,seed%2?'tenant-b':'tenant-a');
    const base=old.E.resumo(op),cur=next.E.resumo(op);
    deepEqual(cur,base,'resumo idêntico '+n+'/'+seed);
    for (const method of ['evidenceAge','decisionVelocity','autoria','deltaSemana','lacunas','alertas']){
      deepEqual(next.E[method](op),old.E[method](op),
        method+' público n='+n+'/seed='+seed);
      checks++;
    }
    for (const d of old.P.DIMENSOES) {
      deepEqual(next.E.evidenciasDaDimensao(op,d.id),
        old.E.evidenciasDaDimensao(op,d.id),'provas '+d.id);
      deepEqual(next.E.podeComprovar(op,d.id,4),
        old.E.podeComprovar(op,d.id,4),'força '+d.id);
      checks+=2;
    }
    // Descartar um evento e recalcular: não pode reaproveitar snapshot velho.
    if(n>0) {
      op.eventos.pop();
      deepEqual(next.E.resumo(op),old.E.resumo(op),
        'revisão após mutação '+n);
      checks++;
    }
  }
  console.log('PERF36K2_PARITY_PASS '+JSON.stringify({checks,variants:sizes.length*5,
    tenantIsolation:'no module-level cache',model:'real playbook + synthetic cases'}));
});
test('PERF-36K2: ganho determinístico em CPU para histórico denso',()=>{
  const op=fixture(600,4);
  for(let i=0;i<80;i++){old.E.resumo(op);next.E.resumo(op);}
  const before=[],after=[];
  const cycles=150;
  for(let i=0;i<cycles;i++){
    let start=process.hrtime.bigint();
    if(i%2===0){
      old.E.resumo(op);before.push(Number(process.hrtime.bigint()-start)/1e6);
      start=process.hrtime.bigint();
      next.E.resumo(op);after.push(Number(process.hrtime.bigint()-start)/1e6);
    }else{
      next.E.resumo(op);after.push(Number(process.hrtime.bigint()-start)/1e6);
      start=process.hrtime.bigint();
      old.E.resumo(op);before.push(Number(process.hrtime.bigint()-start)/1e6);
    }
  }
  const pct=(values,p)=>{
    const a=values.slice().sort((a,b)=>a-b);
    return a[Math.max(0,Math.ceil(a.length*p)-1)];
  };
  const p50a=pct(before,.5),p50b=pct(after,.5);
  const p95a=pct(before,.95),p95b=pct(after,.95);
  console.log('PERF36K2_ENGINE_DIFF '+JSON.stringify({
    scope:'Node vm, single shared fixture, no browser or network',
    events:op.eventos.length,samples:cycles,
    oldP50Ms:+p50a.toFixed(3),newP50Ms:+p50b.toFixed(3),
    oldP95Ms:+p95a.toFixed(3),newP95Ms:+p95b.toFixed(3),
    p50GainPct:+((1-p50b/p50a)*100).toFixed(1)}));
  assert.ok(p50b < p50a*0.95,
    'sem ganho mínimo de 5% em mediana do histórico denso: '+p50a+' vs '+p50b);
});
