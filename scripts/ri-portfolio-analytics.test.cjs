'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{resolve}=require('node:path');
let mod;async function run(data){mod??=import(pathToFileURL(resolve(__dirname,'../src/ri/portfolio-analytics.mjs')));return (await mod).buildPortfolioAnalytics(data);}
const date='2026-11-05';
const scope={userId:'u1',tenantId:'t1',role:'vendedor',admin:false,tenantFilter:'t1',ownerFilter:'todos'};
function fixture(){return {
 scope,asOf:date,snapshot:{
 contas:[{id:'a1',tenantId:'t1',donoId:'u1',nome:'Química A'},{id:'a2',tenantId:'t1',donoId:'u2',nome:'Privada'},{id:'a3',tenantId:'t2',donoId:'u1',nome:'Outro tenant'}],
 oportunidades:[
  {id:'o1',tenantId:'t1',donoId:'u1',contaId:'a1',valor:2000,etapa:'Proposta',etapaDesde:'2026-09-01',fechamentoPrevisto:'2026-11-01',titulo:'Projeto A',desfecho:null},
  {id:'o2',tenantId:'t1',donoId:'u1',contaId:'a1',valor:900,desfecho:{tipo:'ganho'}},
  {id:'o3',tenantId:'t1',donoId:'u1',contaId:'a1',valor:400,desfecho:{tipo:'perda'}},
  {id:'o4',tenantId:'t1',donoId:'u1',contaId:'a2',valor:100000,desfecho:null},
  {id:'o5',tenantId:'t2',donoId:'u1',contaId:'a3',valor:50000,desfecho:null}
 ],
 tarefas:[
  {id:'t1',tenantId:'t1',donoId:'u1',oportunidadeId:'o1',status:'aberta',vencimento:'2026-11-03'},
  {id:'t2',tenantId:'t1',donoId:'u1',oportunidadeId:'o1',status:'aberta',vencimento:'2026-11-12'},
  {id:'t3',tenantId:'t1',donoId:'u2',oportunidadeId:'o1',status:'aberta',vencimento:'2026-11-02'},
  {id:'t4',tenantId:'t1',donoId:'u1',oportunidadeId:'o1',status:'concluida',vencimento:'2026-11-01'}
 ]}};}
test('calcula receita e taxa de ganho apenas com negócios autorizados',async()=>{
 const x=await run(fixture());
 assert.equal(x.metrics.accounts,1);assert.equal(x.metrics.opportunities,3);
 assert.equal(x.metrics.open,1);assert.equal(x.metrics.openValue,2000);
 assert.equal(x.metrics.won,1);assert.equal(x.metrics.lost,1);
 assert.equal(x.metrics.winRate,0.5);assert.equal(x.metrics.wonValue,900);
 assert.equal(x.metrics.overdueTasks,1);assert.equal(x.metrics.upcomingTasks,1);
 assert.equal(x.metrics.withoutNextStep,0);
 assert.equal(x.metrics.lateClosing,1);assert.equal(x.metrics.stalled,1);
 assert.equal(x.priorities[0].attention,9);
 assert.ok(!JSON.stringify(x).includes('Privada'));
 assert.ok(!JSON.stringify(x).includes('Outro tenant'));
});
test('papel usuario usa permissão real do IaD e ignora contas e tarefas de terceiros',async()=>{
 const f=fixture();f.scope={...scope,role:'usuario'};
 f.snapshot.oportunidades.push({id:'o6',tenantId:'t1',contaId:'a1',donoId:'u2',valor:888888,etapa:'Proposta',desfecho:null});
 f.snapshot.tarefas.push({id:'t6',tenantId:'t1',oportunidadeId:'o6',donoId:'u2',status:'aberta',vencimento:'2026-11-01'});
 const x=await run(f);
 assert.equal(x.metrics.accounts,1);
 assert.equal(x.metrics.open,1);
 assert.equal(x.metrics.openValue,2000);
 assert.equal(x.metrics.overdueTasks,1);
 assert.ok(!JSON.stringify(x).includes('888888'));
});
test('admin com filtro de responsável não herda oportunidades ou tarefas de outro usuário',async()=>{
 const f=fixture();f.scope={...scope,role:'admin',admin:true,tenantFilter:'t1',ownerFilter:'u1'};
 f.snapshot.oportunidades.push({id:'o6',tenantId:'t1',contaId:'a1',donoId:'u2',valor:888888,etapa:'Proposta',desfecho:null});
 const x=await run(f);
 assert.equal(x.metrics.accounts,1);
 assert.equal(x.metrics.open,1);
 assert.equal(x.metrics.overdueTasks,1);
 assert.equal(x.metrics.openValue,2000);
});
test('indicadores de prazo usam data civil local mesmo quando UTC já mudou de dia',async()=>{
 const {localBusinessDate}=await import('../src/ri/portfolio-analytics.mjs');
 const prev=process.env.TZ;
 try{
  process.env.TZ='America/Sao_Paulo';
  assert.equal(localBusinessDate(new Date('2026-11-06T01:30:00.000Z')),'2026-11-05');
 }finally{if(prev===undefined)delete process.env.TZ;else process.env.TZ=prev;}
});
test('não transforma desistência em perda nem ausência de histórico em conversão zero',async()=>{
 const f=fixture();f.snapshot.oportunidades=f.snapshot.oportunidades.map(o=>({...o,desfecho:{tipo:'desistencia'}}));
 const x=await run(f);assert.equal(x.metrics.abandoned,3);assert.equal(x.metrics.winRate,null);
});
test('riscos de pendência, compromisso e financeiro são fatos distintos',async()=>{
 const f=fixture();f.snapshot.oportunidades[0].valor='inválido';f.snapshot.tarefas=[];
 const x=await run(f);
 assert.equal(x.metrics.openValue,0);assert.equal(x.metrics.unknownOpenValue,1);
 assert.equal(x.metrics.withoutNextStep,1);
 assert.equal(x.priorities[0].attention,7); // fechamento vencido + etapa parada + sem compromisso
});
test('dois tenants com mesmo id de oportunidade nunca cruzam tarefas',async()=>{
 const f=fixture();f.scope={...scope,role:'admin',admin:true,tenantFilter:'t1'};
 f.snapshot.tarefas.push({id:'falso',tenantId:'t2',oportunidadeId:'o1',status:'aberta',vencimento:'2026-11-01'});
 const x=await run(f);assert.equal(x.metrics.overdueTasks,2); // u1 e u2 como admin
 assert.equal(x.metrics.accounts,2);
});
test('evita efeitos colaterais e rejeita escopo e datas inválidas',async()=>{
 const f=fixture(),before=JSON.stringify(f);
 await run(f);assert.equal(JSON.stringify(f),before);
 for(const patch of [{asOf:'2026-11-99'},{scope:{...scope,userId:''}},{snapshot:{contas:[],oportunidades:[],tarefas:null}}])
  await assert.rejects(run({...f,...patch}));
});
test('processa milhares de oportunidades sem saída descontrolada',async()=>{
 const f=fixture();f.snapshot.oportunidades=Array.from({length:6000},(_,i)=>({id:'o'+i,tenantId:'t1',contaId:'a1',donoId:'u1',
 titulo:'Venda '+i,valor:100,etapa:'Prospecção',etapaDesde:'2026-10-31'}));
 f.snapshot.tarefas=[];
 const x=await run(f);assert.equal(x.metrics.open,6000);assert.equal(x.metrics.openValue,600000);
 assert.equal(x.priorityCount,6000);assert.equal(x.priorities.length,15);
 assert.ok(JSON.stringify(x).length<18000);
});
