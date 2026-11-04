import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../nuvem/funcoes/market-search/index.ts',import.meta.url),'utf8');
function harness(withKey=false){
 const calls=[];let handler=null;
 const sandbox={Request,Response,AbortSignal,URL,console,Deno:{env:{get(k){
  if(k==='SUPABASE_URL')return 'https://safe.supabase.co';
  if(k==='SUPABASE_ANON_KEY')return 'safe-public-key';
  if(k==='ECONODATA_API_KEY')return withKey?'safe-server-only-key':undefined;
 }},serve(fn){handler=fn}},fetch:async(url,opt={})=>{
  calls.push({url:String(url),method:opt.method||'GET',headers:opt.headers});
  if(String(url).includes('/auth/v1/user'))return new Response(JSON.stringify({id:'11111111-1111-1111-1111-111111111111'}),{status:200});
  if(String(url).includes('/rest/v1/perfis'))return new Response(JSON.stringify([{tenant_id:'tenant-a',papel:'vendedor',ativo:true}]),{status:200});
  if(String(url).includes('/v4/companies/search_list'))return new Response(JSON.stringify({data:[{cnpj:'11222333000181',razaoSocial:'Empresa A',cidade:'Jacarei',uf:'SP'}],meta:{total:1}}),{status:200});
  throw Error('unexpected '+url);
 }};
 vm.runInNewContext(source,sandbox,{filename:'market-search/index.ts'});
 return {calls,handle:handler};
}
const validToken='Bearer '+ 'a'.repeat(110);
const request=(data,token=validToken)=>new Request('https://safe.supabase.co/functions/v1/market-search',{method:'POST',headers:{origin:'https://www.iadcrm.com.br','authorization':token,'content-type':'application/json'},body:JSON.stringify(data)});
test('OPTIONS preflight is public but does not query provider',async()=>{
 const h=harness();const res=await h.handle(new Request('https://safe.supabase.co/functions/v1/market-search',{method:'OPTIONS',headers:{origin:'https://www.iadcrm.com.br'}}));
 assert.equal(res.status,204);assert.equal(h.calls.length,0);
});
test('without valid bearer no provider lookup or CRM reads',async()=>{
 const h=harness(true),res=await h.handle(request({action:'search',filters:{uf:'SP',segmento:'Quimico'}},'invalid'));
 assert.equal(res.status,401);assert.equal(h.calls.length,0);
});
test('without licensed API key returns explicit 503, never fabricated companies',async()=>{
 const h=harness(),res=await h.handle(request({action:'search',filters:{uf:'SP',segmento:'Quimico'}}));
 assert.equal(res.status,503);assert.equal((await res.json()).error,'PROVIDER_NOT_CONFIGURED');
 assert.ok(!h.calls.some(c=>c.url.includes('econodata')));
});
test('DDD without official municipal mapping must fail even when city was supplied',async()=>{
 const h=harness(true),res=await h.handle(request({action:'search',filters:{uf:'SP',cidade:'Jacarei',ddd:'012',segmento:'Quimico'}}));
 assert.equal(res.status,422);assert.equal((await res.json()).error,'DDD_MAPPING_PENDING');
 assert.ok(!h.calls.some(c=>c.url.includes('econodata')));
});
test('licensed request is bounded, read-only to IaD CRM and returns source',async()=>{
 const h=harness(true),res=await h.handle(request({action:'search',filters:{uf:'SP',segmento:'Quimico',limit:20}}));
 assert.equal(res.status,200);const value=await res.json();assert.equal(value.data[0].cnpj,'11222333000181');assert.equal(value.source,'Econodata');
 assert.equal(h.calls.filter(c=>c.url.includes('/v4/companies/search_list')).length,1);
 assert.equal(h.calls.filter(c=>c.url.includes('safe.supabase.co')&&c.method!=='GET').length,0);
});
test('unsupported action import does not use provider',async()=>{
 const h=harness(true),res=await h.handle(request({action:'import',filters:{uf:'SP',segmento:'Quimico'}}));
 assert.equal(res.status,400);assert.equal(h.calls.filter(c=>c.url.includes('/v4/')).length,0);
});