import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../nuvem/funcoes/market-search/index.ts',import.meta.url),'utf8');
const URL_COMPANY='https://example.org/empresa-a';
const candidate={cnpj:'11222333000181',razaoSocial:'Empresa A',nome:'Empresa A',cidade:'Jacarei',uf:'SP',segmento:'Quimico',fontes:[{url:URL_COMPANY,titulo:'Registro verificado'}],contatos:[{nome:'Ana',cargo:'Diretora',telefone:'',fonte:URL_COMPANY}]};
const marketJSON=JSON.stringify({empresas:[candidate]});
const responseOpenAI=(search=true,cited=true)=>({
 status:'completed',output:[...(search?[{type:'web_search_call',status:'completed',action:{type:'search'}}]:[]),
 {type:'message',content:[{type:'output_text',text:marketJSON,annotations:cited?[{type:'url_citation',url:URL_COMPANY,title:'Registro verificado'}]:[]}]}],
 usage:{input_tokens:100,output_tokens:150}
});
const responseClaude=(search=true,cited=true)=>({
 stop_reason:'end_turn',
 content:[...(search?[{type:'server_tool_use',id:'srvtoolu_mockvalid',name:'web_search'},
 {type:'web_search_tool_result',tool_use_id:'srvtoolu_mockvalid',content:[{type:'web_search_result',url:URL_COMPANY,title:'Registro verificado'}]}]:[]),
 {type:'text',text:marketJSON,citations:cited?[{type:'webpage_citation',url:URL_COMPANY,title:'Registro verificado'}]:[]}],
 usage:{input_tokens:100,output_tokens:150,server_tool_use:{web_search_requests:1}}
});
function harness({supabaseUrl='https://safe.supabase.co',anonMode='legacy',openai=false,claude=false,role='usuario',quotaAllowed=true,quotaUnavailable=false,openaiStatus=200,claudeStatus=200,catalogNames=['Química e Petroquímica'],catalogStatus=200,openaiResponse=responseOpenAI(),claudeResponse=responseClaude()}={}){
 const calls=[];let handler=null;
 const sandbox={Request,Response,AbortSignal,URL,TextDecoder,console,Deno:{env:{get(k){
  if(k==='SUPABASE_URL')return supabaseUrl;
  if(k==='SUPABASE_ANON_KEY')return anonMode==='legacy'?'safe-public-key':undefined;
  if(k==='IAD_CHAVE_PUBLICA')return anonMode==='iad'?'safe-public-key':undefined;
  if(k==='SUPABASE_PUBLISHABLE_KEY')return anonMode==='publishable'?'safe-public-key':undefined;
  if(k==='IA_CHAVE_OPENAI')return openai?'sk-test-openai':undefined;
  if(k==='IA_CHAVE_ANTHROPIC')return claude?'sk-ant-test-claude':undefined;
  if(k==='IA_MODELO_OPENAI')return 'gpt-5';
  if(k==='IA_MODELO_ANTHROPIC')return 'claude-opus-5';
 }},serve(fn){handler=fn}},fetch:async(url,opt={})=>{
  calls.push({url:String(url),method:opt.method||'GET',headers:opt.headers,body:opt.body?JSON.parse(opt.body):null});
  if(String(url).includes('/auth/v1/user'))return new Response(JSON.stringify({id:'11111111-1111-1111-1111-111111111111'}),{status:200});
  if(String(url).includes('/rest/v1/perfis'))return new Response(JSON.stringify([{tenant_id:'tenant-a',papel:role,ativo:true}]),{status:200});
  if(String(url).includes('/rest/v1/segmentos'))return new Response(JSON.stringify(catalogNames.map(nome=>({nome,ativo:true}))),{status:catalogStatus});
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
 assert.equal(result.total,null);assert.equal(result.coverage,'exploratoria');assert.equal(result.hasMore,null);assert.equal(result.coverageStatus,'unknown');
 const ai=aiCalls(h);assert.equal(ai.length,1);assert.match(ai[0].url,/openai.com\/v1\/responses/);
 assert.equal(ai[0].body.tools[0].type,'web_search');assert.ok(ai[0].body.max_tool_calls<=3);
});
test('se IA nao realizou pesquisa web, descartar dados gerados',async()=>{
 const h=harness({openai:true,openaiResponse:responseOpenAI(false)}),res=await h.handle(request(query));
 assert.equal(res.status,502);
 const body=await res.json();
 assert.equal(body.error,'AI_SEARCH_UNAVAILABLE');
 assert.deepEqual(Array.from(body.failedProviders),['OpenAI']);
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
 claudeResponse.content.find(b=>b.type==='text').text=JSON.stringify({empresas:[second]});
 claudeResponse.content.find(b=>b.type==='text').citations=[{type:'webpage_citation',url:verified,title:'Equipe executiva'}];
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
 claudeResponse.content.find(b=>b.type==='text').text=JSON.stringify({empresas:[second]});
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

test('JSON sem execucao da ferramenta web nao e pesquisa valida',async()=>{
 const h=harness({openai:true,claude:true,openaiResponse:responseOpenAI(false),claudeResponse:responseClaude(false)});
 const res=await h.handle(request(query));
 assert.equal(res.status,502);
 assert.deepEqual(Array.from((await res.json()).failedProviders),['OpenAI','Anthropic']);
});
test('provedor sem ferramenta web e contabilizado como falha parcial',async()=>{
 const h=harness({openai:true,claude:true,claudeResponse:responseClaude(false)});
 const res=await h.handle(request(query));
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.partial,true);
 assert.deepEqual(Array.from(body.failedProviders),['Anthropic']);
});

test('limite de 20 ou 50 empresas nao significa exaustao do universo territorial',async()=>{
 const h=harness({openai:true,claude:true});
 const res=await h.handle(request({action:'search',filters:{uf:'SP',regiao:'Vale do Paraiba',segmento:'Quimico',limit:50}}));
 assert.equal(res.status,200);
 const result=await res.json();
 assert.equal(result.total,null);
 assert.equal(result.hasMore,null,'A busca exploratoria nao possui conhecimento sobre paginas restantes');
 assert.equal(result.coverage,'exploratoria');
 assert.equal(result.coverageStatus,'unknown');
});

test('rejeita no motor de pesquisa CNPJ com raiz repetitiva e digitos coerentes',async()=>{
 const fake={...candidate,cnpj:'11111111111180'};
 const provider=responseOpenAI();
 provider.output.find(x=>x.type==='message').content[0].text=JSON.stringify({empresas:[fake]});
 const h=harness({openai:true,openaiResponse:provider});
 const response=await h.handle(request(query));
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.data.length,0,'raiz CNPJ repetitiva jamais deve entrar nos leads do vendedor');
});
test('rejeita no motor de pesquisa CNPJ com digitos verificadores incorretos',async()=>{
 const fake={...candidate,cnpj:'11222333000182'};
 const provider=responseOpenAI();
 provider.output.find(x=>x.type==='message').content[0].text=JSON.stringify({empresas:[fake]});
 const h=harness({openai:true,openaiResponse:provider});
 const response=await h.handle(request(query));
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.data.length,0);
});


