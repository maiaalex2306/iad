/* RI-04 — oportunidades reais da carteira, sem consultas externas ou escritas.
 * Apenas dados recebidos de Store.dados() e conferidos contra tenant/dono.
 * Tipos são HIPÓTESES para decisão humana; sem score de compra ou previsão.
 */
import {discoverInternalCommercialCues} from './internal-cues.mjs';
const label=v=>typeof v==='string'?v.trim().slice(0,180):'';
const id=v=>typeof v==='string'&&v.length>0;
const norm=v=>label(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
 Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v?v:null;
const dateFrom=v=>validDay(v)||validDay(typeof v==='string'?v.slice(0,10):'');
const deltaDays=(a,b)=>Math.floor((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
const accountKey=o=>JSON.stringify([o.tenantId,o.contaId||o.id]);
const itemKey=o=>JSON.stringify([o.tenantId,o.id]);
const closed=o=>norm(o?.desfecho?.tipo);
const isWon=o=>['ganho','ganha','ganhado','ganhou'].includes(closed(o));
const safeUrl=v=>{try{const x=new URL(v);return x.protocol==='https:'&&!x.username&&!x.password?x.href:null;}catch{return null;}};
const ownerAllowed=(row,scope)=>scope.role!=='admin'||scope.ownerFilter==='todos'||scope.ownerFilter===row.donoId;
function allowed(row,scope){
 if(!row||!id(row.id)||!id(row.tenantId)||!scope||!id(scope.userId))return false;
 if(scope.role==='admin'&&scope.admin===true){
  return (scope.tenantFilter==='todas'||scope.tenantFilter===row.tenantId)&&ownerAllowed(row,scope);
 }
 return scope.role==='gestor'&&id(scope.tenantId)&&row.tenantId===scope.tenantId;
}
const format=(account,kind,headline,evidence,action,extra={})=>({
 kind,tenantId:account.tenantId,accountId:account.id,
 accountName:label(account.nome||account.razaoSocial)||'Conta sem nome',
 segment:label(account.segmento),headline,evidence,action,status:'hipotese',
 ...extra
});
const scoreSort=(a,b)=>b.priority-a.priority||
 a.accountName.localeCompare(b.accountName,'pt-BR')||
 a.accountId.localeCompare(b.accountId,'pt-BR');
/** A notícia deve vir de um sinal AUTORIZADO já cadastrado, com URL HTTPS.
  O URL não é prova de verificação independente; é oferecido para conferência. */
export function buildCommercialOpportunityRadar({snapshot,scope,asOf}={}){
 if(!snapshot||!Array.isArray(snapshot.contas)||!Array.isArray(snapshot.oportunidades)||
    !scope||!id(scope.userId)||!['gestor','admin'].includes(scope.role)||
    (scope.role==='admin'&&scope.admin!==true)||!validDay(asOf))
  throw Error('Escopo, carteira e data de referência válidos são obrigatórios');
 const accounts=new Map();
 for(const a of snapshot.contas)if(allowed(a,scope))accounts.set(itemKey(a),a);
 // PERF-43: índice construído após .set preserva ordem/valor da busca linear,
 // mesmo quando há registros duplicados do mesmo ID na entrada.
 const segmentRepresentative=new Map();
 for(const a of accounts.values()){
  const segment=norm(a.segmento);
  if(!segment)continue;
  const k=JSON.stringify([a.tenantId,segment]);
  if(!segmentRepresentative.has(k))segmentRepresentative.set(k,a);
 }
 const opByAccount=new Map(),opIndex=new Map(),wonProducts=new Map(),segmentProducts=new Map(),lastTouch=new Map(),upcoming=new Set();
 const catalog=new Map();
 for(const p of snapshot.produtos||[]){
  if(!allowed(p,scope)||p.ativo===false)continue;
  catalog.set(itemKey(p),p);
 }
 const touch=(tenant,accountId,time)=>{
  const d=dateFrom(time),k=JSON.stringify([tenant,accountId]);
  if(d&&d<=asOf&&(lastTouch.get(k)||'')<d)lastTouch.set(k,d);
 };
 const product=(item,tenant)=>{
  if(!item||typeof item!=='object')return null;
  const named=label(item.nome);
  const byId=id(item.produtoId)?catalog.get(JSON.stringify([tenant,item.produtoId])):null;
  // Produtos de outro tenant nunca são usados para completar itens.
  const name=named||label(byId?.nome);
  const key=norm(name);
  return key?{key,name}:null;
 };
 const bySegment=new Map();
 const wonDates=new Map();
 for(const op of snapshot.oportunidades){
  if(!op||!id(op.id)||!id(op.contaId)||!id(op.tenantId)||!ownerAllowed(op,scope))continue;
  const ak=JSON.stringify([op.tenantId,op.contaId]),account=accounts.get(ak);
  if(!account)continue;
  if(!opByAccount.has(ak))opByAccount.set(ak,[]);
  opByAccount.get(ak).push(op);
  opIndex.set(JSON.stringify([op.tenantId,op.id]),op);
  for(const ev of Array.isArray(op.eventos)?op.eventos:[]) {
   if(ev&&['activity','decision','contato','interacao'].includes(ev.tipo))touch(op.tenantId,op.contaId,ev.data||ev.quando);
  }
  if(isWon(op)){
   let purchased=wonProducts.get(ak);if(!purchased){purchased=new Map();wonProducts.set(ak,purchased);}
   for(const item of Array.isArray(op.itens)?op.itens:[]){
    const p=product(item,op.tenantId);if(p)purchased.set(p.key,p.name);
   }
   const segment=norm(account.segmento);
   /* PERF-RI04: índice por segmento/produto criado uma vez por execução.
      A primeira compra real de cada par (produto, conta) mantém a grafia
      original da evidência e a ordem utilizada na comparação anterior.
      Nunca armazenar esses dados entre tenants ou sessões. */
   if(segment&&purchased.size){
    const segmentKey=JSON.stringify([op.tenantId,segment]);
    let indexed=segmentProducts.get(segmentKey);
    if(!indexed){indexed=new Map();segmentProducts.set(segmentKey,indexed);}
    for(const p of Array.isArray(op.itens)?op.itens:[]){
     const detail=product(p,op.tenantId);if(!detail)continue;
     let entry=indexed.get(detail.key);
     if(!entry){entry={buyers:new Map()};indexed.set(detail.key,entry);}
     if(!entry.buyers.has(ak))entry.buyers.set(ak,detail.name);
    }
   }
   const when=dateFrom(op.desfecho?.data||op.fechadoEm||op.dataFechamentoReal);
   if(segment&&when&&when<=asOf){
    const sk=JSON.stringify([op.tenantId,segment]);
    if(!bySegment.has(sk))bySegment.set(sk,{tenantId:op.tenantId,segment:label(account.segmento),recent:new Set(),previous:new Set(),accounts:new Set()});
    const delta=deltaDays(when,asOf),s=bySegment.get(sk);
    if(delta<180)s.recent.add(itemKey(op));
    else if(delta<360)s.previous.add(itemKey(op));
    s.accounts.add(ak);
    wonDates.set(itemKey(op),when);
   }
  }
 }
 for(const t of snapshot.tarefas||[]){
  if(!t||!id(t.tenantId)||!ownerAllowed(t,scope))continue;
  const op=t.oportunidadeId?opIndex.get(JSON.stringify([t.tenantId,t.oportunidadeId])):null;
  const ak=JSON.stringify([t.tenantId,t.contaId||op?.contaId]);
  if(!accounts.has(ak))continue;
  if(t.status==='concluida'||t.status==='concluido')touch(t.tenantId,t.contaId||op?.contaId,t.concluidoEm||t.atualizadoEm||t.vencimento);
  if(t.status==='aberta'&&dateFrom(t.vencimento)&&dateFrom(t.vencimento)>=asOf)upcoming.add(ak);
 }
 const results={pistas:[],upsell:[],crossSell:[],forgotten:[],news:[],growth:[]};
 for(const [ak,account] of accounts){
  const ops=opByAccount.get(ak)||[],purchased=wonProducts.get(ak);
  const active=ops.filter(o=>!closed(o));
  const accountDate=lastTouch.get(ak);
  if(purchased&&purchased.size&&!active.length){
   const example=[...purchased.values()].slice(0,2).join(', ');
   results.upsell.push(format(account,'upsell','Avaliar ampliação de soluções contratadas',
    'Há venda ganha com item(ns) registrados: '+example+'. Nenhuma oportunidade aberta foi identificada nesta conta.',
    'Revisar uso atual, unidades atendidas, capacidade e interesse em expansão antes de propor upgrade.',
    {priority:70,product:example}));
  }
  if(purchased&&purchased.size){
   const suggestions=new Map();
   const candidates=segmentProducts.get(JSON.stringify([account.tenantId,norm(account.segmento)]));
   if(candidates)for(const [pname,entry] of candidates){
    if(purchased.has(pname)||entry.buyers.size<2)continue;
    // Dois clientes do mesmo segmento que compraram o item = referência,
    // nunca garantia de aderência comercial à conta analisada.
    const peer=[...entry.buyers].find(([key])=>key!==ak);
    if(peer)suggestions.set(pname,peer[1]);
   }
   for(const name of [...suggestions.values()].slice(0,2)){
    results.crossSell.push(format(account,'crossSell','Investigar aderência de '+name,
      'A conta possui venda ganha de outra solução; '+name+' aparece em vendas ganhas de pelo menos duas contas do mesmo segmento.',
      'Validar processo, necessidade e compatibilidade da solução com o cliente antes de ofertar.',
      {priority:60,product:name}));
   }
  }
  // Sem registro não é sinônimo de relacionamento inexistente fora do CRM.
  if(!upcoming.has(ak) && (!accountDate||deltaDays(accountDate,asOf)>=90)){
   const won=ops.some(isWon);
   results.forgotten.push(format(account,'forgotten',
    won?'Cliente sem interação recente documentada':'Conta sem interação recente documentada',
    accountDate?'Última atividade reconhecida no CRM: '+accountDate+'. Não há compromisso futuro visível.':
      'Não há atividade datada e reconhecida vinculada à conta no CRM, nem compromisso futuro visível.',
    won?'Retomar relacionamento, validar satisfação e explorar novas demandas.':
      'Confirmar se existe relacionamento ativo antes de iniciar nova abordagem.',
    {priority:won?75:30,lastActivity:accountDate||null}));
  }
 }
 // Sinais externos são exibidos APENAS se já estiverem autorizados e registrados.
 // Não buscar notícias neste módulo; não declarar crescimento externo a partir de texto livre.
 for(const sig of snapshot.sinais||[]){
  if(!sig||!id(sig.tenantId)||!id(sig.contaId)||!ownerAllowed(sig,scope))continue;
  const a=accounts.get(JSON.stringify([sig.tenantId,sig.contaId]));
  if(!a)continue;
  // O schema real de public.sinais guarda o endereço de origem em 'fonte'.
  // Só HTTPS válido entra no radar, nunca uma origem textual como LinkedHelper.
  const url=safeUrl(sig.url||sig.sourceUrl||sig.fonteUrl||sig.fonte);
  const when=dateFrom(sig.dataPublicacao||sig.quando||sig.data);
  if(!url||!when||when>asOf||deltaDays(when,asOf)>180)continue;
  if(!['expansao','investimento','contratacao','licenciamento','projeto','mudanca_operacional'].includes(norm(sig.tipo)))continue;
  const name=label(sig.titulo)||'Movimento empresarial registrado';
  results.news.push(format(a,'news',name,
   'Sinal externo cadastrado, datado de '+when+', com endereço de fonte. Conteúdo e vínculo comercial dependem de conferência.',
   'Conferir a fonte, confirmar impacto na conta e identificar interlocutor do projeto.',
   {priority:65,date:when,sourceUrl:url,status:'verificar_fonte'}));
 }
 for(const v of bySegment.values()){
  if(v.previous.size<3||v.recent.size<5||v.accounts.size<3||
     v.recent.size<Math.ceil(v.previous.size*1.25))continue;
  // Crescimento de negócios ganhos no CRM, NÃO crescimento do setor externo.
  const a=segmentRepresentative.get(JSON.stringify([v.tenantId,norm(v.segment)]));
  if(!a)continue;
  results.growth.push(format(a,'growth','Mais vendas ganhas registradas em '+v.segment,
   'Na carteira do CRM, as vendas ganhas datadas nos últimos 180 dias superam em pelo menos 25% os 180 dias anteriores, com amostra mínima. Isso não comprova crescimento do mercado.',
   'Comparar contas atendidas, mix de soluções e lacunas do segmento; solicitar validação externa à Inteligência de Mercado.',
   {priority:50,segment:v.segment,accountId:null,accountName:v.segment}));
 }
 /* RI-07A: pistas textuais já existentes no CRM.
    Etapa O(N), executada em memória e sem chamada de IA, banco ou internet.
    Uma pista por conta impede que o mesmo cliente ocupe todo o resultado. */
 results.pistas=discoverInternalCommercialCues({snapshot,scope,accounts,asOf,limit:0}).items;
 // Uma negociação recém-registrada deve ser encontrada mesmo quando a
 // conversa original é antiga ou o texto não corresponde às regras locais.
 // Não classificar como compra sem fala comprovada: exibir para revisão.
 const primary=new Set(),relatedByOpportunity=new Map();
 for(const item of results.pistas){
  if(item.sourceOpportunityId)primary.add(JSON.stringify([item.tenantId,item.sourceOpportunityId]));
  for(const related of item.relatedSignals||[]){
   if(!related.sourceOpportunityId)continue;
   const k=JSON.stringify([item.tenantId,related.sourceOpportunityId]);
   if(!relatedByOpportunity.has(k))relatedByOpportunity.set(k,related);
  }
 }
 for(const op of opIndex.values()){
  if(closed(op))continue;
  const entered=dateFrom(op.criadoEm);
  if(!entered||entered>asOf||deltaDays(entered,asOf)>14)continue;
  const idKey=JSON.stringify([op.tenantId,op.id]);
  if(primary.has(idKey))continue;
  const account=accounts.get(JSON.stringify([op.tenantId,op.contaId]));
  if(!account)continue;
  const related=relatedByOpportunity.get(idKey);
  if(related){
   // Pista validada que estava escondida nas necessidades secundarias:
   // a nova negociacao ganha seu proprio cartao, sem inventar evidencias.
   results.pistas.push(format(account,'pistas',related.headline,related.evidence,
    related.action,{status:'hipotese',priority:related.priority||50,
     date:related.date,enteredAt:entered,sourceOpportunityId:op.id,
     sourceEventId:related.sourceEventId,sourceType:related.sourceType,
     sourceLabel:related.sourceLabel,intentType:related.intentType}));
   continue;
  }
  results.pistas.push(format(account,'pistas','Nova oportunidade — revisar conversa',
   'Oportunidade cadastrada em '+entered+'. A triagem textual ainda não confirmou uma intenção explícita nesta negociação.',
   'Abrir a negociação, conferir a fala do comprador e qualificar a próxima ação.',
   {status:'revisao',priority:20,date:entered,enteredAt:entered,
    sourceOpportunityId:op.id,sourceLabel:'Entrada recente no CRM',intentType:'revisao'}));
 }
 results.pistas.sort((a,b)=>(b.enteredAt||b.date||'').localeCompare(a.enteredAt||a.date||'')||
  b.priority-a.priority||(b.date||'').localeCompare(a.date||'')||
  a.accountName.localeCompare(b.accountName,'pt-BR')||a.accountId.localeCompare(b.accountId,'pt-BR'));
 const dedup=new Set();
 for(const kind of Object.keys(results)){
  const ordered=kind==='pistas'?results[kind]:results[kind].sort(scoreSort);
  results[kind]=ordered.filter(x=>{
   // O mesmo cliente pode ter negociações distintas criadas recentemente.
   const k=kind==='pistas'?
    JSON.stringify([kind,x.tenantId,x.accountId,x.sourceOpportunityId,x.intentType]):
    JSON.stringify([kind,x.tenantId,x.accountId,x.product||x.headline]);
   if(dedup.has(k))return false;dedup.add(k);return true;
  });
  if(kind!=='pistas')results[kind]=results[kind].slice(0,12);
 }
 return {asOf,groups:results,limits:{perGroup:12},
  transparency:'Hipóteses baseadas em registros autorizados. Sem pesquisa web, previsão de venda ou alterações no CRM.'};
}
