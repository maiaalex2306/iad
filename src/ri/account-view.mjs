/* IaD CRM RI-01B — lazy, read-only Inteligência Comercial.
 * Snapshot MUST come from Store.dados() (already authorized).
 * No writes, no remote providers, no automatic action, no decision scoring.
 * DOM strings are displayed with textContent only.
 */
import {buildAccountBriefing} from './account-briefing.mjs';
import {localBusinessDate} from './portfolio-analytics.mjs';
import {buildCommercialOpportunityRadar} from './opportunity-radar.mjs';
import {buildRadarContactIndex} from './radar-contact.mjs';

// Cache limitado ao snapshot e ao token de sessão/permissão/revisão do Store.
 // Um logout, mudança de gestor/filtro ou escrita altera o token e invalida.
 // WeakMap permite descarte de snapshots antigos, sem armazenamento permanente.
 const radarCache=new WeakMap();
 export function buildCachedCommercialRadar({snapshot,scope,asOf}={}){
  if(!snapshot||typeof snapshot!=='object'||!scope?.token)
   return buildCommercialOpportunityRadar({snapshot,scope,asOf});
  const cached=radarCache.get(snapshot);
  if(cached&&cached.token===scope.token&&cached.asOf===asOf)return cached.radar;
  const radar=buildCommercialOpportunityRadar({snapshot,scope,asOf});
  radarCache.set(snapshot,{token:scope.token,asOf,radar});
  return radar;
 }
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

