/* RI-08 — pistas comerciais em dados internos, sem consulta externa.
 * Gate de escopo: snapshot autorizado + tenant/conta/owner. Nao pontua IAD,
 * nao cria oportunidades nem envia mensagens. Uma conta pode ter varias
 * necessidades; o cartao consolida ate quatro sinais com citacoes rastreaveis.
 */
import {detectCommercialIntents,buyerMessagesFromTranscript,validateAiIntents} from './conversation-intent.mjs';
const short=(v,n=260)=>typeof v==='string'?v.trim().slice(0,n):'';
const key=(tenant,account)=>JSON.stringify([tenant,account]);
const day=v=>{
 const d=typeof v==='string'?v.slice(0,10):'';
 return /^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&
  new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d?d:null;
};
export function discoverInternalCommercialCues({snapshot,scope,accounts,asOf,limit=12}={}){
 if(!snapshot||!Array.isArray(snapshot.oportunidades)||!scope||!scope.userId||
  !(accounts instanceof Map)||!day(asOf)||day(asOf)!==asOf)
  throw Error('Escopo e registros internos são obrigatórios');
 const perAccount=new Map();let scanned=0;
 const add=(account,op,signal,sourceType,event,date)=>{
  if(!signal||!signal.evidence)return;
  const k=key(account.tenantId,account.id);
  let record=perAccount.get(k);
  if(!record){record={account,signals:new Map()};perAccount.set(k,record);}
  const topic=(signal.topics||[])[0]||'geral';
  /* Projetos diferentes da mesma conta mantem necessidades independentes. */
  const typeKey=signal.type+'|'+topic+'|'+op.id;
  const item={
   kind:'pistas',tenantId:account.tenantId,accountId:account.id,
   accountName:short(account.nome||account.razaoSocial,180)||'Conta sem nome',
   segment:short(account.segmento,180),headline:signal.headline,
   evidence:signal.evidence,action:signal.action,status:'hipotese',
   sourceType,sourceOpportunityId:op.id,
   sourceEventId:typeof event?.id==='string'?event.id:null,
   sourceLabel:sourceType==='linkedin'?'Mensagem do prospect no LinkedIn':
    sourceType==='ia'?'Interpretação validada de mensagem do prospect':
    sourceType==='evento'?'Evento comercial cadastrado no CRM':'Nota comercial cadastrada no CRM',
   date,priority:signal.priority+(sourceType==='linkedin'?7:sourceType==='ia'?6:sourceType==='evento'?3:0),
   intentType:signal.type,topics:signal.topics||[],modelSource:signal.source
  };
  const prior=record.signals.get(typeKey);
  if(!prior||item.priority>prior.priority||
   (item.priority===prior.priority&&(item.date||'')>(prior.date||'')))
   record.signals.set(typeKey,item);
 };
 for(const op of snapshot.oportunidades){
  if(!op||!op.id||!op.contaId||!op.tenantId)continue;
  if(scope.role==='admin'&&scope.admin===true&&
   scope.ownerFilter!=='todos'&&scope.ownerFilter!==op.donoId)continue;
  const account=accounts.get(key(op.tenantId,op.contaId));
  if(!account||op.desfecho?.tipo)continue;
  scanned++;
  for(const signal of detectCommercialIntents(op.notas||''))
   add(account,op,signal,'nota',null,null);
  for(const event of (Array.isArray(op.eventos)?op.eventos:[]).slice(0,80)){
   if(!event)continue;
   const date=day(event.data||event.quando);
   if(date&&date>asOf)continue;
   if(event.tipo==='sistema'&&/Conversa no LinkedIn/i.test(event.titulo||'')){
    // O operador pode mudar entre importações. O título pertence à conversa
    // desta entrega; usar op.sdr primeiro confunde outra SDR com um prospect.
    const sdr=((/conversa no linkedin com (.+?)\s*\(/i.exec(event.titulo||'')||[])[1]||'')
      .trim()||short(op.sdr,120);
    const messages=buyerMessagesFromTranscript(event.detalhe,sdr);
    for(const m of messages){
     for(const signal of detectCommercialIntents(m.text))
      add(account,op,signal,'linkedin',event,date);
    }
    // A IA nao recebe autoridade de escrita: apenas sinais cuja citacao
    // existe literalmente nas falas do prospect sao aceitos.
    const ai=validateAiIntents(event.sinaisDeIntencao,messages.map(m=>m.text));
    for(const signal of ai)add(account,op,signal,'ia',event,date);
    continue;
   }
   if(!['decision','activity','contato','interacao'].includes(event.tipo))continue;
   const text=event.titulo||event.descricao||'';
   for(const signal of detectCommercialIntents(text))
    add(account,op,signal,event.tipo==='decision'&&event.canal==='LinkedIn'?'linkedin':'evento',event,date);
  }
 }
 const items=[];
 for(const record of perAccount.values()){
  const sorted=[...record.signals.values()].sort((a,b)=>b.priority-a.priority||
   (b.date||'').localeCompare(a.date||'')||
   a.intentType.localeCompare(b.intentType));
  const lead=sorted[0];if(!lead)continue;
  items.push({...lead,signalCount:sorted.length,
   relatedSignals:sorted.slice(1,4).map(s=>({
    headline:s.headline,evidence:s.evidence,action:s.action,
    sourceLabel:s.sourceLabel,date:s.date,sourceOpportunityId:s.sourceOpportunityId
   }))});
 }
 items.sort((a,b)=>b.priority-a.priority||(b.date||'').localeCompare(a.date||'')||
   a.accountName.localeCompare(b.accountName,'pt-BR')||
   a.accountId.localeCompare(b.accountId,'pt-BR'));
 return {items:items.slice(0,Math.max(1,Math.min(12,Number.isSafeInteger(limit)?limit:12))),
  inspected:scanned,candidateAccounts:items.length,
  methodology:'Triagem local e sinais de IA validados contra fala literal; hipóteses comerciais, nunca avanço automático do IAD.'};
}
