'use strict';
/* PERF-RI04: paridade da versão publicada v286.78 x índice por segmento v286.79.
 * Sem dados de clientes, cookies, Supabase, APIs ou consultas externas. */
const test=require('node:test'),assert=require('node:assert/strict');
const cp=require('node:child_process'),path=require('node:path'),{performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const beforeSource=cp.execFileSync('git',
 ['show','cdec570d462ebb456001c068b71113fcfe3f21bc:src/ri/opportunity-radar.mjs'],
 {cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const oldPromise=import('data:text/javascript;base64,'+Buffer.from(beforeSource).toString('base64'));
const newPromise=import(pathToFileURL(path.join(root,'src/ri/opportunity-radar.mjs')).href);
const asOf='2026-11-06',scope={role:'gestor',tenantId:'tenant-a',userId:'gestor',token:'scope-token'};
function fixture(count=250,products=90,tenantVariants=2){
 const accounts=[],opportunities=[],catalog=[];
 for(let i=0;i<products;i++)catalog.push({id:'p'+i,tenantId:'tenant-a',donoId:'gestor',nome:'Serviço '+i});
 for(let i=0;i<count;i++){
  const tenant=i%tenantVariants?'tenant-b':'tenant-a';
  const segment=['Química','Metalurgia','Farmacêutica','Alimentos'][i%4];
  const acc='acc'+i;
  accounts.push({id:acc,tenantId:tenant,donoId:'gestor',nome:'Conta '+i,segmento:segment,
   criadoEm:'2025-09-01'});
  for(let j=0;j<4;j++){
   const product=(i*37+j*17+(i%7)*3)%products;
   opportunities.push({id:'op'+i+'-'+j,contaId:acc,tenantId:tenant,donoId:'gestor',
    etapa:'Venda',desfecho:{tipo:'ganho',data:'2026-02-'+String((j%25)+1).padStart(2,'0')},
    itens:[{id:'it'+i+'-'+j,nome:'Serviço '+product,produtoId:'p'+product}],eventos:[]});
  }
 }
 const signals=[{id:'s1',tenantId:'tenant-a',donoId:'gestor',contaId:'acc0',
  tipo:'expansao',data:'2026-11-01',titulo:'Novo centro',url:'https://example.org/noticia'}];
 return {contas:accounts,oportunidades:opportunities,produtos:catalog,tarefas:[],sinais:signals};
}
const value=x=>JSON.stringify(x);
test('resultado exatamente igual ao módulo publicado, com nomes e ordenação iguais',async()=>{
 const [oldM,newM]=await Promise.all([oldPromise,newPromise]);
 for(const accounts of [0,1,7,50,250,600]){
  for(const tenants of [1,2]){
   const data=fixture(accounts,Math.max(20,Math.ceil(accounts/3)),tenants);
   for(const profile of [scope,{...scope,role:'admin',admin:true,tenantFilter:'todas',ownerFilter:'todos'},
    {...scope,role:'admin',admin:true,tenantFilter:'tenant-b',ownerFilter:'todos'}]){
    const args={snapshot:data,scope:profile,asOf};
    const current=newM.buildCommercialOpportunityRadar(args);
    delete current.groups.pistas; // RI-07A adiciona um grupo; as 5 categorias legadas devem ser idênticas.
    assert.equal(value(current),
     value(oldM.buildCommercialOpportunityRadar(args)),
     'diferença em '+accounts+' contas / '+tenants+' tenants / '+profile.role+' / '+profile.tenantFilter);
   }
  }
 }
 const data=fixture(330,80,2);
 const source=value(data);
 newM.buildCommercialOpportunityRadar({snapshot:data,scope,asOf});
 assert.equal(value(data),source,'nenhuma escrita nos dados autorizados');
 console.log('PERF_RI04_PARITY_PASS scenarios='+36+' tenantIsolation=on dataMutation=none');
});
test('históricos densos: CPU antes/depois com mesma fixture e chamadas intercaladas',async()=>{
 const [oldM,newM]=await Promise.all([oldPromise,newPromise]);
 const args={snapshot:fixture(900,260,1),scope,asOf};
 for(let i=0;i<3;i++){oldM.buildCommercialOpportunityRadar(args);newM.buildCommercialOpportunityRadar(args);}
 const old=[],now=[],runs=16;
 for(let i=0;i<runs;i++){
  if(i%2===0){
   let start=performance.now();oldM.buildCommercialOpportunityRadar(args);old.push(performance.now()-start);
   start=performance.now();newM.buildCommercialOpportunityRadar(args);now.push(performance.now()-start);
  }else{
   let start=performance.now();newM.buildCommercialOpportunityRadar(args);now.push(performance.now()-start);
   start=performance.now();oldM.buildCommercialOpportunityRadar(args);old.push(performance.now()-start);
  }
 }
 const pct=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.max(0,Math.ceil(a.length*p)-1)];
 const pre=pct(old,.5),post=pct(now,.5),pre95=pct(old,.95),post95=pct(now,.95);
 const improvement=(1-post/pre)*100;
 console.log('PERF_RI04_CPU '+JSON.stringify({
  benchmark:'node-local-sintetico, sem navegador, rede ou credenciais',
  accounts:900,opportunities:3600,products:260,samples:runs,
  beforeP50Ms:+pre.toFixed(2),afterP50Ms:+post.toFixed(2),
  beforeP95Ms:+pre95.toFixed(2),afterP95Ms:+post95.toFixed(2),
  p50GainPercent:+improvement.toFixed(1)}));
 assert.ok(improvement>15,'esperado ganho >=15% no benchmark interno, medido '+improvement.toFixed(1)+'%');
});
test('escala de 10.000 oportunidades sem alteração de limite de cards',async()=>{
 const m=await newPromise;
 const f=fixture(2500,600,2);
 const output=m.buildCommercialOpportunityRadar({snapshot:f,scope,asOf});
 assert.ok(Object.entries(output.groups).filter(([kind])=>kind!=='pistas').every(([,x])=>x.length<=12),
  'categorias legadas continuam limitadas a 12; pistas sao paginadas na interface');
 assert.ok(Object.values(output.groups).flat().every(x=>x.tenantId==='tenant-a'),'não atravessar tenants');
});
test('gate de release consistente e código sem cache comercial global',()=>{
 const src=fs.readFileSync(path.join(root,'src/ri/opportunity-radar.mjs'),'utf8');
 const config=fs.readFileSync(path.join(root,'src/config.js'),'utf8');
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.match(src,/const candidates=segmentProducts\.get/);
 assert.doesNotMatch(src,/fetch\s*\(|localStorage|sessionStorage|supabase\./);
 const version=config.match(/numero:\s*'(v286\.\d+)'/);
 assert.ok(version,'versão semanticamente válida do CRM');
 assert.ok(sw.includes('iad-crm-'+version[1]),'Configuração e Service Worker precisam ter a mesma versão');
 assert.ok(sw.includes("'./src/ri/opportunity-radar.mjs'"));
});
