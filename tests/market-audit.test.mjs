import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountMarketResearchMetrics} from '../src/ri/market-audit.mjs';

const sql=readFileSync(new URL('../nuvem/sql/ri-m11-market-research-audit.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL('../nuvem/funcoes/market-search/index.ts',import.meta.url),'utf8');
test('RI-M11: tabela auditável sem PII, esquema com RLS e somente service_role',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.iad_market_research_runs/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON public\.iad_market_research_runs FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT SELECT,INSERT,UPDATE ON public\.iad_market_research_runs TO service_role/);
 assert.doesNotMatch(sql,/^\s*(email|telefone|whatsapp|linkedin|prompt|source_url|razaoSocial)\s+(text|varchar|uuid)/im);
 assert.match(edge,/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
 assert.match(edge,/if\(!service\)return output\(\{error:'RESEARCH_AUDIT_UNAVAILABLE'\}/);
 assert.ok(edge.indexOf('auditStart(url,service')<edge.indexOf('const jobs=[]'));
});
class Node {
 constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.listeners=new Map();this.textContent='';this.disabled=false;}
 append(...nodes){this.children.push(...nodes);}
 appendChild(node){this.append(node);return node;}
 replaceChildren(...nodes){this.children=nodes;}
 addEventListener(name,callback){this.listeners.set(name,callback);}
 async fire(name){await this.listeners.get(name)?.();}
}
function dom(){
 const doc={};doc.createElement=tag=>new Node(tag,doc);
 const root=new Node('div',doc);
 const walk=(node,fn)=>fn(node)?node:node.children.map(n=>walk(n,fn)).find(Boolean);
 return {doc,root,walk};
}
test('RI-M11: painel consulta só métricas e nunca faz pesquisa paga nem escrita',async()=>{
 const {doc,root,walk}=dom(),prior=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,opt)=>{
  requests.push({url:String(url),options:opt,body:JSON.parse(opt.body)});
  return new Response(JSON.stringify({action:'metrics',metrics:{
   scope:'tenant',executions:3,completed:1,partial:1,failed:1,inProgress:0,
   staleStarted:0,webSearches:4,citedSources:5,recordsReturned:2,
   actions:{search:1,investigate:1,signals:1,enrich:0},truncated:false
  }}),{status:200});
 };
 try{
  const stop=mountMarketResearchMetrics({root,doc,
   valid:()=>true,nuvem:{sessao:()=>({access_token:'jwt-test'}),
    config:()=>({url:'https://staging.supabase.co',chave:'public-key'})}});
  assert.equal(requests.length,0);
  const button=walk(root,x=>x.tagName==='button'&&x.textContent.includes('ATUALIZAR INDICADORES'));
  assert.ok(button);await button.fire('click');
  assert.equal(requests.length,1);
  assert.deepEqual(requests[0].body,{action:'metrics'});
  assert.equal(requests[0].options.method,'POST');
  assert.ok(!requests.some(x=>/api\.openai|anthropic\.com|market_import_confirmed/.test(x.url)));
  assert.ok(walk(root,x=>x.textContent.includes('Execuções registradas: 3')));
  stop();
 }finally{globalThis.fetch=prior;}
});
test('RI-M11: painel sem sessão recusa HTTP',async()=>{
 const {doc,root,walk}=dom(),prior=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
 try{
  mountMarketResearchMetrics({root,doc,valid:()=>true,nuvem:{
   sessao:()=>null,config:()=>({})}});
  await walk(root,x=>x.tagName==='button').fire('click');
  assert.equal(calls,0);
  assert.ok(walk(root,x=>x.textContent.includes('Sessão autenticada necessária')));
 }finally{globalThis.fetch=prior;}
});
