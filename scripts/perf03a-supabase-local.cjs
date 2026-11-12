/* Homologação isolada Supabase local CI — API Auth, PostgreSQL RLS e paginação.
   Executar apenas com API_URL local/loopback. Jamais conectar produção. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.API_URL || 'http://127.0.0.1:54321';
const anon=process.env.ANON_KEY;
const service=process.env.SERVICE_ROLE_KEY;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)||!anon||!service)
  throw Error('Somente Supabase local isolado com ANON_KEY e SERVICE_ROLE_KEY');
const headers=k=>({'apikey':k,'authorization':'Bearer '+k,'content-type':'application/json'});
async function req(uri,method='GET',key=anon,body,extras){
 const r=await fetch(base+uri,{method,headers:{...headers(key),...extras},body:body?JSON.stringify(body):undefined});
 const t=await r.text();let data=null;try{data=t?JSON.parse(t):null}catch{data=t};
 return {status:r.status,data};
}
async function ok(uri,method,key,body,extras){
 const z=await req(uri,method,key,body,extras);
 if(z.status<200||z.status>=300)throw Error(method+' '+uri.split('?')[0]+' HTTP '+z.status+' '+String(JSON.stringify(z.data)).slice(0,150));
 return z.data;
}
async function user(email){
 const id=await ok('/auth/v1/admin/users','POST',service,
  {email,password:'Perf03a!VeryStrong12345',email_confirm:true});
 assert.ok(id.id,'auth user id');return id.id;
}
async function login(email){
 const z=await ok('/auth/v1/token?grant_type=password','POST',anon,
   {email,password:'Perf03a!VeryStrong12345'});
 assert.ok(z.access_token);return z.access_token;
}
function uuidTest(x){assert.match(x,/^[0-9a-f-]{36}$/);return x;}
async function main(){
 const prefix='perf'+Date.now();
 const a=prefix+'a@homolog.invalid',b=prefix+'b@homolog.invalid';
 const idA=await user(a),idB=await user(b);
 const tA=await ok('/rest/v1/tenants?select=id','POST',service,
  [{nome:'PERF03A TENANT A'}],{'Prefer':'return=representation'});
 const tB=await ok('/rest/v1/tenants?select=id','POST',service,
  [{nome:'PERF03A TENANT B'}],{'Prefer':'return=representation'});
 const ta=uuidTest(tA[0].id),tb=uuidTest(tB[0].id);
 await ok('/rest/v1/perfis?id=eq.'+idA,'PATCH',service,{tenant_id:ta,papel:'usuario'});
 await ok('/rest/v1/perfis?id=eq.'+idB,'PATCH',service,{tenant_id:tb,papel:'usuario'});
 const authA=await login(a),authB=await login(b);
 const items=Array.from({length:1205},(_,i)=>({
  id:'hom_a_'+String(i).padStart(5,'0'),tenant_id:ta,nome:'Conta synthetic '+i
 }));
 const h={'Prefer':'resolution=merge-duplicates,return=minimal'};
 for(let i=0;i<items.length;i+=300)await ok('/rest/v1/contas','POST',service,items.slice(i,i+300),h);
 await ok('/rest/v1/contas','POST',service,[{id:'hom_b_00000',tenant_id:tb,nome:'Só B'}],h);
 async function baixar(token){
  const dados=[],seen=new Set();let ultimo=null,chamadas=0;
  for(;;){
   const c=ultimo===null?'':'&id=gt.'+encodeURIComponent(ultimo);
   const lista=await ok('/rest/v1/contas?select=id,tenant_id,nome&order=id.asc&limit=500'+c,'GET',token);
   chamadas++;
   if(!Array.isArray(lista))throw Error('PostgREST inválido');
   if(!lista.length)break;
   for(const r of lista){if(seen.has(r.id))throw Error('ID repetido');seen.add(r.id);dados.push(r)}
   ultimo=lista.at(-1).id;
   if(chamadas>20)throw Error('Loop de páginas');
  }
  return {dados,chamadas};
 }
 const gotA=await baixar(authA),gotB=await baixar(authB);
 assert.equal(gotA.dados.length,1205);assert.equal(gotB.dados.length,1);
 assert.ok(gotA.dados.every(x=>x.tenant_id===ta));
 assert.ok(gotB.dados.every(x=>x.tenant_id===tb));
 const denied=await req('/rest/v1/contas','POST',authB,
  {id:'intrusao',tenant_id:ta,nome:'proibido'},{Prefer:'return=minimal'});
 assert.ok(denied.status>=400,'Escrita cross tenant foi aceita');
 const stats={realSupabaseLocal:true,authUsers:2,tenants:2,tenantAItems:gotA.dados.length,
  tenantBItems:gotB.dados.length,pagesA:gotA.chamadas,pagesB:gotB.chamadas,
  crossTenantWrite:'DENIED',crossTenantRead:'DENIED'};
 fs.mkdirSync('homolog-artifacts',{recursive:true});
 fs.writeFileSync(path.join('homolog-artifacts','supabase-local-rls.json'),JSON.stringify(stats,null,2));
 console.log('PERF03A_SUPABASE_LOCAL '+JSON.stringify(stats));
}
main().catch(e=>{console.error('PERF03A_SUPABASE_FAIL '+e.stack);process.exitCode=1});
