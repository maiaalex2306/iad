/* RI-46 — regression gate for manual triage of internal commercial cues.
 * Run: node --test tests/ri46-commercial-triage.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {RADAR_TREATED,RADAR_REOPENED,radarTriageState,isRadarTreated} from '../src/ri/triage-state.mjs';
import {buildCommercialOpportunityRadar} from '../src/ri/opportunity-radar.mjs';

const event=(codigo)=>({id:codigo,tipo:'sistema',codigo,registradoEm:'2026-11-18T12:00:00.000Z',etapaDestino:'Diagnóstico'});
const account=(id='a1',tenantId='t1')=>({id,tenantId,nome:'Empresa A',segmento:'Químico',donoId:'u1'});
const opportunity=(id='o1',tenantId='t1',accountId='a1')=>({
 id,tenantId,contaId:accountId,donoId:'u1',titulo:'Oportunidade real',
 criadoEm:'2026-11-17',etapa:'Diagnóstico',eventos:[],notas:'',
 itens:[],desfecho:null,stakeholders:[]
});
const scope={userId:'u1',tenantId:'t1',role:'gestor',admin:false,tenantFilter:'todas',ownerFilter:'todos'};
function radar(ops,accounts=[account()]){
 return buildCommercialOpportunityRadar({snapshot:{
  contas:accounts,oportunidades:ops,contatos:[],tarefas:[],produtos:[],sinais:[]
 },scope,asOf:'2026-11-18'});
}

test('never infer triage from ordinary CRM events',()=>{
 assert.equal(isRadarTreated(opportunity()),false);
 assert.equal(isRadarTreated({eventos:[{tipo:'decision',codigo:RADAR_TREATED}]}),false);
});

test('handled status is persisted in opportunity events',()=>{
 const op={...opportunity(),eventos:[event(RADAR_TREATED)]};
 assert.equal(isRadarTreated(op),true);
 assert.equal(radarTriageState(op).stage,'Diagnóstico');
});

test('the newest reopen event restores the cue without deleting the old marker',()=>{
 const op={...opportunity(),eventos:[event(RADAR_REOPENED),event(RADAR_TREATED)]};
 assert.equal(isRadarTreated(op),false);
 assert.equal(op.eventos.length,2);
});

test('new untriaged opportunity enters active commercial radar',()=>{
 assert.equal(radar([opportunity()]).groups.pistas.length,1);
});

test('handled opportunity is excluded from fresh-entry fallback',()=>{
 const op={...opportunity(),eventos:[event(RADAR_TREATED)]};
 assert.equal(radar([op]).groups.pistas.length,0);
});

test('reopened opportunity returns to active commercial radar',()=>{
 const op={...opportunity(),eventos:[event(RADAR_REOPENED),event(RADAR_TREATED)]};
 assert.equal(radar([op]).groups.pistas.length,1);
});

test('treating one opportunity does not conceal another on the same account',()=>{
 const handled={...opportunity('o1'),eventos:[event(RADAR_TREATED)]};
 const active=opportunity('o2');
 const items=radar([handled,active]).groups.pistas;
 assert.equal(items.length,1);
 assert.equal(items[0].sourceOpportunityId,'o2');
});

test('tenant isolation is retained in commercial radar',()=>{
 const other=opportunity('o2','t2','a2');
 const items=radar([opportunity(),other],[account(),account('a2','t2')]).groups.pistas;
 assert.equal(items.length,1);
 assert.equal(items[0].tenantId,'t1');
});

test('radar analysis is read-only and never changes opportunity stage or event history',()=>{
 const op={...opportunity(),eventos:[event(RADAR_TREATED)]};
 const before=JSON.stringify(op);
 radar([op]);
 assert.equal(JSON.stringify(op),before);
});
