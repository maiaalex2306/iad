'use strict';
const crypto=require('node:crypto');
const CRM_ORIGIN='https://www.iadcrm.com.br';
const LINKEDIN_START='https://www.linkedin.com/feed/';
const LINKEDIN_LOGIN='https://www.linkedin.com/login';
function parsedHttps(raw){
  try{
    const url=new URL(String(raw||''));
    if(url.protocol!=='https:'||url.username||url.password)return null;
    return url;
  }catch{return null;}
}
function allowedLinkedIn(raw){
  const url=parsedHttps(raw);
  return !!url&&(/(^|\.)linkedin\.com$/i.test(url.hostname)||url.hostname==='lnkd.in');
}
function allowedCrm(raw){
  const url=parsedHttps(raw);
  return !!url&&url.origin===CRM_ORIGIN;
}
/** O host especializado pode mostrar o site do CRM somente na rota LinkedIN Leads.
 * A autenticação continua sendo responsabilidade do CRM web. */
const LINKEDIN_LEADS_ROUTE=CRM_ORIGIN+'/#/linkedin-leads';
function isFeatureRoute(raw){
  const url=parsedHttps(raw);
  return !!url&&url.origin===CRM_ORIGIN&&url.hash==='#/linkedin-leads';
}
/** Nova sessão em RAM por abertura: sem cookies ou senhas persistentes. */
function newLoginPartition(){
  return 'iadlinkedin-fresh-'+crypto.randomBytes(16).toString('hex');
}
function splitBounds(width,height,ratio=0.44){
  const w=Math.max(980,Math.round(Number(width)||1440));
  const h=Math.max(600,Math.round(Number(height)||900));
  const left=Math.max(420,Math.min(650,Math.round(w*ratio),w-460));
  return {crm:{x:0,y:0,width:left,height:h},linkedin:{x:left,y:0,width:w-left,height:h}};
}
module.exports={CRM_ORIGIN,LINKEDIN_START,LINKEDIN_LOGIN,LINKEDIN_LEADS_ROUTE,allowedLinkedIn,allowedCrm,isFeatureRoute,newLoginPartition,splitBounds};
