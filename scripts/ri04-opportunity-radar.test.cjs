'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),path=require('node:path'),fs=require('node:fs');
const mod=import(pathToFileURL(path.resolve(__dirname,'../src/ri/opportunity-radar.mjs')).href);
const scope={role:'gestor',userId:'u1',tenantId:'ta',token:'t'};
const asOf='2026-11-06';
const ac=(id,segmento='Químico',tenantId='ta')=>({id,tenantId,donoId:'u1',nome:'Empresa '+id,segmento});
const won=(id,contaId,product,closedDate,tenantId='ta')=>({
 id,contaId,tenantId,donoId:'u1',desfecho:{tipo:'ganho',data:closedDate},
 itens:[{id:'item-'+id,nome:product,produtoId:null}],valor:3000,eventos:[]
});
const empty=()=>({contas:[ac('a'),ac('b'),ac('c'),ac('d'),ac('x','Químico','tb')],
 oportunidades:[],tarefas:[],sinais:[],produtos:[]});
const run=async(snap,scopeOverride=scope)=> (await mod).buildCommercialOpportunityRadar({
 snapshot:snap,scope:scopeOverride,asOf});
test('RI-04: upsell e cross-sell apoiados em vendas ganhas e produtos, sem inventar compras',async()=>{
 const s=empty();
 s.oportunidades.push(won('wa','a','Monitoramento','2026-04-01'));
 s.oportunidades.push(won('wb','b','Filtração','2026-03-01'));
 s.oportunidades.push(won('wc','c','Filtração','2026-03-02'));
 s.oportunidades.push(won('wx','x','Sensor secreto','2026-04-03','tb'));
 const before=JSON.stringify(s);
 const v=await run(s);
 assert.ok(v.groups.upsell.some(x=>x.accountId==='a'&&x.evidence.includes('Monitoramento')));
 assert.ok(v.groups.crossSell.some(x=>x.accountId==='a'&&x.product==='Filtração'));
 assert.ok(!JSON.stringify(v).includes('Sensor secreto'));
 assert.ok(v.groups.crossSell.every(x=>x.status==='hipotese'));
 assert.equal(JSON.stringify(s),before,'não modifica dados');
 // Uma compra numa conta não basta para recomendar cross-sell.
 s.oportunidades=s.oportunidades.filter(x=>x.id!=='wc');
 const weaker=await run(s);
 assert.ok(!weaker.groups.crossSell.some(x=>x.accountId==='a'));
});
test('RI-04: conta esquecida é sinal de falta de registro, nunca afirma inatividade real',async()=>{
 const s=empty();
 s.oportunidades.push(won('w1','a','Sensor','2026-01-20'));
 s.oportunidades.push({id:'open',contaId:'b',tenantId:'ta',donoId:'u1',
  etapa:'Conexão',eventos:[{tipo:'activity',data:'2026-11-01'}]});
 s.tarefas.push({id:'t1',tenantId:'ta',contaId:'c',donoId:'u1',
  status:'aberta',vencimento:'2026-11-15'});
 const v=await run(s);
 assert.ok(v.groups.forgotten.some(x=>x.accountId==='a'&&x.evidence.includes('Não há atividade datada')));
 assert.ok(!v.groups.forgotten.some(x=>x.accountId==='b'),'atividade recente');
 assert.ok(!v.groups.forgotten.some(x=>x.accountId==='c'),'compromisso futuro');
 assert.ok(v.groups.forgotten.every(x=>/no CRM|documentada/i.test(x.headline+' '+x.evidence)));
});
test('RI-04: notícias registradas precisam de data e HTTPS, e fonte é sinal a conferir',async()=>{
 const s=empty();
 s.sinais=[
  {id:'s1',tenantId:'ta',contaId:'a',donoId:'u1',tipo:'investimento',
   titulo:'Novo investimento',quando:'2026-11-01',url:'https://example.org/noticia'},
  {id:'s2',tenantId:'ta',contaId:'a',donoId:'u1',tipo:'expansao',
   titulo:'Falsa notícia',quando:'2026-11-01',url:'javascript:alert(1)'},
  {id:'s3',tenantId:'ta',contaId:'a',donoId:'u1',tipo:'investimento',
   titulo:'Notícia futura',quando:'2026-12-01',url:'https://example.org/futuro'},
  {id:'s4',tenantId:'tb',contaId:'x',donoId:'u1',tipo:'investimento',
   titulo:'Notícia privada',quando:'2026-11-01',url:'https://example.org/private'}];
 const v=await run(s);
 assert.equal(v.groups.news.length,1);
 assert.equal(v.groups.news[0].headline,'Novo investimento');
 assert.equal(v.groups.news[0].status,'verificar_fonte');
 assert.match(v.groups.news[0].evidence,/dependem de conferência/);
 assert.doesNotMatch(JSON.stringify(v),/Falsa notícia|Notícia futura|Notícia privada/);
});

