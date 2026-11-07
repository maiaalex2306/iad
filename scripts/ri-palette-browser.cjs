'use strict';
/* Chromium computed-style parity: ACP design tokens in light and dark mode.
   Fixture is synthetic, with no CRM session, network, or customer content. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=path.join(__dirname,'..');
const cssFile=f=>fs.readFileSync(path.join(base,f),'utf8');
function rgb(hex) {
 const h=hex.replace('#','').trim();
 if(!/^[0-9a-f]{6}$/i.test(h)) throw Error('Invalid palette token '+hex);
 return 'rgb('+[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')+')';
}
function luminance(c){
 const values=(c.match(/[0-9.]+/g)||[]).slice(0,3).map(Number);
 if(values.length!==3)throw Error('Unsupported computed CSS color '+c);
 const comps=values.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)});
 return .2126*comps[0]+.7152*comps[1]+.0722*comps[2];
}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
async function run(){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.setContent(`<!doctype html><html data-tema="claro"><head><meta charset="utf-8"></head><body>
<div id="iad-ri-root" class="iad-ri-workspace">
 <header class="iad-ri-hero"><div class="iad-ri-hero-copy"><span class="iad-ri-eyebrow">INTELIGÊNCIA COMERCIAL</span><h2 class="iad-ri-headline">Próximas oportunidades</h2><p class="iad-ri-hero-subtitle">Análise da carteira interna</p></div></header>
 <div class="iad-ri-signals"><div class="iad-ri-signal attention">Alerta</div></div>
 <div class="iad-ri-kpi-feature">Indicador</div>
 <div class="iad-ri-diagnosis"><span class="iad-ri-eyebrow">Diagnóstico</span></div>
 <div class="iad-ri-stage-track"><div class="iad-ri-stage-bar"> </div></div>
 <button class="iad-ri-primary-small">Analisar</button>
 <a href="#" class="iad-ri-link">Abrir conta</a>
 <a href="#" class="iad-ri-radar-source">Ver evidência</a>
 <button class="iad-ri-radar-tab active">Selecionado</button>
 <span class="iad-ri-radar-status">Em análise</span>
</div>
<section class="iad-market-ui"><h2>INTELIGÊNCIA DE MERCADO</h2><form><div class="iad-market-action-buttons"><button class="btn iad-market-btn-search">Pesquisar</button></div></form><div class="iad-market-progress-dialog">Progresso da pesquisa</div></section>
</body></html>`);
  await page.addStyleTag({content:cssFile('assets/styles.css')});
  await page.addStyleTag({content:cssFile('assets/paleta-acp.css')});
  await page.addStyleTag({content:cssFile('assets/ri-commercial.css')});
  for(const [theme,vars] of [
   ['claro',{brand:'#6816A8',brandDark:'#4A1078',brandSurface:'#4A1078',brandSurface2:'#6816A8',soft:'#F3ECFA',risk:'#B4530C'}],
   ['escuro',{brand:'#C9A0F0',brandDark:'#E0C6FA',brandSurface:'#3A0C60',brandSurface2:'#571291',soft:'#2A1B3D',risk:'#C4703C'}]
  ]){
   await page.evaluate(mode=>document.documentElement.setAttribute('data-tema',mode),theme);
   const d=await page.evaluate(()=>{
    const get=selector=>getComputedStyle(document.querySelector(selector));
    return {
     hero:get('.iad-ri-hero').backgroundImage,
     heroText:get('.iad-ri-headline').color,
     primaryBG:get('.iad-ri-primary-small').backgroundColor,
     primaryText:get('.iad-ri-primary-small').color,
     link:get('.iad-ri-link').color,
     source:get('.iad-ri-radar-source').color,
     stage:get('.iad-ri-stage-bar').backgroundColor,
     tab:get('.iad-ri-radar-tab.active').backgroundColor,
     status:get('.iad-ri-radar-status').color,
     statusBG:get('.iad-ri-radar-status').backgroundColor,
     alert:get('.iad-ri-signal.attention').borderLeftColor,
     marketTitle:get('.iad-market-ui > h2').color,
     marketButton:get('.iad-market-btn-search').backgroundColor,
     marketButtonText:get('.iad-market-btn-search').color,
     marketProgress:get('.iad-market-progress-dialog').backgroundColor
    };
   });
   assert.ok(d.hero.startsWith('linear-gradient('),theme+' hero must have institutional gradient');
   assert.ok(d.hero.includes(rgb(vars.brandSurface)),theme+' dark institutional start');
   assert.ok(d.hero.includes(rgb(vars.brandSurface2)),theme+' dark institutional end');
   assert.equal(d.primaryBG,rgb(vars.brandSurface),theme+' CTA background');
   assert.equal(d.link,rgb(vars.brand),theme+' account link adapts to theme');
   assert.equal(d.source,rgb(vars.brand),theme+' evidence link adapts to theme');
   assert.equal(d.stage,rgb(vars.brand),theme+' stage uses ACP palette');
   assert.equal(d.tab,rgb(vars.soft),theme+' tab selected');
   assert.equal(d.status,rgb(vars.brandDark),theme+' radar status text');
   assert.equal(d.statusBG,rgb(vars.soft),theme+' radar status surface');
   assert.equal(d.alert,rgb(vars.risk),theme+' risk color must remain semantic');
   assert.equal(d.marketTitle,rgb(vars.brandDark),theme+' market title');
   assert.equal(d.marketButton,rgb(vars.brandSurface),theme+' market search action');
   assert.ok(contrast(d.primaryText,d.primaryBG)>=4.5,theme+' commercial CTA WCAG contrast');
   assert.ok(contrast(d.marketButtonText,d.marketButton)>=4.5,theme+' market CTA WCAG contrast');
   assert.ok(contrast(d.heroText,rgb(vars.brandSurface2))>=4.5,theme+' hero title minimum contrast');
   console.log('RI_PALETTE_BROWSER_PASS '+JSON.stringify({theme,brand:d.stage,hero:d.hero,commercialCta:d.primaryBG,marketCta:d.marketButton,contrastCommercial:+contrast(d.primaryText,d.primaryBG).toFixed(2)}));
  }
 }finally{await browser.close()}
}
run().catch(e=>{console.error('RI_PALETTE_BROWSER_FAIL '+e.stack);process.exitCode=1});
