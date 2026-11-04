/* IaD Revenue Intelligence RI-01: bounded, read-only account briefing.
 * Pure projection over already-authorized rows; NEVER query provider, score
 * eight commercial decisions, infer buyer authority, mutate Store or send.
 * A trusted caller must enforce user/tenant RLS before supplying the snapshot.
 * Render all resulting strings via DOM textContent, never innerHTML.
 */
const present = value => typeof value==='string' && value.trim().length>0;
const parseTime = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;
const label = (value,fallback) => present(value) ? value.trim().slice(0,280) : fallback;
const MAX_FACTS=12,MAX_HYPOTHESES=8,MAX_GAPS=12,MAX_PEOPLE=30;

export function buildAccountBriefing({account,opportunities,contacts,evidence,asOf}={}) {
  if(!account||!present(account.id)||!present(account.tenantId)||
     !Array.isArray(opportunities)||!Array.isArray(contacts)||
     !Array.isArray(evidence)||!Number.isFinite(parseTime(asOf)))
    throw Error('Conta, tenant, listas autorizadas e data válidos são obrigatórios');
  const tenantId=account.tenantId,accountId=account.id,now=parseTime(asOf);
  let opportunityCount=0,contactCount=0,confirmedCount=0,unverifiedCount=0;
  const facts=[],hypotheses=[],gaps=[],decisionMap=[];
  for(const op of opportunities){
    if(op && op.tenantId===tenantId && op.contaId===accountId) opportunityCount++;
  }
  for(const c of contacts){
    if(!c||c.tenantId!==tenantId||c.contaId!==accountId)continue;
    contactCount++;
    if(decisionMap.length<MAX_PEOPLE){
      decisionMap.push({id:label(c.id,''),name:label(c.nome,'Nome não informado'),
        role:label(c.papelCompra||c.papelDecisao,'Papel a confirmar')});
    }
  }
  for(const e of evidence){
    if(!e||e.tenantId!==tenantId||e.contaId!==accountId)continue;
    const statement=label(e.statement,'');
    if(!statement)continue;
    if(e.status==='hypothesis'){
      if(hypotheses.length<MAX_HYPOTHESES) hypotheses.push({statement,status:'hypothesis'});
      continue;
    }
    const captured=parseTime(e.capturedAt);
    const expiry=e.expiresAt==null ? Infinity : parseTime(e.expiresAt);
    const reliable=e.status==='confirmed'&&present(e.source)&&
      Number.isFinite(captured)&&captured<=now&&expiry>now;
    if(reliable){
      confirmedCount++;
      if(facts.length<MAX_FACTS){
        facts.push({statement,status:'confirmed',source:label(e.source,''),capturedAt:e.capturedAt,
          expiresAt:e.expiresAt??null});
      }
    }else{
      unverifiedCount++;
      if(gaps.length<MAX_GAPS)gaps.push(statement+' — confirmação ou atualização necessária');
    }
  }
  if(contactCount===0 && gaps.length<MAX_GAPS) gaps.push('Interlocutores ainda não identificados');
  if(opportunityCount===0 && gaps.length<MAX_GAPS) gaps.push('Nenhuma oportunidade vinculada comprovada');
  if(confirmedCount===0 && gaps.length<MAX_GAPS) gaps.push('Não há evidências atuais confirmadas para esta conta');
  const title=label(account.nome||account.razaoSocial,'Conta sem nome');
  return {
    accountId,title,
    summary: String(opportunityCount)+' oportunidade(s), '+String(contactCount)+' contato(s) e '+String(confirmedCount)+' evidência(s) confirmada(s).',
    facts,hypotheses,gaps,decisionMap,
    questions:[
      'Quais resultados operacionais e financeiros precisam melhorar?',
      'Quais evidências confirmam a prioridade e o impacto do problema?',
      'Quem participa da decisão e quais critérios serão utilizados?'
    ],
    stats:{opportunities:opportunityCount,contacts:contactCount,confirmedFacts:confirmedCount,unverifiedClaims:unverifiedCount}
  };
}
