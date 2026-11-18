/* RI-46 — estado de triagem das pistas, gravado no histórico já sincronizado
 * da oportunidade. Não cria tabela/coluna, não apaga evidências nem altera etapa.
 * O último evento de triagem prevalece; operações são explícitas e auditáveis.
 */
export const RADAR_TREATED='iad_ri_pista_trabalhada';
export const RADAR_REOPENED='iad_ri_pista_reaberta';
export function radarTriageState(op){
 const eventos=Array.isArray(op?.eventos)?op.eventos:[];
 for(const e of eventos){
  if(!e||e.tipo!=='sistema')continue;
  if(e.codigo===RADAR_TREATED){
   return {treated:true,at:typeof e.registradoEm==='string'?e.registradoEm:'',
    by:typeof e.registradoPor==='string'?e.registradoPor:'',
    stage:typeof e.etapaDestino==='string'?e.etapaDestino:''};
  }
  if(e.codigo===RADAR_REOPENED)
   return {treated:false,at:typeof e.registradoEm==='string'?e.registradoEm:'',
    by:typeof e.registradoPor==='string'?e.registradoPor:'',stage:''};
 }
 return {treated:false,at:'',by:'',stage:''};
}
export const isRadarTreated=op=>radarTriageState(op).treated;
