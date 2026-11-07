'use strict';
/* RI-07A: casos sintéticos. Nenhuma chamada de IA, rede, Supabase ou mutação. */
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const modulePromise=import(pathToFileURL(path.join(root,'src/ri/internal-cues.mjs')).href);
const radarPromise=import(pathToFileURL(path.join(root,'src/ri/opportunity-radar.mjs')).href);
const scope={role:'gestor',userId:'manager',tenantId:'ta',ownerFilter:'todos',token:'some-revision'};
const date='2026-11-06';
const acc=(id,tenantId='ta',donoId='manager')=>({id,tenantId,donoId,nome:'Conta '+id,segmento:'Química'});
const op=(id,contaId,notas,extra={})=>({id,contaId,tenantId:'ta',donoId:'manager',notas,eventos:[],desfecho:null,...extra});
function state(){
 return {contas:[acc('a'),acc('b'),acc('c'),acc('d'),acc('e'),acc('secret','tb'),acc('unseen','ta','other')],
 oportunidades:[
  op('qa','a','Cliente solicitou orçamento para sistema de monitoramento. Necessário validar escopo.'),
  op('qb','b','Projeto cancelado, sem interesse em expansão ou nova unidade neste ano.'),
  op('qc','c','Estamos avaliando um projeto de reúso e implantação de automação de ETE.'),
  op('qd','d','Sem detalhes', {eventos:[{id:'evt-1',tipo:'activity',data:'2026-11-04',titulo:'A diretoria mencionou uma nova planta industrial e aumento de capacidade'}]}),
  op('qe','e','Empresa pediu proposta para retrofit.',{desfecho:{tipo:'desistencia'}}),
  {id:'s',tenantId:'tb',contaId:'secret',donoId:'manager',
   notas:'Cliente solicitou proposta SIGILO-TENANT-B',desfecho:null,eventos:[]},
  {...op('priv','unseen','Cliente solicitou proposta PRIVADO-OWNER'),donoId:'other'}
 ],produtos:[],tarefas:[],sinais:[]};
}
test('pistas: citações reais, fonte, próxima ação e escolha conservadora',async()=>{
 const m=await modulePromise,s=state();
 const accounts=new Map(s.contas.filter(x=>x.tenantId==='ta'&&x.donoId==='manager')
  .map(x=>[JSON.stringify([x.tenantId,x.id]),x]));
 const before=JSON.stringify(s);
 const out=m.discoverInternalCommercialCues({snapshot:s,scope,accounts,asOf:date});
 assert.equal(out.items.length,3,'a, c, d; descartar cancelamento e desistência');
 const a=out.items.find(x=>x.accountId==='a');
 assert.equal(a.sourceType,'nota');assert.equal(a.sourceOpportunityId,'qa');
 assert.match(a.evidence,/solicitou orçamento/);
 assert.match(a.action,/Confirmar/);
 const d=out.items.find(x=>x.accountId==='d');
 assert.equal(d.sourceType,'evento');
 assert.equal(d.sourceEventId,'evt-1');
 assert.equal(d.date,'2026-11-04');
 assert.ok(out.items.every(x=>x.status==='hipotese'));
 assert.doesNotMatch(JSON.stringify(out),/SIGILO-TENANT-B|PRIVADO-OWNER/);
 assert.equal(JSON.stringify(s),before,'somente leitura');
});
test('pistas: datas futuras, eventos de sistema e afirmações negativas não aparecem',async()=>{
 const m=await modulePromise;
 const s={...state(),oportunidades:[
  op('a','a','não há projeto de expansão neste momento'),
  op('c','c','sem interesse em nova unidade'),
  op('d','d','Registro administrativo', {eventos:[
   {id:'sys',tipo:'sistema',data:'2026-11-03',titulo:'Cliente solicitou orçamento'},
   {id:'future',tipo:'decision',data:'2026-12-11',titulo:'Cliente pediu proposta'},
   {id:'manual',tipo:'activity',data:'2026-11-02',titulo:'Assunto em acompanhamento sem projeto'}
  ]})]};
 const accounts=new Map(s.contas.filter(x=>x.tenantId==='ta')
  .map(x=>[JSON.stringify([x.tenantId,x.id]),x]));
 const out=m.discoverInternalCommercialCues({snapshot:s,scope,accounts,asOf:date});
 assert.equal(out.items.length,0);
});
test('pistas: mesmo tenant, filtro de dono admin e caminho integrado do Radar',async()=>{
 const m=await radarPromise,s=state();
 const x=m.buildCommercialOpportunityRadar({snapshot:s,scope,asOf:date});
 assert.ok(Array.isArray(x.groups.pistas));
 assert.equal(x.groups.pistas.length,4,'gestor vê todas as contas do próprio tenant');
 assert.ok(!JSON.stringify(x).includes('SIGILO-TENANT-B'));
 const admin={...scope,role:'admin',admin:true,tenantFilter:'ta',ownerFilter:'other'};
 const y=m.buildCommercialOpportunityRadar({snapshot:s,scope:admin,asOf:date});
 assert.equal(y.groups.pistas.length,1);
 assert.equal(y.groups.pistas[0].accountId,'unseen');
 assert.doesNotMatch(JSON.stringify(y.groups.pistas),/SIGILO-TENANT-B/);
});
test('pistas: deduplicação por conta, limite e sem execução de HTML',async()=>{
 const m=await modulePromise,s=state();
 s.contas=[];s.oportunidades=[];
 for(let i=0;i<60;i++){
  const id='a'+i;s.contas.push(acc(id));
  s.oportunidades.push(op('o'+i,id,'Cliente pediu proposta para modernização da instalação.'));
  s.oportunidades.push(op('z'+i,id,'Projeto de expansão industrial em avaliação.'));
 }
 s.oportunidades.push(op('injection','a0',
  '<img src=x onerror=alert(1)> Cliente solicitou orçamento para nova unidade.'));
 const accounts=new Map(s.contas.map(x=>[JSON.stringify([x.tenantId,x.id]),x]));
 const res=m.discoverInternalCommercialCues({snapshot:s,scope,accounts,asOf:date});
 assert.equal(res.items.length,12);
 assert.equal(new Set(res.items.map(x=>x.accountId)).size,12);
 assert.ok(res.items.every(x=>x.evidence.length<=230));
 assert.ok(res.items.every(x=>x.sourceOpportunityId));
});
