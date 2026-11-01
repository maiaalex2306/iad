'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const perfCode = fs.readFileSync('src/pipeline-performance.js','utf8');
const viewsCode = fs.readFileSync('src/views.js','utf8');
const arquivosCode = fs.readFileSync('src/arquivos.js','utf8');
const nuvemCode = fs.readFileSync('src/nuvem.js','utf8');

function ambiente() {
  let rev = 1, chamadas = 0;
  const w = {
    IADStore: {
      revisao: () => rev,
      hoje: () => '2026-10-31',
      contexto: () => ({ usuario: { id:'u1', papel:'gestor' }, tenantId:'a', filtros:{} })
    },
    IADEngine: {
      resumo: (op, atrasos) => {
        chamadas++;
        return {op,iad:op.score,saude:op.score, atrasadas:atrasos[op.id] || 0,
          classe:{id:op.nutricao?'nutricao':'ativa'}, faixa:{classe:'active'},
          evidenceAge:8,gates:{liberado:true}};
      }
    }
  };
  vm.runInNewContext(perfCode,{window:w,Map,Set,Math,Date,JSON,console});
  return {w, proximaRevisao:()=>rev++, chamadas:()=>chamadas};
}
const oportunidades = Array.from({length:389},(_,i)=>({
  id:'opp_'+i,titulo:i===0?'The HEINEKEN':i===1?'Suzano':'Empresa '+i,
  contaId:'c'+i,donoId:'u1',score:i%100,etapa:i%2?'Diagnóstico':'Proposta',
  eventos:Array.from({length:i===0?131:i===1?130:i%5},(_,j)=>({id:'e'+j})),
  snapshots:Array.from({length:i===0?18:i===1?26:1},(_,j)=>j)
}));
const tarefas=Array.from({length:459},(_,i)=>({
  id:'t'+i,oportunidadeId:'opp_'+(i%389),status:'aberta',
  vencimento:'2026-10-20'
}));
test('389 oportunidades: filtro antecipado calcula só cards elegíveis e mantém paridade',()=>{
  const {w,chamadas}=ambiente();
  const est={oportunidades,tarefas};
  const elegiveis=oportunidades.filter(o=>o.titulo==='The HEINEKEN');
  const um=w.IADPipelinePerf.resumosElegiveis(est,elegiveis);
  assert.equal(chamadas(),1);
  assert.equal(um.length,1);
  assert.equal(um[0].op.id,'opp_0');
  assert.equal(um[0].atrasadas,2);
  assert.deepEqual(JSON.parse(JSON.stringify(um[0])),JSON.parse(JSON.stringify(w.IADEngine.resumo(oportunidades[0],{'opp_0':2}))));
  assert.equal(chamadas(),2);
  w.IADPipelinePerf.resumosElegiveis(est,elegiveis);
  assert.equal(chamadas(),2,'segunda busca deve usar cache');
  const dois=w.IADPipelinePerf.resumosElegiveis(est,oportunidades.slice(0,2));
  assert.equal(dois.length,2);
  assert.equal(chamadas(),3,'apenas o novo cartão deve ser calculado');
  assert.equal(w.IADPipelinePerf.estatisticas().selecionadosEmCache,2);
});
test('revisão, ausência de escopo e cache integral não vazam resumos antigos',()=>{
  const e=ambiente(), est={oportunidades,tarefas};
  const filt=oportunidades.slice(0,2);
  e.w.IADPipelinePerf.resumosElegiveis(est,filt);
  assert.equal(e.chamadas(),2);
  e.proximaRevisao();
  e.w.IADPipelinePerf.resumosElegiveis(est,filt);
  assert.equal(e.chamadas(),4);
  e.w.IADPipelinePerf.limpar();
  assert.equal(e.w.IADPipelinePerf.estatisticas().selecionadosEmCache,0);
  e.w.IADPipelinePerf.resumosElegiveis(est,[]);
  assert.equal(e.chamadas(),4);
  const todas=e.w.IADPipelinePerf.resumosElegiveis(est,oportunidades);
  assert.equal(todas.length,389);
  assert.equal(e.chamadas(),393);
  assert.equal(e.w.IADPipelinePerf.resumosElegiveis(est,oportunidades.slice(0,2)).length,2);
  assert.equal(e.chamadas(),393,'cache completo reaproveitado');
});
test('pré-filtro não elimina nenhuma oportunidade aprovada pelos filtros originais',()=>{
  const ini=viewsCode.indexOf('  function passaNoFiltroPipeline(');
  const fim=viewsCode.indexOf('  function ordenarPipeline(',ini);
  const novo=viewsCode.indexOf('  function passaNoPrefiltroPipeline(');
  const fimNovo=viewsCode.indexOf('  function resumosDoPipeline(',novo);
  assert.ok(ini>=0&&fim>ini&&novo>=0&&fimNovo>novo);
  const contas=Object.fromEntries(oportunidades.map(o=>[o.contaId,{id:o.contaId,nome:o.titulo,cidade:'São Paulo',uf:'SP'}]));
  const contexto={
    Store:{conta:id=>contas[id],tarefasDaOportunidade:()=>[]},
    E:{segmentoDe:()=> 'Industria',depoisDaProposta:op=>op.etapa==='Proposta'},
    global:{IADAuth:{atual:()=>({id:'u1'}),},
      IADLocalidades:{sigla:x=>x,normalizar:s=>String(s).toLowerCase()}}
  };
  vm.runInNewContext(viewsCode.slice(ini,fim)+viewsCode.slice(novo,fimNovo)+
    ';globalThis.fn={antigo:passaNoFiltroPipeline,novo:passaNoPrefiltroPipeline};',contexto);
  const filtros=[
    {},{busca:'HEINEKEN'},{busca:'Suzano'},{status:'ganhas'},{status:'abertas'},
    {responsavel:'meu'},{responsavel:'outro'},{conta:'c1'},{etapa:'Proposta'},
    {origem:'Manual'},{sdr:'SDR'}, {produto:'abc'}, {valorMin:10000},
    {semCompromisso:true},{uf:'SP'},{municipio:'São Paulo'},
    {iadMin:25},{gateAberto:true},{esfriando:true},{semTarefa:true},
    {previsaoDe:'2026-11-01'},{previsaoAte:'2026-12-31'}
  ];
  for(const caso of filtros){
    const f=Object.assign({responsavel:'todos',status:'abertas',
      busca:'',conta:'',uf:'',municipio:'',segmento:'',etapa:'',produto:'',
      origem:'',sdr:'',semTarefa:false,semCompromisso:false,
      esfriando:false,gateAberto:false,iadMin:'',iadMax:'',
      valorMin:'',valorMax:'',semEvidenciaDias:'',previsaoDe:'',previsaoAte:''},caso);
    for(const op of oportunidades){
      const r={op,conta:contas[op.contaId],faixa:{classe:'active'},
        gates:{liberado:false},iad:op.score,evidenceAge:8};
      if(contexto.fn.antigo(r,f)) {
        assert.equal(contexto.fn.novo(op,f),true,
          'falso negativo no filtro '+JSON.stringify(caso)+' / '+op.id);
      }
    }
  }
});
test('IndexedDB: listagem acessa índice seletivo e mantém contagem global',async()=>{
  const registros=[
    {id:'a',oportunidadeId:'opp_0',contaId:'c0',tarefaId:'t0',data:'2026-10-30',tamanho:10},
    {id:'b',oportunidadeId:'opp_1',contaId:'c1',tarefaId:'t1',data:'2026-10-31',tamanho:20},
    {id:'c',oportunidadeId:'opp_0',contaId:'c0',tarefaId:'t2',data:'2026-10-31',tamanho:30}
  ];
  const leitura=[];
  const responder = dados => {const req={};queueMicrotask(()=>{req.result=dados;req.onsuccess();});return req;};
  const loja={
    indexNames:{contains:()=>true},
    index:campo=>({getAll:valor=>{leitura.push(campo);return responder(registros.filter(x=>x[campo]===valor));}}),
    getAll:()=>{leitura.push('all');return responder(registros);}
  };
  const db={transaction:()=>({objectStore:()=>loja})};
  const w={indexedDB:{open:()=>{const req={};queueMicrotask(()=>{req.result=db;req.onsuccess();});return req;}}};
  vm.runInNewContext(arquivosCode,{window:w,indexedDB:w.indexedDB,Promise,console,setTimeout,URL});
  assert.equal((await w.IADArquivos.listar('opp_0')).length,2);
  assert.equal((await w.IADArquivos.listar({contaId:'c1'})).length,1);
  assert.equal((await w.IADArquivos.listar({tarefaId:'t1'})).length,1);
  assert.deepEqual(leitura,['oportunidadeId','contaId','tarefaId']);
  assert.equal((await w.IADArquivos.uso()).bytes,60);
  assert.equal(leitura[3],'all');
  assert.match(arquivosCode,/const VERSAO = 2/);
});
test('sincronização usa mapa de IDs e não filtro quadrático no envio de oportunidades',()=>{
  assert.match(nuvemCode,/const minhasPorId = t\.remota === 'oportunidades' && mudaram\.length/);
  assert.match(nuvemCode,/const registro=minhasPorId\.get\(String\(linha\.id\)\)/);
  assert.doesNotMatch(nuvemCode,/const registro=minhas\.filter\(/);
});