test('OpenAI com web_search_call em status failed nao certifica pesquisa mesmo com JSON e fontes',async()=>{
 const bad=responseOpenAI(true,true);
 bad.output.find(b=>b.type==='web_search_call').status='failed';
 const h=harness({openai:true,openaiResponse:bad});
 const res=await h.handle(request(query));
 assert.equal(res.status,502);
 const body=await res.json();
 assert.equal(body.error,'AI_SEARCH_UNAVAILABLE');
 assert.deepEqual(Array.from(body.failedProviders),['OpenAI']);
});
test('Claude com erro interno no web_search_tool_result nao certifica pesquisa HTTP 200',async()=>{
 const bad=responseClaude(true,true);
 const call=bad.content.find(b=>b.type==='server_tool_use');
 call.id='srvtoolu_mockfailed';
 bad.content.splice(1,1,{
  type:'web_search_tool_result',
  tool_use_id:call.id,
  content:{type:'web_search_tool_result_error',error_code:'unavailable'}
 });
 const h=harness({claude:true,claudeResponse:bad});
 const res=await h.handle(request(query));
 assert.equal(res.status,502);
 const body=await res.json();
 assert.equal(body.error,'AI_SEARCH_UNAVAILABLE');
 assert.deepEqual(Array.from(body.failedProviders),['Anthropic']);
});
test('Claude que falha ferramenta web e OpenAI que conclui deve retornar pesquisa parcial',async()=>{
 const bad=responseClaude(true,true);
 const call=bad.content.find(b=>b.type==='server_tool_use');
 call.id='srvtoolu_mockfailed';
 bad.content.splice(1,1,{type:'web_search_tool_result',tool_use_id:call.id,content:{type:'web_search_tool_result_error',error_code:'too_many_requests'}});
 const h=harness({openai:true,claude:true,claudeResponse:bad});
 const res=await h.handle(request(query));
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.partial,true);
 assert.deepEqual(Array.from(body.providers),['OpenAI']);
 assert.deepEqual(Array.from(body.failedProviders),['Anthropic']);
 assert.equal(body.data.length,1);
});
test('OpenAI com resposta incompleta nao certifica pesquisa embora tenha chamado web',async()=>{
 const bad=responseOpenAI(true,true);bad.status='incomplete';
 const h=harness({openai:true,openaiResponse:bad});
 const res=await h.handle(request(query));
 assert.equal(res.status,502);
});
test('Claude com pause_turn nao certifica pesquisa terminada',async()=>{
 const incomplete=responseClaude(true,true);incomplete.stop_reason='pause_turn';
 const h=harness({claude:true,claudeResponse:incomplete});
 const res=await h.handle(request(query));
 assert.equal(res.status,502);
});

