'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../src/nuvem.js'),'utf8');
const TA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function make({role='gestor',userid='userA',tenant=TA,selected='todas',count=2,privateReady=true,loadError=false}={}){
 const storage=new Map(),events=[],privateEvents=[],versions=new Map(),privateVersions=new Map(),calls=[];
 const s={access_token:'synthetic',user:{id:userid},perfil:{tenant_id:tenant,papel:role}};
 const credentials=()=>JSON.parse(storage.get('iad-crm:nuvem-sessao:v1'));
 storage.set('iad-crm:nuvem-sessao:v1',JSON.stringify(s));
 const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const fields=['contas','contatos','oportunidades','tarefas','produtos','segmentos','tiposTarefa','fontes','sinais','notas'];
 const create=()=>Object.fromEntries(fields.map(f=>[f,[]]));
 const state=create(),remote=create();let rev=0,privateEnabled=privateReady,broken=loadError;
 const store={obter:()=>state,revisao:()=>rev,salvar:()=>{rev++},exclusoesPendentes:()=>[],
   semSincronizar:fn=>fn(),contexto:()=>({filtros:{tenant:selected,usuario:'todos'}})};
 const win={IADStore:store,IADConfig:{supabase:{url:'https://homolog.supabase.co',chave:'sb_publishable_fake'}}};
 vm.runInNewContext(source,{window:win,localStorage,Date,Map,Set,JSON,Promise,URL,encodeURIComponent,console});
 const N=win.IADNuvem;
 function allowed(row){const p=credentials().perfil;
   return p.papel==='admin' || (row.tenant_id===p.tenant_id &&
     (p.papel==='gestor'||!['contas','contatos','oportunidades','tarefas'].includes(row._table)||
      !row.dono_id||row.dono_id===credentials().user.id));}
 function row(id,tenant_id,owner,value,table='oportunidades'){
   return {id,tenant_id,dono_id:owner,conta_id:'c1',titulo:'Oportunidade '+id,valor:value,etapa:'Conexão',dims:{},eventos:[],_table:table};
 }
 for(let i=0;i<count;i++)remote.oportunidades.push(row('opp'+i, i%2===0?TA:TB,
   i%3===0?'userB':null,i));
 function change({id,tenant:tid=TA,owner=null,op='U',value=900}){
   const old=remote.oportunidades.find(x=>x.id===id);
   const oldOwner=old?old.dono_id:null;
   if(op==='D')remote.oportunidades=remote.oportunidades.filter(x=>x.id!==id);
   else{
     const item=row(id,tid,owner,value);
     const i=remote.oportunidades.findIndex(x=>x.id===id);
     if(i>=0)remote.oportunidades[i]=item;else remote.oportunidades.push(item);
   }
   const ver=(versions.get(tid)||0)+1;versions.set(tid,ver);
   events.push({tenant_id:tid,versao:ver,tabela:'oportunidades',registro_id:id,operacao:op});
   for(const person of ['userA','userB']){
     const oldAllowed=!!old&&(oldOwner===null||oldOwner===person);
     const nowAllowed=op!=='D'&&(owner===null||owner===person);
     if(!oldAllowed&&!nowAllowed)continue;
     const key=tid+'|'+person;
     const v=(privateVersions.get(key)||0)+1;
     privateVersions.set(key,v);
     privateEvents.push({tenant_id:tid,usuario_id:person,versao:v,tabela:'oportunidades',
       registro_id:id,operacao:oldAllowed&&!nowAllowed?'D':(!oldAllowed&&nowAllowed?'I':op)});
   }
 }
 N.__trocarChamar(function(route){
   calls.push(route);const u=new URL(route,'https://homolog.supabase.co');
   const t=u.pathname.split('/').at(-1),q=u.searchParams;
   if(broken&&t==='oportunidades'&&q.get('id')?.startsWith('in.'))
     return Promise.reject(new Error('simulated network outage'));
   if(t==='iad_sync_versoes') {
     const filter=(q.get('tenant_id')||'').slice(3);
     let rows=[...versions].map(([tenant_id,versao])=>({tenant_id,versao}))
       .filter(r=>role==='admin'||r.tenant_id===tenant);
     if(filter&&q.get('tenant_id')?.startsWith('eq.'))rows=rows.filter(r=>r.tenant_id===filter);
     if(q.get('tenant_id')?.startsWith('gt.'))rows=rows.filter(r=>r.tenant_id>filter);
     rows.sort((a,b)=>a.tenant_id.localeCompare(b.tenant_id));
     return Promise.resolve(rows.slice(0,Number(q.get('limit')||300))
       .map(x=>q.get('select')==='versao'?{versao:x.versao}:x));
   }
   if(t==='iad_sync_usuario_versoes'){
     if(!privateEnabled){const e=new Error('PGRST205');e.status=404;return Promise.reject(e);}
     let r=privateVersions.get(tenant+'|'+userid)||0;
     return Promise.resolve(r?[{versao:r}]:[]);
   }
   if(t==='iad_sync_eventos'||t==='iad_sync_usuario_eventos'){
     const list=t==='iad_sync_eventos'?events:privateEvents;
     const cursor=Number((q.get('versao')||'gt.0').slice(3));
     const tenantFilter=(q.get('tenant_id')||'eq.'+tenant).slice(3);
     let rows=list.filter(e=>e.tenant_id===tenantFilter&&e.versao>cursor&&
       (t==='iad_sync_eventos'||e.usuario_id===userid));
     return Promise.resolve(rows.slice(0,Number(q.get('limit')||300)));
   }
   const field=t==='tipos_tarefa'?'tiposTarefa':t,arr=remote[field];
   if(!arr)throw Error('unexpected route '+route);
   let rows=arr.filter(x=>allowed(x));
   if(q.get('id')?.startsWith('gt.'))rows=rows.filter(x=>x.id>q.get('id').slice(3));
   if(q.get('id')?.startsWith('in.')){
     const ids=new Set(q.get('id').slice(4,-1).split(',').map(x=>x.replace(/^"|"$/g,'')));
     rows=rows.filter(x=>ids.has(x.id));
   }
   return Promise.resolve(rows.sort((a,b)=>a.id.localeCompare(b.id)).slice(0,Number(q.get('limit')||500))
     .map(({_table,...clean})=>clean));
 });
 return {N,state,remote,change,versions,privateVersions,calls,clearCalls:()=>calls.splice(0),
   setError:v=>broken=v,setPrivate:v=>privateEnabled=v,setSelected:v=>selected=v,
   setUser:(user,perRole,perTenant=tenant)=>{
     const s=credentials();s.user.id=user;s.perfil.papel=perRole;s.perfil.tenant_id=perTenant;
     storage.set('iad-crm:nuvem-sessao:v1',JSON.stringify(s));
   }};
}

