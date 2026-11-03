/* PERF-17: jornada sintetica e isolada, sem rede externa e sem credenciais. */
'use strict';
const fs=require('node:fs'), http=require('node:http'), path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const filename=path.resolve(root,name==='/'?'index.html':name.slice(1));
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  if(name==='/src/config.js'){
    res.writeHead(200,{'content-type':'application/javascript','cache-control':'no-store'});
    return res.end("window.IADConfig={supabase:{url:'',chave:''}};window.IADHomologacao=true;window.IADVersao={numero:'v286.14-PERF17',data:'2026-11-03'};");
  }
  if(!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);return res.end('Not found');}
  res.writeHead(200,{'content-type':mime[path.extname(filename)]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(filename).pipe(res);
});
(async ()=>{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const url='http://127.0.0.1:'+server.address().port+'/';
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1366,height:768},serviceWorkers:'block'});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.dismiss());
  await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
  try{
    await page.goto(url+'#/pipeline',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.IADStore && window.IADPlaybook && window.IADAuth &&
      window.IADViews && window.IADPerformance && window.App,{timeout:16000});
    await page.evaluate(()=>{
      const S=window.IADStore,A=window.IADAuth,N=window.IADNuvem,P=window.IADPlaybook;
      N.mandaNoAcesso=()=>false;N.conectado=()=>false;N.configurada=()=>false;
      const w=window.IADWhatsapp;if(w)w.disponivel=()=>false;
      const e=S.obter();
      const user={id:'homolog-perf17',tenantId:'tenant-a',nome:'Teste',papel:'gestor',ativo:true,login:'teste'};
      e.tenants=[{id:'tenant-a',nome:'HOMOLOG'}];e.usuarios=[user];
      const day=(delta)=>{const d=new Date();d.setDate(d.getDate()+delta);return d.toISOString().slice(0,10);};
      e.contas=Array.from({length:384},(_,i)=>({id:'ca'+i,nome:'Conta '+i,tenantId:'tenant-a',donoId:user.id}));
      e.contatos=[];e.tarefas=[];e.sinais=[];e.notas=[];e.produtos=[];e.tiposTarefa=[];e.fontes=[];
      e.oportunidades=Array.from({length:389},(_,i)=>({
        id:'op'+i,contaId:'ca'+(i%384),tenantId:'tenant-a',donoId:user.id,
        titulo:'Negócio '+i,etapa:'Diagnóstico',valor:10000,criadoEm:day(-60),
        fechamentoPrevisto:day(45),etapaDesde:day(-12),
        dims:Object.fromEntries(P.DIMENSOES.map(d=>[d.id,0])),stakeholders:[],
        eventos:i===0?Array.from({length:150},(_,j)=>({id:'e'+j,tipo:'activity',titulo:'Evento',data:day(-j%20)})):[],
        desfecho:null
      }));
      A.abrirSessao(user);
      S.semSincronizar(()=>S.salvar());
      window.IADPerformance.limpar();
      window.IADPerformance.iniciar();
    });
    const result=await page.evaluate(async()=>{
      const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const P=window.IADPerformance;
      for(let i=0;i<32;i++){
        window.App.ir('#/pipeline');
        await nextFrame();
        window.App.abrir('op'+(i%3));
        await nextFrame();await nextFrame();
      }
      return {relatorio:P.relatorio(true),json:P.exportarJSON(),
        url:location.hash,conteudo:document.getElementById('conteudo').textContent};
    });
    const metric=result.relatorio['perf17.cockpit.clique-a-dois-frames'];
    assert.ok(metric && metric.chamadas>=30, 'faltam amostras reais da navegação sintética: '+JSON.stringify(metric));
    assert.ok(metric.p95Ultimas100Ms>0);
    assert.ok(result.url.startsWith('#/op/'));
    assert.ok(result.conteudo.includes('Negócio'), 'cockpit não apareceu');
    assert.ok(!errors.length,'Erros JS: '+JSON.stringify(errors.slice(0,4)));
    assert.doesNotMatch(result.json,/Negócio|Conta [0-9]|homolog-perf17/);
    console.log('PERF17_BROWSER_PASS '+JSON.stringify({
      samples:metric.chamadas,p50Ms:metric.p50Ultimas100Ms,
      p95Ms:metric.p95Ultimas100Ms,
      etapaHTML:result.relatorio['perf17.cockpit.etapa-html'].p95Ultimas100Ms,
      etapaDOM:result.relatorio['perf17.cockpit.etapa-dom'].p95Ultimas100Ms,
      ambiente:'Chromium headless: 389 oportunidades sintéticas, 150 eventos em card complexo'
    }));
  }finally{await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error('PERF17_BROWSER_FAIL',e.stack);process.exitCode=1;server.close();});