test('usa chave publica IAD ja existente quando SUPABASE_ANON_KEY nao esta definida',async()=>{
 const h=harness({openai:true,anonMode:'iad'}),res=await h.handle(request(query));
 assert.equal(res.status,200);
 assert.equal(aiCalls(h).length,1);
});
test('aceita SUPABASE_PUBLISHABLE_KEY existente com login e cota validados',async()=>{
 const h=harness({claude:true,anonMode:'publishable'}),res=await h.handle(request(query));
 assert.equal(res.status,200);
 assert.equal(aiCalls(h).length,1);
});
test('nao permite pesquisa com auth sem chave publica alguma',async()=>{
 const h=harness({openai:true,anonMode:'missing'}),res=await h.handle(request(query));
 assert.equal(res.status,503);
 assert.equal((await res.json()).error,'SERVER_NOT_CONFIGURED');
 assert.equal(aiCalls(h).length,0);
});

test('piloto de producao bloqueia usuario comum antes da quota e das IAs',async()=>{
 const h=harness({supabaseUrl:'https://drhonmdffhnwamwzynrs.supabase.co',openai:true,role:'usuario'});
 const res=await h.handle(request(query));
 assert.equal(res.status,403);
 assert.equal((await res.json()).error,'PILOT_ADMIN_OR_MANAGER_ONLY');
 assert.equal(aiCalls(h).length,0);
 assert.ok(!h.calls.some(x=>x.url.includes('/rpc/iad_market_search_reserve')));
});
test('piloto de producao permite gestor autenticado com quota e pesquisa',async()=>{
 const h=harness({supabaseUrl:'https://drhonmdffhnwamwzynrs.supabase.co',openai:true,role:'gestor'});
 const res=await h.handle(request(query));
 assert.equal(res.status,200);
 assert.equal(aiCalls(h).length,1);
 assert.ok(h.calls.some(x=>x.url.includes('/rpc/iad_market_search_reserve')));
});
test('piloto de producao permite administrador autenticado, respeitando quota',async()=>{
 const h=harness({supabaseUrl:'https://drhonmdffhnwamwzynrs.supabase.co',openai:true,role:'admin'});
 const res=await h.handle(request(query));
 assert.equal(res.status,200);
 assert.equal(aiCalls(h).length,1);
 assert.ok(h.calls.some(x=>x.url.includes('/rpc/iad_market_search_reserve')));
});
test('ambiente de homologacao continua permitindo papel usuario com quota',async()=>{
 const h=harness({supabaseUrl:'https://bvlfzeblpewlqhssprpv.supabase.co',openai:true,role:'usuario'});
 const res=await h.handle(request(query));
 assert.equal(res.status,200);
 assert.equal(aiCalls(h).length,1);
});

