import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../nuvem/funcoes/market-search/index.ts',import.meta.url),'utf8');
const URL_COMPANY='https://example.org/empresa-a';
const candidate={cnpj:'11222333000181',razaoSocial:'Empresa A',nome:'Empresa A',cidade:'Jacarei',uf:'SP',segmento:'Quimico',fontes:[{url:URL_COMPANY,titulo:'Registro verificado'}],contatos:[{nome:'Ana',cargo:'Diretora',telefone:'',fonte:URL_COMPANY}]};
const marketJSON=JSON.stringify({empresas:[candidate]});
const responseOpenAI=(search=true,cited=true)=>({
 output:[...(search?[{type:'web_search_call',action:{type:'search'}}]:[]),
 {type:'message',content:[{type:'output_text',text:marketJSON,annotations:cited?[{type:'url_citation',url:URL_COMPANY,title:'Registro verificado'}]:[]}]}],
 usage:{input_tokens:100,output_tokens:150}
});
const responseClaude=(search=true,cited=true)=>({
 content:[...(search?[{type:'server_tool_use',name:'web_search'}]:[]),
 {type:'text',text:marketJSON,citations:cited?[{type:'webpage_citation',url:URL_COMPANY,title:'Registro verificado'}]:[]}],
 usage:{input_tokens:100,output_tokens:150,server_tool_use:{web_search_requests:1}}
});
function harness({openai=false,claude=false,openaiResponse=responseOpenAI(),claudeResponse=responseClaude()}={}){
 const calls=[];let handler=null;
 const sandbox={Request,Response,AbortSignal,URL,TextDecoder,console,Deno:{env:{get(k){
  if(k==='SUPABASE_URL')return 'https://safe.supabase.co';
  if(k==='SUPABASE_ANON_KEY')return 'safe-public-key';
  if(k==='IA_CHAVE_OPENAI')return openai?'sk-test-openai':undefined;
  if(k==='IA_CHAVE_ANTHROPIC')return claude?'sk-ant-test-claude':undefined;
  if(k==='IA_MODELO_OPENAI')return 'gpt-5';
  if(k==='IA_MODELO_ANTHROPIC')return 'claude-opus-5';
 }},serve(fn){handler=fn}},fetch:async(url,opt={})=>{
  calls.push({url:String(url),method:opt.method||'GET',headers:opt.headers,body:opt.body?JSON.parse(opt.body):null});
  if(String(url).includes('/auth/v1/user'))return new Response(JSON.stringify({id:'11111111-1111-1111-1111-111111111111'}),{status:200});
  if(String(url).includes('/rest/v1/perfis'))return new Response(JSON.stringify([{tenant_id:'tenant-a',papel:'vendedor',ativo:true}]),{status:200});
  if(String(url).includes('api.openai.com/v1/responses'))return new Response(JSON.stringify(openaiResponse),{status:200});
  if(String(url).includes('api.anthropic.com/v1/messages'))return new Response(JSON.stringify(claudeResponse),{status:200});
  throw Error('unexpected request '+url);
 }};
 vm.runInNewContext(source,sandbox,{filename:'market-search/index.ts'});
 return {calls,handle:handler};
}
const validToken='Bearer '+ 'a'.repeat(110);
const request=(data,token=validToken)=>new Request('https://safe.supabase.co/functions/v1/market-search',{method:'POST',headers:{origin:'https://www.iadcrm.com.br','authorization':token,'content-type':'application/json'},body:JSON.stringify(data)});
const query={action:'search',filters:{uf:'SP',cidade:'Jacarei',segmento:'Quimico',limit:10}};
const aiCalls=h=>h.calls.filter(c=>/api.openai.com|api.anthropic.com/.test(c.url));

