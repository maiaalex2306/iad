'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {allowedLinkedIn,allowedCrm,isFeatureRoute,profilePartition,splitBounds,CRM_ORIGIN,LINKEDIN_LEADS_ROUTE}=require('../security.cjs');
test('HTTPS LinkedIn real é permitido e host malicioso é barrado',()=>{
  assert.equal(allowedLinkedIn('https://www.linkedin.com/login'),true);
  assert.equal(allowedLinkedIn('https://www.linkedin.com/feed/'),true);
  assert.equal(allowedLinkedIn('https://evil.com/linkedin.com'),false);
  assert.equal(allowedLinkedIn('https://linkedin.com.attacker.org/'),false);
  assert.equal(allowedLinkedIn('javascript:alert(1)'),false);
  assert.equal(allowedLinkedIn('http://www.linkedin.com/feed'),false);
  assert.equal(allowedLinkedIn('https://attacker@linkedin.com/feed'),false);
});
test('CRM tem origem exata e não permite saltar para outro site',()=>{
  assert.equal(allowedCrm(CRM_ORIGIN+'/#/linkedin-leads'),true);
  assert.equal(allowedCrm('https://www.iadcrm.com.br.attacker.org'),false);
  assert.equal(allowedCrm('http://www.iadcrm.com.br/'),false);
});
test('Sessão Linkedin isolada por perfil',()=>{
  assert.match(profilePartition('alice'),/^persist:iadlinkedin-/);
  assert.notEqual(profilePartition('alice'),profilePartition('bob'));
  assert.equal(profilePartition('alice'),profilePartition('alice'));
  assert.ok(!profilePartition('../alice').includes('../'));
});
test('Layout permite LinkedIn e CRM no mesmo desktop',()=>{
  const a=splitBounds(1480,900);
  assert.equal(a.crm.width+a.linkedin.width,1480);
  assert.equal(a.crm.height,a.linkedin.height);
  assert.equal(a.linkedin.x,a.crm.width);
  assert.ok(a.crm.width>=420 && a.linkedin.width>=460);
  const b=splitBounds(980,600);
  assert.equal(b.crm.width+b.linkedin.width,980);
});
test('Shell desktop mantém isolamento remoto sem injeção/scraping',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8');
  assert.match(source,/new WebContentsView/);
  assert.match(source,/new BaseWindow/);
  assert.match(source,/nodeIntegration:false/);
  assert.match(source,/contextIsolation:true/);
  assert.match(source,/sandbox:true/);
  assert.match(source,/webSecurity:true/);
  assert.match(source,/setWindowOpenHandler/);
  assert.match(source,/will-navigate/);
  assert.doesNotMatch(source,/executeJavaScript|insertCSS|setUserAgent|webSecurity:false|--disable-web-security|li_at/);
  assert.ok(!/https:\/\/www.linkedin.com\/login.*password/i.test(source));
});

test('Shell nativo somente LinkedIN Leads, CRM geral permanece web',()=>{
  assert.equal(isFeatureRoute(LINKEDIN_LEADS_ROUTE),true);
  assert.equal(isFeatureRoute(CRM_ORIGIN+'/#/hoje'),false);
  assert.equal(isFeatureRoute(CRM_ORIGIN+'/#/pipeline'),false);
  assert.equal(isFeatureRoute('https://evil.com/#/linkedin-leads'),false);
  const source=fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8');
  assert.match(source,/did-navigate-in-page/);
  assert.match(source,/isFeatureRoute\(url\)/);
  assert.match(source,/loadURL\(LINKEDIN_LEADS_ROUTE\)/);
  assert.match(source,/title:'LinkedIN Leads — IaD CRM'/);
  assert.doesNotMatch(source,/title:'IaD CRM Desktop/);
  assert.doesNotMatch(source,/crm\.webContents\.loadURL\(CRM_ORIGIN\+'\/#\/hoje'\)/);
});

test('Voltar ao CRM web encerra somente o host especializado',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8');
  assert.match(source,/Voltar ao IaD CRM web/);
  assert.match(source,/shell\.openExternal\(CRM_ORIGIN\+'\/#\/hoje'\)/);
  assert.match(source,/win\.close\(\)/);
  assert.match(source,/LINKEDIN_LEADS_ROUTE/);
});
