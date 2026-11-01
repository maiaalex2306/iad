'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {performance}=require('node:perf_hooks');
function preparar(){
 const usuario={id:'u1',papel:'gestor',tenantId:'a'};
 const w={console,IADAuth:{atual:()=>usuario,filtros:()=>({tenant:'todas',usuario:'todos'})}};
 const localStorage={removeItem(){},getItem(){return null},setItem(){}};
 const ctx={window:w,localStorage,Date,Math,JSON,Map,Set,console};
 for(const f of ['playbook','store','engine','pipeline-performance']){
  vm.runInNewContext(fs.readFileSync('src/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
 }
 const S=w.IADStore,P=w.IADPlaybook,E=w.IADEngine,s=S.obter();
 const dims=Object.fromEntries(P.DIMENSOES.map(d=>[d.id,2]));
 s.tenants=[{id:'a'},{id:'b'}];
 s.contas=Array.from({length:384},(_,i)=>({id:'c'+i,tenantId:'a',donoId:'u1',nome:'Empresa '+i}));
 s.contatos=Array.from({length:564},(_,i)=>({id:'p'+i,tenantId:'a',donoId:'u1',
  contaId:'c'+(i%384),papel:i%4?'decisor_economico':'champion',perfil:'mobilizador',sentimento:'favoravel'}));
 s.oportunidades=Array.from({length:389},(_,i)=>{
  const eventos=Array.from({length:i===0?131:i===1?130:i%6},(_,j)=>({
    id:'e'+i+'_'+j,tipo:'decision',dimensao:P.DIMENSOES[j%P.DIMENSOES.length].id,
    data:'2026-10-20',contatoId:'p'+(j%564),forca:'confirmado'
  }));
  return{id:'o'+i,tenantId:'a',donoId:'u1',contaId:'c'+(i%384),
   titulo:i===0?'The HEINEKEN':i===1?'Suzano':'Empresa '+i,
   valor:10000+i,criadoEm:'2026-10-01',etapaDesde:'2026-10-01',
   etapa:i%3?'Diagnóstico':'Proposta',fechamentoPrevisto:'2026-12-01',
   dims:Object.assign({},dims),eventos,
   snapshots:Array.from({length:i===0?18:i===1?26:1},(_,j)=>({
      data:'2026-10-20',iad:16,dims:Object.assign({},dims)})),
   stakeholders:Array.from({length:i===0?15:i===1?11:2},(_,j)=>'p'+(j%564)),
   desfecho:null
  };
 });
 s.tarefas=Array.from({length:459},(_,i)=>({id:'t'+i,tenantId:'a',donoId:'u1',
   oportunidadeId:'o'+(i%389),vencimento:'2026-10-01',status:'aberta',titulo:'Tarefa '+i}));
 s.sinais=[];s.notas=[];s.segmentos=[];s.tiposTarefa=[];s.fontes=[];s.produtos=[];
 S.salvar();
 let chamadas=0;
 const original=E.resumo;
 E.resumo=function(){chamadas++;return original.apply(E,arguments);};
 return{w,E,S,est:S.dados(),chamadas:()=>chamadas};
}
test('Engine real: 389 oportunidades mantém igualdade exata ao filtrar HEINEKEN e Suzano',()=>{
 const full=preparar(),selected=preparar();
 const t0=performance.now(),all=full.w.IADPipelinePerf.resumos(full.est);
 const tempoTotal=performance.now()-t0;
 assert.equal(all.length,389);
 assert.equal(full.chamadas(),389);
 const t1=performance.now(),filtrado=selected.w.IADPipelinePerf.resumosElegiveis(
   selected.est,selected.est.oportunidades.slice(0,2));
 const tempoSeletivo=performance.now()-t1;
 assert.equal(filtrado.length,2);
 assert.equal(selected.chamadas(),2);
 for(let i=0;i<2;i++){
   assert.deepEqual(JSON.parse(JSON.stringify(filtrado[i])),
     JSON.parse(JSON.stringify(all[i])),'diferença no resumo '+i);
 }
 /* Repetições com limpeza do cache para medir trabalho REAL e não cache-hit.
    Cinco aquecimentos + trinta observações independentes por cenário. */
 const baseline=[],selecoes=[];
 for(let repeticao=0;repeticao<35;repeticao++){
   full.w.IADPipelinePerf.limpar();
   selected.w.IADPipelinePerf.limpar();
   const a=performance.now();
   full.w.IADPipelinePerf.resumos(full.est);
   const b=performance.now();
   selected.w.IADPipelinePerf.resumosElegiveis(selected.est,selected.est.oportunidades.slice(0,2));
   const c=performance.now();
   if(repeticao>=5){baseline.push(b-a);selecoes.push(c-b);}
 }
 const percentil=(xs,p)=>xs.slice().sort((a,b)=>a-b)[Math.ceil(xs.length*p)-1];
 const dados={
   tipo:'Decision Engine REAL sobre carteira SINTÉTICA',
   oportunidades:389,resumosAntes:389,resumosDepois:2,amostras:30,
   warmup:5,tempoPrimeiroAntesMs:+tempoTotal.toFixed(2),tempoPrimeiroDepoisMs:+tempoSeletivo.toFixed(2),
   p50AntesMs:+percentil(baseline,.5).toFixed(2),p95AntesMs:+percentil(baseline,.95).toFixed(2),
   p50DepoisMs:+percentil(selecoes,.5).toFixed(2),p95DepoisMs:+percentil(selecoes,.95).toFixed(2),
   nota:'Microbenchmark Node isolado com 30 medições; não equivale a latência de navegador ou servidor'
 };
 console.log(JSON.stringify(dados));
});
test('uma busca seletiva não provoca cálculo de centenas de cards repetidos',()=>{
 const x=preparar();
 const a=x.w.IADPipelinePerf.resumosElegiveis(x.est,[x.est.oportunidades[0]]);
 assert.equal(a[0].op.titulo,'The HEINEKEN');
 assert.equal(x.chamadas(),1);
 const b=x.w.IADPipelinePerf.resumosElegiveis(x.est,[x.est.oportunidades[0]]);
 assert.equal(b[0],a[0]);
 assert.equal(x.chamadas(),1);
 x.S.atualizarOportunidade('o0',{valor:999999});
 const c=x.w.IADPipelinePerf.resumosElegiveis(x.S.dados(),[x.S.oportunidade('o0')]);
 assert.equal(c[0].op.valor,999999);
 assert.equal(x.chamadas(),2);
});