// Prevent regression to the 35s abort that caused both production providers
// to fail after ~36s. Supabase request idle timeout is 150s.
test('tempo maximo de busca maior que 35s e menor que idle 150s, sem retry',()=>{
 // The timeout is now in an explicit transport try/catch.
 assert.match(source,/AbortSignal\.timeout\(80000\)/);
 assert.doesNotMatch(source,/AbortSignal\.timeout\(35000\)/);
 assert.match(source,/category:code,elapsedMs:/);
 assert.match(source,/provider_http/);
 assert.match(source,/provider_invalid_json/);
 assert.match(source,/search_context_size:'low'/);
});

test('preserva candidata com nome e fonte web mas sem CNPJ',async()=>{
 const response=responseOpenAI();
 response.output.find(b=>b.type==='message').content[0].text=JSON.stringify({empresas:[{...candidate,cnpj:null}]});
 const h=harness({openai:true,openaiResponse:response}),res=await h.handle(request(query));
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.data.length,1);
 assert.equal(body.data[0].cnpj,'');
 assert.equal(body.data[0].identidadeStatus,'pendente_cnpj');
});
test('sem CNPJ e sem citacao registrada nao gera candidata',async()=>{
 const response=responseOpenAI(true,false);
 response.output.find(b=>b.type==='message').content[0].text=JSON.stringify({empresas:[{...candidate,cnpj:null}]});
 const h=harness({openai:true,openaiResponse:response}),res=await h.handle(request(query));
 assert.equal(res.status,200);
 assert.equal((await res.json()).data.length,0);
});

test('modo ChatGPT consulta apenas OpenAI e preserva quota',async()=>{
 const h=harness({openai:true,claude:true});
 const res=await h.handle(request({...query,provider:'OpenAI'}));
 assert.equal(res.status,200);
 assert.equal(aiCalls(h).length,1);
 assert.match(aiCalls(h)[0].url,/api.openai.com/);
 assert.deepEqual(Array.from((await res.json()).providers),['OpenAI']);
});
test('modo Claude consulta apenas Anthropic e preserva quota',async()=>{
 const h=harness({openai:true,claude:true});
 const res=await h.handle(request({...query,provider:'Anthropic'}));
 assert.equal(res.status,200);
 assert.equal(aiCalls(h).length,1);
 assert.match(aiCalls(h)[0].url,/api.anthropic.com/);
 assert.deepEqual(Array.from((await res.json()).providers),['Anthropic']);
});
test('provedor desconhecido retorna 422 antes de reservar quota',async()=>{
 const h=harness({openai:true,claude:true});
 const res=await h.handle(request({...query,provider:'external'}));
 assert.equal(res.status,422);
 assert.equal((await res.json()).error,'INVALID_PROVIDER');
 assert.equal(h.calls.some(x=>x.url.includes('/iad_market_search_reserve')),false);
 assert.equal(aiCalls(h).length,0);
});
test('provedor sem chave retorna 503 antes de reservar quota',async()=>{
 const h=harness({openai:true,claude:false});
 const res=await h.handle(request({...query,provider:'Anthropic'}));
 assert.equal(res.status,503);
 assert.equal((await res.json()).error,'AI_PROVIDER_NOT_CONFIGURED');
 assert.equal(h.calls.some(x=>x.url.includes('/iad_market_search_reserve')),false);
 assert.equal(aiCalls(h).length,0);
});
test('erro HTTP classificado aparece por motor sem dados privados',async()=>{
 const h=harness({openai:true,claude:true,openaiStatus:429,claudeStatus:503});
 const res=await h.handle(request(query));
 assert.equal(res.status,502);
 const body=await res.json();
 assert.equal(body.error,'AI_SEARCH_UNAVAILABLE');
 assert.deepEqual(Array.from(body.failures.map(x=>x.provider)),['OpenAI','Anthropic']);
 assert.deepEqual(Array.from(body.failures.map(x=>x.category)),['IA_HTTP_429','IA_HTTP_503']);
 assert.equal(JSON.stringify(body).includes('sk-test-openai'),false);
});
test('falha de Claude retorna 200 parcial com motivo e dados de OpenAI',async()=>{
 const h=harness({openai:true,claude:true,claudeStatus:429});
 const res=await h.handle(request(query));
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.partial,true);
 assert.deepEqual(Array.from(body.failures.map(x=>x.category)),['IA_HTTP_429']);
 assert.equal(body.data.length,1);
});

