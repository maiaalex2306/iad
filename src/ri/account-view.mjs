/* IaD CRM RI-01B — lazy, read-only Inteligência Comercial.
 * Snapshot MUST come from Store.dados() (already authorized).
 * No writes, no remote providers, no automatic action, no decision scoring.
 * DOM strings are displayed with textContent only.
 */
import {buildAccountBriefing} from './account-briefing.mjs';
import {buildPortfolioAnalytics} from './portfolio-analytics.mjs';

const id = value => typeof value === 'string' && value.trim().length > 0;
const fold = value => String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const str = (value,fallback='') => typeof value==='string' && value.trim() ? value.trim().slice(0,200) : fallback;
const usableScope = scope => !!scope && id(scope.userId) &&
  ['vendedor','gestor','admin'].includes(scope.role) &&
  (id(scope.tenantId) || (scope.role === 'admin' && scope.admin === true));
function allowedAccount(a,scope) {
  if(!usableScope(scope) || !a || !id(a.id) || !id(a.tenantId))return false;
  const admin=scope.admin===true && scope.role==='admin';
  if(admin){
    return (scope.tenantFilter==='todas'||a.tenantId===scope.tenantFilter) &&
      (scope.ownerFilter==='todos'||a.donoId===scope.ownerFilter);
  }
  return a.tenantId===scope.tenantId &&
    (scope.role!=='vendedor'||!a.donoId||a.donoId===scope.userId);
}

export function findVisibleAccount(snapshot,scope,accountId,tenantId=null) {
  if(!snapshot||!Array.isArray(snapshot.contas)||!id(accountId))return null;
  for(const a of snapshot.contas){
    if(a && a.id===accountId && (!tenantId||a.tenantId===tenantId) && allowedAccount(a,scope))return a;
  }
  return null;
}

export function selectVisibleAccounts(snapshot,scope,query='',limit=40) {
  if(!snapshot||!Array.isArray(snapshot.contas)||!usableScope(scope))return [];
  const max=Math.max(1,Math.min(50,Number.isSafeInteger(limit)?limit:40));
  const term=fold(query);
  const results=[];
  for(const a of snapshot.contas){
    if(!allowedAccount(a,scope))continue;
    if(term && !fold([a.nome,a.razaoSocial,a.cidade,a.segmento].filter(Boolean).join(' ')).includes(term))continue;
    results.push(a);
    if(results.length>=max)break;
  }
  return results;
}

