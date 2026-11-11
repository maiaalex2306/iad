'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const rel=pathname==='/'?'index.html':decodeURIComponent(pathname).replace(/^\/+/,'');
 const name=path.resolve(root,rel);
 if(!name.startsWith(root+path.sep)||!fs.existsSync(name)||!fs.statSync(name).isFile()){res.writeHead(404);res.end('Not found');return;}
 res.writeHead(200,{'content-type':mime[path.extname(name)]||'application/octet-stream','cache-control':'no-store'});
 fs.createReadStream(name).pipe(res);
});
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 let browser;
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.dismiss());
  await page.route('**/*',route=>route.request().url().startsWith(origin+'/')
   ?route.continue():route.abort('blockedbyclient'));
  await page.goto(origin+'/#/hoje',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>!!window.App&&!!window.IADUI&&!!window.IADArquivos&&!!window.IADCarregarOpcional);
  const disk=await page.evaluate(async()=>{
    const Arq=window.IADArquivos;
    const file=new File(['Ata de teste: cliente definiu reunião com compras e solicitou escopo por escrito.'],'ata-fixture.txt',{type:'text/plain'});
    const meta=await Arq.salvar(file,{oportunidadeId:'fixture-opp',tarefaId:'fixture-task',contaId:'fixture-account',categoria:'Ata de reunião'});
    try{
      const r=await Arq.obter(meta.id);
      const text=await r.arquivo.text();
      return {name:r.meta.nome,linked:r.meta.tarefaId==='fixture-task',textOk:text.includes('compras'),size:r.arquivo.size};
    } finally {await Arq.excluir(meta.id);}
  });
  assert.equal(disk.linked,true);
  assert.equal(disk.textOk,true);
  assert.equal(disk.name,'ata-fixture.txt');

  const gate=await page.evaluate(async()=>{
    const U=window.IADUI,Doc=await window.IADCarregarOpcional('IADDocumentos','documentos.js');
    const old=Doc.lerVarios;let release,called=0;
    Doc.lerVarios=()=>new Promise(ok=>release=ok);
    try{
      U.formulario('Teste de ata',[{id:'arquivo',tipo:'file',rotulo:'Ata'}],{},()=>{
        called++;
      },dlg=>U.ligarDocumentos(dlg,'arquivo'));
      const dlg=[...document.querySelectorAll('dialog')].at(-1);
      const input=dlg.querySelector('input[name="arquivo"]'),save=dlg.querySelector('button[value="ok"]');
      const transfer=new DataTransfer();
      const doc=new File(['Cliente declarou que precisa da aprovação do gestor de compras.'],'ata.txt',{type:'text/plain'});
      transfer.items.add(doc);input.files=transfer.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
      const blocked=save.disabled&&dlg.documentosPendentes===true;
      const event=new Event('submit',{bubbles:true,cancelable:true});
      dlg.querySelector('form').dispatchEvent(event);
      const enterGuard=event.defaultPrevented===true;
      release([{nome:'ata.txt',texto:'Cliente declarou que precisa da aprovação do gestor de compras.',arquivo:doc,tamanho:doc.size,erro:''}]);
      await new Promise(r=>setTimeout(r,60));
      const loaded=!save.disabled&&!dlg.documentosPendentes&&dlg.documentosIA.length===1;
      dlg.close('cancelar');dlg.remove();
      return {blocked,enterGuard,loaded,called};
    } finally {Doc.lerVarios=old;}
  });
  assert.equal(gate.blocked,true,'Salvar bloqueado durante leitura');
  assert.equal(gate.enterGuard,true,'Enter não encerra formulário sem arquivo pronto');
  assert.equal(gate.loaded,true,'Leitura concluída habilita Salvar e entrega docs');
  assert.equal(gate.called,0,'Nenhuma gravação implícita');

  const replay=await page.evaluate(async()=>{
    const S=window.IADStore,A=window.App,Arq=window.IADArquivos,UI=window.IADUI,IA=window.IADIA;
    const D=await window.IADCarregarOpcional('IADDocumentos','documentos.js');
    const saved={tarefa:S.tarefa,oportunidade:S.oportunidade,listar:Arq.listar,obter:Arq.obter,ler:D.lerVarios,confirmar:UI.confirmar,disponivel:IA.disponivel,process:A.processarReuniao,alert:window.alert};
    const msgs=[];let calls=0,last=null,invalidCalls=0;
    const task={id:'test-task',oportunidadeId:'test-opp',tipo:'Reunião',titulo:'Ata sintética',descricao:'',decisaoAlvo:'problema',concluidaEm:'2026-11-11'};
    const op={id:'test-opp',contaId:'test-account',eventos:[]};
    const file=new File(['Cliente confirmou prioridade e pediu reunião com compras para novembro.'],'meeting.txt',{type:'text/plain'});
    try{
      S.tarefa=id=>id==='test-task'?task:null;
      S.oportunidade=id=>id==='test-opp'?op:null;
      Arq.listar=()=>Promise.resolve([{id:'meta-a',nome:'meeting.txt',oportunidadeId:'test-opp',tarefaId:'test-task',data:'2026-11-11',categoria:'Ata de reunião'}]);
      Arq.obter=()=>Promise.resolve({meta:{id:'meta-a',oportunidadeId:'test-opp',tarefaId:'test-task'},arquivo:file});
      UI.confirmar=()=>true;
      IA.disponivel=()=>true;
      D.lerVarios=()=>Promise.resolve([{nome:'meeting.txt',texto:'O cliente confirmou prioridade e pediu reunião com compras para novembro, com prazo definido.',arquivo:file,erro:''}]);
      A.processarReuniao=(id,text,reler,docs,done)=>{calls++;last={id,text,reler,docs:docs.length};if(done)done(true);};
      window.alert=msg=>msgs.push(msg);
      A.reanalisarAtaTarefa('test-task');
      await new Promise(r=>setTimeout(r,80));
      // Mesmo ID de arquivo, mas meta de outra oportunidade: falha fechada.
      Arq.obter=()=>Promise.resolve({meta:{id:'meta-a',oportunidadeId:'different',tarefaId:'test-task'},arquivo:file});
      A.reanalisarAtaTarefa('test-task');
      await new Promise(r=>setTimeout(r,80));
      invalidCalls=calls;
      return {calls,valid:last?.id==='test-opp'&&last?.text.includes('cliente confirmou prioridade')&&last?.docs===0,invalidCalls,warning:msgs.some(x=>x.includes('não pertence'))};
    } finally {
      S.tarefa=saved.tarefa;S.oportunidade=saved.oportunidade;Arq.listar=saved.listar;
      Arq.obter=saved.obter;D.lerVarios=saved.ler;UI.confirmar=saved.confirmar;
      IA.disponivel=saved.disponivel;A.processarReuniao=saved.process;window.alert=saved.alert;
    }
  });
  assert.equal(replay.calls,1,'Uma análise para arquivo autorizado');
  assert.equal(replay.valid,true,'Análise recebe só texto da ata da oportunidade certa');
  assert.equal(replay.invalidCalls,1,'Arquivo fora do escopo rejeitado');
  assert.equal(replay.warning,true,'Erro explícito de escopo');
  assert.deepEqual(errors,[],'sem erros JavaScript não tratados');
  console.log('ATA_P0_CHROMIUM_PASS '+JSON.stringify({disk,gate,replay,version:'v286.100'}));
 } finally {if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
})().catch(e=>{console.error('ATA_P0_CHROMIUM_FAIL',e);process.exitCode=1;});
