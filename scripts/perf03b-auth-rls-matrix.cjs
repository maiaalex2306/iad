/* PERF-03B - matriz de Auth/RLS em Supabase LOCAL descartável.
   4 logins REAIS via GoTrue + REST autenticado; 2 tenants; zero produção. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.API_URL || 'http://127.0.0.1:54321';
const anon = process.env.ANON_KEY;
const service = process.env.SERVICE_ROLE_KEY;
if (!/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(base) || !anon || !service)
  throw new Error('Obrigatório: Supabase local loopback e credenciais descartáveis');

async function request(uri, method='GET', token=anon, body, extra={}) {
  const res=await fetch(base+uri,{method,headers:{
    apikey:anon,authorization:'Bearer '+token,'content-type':'application/json',...extra
  },body:body===undefined?undefined:JSON.stringify(body)});
  const txt=await res.text();let value;
  try{value=txt?JSON.parse(txt):null}catch{value=txt}
  return {status:res.status,value};
}
async function ok(uri,method,token,body,extra) {
  const r=await request(uri,method,token,body,extra);
  assert.ok(r.status>=200 && r.status<300,
    method+' '+uri.split('?')[0]+' HTTP '+r.status+' '+JSON.stringify(r.value).slice(0,150));
  return r.value;
}
async function createUser(prefix,kind) {
  const email=prefix+'_'+kind+'@homolog.invalid';
  const user=await ok('/auth/v1/admin/users','POST',service,{
    email,password:'TempPerf03B!OnlyLocal314159',email_confirm:true
  });
  assert.ok(user.id);
  return {id:user.id,email};
}
async function login(email) {
  const x=await ok('/auth/v1/token?grant_type=password','POST',anon,{
    email,password:'TempPerf03B!OnlyLocal314159'
  });
  assert.ok(x.access_token);
  return x.access_token;
}
async function main(){
  const salt=Date.now().toString(36);
  const [tA,tB]=await Promise.all([
    ok('/rest/v1/tenants?select=id','POST',service,[{nome:'QA-RLS-A-'+salt}],{'Prefer':'return=representation'}),
    ok('/rest/v1/tenants?select=id','POST',service,[{nome:'QA-RLS-B-'+salt}],{'Prefer':'return=representation'})
  ]);
  const ta=tA[0].id,tb=tB[0].id;
  assert.notEqual(ta,tb);
  const managerA=await createUser(salt,'gestor_a');
  const managerB=await createUser(salt,'gestor_b');
  const vendorA=await createUser(salt,'vendedor_a');
  const admin=await createUser(salt,'admin');
  for(const [u,tenant,role] of [
    [managerA,ta,'gestor'],[managerB,tb,'gestor'],
    [vendorA,ta,'usuario'],[admin,ta,'admin']
  ]) await ok('/rest/v1/perfis?id=eq.'+u.id,'PATCH',service,
    {tenant_id:tenant,papel:role});
  const logins={managerA:await login(managerA.email),managerB:await login(managerB.email),
    vendorA:await login(vendorA.email),admin:await login(admin.email)};
  const ids={a:'qa_rls_a_'+salt,av:'qa_rls_av_'+salt,b:'qa_rls_b_'+salt};
  await ok('/rest/v1/contas','POST',service,[
    {id:ids.a,tenant_id:ta,dono_id:managerA.id,nome:'QA A gestor'},
    {id:ids.av,tenant_id:ta,dono_id:vendorA.id,nome:'QA A vendedor'},
    {id:ids.b,tenant_id:tb,dono_id:managerB.id,nome:'QA B gestor'}
  ],{'Prefer':'return=minimal'});
  const f='&registro_id=in.('+Object.values(ids).join(',')+')';
  const uri='/rest/v1/iad_sync_eventos?select=tenant_id,registro_id,versao,operacao'+f;
  const eA=await ok(uri,'GET',logins.managerA);
  const eB=await ok(uri,'GET',logins.managerB);
  const eV=await ok(uri,'GET',logins.vendorA);
  const eAdmin=await ok(uri,'GET',logins.admin);
  assert.equal(eA.length,2,'Gestor A vê dois eventos do próprio tenant');
  assert.equal(eB.length,1,'Gestor B vê só seu evento');
  assert.equal(eV.length,0,'Vendedor NÃO enumera metadados de colegas');
  assert.equal(eAdmin.length,3,'Admin vê os dois tenants');
  assert.ok(eA.every(e=>e.tenant_id===ta));
  assert.ok(eB.every(e=>e.tenant_id===tb));
  const versionUri='/rest/v1/iad_sync_versoes?select=tenant_id,versao&tenant_id=in.('+ta+','+tb+')';
  const va=await ok(versionUri,'GET',logins.managerA);
  const vb=await ok(versionUri,'GET',logins.managerB);
  const vv=await ok(versionUri,'GET',logins.vendorA);
  const vadmin=await ok(versionUri,'GET',logins.admin);
  assert.equal(va.length,1);assert.equal(vb.length,1);assert.equal(vv.length,0);assert.equal(vadmin.length,2);
  assert.equal(va[0].tenant_id,ta);assert.equal(vb[0].tenant_id,tb);

  const accounts='/rest/v1/contas?select=id,tenant_id,dono_id&id=in.('+Object.values(ids).join(',')+')';
  const aAccounts=await ok(accounts,'GET',logins.managerA);
  const bAccounts=await ok(accounts,'GET',logins.managerB);
  const vendorAccounts=await ok(accounts,'GET',logins.vendorA);
  const adminAccounts=await ok(accounts,'GET',logins.admin);
  assert.equal(aAccounts.length,2);
  assert.equal(bAccounts.length,1);
  assert.equal(vendorAccounts.length,1);
  assert.equal(vendorAccounts[0].id,ids.av);
  assert.equal(adminAccounts.length,3);
  const anonymous=await request(uri,'GET',anon);
  assert.ok([401,403].includes(anonymous.status),'Anon não pode listar journal: '+anonymous.status);
  const forgedEvent=await request('/rest/v1/iad_sync_eventos','POST',logins.managerA,
    {tenant_id:ta,versao:12345,tabela:'contas',registro_id:'forged',operacao:'I'});
  assert.ok([401,403].includes(forgedEvent.status),
    'Escrita no journal por gestor foi aceita: '+forgedEvent.status);
  const crossWrite=await request('/rest/v1/contas','POST',logins.managerA,
    {id:'forged_cross_'+salt,tenant_id:tb,nome:'X'});
  assert.ok(crossWrite.status>=400,'Gestor A escreveu em tenant B');
  // Exclusão como usuário da empresa: journal guarda tombstone, mantém escopo.
  await ok('/rest/v1/contas?id=eq.'+ids.a,'DELETE',service);
  const tomb=await ok(uri,'GET',logins.managerA);
  assert.equal(tomb.length,3);
  assert.ok(tomb.some(e=>e.registro_id===ids.a && e.operacao==='D'));
  const afterB=await ok(uri,'GET',logins.managerB);
  assert.equal(afterB.length,1,'Exclusão tenant A não altera visibilidade tenant B');
  const results={
    source:'GoTrue real + PostgREST/RLS, localhost somente',
    users:4,tenants:2,
    managerAEvents:eA.length,managerBEvents:eB.length,
    vendorJournalEvents:eV.length,adminEvents:eAdmin.length,
    vendorVisibleOwnAccounts:vendorAccounts.length,adminCrossTenant:adminAccounts.length,
    anonJournal:'DENIED',forgedJournal:'DENIED',crossTenantWrite:'DENIED',
    deleteTombstone:'PASS',dataReal:false
  };
  fs.mkdirSync('homolog-artifacts',{recursive:true});
  fs.writeFileSync(path.join('homolog-artifacts','perf03b-auth-rls-matrix.json'),JSON.stringify(results,null,2));
  console.log('PERF03B_AUTH_RLS_MATRIX '+JSON.stringify(results));
}
main().catch(e=>{console.error('PERF03B_AUTH_RLS_FAIL '+e.stack);process.exitCode=1;});
