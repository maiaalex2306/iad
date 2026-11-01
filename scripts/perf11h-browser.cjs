'use strict';
/* PERF-11H — isolated Chromium integration tests for browser IndexedDB and
 * local Store authorization. NEVER opens CRM production, Supabase, or reads secrets.
 * This does not replace authenticated E2E / backend RLS checks. */
const fs=require('node:fs');
const http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const html={
 '/v1':'<!doctype html><meta charset="utf-8"><title>v1 archive</title>',
 '/app':'<!doctype html><meta charset="utf-8"><title>v2 archive</title><script>window.IADStore={uid:()=>"new-archive",hoje:()=>"2026-11-01"}</script><script src="/src/arquivos.js"></script>',
 '/roles':'<!doctype html><meta charset="utf-8"><title>Authorization fixture</title><script>window.IADNuvem={mandaNoAcesso:()=>false}</script><script src="/src/playbook.js"></script><script src="/src/store.js"></script><script src="/src/auth.js"></script>',
 '/upgrade':'<!doctype html><meta charset="utf-8"><title>versionchange</title>'
};
async function startServer(){
 const server=http.createServer((req,res)=>{
  const uri=String(req.url||'').split('?')[0];
  if(Object.hasOwn(html,uri)){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
   res.end(html[uri]);return;
  }
  if(['/src/arquivos.js','/src/playbook.js','/src/store.js','/src/auth.js'].includes(uri)){
   res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});
   res.end(fs.readFileSync('.'+uri));return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,url:'http://127.0.0.1:'+server.address().port};
}
async function idb(browser,url){
 const context=await browser.newContext({serviceWorkers:'block'});
 const p1=await context.newPage(),p2=await context.newPage();
 const errors=[];
 for(const p of [p1,p2])p.on('pageerror',e=>errors.push(e.message));
 await p1.goto(url+'/v1');await p2.goto(url+'/app');
 const seed=await p1.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{
   const req=indexedDB.open('iad-crm-arquivos',1);
   req.onupgradeneeded=()=>{
     const meta=req.result.createObjectStore('meta',{keyPath:'id'});
     meta.createIndex('oportunidadeId','oportunidadeId',{unique:false});
     req.result.createObjectStore('dados',{keyPath:'id'});
   };
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  window.__v1Db=db; // Intentionally hold first-tab connection open
  const rows=[
   {id:'a',nome:'ata.txt',mime:'text/plain',tamanho:15,data:'2026-10-01',oportunidadeId:'o1',contaId:'c1',tarefaId:'t1'},
   {id:'b',nome:'proposta.txt',mime:'text/plain',tamanho:19,data:'2026-10-03',oportunidadeId:'o1',contaId:'c1',tarefaId:'t2'},
   {id:'c',nome:'contrato.txt',mime:'text/plain',tamanho:22,data:'2026-10-04',oportunidadeId:'o2',contaId:'c2',tarefaId:'t2'}
  ];
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(['meta','dados'],'readwrite');
    rows.forEach((r,i)=>{
      tx.objectStore('meta').put(r);
      tx.objectStore('dados').put({id:r.id,blob:new Blob(['documento original '+r.id],{type:'text/plain'})});
    });
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
  return {records:rows.length,names:rows.map(x=>x.nome)};
 });
 // Real multi-tab blocked upgrade: v1 connection prevents v2.
 const blocked=await p2.evaluate(async()=>{
  try{
   await Promise.race([
    window.IADArquivos.listar('o1'),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('blocked timeout')),7000))
   ]);
   return {failed:false};
  }catch(e){return {failed:true,message:String(e.message)};}
 });
 assert.equal(blocked.failed,true,'v1 tab should block v2 upgrade');
 assert.match(blocked.message,/Feche outras abas/);
 await p1.evaluate(()=>{window.__v1Db.close();window.__v1Db=null;});
 const upgraded=await p2.evaluate(async()=>{
  const A=window.IADArquivos;
  const all=await A.listar({}),byOpp=await A.listar('o1'),
    byAccount=await A.listar({contaId:'c1'}),byTask=await A.listar({tarefaId:'t2'});
  const usage=await A.uso();
  const inspect=await new Promise((resolve,reject)=>{
   const req=indexedDB.open('iad-crm-arquivos',2);
   req.onerror=()=>reject(req.error);
   req.onsuccess=()=>{
     const db=req.result;
     const tx=db.transaction(['meta','dados'],'readonly');
     const indexes=Array.from(tx.objectStore('meta').indexNames).sort();
     const blobRequest=tx.objectStore('dados').get('a');
     blobRequest.onsuccess=async()=>{
       const saved=blobRequest.result;
       resolve({indexes,content:await saved.blob.text(),
         size:saved.blob.size,metaStore:true});
       db.close();
     };
     blobRequest.onerror=()=>reject(blobRequest.error);
   };
  });
  return {all:all.map(x=>x.id).sort(),op:byOpp.map(x=>x.id).sort(),
    account:byAccount.map(x=>x.id).sort(),task:byTask.map(x=>x.id).sort(),
    usage,inspect};
 });
 assert.deepEqual(upgraded.all,['a','b','c']);
 assert.deepEqual(upgraded.op,['a','b']);
 assert.deepEqual(upgraded.account,['a','b']);
 assert.deepEqual(upgraded.task,['b','c']);
 assert.deepEqual(upgraded.inspect.indexes,['contaId','oportunidadeId','tarefaId']);
 assert.equal(upgraded.inspect.content,'documento original a');
 assert.equal(upgraded.usage.quantidade,3);
 assert.equal(upgraded.usage.bytes,56);
 await context.setOffline(true);
 const offline=await p2.evaluate(async()=>{
  const A=window.IADArquivos;
  const before=await A.listar('o1');
  const moved=await A.repontar('o1','o3');
  const after=await A.listar('o3');
  const one=await A.salvar(new File(['novo documento offline'],'novo.txt',
    {type:'text/plain'}),{oportunidadeId:'o3',contaId:'c1',tarefaId:'t5'});
  const found=(await A.listar({tarefaId:'t5'})).map(x=>x.id);
  await A.excluir(one.id);
  const clean=await A.listar({tarefaId:'t5'});
  return {before:before.length,moved,after:after.map(x=>x.id).sort(),
    found,clean:clean.length,usage:await A.uso()};
 });
 assert.equal(offline.before,2);
 assert.equal(offline.moved,2);
 assert.deepEqual(offline.after,['a','b']);
 assert.deepEqual(offline.found,['new-archive']);
 assert.equal(offline.clean,0);
 assert.equal(offline.usage.quantidade,3);
 await context.setOffline(false);
 const p3=await context.newPage();
 await p3.goto(url+'/upgrade');
 const versionchange=await p3.evaluate(async()=>{
  return await Promise.race([
    new Promise((resolve,reject)=>{
      const r=indexedDB.open('iad-crm-arquivos',3);
      r.onupgradeneeded=()=>{};
      r.onerror=()=>reject(r.error);
      r.onblocked=()=>reject(new Error('v2 onversionchange did not close'));
      r.onsuccess=()=>{const v=r.result.version;r.result.close();resolve(v);};
    }),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('versionchange timeout')),7000))
  ]);
 });
 assert.equal(versionchange,3,'v2 script must close stale connection on versionchange');
 assert.deepEqual(errors,[],'browser JavaScript errors');
 await context.close();
 return {seed,blocked,upgraded,offline,versionchange,errors};
}
async function roles(browser,url){
 const context=await browser.newContext({serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/roles');
 const r=await page.evaluate(()=>{
  const S=window.IADStore,A=window.IADAuth;
  if(!S||!A)throw Error('real Auth/Store not loaded');
  const data=S.estadoVazio();
  data.tenants=[{id:'A',nome:'Empresa A'},{id:'B',nome:'Empresa B'}];
  data.usuarios=[
    {id:'admin',papel:'admin',tenantId:'A',ativo:true},
    {id:'gestor',papel:'gestor',tenantId:'A',ativo:true},
    {id:'sellerA',papel:'vendedor',tenantId:'A',ativo:true},
    {id:'sellerB',papel:'vendedor',tenantId:'A',ativo:true},
    {id:'sellerX',papel:'vendedor',tenantId:'B',ativo:true}
  ];
  data.contas=[
    {id:'ca',tenantId:'A',donoId:'sellerA',nome:'A pessoal'},
    {id:'cb',tenantId:'A',donoId:'sellerB',nome:'A outro'},
    {id:'cu',tenantId:'A',donoId:null,nome:'A sem dono'},
    {id:'cx',tenantId:'B',donoId:'sellerX',nome:'B comercial'}
  ];
  data.oportunidades=data.contas.map((c,i)=>({
    id:'o'+i,tenantId:c.tenantId,contaId:c.id,donoId:c.donoId,
    titulo:c.nome,etapa:'Diagnóstico',dims:{},eventos:[],snapshots:[],stakeholders:[]
  }));
  data.tarefas=data.oportunidades.map((o,i)=>({
    id:'t'+i,tenantId:o.tenantId,donoId:o.donoId,oportunidadeId:o.id,
    status:'aberta',vencimento:'2026-11-03'
  }));
  S.substituir(data);
  const snapshot=(user,tenant,owner)=>{
    A.abrirSessao(data.usuarios.find(u=>u.id===user));
    if(user==='admin'&&(tenant||owner))
      A.definirFiltros({tenant:tenant||'todas',usuario:owner||'todos'});
    const visible=S.dados();
    return {ops:visible.oportunidades.map(x=>x.id).sort(),
      tasks:visible.tarefas.map(x=>x.id).sort(),
      tenants:visible.contas.map(x=>x.tenantId).sort()};
  };
  const seller=snapshot('sellerA'),gestor=snapshot('gestor'),
    outsider=snapshot('sellerX'),all=snapshot('admin'),
    adminA=snapshot('admin','A'),adminAOwner=snapshot('admin','A','sellerB');
  A.encerrarSessao();
  const noLogin=S.dados().oportunidades.length;
  return {seller,gestor,outsider,all,adminA,adminAOwner,noLogin};
 });
 assert.deepEqual(r.seller.ops,['o0','o2']);
 assert.deepEqual(r.gestor.ops,['o0','o1','o2']);
 assert.deepEqual(r.outsider.ops,['o3']);
 assert.deepEqual(r.all.ops,['o0','o1','o2','o3']);
 assert.deepEqual(r.adminA.ops,['o0','o1','o2']);
 assert.deepEqual(r.adminAOwner.ops,['o1']);
 assert.equal(r.noLogin,0);
 assert.deepEqual(errors,[]);
 await context.close();
 return {profiles:Object.fromEntries(Object.entries(r).map(([k,v])=>[k,typeof v==='object'?v.ops:v])),errors};
}
async function main(){
 const {server,url}=await startServer();
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const report={
   type:'PERF-11H Chromium real: IndexedDB migration and local permissions',
   environment:'synthetic data, localhost only; NO auth Supabase/RLS proof',
   indexedDB:await idb(browser,url),
   visibility:await roles(browser,url)
  };
  fs.mkdirSync('perf11h-results',{recursive:true});
  fs.writeFileSync('perf11h-results/report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:'PASS',
    idb:{records:report.indexedDB.seed.records,blockedV1:report.indexedDB.blocked.failed,
      indexes:report.indexedDB.upgraded.inspect.indexes,
      preservedData:report.indexedDB.upgraded.inspect.content,
      offlineRepointer:report.indexedDB.offline.moved,
      versionchange:report.indexedDB.versionchange},
    visibility:report.visibility.profiles}));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e.stack||String(e));process.exitCode=1;});
