import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detectCommercialIntents,validateAiIntents,buyerMessagesFromTranscript}
 from '../src/ri/conversation-intent.mjs';
import {buildCommercialOpportunityRadar} from '../src/ri/opportunity-radar.mjs';

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
