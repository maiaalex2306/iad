'use strict';
const crypto=require('node:crypto');
const CRM_ORIGIN='https://www.iadcrm.com.br';
const LINKEDIN_START='https://www.linkedin.com/feed/';
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
function profilePartition(profile='default'){
  const normalized=String(profile||'default').slice(0,256);
  const digest=crypto.createHash('sha256').update(normalized).digest('hex').slice(0,20);
  return 'persist:iadlinkedin-'+digest;
}
function splitBounds(width,height,ratio=0.44){
  const w=Math.max(980,Math.round(Number(width)||1440));
  const h=Math.max(600,Math.round(Number(height)||900));
  const left=Math.max(420,Math.min(650,Math.round(w*ratio),w-460));
  return {crm:{x:0,y:0,width:left,height:h},linkedin:{x:left,y:0,width:w-left,height:h}};
}
module.exports={CRM_ORIGIN,LINKEDIN_START,allowedLinkedIn,allowedCrm,profilePartition,splitBounds};
