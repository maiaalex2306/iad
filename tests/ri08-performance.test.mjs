import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {buildCachedCommercialRadar} from '../src/ri/account-view.mjs';
const N=5000, E=6;
const accounts=[],opportunities=[];
for(let i=0;i<N;i++){
 const id='c'+i;
 accounts.push({id,tenantId:'ta',donoId:'mgr',nome:'Conta '+i,segmento:'Industrial'});
 opportunities.push({id:'o'+i,tenantId:'ta',donoId:'mgr',contaId:id,
  notas:i%13===0?'Cliente pediu proposta de automação.':'Registro de acompanhamento comercial',
  eventos:Array.from({length:E},(_,j)=>({
   id:'e'+i+'-'+j,tipo:'activity',data:'2026-10-02',
   titulo:j===0&&i%31===0?'Estamos ampliando a fábrica.':'Registro de reunião operacional'
  }))});
}
const snapshot={contas:accounts,oportunidades:opportunities,contatos:[],produtos:[],tarefas:[],sinais:[]};
const scope={role:'gestor',userId:'mgr',tenantId:'ta',token:'mgr|ta|rev1'};
test('benchmark RI-08: cold e cache warm com 5 mil oportunidades',()=>{
 const t0=performance.now();
 const first=buildCachedCommercialRadar({snapshot,scope,asOf:'2026-11-06'});
 const cold=performance.now()-t0;
 const t1=performance.now();
 for(let i=0;i<100;i++){
  const warm=buildCachedCommercialRadar({snapshot,scope,asOf:'2026-11-06'});
  assert.strictEqual(warm,first);
 }
 const warmTotal=performance.now()-t1;
 const t2=performance.now();
 const rescoped=buildCachedCommercialRadar({snapshot,scope:{...scope,token:'mgr|ta|rev2'},asOf:'2026-11-06'});
 const changed=performance.now()-t2;
 assert.notStrictEqual(first,rescoped);
 assert(first.groups.pistas.length>0);
 console.log('RI08_PERF_RESULT '+JSON.stringify({
  opportunities:N,events:N*E,coldMs:+cold.toFixed(2),
  cached100Ms:+warmTotal.toFixed(2),rescopedMs:+changed.toFixed(2),
  scale:'synthetic node runner, not browser RUM P95'
 }));
 assert(cold<3000,'cold >3s in synthetic Node 5000 opportunities: '+cold.toFixed(1)+'ms');
 assert(warmTotal<100,'cache 100 calls >100ms: '+warmTotal.toFixed(1)+'ms');
});