/* RI-04: oportunidades primeiro; nenhum KPI de painel nesta tela. */
export function mountAccountIntelligence({root,snapshot,scope,getScopeToken}={}){
 if(!root||!root.ownerDocument||!snapshot||!usableScope(scope)||typeof getScopeToken!=='function')
  throw Error('Destino, sessão e carteira autorizada são obrigatórios');
 const doc=root.ownerDocument;
 const radar=buildCachedCommercialRadar({snapshot,scope,asOf:localBusinessDate()});
 let contactForRadar=()=>null,contactIndexSignature='';
 let active=true,selected='pistas',searchLimit=8,visiblePistas=12,orderPistas='recente',onlyToday=false;
 const valid=()=>{
  if(!active||!root.isConnected)return false;
  try{return getScopeToken()===scope.token;}catch{return false;}
 };
 const el=(tag,text='',cls='')=>{
  const n=doc.createElement(tag);n.textContent=String(text);if(cls)n.className=cls;return n;
 };
 const add=(parent,tag,text,cls='')=>{const n=el(tag,text,cls);parent.appendChild(n);return n;};
 const secure=()=>{
  if(valid())return true;
  if(root.isConnected)root.replaceChildren(el('p','A carteira ou as permissões mudaram. Reabra a Inteligência Comercial.','iad-ri-expired'));
  return false;
 };
 const scopedOp=o=>o&&o.tenantId&&
   (scope.role==='admin'&&scope.admin===true?
    (scope.tenantFilter==='todas'||scope.tenantFilter===o.tenantId)&&
    (scope.ownerFilter==='todos'||scope.ownerFilter===o.donoId):
    o.tenantId===scope.tenantId);
 const scopedContact=c=>c&&c.tenantId&&
   (scope.role==='admin'&&scope.admin===true?
    (scope.tenantFilter==='todas'||scope.tenantFilter===c.tenantId)&&
    (scope.ownerFilter==='todos'||scope.ownerFilter===c.donoId):
    c.tenantId===scope.tenantId);
 if(!doc.getElementById('iad-ri-commercial-css')){
  const css=doc.createElement('link');css.id='iad-ri-commercial-css';css.rel='stylesheet';
  css.href=new URL('../../assets/ri-commercial.css',import.meta.url).href;doc.head.appendChild(css);
 }
 root.classList.add('iad-ri-workspace');root.replaceChildren();
 const hero=add(root,'header','','iad-ri-hero');
 const h=add(hero,'div','','iad-ri-hero-copy');
 add(h,'p','INTELIGÊNCIA COMERCIAL · CARTEIRA EXISTENTE','iad-ri-eyebrow');
 add(h,'h2','Radar de oportunidades comerciais','iad-ri-headline');
 add(h,'p','Descubra onde ampliar, recuperar e desenvolver negócios nas contas que já estão no CRM. Cada hipótese traz a evidência e a próxima ação.','iad-ri-hero-subtitle');
 const tags=add(h,'div','','iad-ri-tags');
 add(tags,'span','Somente dados autorizados','iad-ri-tag');
 add(tags,'span','Nenhuma ação automática','iad-ri-tag');
 add(tags,'span','Sem previsões inventadas','iad-ri-tag');
 const heroNote=add(hero,'aside','','iad-ri-radar-hero-note');
 add(heroNote,'strong','Oportunidade antes do indicador');
 add(heroNote,'p','Priorize decisões comerciais; o Painel continua responsável pelos números do negócio.');
 const intro=add(root,'section','','iad-ri-radar-intro');
 add(intro,'h2','Onde podemos gerar novos negócios?','iad-ri-section-title');
 add(intro,'p','Selecione um tipo de oportunidade. O radar só apresenta hipóteses fundamentadas; quando faltam dados, indica o que registrar ou validar.','iad-ri-section-intro');
 const groups=[
  {id:'pistas',title:'Pistas da carteira',desc:'Intenções de compra e necessidades distintas encontradas nas conversas e registros',
   empty:'Nenhuma intenção comercial reconhecida nos registros autorizados. Verifique se as conversas do LinkedHelper foram importadas e se o histórico contém falas do prospect.'},
  {id:'upsell',title:'Upsell',desc:'Ampliar contratos e soluções de clientes existentes',empty:'Nenhum cliente com venda ganha e itens contratados suficientes para sugerir ampliação. Registre produtos efetivamente vendidos nos negócios ganhos.'},
  {id:'crossSell',title:'Cross-sell',desc:'Investigar soluções complementares no mesmo segmento',empty:'Faltam referências de compras reais, com produtos vinculados, em outras contas do mesmo segmento. Não vamos sugerir itens aleatórios.'},
  {id:'forgotten',title:'Contas esquecidas',desc:'Retomar relacionamentos sem atividade registrada',empty:'Nenhuma conta sem atividade documentada há 90 dias e sem compromisso futuro, dentro da carteira autorizada.'},
  {id:'news',title:'Notícias e movimentos',desc:'Movimentos externos já registrados para as contas',empty:'Ainda não existem notícias com data e fonte HTTPS vinculadas às contas. Pesquise e valide sinais na Inteligência de Mercado; não vamos inventar notícias.'},
  {id:'growth',title:'Segmentos em crescimento',desc:'Detectar evolução nas vendas da própria carteira',empty:'Não há série histórica suficiente de vendas ganhas, com datas e segmentos, para demonstrar crescimento na carteira. Crescimento do mercado exige validação externa.'}
 ];
 const tabs=add(root,'nav','','iad-ri-radar-tabs');
 tabs.setAttribute('aria-label','Tipos de oportunidades comerciais');
 const navButtons=new Map();
 const spotlight=add(root,'section','','iad-ri-radar-spotlight');
 spotlight.id='iad-ri-radar-spotlight';
 const heading=add(spotlight,'div','','iad-ri-radar-panel-head');
 const htitle=add(heading,'h2','','iad-ri-section-title');
 const hdesc=add(heading,'p','','iad-ri-section-intro');
 const tools=add(spotlight,'div','','iad-ri-radar-toolbar');
 const count=add(tools,'span','','iad-ri-radar-count');
 const today=add(tools,'button','','iad-ri-radar-today');
 today.type='button';today.setAttribute('aria-pressed','false');
 const sortLabel=add(tools,'label','Ordenar: ','iad-ri-radar-order');
 const sort=add(sortLabel,'select');
 for(const opt of [{value:'recente',name:'Mais recentes'},{value:'prioridade',name:'Maior prioridade'}]){
  const option=add(sort,'option',opt.name);option.value=opt.value;
 }
 sort.value=orderPistas;
 const cards=add(spotlight,'div','','iad-ri-radar-results');
 const morePistas=add(spotlight,'button','Ver mais pistas','iad-ri-radar-more');
 morePistas.type='button';
 const info=add(spotlight,'p','Hipóteses de trabalho — cada indicação exige validação pelo responsável antes de contato ou proposta.','iad-ri-note');
 const sortByRecency=(a,b)=>
  (b.enteredAt||b.date||'').localeCompare(a.enteredAt||a.date||'')||
  b.priority-a.priority||(b.date||'').localeCompare(a.date||'')||
  a.accountName.localeCompare(b.accountName,'pt-BR');
 function goToAccount(row){
  if(!secure()||!row.accountId)return;
  selectAccount(row.accountId,row.tenantId);
  const detail=doc.getElementById('iad-ri-details');
  if(detail&&typeof detail.scrollIntoView==='function')detail.scrollIntoView({block:'start',behavior:'smooth'});
 }
 function openOpportunity(row){
  if(!secure()||!row.accountId)return;
  const account=findVisibleAccount(snapshot,scope,row.accountId,row.tenantId);
  if(!account)return;
  const op=(snapshot.oportunidades||[]).find(o=>o&&o.contaId===account.id&&
   o.tenantId===account.tenantId&&scopedOp(o)&&!o.desfecho?.tipo&&
   (!row.sourceOpportunityId||row.sourceOpportunityId===o.id));
  const app=doc.defaultView?.App;
  if(op&&typeof app?.abrir==='function')app.abrir(op.id);
  else goToAccount(row);
 }
 function renderGroup(){
  if(!secure())return;
  const g=groups.find(x=>x.id===selected);
  for(const [name,button] of navButtons){
   button.classList.toggle('active',name===selected);
   button.setAttribute('aria-pressed',String(name===selected));
  }
  htitle.textContent=g.title;
  hdesc.textContent=g.desc;
  info.textContent=selected==='pistas'
   ?'Data de entrada no CRM e data da fala são diferentes. Registros novos sem sinal explícito aparecem como “REVISAR”, não como intenção de compra comprovada. Só as falas validadas são hipóteses comerciais.'
   :'Hipóteses de trabalho — cada indicação exige validação pelo responsável antes de contato ou proposta.';
  const all=radar.groups[selected];
  const ordered=selected==='pistas'?[...all].sort(orderPistas==='recente'?sortByRecency:
   (a,b)=>b.priority-a.priority||sortByRecency(a,b)):all;
  const items=selected==='pistas'&&onlyToday?
   ordered.filter(x=>x.enteredAt===radar.asOf):ordered;
  const displayed=selected==='pistas'?items.slice(0,visiblePistas):items;
  if(selected==='pistas'){
   // Indexar apenas cartões efetivamente visíveis, mesmo com milhares de pistas.
   const signature=displayed.map(item=>JSON.stringify([item.tenantId,item.sourceOpportunityId]))
    .sort().join('|');
   if(signature!==contactIndexSignature){
    contactForRadar=buildRadarContactIndex({snapshot,scope,items:displayed});
    contactIndexSignature=signature;
   }
  }
  tools.hidden=selected!=='pistas';
  if(selected==='pistas'){
   const todayCount=all.filter(x=>x.enteredAt===radar.asOf).length;
   today.textContent='Entradas de hoje ('+todayCount+')';
   today.setAttribute('aria-pressed',String(onlyToday));
   today.classList.toggle('active',onlyToday);
   count.textContent='Exibindo '+displayed.length+' de '+items.length+' registros';
  }
  morePistas.hidden=selected!=='pistas'||displayed.length>=items.length;
  if(!morePistas.hidden)morePistas.textContent='Ver mais '+Math.min(12,items.length-displayed.length)+' registros';
  const fragment=doc.createDocumentFragment();
  if(!items.length){
   const empty=add(fragment,'div','','iad-ri-radar-empty');
   add(empty,'strong','Nenhuma oportunidade comprovável com os registros atuais');
   add(empty,'p',g.empty);
   if(selected==='news'||selected==='growth'){
    const link=add(empty,'button','Ir para Inteligência de Mercado','iad-ri-primary-small');
    link.type='button';link.addEventListener('click',()=>{
     if(secure()&&typeof doc.defaultView?.App?.ir==='function')doc.defaultView.App.ir('#/mercado');
    });
   }
  }
  for(const item of displayed){
   const card=add(fragment,'article','','iad-ri-radar-card');
   const top=add(card,'div','','iad-ri-radar-card-head');
   const copy=add(top,'div','','iad-ri-radar-card-copy');
   add(copy,'span',item.status==='verificar_fonte'?'FONTE A CONFERIR':item.status==='revisao'?'NOVO REGISTRO · REVISAR':'HIPÓTESE COMERCIAL','iad-ri-radar-status');
   add(copy,'h3',item.headline,'iad-ri-radar-card-title');
   add(copy,'p',item.accountName+(item.segment?' · '+item.segment:''),'iad-ri-radar-account');
   if(selected==='pistas'){
    if(item.enteredAt)
     add(copy,'small','Entrada no CRM: '+item.enteredAt,'iad-ri-radar-entered');
    const person=contactForRadar(item);
    const contactLine=add(copy,'div','','iad-ri-radar-contact');
    const name=add(contactLine,'div','','iad-ri-radar-contact-field');
    add(name,'span','Contato','iad-ri-radar-contact-label');
    add(name,'strong',person?.name||'A confirmar','iad-ri-radar-contact-name');
    if(person?.relation.includes('autoria a confirmar'))
     add(name,'small','Contato da empresa; autoria não confirmada','iad-ri-radar-contact-muted');
    if(person?.linkedin){
     const link=add(contactLine,'a','','iad-ri-radar-contact-field iad-ri-radar-contact-link');
     link.href=person.linkedin;link.target='_blank';link.rel='noopener noreferrer';
     link.setAttribute('aria-label','Abrir perfil LinkedIn de '+person.name);
     add(link,'span','LinkedIn','iad-ri-radar-contact-label');
     add(link,'span','Abrir perfil','iad-ri-radar-contact-value');
    }
    if(person?.phone){
     const phone=add(contactLine,'a','','iad-ri-radar-contact-field iad-ri-radar-contact-link');
     phone.href=person.phone.href;
     phone.setAttribute('aria-label','Telefone de '+person.name+': '+person.phone.label);
     add(phone,'span','Telefone','iad-ri-radar-contact-label');
     add(phone,'span',person.phone.label,'iad-ri-radar-contact-value');
    }
   }
   const detail=add(card,'div','','iad-ri-radar-evidence');
   add(detail,'strong','Por que apareceu');
   add(detail,'p',item.evidence);
   if(selected==='pistas'&&Array.isArray(item.relatedSignals)&&item.relatedSignals.length){
    const section=add(detail,'section','','iad-ri-related-intents');
    add(section,'strong','Outros sinais desta conta ('+item.relatedSignals.length+')');
    const list=add(section,'ul');
    let expanded=false;
    const showRelated=()=>{
     list.replaceChildren();
     for(const signal of item.relatedSignals.slice(0,expanded?item.relatedSignals.length:3)){
      const li=add(list,'li');
      add(li,'strong',signal.headline);
      add(li,'p',signal.evidence);
      add(li,'small','Ação: '+signal.action,'iad-ri-radar-source-label');
     }
    };
    showRelated();
    if(item.relatedSignals.length>3){
     const toggle=add(section,'button','Ver todos os '+item.relatedSignals.length+' sinais','iad-ri-radar-more-related');
     toggle.type='button';
     toggle.addEventListener('click',()=>{
      if(!secure())return;
      expanded=!expanded;showRelated();
      toggle.textContent=expanded?'Mostrar menos':'Ver todos os '+item.relatedSignals.length+' sinais';
     });
    }
   }
   if(item.sourceLabel){
    add(detail,'small','Fonte interna: '+item.sourceLabel+
      (item.date?' · Data da fala/registro: '+item.date:''),'iad-ri-radar-source-label');
   }
   const next=add(card,'div','','iad-ri-radar-next');
   add(next,'strong','Próxima ação recomendada');
   add(next,'p',item.action);
   const actions=add(card,'div','','iad-ri-radar-actions');
   if(item.accountId){
    const view=add(actions,'button','Analisar conta','iad-ri-primary-small');
    view.type='button';view.addEventListener('click',()=>goToAccount(item));
    if(selected==='upsell'||selected==='crossSell'||selected==='pistas'){
     const deal=add(actions,'button',selected==='pistas'?'Abrir registro':'Abrir relacionamento','iad-ri-link');
     deal.type='button';deal.addEventListener('click',()=>openOpportunity(item));
    }
   }
   if(item.sourceUrl){
    const link=add(actions,'a','Conferir notícia original','iad-ri-radar-source');
    link.href=item.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';
   }
   fragment.appendChild(card);
  }
  cards.replaceChildren(fragment);
 }
 for(const group of groups){
  const btn=add(tabs,'button','','iad-ri-radar-tab');
  btn.type='button';btn.dataset.radar=group.id;
  add(btn,'strong',group.title);
  add(btn,'small',group.desc);
  btn.addEventListener('click',()=>{if(!secure())return;selected=group.id;visiblePistas=12;renderGroup();});
  navButtons.set(group.id,btn);
 }
 sort.addEventListener('change',()=>{if(!secure())return;orderPistas=sort.value==='prioridade'?'prioridade':'recente';visiblePistas=12;renderGroup();});
 today.addEventListener('click',()=>{if(!secure())return;onlyToday=!onlyToday;visiblePistas=12;renderGroup();});
 morePistas.addEventListener('click',()=>{if(!secure())return;visiblePistas+=12;renderGroup();});
 const explorer=add(root,'section','','iad-ri-explorer');
 add(explorer,'h2','Investigar uma conta específica','iad-ri-section-title');
 add(explorer,'p','Localize uma empresa e confira o histórico registrado antes de sugerir uma oferta.','iad-ri-section-intro');
 const field=add(explorer,'label','Buscar empresa, segmento ou cidade','iad-ri-search-label');
 const search=add(field,'input');search.type='search';search.id='iad-ri-query';
 search.placeholder='Pesquisar uma conta da carteira';search.autocomplete='off';
 const list=add(explorer,'div','','iad-ri-list');
 const more=add(explorer,'button','Ver mais contas','iad-ri-more');
 more.type='button';more.addEventListener('click',()=>{searchLimit=Math.min(50,searchLimit+12);showList();});
 const details=add(root,'section','','iad-ri-details');details.id='iad-ri-details';
 add(details,'p','Selecione uma conta para consultar seus interlocutores, lacunas e perguntas estratégicas.','iad-ri-empty');
 function groupDetails(target,title,rows,empty='Nenhum registro disponível'){
  const block=add(target,'section','','iad-ri-detail-group');
  add(block,'h4',title);
  if(!rows.length)add(block,'p',empty,'iad-ri-note');
  else {const ul=add(block,'ul');for(const row of rows.slice(0,12))add(ul,'li',str(row).slice(0,400));}
 }
 function selectAccount(accountId,tenantId=null){
  if(!secure())return false;
  const account=findVisibleAccount(snapshot,scope,accountId,tenantId);
  if(!account){details.replaceChildren(el('p','Conta não autorizada ou não encontrada.'));return false;}
  const opportunities=(snapshot.oportunidades||[]).filter(o=>o&&o.contaId===account.id&&
   o.tenantId===account.tenantId&&scopedOp(o));
  const contacts=(snapshot.contatos||[]).filter(c=>c&&c.contaId===account.id&&
   c.tenantId===account.tenantId&&scopedContact(c));
  const report=buildAccountBriefing({account,opportunities,contacts,evidence:[],asOf:new Date().toISOString()});
  const fragment=doc.createDocumentFragment();
  const top=add(fragment,'header','','iad-ri-detail-header');
  const box=add(top,'div');
  add(box,'p','DOSSIÊ INTERNO DA CONTA','iad-ri-eyebrow');
  add(box,'h2',report.title,'iad-ri-section-title');
  add(box,'p',[account.segmento,account.cidade,account.uf].filter(Boolean).map(x=>str(x)).join(' · ')||
   'Localização e segmento não informados','iad-ri-section-intro');
  add(top,'p',report.summary,'iad-ri-detail-summary');
  const grid=add(fragment,'div','','iad-ri-detail-grid');
  groupDetails(grid,'Interlocutores registrados',report.decisionMap.map(x=>x.name+' — '+x.role));
  groupDetails(grid,'Lacunas a confirmar',report.gaps);
  groupDetails(grid,'Perguntas para próxima conversa',report.questions);
  add(fragment,'p','Somente leitura: registros internos sujeitos a validação. Nenhuma tarefa ou negócio foi criado.','iad-ri-note');
  details.replaceChildren(fragment);
  return true;
 }
 function showList(){
  if(!secure())return;
  const found=selectVisibleAccounts(snapshot,scope,search.value,searchLimit);
  const fragment=doc.createDocumentFragment();
  if(!found.length)fragment.appendChild(el('p','Nenhuma conta corresponde à busca.','iad-ri-empty'));
  for(const account of found){
   const btn=add(fragment,'button','','iad-ri-account-row');
   btn.type='button';btn.dataset.accountId=account.id;
   add(btn,'strong',str(account.nome||account.razaoSocial,'Conta sem nome'),'iad-ri-account-name');
   add(btn,'span',[str(account.segmento),str(account.cidade,'Local não informado')].filter(Boolean).join(' · '),'iad-ri-account-meta');
   add(btn,'span','Analisar conta','iad-ri-account-cta');
   btn.addEventListener('click',()=>selectAccount(account.id,account.tenantId));
  }
  list.replaceChildren(fragment);
  more.hidden=found.length<searchLimit||searchLimit>=50;
 }
 search.addEventListener('input',()=>{searchLimit=8;showList();});
 renderGroup();showList();
 return {selectAccount,dispose(){active=false;root.replaceChildren();}};
}
