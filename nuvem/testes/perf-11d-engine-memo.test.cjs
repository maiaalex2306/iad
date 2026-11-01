'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const {performance}=require('node:perf_hooks');
const anterior=cp.execFileSync('git',['show','f58b6f55f9840d74b082dcff78594f1555ef4d2b:src/engine.js'],{encoding:'utf8',maxBuffer:2*1024*1024});
const otimizado=fs.readFileSync('src/engine.js','utf8');
function preparar(engineSource){
 const usuario={id:'u1',papel:'gestor',tenantId:'a'};
 const w={console,IADAuth:{atual:()=>usuario,filtros:()=>({tenant:'todas',usuario:'todos'})}};
 const localStorage={removeItem(){},getItem(){return null},setItem(){}};
 const ctx={window:w,localStorage,Date,Math,JSON,Map,Set,console};
 for(const f of ['playbook','store','engine','pipeline-performance']){
  vm.runInNewContext(f==='engine'?engineSource:fs.readFileSync('src/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
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
const normalizar=v=>JSON.parse(JSON.stringify(v));
const percentil=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.ceil(a.length*p)-1];
test('PERF-11D preserva todos os 389 resumos exatos do motor antigo',()=>{
 const a=preparar(anterior),b=preparar(otimizado);
 assert.equal(a.est.oportunidades.length,389);
 for(let i=0;i<389;i++){
   const opA=a.est.oportunidades[i],opB=b.est.oportunidades[i];
   const orig=a.E.resumo(opA,{[opA.id]:i%7});
   const novo=b.E.resumo(opB,{[opB.id]:i%7});
   assert.deepEqual(normalizar(novo),normalizar(orig),'paridade no lead '+i);
 }
});
test('HEINEKEN: evidências são filtradas uma só vez por E.resumo',()=>{
 const a=preparar(anterior),b=preparar(otimizado);
 const pa=a.est.oportunidades[0],pb=b.est.oportunidades[0];
 let nAntes=0,nDepois=0;
 const filterA=pa.eventos.filter,filterB=pb.eventos.filter;
 pa.eventos.filter=function(...args){nAntes++;return filterA.apply(this,args)};
 pb.eventos.filter=function(...args){nDepois++;return filterB.apply(this,args)};
 assert.deepEqual(normalizar(b.E.resumo(pb,{})),normalizar(a.E.resumo(pa,{})));
 assert.ok(nAntes>5,'esperava encontrar varreduras redundantes no legado');
 assert.equal(nDepois,1,'cache de evidências deve expirar ao fim de cada resumo');
 b.E.resumo(pb,{});
 assert.equal(nDepois,2,'chamada seguinte deve refazer a leitura');
 console.log(JSON.stringify({tipo:'PERF11D varreduras de evidências HEINEKEN',antes:nAntes,depoisPorResumo:1,eventos:pb.eventos.length}));
});
test('alteração de eventos e stakeholders entre resumos não reutiliza valores antigos',()=>{
 const a=preparar(anterior),b=preparar(otimizado);
 const pa=a.est.oportunidades[1],pb=b.est.oportunidades[1];
 pa.eventos.push({id:'nova',tipo:'decision',dimensao:'impacto',data:'2026-10-29',forca:'documentado',contatoId:'p33'});
 pb.eventos.push({id:'nova',tipo:'decision',dimensao:'impacto',data:'2026-10-29',forca:'documentado',contatoId:'p33'});
 pa.stakeholders.push('p55');pb.stakeholders.push('p55');
 assert.deepEqual(normalizar(b.E.resumo(pb,{})),normalizar(a.E.resumo(pa,{})));
 pa.eventos.splice(0,5);pb.eventos.splice(0,5);
 pa.stakeholders.splice(0,2);pb.stakeholders.splice(0,2);
 assert.deepEqual(normalizar(b.E.resumo(pb,{})),normalizar(a.E.resumo(pa,{})));
});
test('benchmark independente de 30 amostras: Engine integral v286 vs otimizado',()=>{
 const a=preparar(anterior),b=preparar(otimizado);
 const idxA={},idxB={};
 const runner=x=>{let total=0;for(const op of x.est.oportunidades)total+=x.E.resumo(op,x===a?idxA:idxB).iad;return total};
 assert.equal(runner(a),runner(b));
 const antes=[],depois=[];
 for(let i=0;i<35;i++){
   // alternar ordem para reduzir viés do aquecimento de JIT
   let ra,rb;
   if(i%2===0){
     const t0=performance.now(),vA=runner(a),t1=performance.now(),vB=runner(b),t2=performance.now();
     assert.equal(vA,vB);ra=t1-t0;rb=t2-t1;
   }else{
     const t0=performance.now(),vB=runner(b),t1=performance.now(),vA=runner(a),t2=performance.now();
     assert.equal(vA,vB);rb=t1-t0;ra=t2-t1;
   }
   if(i>=5){antes.push(ra);depois.push(rb);}
 }
 const result={tipo:'PERF-11D engine CPU isolado',oportunidades:389,amostras:30,warmup:5,
   p50AntigoMs:+percentil(antes,.5).toFixed(3),p95AntigoMs:+percentil(antes,.95).toFixed(3),
   p50NovoMs:+percentil(depois,.5).toFixed(3),p95NovoMs:+percentil(depois,.95).toFixed(3),
   nota:'dados sintéticos; não rede/DOM/browser'};
 console.log(JSON.stringify(result));
 // Comparação quantitativa reportada, não afirmar melhoria universal de P95.
 assert.ok(result.p95AntigoMs>0&&result.p95NovoMs>0);
});

test('benchmark de 200 amostras para cards complexos HEINEKEN/Suzano',()=>{
 const a=preparar(anterior),b=preparar(otimizado);
 const antigo=[],novo=[];
 const executar=x=>{
  const opp=x.est.oportunidades;
  return x.E.resumo(opp[0],{}).iad+x.E.resumo(opp[1],{}).iad;
 };
 for(let i=0;i<220;i++){
  let va,vb,ta,tb;
  if(i%2){
   let t=performance.now();va=executar(a);ta=performance.now()-t;
   t=performance.now();vb=executar(b);tb=performance.now()-t;
  }else{
   let t=performance.now();vb=executar(b);tb=performance.now()-t;
   t=performance.now();va=executar(a);ta=performance.now()-t;
  }
  assert.equal(va,vb);
  if(i>=20){antigo.push(ta);novo.push(tb);}
 }
 console.log(JSON.stringify({tipo:'PERF-11D duas oportunidades complexas',
  amostras:200,cenarios:['HEINEKEN sintética','Suzano sintética'],
  p50AntesMs:+percentil(antigo,.5).toFixed(4),p95AntesMs:+percentil(antigo,.95).toFixed(4),
  p50NovoMs:+percentil(novo,.5).toFixed(4),p95NovoMs:+percentil(novo,.95).toFixed(4),
  nota:'motor real, dados sintéticos e tempo CPU Node sem navegador'}));
});
