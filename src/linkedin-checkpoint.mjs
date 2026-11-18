/* Checkpoint portável de campanhas assistidas.
   Exportação voluntária pelo operador: contém dados de leads, posts e rascunhos.
   Não contém senha, sessão, cookies, tokens nem IDs internos do pipeline. */
import {normalizeProfile} from './linkedin-csv.mjs';
const FORMAT='iad-linkedin-checkpoint-v1';
const FIELDS={
  lead:120,cargo:140,empresa:160,resumoPerfil:1200,post:6000,
  comentarioLead:2000,solucao:1200,estilo:20,rascunho:1300,
  fundamento:600,comentarioPublicado:1300,
  perfilAbertoEm:32,semPostEm:32,curtidaConfirmadaEm:32,comentarioConfirmadoEm:32
};
const STATES=new Set(['pendente','perfil_aberto','post_localizado','curtido','rascunho','confirmado','sem_post','erro','descartado']);
const sane=v=>typeof v==='string'?v:'';
export function scopeOfLinkedIn(scope={}){
  return JSON.stringify([String(scope.userId||''),String(scope.tenantId||''),
    String(scope.role||''),String(scope.tenantFilter||''),String(scope.ownerFilter||'')]);
}
function postUrl(raw){
  try{
    const u=new URL(sane(raw).slice(0,600));
    if(u.protocol!=='https:'||!/(^|\.)linkedin\.com$/i.test(u.hostname)||u.username||u.password)return '';
    if(!(/^\/feed\/update\/[^/?#]+/i.test(u.pathname)||/^\/posts\/[^/?#]+/i.test(u.pathname)||/^\/pulse\/[^/?#]+/i.test(u.pathname)))return '';
    u.hash='';return u.href.slice(0,600);
  }catch{return '';}
}
function cleanRow(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const perfil=normalizeProfile(raw.perfil);
  if(!perfil)return null;
  const row={perfil,postUrl:postUrl(raw.postUrl),estado:STATES.has(raw.estado)?raw.estado:'pendente'};
  for(const [k,n] of Object.entries(FIELDS))row[k]=sane(raw[k]).slice(0,n);
  row.curtidaConfirmada=raw.curtidaConfirmada===true&&!!row.postUrl;
  if(row.estado==='sem_post'){row.postUrl='';row.post='';row.curtidaConfirmada=false;}
  if((row.estado==='confirmado'&&!row.curtidaConfirmada)||
     (row.estado==='confirmado'&&row.comentarioPublicado.trim().length<20)||
     (row.estado==='confirmado'&&!row.postUrl))row.estado='rascunho';
  if(row.estado==='curtido'&&!row.curtidaConfirmada)row.estado='post_localizado';
  if((row.estado==='rascunho'||row.estado==='post_localizado')&&!row.postUrl)row.estado='pendente';
  for(const dateKey of ['perfilAbertoEm','semPostEm','curtidaConfirmadaEm','comentarioConfirmadoEm']){
    const value=row[dateKey];
    if(value&&(!Number.isFinite(Date.parse(value))||Date.parse(value)>Date.now()+3600_000))
      row[dateKey]='';
  }
  return row;
}
export function serializeLinkedInCheckpoint({rows=[],selected='',paused=false,scope={}}={}){
  if(!Array.isArray(rows)||rows.length>10000)throw Error('Máximo de 10 mil perfis por checkpoint.');
  const clean=rows.map(cleanRow).filter(Boolean);
  return JSON.stringify({format:FORMAT,scope:scopeOfLinkedIn(scope),
    exportedAt:new Date().toISOString(),rows:clean,
    selected:normalizeProfile(selected)||'',paused:paused===true});
}
export function restoreLinkedInCheckpoint(text,scope={}){
  if(typeof text!=='string'||text.length>12*1024*1024)throw Error('Checkpoint inválido ou maior que 12 MB.');
  let data;try{data=JSON.parse(text);}catch{throw Error('Arquivo JSON de checkpoint inválido.');}
  if(!data||data.format!==FORMAT||!Array.isArray(data.rows))
    throw Error('Arquivo não é um checkpoint LinkedIN Leads v1.');
  if(data.scope!==scopeOfLinkedIn(scope))throw Error('Arquivo de outro usuário, empresa ou filtro. Selecione o mesmo escopo antes de restaurar.');
  if(data.rows.length>10000)throw Error('Arquivo excede 10 mil perfis.');
  const rows=[],seen=new Set();
  for(const raw of data.rows){
    const row=cleanRow(raw);
    if(!row||seen.has(row.perfil))continue;
    rows.push(row);seen.add(row.perfil);
  }
  if(!rows.length)throw Error('Arquivo não contém perfis válidos.');
  const selected=normalizeProfile(data.selected);
  return {rows,selected:rows.some(r=>r.perfil===selected)?selected:'',paused:data.paused===true};
}
