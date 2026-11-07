import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detectCommercialIntents,validateAiIntents,buyerMessagesFromTranscript}
 from '../src/ri/conversation-intent.mjs';
import {buildCommercialOpportunityRadar} from '../src/ri/opportunity-radar.mjs';
import {buildCachedCommercialRadar} from '../src/ri/account-view.mjs';

const base={tenantId:'empresa-a',donoId:'gestor-a'};
function fixture(){
 const conta={...base,id:'conta-a',nome:'Indústria Alfa',segmento:'Químicos'};
 const op={...base,id:'op-a',contaId:'conta-a',origem:'Linked Helper',sdr:'Rosa Oliveira',eventos:[
  {id:'evento-1',tipo:'sistema',data:'2026-11-05',
   titulo:'Conversa no LinkedIn com Rosa Oliveira (2 mensagens)',
   detalhe:'05/11/2026 · Rosa Oliveira: Nosso monitoramento pode ajudar na ETE e água\n'+
    '05/11/2026 · Maria Compradora: Queremos reduzir o consumo de água e modernizar nossa ETE. Podemos conversar?'},
  {id:'evento-2',tipo:'decision',canal:'LinkedIn',data:'2026-11-05',
   titulo:'Queremos reduzir o consumo de água e modernizar nossa ETE. Podemos conversar?'}
 ]};
 return {contas:[conta],oportunidades:[op],produtos:[],tarefas:[],sinais:[]};
}
const scope={role:'gestor',userId:'user-a',tenantId:'empresa-a'};

test('pedido para conhecer soluções aparece como interesse explicito',()=>{
 const out=detectCommercialIntents('Bom dia! Quero conhecer as soluções de vocês.');
 assert(out.some(s=>s.type==='interesse_solucoes'));
 assert(out.every(s=>s.evidence.includes('Quero conhecer')));
});

test('redução de consumo e modernização de ETE são necessidades distintas',()=>{
 const out=detectCommercialIntents('Queremos reduzir o consumo de água e modernizar nossa ETE. Podemos conversar?');
 const kinds=out.map(s=>s.type);
 assert(kinds.includes('consumo_agua'));
 assert(kinds.includes('modernizacao_ete'));
 assert(kinds.includes('reuniao'));
});

test('problema de conta de água em crescimento é identificado',()=>{
 const out=detectCommercialIntents('Nossa conta de água está aumentando todos os meses.');
 assert(out.some(s=>s.type==='consumo_agua'));
});

test('pedidos claros de proposta geram sinal próprio',()=>{
 const out=detectCommercialIntents('Pode enviar uma proposta comercial com os preços?');
 assert(out.some(s=>s.type==='pedido_proposta'));
});

test('recusas e simples cortesia não criam sinal de compra',()=>{
 for(const input of ['Não temos interesse nas soluções.','Bom dia!','Obrigado pelo contato.',
   'Não precisamos de nova ETE no momento.']){
  assert.deepEqual(detectCommercialIntents(input),[],input);
 }
});

test('o simples sim depende de contexto de mensagem enviada',()=>{
 assert.deepEqual(detectCommercialIntents('Sim'),[]);
 assert(detectCommercialIntents('Sim',{sellerContext:'Posso enviar material de soluções?'}).length>0);
});

test('nenhum texto da SDR é transformado em fala do comprador',()=>{
 const transcript='05/11/2026 · Rosa Oliveira: Quero conhecer suas soluções de monitoramento\n'+
   '05/11/2026 · Maria Compradora: Obrigada pelo contato';
 const messages=buyerMessagesFromTranscript(transcript,'Rosa Oliveira');
 assert.equal(messages.length,1);
 assert.equal(messages[0].author,'Maria Compradora');
 assert.deepEqual(detectCommercialIntents(messages[0].text),[]);
 assert.deepEqual(buyerMessagesFromTranscript(transcript,''),[]);
});