test('OPTIONS 204 sem corpo e sem chamadas de IA',async()=>{
 const h=harness({openai:true});
 const res=await h.handle(new Request('https://safe.supabase.co/functions/v1/market-search',{method:'OPTIONS',headers:{origin:'https://www.iadcrm.com.br'}}));
 assert.equal(res.status,204);assert.equal(h.calls.length,0);
});
test('sem JWT nao consulta a IA nem dados do CRM',async()=>{
 const h=harness({openai:true}),res=await h.handle(request(query,'invalid'));
 assert.equal(res.status,401);assert.equal(h.calls.length,0);
});
test('corpo excessivo sem Content-Length declarado recebe 413 e nao consome IA',async()=>{
 const h=harness({openai:true});
 const req=request({action:'search',filters:{...query.filters,segmento:'X'.repeat(13000)}});
 req.headers.delete('content-length');
 const res=await h.handle(req);
 assert.equal(res.status,413);assert.equal(aiCalls(h).length,0);
});
test('UTF-8 multibyte maior que 12 KB recebe 413 sem chamar IA',async()=>{
 const h=harness({openai:true});
 const req=request({action:'search',filters:{...query.filters,segmento:'á'.repeat(6200)}});
 req.headers.delete('content-length');
 const res=await h.handle(req);
 assert.equal(res.status,413);assert.equal(aiCalls(h).length,0);
});
test('corpo na faixa normal passa pelo leitor streaming',async()=>{
 const h=harness({openai:true});
 const res=await h.handle(request(query));
 assert.equal(res.status,200);assert.equal(aiCalls(h).length,1);
});
test('Content-Length falsificado nao contorna limite do corpo',async()=>{
 const h=harness({openai:true});
 const req=request({action:'search',filters:{...query.filters,segmento:'X'.repeat(13000)}});
 req.headers.set('content-length','20');
 const res=await h.handle(req);
 assert.equal(res.status,413);assert.equal(aiCalls(h).length,0);
});
test('sem chaves de IA ja configuradas retorna 503 explicito e nenhum resultado falso',async()=>{
 const h=harness(),res=await h.handle(request(query));
 assert.equal(res.status,503);assert.equal((await res.json()).error,'AI_NOT_CONFIGURED');assert.equal(aiCalls(h).length,0);
});
test('OpenAI usa Responses API, ferramenta web_search e nao reivindica cobertura total',async()=>{
 const h=harness({openai:true}),res=await h.handle(request(query));
 assert.equal(res.status,200);const result=await res.json();assert.equal(result.data.length,1);
 assert.equal(result.data[0].cnpj,candidate.cnpj);assert.equal(result.data[0].fontes[0].url,URL_COMPANY);
 assert.equal(result.total,null);assert.equal(result.coverage,'exploratoria');assert.equal(result.hasMore,false);
 const ai=aiCalls(h);assert.equal(ai.length,1);assert.match(ai[0].url,/openai.com\/v1\/responses/);
 assert.equal(ai[0].body.tools[0].type,'web_search');assert.ok(ai[0].body.max_tool_calls<=3);
});
test('se IA nao realizou pesquisa web, descartar dados gerados',async()=>{
 const h=harness({openai:true,openaiResponse:responseOpenAI(false)}),res=await h.handle(request(query));
 assert.equal(res.status,200);assert.equal((await res.json()).data.length,0);
});
test('sem fonte citada pela ferramenta web nao retornar empresa inventada',async()=>{
 const h=harness({openai:true,openaiResponse:responseOpenAI(true,false)}),res=await h.handle(request(query));
 assert.equal(res.status,200);assert.equal((await res.json()).data.length,0);
});
test('Claude usa Messages API com web_search e limite de buscas',async()=>{
 const h=harness({claude:true}),res=await h.handle(request(query));
 assert.equal(res.status,200);const body=await res.json();assert.equal(body.data.length,1);
 const ai=aiCalls(h);assert.equal(ai.length,1);assert.match(ai[0].url,/anthropic.com\/v1\/messages/);
 assert.equal(ai[0].body.tools[0].name,'web_search');assert.ok(ai[0].body.tools[0].max_uses<=3);
});
test('OpenAI + Claude podem verificar a mesma empresa sem duplicar CNPJ',async()=>{
 const h=harness({openai:true,claude:true}),res=await h.handle(request(query));
 assert.equal(res.status,200);const body=await res.json();assert.equal(body.data.length,1);
 assert.equal(aiCalls(h).length,2);assert.ok(body.providers.includes('OpenAI'));assert.ok(body.providers.includes('Anthropic'));
});
test('DDD e regiao sao aceitos como busca exploratoria, sem alegar mapa ou total exato',async()=>{
 const h=harness({openai:true}),res=await h.handle(request({action:'search',filters:{ddd:'012',regiao:'Vale do Paraiba',segmento:'Quimico'}}));
 assert.equal(res.status,200);const body=await res.json();
 assert.equal(body.coverage,'exploratoria');assert.equal(body.territoryVerified,false);
 assert.equal(body.total,null);
 const ai=aiCalls(h);assert.match(JSON.stringify(ai[0].body),/Vale do Paraiba/);
});
test('importacao e qualquer acao diferente de buscar nao dispara IA',async()=>{
 const h=harness({openai:true}),res=await h.handle(request({action:'import',filters:{uf:'SP',segmento:'Quimico'}}));
 assert.equal(res.status,400);assert.equal(aiCalls(h).length,0);
});
test('consulta de IA nao executa mutacoes no Supabase',async()=>{
 const h=harness({openai:true,claude:true}),res=await h.handle(request(query));
 assert.equal(res.status,200);
 assert.equal(h.calls.filter(c=>c.url.includes('safe.supabase.co')&&c.method!=='GET').length,0);
});