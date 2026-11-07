/* RI-M24A — Plano explícito de descoberta externa por município e família.
 * Sem pesquisas no boot e sem modificação da carteira do CRM.
 * Cada célula requer um clique e uma reserva de cota feita pelo backend. */
import {isReviewableSourceURL} from './market-contract.mjs';
export const AUTOMOTIVE_BATCH_FAMILY_COUNT=18;
const clean=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function isAutomotiveUmbrella(filters){
 const values=[...(Array.isArray(filters?.segmentos)?filters.segmentos:[]),filters?.segmento].filter(Boolean);
 return values.some(s=>/automotivo|mobilidade/.test(clean(s)));
}
export function buildMarketBatchPlan(filters){
 if(!isAutomotiveUmbrella(filters)||(Array.isArray(filters?.segmentos)&&filters.segmentos.length!==1))return [];
 const cities=Array.isArray(filters?.municipios)?filters.municipios:[];
 if(cities.length<1||cities.length>15)return [];
 const seen=new Set(),out=[];
 for(const city of cities){
  const code=String(city?.codigoIBGE??'');
  const name=String(city?.nome??'').trim();
  const state=String(city?.uf??'').toUpperCase();
  if(!/^\d{7}$/.test(code)||!name||state!==filters.uf||seen.has(code))continue;
  seen.add(code);
  for(let familyIndex=0;familyIndex<AUTOMOTIVE_BATCH_FAMILY_COUNT;familyIndex++)
   out.push({municipioIBGE:code,municipio:name,uf:state,familyIndex});
 }
 return out;
}
function candidateKey(c){
 const cnpj=String(c?.cnpj??'').replace(/\D/g,'');
 if(cnpj.length===14)return 'cnpj:'+cnpj;
 const name=clean(c?.nome||c?.razaoSocial).replace(/[^a-z0-9]/g,'');
 const city=clean(c?.cidade).replace(/[^a-z0-9]/g,'');
 return name.length>=4&&city?'pending:'+name+'|'+city+'|'+String(c?.uf??'').toUpperCase():null;
}
export function mergeMarketBatchCandidates(previous=[],incoming=[]){
 const result=[],known=new Map();
 const add=c=>{
  if(!c||typeof c!=='object')return;
  const key=candidateKey(c);
  if(!key)return;
  const idx=known.get(key);
  if(idx===undefined){
   known.set(key,result.length);
   result.push({...c,
    fontes:(Array.isArray(c.fontes)?c.fontes:[]).filter(x=>isReviewableSourceURL(x?.url)).slice(0,15),
    fontesConsultadas:(Array.isArray(c.fontesConsultadas)?c.fontesConsultadas:[])
     .filter(x=>isReviewableSourceURL(x?.url)).slice(0,10)});
   return;
  }
  const first=result[idx];
  // Não confundir dois CNPJs diferentes nem inventar corroboracão.
  const sources=new Map();
  for(const src of [...(first.fontes||[]),...(c.fontes||[])]){
   if(src&&isReviewableSourceURL(src.url))sources.set(src.url,src);
  }
  const consulted=new Map();
  for(const src of [...(first.fontesConsultadas||[]),...(c.fontesConsultadas||[])]){
   if(src&&isReviewableSourceURL(src.url))consulted.set(src.url,src);
  }
  result[idx]={...first,
   fontes:[...sources.values()].slice(0,15),
   fontesConsultadas:[...consulted.values()].slice(0,10),
   providers:[...new Set([...(first.providers||[]),...(c.providers||[])])],
   // É sempre necessário manter o status pendente quando uma fonte não
   // verificou independentemente a identidade ou porte.
   fonteStatus:sources.size?'citada_pelo_provedor':first.fonteStatus||c.fonteStatus||'pendente_sem_fonte',
   conflitos:[...(first.conflitos||[]),...(c.conflitos||[])].slice(0,12)};
 };
 for(const c of previous)add(c);
 for(const c of incoming)add(c);
 return result;
}
