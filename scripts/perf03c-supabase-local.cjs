'use strict';
// PERF-03C: E2E com autenticação GoTrue real em Supabase LOCAL descartável.
// Fail-closed: host não pode ser Supabase público; nunca imprimir tokens.
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.API_URL||'http://127.0.0.1:54321';
const anon=process.env.ANON_KEY,service=process.env.SERVICE_ROLE_KEY;
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base)||!anon||!service)
  throw Error('Somente GoTrue/PostgREST local, sem credenciais ou dados reais');
const pass='Perf03CLocal!3089922';
async function req(uri,method='GET',token=anon,body,extra={}){
 const res=await fetch(base+uri,{method,headers:{
  apikey:anon,authorization:'Bearer '+token,'content-type':'application/json',...extra
 },body:body===undefined?undefined:JSON.stringify(body)});
 const text=await res.text();let data;
 try{data=text?JSON.parse(text):null}catch{data=text}
 return {status:res.status,data};
}
async function ok(uri,method,token,body,extra){
 const r=await req(uri,method,token,body,extra);
 assert.ok(r.status>=200&&r.status<300,
  method+' '+uri.split('?')[0]+': '+r.status+' '+JSON.stringify(r.data).slice(0,180));
 return r.data;
}
async function create(prefix,tag,tenant,role){
 const email=prefix+'_'+tag+'@homolog.invalid';
 const u=await ok('/auth/v1/admin/users','POST',service,{email,password:pass,email_confirm:true});
 await ok('/rest/v1/perfis?id=eq.'+u.id,'PATCH',service,{tenant_id:tenant,papel:role});
 const session=await ok('/auth/v1/token?grant_type=password','POST',anon,{email,password:pass});
 return {id:u.id,token:session.access_token};
}
async function main(){
 const salt=Date.now().toString(36);
 const t=await ok('/rest/v1/tenants?select=id','POST',service,
   [{nome:'P03C-A-'+salt},{nome:'P03C-B-'+salt}],{'Prefer':'return=representation'});
 const ta=t[0].id,tb=t[1].id;
 const A=await create(salt,'a',ta,'usuario');
 const B=await create(salt,'b',ta,'usuario');
 const C=await create(salt,'c',tb,'usuario');
 const M=await create(salt,'manager',ta,'gestor');
 const Admin=await create(salt,'admin',ta,'admin');
 const ids={a:'p03c_a_'+salt,b:'p03c_b_'+salt,shared:'p03c_shared_'+salt,c:'p03c_c_'+salt};
 await ok('/rest/v1/contas','POST',service,[
  {id:ids.a,tenant_id:ta,dono_id:A.id,nome:'Privada A'},
  {id:ids.b,tenant_id:ta,dono_id:B.id,nome:'Privada B'},
  {id:ids.shared,tenant_id:ta,dono_id:null,nome:'Compartilhada'},
  {id:ids.c,tenant_id:tb,dono_id:C.id,nome:'Privada C'}
 ],{'Prefer':'return=minimal'});
 const p='/rest/v1/iad_sync_usuario_eventos?select=usuario_id,tenant_id,versao,registro_id,operacao&order=versao.asc';
 const a=await ok(p,'GET',A.token);
 const b=await ok(p,'GET',B.token);
 const c=await ok(p,'GET',C.token);
 const m=await ok(p,'GET',M.token);
 const ad=await ok(p,'GET',Admin.token);
 assert.deepEqual(new Set(a.map(x=>x.registro_id)),new Set([ids.a,ids.shared]));
 assert.deepEqual(new Set(b.map(x=>x.registro_id)),new Set([ids.b,ids.shared]));
 assert.deepEqual(new Set(c.map(x=>x.registro_id)),new Set([ids.c]));
 assert.equal(m.length,0,'Gestor não acessa feed privado de vendedores');
 assert.equal(ad.length,0,'Admin não enumera feed privado de vendedores');
 assert.ok(a.every(x=>x.usuario_id===A.id&&x.tenant_id===ta));
 assert.ok(b.every(x=>x.usuario_id===B.id&&x.tenant_id===ta));
 assert.deepEqual(a.map(x=>Number(x.versao)),[1,2]);
 assert.deepEqual(b.map(x=>Number(x.versao)),[1,2]);
 const va=await ok('/rest/v1/iad_sync_usuario_versoes?select=usuario_id,versao','GET',A.token);
 const vb=await ok('/rest/v1/iad_sync_usuario_versoes?select=usuario_id,versao','GET',B.token);
 assert.equal(va.length,1);assert.equal(vb.length,1);
 assert.equal(Number(va[0].versao),2);assert.equal(Number(vb[0].versao),2);
 assert.equal(va[0].usuario_id,A.id);
 const leaked=await ok('/rest/v1/iad_sync_eventos?select=registro_id','GET',A.token);
 assert.equal(leaked.length,0,'Feed compartilhado não pode revelar metadados');
 const anonResult=await req(p,'GET',anon);
 assert.ok([401,403].includes(anonResult.status),'Anon cannot read private feed');
 const forged=await req('/rest/v1/iad_sync_usuario_eventos','POST',A.token,{
  tenant_id:ta,usuario_id:A.id,versao:99,tabela:'contas',registro_id:'forge',operacao:'I'
 });
 assert.ok([401,403].includes(forged.status),'Usuário não pode inserir no journal');
 const cross=await req('/rest/v1/contas','POST',A.token,{
  id:'p03c_bad_'+salt,tenant_id:tb,dono_id:A.id,nome:'IDOR'
 });
 assert.ok(cross.status>=400,'Usuário não pode escrever em outro tenant');
 // Transição de titularidade: ex-dono recebe D, novo dono recebe I.
 await ok('/rest/v1/contas?id=eq.'+ids.a,'PATCH',service,{dono_id:B.id});
 const a2=await ok(p,'GET',A.token),b2=await ok(p,'GET',B.token);
 assert.ok(a2.some(x=>x.registro_id===ids.a&&x.operacao==='D'));
 assert.ok(b2.some(x=>x.registro_id===ids.a&&x.operacao==='I'));
 const accountsA=await ok('/rest/v1/contas?select=id','GET',A.token);
 assert.ok(!accountsA.some(x=>x.id===ids.a));
 const accountsB=await ok('/rest/v1/contas?select=id','GET',B.token);
 assert.ok(accountsB.some(x=>x.id===ids.a));
 // Apagar entidade compartilhada: ambos precisam receber tombstone.
 await ok('/rest/v1/contas?id=eq.'+ids.shared,'DELETE',service);
 const a3=await ok(p,'GET',A.token),b3=await ok(p,'GET',B.token);
 assert.ok(a3.some(x=>x.registro_id===ids.shared&&x.operacao==='D'));
 assert.ok(b3.some(x=>x.registro_id===ids.shared&&x.operacao==='D'));
 assert.ok(a3.every((x,i)=>Number(x.versao)===i+1),'Cursor privado A deve ser contíguo');
 assert.ok(b3.every((x,i)=>Number(x.versao)===i+1),'Cursor privado B deve ser contíguo');
 // Manager/Admin continuam usando feed PERF-03B, não privado.
 const sharedEvents=await ok('/rest/v1/iad_sync_eventos?select=tenant_id,registro_id','GET',M.token);
 assert.ok(sharedEvents.length>=5);
 assert.ok(sharedEvents.every(x=>x.tenant_id===ta));
 const adminEvents=await ok('/rest/v1/iad_sync_eventos?select=tenant_id,registro_id','GET',Admin.token);
 assert.ok(adminEvents.some(x=>x.tenant_id===tb));
 const report={environment:'localhost GoTrue/PostgREST',tenants:2,authenticatedUsers:5,
  privateFeedsNoCrossLeak:true,privateVersionsContiguous:true,
  ownerTransferTombstone:true,sharedDeleteTombstone:true,
  anonymousDenied:true,forgedWriteDenied:true,crossTenantDenied:true,
  managersUseSharedJournal:true,productionModified:false};
 fs.mkdirSync('homolog-artifacts',{recursive:true});
 fs.writeFileSync('homolog-artifacts/perf03c-auth-rls.json',JSON.stringify(report,null,2));
 console.log('PERF03C_AUTH_RLS '+JSON.stringify(report));
}
main().catch(e=>{console.error('PERF03C_AUTH_RLS_FAILED '+e.stack);process.exitCode=1});