test('RI-04: noticia usa HTTPS do campo fonte presente em public.sinais',async()=>{
 const s=empty();
 s.sinais=[
  {id:'schema-real',tenantId:'ta',contaId:'a',donoId:'u1',tipo:'investimento',
   titulo:'Investimento confirmado na fonte',quando:'2026-11-02',
   fonte:'https://example.org/industria/investimento'},
  {id:'origem-textual',tenantId:'ta',contaId:'a',donoId:'u1',tipo:'expansao',
   titulo:'Origem sem link',quando:'2026-11-02',fonte:'LinkedHelper'},
  {id:'origem-insegura',tenantId:'ta',contaId:'a',donoId:'u1',tipo:'expansao',
   titulo:'Fonte insegura',quando:'2026-11-02',fonte:'javascript:alert(1)'},
  {id:'origem-credenciada',tenantId:'ta',contaId:'a',donoId:'u1',tipo:'expansao',
   titulo:'URL com credenciais',quando:'2026-11-02',
   fonte:'https://usuario:senha@example.org/a'},
  {id:'outro-tenant',tenantId:'tb',contaId:'x',donoId:'u1',tipo:'investimento',
   titulo:'Fonte privada',quando:'2026-11-02',fonte:'https://example.org/privada'}
 ];
 const before=JSON.stringify(s);
 const actual=await run(s);
 assert.equal(actual.groups.news.length,1);
 assert.equal(actual.groups.news[0].headline,'Investimento confirmado na fonte');
 assert.equal(actual.groups.news[0].sourceUrl,'https://example.org/industria/investimento');
 assert.equal(actual.groups.news[0].status,'verificar_fonte');
 assert.equal(JSON.stringify(s),before,'o radar não regrava sinais');
 for(const unsafe of ['Origem sem link','Fonte insegura','URL com credenciais','Fonte privada'])
  assert.ok(!JSON.stringify(actual).includes(unsafe),unsafe);
});
test('RI-04: crescimento qualifica apenas o CRM, com amostra e data suficientes',async()=>{
 const s=empty();
 const recent=['2026-11-01','2026-10-19','2026-09-10','2026-08-05','2026-07-02','2026-06-21'];
 const older=['2026-04-10','2026-03-03','2026-02-14'];
 let i=0;
 for(const d of [...recent,...older]){
  const account=['a','b','c'][i%3];
  s.oportunidades.push(won('w'+i,account,i%2?'Filtração':'Monitoramento',d));
  i++;
 }
 const a=await run(s);
 assert.equal(a.groups.growth.length,1);
 assert.match(a.groups.growth[0].headline,/Mais vendas ganhas registradas/);
 assert.match(a.groups.growth[0].evidence,/não comprova crescimento do mercado/);
 s.oportunidades=s.oportunidades.filter(x=>x.id!=='w8');
 const b=await run(s);
 assert.equal(b.groups.growth.length,0,'histórico insuficiente bloqueia alegação');
});
test('PERF-42: índice de segmentos preserva primeira conta, limites e isolamento de tenant',async()=>{
 const s={contas:[],oportunidades:[],tarefas:[],sinais:[],produtos:[]};
 const recent=['2026-11-01','2026-10-19','2026-09-10','2026-08-05','2026-07-02','2026-06-21'];
 const older=['2026-04-10','2026-03-03','2026-02-14'];
 for(let g=0;g<36;g++){
  const segment='Segmento '+String(g).padStart(2,'0');
  for(let a=0;a<3;a++)s.contas.push(ac('s'+g+'a'+a,segment));
  for(let j=0;j<9;j++){
   const day=(j<6?recent[j]:older[j-6]);
   s.oportunidades.push(won('s'+g+'w'+j,'s'+g+'a'+j%3,'Produto '+g,day));
  }
 }
 // Simular carteira grande de contas sem negócios ganhos, sem alterar conclusões.
 for(let i=0;i<1400;i++)s.contas.push(ac('extra'+i,'Outro '+i));
 s.contas.unshift(ac('restrita','Segmento 00','tb'));
 const before=JSON.stringify(s),v=await run(s);
 assert.equal(v.groups.growth.length,12,'limite de cards preservado');
 assert.ok(v.groups.growth.every(x=>x.tenantId==='ta'&&x.accountId===null));
 assert.ok(v.groups.growth.some(x=>x.accountName==='Segmento 00'));
 assert.doesNotMatch(JSON.stringify(v),/Empresa restrita/);
 assert.equal(JSON.stringify(s),before,'o índice não altera dados do Store');
});
test('RI-04: admin respeita tenant/owner, sem nomes privados na recomendação',async()=>{
 const s=empty();
 s.contas.push({id:'other',tenantId:'ta',donoId:'u2',nome:'Conta Restrita',segmento:'Químico'});
 s.oportunidades.push(won('w1','a','Produto A','2026-10-01'));
 s.oportunidades.push({...won('w2','other','Produto Privado','2026-10-03'),donoId:'u2'});
 const admin={role:'admin',admin:true,userId:'adm',tenantId:'ta',tenantFilter:'ta',ownerFilter:'u1'};
 const v=await run(s,admin);
 assert.doesNotMatch(JSON.stringify(v),/Produto Privado|Conta Restrita|Empresa x/);
 assert.ok(v.groups.upsell.some(x=>x.accountId==='a'));
});
test('RI-04: limites e segurança estática da interface',async()=>{
 const s=empty();for(let i=0;i<110;i++)s.contas.push(ac('batch'+i));
 const v=await run(s);
 assert.equal(v.groups.forgotten.length,12);
 const view=fs.readFileSync(path.resolve(__dirname,'../src/ri/account-view.mjs'),'utf8');
 const engine=fs.readFileSync(path.resolve(__dirname,'../src/ri/opportunity-radar.mjs'),'utf8');
 const sw=fs.readFileSync(path.resolve(__dirname,'../sw.js'),'utf8');
 assert.ok(view.includes("data.radar")||view.includes("dataset.radar"));
 assert.match(view,/buildCommercialOpportunityRadar/);
 assert.doesNotMatch(view,/\.innerHTML|fetch\s*\(|localStorage\.setItem|Store\.salvar\(/);
 assert.doesNotMatch(engine,/fetch\s*\(|localStorage|document\.|supabase\./);
 assert.match(sw,/\.\/src\/ri\/opportunity-radar\.mjs/);
});
