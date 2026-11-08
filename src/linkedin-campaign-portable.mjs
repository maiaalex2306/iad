/* LinkedIN Leads — transporte voluntário de campanhas entre navegadores.
 * Sem acesso ao LinkedIn, sem gravação no Store e sem transferência de credenciais.
 * Checkpoint escopado e saneado pelo contrato existente em linkedin-checkpoint.mjs.
 */
import {serializeLinkedInCheckpoint,restoreLinkedInCheckpoint,scopeOfLinkedIn} from './linkedin-checkpoint.mjs';
export const PORTABLE_MAX_ROWS=10000;
export const PORTABLE_MAX_FILE_BYTES=12*1024*1024;
export const PORTABLE_BATCH=100;
const terminal=new Set(['sem_post','descartado','confirmado']);
export async function exportLinkedInCampaign({scope,meta,selected='',readPage}={}){
  if(!meta?.campaign||!scope||typeof readPage!=='function')
    throw Error('Campanha, escopo e paginação obrigatórios');
  const expected=Number(meta.valid);
  if(!Number.isSafeInteger(expected)||expected<1||expected>PORTABLE_MAX_ROWS)
    throw Error('Checkpoint limitado a 10 mil perfis; divida a campanha para transferir');
  const key=scopeOfLinkedIn(scope),rows=[];
  let start=0,previous=-1;
  while(rows.length<expected){
    const part=await readPage(start,PORTABLE_BATCH);
    if(!Array.isArray(part)||!part.length||part.length>PORTABLE_BATCH)
      throw Error('Leitura de fila incompleta: transferência bloqueada');
    for(const row of part){
      if(row?.scope!==key||row?.campaign!==meta.campaign||
         !Number.isSafeInteger(row.linha)||row.linha<=previous)
        throw Error('Fila com escopo, campanha ou ordenação divergente');
      rows.push(row);previous=row.linha;
    }
    if(rows.length>expected)throw Error('Quantidade da fila divergente: transferência bloqueada');
    start=previous+1;
  }
  // Verificar explicitamente também se não existem registros adicionais.
  const extra=await readPage(start,1);
  if(!Array.isArray(extra)||extra.length)
    throw Error('Fila com registros adicionais: transferência bloqueada');
  const serialized=serializeLinkedInCheckpoint({rows,selected,paused:meta.paused,scope});
  if(new TextEncoder().encode(serialized).byteLength>PORTABLE_MAX_FILE_BYTES)
    throw Error('Checkpoint excede 12 MiB; divida a campanha');
  return serialized;
}
export function prepareLinkedInCampaignRestore(text,scope){
  if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>PORTABLE_MAX_FILE_BYTES)
    throw Error('Arquivo de campanha maior que 12 MiB');
  const restored=restoreLinkedInCheckpoint(text,scope);
  const rows=restored.rows.map((row,i)=>({...row,linha:i+1}));
  const selected=rows.find(row=>row.perfil===restored.selected)||null;
  const counts={
    valid:rows.length,
    semPost:rows.filter(row=>row.estado==='sem_post').length,
    descartados:rows.filter(row=>row.estado==='descartado').length,
    curtidas:rows.filter(row=>row.curtidaConfirmada===true).length,
    confirmados:rows.filter(row=>row.estado==='confirmado').length
  };
  return {rows,selected,paused:restored.paused,counts};
}
