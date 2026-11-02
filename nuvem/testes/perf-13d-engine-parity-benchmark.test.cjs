'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'../..');
const BASELINE='46022fb0bb0bbf90761d49bc960a2cd27ef1062e';
const oldEngine=cp.execFileSync('git',['show',BASELINE+':src/engine.js'],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
const newEngine=fs.readFileSync(path.join(root,'src/engine.js'),'utf8');
function setup(engine){
 let user={id:'u1',papel:'admin',tenantId:'a'};
 const w={console,localStorage:{getItem(){return null},setItem(){},removeItem(){}},IADAuth:{atual:()=>user,filtros:()=>({tenant:'todas',usuario:'todos'})}};
 const ctx={window:w,console,Date,JSON,Math,Map,Set};
 for(const file of ['playbook.js','store.js']){
  vm.runInNewContext(fs.readFileSync(path.join(root,'src',file),'utf8'),ctx,{filename:file});
 }
 vm.runInNewContext(engine,ctx,{filename:'engine.js'});
 const S=w.IADStore,E=w.IADEngine,P=w.IADPlaybook,st=S.obter();
 st.tenants=[{id:'a',nome:'Empresa A'}];
 st.contas=Array.from({length:50},(_,i)=>({id:'c'+i,nome:'Conta '+i,tenantId:'a',donoId:'u1',segmento:'Indústria'}));
 st.contatos=Array.from({length:100},(_,i)=>({id:'p'+i,tenantId:'a',donoId:'u1',nome:'Contato '+i,
   papel:P.PAPEIS_CRITICOS[i%P.PAPEIS_CRITICOS.length],
   perfil:i%9===0?'bloqueador':(P.PERFIS_MOBILIZADORES[i%P.PERFIS_MOBILIZADORES.length]||'nao_classificado'),
   sentimento:i%4===0?'resistente':i%3===0?'favoravel':'neutro'}));
 st.oportunidades=Array.from({length:389},(_,i)=>({
  id:'op'+i,tenantId:'a',donoId:'u1',contaId:'c'+(i%50),
  titulo:'Oportunidade '+i,valor:1800+i*10,criadoEm:'2026-08-01',etapaDesde:'2026-09-08',
  fechamentoPrevisto:'2026-12-20',etapa:i%3===0?'Proposta':'Diagnóstico',
  dims:Object.fromEntries(P.DIMENSOES.map((d,k)=>[d.id,(i+k)%5])),
  stakeholders:Array.from({length:i%8},(_,k)=>'p'+((i*3+k)%100)),
  eventos:Array.from({length:i%13},(_,k)=>({id:'e'+i+'-'+k,tipo:k%5===0?'outro':'decision',
    data:'2026-10-'+String(10+k%17).padStart(2,'0'),forca:'declarado',
    dimensao:P.DIMENSOES[k%P.DIMENSOES.length].id,contatoId:'p'+(k%100),
    canal:k%2?'email':'whatsapp',titulo:'Mensagem'})),
  snapshots:[],desfecho:null,proximoCompromisso:{data:'2026-11-20',texto:'Reunião',dono:'cliente'}
 }));
 st.tarefas=Array.from({length:450},(_,i)=>({id:'t'+i,tenantId:'a',donoId:'u1',
   oportunidadeId:'op'+(i%389),status:i%7?'aberta':'concluida',
   vencimento:i%3?'2026-10-01':'2026-12-31',concluidaEm:'2026-10-31'}));
 st.sinais=[];st.notas=[];S.salvar();
 return {S,E,ops:st.oportunidades,tasks:st.tarefas};
}
function median(values){const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];}
test('389 resumos e fila integral equivalentes ao motor publicado, incluindo oito decisoes',()=>{
 const prev=setup(oldEngine),next=setup(newEngine);
 for(let i=0;i<389;i++){
  assert.equal(JSON.stringify(next.E.resumo(next.ops[i])),JSON.stringify(prev.E.resumo(prev.ops[i])),
   'resumo divergente na oportunidade '+i);
 }
 const a=prev.E.fila(prev.S.dados().oportunidades,prev.S.dados().tarefas);
 const b=next.E.fila(next.S.dados().oportunidades,next.S.dados().tarefas);
 assert.equal(JSON.stringify(b),JSON.stringify(a),'fila comercial divergente');
 // Continue supporting stand-alone functions with no optional shared feature object.
 for(const k of ['saude','classificar','nextBestDecision','alertas','lacunas','coverage','gates']){
  for(let i=0;i<20;i++) assert.equal(JSON.stringify(next.E[k](next.ops[i])),JSON.stringify(prev.E[k](prev.ops[i])),k+' independently changed');
 }
 // Validate no retained results: mutate a decision and recompute without a Store revision.
 const prior=JSON.stringify(next.E.resumo(next.ops[0]));
 next.ops[0].dims[PICKS(next).id]=4;
 assert.notEqual(JSON.stringify(next.E.resumo(next.ops[0])),prior);
});
function PICKS(x){return x.E.ORDEM_DECISAO.length?{id:x.E.ORDEM_DECISAO[0]}:{id:'problema'};}
test('benchmark: median of 5 runs on 389 opportunities is faster than baseline',()=>{
 const old=setup(oldEngine),updated=setup(newEngine);
 const run=e=>{const t=performance.now();for(let k=0;k<2;k++)for(const op of e.ops)e.E.resumo(op);return performance.now()-t;};
 run(old);run(updated);
 const before=[],after=[];
 for(let i=0;i<5;i++){if(i%2){after.push(run(updated));before.push(run(old));}
 else {before.push(run(old));after.push(run(updated));}}
 const a=median(before),b=median(after),gain=((a-b)/a*100).toFixed(1);
 console.log('PERF-13D benchmark 389 oportunidades / 2 passagens por amostra: baseline='+a.toFixed(2)+'ms candidato='+b.toFixed(2)+'ms ganho='+gain+'%');
 assert.ok(b<a*0.98,'candidato nao ficou ao menos 2% mais rapido: '+JSON.stringify({a,b,gain}));
});