test('IA só passa citando literalmente uma fala do prospect',()=>{
 const models=[
  {type:'interesse_solucoes',evidence:'Quero conhecer as soluções'},
  {type:'pedido_proposta',evidence:'envie uma proposta milionária'},
  {type:'invalid',evidence:'Quero conhecer as soluções'}
 ];
 const valid=validateAiIntents(models,['Quero conhecer as soluções de vocês']);
 assert.equal(valid.length,1);
 assert.equal(valid[0].type,'interesse_solucoes');
});

test('não classificar sinal de IA quando a citação só existe na mensagem da SDR',()=>{
 const out=validateAiIntents([{type:'pedido_proposta',evidence:'Pode enviar uma proposta comercial'}],
  ['Obrigado pelo contato']);
 assert.deepEqual(out,[]);
});

test('radar consolida várias intenções em uma conta e mantém a citação',()=>{
 const radar=buildCommercialOpportunityRadar({snapshot:fixture(),scope,asOf:'2026-11-06'});
 const cues=radar.groups.pistas;
 assert.equal(cues.length,1);
 assert.equal(cues[0].accountId,'conta-a');
 assert(cues[0].signalCount>=3);
 assert(cues[0].relatedSignals.some(s=>s.headline.includes('consumo')||s.headline.includes('ETE')));
 assert.equal(cues[0].sourceOpportunityId,'op-a');
});

test('tenant diferente não é acessível nem misturado na análise',()=>{
 const snap=fixture();
 snap.contas.push({tenantId:'empresa-b',id:'conta-b',nome:'Empresa Secreta'});
 snap.oportunidades.push({tenantId:'empresa-b',contaId:'conta-b',id:'op-b',
  notas:'Precisamos de uma proposta urgente'});
 const radar=buildCommercialOpportunityRadar({snapshot:snap,scope,asOf:'2026-11-06'});
 assert(radar.groups.pistas.every(x=>x.tenantId==='empresa-a'));
 assert(!JSON.stringify(radar).includes('Empresa Secreta'));
});

test('oportunidades encerradas e eventos futuros não viram nova demanda',()=>{
 const snap=fixture();snap.oportunidades[0].desfecho={tipo:'perdido'};
 let radar=buildCommercialOpportunityRadar({snapshot:snap,scope,asOf:'2026-11-06'});
 assert.equal(radar.groups.pistas.length,0);
 delete snap.oportunidades[0].desfecho;
 snap.oportunidades[0].eventos.forEach(e=>e.data='2026-12-01');
 radar=buildCommercialOpportunityRadar({snapshot:snap,scope,asOf:'2026-11-06'});
 assert.equal(radar.groups.pistas.length,0);
});

test('o sistema não executa ações de venda nem escreve dados',()=>{
 const snap=fixture();const before=JSON.stringify(snap);
 buildCommercialOpportunityRadar({snapshot:snap,scope,asOf:'2026-11-06'});
 assert.equal(JSON.stringify(snap),before);
});

test('integração de IA em lote preserva validação literal na Edge Function',()=>{
 const edge=readFileSync(new URL('../nuvem/funcoes/assistente/index.ts',import.meta.url),'utf8');
 const frontend=readFileSync(new URL('../src/ia.js',import.meta.url),'utf8');
 const importer=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(edge,/falasDoCliente/);
 assert.match(edge,/falas\.some/);
 assert.match(edge,/sinais:\s*sinais/);
 assert.match(frontend,/sinais:\s*Array\.isArray/);
 assert.match(importer,/sinaisDeIntencao/);
});

