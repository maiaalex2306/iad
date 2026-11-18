import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCommercialOpportunityRadar} from '../src/ri/opportunity-radar.mjs';
import {discoverInternalCommercialCues} from '../src/ri/internal-cues.mjs';
const scope={role:'gestor',userId:'gestor',tenantId:'tenant-a',token:'revision-1'};
const today='2026-11-08';
const account=(id,tenantId='tenant-a')=>({id,tenantId,donoId:'gestor',nome:'Empresa '+id,segmento:'Industria'});
const op=(id,contaId,props={})=>({id,contaId,tenantId:'tenant-a',donoId:'gestor',criadoEm:today,notas:'',eventos:[],desfecho:null,...props});
const data=(accounts,ops)=>({contas:accounts,oportunidades:ops,tarefas:[],sinais:[],produtos:[],contatos:[]});
test('RI-46: 18 entradas de hoje continuam encontráveis; 12 é tamanho da página e não descarte',()=>{
 const accounts=[],ops=[];
 for(let i=0;i<18;i++){
  accounts.push(account('a'+i));
  ops.push(op('o'+i,'a'+i,{notas:i%2===0?'Cliente pediu proposta de monitoramento.':'Registro administrativo sem pedido confirmado.'}));
 }
 const snapshot=data(accounts,ops),before=JSON.stringify(snapshot);
 const out=buildCommercialOpportunityRadar({snapshot,scope,asOf:today});
 assert.equal(out.groups.pistas.length,18);
 assert.equal(new Set(out.groups.pistas.map(x=>x.sourceOpportunityId)).size,18);
 assert.equal(out.groups.pistas.filter(x=>x.status==='revisao').length,9,'9 sem intencao nao sao vendas presumidas');
 assert.equal(out.groups.pistas.filter(x=>x.status==='hipotese').length,9);
 assert.equal(out.groups.pistas.filter(x=>x.enteredAt===today).length,18);
 assert.equal(JSON.stringify(snapshot),before,'somente leitura');
});
test('RI-46: data de entrada recente é diferente da data da fala antiga',()=>{
 const snapshot=data([account('a')],[op('o','a',{eventos:[{
  id:'event-1',tipo:'sistema',data:'2026-09-07',
  titulo:'Conversa no LinkedIn com Rosa Oliveira (1 mensagem)',
  detalhe:'07/09/2026 · Alexandra Motta: Podemos marcar uma conversa.'
 }]})]);
 const out=buildCommercialOpportunityRadar({snapshot,scope,asOf:today});
 assert.equal(out.groups.pistas.length,1);
 assert.equal(out.groups.pistas[0].sourceType,'linkedin');
 assert.equal(out.groups.pistas[0].enteredAt,today);
 assert.equal(out.groups.pistas[0].date,'2026-09-07');
});
test('RI-46: negociações diferentes da mesma empresa e mesma data não somem',()=>{
 const snapshot=data([account('a')],[
  op('one','a',{notas:'Cliente pediu proposta de automação.'}),
  op('two','a',{notas:'Podemos marcar uma reunião para avaliar?'}),
  op('three','a',{notas:'Registro de atendimento sem demanda identificada.'})
 ]);
 const out=buildCommercialOpportunityRadar({snapshot,scope,asOf:today});
 assert.equal(out.groups.pistas.length,3);
 assert.deepEqual(new Set(out.groups.pistas.map(x=>x.sourceOpportunityId)),
  new Set(['one','two','three']));
 assert.equal(out.groups.pistas.find(x=>x.sourceOpportunityId==='two').status,'hipotese');
 assert.equal(out.groups.pistas.find(x=>x.sourceOpportunityId==='three').status,'revisao');
});
test('RI-46: registro fechado, futuro ou antigo sem sinal nao gera revisao',()=>{
 const snapshot=data([account('a'),account('b'),account('c'),account('d')],[
  op('closed','a',{desfecho:{tipo:'perdido'}}),
  op('future','b',{criadoEm:'2026-11-09'}),
  op('old','c',{criadoEm:'2026-09-01'}),
  op('valid','d',{criadoEm:'2026-11-07'})
 ]);
 const out=buildCommercialOpportunityRadar({snapshot,scope,asOf:today});
 assert.deepEqual(out.groups.pistas.map(x=>x.sourceOpportunityId),['valid']);
});
test('RI-46: tenant e filtro do administrador continuam isolados',()=>{
 const snapshot=data([account('a'),account('b','tenant-b')],[
  op('one','a'),{...op('secret','b'),tenantId:'tenant-b',donoId:'other'}
 ]);
 const gestor=buildCommercialOpportunityRadar({snapshot,scope,asOf:today});
 assert.equal(gestor.groups.pistas.length,1);
 assert.equal(gestor.groups.pistas[0].sourceOpportunityId,'one');
 const adm={role:'admin',admin:true,userId:'root',tenantFilter:'tenant-b',ownerFilter:'other',token:'root'};
 const admin=buildCommercialOpportunityRadar({snapshot,scope:adm,asOf:today});
 assert.equal(admin.groups.pistas.length,0,
  'conta e oportunidade so entram se respeitam filtros de dono');
});
test('RI-46: chamada legada preserva limite default, chamada para paginação recebe tudo',()=>{
 const accounts=new Map(),ops=[];
 for(let i=0;i<25;i++){
  const a=account('a'+i);accounts.set(JSON.stringify([a.tenantId,a.id]),a);
  ops.push(op('o'+i,a.id,{notas:'Cliente pediu proposta de automação.'}));
 }
 const snapshot=data([...accounts.values()],ops);
 const defaultOut=discoverInternalCommercialCues({snapshot,scope,accounts,asOf:today});
 const unlimited=discoverInternalCommercialCues({snapshot,scope,accounts,asOf:today,limit:0});
 assert.equal(defaultOut.items.length,12);
 assert.equal(unlimited.items.length,25);
 assert.equal(unlimited.candidateAccounts,25);
});
