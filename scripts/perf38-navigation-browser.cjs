'use strict';
/* PERF-38: jornada de rotas realmente renderizadas no Chromium sintético,
 * sem sessão cloud, URLs externas, leads reais ou dados de usuário. */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const parsed=new URL(req.url,'http://127.0.0.1');
 const rel=decodeURIComponent(parsed.pathname).replace(/^\/+/, '')||'index.html';
 const filename=path.resolve(root,rel);
 if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);return res.end('Not found');}
 if(rel==='src/config.js'){
  res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});
  return res.end("window.IADConfig={supabase:{url:'',chave:''}};window.IADHomologacao=true;window.IAD_RI_ENABLED=true;window.IAD_MARKET_ENABLED=true;window.IADVersao={numero:'v286.81-PERF38-SYNTH',data:'2026-11-06'};");
 }
 res.writeHead(200,{'content-type':mime[path.extname(rel)]||'application/octet-stream','cache-control':'no-store'});
 fs.createReadStream(filename).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1366,height:768},serviceWorkers:'block'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.dismiss());
  await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  await page.goto(origin+'/#/hoje',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.App && window.IADStore && window.IADPerformance && window.IADAuth,{timeout:17000});
  await page.evaluate(()=>{
   const S=window.IADStore,A=window.IADAuth,N=window.IADNuvem,P=window.IADPlaybook;
   N.mandaNoAcesso=()=>false;N.conectado=()=>false;N.configurada=()=>false;
   if(window.IADWhatsapp)window.IADWhatsapp.disponivel=()=>false;
   const e=S.obter(),user={id:'perf38-test',tenantId:'tenant-a',nome:'Test',
    papel:'gestor',ativo:true,login:'test'};
   const day=()=>new Date().toISOString().slice(0,10);
   e.tenants=[{id:'tenant-a',nome:'LABORATORIO'}];e.usuarios=[user];
   e.contas=Array.from({length:200},(_,i)=>({id:'a'+i,nome:'Conta sintética '+i,
    tenantId:'tenant-a',donoId:user.id,segmento:'Químico'}));
   e.contatos=[];e.tarefas=[];e.sinais=[];e.notas=[];e.produtos=[];e.tiposTarefa=[];e.fontes=[];
   e.oportunidades=Array.from({length:250},(_,i)=>({id:'o'+i,contaId:'a'+(i%200),
    tenantId:'tenant-a',donoId:user.id,titulo:'Negócio sintético '+i,
    etapa:'Diagnóstico',valor:10000,criadoEm:day(),fechamentoPrevisto:day(),
    etapaDesde:day(),dims:Object.fromEntries(P.DIMENSOES.map(d=>[d.id,0])),
    stakeholders:[],desfecho:null,itens:[],notas:'Cliente solicitou orçamento para automação de processos.',
    eventos:[],snapshots:[]}));
   A.abrirSessao(user);S.semSincronizar(()=>S.salvar());
   window.IADPerformance.limpar();window.IADPerformance.iniciar();
  });
  /* Primeiro renderizar a sessão sintética; o menu protegido nasce no render.
     Depois, clicar no LINK verdadeiro e verificar o contador imediatamente. */
  await page.evaluate(()=>window.App.ir('#/pipeline'));
  await page.waitForFunction(()=>location.hash==='#/pipeline' &&
    !document.body.classList.contains('sem-sessao') &&
    !!document.querySelector('nav.tabs a[href="#/hoje"]'),null,{timeout:10000});
  const menuAntes=await page.evaluate(()=>
    window.IADPerformance.relatorioDiagnostico()['perf38.nav.hoje']?.chamadas||0);
  await page.locator('nav.tabs a[href="#/hoje"]').click();
  await page.waitForFunction(()=>location.hash==='#/hoje',null,{timeout:10000});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const menuDepois=await page.evaluate(()=>
    window.IADPerformance.relatorioDiagnostico()['perf38.nav.hoje']?.chamadas||0);
  assert.equal(menuDepois,menuAntes+1,'clique real no menu precisa gerar uma amostra');
  const result=await page.evaluate(async()=>{
   const twoFrames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   for(let i=0;i<12;i++){
    window.App.ir('#/pipeline');await twoFrames();await twoFrames();
    window.App.ir('#/hoje');await twoFrames();await twoFrames();
   }
   window.App.ir('#/inteligencia');
   return {report:window.IADPerformance.relatorioDiagnostico(),
      route:location.hash,source:document.getElementById('conteudo').textContent};
  });
  await page.locator('#iad-ri-root .iad-ri-radar-tab[data-radar="pistas"]').waitFor({timeout:17000});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const metrics=await page.evaluate(()=>({metricas:window.IADPerformance.relatorioDiagnostico(),
    json:window.IADPerformance.exportarDiagnosticoJSON(),hash:location.hash}));
  const r=metrics.metricas;
  assert.ok(r['perf38.nav.pipeline']?.chamadas>=12,'navegação App.ir: '+JSON.stringify(r['perf38.nav.pipeline']));
  assert.ok(r['perf38.nav.hoje']?.chamadas>=10,JSON.stringify(r['perf38.nav.hoje']));
  assert.equal(r['perf38.nav.inteligencia']?.chamadas,1,'medir UI após mount lazy');
  assert.equal(metrics.hash,'#/inteligencia');
  assert.doesNotMatch(metrics.json,/perf38-test|Negócio sintético|tenant-a|Conta sintética/);
  assert.ok(!errors.length,'erros JavaScript: '+JSON.stringify(errors.slice(0,4)));
  console.log('PERF38_REAL_JOURNEY_BROWSER_PASS '+JSON.stringify({
   scope:'chromium local sem autenticacao externa nem dados de clientes',
   samplesHoje:r['perf38.nav.hoje'].chamadas,
   samplesPipeline:r['perf38.nav.pipeline'].chamadas,
   samplesInteligencia:r['perf38.nav.inteligencia'].chamadas,
   p95HojeMs:r['perf38.nav.hoje'].p95Ultimas100Ms,
   p95PipelineMs:r['perf38.nav.pipeline'].p95Ultimas100Ms,
   p95InteligenciaMs:r['perf38.nav.inteligencia'].p95Ultimas100Ms,
   noPII:true,noNetwork:true}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error('PERF38_REAL_JOURNEY_BROWSER_FAIL',e.stack);process.exitCode=1;server.close();});