test('SDR de cada conversa é reconhecida mesmo quando muda na mesma conta',()=>{
 const snap=fixture();
 snap.oportunidades[0].sdr='Rosa Oliveira';
 snap.oportunidades[0].eventos.unshift({
  id:'evento-3',tipo:'sistema',data:'2026-11-05',
  titulo:'Continuação da conversa no LinkedIn com Carla Silva (2 mensagens)',
  detalhe:'05/11/2026 · Carla Silva: Podemos conversar sobre nossas soluções?\n'+
   '05/11/2026 · Maria Compradora: Obrigada pelo contato!'
 });
 const groups=buildCommercialOpportunityRadar({snapshot:snap,scope,asOf:'2026-11-06'}).groups;
 assert(!JSON.stringify(groups.pistas).includes('Podemos conversar sobre nossas soluções?'));
});
test('mensagens de cliente em múltiplas linhas não perdem necessidade',()=>{
 const transcript='05/11/2026 · Rosa Oliveira: Nosso produto tem monitoramento\n'+
 '05/11/2026 · Maria Compradora: Bom dia, \n'+
 'queremos reduzir o consumo de água e modernizar a ETE.\n'+
 '05/11/2026 · Rosa Oliveira: Posso enviar uma proposta?';
 const buyers=buyerMessagesFromTranscript(transcript,'Rosa Oliveira');
 assert.equal(buyers.length,1);
 assert.match(buyers[0].text,/modernizar a ETE/);
 assert(detectCommercialIntents(buyers[0].text).some(s=>s.type==='consumo_agua'));
});
test('recusa parcial não oculta necessidade diferente',()=>{
 const x=detectCommercialIntents('Não precisamos de nova ETE, mas queremos reduzir o consumo de água.');
 assert(x.some(s=>s.type==='consumo_agua'));
 assert(!x.some(s=>s.type==='modernizacao_ete'));
});
test('IA não pode rotular interesse genérico como pedido de proposta',()=>{
 const x=validateAiIntents(
  [{type:'pedido_proposta',evidence:'Quero conhecer as soluções'},
   {type:'interesse_solucoes',evidence:'Quero conhecer as soluções'}],
  ['Quero conhecer as soluções de vocês']);
 assert.equal(x.length,1);
 assert.equal(x[0].type,'interesse_solucoes');
});
test('cache retorna mesma análise sem custo e respeita token de sessão/revisão',()=>{
 const snap=fixture();const session={...scope,token:'u1|tenant-a|revision-1'};
 const a=buildCachedCommercialRadar({snapshot:snap,scope:session,asOf:'2026-11-06'});
 const b=buildCachedCommercialRadar({snapshot:snap,scope:session,asOf:'2026-11-06'});
 assert.strictEqual(a,b);
 snap.oportunidades[0].eventos.push({id:'x',tipo:'activity',data:'2026-11-06',
  titulo:'Cliente pediu proposta formal'});
 const changed=buildCachedCommercialRadar({snapshot:snap,
  scope:{...session,token:'u1|tenant-a|revision-2'},asOf:'2026-11-06'});
 assert.notStrictEqual(a,changed);
 const alternate=buildCachedCommercialRadar({snapshot:snap,
  scope:{role:'gestor',userId:'outro',tenantId:'empresa-b',token:'u2|empresa-b|rev2'},asOf:'2026-11-06'});
 assert.equal(alternate.groups.pistas.length,0);
});

test('IA não interpreta citação parcial de recusa como interesse',()=>{
 const x=validateAiIntents(
  [{type:'interesse_solucoes',evidence:'queremos conhecer soluções'}],
  ['Não queremos conhecer soluções nesta etapa.']);
 assert.deepEqual(x,[]);
});
test('IA preserva intenção afirmativa após recusa parcial',()=>{
 const x=validateAiIntents(
  [{type:'consumo_agua',evidence:'queremos reduzir o consumo de água'}],
  ['Não precisamos de nova ETE, mas queremos reduzir o consumo de água.']);
 assert.equal(x.length,1);
});
test('importação faz triagem local antes de depender da IA de segmentos',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const views=readFileSync(new URL('../src/views.js',import.meta.url),'utf8');
 assert.match(app,/const sinaisLocaisProntos = import\(/);
 assert.match(app,/lead\.sinaisLocais=encontrados/);
 assert.match(views,/l\.sinaisLocais/);
 assert.match(views,/Sinais comerciais encontrados/);
});
