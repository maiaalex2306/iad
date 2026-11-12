/* PERF-03A — bench diferencial com conjuntos sintéticos 243, 1k e 5k.
   Sem rede, credenciais, dados de clientes ou publicação. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(__dirname,'..');
const base='978af8859c2fa558eb49472dda5e13708dd348db';
const sizes=[243,1000,5000], results=[];
const src=(file,old)=>old?cp.execFileSync('git',['show',base+':src/'+file],{cwd:root,encoding:'utf8',maxBuffer:2e6}):fs.readFileSync(path.join(root,'src',file),'utf8');
function setup(n,old) {
 const user={id:'test-a',papel:'gestor',tenantId:'tenant-a'};
 const win={IADAuth:{atual:()=>user,filtros:()=>({tenant:'todas',usuario:'todos'})}};
 const localStorage={removeItem(){},getItem(){return null},setItem(){}};
 const sandbox={window:win,console,Date,Math,JSON,Map,Set,localStorage};
 for(const file of ['playbook.js','store.js','engine.js'])vm.runInNewContext(src(file,old),sandbox,{filename:file});
 if(!old)vm.runInNewContext(src('pipeline-performance.js',false),sandbox);
 const S=win.IADStore,P=win.IADPlaybook,E=win.IADEngine,st=S.obter();
 st.tenants=[{id:'tenant-a',nome:'HOMOLOG'}];
 st.usuarios=[user];
 st.contas=Array.from({length:Math.max(30,Math.ceil(n/5))},(_,i)=>({id:'c'+i,tenantId:'tenant-a',donoId:'test-a',nome:'Empresa '+i,uf:i%2?'SP':'PR',cidade:'Cidade '+i}));
 st.contatos=Array.from({length:Math.ceil(n/2)},(_,i)=>({id:'p'+i,tenantId:'tenant-a',donoId:'test-a',contaId:'c'+(i%st.contas.length),papel:'Champion / Mobilizer',sentimento:'favoravel',perfil:'mobilizador'}));
 const dim=Object.fromEntries(P.DIMENSOES.map((d,i)=>[d.id,i%3]));
 st.oportunidades=Array.from({length:n},(_,i)=>({id:'op'+i,tenantId:'tenant-a',donoId:'test-a',contaId:'c'+(i%st.contas.length),titulo:'Negocio '+i,
 valor:10000+i,criadoEm:'2026-10-01',etapaDesde:'2026-10-01',fechamentoPrevisto:'2026-12-01',
 etapa:i%3===0?'Proposta':'Diagnóstico',dims:{...dim},stakeholders:['p'+(i%st.contatos.length)],eventos:[],
 desfecho:null,proximoCompromisso:null,adiamentos:0,origem:'Manual'}));
 st.tarefas=Array.from({length:n*2},(_,i)=>({id:'t'+i,tenantId:'tenant-a',donoId:'test-a',oportunidadeId:'op'+(i%n),
 status:i%3?'aberta':'concluida',vencimento:i%2===0?'2026-10-01':'2027-01-01',titulo:'Tarefa '+i}));
 st.sinais=Array.from({length:n},(_,i)=>({id:'s'+i,tenantId:'tenant-a',donoId:'test-a',
 oportunidadeId:i%2===0?'op'+i:'',contaId:i%2?'c'+(i%st.contas.length):'',contatoId:'',quando:'2026-10-20',peso:1,hora:'12:00'}));
 st.notas=[];st.fontes=[];st.segmentos=[];st.produtos=[];st.tiposTarefa=[];
 S.salvar();
 return {S,E,st,perf:win.IADPipelinePerf};
}
function clock(f){let t=process.hrtime.bigint();let value=f();return {value,ms:Number(process.hrtime.bigint()-t)/1e6};}
function diff(a,b){for(let i=0;i<a.length;i++){if(JSON.stringify(a[i])!==JSON.stringify(b[i]))throw Error('Divergencia de resumo em '+i);}return true;}
function percentile(a,p){const s=[...a].sort((x,y)=>x-y);return +(s[Math.ceil(p*s.length)-1]||0).toFixed(2);}
for(const n of sizes) {
 const previous=setup(n,true),candidate=setup(n,false);
 const old=clock(()=>previous.S.dados().oportunidades.map(o=>previous.E.resumo(o)));
 const next=clock(()=>candidate.perf.resumos(candidate.S.dados()));
 if(old.value.length!==n||next.value.length!==n)throw Error('quantidade incorreta '+n);
 diff(old.value,next.value);
 const cold=[],warm=[],repeated=[];
 for(let i=0;i<5;i++){
  candidate.perf.limpar();
  cold.push(clock(()=>candidate.perf.resumos(candidate.S.dados())).ms);
  warm.push(clock(()=>candidate.perf.resumos(candidate.S.dados())).ms);
  repeated.push(clock(()=>candidate.perf.resumos(candidate.S.dados())).ms);
 }
 const after=clock(()=>{candidate.S.atualizarOportunidade('op0',{valor:950000});return candidate.perf.resumos(candidate.S.dados());});
 if(after.value[0].op.valor!==950000)throw Error('cache não invalidou '+n);
 const row={oportunidades:n,tarefas:n*2,sinais:n,contatos:Math.ceil(n/2),
 paridade:'PASS',baselineFirstMs:+old.ms.toFixed(2),candidateFirstMs:+next.ms.toFixed(2),
 candidateColdP50Ms:percentile(cold,.50),candidateColdP95Ms:percentile(cold,.95),
 warmP50Ms:percentile(warm,.50),warmP95Ms:percentile(warm,.95),
 afterChangeMs:+after.ms.toFixed(2),cache:candidate.perf.estatisticas()};
 results.push(row);console.log('PERF03A_SCALE '+JSON.stringify(row));
}
fs.mkdirSync(path.join(root,'homolog-artifacts'),{recursive:true});
fs.writeFileSync(path.join(root,'homolog-artifacts','scale-bench.json'),JSON.stringify({
 when:new Date().toISOString(),commit:process.env.GITHUB_SHA||'',environment:'GitHub Actions Ubuntu Node.js 22',
 methodology:'Synthetic 243/1000/5000; baseline v269; first run and five cold/warm; data in memory; not production latency.',
 results},null,2));
console.log('PERF03A_SCALE_DONE');
