/* IaD CRM RI-01B — lazy, read-only Inteligência Comercial.
 * Snapshot MUST come from Store.dados() (already authorized).
 * No writes, no remote providers, no automatic action, no decision scoring.
 * DOM strings are displayed with textContent only.
 */
import {buildAccountBriefing} from './account-briefing.mjs';
import {buildPortfolioAnalytics, localBusinessDate} from './portfolio-analytics.mjs';

const id = value => typeof value === 'string' && value.trim().length > 0;
const fold = value => String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const str = (value,fallback='') => typeof value==='string' && value.trim() ? value.trim().slice(0,200) : fallback;
const usableScope = scope => !!scope && id(scope.userId) &&
  ['gestor','admin'].includes(scope.role) &&
  (scope.role !== 'admin' || scope.admin === true) &&
  (id(scope.tenantId) || (scope.role === 'admin' && scope.admin === true));
function allowedAccount(a,scope) {
  if(!usableScope(scope) || !a || !id(a.id) || !id(a.tenantId))return false;
  const admin=scope.admin===true && scope.role==='admin';
  if(admin){
    return (scope.tenantFilter==='todas'||a.tenantId===scope.tenantFilter) &&
      (scope.ownerFilter==='todos'||a.donoId===scope.ownerFilter);
  }
  return a.tenantId===scope.tenantId;
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
  if(!root||!root.ownerDocument||!snapshot||!usableScope(scope)||
     typeof getScopeToken!=='function')
    throw Error('A visualização requer destino e sessão autorizada');
  const doc=root.ownerDocument;
  let active=true,selectedMotion='fechar',showAllActions=false,searchLimit=10;
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
  const add=(parent,tag,text,className='')=>{
    const e=el(tag,text,className);parent.appendChild(e);return e;
  };
  const money=n=>new Intl.NumberFormat('pt-BR',
    {style:'currency',currency:'BRL',maximumFractionDigits:2}).format(n||0);
  const number=n=>new Intl.NumberFormat('pt-BR').format(n||0);
  const percent=(numerator,denominator)=>denominator
    ?new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1})
       .format(numerator/denominator):'—';
  const portfolio=buildPortfolioAnalytics({snapshot,scope,asOf:localBusinessDate()});
  const metrics=portfolio.metrics;
  const safeNavigation=()=>{
    if(valid())return true;
    if(root.isConnected)root.replaceChildren(
      el('p','A carteira ou as permissões foram atualizadas. Abra a página novamente.','iad-ri-expired'));
    return false;
  };
  // Escopo estrito, mesmo quando o administrador restringe o filtro de dono.
  const scopedOp=o=>o && (o.tenantId===scope.tenantId||
    (scope.role==='admin'&&scope.admin===true&&
      (scope.tenantFilter==='todas'||scope.tenantFilter===o.tenantId))) &&
    (scope.role!=='admin'||scope.ownerFilter==='todos'||scope.ownerFilter===o.donoId);
  const scopedContact=c=>c && (c.tenantId===scope.tenantId||
    (scope.role==='admin'&&scope.admin===true&&
      (scope.tenantFilter==='todas'||scope.tenantFilter===c.tenantId))) &&
    (scope.role!=='admin'||scope.ownerFilter==='todos'||scope.ownerFilter===c.donoId);
  if(!doc.getElementById('iad-ri-commercial-css')){
    const css=doc.createElement('link');
    css.id='iad-ri-commercial-css';css.rel='stylesheet';
    css.href=new URL('../../assets/ri-commercial.css',import.meta.url).href;
    doc.head.appendChild(css);
  }
  root.classList.add('iad-ri-workspace');
  root.replaceChildren();

  const header=el('header','','iad-ri-hero');
  const headcopy=add(header,'div','','iad-ri-hero-copy');
  add(headcopy,'p','INTELIGÊNCIA COMERCIAL · BASE INTERNA','iad-ri-eyebrow');
  add(headcopy,'h2','Transformar carteira em negócios','iad-ri-headline');
  add(headcopy,'p','Encontre o que pode avançar, defina a próxima decisão e concentre o esforço comercial nas contas certas.','iad-ri-hero-subtitle');
  const tags=add(headcopy,'div','','iad-ri-tags');
  add(tags,'span','Leitura autorizada','iad-ri-tag');
  add(tags,'span','Sem alteração de dados','iad-ri-tag');
  add(tags,'span','Referência: '+portfolio.asOf,'iad-ri-tag');
  const headside=add(header,'div','','iad-ri-hero-stat');
  add(headside,'span','CARTEIRA EM ANÁLISE','iad-ri-hero-stat-label');
  add(headside,'strong',number(metrics.accounts),'iad-ri-hero-stat-value');
  add(headside,'span','contas visíveis da sua organização','iad-ri-hero-stat-caption');
  root.appendChild(header);

  const portfolioSection=el('section','','iad-ri-portfolio');
  portfolioSection.appendChild(el('h2','Visão da carteira — indicadores internos','iad-ri-section-title'));
  portfolioSection.appendChild(el('p','O ponto de partida para tomar decisões. Todos os números vêm exclusivamente do CRM e não representam previsão de fechamento.','iad-ri-section-intro'));
  const kpis=add(portfolioSection,'div','','iad-ri-kpis');
  function kpi(label,value,caption,variant=''){
    const card=add(kpis,'article','','iad-ri-kpi '+variant);
    add(card,'span',label,'iad-ri-kpi-label');
    add(card,'strong',value,'iad-ri-kpi-value');
    add(card,'span',caption,'iad-ri-kpi-caption');
  }
  kpi('Contas visíveis',number(metrics.accounts),'Base de clientes e prospects');
  kpi('Negócios abertos',number(metrics.open),'Oportunidades em andamento');
  kpi('Pipeline registrado',money(metrics.openValue),'Soma sem ponderação por probabilidade');
  kpi('Com valor positivo',number(metrics.positiveOpen),'de '+number(metrics.open)+' negócios abertos','iad-ri-kpi-feature');
  const secondary=add(portfolioSection,'div','','iad-ri-signals');
  const sig=(value,label,caption,kind='')=>{
    const card=add(secondary,'article','','iad-ri-signal '+kind);
    add(card,'strong',value,'iad-ri-signal-value');
    const copy=add(card,'div','','iad-ri-signal-copy');
    add(copy,'span',label,'iad-ri-signal-label');
    add(copy,'small',caption,'iad-ri-signal-caption');
  };
  sig(number(metrics.withoutNextStep),'Sem compromisso futuro',
    'Sem tarefa futura ou compromisso registrado','attention');
  sig(number(metrics.overdueTasks),'Tarefas vencidas',
    'Ocorrências; uma conta pode ter várias','attention');
  sig(number(metrics.stalled),'Etapas há 30+ dias',
    'Negócios parados na etapa atual');
  sig(metrics.winRate===null?'Sem base':percent(metrics.won,metrics.won+metrics.lost),
    'Taxa de ganho','Somente ganhas / (ganhas + perdidas)');
  const diagnosis=add(portfolioSection,'div','','iad-ri-diagnosis');
  add(diagnosis,'div','LEITURA ESTRATÉGICA DA CARTEIRA','iad-ri-eyebrow');
  const early=portfolio.stages
    .filter(x=>/^(conex|prospec)/.test(fold(x.etapa)))
    .reduce((sum,x)=>sum+x.quantidade,0);
  add(diagnosis,'p',
    percent(early,metrics.open)+' das oportunidades abertas estão em Conexão ou Prospecção. '+
    'O maior ganho operacional pode vir da qualificação e do avanço dessas conversas, '+
    'antes de tratar todo contato como negociação madura.',
    'iad-ri-diagnosis-text');
  add(diagnosis,'small',
    'Diagnóstico de distribuição por etapa, não estimativa de conversão. '+number(metrics.lateClosing)+
    ' fechamentos estão vencidos e '+number(metrics.accountsWithoutOpen)+
    ' contas não têm oportunidade aberta registrada.','iad-ri-note');

  const stageBox=add(portfolioSection,'section','','iad-ri-stage-panel');
  add(stageBox,'h3','Onde estão as negociações','iad-ri-panel-title');
  add(stageBox,'p','Participação por quantidade e valor nominal por etapa.','iad-ri-panel-subtitle');
  const stageRows=add(stageBox,'div','','iad-ri-stage-rows');
  for(const stage of portfolio.stages.slice(0,12)){
    const row=add(stageRows,'div','','iad-ri-stage-row');
    const labels=add(row,'div','','iad-ri-stage-labels');
    add(labels,'span',str(stage.etapa,'Sem etapa'),'iad-ri-stage-name');
    add(labels,'span',number(stage.quantidade)+' · '+money(stage.valor),'iad-ri-stage-data');
    const track=add(row,'div','','iad-ri-stage-track');
    const bar=add(track,'div','','iad-ri-stage-bar');
    bar.style.width=(metrics.open?Math.max(.6,100*stage.quantidade/metrics.open):0)+'%';
    bar.setAttribute('role','img');
    bar.setAttribute('aria-label',stage.etapa+': '+number(stage.quantidade)+' negociações');
  }
  const stageFooter=add(stageBox,'p','Importante: valor R$ 0,00 não significa ausência de potencial; significa que não há receita estimada registrada.','iad-ri-note');
  stageFooter.setAttribute('role','note');
  root.appendChild(portfolioSection);

  const strategy=el('section','','iad-ri-strategy');
  add(strategy,'h2','Plano de ataque comercial','iad-ri-section-title');
  add(strategy,'p','Quatro filas para transformar informação em avanço. As recomendações são regras auditáveis, não pontuações de IA.','iad-ri-section-intro');
  const motions=[
    {id:'fechar',label:'01 · Fechar',subtitle:'Oportunidades em proposta ou negociação',next:'Confirmar decisão, decisores e data'},
    {id:'avancar',label:'02 · Avançar',subtitle:'Descoberta, diagnóstico e benefícios',next:'Validar impacto e critérios de compra'},
    {id:'reativar',label:'03 · Reativar',subtitle:'Estagnadas que precisam de nova decisão',next:'Retomar ou encaminhar para nutrição'},
    {id:'qualificar',label:'04 · Qualificar',subtitle:'Conexões que ainda precisam de descoberta',next:'Confirmar problema e próximo encontro'}
  ];
  const motionNav=add(strategy,'div','','iad-ri-motions');
  const motionButtons=new Map();
  const queueTitle=el('h3','Prioridades identificadas ('+portfolio.priorityCount+')','iad-ri-panel-title');
  const queue=el('div','','iad-ri-work-queue');
  const queueInfo=el('p','','iad-ri-panel-subtitle');
  const showMore=el('button','Mostrar mais desta fila','iad-ri-more');
  showMore.type='button';
  const actionPanel=add(strategy,'div','','iad-ri-action-panel');
  const toolbar=add(actionPanel,'div','','iad-ri-action-toolbar');
  toolbar.append(queueTitle,queueInfo);
  actionPanel.append(queue,showMore);
  function openOpportunity(item){
    if(!safeNavigation())return;
    if(!findVisibleAccount(snapshot,scope,item.accountId,item.tenantId))return;
    const op=(snapshot.oportunidades||[]).find(o=>o&&o.id===item.opportunityId&&
      o.tenantId===item.tenantId&&o.contaId===item.accountId&&scopedOp(o));
    if(!op)return;
    const app=doc.defaultView&&doc.defaultView.App;
    if(app&&typeof app.abrir==='function')app.abrir(op.id);
  }
  function renderMotion(){
    if(!safeNavigation())return;
    for(const [name,button] of motionButtons){
      const selected=name===selectedMotion;
      button.classList.toggle('active',selected);
      button.setAttribute('aria-pressed',String(selected));
    }
    const choice=motions.find(x=>x.id===selectedMotion);
    const data=portfolio.motions[selectedMotion];
    queueTitle.textContent='Prioridades identificadas ('+number(data.count)+')';
    queueInfo.textContent=choice.next+'. Abra a conta para revisar evidências ou siga para o Cockpit.';
    const rows=doc.createDocumentFragment();
    const visible=showAllActions?data.items:data.items.slice(0,6);
    for(const item of visible){
      const row=el('article','','iad-ri-work-row');
      const main=add(row,'div','','iad-ri-work-main');
      const top=add(main,'div','','iad-ri-work-top');
      add(top,'strong',str(item.accountName,'Conta sem nome'),'iad-ri-work-name');
      const stage=add(top,'span',str(item.stage,'Sem etapa'),'iad-ri-stage-chip');
      stage.title='Etapa cadastrada no CRM';
      add(main,'p',str(item.opportunityName,'Oportunidade'),'iad-ri-work-sub');
      add(main,'p',item.action,'iad-ri-work-action');
      const flags=add(main,'div','','iad-ri-work-flags');
      if(item.overdueTasks)add(flags,'span',number(item.overdueTasks)+' tarefa(s) vencida(s)','iad-ri-work-flag');
      if(item.lateClosing)add(flags,'span','Fechamento vencido','iad-ri-work-flag');
      if(item.stageDays>=30)add(flags,'span',item.stageDays+' dias na etapa','iad-ri-work-flag');
      if(!item.withNextStep)add(flags,'span','Sem próxima ação futura','iad-ri-work-flag');
      const control=add(row,'div','','iad-ri-work-control');
      if(item.value>0)add(control,'strong',money(item.value),'iad-ri-work-money');
      const review=add(control,'button','Analisar conta','iad-ri-link');
      review.type='button';review.addEventListener('click',()=>selectAccount(item.accountId,item.tenantId));
      const open=add(control,'button','Abrir negócio','iad-ri-primary-small');
      open.type='button';open.addEventListener('click',()=>openOpportunity(item));
      rows.appendChild(row);
    }
    if(!visible.length)rows.appendChild(el('p','Nenhuma oportunidade nesta fila com o filtro atual.','iad-ri-empty'));
    queue.replaceChildren(rows);
    showMore.hidden=data.items.length<=6||showAllActions;
    const overflow=data.count-data.items.length;
    if(overflow>0){
      const note=add(queue,'p',
        'Exibindo até '+number(data.items.length)+' prioridades. Outros '+number(overflow)+
        ' negócios permanecem acessíveis pelo Pipeline e pela busca de contas.','iad-ri-note');
      note.setAttribute('role','note');
    }
  }
  for(const motion of motions){
    const bucket=portfolio.motions[motion.id];
    const button=el('button','','iad-ri-motion');
    button.type='button';button.setAttribute('data-motion',motion.id);
    const top=add(button,'div','','iad-ri-motion-head');
    add(top,'strong',motion.label);
    add(top,'span',number(bucket.count),'iad-ri-motion-count');
    add(button,'span',motion.subtitle,'iad-ri-motion-desc');
    button.addEventListener('click',()=>{
      if(!safeNavigation())return;
      selectedMotion=motion.id;showAllActions=false;renderMotion();
    });
    motionButtons.set(motion.id,button);
    motionNav.appendChild(button);
  }
  showMore.addEventListener('click',()=>{showAllActions=true;renderMotion();});
  root.appendChild(strategy);

  const explorer=el('section','','iad-ri-explorer');
  const title=add(explorer,'div','','iad-ri-explorer-title');
  const left=add(title,'div');
  add(left,'h2','Explorar contas da carteira','iad-ri-section-title');
  add(left,'p','Busque pelo nome, segmento ou cidade. Selecione para preparar a próxima conversa.','iad-ri-section-intro');
  const field=add(explorer,'label','Buscar empresa, segmento ou cidade','iad-ri-search-label');
  const search=add(field,'input');
  search.type='search';search.id='iad-ri-query';search.placeholder='Digite o nome de uma conta, segmento ou cidade';
  search.autocomplete='off';search.setAttribute('aria-label','Buscar contas autorizadas');
  const list=add(explorer,'div','','iad-ri-list');
  const moreAccounts=add(explorer,'button','Ver mais contas','iad-ri-more');
  moreAccounts.type='button';moreAccounts.addEventListener('click',()=>{searchLimit=Math.min(50,searchLimit+15);showList();});
  root.appendChild(explorer);
  const details=el('section','','iad-ri-details');
  details.id='iad-ri-details';
  add(details,'p','Selecione uma conta para visualizar as evidências, os interlocutores e as perguntas para a próxima reunião.','iad-ri-empty');
  root.appendChild(details);
  function group(target,title,rows,empty='Nenhum item registrado'){
    const block=add(target,'section','','iad-ri-detail-group');
    add(block,'h4',title);
    if(!rows.length)add(block,'p',empty,'iad-ri-note');
    else{
      const ul=add(block,'ul');
      for(const row of rows.slice(0,12))add(ul,'li',str(row,'Informação não disponível').slice(0,400));
    }
  }
  function selectAccount(accountId,tenantId=null){
    if(!safeNavigation())return false;
    const account=findVisibleAccount(snapshot,scope,accountId,tenantId);
    if(!account){details.replaceChildren(el('p','Conta não autorizada ou não encontrada.'));return false;}
    const opportunities=(snapshot.oportunidades||[]).filter(o=>o&&o.contaId===account.id&&
      o.tenantId===account.tenantId&&scopedOp(o));
    const contacts=(snapshot.contatos||[]).filter(c=>c&&c.contaId===account.id&&
      c.tenantId===account.tenantId&&scopedContact(c));
    const report=buildAccountBriefing({account,opportunities,contacts,evidence:[],
      asOf:new Date().toISOString()});
    const content=doc.createDocumentFragment();
    const intro=add(content,'header','','iad-ri-detail-header');
    const info=add(intro,'div');
    add(info,'p','DOSSIÊ INTERNO DA CONTA','iad-ri-eyebrow');
    add(info,'h2',report.title,'iad-ri-section-title');
    add(info,'p',[account.segmento,account.cidade,account.uf].filter(Boolean).map(x=>str(x)).join(' • ')||
      'Segmento e localização não informados','iad-ri-section-intro');
    add(intro,'p',report.summary,'iad-ri-detail-summary');
    const grid=add(content,'div','','iad-ri-detail-grid');
    group(grid,'Interlocutores e papéis registrados',report.decisionMap.map(x=>x.name+' — '+x.role),
      'Nenhum interlocutor registrado');
    const events=[];
    for(const op of opportunities){
      for(const event of (Array.isArray(op.eventos)?op.eventos:[])){
        if(event&&event.tipo==='decision'&&str(event.titulo)&&events.length<8)
          events.push(str(event.titulo)+' (registro vinculado a '+str(op.titulo||op.nome,'negociação')+')');
      }
      if(events.length>=8)break;
    }
    group(grid,'Evidências e registros de decisão (a confirmar)',events,
      'Nenhuma evidência de decisão registrada');
    group(grid,'Lacunas do cadastro e da descoberta',report.gaps);
    group(grid,'Perguntas estratégicas para avançar',report.questions);
    add(content,'p','Todos os dados são registros internos ainda sujeitos à confirmação. Nenhuma mensagem, tarefa ou negócio foi criado automaticamente.','iad-ri-note');
    details.replaceChildren(content);
    return true;
  }
  function showList(){
    if(!safeNavigation())return;
    const max=searchLimit,found=selectVisibleAccounts(snapshot,scope,search.value,max);
    const fragment=doc.createDocumentFragment();
    if(!found.length)fragment.appendChild(el('p','Nenhuma conta corresponde à busca.','iad-ri-empty'));
    for(const account of found){
      const button=el('button','','iad-ri-account-row');
      button.type='button';button.setAttribute('data-account-id',account.id);
      const name=add(button,'strong',str(account.nome||account.razaoSocial,'Conta sem nome'));
      name.className='iad-ri-account-name';
      add(button,'span',
        [str(account.segmento,''),str(account.cidade,'local não informado')].filter(Boolean).join(' · '),
        'iad-ri-account-meta');
      const arrow=add(button,'span','Ver análise','iad-ri-account-cta');
      arrow.setAttribute('aria-hidden','true');
      button.addEventListener('click',()=>selectAccount(account.id,account.tenantId));
      fragment.appendChild(button);
    }
    list.replaceChildren(fragment);
    moreAccounts.hidden=found.length<max||max>=50;
  }
  search.addEventListener('input',()=>{searchLimit=10;showList();});
  renderMotion();showList();
  return {selectAccount,dispose(){active=false;root.replaceChildren();}};
}
