/* RI-07A — triagem determinística de pistas COMERCIAIS em registros do CRM.
 * 100% local e read-only. Não é inferência de IA nem notícia externa.
 * Entrada: snapshot já filtrado; verificação extra de tenant/conta/owner.
 * Cada pista aponta para registro real do CRM e exige confirmação humana.
 */
const limitText=(value,max=1400)=>typeof value==='string'?value.trim().slice(0,max):'';
const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const key=(tenant,account)=>JSON.stringify([tenant,account]);
const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
 !Number.isNaN(Date.parse(v+'T12:00:00Z'))&&
 new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v?v:null;
const asDay=v=>validDay(typeof v==='string'?v.slice(0,10):null);
const rules=[
 {kind:'solicitacao',weight:100,headline:'Pedido comercial mencionado na carteira',
  re:/\b(?:solicitou|solicitaram|pediu|pediram|requisitou|requisitaram)\b.{0,75}\b(?:proposta|orcamento|cotacao|preco|solucao|servico|sistema|apresentacao)\b|\b(?:proposta|orcamento|cotacao)\b.{0,28}\b(?:solicitada|solicitado|pedida|pedido)\b/i,
  action:'Confirmar com o interlocutor a necessidade, o escopo e o prazo antes de preparar a abordagem.'},
 {kind:'expansao',weight:85,headline:'Projeto de ampliação mencionado nos registros',
  re:/\b(?:expansao|ampliacao|nova unidade|novas unidades|nova planta|nova fabrica|aumento de capacidade|inauguracao|investimento previsto)\b/i,
  action:'Confirmar se o projeto permanece ativo, sua etapa e quais soluções internas podem contribuir.'},
 {kind:'necessidade',weight:70,headline:'Necessidade ou projeto citado na oportunidade',
  re:/\b(?:necessidade de|precisa de|precisam de|problema com|busca solucao|buscam solucao|demanda por|projeto de|implantacao de|automacao de)\b/i,
  action:'Validar a necessidade atual, seu impacto financeiro ou operacional e o próximo compromisso.'},
 {kind:'decisao',weight:55,headline:'Decisão pendente mencionada na carteira',
  re:/\b(?:aguardando aprovacao|aprovacao da diretoria|analise da diretoria|aguardando decisao|validacao do comprador|pendente de aprovacao)\b/i,
  action:'Identificar o responsável pela decisão, esclarecer o bloqueio e pactuar uma data de retorno.'}
];
/* Cancelamento explícito deve impedir destacar a própria expressão como oportunidade.
 * A triagem é conservadora. Não resolve nuances semânticas complexas. */
const negative=/\b(?:sem interesse|sem projeto|nao ha projeto|projeto cancelado|projeto suspenso|nao pretende|nao existe demanda|nao temos demanda|sem necessidade|descartou|cancelou a proposta)\b/i;
function classify(text){
 const original=limitText(text);
 if(original.length<16)return null;
 const simplified=fold(original);
 let best=null;
 for(const rule of rules){
  const hit=rule.re.exec(simplified);
  if(!hit)continue;
  const left=Math.max(0,hit.index-60),right=Math.min(original.length,hit.index+Math.max(hit[0].length,18)+125);
  const excerpt=original.slice(left,right).replace(/\s+/g,' ').trim();
  if(negative.test(fold(excerpt)))continue;
  if(!best||rule.weight>best.weight)best={...rule,excerpt};
 }
 return best;
}
const priority=(cue)=>cue.weight+(cue.sourceType==='evento'?8:0)+(cue.date?1:0);
export function discoverInternalCommercialCues({snapshot,scope,accounts,asOf,limit=12}={}){
 if(!snapshot||!Array.isArray(snapshot.oportunidades)||!scope||!scope.userId||
  !(accounts instanceof Map)||!validDay(asOf))throw Error('Escopo e registros internos são obrigatórios');
 const perAccount=new Map();
 let scanned=0,eligible=0;
 const addCue=(account,op,text,sourceType,date,eventId=null)=>{
  // Não processar textos arbitrariamente grandes nem reidentificar empresas externas.
  if(!text||typeof text!=='string')return;
  const match=classify(text);
  if(!match)return;
  const ak=key(account.tenantId,account.id);
  const item={
   kind:'pistas',tenantId:account.tenantId,accountId:account.id,
   accountName:limitText(account.nome||account.razaoSocial,180)||'Conta sem nome',
   segment:limitText(account.segmento,180),
   headline:match.headline,
   evidence:match.excerpt,
   action:match.action,
   status:'hipotese',sourceType,sourceOpportunityId:op.id,
   sourceEventId:eventId,date:date&&date<=asOf?date:null,
   sourceLabel:sourceType==='evento'?'Título de evento comercial registrado no CRM':'Nota de oportunidade cadastrada no CRM',
   priority:priority({...match,sourceType,date})
  };
  const prior=perAccount.get(ak);
  if(!prior||item.priority>prior.priority||
    (item.priority===prior.priority&&(item.date||'')>(prior.date||'')))perAccount.set(ak,item);
 };
 for(const op of snapshot.oportunidades){
  if(!op||!op.id||!op.contaId||!op.tenantId)continue;
  if(scope.role==='admin'&&scope.admin===true&&
     scope.ownerFilter!=='todos'&&scope.ownerFilter!==op.donoId)continue;
  const account=accounts.get(key(op.tenantId,op.contaId));
  if(!account)continue; // Gate de conta sempre visível e mesmo tenant.
  if(op.desfecho&&typeof op.desfecho.tipo==='string'&&op.desfecho.tipo.trim())continue;
  eligible++;
  // Só registros materiais; nenhum evento criado pelo sistema ou pontuação.
  addCue(account,op,op.notas,'nota',null);
  const events=Array.isArray(op.eventos)?op.eventos:[];
  for(let i=0;i<events.length&&i<40;i++){
   const event=events[i];
   if(!event||!['activity','decision','contato','interacao'].includes(event.tipo))continue;
   const date=asDay(event.data||event.quando);
   if(date&&date>asOf)continue;
   addCue(account,op,event.titulo||event.descricao,'evento',date,
     typeof event.id==='string'?event.id:null);
  }
  scanned++;
 }
 const cues=[...perAccount.values()].sort((a,b)=>b.priority-a.priority||
  (b.date||'').localeCompare(a.date||'')||
  a.accountName.localeCompare(b.accountName,'pt-BR')||
  a.accountId.localeCompare(b.accountId,'pt-BR'));
 return {
  items:cues.slice(0,Math.max(1,Math.min(12,Number.isSafeInteger(limit)?limit:12))),
  inspected:scanned,
  candidateAccounts:perAccount.size,
  methodology:'Triagem determinística local de notas e eventos comerciais; não é análise por IA. Trechos são hipóteses a confirmar.'
 };
}