test('PERF03C admin multiempresa: snapshot e delta de dois tenants sem ressincronizar todas as oportunidades',async()=>{
 const a=make({role:'admin',count:243});
 assert.equal(await a.N.puxar(),243);
 a.clearCalls();
 a.change({id:'opp0',tenant:TA,value:110});
 a.change({id:'opp1',tenant:TB,value:220});
 assert.equal(await a.N.puxar(),2);
 assert.equal(a.state.oportunidades.find(r=>r.id==='opp0').valor,110);
 assert.equal(a.state.oportunidades.find(r=>r.id==='opp1').valor,220);
 assert.ok(a.calls.some(q=>q.includes('tenant_id=eq.'+TA)));
 assert.ok(a.calls.some(q=>q.includes('tenant_id=eq.'+TB)));
 assert.ok(!a.calls.some(q=>q.includes('/oportunidades?select=*&order=id.asc')));
});

test('PERF03C admin: ao trocar recorte não reutiliza checkpoint anterior; exclusão não ressuscita',async()=>{
 const a=make({role:'admin',count:4});
 await a.N.puxar();a.change({id:'opp0',tenant:TA,op:'D'});
 await a.N.puxar();
 assert.ok(!a.state.oportunidades.some(r=>r.id==='opp0'));
 a.setSelected(TB);
 a.clearCalls();
 await a.N.puxar(); // snapshot íntegro obrigatório após mudar o filtro de acesso
 assert.ok(a.calls.some(q=>q.includes('/oportunidades?select=*&order=id.asc')));
 assert.ok(!a.state.oportunidades.some(r=>r.id==='opp0'));
});