export function mountAccountIntelligence({root,snapshot,scope,getScopeToken}={}) {
  if(!root || !root.ownerDocument || !snapshot || !scope || typeof getScopeToken!=='function')
    throw Error('A visualização requer destino e sessão autorizada');
  const doc=root.ownerDocument;
  let active=true;
  const valid=()=>{
    if(!active||!root.isConnected)return false;
    try{return getScopeToken()===scope.token;}catch{return false;}
  };
  const el=(tag,text='',className='')=>{
    const e=doc.createElement(tag);
    e.textContent=String(text);
    if(className)e.className=className;
    return e;
  };
  const h=el('h2','Analisar contas existentes');
  const notice=el('p','Leitura da carteira já autorizada. Dados do CRM não são fatos externos comprovados; nenhuma ação será executada automaticamente.','small muted');
  const label=el('label','Buscar empresa, segmento ou cidade','campo');
  const search=el('input');
  search.type='search';
  search.placeholder='Buscar contas nesta carteira';
  search.setAttribute('aria-label','Buscar contas autorizadas');
  label.appendChild(search);
  const list=el('div','','iad-ri-list');
  const details=el('section');
  details.id='iad-ri-details';
  // RI-02: cálculo factual e auditável sobre o mesmo snapshot autorizado.
  // Nenhum request, mutação ou score preditivo. A sessão invalida interações.
  const overview=el('section','','iad-ri-portfolio');
  const portfolio=buildPortfolioAnalytics({snapshot,scope,asOf:new Date().toISOString().slice(0,10)});
  const metrics=portfolio.metrics;
  const reais=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
  const overviewTitle=el('h2','Visão da carteira — indicadores internos');
  const overviewNote=el('p','Indicadores calculados exclusivamente com registros visíveis do CRM. Sem previsão de IA e sem alterações de dados. Referência: '+portfolio.asOf+'.','small muted');
  const kpi=el('div','','iad-ri-kpis');
  kpi.style.display='grid';kpi.style.gridTemplateColumns='repeat(auto-fit,minmax(155px,1fr))';kpi.style.gap='10px';
  for(const [name,value] of [
    ['Contas visíveis',metrics.accounts],['Negócios abertos',metrics.open],
    ['Pipeline registrado',reais(metrics.openValue)],
    ['Taxa de ganho',metrics.winRate===null?'Sem base':new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(metrics.winRate)],
    ['Tarefas vencidas',metrics.overdueTasks],['Fechamentos vencidos',metrics.lateClosing],
    ['Etapas há 30+ dias',metrics.stalled],['Sem compromisso futuro',metrics.withoutNextStep]
  ]){
    const card=el('div','','card');card.style.padding='12px';
    card.appendChild(el('p',name,'small muted'));
    const strong=el('strong',value);strong.style.fontSize='1.18rem';card.appendChild(strong);kpi.appendChild(card);
  }
  overview.append(overviewTitle,overviewNote,kpi);
  overview.appendChild(el('p','Taxa de ganho = ganhas / (ganhas + perdidas), excluindo desistências. Pipeline soma valores válidos de negócios abertos, sem ponderação por probabilidade.','small muted'));
  if(metrics.unknownOpenValue){
    overview.appendChild(el('p',metrics.unknownOpenValue+' negócio(s) com valor inválido ou ausente, excluídos do total financeiro.','small muted'));
  }
  const urgent=el('section');
  urgent.appendChild(el('h3','Prioridades identificadas ('+portfolio.priorityCount+')'));
  urgent.appendChild(el('p','Ordenação por alertas objetivos: fechamento vencido, tarefa vencida, permanência na etapa e ausência de compromisso futuro. Não representa probabilidade de venda.','small muted'));
  if(!portfolio.priorities.length)urgent.appendChild(el('p','Nenhum desses alertas foi encontrado na carteira visível.','small muted'));
  for(const item of portfolio.priorities){
    const b=el('button',item.accountName+' — '+item.opportunityName+' · '+item.reasons.join(' · '),'btn ghost mini');
    b.type='button';b.style.margin='3px';
    b.addEventListener('click',()=>selectAccount(item.accountId,item.tenantId));
    urgent.appendChild(b);
  }
  overview.appendChild(urgent);
  const stages=el('section');stages.appendChild(el('h3','Pipeline aberto por etapa'));
  if(!portfolio.stages.length)stages.appendChild(el('p','Nenhum negócio aberto na carteira visível.','small muted'));
  else for(const s of portfolio.stages.slice(0,16))
    stages.appendChild(el('p',s.etapa+': '+s.quantidade+' negócio(s) · '+reais(s.valor)+(s.semValor?' · '+s.semValor+' sem valor válido':''),'small'));
  overview.appendChild(stages);
  root.replaceChildren(h,notice,overview,label,list,details);
  const current=()=>{
    if(valid())return true;
    if(root.isConnected)root.replaceChildren(el('p','Sessão ou filtro alterado. Abra a página novamente.'));
    return false;
  };
  function group(target,title,rows,empty='Nenhum item registrado'){
    const block=el('section');
    block.appendChild(el('h3',title));
    if(!rows.length)block.appendChild(el('p',empty,'small muted'));
    else{
      const ul=el('ul');
      for(const row of rows)ul.appendChild(el('li',row));
      block.appendChild(ul);
    }
    target.appendChild(block);
  }
  function selectAccount(accountId,tenantId=null){
    if(!current())return false;
    const account=findVisibleAccount(snapshot,scope,accountId,tenantId);
    if(!account){
      details.replaceChildren(el('p','Conta não autorizada ou não encontrada.'));
      return false;
    }
    const report=buildAccountBriefing({account,
      opportunities:Array.isArray(snapshot.oportunidades)?snapshot.oportunidades:[],
      contacts:Array.isArray(snapshot.contatos)?snapshot.contatos:[],
      evidence:[],asOf:new Date().toISOString()});
    const content=doc.createDocumentFragment();
    content.appendChild(el('h2',report.title));
    content.appendChild(el('p',[account.segmento,account.cidade,account.uf].filter(Boolean).map(v=>str(v)).join(' • ')||'Segmento e localização não informados','small muted'));
    content.appendChild(el('p',report.summary));
    content.appendChild(el('p','Informações cadastrais e evidências de negociação são registros internos: confira com o cliente antes de usá-las como fatos.','small muted'));
    group(content,'Pessoas e papéis no processo de compra',
      report.decisionMap.map(c=>c.name+' — '+c.role),'Nenhum interlocutor identificado');
    const events=[];
    for(const op of (snapshot.oportunidades||[])){
      if(!op||op.tenantId!==account.tenantId||op.contaId!==account.id)continue;
      for(const e of Array.isArray(op.eventos)?op.eventos:[]){
        if(e&&e.tipo==='decision'&&str(e.titulo)&&events.length<8)
          events.push(str(e.titulo)+' (registro vinculado a '+str(op.titulo||op.nome,'negociação')+')');
      }
      if(events.length>=8)break;
    }
    group(content,'Registros de decisão do CRM (não revalidados)',events,
      'Nenhum evento de decisão registrado nesta conta');
    group(content,'Lacunas para investigar',report.gaps);
    group(content,'Perguntas para a próxima reunião',report.questions);
    details.replaceChildren(content);
    return true;
  }
  function showList(){
    if(!current())return;
    const matches=selectVisibleAccounts(snapshot,scope,search.value,40);
    const fragment=doc.createDocumentFragment();
    if(!matches.length)fragment.appendChild(el('p','Nenhuma conta visível corresponde à busca.','small muted'));
    for(const account of matches){
      const button=el('button',str(account.nome||account.razaoSocial,'Conta sem nome')+
        ' · '+str(account.cidade,'local não informado'),'btn ghost mini');
      button.type='button';
      button.setAttribute('data-account-id',account.id);
      button.addEventListener('click',()=>selectAccount(account.id,account.tenantId));
      fragment.appendChild(button);
    }
    list.replaceChildren(fragment);
  }
  search.addEventListener('input',showList);
  showList();
  return {selectAccount,dispose(){active=false;root.replaceChildren();}};
}
