'use strict';
/* PERF-11F: Chromium real, HTML real do CRM, dados 100% sintéticos.
 * NÃO usa credenciais, APIs ou dados do Supabase de produção.
 * Compara v286 com a candidata no mesmo runner; NÃO é E2E autenticado real.
 */
const fs=require('node:fs');
const cp=require('node:child_process');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE='a844883082340fef513dac53f984d4143b88cc27';
const ROOT=process.cwd();
const scripts=[
 'performance','localidades','playbook','store','auth','engine',
 'incremental','p5b-shadow','p5d-events','p5e-cache','perf-02',
 'pipeline-performance','funis','orientacao','conferencia','arquivos',
 'pendencias','csv','integracoes','cas','cas-queue','documentos',
 'quadro','ia','ui','ajuda','graficos','seed','whatsapp','email',
 'conversa','views'
].map(n=>'src/'+n+'.js');
const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
 '<link rel="stylesheet" href="assets/styles.css">'+
 '</head><body><div class="app"><main id="conteudo"></main></div>'+
 '<script>window.IADNuvem={mandaNoAcesso:()=>false,sessao:()=>({}),conectado:()=>false};</script>'+
 scripts.map(s=>'<script src="'+s+'"></script>').join('')+
 '</body></html>';
const files=new Map();
function read(versao,uri){
 if(uri==='/harness.html')return Buffer.from(html);
 const p=decodeURIComponent(uri.slice(1));
 if(!/^(?:src|assets)\/[a-zA-Z0-9._/-]+$/.test(p)||p.includes('..'))return null;
 const key=versao+':'+p;
 if(files.has(key))return files.get(key);
 let data;
 if(versao==='v286'){
  try{data=cp.execFileSync('git',['show',BASE+':'+p],{cwd:ROOT,maxBuffer:8*1024*1024})}catch(e){return null}
 }else{
  try{data=fs.readFileSync(path.join(ROOT,p))}catch(e){return null}
 }
 files.set(key,data);
 return data;
}
function seed(){
 const base='2026-10-20';
 const tenants=[{id:'company-a',nome:'Empresa A'},{id:'company-b',nome:'Empresa B'}];
 const users=[{id:'admin-test',nome:'Administrador de teste',papel:'admin',
  tenantId:'company-a',ativo:true,naNuvem:true,emailConfirmado:true}];
 const contas=Array.from({length:389},(_,i)=>({
  id:'c'+i,tenantId:i%11===0?'company-b':'company-a',
  donoId:'admin-test',nome:i===0?'HEINEKEN':i===1?'SUZANO':'CONTA SINTÉTICA '+i,
  uf:i%3===0?'SP':'RJ',cidade:i%3===0?'São José dos Campos':'Rio de Janeiro',
  segmento:i%2===0?'Indústria':'Serviços'}));
 const contatos=Array.from({length:900},(_,i)=>({
  id:'p'+i,tenantId:i%11===0?'company-b':'company-a',donoId:'admin-test',
  contaId:'c'+(i%389),nome:'Contato de teste '+i,
  papel:i%3?'decisor_economico':'champion',perfil:'mobilizador',sentimento:'favoravel'}));
 const dims=['problema','prioridade','impacto','stakeholders','criterios','processo','consenso','risco'];
 const oportunidades=Array.from({length:389},(_,i)=>({
  id:'o'+i,contaId:'c'+i,tenantId:contas[i].tenantId,donoId:'admin-test',
  titulo:contas[i].nome,valor:10000+i*110,valorMensal:0,
  criadoEm:'2026-09-01',etapaDesde:'2026-09-20',
  etapa:i%2?'Diagnóstico':'Proposta',fechamentoPrevisto:'2026-12-01',
  dims:Object.fromEntries(dims.map(d=>[d,2])),
  eventos:Array.from({length:i===0?131:i===1?130:i%7},(_,j)=>({
   id:'evt-'+i+'-'+j,tipo:'decision',dimensao:dims[j%8],
   data:base,contatoId:'p'+(j%900),forca:'confirmado',
   titulo:'Evento sintético '+j,canal:'reuniao'
  })),
  stakeholders:Array.from({length:i===0?15:i===1?11:2},(_,j)=>'p'+(j%900)),
  snapshots:Array.from({length:i===0?18:i===1?26:1},(_,j)=>({
   data:base,iad:16,dims:Object.fromEntries(dims.map(d=>[d,2]))})),
  itens:[],desfecho:null
 }));
 const tarefas=Array.from({length:500},(_,i)=>({
  id:'t'+i,tenantId:contas[i%389].tenantId,donoId:'admin-test',
  oportunidadeId:'o'+(i%389),titulo:'Tarefa '+i,status:'aberta',
  vencimento:'2026-11-20',criadoEm:'2026-09-20'
 }));
 return {tenants,users,contas,contatos,oportunidades,tarefas};
}
async function createBrowserScenario(browser,port,version,fixture) {
 const context=await browser.newContext({viewport:{width:1440,height:900},
   serviceWorkers:'block'});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
 await page.goto('http://127.0.0.1:'+port+'/'+version+'/harness.html',{waitUntil:'load',timeout:30000});
 await page.evaluate(data=>{
  const w=window,S=w.IADStore,A=w.IADAuth,V=w.IADViews;
  if(!S||!A||!V||!w.IADEngine)throw Error('Módulos essenciais não foram carregados');
  const est=S.estadoVazio();
  est.tenants=data.tenants;
  est.usuarios=data.users;
  est.contas=data.contas;
  est.contatos=data.contatos;
  est.oportunidades=data.oportunidades;
  est.tarefas=data.tarefas;
  S.substituir(est);
  A.abrirSessao(data.users[0]);
  const container=document.getElementById('conteudo');
  w.__renderPipeline=()=>{
    container.innerHTML=V.pipeline();
    return container.textContent;
  };
  w.__renderCockpit=id=>{
    container.innerHTML=V.cockpit(id);
    return container.textContent;
  };
  w.__renderAba=aba=>{
    V.definirAbaCockpit(aba);
    const p=V.painelDaAbaCockpit(w.__activeOp||'o0');
    if(!p)throw Error('Aba inválida '+aba);
    const tabs=container.querySelector('.abas-cockpit');
    const body=container.querySelector('.corpo-aba');
    if(tabs)tabs.innerHTML=p.abas;
    if(body)body.innerHTML=p.corpo;
    return container.textContent;
  };
  w.App={
    ir:hash=>{location.hash=hash;},
    filtrar:grupo=>{V.definirFiltro(grupo);w.__renderPipeline();},
    pipelineCampo:(campo,valor)=>{V.pipelineFiltrar({[campo]:valor});w.__renderPipeline();},
    pipelineBusca:valor=>{V.pipelineFiltrar({busca:valor});w.__renderPipeline();},
    abaCockpit:aba=>w.__renderAba(aba),
    modoPipeline:modo=>{V.definirModoPipeline(modo);w.__renderPipeline();}
  };
 },fixture);
 if(errors.length)throw Error(version+' bootstrap: '+errors.join(' | '));
 return {context,page,errors};
}
async function measure(scenario){
 const report=await scenario.page.evaluate(async()=>{
  const w=window,V=w.IADViews,P=w.IADPipelinePerf;
  const container=document.getElementById('conteudo');
  const data={};
  const pct=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.ceil(a.length*p)-1];
  const bench=async(fn,n=35)=>{
   const samples=[],work=[];
   for(let i=0;i<n+5;i++){
    const start=performance.now();
    fn();
    const workMs=performance.now()-start;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const frameMs=performance.now()-start;
    if(i>=5){samples.push(frameMs);work.push(workMs);}
   }
   return {
     workP50Ms:+pct(work,.5).toFixed(3),
     workP95Ms:+pct(work,.95).toFixed(3),
     frameP50Ms:+pct(samples,.5).toFixed(2),
     frameP95Ms:+pct(samples,.95).toFixed(2),
     count:samples.length
   };
  };
  V.pipelineFiltrar({busca:''});
  P.limpar();
  const first=w.__renderPipeline();
  data.pipelineFull={titleFound:first.includes('CONTA SINTÉTICA'),htmlBytes:container.innerHTML.length,
     cards:container.querySelectorAll('.card').length};
  data.pipelineFullLatency=await bench(()=>{P.limpar();w.__renderPipeline();},30);
  V.pipelineFiltrar({busca:'HEINEKEN'});
  P.limpar();
  const filtered=w.__renderPipeline();
  data.search={found:filtered.includes('HEINEKEN'),
     containsSuzano:filtered.includes('SUZANO'),htmlBytes:container.innerHTML.length};
  data.searchLatency=await bench(()=>{P.limpar();w.__renderPipeline();},30);
  V.pipelineFiltrar({busca:''});
  w.__activeOp='o0';
  const firstCockpit=w.__renderCockpit('o0');
  data.cockpit={found:firstCockpit.includes('HEINEKEN'),htmlBytes:container.innerHTML.length};
  data.cockpitLatency=await bench(()=>w.__renderCockpit('o0'),30);
  data.tabTimes={};
  for(const tab of ['decisao','historico','tarefas','whatsapp','sinais','email','propostas','produtos','arquivos']){
    data.tabTimes[tab]=await bench(()=>w.__renderAba(tab),15);
  }
  w.__renderCockpit('o1');
  data.suzano={found:container.textContent.includes('SUZANO'),htmlBytes:container.innerHTML.length};
  data.pipelineFilterCount=P.estatisticas();
  return data;
 });
 if(scenario.errors.length)throw Error(scenario.errors.join('\n'));
 assert.ok(report.pipelineFull.titleFound,'pipeline vazio');
 assert.ok(report.search.found&&!report.search.containsSuzano,'busca deveria isolar HEINEKEN');
 assert.ok(report.cockpit.found&&report.suzano.found,'cockpit não abriu');
 return report;
}
async function main(){
 const fixture=seed();
 const server=http.createServer((req,res)=>{
  const m=/^\/(v286|candidate)\/(.*)$/.exec((req.url||'').split('?')[0]);
  if(!m){res.writeHead(404);res.end();return}
  const data=read(m[1],'/'+m[2]);
  if(!data){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':m[2].endsWith('.js')?'text/javascript':m[2].endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store'});
  res.end(data);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const old=await createBrowserScenario(browser,port,'v286',fixture);
  const current=await createBrowserScenario(browser,port,'candidate',fixture);
  const baseline=await measure(old),candidate=await measure(current);
  const result={type:'PERF-11F Playwright Chromium real, HTML e RAF',samples:30,
    reference:'v286 '+BASE,head:process.env.GITHUB_SHA||'local',
    scenario:'dados sintéticos; sem login no CRM/Supabase; app boot substituído por harness',
    baseline,candidate,
    diff:{
      pipelineWorkP95Pct:+((1-candidate.pipelineFullLatency.workP95Ms/baseline.pipelineFullLatency.workP95Ms)*100).toFixed(1),
      searchWorkP95Pct:+((1-candidate.searchLatency.workP95Ms/baseline.searchLatency.workP95Ms)*100).toFixed(1),
      cockpitWorkP95Pct:+((1-candidate.cockpitLatency.workP95Ms/baseline.cockpitLatency.workP95Ms)*100).toFixed(1),
      pipelineFrameP95Pct:+((1-candidate.pipelineFullLatency.frameP95Ms/baseline.pipelineFullLatency.frameP95Ms)*100).toFixed(1)
    }};
  console.log(JSON.stringify(result));
  fs.mkdirSync('perf11f-results',{recursive:true});
  fs.writeFileSync('perf11f-results/browser-metrics.json',JSON.stringify(result,null,2));
  await old.context.close();await current.context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
