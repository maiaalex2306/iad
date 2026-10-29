/* PERF-02: regressão com Engine, Store e Playbook REAIS, 243 oportunidades. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'../..');
function ambiente() {
  const w={console,localStorage:{removeItem(){},getItem(){return null},setItem(){}}};
  let identidade={id:'u1',papel:'gestor',tenantId:'a'};
  let filtros={tenant:'todas',usuario:'todos'};
  w.IADAuth={atual:()=>identidade,filtros:()=>filtros};
  const ctx={window:w,console,Date,Math,JSON,Map,Set};
  for(const file of ['playbook.js','store.js','engine.js','perf-02.js']){
    vm.runInNewContext(fs.readFileSync(path.join(root,'src',file),'utf8'),ctx,{filename:file});
  }
  const S=w.IADStore,P=w.IADPlaybook,E=w.IADEngine;
  const e=S.obter();
  e.tenants=[{id:'a',nome:'Empresa A'},{id:'b',nome:'Empresa B'}];
  e.contas=Array.from({length:51},(_,i)=>({id:'c'+(i%50),nome:'Conta '+i,
    tenantId:i===50?'b':'a',donoId:'u1',segmento:'Indústria'}));
  e.oportunidades=Array.from({length:243},(_,i)=>({
    id:'op'+i,tenantId:'a',donoId:'u1',contaId:'c'+(i%50),
    titulo:'Oportunidade '+i,valor:10000+i,
    criadoEm:'2026-10-01',etapaDesde:'2026-10-01',
    fechamentoPrevisto:'2026-12-01',
    etapa:i%3===0?'Proposta':'Diagnóstico',eventos:i%5===0?[{
      id:'e'+i,tipo:'decision',data:'2026-10-20',
      titulo:'Cliente confirmou problema',dimensao:'problema',
      forca:'declarado',canal:'email'
    }]:[],
    dims:Object.fromEntries(P.DIMENSOES.map(d=>[d.id,i%5===0&&d.id==='problema'?2:0])),
    stakeholders:[],desfecho:null
  }));
  e.tarefas=Array.from({length:490},(_,i)=>({
    id:'t'+i,oportunidadeId:'op'+(i%243),tenantId:'a',donoId:'u1',
    status:i%7===0?'concluida':'aberta',
    vencimento:i%2===0?'2026-10-01':'2026-12-31',
    concluidaEm:i%7===0?'2026-10-20':null,titulo:'Ação '+i,
    criadoEm:'2026-10-01'
  }));
  e.contatos=[];e.sinais=[];e.notas=[];e.descartes=[];e.recusas=[];
  S.salvar();
  return {S,E,P,w,e,user:v=>identidade=v,filters:v=>filtros=v};
}
test('resumos de 243 oportunidades idênticos com e sem índice de tarefas',()=>{
  const {S,E,e}=ambiente();
  const original=S.dados;
  let leituras=0;
  S.dados=function(){leituras++;return original();};
  const f=E.fila(e.oportunidades,e.tarefas);
  assert.equal(f.itens.length+f.triagem.length,243);
  /* PERF-02: chamada original contava as tarefas 243 vezes, agora uma. */
  assert.ok(leituras<10,'Store.dados chamado '+leituras+' vezes durante fila');
  for(const item of [...f.itens,...f.triagem]){
    const referencia=E.resumo(item.resumo.op);
    assert.equal(JSON.stringify(item.resumo),JSON.stringify(referencia),
      'Diferença no resumo '+item.resumo.op.id);
  }
});
test('índices de contas e oportunidades preservam primeira ocorrência e invalidam',()=>{
  const {S,e}=ambiente();
  assert.equal(S.conta('c0'),e.contas[0]);
  assert.equal(S.oportunidade('op0'),e.oportunidades[0]);
  assert.equal(S.conta('ausente'),undefined);
  const antes=S.revisao();
  S.atualizarOportunidade('op0',{valor:90200});
  assert.ok(S.revisao()>antes);
  assert.equal(S.oportunidade('op0').valor,90200);
  S.semSincronizar(()=>S.guardarOrientacao('op0',{leitura:'teste'}));
  assert.ok(S.revisao()>antes+1);
  e.contas.unshift({id:'nova',nome:'Nova conta',tenantId:'a'});
  S.salvar();
  assert.equal(S.conta('nova').nome,'Nova conta');
  S.limpar();
  assert.equal(S.conta('c0'),undefined);
  assert.equal(S.oportunidade('op0'),undefined);
});
test('cache reflete alteração econômica, conclusão de tarefa e substituição de carteira',()=>{
 const {S,E,e,w}=ambiente();
 const perf=w.IADPerf02;
 const primeira=perf.filaDados(S.dados());
 const segunda=perf.filaDados(S.dados());
 assert.equal(perf.estatisticas().hits,1);
 assert.equal(JSON.stringify(primeira),JSON.stringify(segunda));
 S.atualizarOportunidade('op2',{valor:999999});
 let nova=perf.filaDados(S.dados());
 assert.equal(nova.itens.concat(nova.triagem).find(i=>i.resumo.op.id==='op2').resumo.op.valor,999999);
 S.atualizarTarefa('t2',{status:'concluida',concluidaEm:'2026-10-29'});
 nova=perf.filaDados(S.dados());
 assert.equal(nova.itens.concat(nova.triagem).find(i=>i.resumo.op.id==='op2').resumo.tarefasAtrasadas,
   E.tarefasAtrasadas(e.oportunidades[2]));
 S.limpar();
 assert.equal(perf.filaDados(S.dados()).itens.length,0);
});
