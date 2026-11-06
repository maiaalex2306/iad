/* RI-02 — Inteligência Comercial factual, estritamente interna e somente leitura.
 * Fonte: snapshot já autorizado do CRM. Sem previsão de IA, alterações ou APIs.
 * O escopo é revalidado aqui para impedir vazamento por uso incorreto do módulo.
 */
const hasId=x=>typeof x==='string'&&x.length>0;
const norm=x=>typeof x==='string'?x.trim():'';
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
  Number.isFinite(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x?x:null;
const days=(earlier,later)=>Math.floor((Date.parse(later+'T12:00:00Z')-Date.parse(earlier+'T12:00:00Z'))/86400000);
const money=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
const key=(tenant,id)=>JSON.stringify([tenant,id]);
// Datas de vencimento são interpretadas no calendário do usuário, não no UTC.
export function localBusinessDate(now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('Data local inválida');
 return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
}
function allowed(row,scope){
 if(!row||!hasId(row.id)||!hasId(row.tenantId)||!scope||!hasId(scope.userId))return false;
 if(scope.role==='admin'&&scope.admin===true){
  return (scope.tenantFilter==='todas'||scope.tenantFilter===row.tenantId)&&
    (scope.ownerFilter==='todos'||scope.ownerFilter===row.donoId);
 }
 if(!hasId(scope.tenantId)||row.tenantId!==scope.tenantId)return false;
 return scope.role==='gestor';
}
const ownerVisible=(row,scope)=>{
 if(scope.role==='admin'&&scope.admin===true)
   return scope.ownerFilter==='todos'||scope.ownerFilter===row.donoId;
 return scope.role==='gestor';
};
const finalType=o=>norm(o?.desfecho?.tipo).toLowerCase();
export function buildPortfolioAnalytics({snapshot,scope,asOf}={}){
 if(!snapshot||!Array.isArray(snapshot.contas)||!Array.isArray(snapshot.oportunidades)||
    !Array.isArray(snapshot.tarefas)||!scope||!hasId(scope.userId)||
    !['gestor','admin'].includes(scope.role)||
    (scope.role==='admin'&&scope.admin!==true)||!day(asOf))
  throw Error('Carteira, sessão e data de referência válidas são obrigatórias');
 const accounts=new Map();
 for(const a of snapshot.contas)if(allowed(a,scope))accounts.set(key(a.tenantId,a.id),a);
 const opportunities=[],opIndex=new Map(),byStage=new Map();
 let openValue=0,wonValue=0,lostValue=0,valuedOpen=0,unknownOpenValue=0,won=0,lost=0,abandoned=0,open=0,lateClosing=0,stalled=0;
 for(const o of snapshot.oportunidades){
  if(!o||!hasId(o.id)||!hasId(o.contaId)||!hasId(o.tenantId)||
     !accounts.has(key(o.tenantId,o.contaId))||!ownerVisible(o,scope))continue;
  const closed=finalType(o),v=money(o.valor),opened=!closed;
  const row={op:o,account:accounts.get(key(o.tenantId,o.contaId)),closed,
   lateClosing:false,stalled:false,overdueTasks:0,upcoming:false,withNextStep:false,
   value:v,stageDays:null};
  if(opened){
   open++;
   if(v!==null){openValue+=v;valuedOpen++;}else unknownOpenValue++;
   const stageDate=day(o.etapaDesde);
   row.stageDays=stageDate&&stageDate<=asOf?days(stageDate,asOf):null;
   row.stalled=row.stageDays!==null&&row.stageDays>=30;
   row.lateClosing=!!day(o.fechamentoPrevisto)&&o.fechamentoPrevisto<asOf;
   if(row.stalled)stalled++;
   if(row.lateClosing)lateClosing++;
   const stage=norm(o.etapa)||'Sem etapa';
   const s=byStage.get(stage)||{etapa:stage,quantidade:0,valor:0,semValor:0};
   s.quantidade++;
   if(v===null)s.semValor++;else s.valor+=v;
   byStage.set(stage,s);
  }else if(closed==='ganho'){won++;if(v!==null)wonValue+=v;}
  else if(closed==='perda'){lost++;if(v!==null)lostValue+=v;}
  else if(closed==='desistencia'){abandoned++;}
  opportunities.push(row);
  opIndex.set(key(o.tenantId,o.id),row);
 }
 let overdueTasks=0,openTasks=0,upcomingTasks=0;
 const taskSeen=new Set();
 for(const t of snapshot.tarefas){
  if(!t||t.status!=='aberta'||!hasId(t.oportunidadeId)||!hasId(t.tenantId)||
    !ownerVisible(t,scope))continue;
  const linked=opIndex.get(key(t.tenantId,t.oportunidadeId));
  if(!linked||linked.closed)continue;
  const unique=key(t.tenantId,t.id);
  if(!hasId(t.id)||taskSeen.has(unique))continue;
  taskSeen.add(unique);
  openTasks++;
  const due=day(t.vencimento);
  if(due&&due<asOf){overdueTasks++;linked.overdueTasks++;}
  else if(due&&due>=asOf){upcomingTasks++;linked.upcoming=true;}
 }
 const priorities=[],withoutUpcoming=[];
 for(const item of opportunities){
  if(item.closed)continue;
  const {op,account}=item;
  const hasCommitment=Boolean(op.proximoCompromisso)&&
    (typeof op.proximoCompromisso==='string' ? !!day(op.proximoCompromisso)&&op.proximoCompromisso>=asOf
      : !!day(op.proximoCompromisso.data||op.proximoCompromisso.vencimento)&&
        (op.proximoCompromisso.data||op.proximoCompromisso.vencimento)>=asOf);
  item.withNextStep=item.upcoming||hasCommitment;
  const reasons=[];
  if(item.lateClosing)reasons.push('Previsão de fechamento vencida');
  if(item.overdueTasks)reasons.push(item.overdueTasks+' tarefa(s) vencida(s)');
  if(item.stalled)reasons.push(item.stageDays+' dias na etapa atual');
  if(!item.withNextStep){reasons.push('Sem próximo compromisso futuro registrado');withoutUpcoming.push(item);}
  if(reasons.length){
   // Classificação determinística de atenção operacional, NÃO probabilidade de ganho.
   const attention=(item.lateClosing?4:0)+(item.overdueTasks?3:0)+(item.stalled?2:0)+(!item.withNextStep?1:0);
   priorities.push({accountId:account.id,tenantId:account.tenantId,opportunityId:op.id,
     accountName:norm(account.nome||account.razaoSocial)||'Conta sem nome',
     opportunityName:norm(op.titulo)||'Negociação sem título',
     value:item.value,reasons,attention});
  }
 }
 priorities.sort((a,b)=>b.attention-a.attention||
   (b.value??0)-(a.value??0)||a.accountName.localeCompare(b.accountName,'pt-BR')||
   a.opportunityId.localeCompare(b.opportunityId));
 const eligible=won+lost;
 return {
  asOf,metrics:{accounts:accounts.size,opportunities:opportunities.length,open,won,lost,abandoned,
   winRate:eligible?won/eligible:null,openValue,valuedOpen,unknownOpenValue,wonValue,lostValue,
   overdueTasks,openTasks,upcomingTasks,lateClosing,stalled,withoutNextStep:withoutUpcoming.length},
  stages:[...byStage.values()].sort((a,b)=>b.valor-a.valor||b.quantidade-a.quantidade),
  priorities:priorities.slice(0,15),priorityCount:priorities.length,
  definitions:{winRate:'ganhas / (ganhas + perdidas); desistências fora do denominador',
   openValue:'soma de valor válido (R$) em oportunidades abertas; campos ausentes excluídos',
   attention:'alertas factuais do CRM; não representa chance de fechamento'}
 };
}