const multiFilters={uf:'SP',municipios:[{codigoIBGE:'3530607',nome:'Mogi das Cruzes',uf:'SP'}],
 ddds:['11'],segmentos:['Química e Petroquímica'],faixasFuncionarios:['201_500','501_1000'],limit:20};
const marketMogi={...candidate,cidade:'Mogi das Cruzes',segmento:'Química e Petroquímica',funcionarios:205};
function multiProvider(candidateEntry){
 const response=responseOpenAI();
 response.output.find(b=>b.type==='message').content[0].text=JSON.stringify({empresas:[candidateEntry]});
 return response;
}
test('filtros de demonstracao SP/Mogi/DDD11/quimica/faixas: valida catalogo do tenant antes da quota',async()=>{
 const h=harness({openai:true,openaiResponse:multiProvider(marketMogi)});
 const res=await h.handle(request({action:'search',provider:'OpenAI',filters:multiFilters}));
 assert.equal(res.status,200);const body=await res.json();
 assert.equal(body.data.length,1);
 assert.equal(body.data[0].faixaFuncionariosStatus,'aderente_nao_verificado');
 const segmentCall=h.calls.find(c=>c.url.includes('/rest/v1/segmentos'));
 const quotaCall=h.calls.find(c=>c.url.includes('iad_market_search_reserve'));
 assert.ok(segmentCall.url.includes('tenant_id=eq.tenant-a'));
 assert.ok(h.calls.indexOf(segmentCall)<h.calls.indexOf(quotaCall));
 assert.equal(aiCalls(h).length,1);
 assert.deepEqual(Array.from(aiCalls(h)[0].body?.input.match(/"faixasFuncionarios":\[[^\]]+\]/g)||[]).length,1);
});
test('OR entre faixas inclui 600 funcionarios, exclui 200 e mantem ausentes pendentes',async()=>{
 for(const [employees,size,status] of [[600,1,'aderente_nao_verificado'],[200,0,null],[null,1,'pendente']]){
  const h=harness({openai:true,openaiResponse:multiProvider({...marketMogi,funcionarios:employees})});
  const res=await h.handle(request({action:'search',provider:'OpenAI',filters:multiFilters}));
  assert.equal(res.status,200);
  const body=await res.json();assert.equal(body.data.length,size);
  if(size)assert.equal(body.data[0].faixaFuncionariosStatus,status);
 }
});
test('municipio com prefixo IBGE de outro estado falha antes de reservar quota',async()=>{
 const h=harness({openai:true});
 const res=await h.handle(request({action:'search',filters:{...multiFilters,municipios:[{codigoIBGE:'3304557',nome:'Rio de Janeiro',uf:'SP'}]}}));
 assert.equal(res.status,422);assert.equal(aiCalls(h).length,0);
 assert.ok(!h.calls.some(c=>c.url.includes('iad_market_search_reserve')));
});
test('segmento de outro tenant falha antes da quota, sem vazamento de catalogo',async()=>{
 const h=harness({openai:true,catalogNames:['Alimentos']});
 const res=await h.handle(request({action:'search',filters:multiFilters}));
 assert.equal(res.status,422);
 assert.equal((await res.json()).error,'SEGMENT_NOT_AUTHORIZED');
 assert.ok(!h.calls.some(c=>c.url.includes('iad_market_search_reserve')));
 assert.equal(aiCalls(h).length,0);
});
test('falha na consulta do catalogo falha fechada antes de gastar credito',async()=>{
 const h=harness({openai:true,catalogStatus:503});
 const res=await h.handle(request({action:'search',filters:multiFilters}));
 assert.equal(res.status,503);
 assert.equal((await res.json()).error,'SEGMENT_CATALOG_UNAVAILABLE');
 assert.equal(aiCalls(h).length,0);
});
test('múltiplos municipios respeitam OR, cidade fora do conjunto nao entra',async()=>{
 const filters={...multiFilters,municipios:[multiFilters.municipios[0],{codigoIBGE:'3549904',nome:'São José dos Campos',uf:'SP'}]};
 for(const [name,count] of [['Mogi das Cruzes',1],['São José dos Campos',1],['Campinas',0]]){
  const h=harness({openai:true,openaiResponse:multiProvider({...marketMogi,cidade:name})});
  const res=await h.handle(request({action:'search',filters}));
  assert.equal(res.status,200);
  assert.equal((await res.json()).data.length,count);
 }
});
test('faixas sem sobreposicao e DDD nao reconhecido: erro antes da quota',async()=>{
 const h=harness({openai:true});
 for(const invalid of [{...multiFilters,faixasFuncionarios:['0_10','201_500','invalid']},{...multiFilters,ddds:['00']},{...multiFilters,municipios:Array.from({length:16},(_,i)=>({...multiFilters.municipios[0],codigoIBGE:String(3530607+i)}))}]){
  const res=await h.handle(request({action:'search',filters:invalid}));
  assert.equal(res.status,422);
 }
 assert.equal(aiCalls(h).length,0);
 assert.equal(h.calls.filter(c=>c.url.includes('iad_market_search_reserve')).length,0);
});

