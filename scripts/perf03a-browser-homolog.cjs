/* PERF-03A — Chromium real, homologação SEM Supabase de produção.
   Usuários, tenants e oportunidades exclusivamente sintéticos em memória. */
'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 let safe=path.join(root,pathname==='/'?'index.html':pathname.slice(1));
 if(!safe.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 if(pathname==='/src/config.js'){
   res.writeHead(200,{'content-type':'application/javascript','cache-control':'no-store'});
   res.end("window.IADConfig={supabase:{url:'',chave:''}};window.IADHomologacao=true;window.IADVersao={numero:'v270-HOMOLOG',data:'2026-10-29'};");
   return;
 }
 if(!fs.existsSync(safe)||!fs.statSync(safe).isFile()){res.writeHead(404);res.end('Not found');return;}
 res.writeHead(200,{'content-type':mime[path.extname(safe)]||'application/octet-stream','cache-control':'no-store'});
 fs.createReadStream(safe).pipe(res);
});
function p95(vals){return Math.round([...vals].sort((a,b)=>a-b)[Math.ceil(vals.length*.95)-1]*100)/100;}
function p50(vals){return Math.round([...vals].sort((a,b)=>a-b)[Math.ceil(vals.length*.5)-1]*100)/100;}
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1450,height:900}});
 const jsErrors=[];
 page.on('pageerror',err=>jsErrors.push(err.message));
 page.on('dialog',dlg=>dlg.dismiss());
 await page.route('**/*',route=>{
   if(route.request().url().startsWith(base+'/'))return route.continue();
   return route.abort('blockedbyclient');
 });
 await page.goto(base+'/#/pipeline',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!(window.IADViews&&window.IADStore&&window.IADAuth&&window.IADPlaybook),null,{timeout:15000});
 const rows=[];
 for(const n of [243,1000,5000]){
  const data=await page.evaluate((n)=>{
    const S=window.IADStore,P=window.IADPlaybook,A=window.IADAuth,N=window.IADNuvem;
    N.mandaNoAcesso=()=>false; N.conectado=()=>false;N.configurada=()=>false;
    const W=window.IADWhatsapp;if(W)W.disponivel=()=>false;
    const e=S.obter();
    const uA={id:'perf-a',tenantId:'tenant-a',nome:'Homolog Test A',login:'perf-a',papel:'gestor',ativo:true,emailConfirmado:true};
    const uB={id:'perf-b',tenantId:'tenant-b',nome:'Homolog Test B',login:'perf-b',papel:'usuario',ativo:true,emailConfirmado:true};
    e.usuarios=[uA,uB];e.tenants=[{id:'tenant-a',nome:'HOMOLOG A'},{id:'tenant-b',nome:'HOMOLOG B'}];
    const dia=(d)=>{const x=new Date();x.setDate(x.getDate()+d);return x.toISOString().slice(0,10);};
    e.contas=Array.from({length:Math.max(40,Math.ceil(n/5))},(_,i)=>({
      id:'ca'+i,tenantId:'tenant-a',donoId:'perf-a',nome:'A_EMPRESA_'+i,uf:'SP',cidade:'Campinas'}));
    e.contas.push({id:'cb0',tenantId:'tenant-b',donoId:'perf-b',nome:'B_PRIVADO',uf:'PR',cidade:'Curitiba'});
    e.contatos=Array.from({length:Math.ceil(n/4)},(_,i)=>({id:'p'+i,tenantId:'tenant-a',donoId:'perf-a',contaId:e.contas[i%e.contas.length].id,perfil:'mobilizador',papel:'Champion / Mobilizer',sentimento:'favoravel'}));
    e.oportunidades=Array.from({length:n},(_,i)=>({id:'op'+i,contaId:'ca'+(i%Math.max(40,Math.ceil(n/5))),tenantId:'tenant-a',donoId:'perf-a',
      titulo:'A_NEGOCIO_'+i,valor:10000+i,etapa:i%3?'Diagnóstico':'Proposta',criadoEm:dia(-25),etapaDesde:dia(-12),
      fechamentoPrevisto:dia(35),dims:Object.fromEntries(P.DIMENSOES.map(d=>[d.id,0])),stakeholders:[],eventos:[],desfecho:null}));
    e.oportunidades.push({id:'privado',tenantId:'tenant-b',donoId:'perf-b',contaId:'cb0',titulo:'B_PRIVADO',
      valor:999999,etapa:'Proposta',criadoEm:dia(-25),etapaDesde:dia(-12),
      fechamentoPrevisto:dia(35),dims:Object.fromEntries(P.DIMENSOES.map(d=>[d.id,0])),stakeholders:[],eventos:[]});
    e.tarefas=Array.from({length:n*2},(_,i)=>({id:'t'+i,tenantId:'tenant-a',donoId:'perf-a',oportunidadeId:'op'+(i%n),status:i%3?'aberta':'concluida',vencimento:dia(i%2?-2:10),titulo:'T'+i}));
    e.sinais=[];e.notas=[];e.produtos=[];e.tiposTarefa=[];e.fontes=[];
    A.abrirSessao(uA);
    S.semSincronizar(()=>S.salvar());
    if(window.IADPipelinePerf)window.IADPipelinePerf.limpar();
    const tempo=[];
    for(let i=0;i<6;i++){
      const start=performance.now();
      document.getElementById('conteudo').innerHTML=window.IADViews.pipeline();
      tempo.push(performance.now()-start);
    }
    const items=document.querySelectorAll('#conteudo .lista > button.item').length;
    const conteudo=document.getElementById('conteudo').textContent;
    return {n,ms:tempo.slice(1),firstMs:tempo[0],cards:items,total:window.IADPipelinePerf.estatisticas(),
      visibleA:conteudo.includes('A_NEGOCIO_'),hiddenB:!conteudo.includes('B_PRIVADO'),length:conteudo.length};
  },n);
  if(!data.visibleA || !data.hiddenB || data.cards!==Math.min(48,n))
    throw new Error('Falha na tela/isolamento, N='+n+' '+JSON.stringify(data));
  rows.push({opportunities:n,firstDOMMs:+data.firstMs.toFixed(2),p50DOMMs:p50(data.ms),p95DOMMs:p95(data.ms),
    renderedCards:data.cards,cache:data.total});
  console.log('PERF03A_BROWSER '+JSON.stringify(rows.at(-1)));
 }
 await page.evaluate(()=>{
   window.App.pipelineMais();
 });
 const after=await page.locator('#conteudo .lista > button.item').count();
 if(after!==96)throw new Error('Mostrar mais não trouxe 96 cartões: '+after);
 // Evita abrir qualquer registro da outra empresa, mesmo com IDs falsos.
 const isolation=await page.evaluate(()=>{
   const A=window.IADAuth,S=window.IADStore;
   const ub=S.obter().usuarios.find(x=>x.id==='perf-b');
   A.abrirSessao(ub);
   window.IADViews.conferirSessao(ub.id);
   const html=window.IADViews.pipeline();
   document.getElementById('conteudo').innerHTML=html;
   return {a:html.includes('A_NEGOCIO'),b:html.includes('B_PRIVADO'),
     count:S.dados().oportunidades.length};
 });
 if(isolation.a||!isolation.b||isolation.count!==1)
   throw Error('Isolamento entre tenants falhou '+JSON.stringify(isolation));
 if(jsErrors.length)throw Error('Erros JS: '+JSON.stringify(jsErrors.slice(0,10)));
 fs.mkdirSync(path.join(root,'homolog-artifacts'),{recursive:true});
 fs.writeFileSync(path.join(root,'homolog-artifacts','browser-bench.json'),
   JSON.stringify({environment:'Chromium headless GitHub Actions, Supabase MOCK isolado',runs:rows,showMore:after,
    tenantIsolation:isolation,jsErrors},null,2));
 await page.screenshot({path:path.join(root,'homolog-artifacts','pipeline-b.png'),fullPage:false});
 await browser.close();server.close();
 console.log('PERF03A_BROWSER_DONE');
}
main().catch(e=>{console.error('PERF03A_BROWSER_FAIL '+e.stack);server.close();process.exitCode=1});
