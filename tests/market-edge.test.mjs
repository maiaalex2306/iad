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
function harness({openai=false,claude=false,role='vendedor',quotaAllowed=true,quotaUnavailable=false,openaiStatus=200,claudeStatus=200,openaiResponse=responseOpenAI(),claudeResponse=responseClaude()}={}){
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
  if(String(url).includes('/rest/v1/perfis'))return new Response(JSON.stringify([{tenant_id:'tenant-a',papel:role,ativo:true}]),{status:200});
  if(String(url).includes('/rest/v1/rpc/iad_market_search_reserve'))return quotaUnavailable?new Response(JSON.stringify({message:'quota backend unavailable'}),{status:503}):new Response(JSON.stringify({allowed:quotaAllowed,scope:quotaAllowed?'ok':'user',remaining:quotaAllowed?2:0}),{status:200});
  if(String(url).includes('api.openai.com/v1/responses'))return new Response(JSON.stringify(openaiResponse),{status:openaiStatus});
  if(String(url).includes('api.anthropic.com/v1/messages'))return new Response(JSON.stringify(claudeResponse),{status:claudeStatus});
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
test('UF contraria ao filtro exclui empresa embora citada e com CNPJ valido',async()=>{
 const mismatched={...candidate,uf:'RJ'};
 const r=responseOpenAI();r.output[1].content[0].text=JSON.stringify({empresas:[mismatched]});
 const h=harness({openai:true,openaiResponse:r}),res=await h.handle(request(query));
 assert.equal(res.status,200);assert.equal((await res.json()).data.length,0);
});
test('cidade contraria ao filtro exclui empresa; comparacao ignora acentos',async()=>{
 const different={...candidate,cidade:'Campinas'};
 const r=responseOpenAI();r.output[1].content[0].text=JSON.stringify({empresas:[different]});
 const h=harness({openai:true,openaiResponse:r}),res=await h.handle(request(query));
 assert.equal(res.status,200);assert.equal((await res.json()).data.length,0);
 const accented={...candidate,cidade:'Jacareí'};
 const r2=responseOpenAI();r2.output[1].content[0].text=JSON.stringify({empresas:[accented]});
 const h2=harness({openai:true,openaiResponse:r2}),res2=await h2.handle(request(query));
 assert.equal(res2.status,200);assert.equal((await res2.json()).data.length,1);
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
 assert.equal(h.calls.filter(c=>c.url.includes('safe.supabase.co')&&c.method!=='GET'&&!c.url.includes('/rpc/iad_market_search_reserve')).length,0);
});
test('cada pesquisa reserva quota transacional antes de chamar provedores',async()=>{
 const h=harness({openai:true,claude:true}),res=await h.handle(request(query));
 assert.equal(res.status,200);
 const idx=h.calls.findIndex(c=>c.url.includes('/rest/v1/rpc/iad_market_search_reserve'));
 const aiIdx=h.calls.findIndex(c=>/api.openai.com|api.anthropic.com/.test(c.url));
 assert.ok(idx>=0,'quota RPC não foi chamada');
 assert.ok(aiIdx>idx,'quota precisa anteceder qualquer chamada de IA');
 assert.equal(h.calls[idx].method,'POST');
 assert.equal(h.calls[idx].body!==null,true);
});
test('quota esgotada retorna 429 sem custo OpenAI ou Claude',async()=>{
 const h=harness({openai:true,claude:true,quotaAllowed:false});
 const res=await h.handle(request(query));
 assert.equal(res.status,429);
 assert.equal((await res.json()).error,'SEARCH_QUOTA_EXCEEDED');
 assert.equal(aiCalls(h).length,0);
});
test('controle de quota indisponivel falha fechado e nao cobra IA',async()=>{
 const h=harness({openai:true,claude:true,quotaUnavailable:true});
 const res=await h.handle(request(query));
 assert.equal(res.status,503);
 assert.equal((await res.json()).error,'SEARCH_QUOTA_UNAVAILABLE');
 assert.equal(aiCalls(h).length,0);
});


test('ChatGPT e Claude complementam decisores de mesmo CNPJ sem perder fontes',async()=>{
 const verified='https://example.org/equipe-diretiva';
 const unverified='https://example.org/sem-prova';
 const second={...candidate,fontes:[{url:verified,titulo:'Equipe executiva'}],
  contatos:[
   {nome:'Bruna',cargo:'Diretora Comercial',email:'',telefone:'',fonte:verified},
   {nome:'Contato Inventado',cargo:'CEO',email:'',telefone:'',fonte:unverified}
  ]};
 const claudeResponse=responseClaude();
 claudeResponse.content[1].text=JSON.stringify({empresas:[second]});
 claudeResponse.content[1].citations=[{type:'webpage_citation',url:verified,title:'Equipe executiva'}];
 const h=harness({openai:true,claude:true,claudeResponse});
 const res=await h.handle(request(query));
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.data.length,1,'CNPJ repetido nao pode duplicar empresa');
 assert.deepEqual([...body.data[0].contatos.map(x=>x.nome)].sort(),['Ana','Bruna']);
 assert.deepEqual([...body.data[0].fontes.map(x=>x.url)].sort(),[URL_COMPANY,verified].sort());
 assert.ok(!body.data[0].contatos.some(c=>c.nome==='Contato Inventado'));
});

