'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');
const root=path.join(__dirname,'../..');
const baseline='978af8859c2fa558eb49472dda5e13708dd348db';
function codigo(pathFile,antigo){
  return antigo?cp.execFileSync('git',['show',baseline+':'+pathFile],{
    cwd:root,encoding:'utf8',maxBuffer:2*1024*1024
  }):fs.readFileSync(path.join(root,pathFile),'utf8');
}
function montar(antigo) {
  let u={id:'u1',papel:'gestor',tenantId:'a'},f={tenant:'todas',usuario:'todos'};
  const localStorage={removeItem(){},getItem(){return null},setItem(){}};
  const w={console,IADAuth:{atual:()=>u,filtros:()=>f}};
  const ctx={window:w,localStorage,Date,Math,JSON,Map,Set,console};
  for(const file of ['playbook.js','store.js','engine.js']){
    vm.runInNewContext(codigo('src/'+file,antigo),ctx,{filename:file});
  }
  if(!antigo)vm.runInNewContext(codigo('src/pipeline-performance.js',false),ctx);
  const S=w.IADStore,P=w.IADPlaybook,E=w.IADEngine;
  const e=S.obter();e.tenants=[{id:'a'},{id:'b'}];
  e.contas=Array.from({length:50},(_,i)=>({id:'c'+i,tenantId:'a',donoId:'u1',nome:'Conta '+i}));
  e.contatos=Array.from({length:100},(_,i)=>({id:'p'+i,tenantId:'a',donoId:'u1',contaId:'c'+(i%50),
    papel:i%2?'decisor_economico':'champion',perfil:'mobilizador',sentimento:'favoravel'}));
  e.oportunidades=Array.from({length:243},(_,i)=>({
    id:'op'+i,tenantId:'a',donoId:'u1',contaId:'c'+(i%50),titulo:'Oportunidade '+i,
    valor:10000+i,criadoEm:'2026-10-01',etapaDesde:'2026-10-01',
    etapa:i%3?'Diagnóstico':'Proposta',fechamentoPrevisto:'2026-12-01',
    eventos:[],dims:Object.fromEntries(P.DIMENSOES.map(d=>[d.id,0])),
    stakeholders:['p'+(i%100),'p'+((i+1)%100)],desfecho:null
  }));
  e.tarefas=Array.from({length:777},(_,i)=>({
    id:'t'+i,tenantId:'a',donoId:'u1',oportunidadeId:'op'+(i%243),
    vencimento:i%3===0?'2026-10-01':'2027-01-01',status:i%7?'aberta':'concluida',
    titulo:'Tarefa '+i
  }));
  e.sinais=Array.from({length:512},(_,i)=>({
    id:'s'+i,tenantId:'a',donoId:'u1',peso:1,quando:'2026-10-01',hora:'12:00',
    oportunidadeId:i%3===0?'op'+(i%243):null,
    contatoId:i%3===1?'p'+(i%100):null,
    contaId:i%3===2?'c'+(i%50):null
  }));
  e.notas=[];e.segmentos=[];e.produtos=[];e.tiposTarefa=[];e.fontes=[];
  S.salvar();return {S,E,w,e,user:v=>u=v,filter:v=>f=v};
}
test('243 oportunidades: resumos, tarefas e sinais equivalentes à v269',()=>{
  const antigo=montar(true),novo=montar(false);
  const opsA=antigo.S.dados().oportunidades,opsB=novo.S.dados().oportunidades;
  assert.equal(opsB.length,243);
  const estadoB=novo.S.dados();
  const perf=novo.w.IADPipelinePerf;
  const resumos=perf.resumos(estadoB);
  for(let i=0;i<243;i++){
    assert.equal(JSON.stringify(resumos[i]),JSON.stringify(antigo.E.resumo(opsA[i])),
      'Resumo divergente: '+i);
    assert.equal(JSON.stringify(novo.S.sinaisDaOportunidade(opsB[i])),
      JSON.stringify(antigo.S.sinaisDaOportunidade(opsA[i])), 'Sinais: '+i);
    assert.equal(JSON.stringify(novo.S.tarefasDaOportunidade(opsB[i].id)),
      JSON.stringify(antigo.S.tarefasDaOportunidade(opsA[i].id)), 'Tarefas: '+i);
  }
  assert.equal(perf.estatisticas().misses,1);
  perf.resumos(novo.S.dados());perf.resumos(novo.S.dados());
  assert.equal(perf.estatisticas().hits,2);
});
test('a mudança de tarefa, contato, registro e escopo invalida cache corretamente',()=>{
  const {S,w,user,filter}=montar(false);
  const p=w.IADPipelinePerf;
  p.resumos(S.dados());
  S.atualizarTarefa('t3',{status:'concluida'});
  p.resumos(S.dados());assert.equal(p.estatisticas().misses,2);
  S.atualizarOportunidade('op0',{valor:999999});
  const lista=p.resumos(S.dados());
  assert.equal(lista[0].op.valor,999999);
  filter({tenant:'a',usuario:'todos'});p.resumos(S.dados());
  assert.equal(p.estatisticas().misses,4);
  user({id:'u2',papel:'usuario',tenantId:'b'});
  assert.equal(S.dados().oportunidades.length,0);
  assert.equal(p.resumos(S.dados()).length,0);
});
test('o Pipeline monta no máximo 48 cartões por lote sem modificar totais',()=>{
 const v=codigo('src/views.js',false),app=codigo('src/app.js',false);
 assert.match(v,/const TAMANHO_LOTE_PIPELINE = 48/);
 assert.match(v,/const visiveis = resumos.slice\(0, limitePipeline\)/);
 assert.match(v,/kanban\(visiveis, resumos\)/);
 assert.match(v,/barraDoPipeline\(resumos, total(?:, est)?\)/);
 assert.match(v,/faixaMaisPipeline\(resumos.length\)/);
 assert.match(v,/const completos = todos.filter/);
 assert.match(app,/pipelineMais: function/);
});