test('RI-M03: todos os criterios declarados ainda sao nao verificados documentalmente',async()=>{
 const mock={...marketMogi,ddd:'11',funcionarios:205};
 const h=harness({openai:true,openaiResponse:multiProvider(mock)});
 const response=await h.handle(request({action:'search',provider:'OpenAI',filters:multiFilters}));
 assert.equal(response.status,200);
 const item=(await response.json()).data[0];assert.ok(item);
 assert.equal(item.qualificacaoICP.municipio,'declarado');
 assert.equal(item.qualificacaoICP.ddd,'declarado');
 assert.equal(item.qualificacaoICP.segmento,'declarado');
 assert.equal(item.qualificacaoICP.funcionarios,'declarado');
 assert.equal(item.qualificacaoICP.statusGeral,'declarado_nao_verificado');
 assert.equal(item.territorioCorroborado,false);
});
test('RI-M03: sem DDD, sem funcionarios e sem segmento a candidata permanece pendente',async()=>{
 const mock={...marketMogi,ddd:null,funcionarios:null,segmento:null};
 const h=harness({openai:true,openaiResponse:multiProvider(mock)});
 const response=await h.handle(request({action:'search',provider:'OpenAI',filters:multiFilters}));
 assert.equal(response.status,200);
 const item=(await response.json()).data[0];assert.ok(item);
 assert.equal(item.qualificacaoICP.ddd,'pendente');
 assert.equal(item.qualificacaoICP.funcionarios,'pendente');
 assert.equal(item.qualificacaoICP.segmento,'pendente');
 assert.equal(item.qualificacaoICP.statusGeral,'pendente');
});
test('RI-M03: sinonimo setorial nao recebe falsa confirmacao automatica',async()=>{
 const mock={...marketMogi,ddd:'11',segmento:'Industria quimica'};
 const h=harness({openai:true,openaiResponse:multiProvider(mock)});
 const response=await h.handle(request({action:'search',provider:'OpenAI',filters:multiFilters}));
 assert.equal(response.status,200);
 const item=(await response.json()).data[0];assert.ok(item);
 assert.equal(item.qualificacaoICP.segmento,'a_confirmar');
 assert.equal(item.qualificacaoICP.statusGeral,'pendente');
});
test('RI-M03: DDD explicitamente divergente continua fora do recorte',async()=>{
 const h=harness({openai:true,openaiResponse:multiProvider({...marketMogi,ddd:'12'})});
 const response=await h.handle(request({action:'search',provider:'OpenAI',filters:multiFilters}));
 assert.equal(response.status,200);assert.equal((await response.json()).data.length,0);
});