test('mesmo CNPJ com cidades divergentes entre IAs sinaliza conflito em vez de confirmar localizacao',async()=>{
 const second={...candidate,cidade:'Campinas'};
 const claudeResponse=responseClaude();
 claudeResponse.content[1].text=JSON.stringify({empresas:[second]});
 const h=harness({openai:true,claude:true,claudeResponse});
 const ufOnly={action:'search',filters:{uf:'SP',segmento:'Quimico',limit:10}};
 const res=await h.handle(request(ufOnly));
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.data.length,1);
 const company=body.data[0];
 assert.equal(company.cidade,'Jacarei');
 assert.ok(Array.isArray(company.conflitos),'deve explicitar divergencias');
 assert.ok(company.conflitos.some(x=>x.campo==='cidade'&&x.valorOriginal==='Jacarei'&&x.valorDivergente==='Campinas'));
 assert.equal(company.territorioCorroborado,false);
});

test('falha apenas do Claude sinaliza pesquisa parcial sem ocultar provedor indisponivel',async()=>{
 const h=harness({openai:true,claude:true,claudeStatus:429});
 const res=await h.handle(request(query));
 assert.equal(res.status,200);
 const result=await res.json();
 assert.equal(result.partial,true);
 assert.deepEqual(Array.from(result.failedProviders),['Anthropic']);
 assert.deepEqual(Array.from(result.providers),['OpenAI']);
 assert.equal(result.data.length,1);
});
test('falha apenas do ChatGPT sinaliza pesquisa parcial com Claude disponivel',async()=>{
 const h=harness({openai:true,claude:true,openaiStatus:503});
 const res=await h.handle(request(query));
 assert.equal(res.status,200);
 const result=await res.json();
 assert.equal(result.partial,true);
 assert.deepEqual(Array.from(result.failedProviders),['OpenAI']);
 assert.deepEqual(Array.from(result.providers),['Anthropic']);
 assert.equal(result.data.length,1);
});
test('falha de ambos provedores retorna 502 e nao lista empresas',async()=>{
 const h=harness({openai:true,claude:true,openaiStatus:503,claudeStatus:429});
 const res=await h.handle(request(query));
 assert.equal(res.status,502);
 assert.equal((await res.json()).error,'AI_SEARCH_UNAVAILABLE');
});

test('pesquisa de ambas IAs devolve uso auditavel por provedor sem estimar custo inexistente',async()=>{
 const h=harness({openai:true,claude:true});
 const res=await h.handle(request(query));
 assert.equal(res.status,200);
 const body=await res.json();
 assert.deepEqual(Array.from(body.usage.map(u=>u.provider)),['OpenAI','Anthropic']);
 assert.equal(body.usage[0].inputTokens,100);
 assert.equal(body.usage[0].outputTokens,150);
 assert.equal(body.usage[0].webSearchRequests,1);
 assert.equal(body.usage[1].inputTokens,100);
 assert.equal(body.usage[1].outputTokens,150);
 assert.equal(body.usage[1].webSearchRequests,1);
 assert.equal(body.usage[0].costBRL,null);
 assert.equal(body.usage[1].costBRL,null);
});
test('falha parcial exibe uso somente do provedor concluido',async()=>{
 const h=harness({openai:true,claude:true,claudeStatus:503});
 const res=await h.handle(request(query));
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.partial,true);
 assert.deepEqual(Array.from(body.usage.map(u=>u.provider)),['OpenAI']);
});

test('papel real usuario do CRM pode pesquisar com JWT valido e quota autorizada',async()=>{
 const h=harness({openai:true,role:'usuario'});
 const res=await h.handle(request(query));
 assert.equal(res.status,200);
 assert.equal(aiCalls(h).length,1);
 assert.ok(h.calls.some(c=>c.url.includes('/rest/v1/rpc/iad_market_search_reserve')));
});
test('papel estranho nao pode gerar custo com IA',async()=>{
 const h=harness({openai:true,role:'externo'});
 const res=await h.handle(request(query));
 assert.equal(res.status,403);
 assert.equal(aiCalls(h).length,0);
});