test('PERF03C vendedor: stream privado mantém contador sem vazamento e não consulta journal global',async()=>{
 const a=make({role:'usuario',userid:'userA',count:5});
 await a.N.puxar();a.clearCalls();
 a.change({id:'opp1',tenant:TB,owner:'userB',value:100}); // sem visibilidade
 a.change({id:'opp2',tenant:TA,owner:null,value:201}); // compartilhada
 assert.equal(await a.N.puxar(),1);
 assert.equal(a.state.oportunidades.find(r=>r.id==='opp2').valor,201);
 assert.ok(a.calls.some(q=>q.includes('/iad_sync_usuario_eventos?')));
 assert.ok(!a.calls.some(q=>q.includes('/iad_sync_eventos?')));
 assert.ok(!a.calls.some(q=>q.includes('/iad_sync_versoes?')));
});

test('PERF03C vendedor: mudança de dono gera remoção e impede reaparecimento',async()=>{
 const a=make({role:'usuario',userid:'userA',count:2});
 await a.N.puxar();
 a.change({id:'opp0',tenant:TA,owner:'userA',value:10});
 await a.N.puxar();
 assert.ok(a.state.oportunidades.some(r=>r.id==='opp0'));
 a.change({id:'opp0',tenant:TA,owner:'userB',value:11});
 await a.N.puxar();
 assert.ok(!a.state.oportunidades.some(r=>r.id==='opp0'));
});

test('PERF03C falha em leitura delta não destrói estado e força snapshot seguinte',async()=>{
 const a=make({role:'admin',count:2});
 await a.N.puxar();a.change({id:'opp0',tenant:TA,value:999});
 a.setError(true);
 await assert.rejects(()=>a.N.puxar(),/network outage/);
 assert.equal(a.state.oportunidades.find(r=>r.id==='opp0').valor,0);
 a.setError(false);
 await a.N.puxar();
 assert.equal(a.state.oportunidades.find(r=>r.id==='opp0').valor,999);
});

test('PERF03C sem migração privada vendedor usa fallback v271 sem revelar journal global',async()=>{
 const a=make({role:'usuario',count:2,privateReady:false});
 await a.N.puxar();
 a.clearCalls();
 a.change({id:'opp0',owner:null,value:33});
 await a.N.puxar();
 assert.ok(a.calls.some(x=>x.includes('/oportunidades?select=*&order=id.asc')));
 assert.ok(!a.calls.some(x=>x.includes('/iad_sync_eventos?')));
});

for(const n of [243,1000,5000,10000])test('PERF03C paridade de carteira admin '+n+' oportunidades',async()=>{
 const a=make({role:'admin',count:n});
 const got=await a.N.puxar();
 assert.equal(got,n);
 const ref=a.remote.oportunidades.map(x=>x.id).sort();
 assert.deepEqual(a.state.oportunidades.map(x=>x.id).sort(),ref);
 a.change({id:'opp0',tenant:TA,value:827});
 a.change({id:'opp1',tenant:TB,value:928});
 const delta=await a.N.puxar();
 assert.equal(delta,2);
 assert.equal(a.state.oportunidades.length,n);
 assert.equal(a.state.oportunidades.find(x=>x.id==='opp1').valor,928);
});
test('PERF03C progresso não publica dados incompletos no Store',async()=>{
 const a=make({role:'gestor',count:243});
 const checkpoints=[];
 const off=a.N.observarCarga(c=>checkpoints.push({done:c.concluidas,len:a.state.oportunidades.length,active:c.ativa}));
 await a.N.puxar();off();
 assert.ok(checkpoints.some(x=>x.active&&x.done>0));
 assert.ok(checkpoints.filter(x=>x.active&&x.done<10).every(x=>x.len===0));
 assert.equal(a.N.estadoCarga().ativa,false);
});
test('PERF03C contrato SQL de feed privado exige versionamento, anti-IDOR e revogação de acesso direto',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../perf-03c-journal-privado.sql'),'utf8');
 for(const pattern of [/PRIMARY KEY \(tenant_id,usuario_id,versao\)/,
   /usuario_id = \(SELECT auth.uid\(\)\)/,
   /NOT \(SELECT public.sou_gestor\(\)\)/,
   /REVOKE ALL ON public.iad_sync_usuario_eventos FROM PUBLIC, anon, authenticated/,
   /_era_visivel AND NOT _agora_visivel THEN _op:='D'/,
   /_new_dono=_uid/,
   /AFTER INSERT OR UPDATE OR DELETE/])
   assert.match(sql,pattern);
});
