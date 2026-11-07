'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const moduleUrl='data:text/javascript;base64,'+fs.readFileSync(path.join(root,'src/ri/market-progress.mjs')).toString('base64');
const style=fs.readFileSync(path.join(root,'assets/paleta-acp.css'),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:800,height:700}});
  await page.setContent('<!doctype html><html data-tema="claro"><body><main id="host"></main></body></html>');
  await page.addStyleTag({content:style});
  await page.evaluate(async src=>{
   const {mountMarketSearchProgress}=await import(src);
   window.__progress=mountMarketSearchProgress({doc:document,host:document.getElementById('host')});
   window.__progress.start('ChatGPT e Claude');window.__progress.waiting();
  },moduleUrl);
  for(const tema of ['claro','escuro']){
   await page.evaluate(v=>document.documentElement.setAttribute('data-tema',v),tema);
   const m=await page.evaluate(()=>{
    const track=document.querySelector('.iad-market-progress-track');
    const fill=document.querySelector('.iad-market-progress-fill');
    const progress=document.querySelector('progress');
    const test=document.createElement('span');test.style.background='var(--acp-accent)';document.body.append(test);
    const out={trackHidden:track.hidden,trackState:track.getAttribute('data-state'),
     barHasValue:progress.hasAttribute('value'),background:getComputedStyle(fill).backgroundColor,
     accent:getComputedStyle(test).backgroundColor,
     running:getComputedStyle(fill).animationName,
     described:document.querySelector('.iad-market-progress-note').textContent};
    test.remove();return out;
   });
   assert.equal(m.trackHidden,false);
   assert.equal(m.trackState,'running');
   assert.equal(m.barHasValue,false,'No invented percentage');
   assert.equal(m.background,m.accent,'Orange must match ACP token');
   assert.equal(m.running,'iad-market-progress-grow');
   assert.match(m.described,/não um percentual medido/i);
   console.log('MARKET_ORANGE_PROGRESS_BROWSER_PASS '+JSON.stringify({tema,fill:m.background,animation:m.running}));
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.iad-market-progress-fill').evaluate(n=>getComputedStyle(n).animationName),'none');
  await page.evaluate(()=>window.__progress.finish({count:4}));
  const finished=await page.evaluate(()=>({
   state:document.querySelector('.iad-market-progress-track').getAttribute('data-state'),
   barHidden:document.querySelector('progress').hidden,
   transform:getComputedStyle(document.querySelector('.iad-market-progress-fill')).transform,
   title:document.querySelector('.iad-market-progress-title').textContent
  }));
  assert.equal(finished.state,'done');assert.equal(finished.barHidden,true);
  assert.match(finished.title,/concluída/i);
  await page.evaluate(()=>window.__progress.dispose());
 }finally{await browser.close();}
})().catch(e=>{console.error('MARKET_ORANGE_PROGRESS_BROWSER_FAIL '+e.stack);process.exitCode=1});
