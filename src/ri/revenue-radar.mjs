/* RI-04 — descoberta de oportunidades sobre dados internos autorizados do IaD CRM.
 * Leitura pura: nenhuma pesquisa externa, gravação, IA, previsão ou persistência.
 * Notícias só aparecem quando o CRM já recebeu sinal externo verificado,
 * vinculado a conta e URL HTTPS; a pesquisa original é da Inteligência de Mercado.
 */
const txt=v=>typeof v==='string'?v.trim():'';
const fold=v=>txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const id=v=>typeof v==='string'&&v.length>0;
const key=(tenant,account)=>JSON.stringify([tenant,account]);
const civilDate=v=>{
  if(typeof v!=='string')return null;
  const d=v.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return null;
  const n=Date.parse(d+'T12:00:00Z');
  return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===d?d:null;
};
const days=(earlier,later)=>Math.round(
  (Date.parse(later+'T12:00:00Z')-Date.parse(earlier+'T12:00:00Z'))/86400000);
const scopeOk=s=>s&&id(s.userId)&&['gestor','admin'].includes(s.role)&&
  (s.role!=='admin'||s.admin===true)&&
  (id(s.tenantId)||(s.role==='admin'&&s.admin===true));
function allowed(row,scope){
  if(!scopeOk(scope)||!row||!id(row.id)||!id(row.tenantId))return false;
  if(scope.role==='admin'){
    return (scope.tenantFilter==='todas'||scope.tenantFilter===row.tenantId)&&
      (scope.ownerFilter==='todos'||scope.ownerFilter===row.donoId);
  }
  return row.tenantId===scope.tenantId;
}
const ownerAllowed=(row,scope)=>scope.role!=='admin'||scope.ownerFilter==='todos'||
  row.donoId===scope.ownerFilter;
function candidate(title,type,account,evidence,action,additional={}){
  return {type,title,accountId:account.id,tenantId:account.tenantId,
    accountName:txt(account.nome||account.razaoSocial)||'Conta sem nome',
    evidence,action,certainty:'Hipótese comercial para validar',
    ...additional};
}
const productKey=item=>{
  const name=fold(item?.nome||item?.produtoNome||'');
  return name?'nome:'+name:(id(item?.produtoId)?'id:'+item.produtoId:'');
};
const productDisplay=item=>txt(item?.nome||item?.produtoNome)||'produto não identificado';
function wonProducts(op){
  const result=new Map();
  for(const item of Array.isArray(op.itens)?op.itens:[]){
    const k=productKey(item);
    if(k&&!result.has(k))result.set(k,productDisplay(item));
  }
  return result;
}
const validSource=v=>{
  if(typeof v!=='string'||v.length>1800||!v.startsWith('https://'))return false;
  try{
    const u=new URL(v);
    return u.protocol==='https:'&&!!u.hostname&&
      !u.username&&!u.password&&u.hostname.includes('.')&&!/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname);
  }catch{return false;}
};
const top=(items,max=10)=>items.slice(0,max);

/* A saída nunca contém arrays de registros brutos, nomes de contas de outros
 * tenants nem hipóteses afirmadas como venda comprovada. A evidência exibida
 * pode ser auditada por um gestor no CRM. */
export function buildRevenueRadar({snapshot,scope,asOf,limit=10}={}){
  if(!snapshot||!Array.isArray(snapshot.contas)||!Array.isArray(snapshot.oportunidades)||
     !Array.isArray(snapshot.tarefas)||!scopeOk(scope)||!civilDate(asOf)||
     civilDate(asOf)!==asOf)throw Error('Carteira autorizada, escopo e data são obrigatórios');
  const max=Math.max(1,Math.min(20,Number.isSafeInteger(limit)?limit:10));
  const accounts=new Map(),opByAccount=new Map(),taskByAccount=new Map(),contactsByAccount=new Map();
  for(const a of snapshot.contas)if(allowed(a,scope))accounts.set(key(a.tenantId,a.id),a);
  const opp=[];
  for(const o of snapshot.oportunidades){
    if(!o||!id(o.tenantId)||!id(o.contaId)||!id(o.id)||!ownerAllowed(o,scope))continue;
    const k=key(o.tenantId,o.contaId);
    if(!accounts.has(k))continue;
    opp.push(o);
    if(!opByAccount.has(k))opByAccount.set(k,[]);
    opByAccount.get(k).push(o);
  }
  const taskSeen=new Set();
  for(const t of snapshot.tarefas){
    if(!t||!id(t.tenantId)||!id(t.id)||!ownerAllowed(t,scope)||taskSeen.has(key(t.tenantId,t.id)))continue;
    let accountId=id(t.contaId)?t.contaId:null;
    if(!accountId&&id(t.oportunidadeId)){
      const linked=opp.find(o=>o.tenantId===t.tenantId&&o.id===t.oportunidadeId);
      accountId=linked?.contaId||null;
    }
    if(!accountId)continue;
    const k=key(t.tenantId,accountId);
    if(!accounts.has(k))continue;
    taskSeen.add(key(t.tenantId,t.id));
    if(!taskByAccount.has(k))taskByAccount.set(k,[]);
    taskByAccount.get(k).push(t);
  }
  for(const c of Array.isArray(snapshot.contatos)?snapshot.contatos:[]){
    if(!c||!id(c.tenantId)||!id(c.contaId)||!ownerAllowed(c,scope))continue;
    const k=key(c.tenantId,c.contaId);
    if(!accounts.has(k))continue;
    contactsByAccount.set(k,(contactsByAccount.get(k)||0)+1);
  }

  const upsell=[],crossSell=[],forgotten=[],unworked=[],news=[],growth=[];
  const bySegment=new Map(),ownedWon=new Map(),sectorPurchases=new Map();
  for(const [k,a] of accounts){
    const os=opByAccount.get(k)||[];
    const won=os.filter(o=>o.desfecho?.tipo==='ganho');
    const purchased=new Map();
    for(const o of won)for(const [p,name] of wonProducts(o))purchased.set(p,name);
    ownedWon.set(k,purchased);
    const segment=fold(a.segmento);
    if(segment&&won.length){
      const sk=JSON.stringify([a.tenantId,segment]);
      if(!sectorPurchases.has(sk))sectorPurchases.set(sk,new Map());
      const sector=sectorPurchases.get(sk);
      for(const [p,name] of purchased){
        if(!sector.has(p))sector.set(p,{name,accountKeys:new Set()});
        sector.get(p).accountKeys.add(k);
      }
    }
    if(won.length){
      const label=[...purchased.values()].slice(0,2).join(', ');
      upsell.push(candidate('Avaliar expansão do relacionamento','upsell',a,
        'Histórico interno: '+won.length+' oportunidade(s) ganha(s)'+(label?' com '+label:'')+'.',
        'Confirmar escopo atualmente contratado, nível de utilização, unidades atendidas e necessidade de ampliação.',
        {reason:'Relacionamento comercial com venda anterior; expansão ainda não comprovada',
         dealId:won[0].id}));
    }

    const tasks=taskByAccount.get(k)||[];
    let last=null;
    const record=v=>{const d=civilDate(v);if(d&&d<=asOf&&(!last||d>last))last=d;};
    record(a.ultimoContatoEm);record(a.ultimaInteracaoEm);
    for(const o of os){
      for(const e of Array.isArray(o.eventos)?o.eventos:[]){
        if(e&&['decision','activity','reuniao','mensagem','contato'].includes(e.tipo))record(e.data||e.quando);
      }
    }
    let future=false;
    for(const t of tasks){
      if(t.status==='aberta'&&civilDate(t.vencimento)&&civilDate(t.vencimento)>=asOf)future=true;
      if(['concluida','concluída','fechada'].includes(t.status))
        record(t.concluidaEm||t.concluidoEm||t.dataConclusao||t.vencimento);
    }
    for(const o of os){
      const commitment=typeof o.proximoCompromisso==='string'?o.proximoCompromisso
        :o.proximoCompromisso?.data||o.proximoCompromisso?.vencimento;
      if(civilDate(commitment)&&civilDate(commitment)>=asOf)future=true;
    }
    if(last&&days(last,asOf)>=60&&!future){
      forgotten.push(candidate('Conta sem interação recente','esquecida',a,
        'Último registro comercial relevante: '+last+' ('+days(last,asOf)+' dias). Nenhuma próxima ação futura registrada.',
        'Conferir o relacionamento, definir hipótese de valor e preparar retomada personalizada.',
        {lastInteraction:last,daysIdle:days(last,asOf),dealId:os[0]?.id||null}));
    }else if(!last&&!future&&os.length){
      unworked.push(candidate('Conta ainda sem interação comprovada','sem_historico',a,
        'Existem '+os.length+' oportunidades cadastradas, mas não há interação comercial datada identificada.',
        'Verificar a origem e confirmar o primeiro contato antes de classificá-la como inativa.',
        {dealId:os[0].id}));
    }

    if(segment){
      const sk=JSON.stringify([a.tenantId,segment]);
      if(!bySegment.has(sk))bySegment.set(sk,{name:txt(a.segmento),tenantId:a.tenantId,
        recent:0,previous:0,recentAccounts:new Set(),previousAccounts:new Set()});
      const bucket=bySegment.get(sk);
      for(const o of os){
        const created=civilDate(o.criadoEm||o.dataCriacao);
        if(!created||created>asOf)continue;
        const age=days(created,asOf);
        if(age>=0&&age<90){bucket.recent++;bucket.recentAccounts.add(k);}
        else if(age>=90&&age<180){bucket.previous++;bucket.previousAccounts.add(k);}
      }
    }
  }
  // Cross-sell só com prova de compras em contas autorizadas do MESMO
  // tenant e segmento. O usuário vê a oferta potencial, não outro cliente.
  for(const [k,a] of accounts){
    const bought=ownedWon.get(k);
    if(!bought?.size||!fold(a.segmento))continue;
    const sector=sectorPurchases.get(JSON.stringify([a.tenantId,fold(a.segmento)]));
    if(!sector)continue;
    for(const [product,info] of sector){
      if(bought.has(product)||!info.accountKeys.size||info.accountKeys.size<2)continue;
      // Não inferir demanda só da existência do catálogo: histórico de vendas
      // de ao menos dois clientes do segmento é a evidência interna mínima.
      crossSell.push(candidate('Avaliar oferta complementar: '+info.name,'cross_sell',a,
        'Produto ou serviço consta em vendas ganhas de '+info.accountKeys.size+
        ' outras contas autorizadas do mesmo segmento; não aparece entre os itens ganhos desta conta.',
        'Validar aderência técnica, necessidade, contrato vigente e eventual oferta complementar.',
        {productName:info.name,peerAccounts:info.accountKeys.size,
         dealId:(opByAccount.get(k)||[]).find(o=>o.desfecho?.tipo==='ganho')?.id||null}));
    }
  }
  // Crescimento é DA CARTEIRA INTERNA, não do mercado. Não extrapolar
  // volume pequeno nem sugerir que o segmento inteiro está se expandindo.
  for(const x of bySegment.values()){
    if(x.previous<4||x.recent<5||x.recentAccounts.size<3||x.previousAccounts.size<2)continue;
    const delta=(x.recent-x.previous)/x.previous;
    if(delta<.25)continue;
    growth.push({type:'crescimento_interno',segment:x.name,tenantId:x.tenantId,
      title:'Mais oportunidades registradas em '+x.name,
      evidence:x.recent+' oportunidades criadas nos últimos 90 dias, contra '+x.previous+
        ' nos 90 dias anteriores, dentro da carteira autorizada.',
      action:'Revisar quais dores e ofertas explicam essa atividade e validar se há tendência externa na Inteligência de Mercado.',
      deltaPct:Math.round(delta*100),certainty:'Tendência interna observada; crescimento do mercado não confirmado'});
  }
  // Um sinal externo pesquisado pelo módulo Mercado só entra aqui após
  // curadoria e associação explícita à conta, com URL e status auditável.
  for(const s of Array.isArray(snapshot.sinais)?snapshot.sinais:[]){
    if(!s||!id(s.contaId)||!id(s.tenantId)||
       s.origem!=='inteligencia_mercado'||s.verificado!==true||
       !validSource(s.urlFonte||s.url))continue;
    const k=key(s.tenantId,s.contaId),a=accounts.get(k);
    if(!a||!ownerAllowed(s,scope))continue;
    const published=civilDate(s.dataPublicacao||s.quando);
    if(!published||published>asOf||days(published,asOf)>180)continue;
    news.push({type:'noticia',title:txt(s.titulo).slice(0,220)||'Movimento empresarial verificado',
      accountId:a.id,tenantId:a.tenantId,
      accountName:txt(a.nome||a.razaoSocial)||'Conta sem nome',
      date:published,sourceUrl:s.urlFonte||s.url,
      evidence:'Sinal externo verificado e vinculado à conta; fonte: '+new URL(s.urlFonte||s.url).hostname,
      action:'Avaliar se o movimento altera prioridades, orçamento ou necessidade de soluções.',
      certainty:'Fonte externa vinculada; impacto comercial ainda exige validação'});
  }
  upsell.sort((a,b)=>a.accountName.localeCompare(b.accountName,'pt-BR'));
  crossSell.sort((a,b)=>b.peerAccounts-a.peerAccounts||a.accountName.localeCompare(b.accountName,'pt-BR'));
  forgotten.sort((a,b)=>b.daysIdle-a.daysIdle);
  unworked.sort((a,b)=>a.accountName.localeCompare(b.accountName,'pt-BR'));
  growth.sort((a,b)=>b.deltaPct-a.deltaPct||a.segment.localeCompare(b.segment,'pt-BR'));
  news.sort((a,b)=>b.date.localeCompare(a.date));
  return {
    asOf,groups:{
      upsell:{label:'Upsell',count:upsell.length,items:top(upsell,max)},
      crossSell:{label:'Cross-sell',count:crossSell.length,items:top(crossSell,max)},
      forgotten:{label:'Contas esquecidas',count:forgotten.length,items:top(forgotten,max)},
      unworked:{label:'Sem histórico de interação',count:unworked.length,items:top(unworked,max)},
      growth:{label:'Setores em movimento',count:growth.length,items:top(growth,max)},
      news:{label:'Notícias e movimentos',count:news.length,items:top(news,max)}
    },
    methodology:{
      upsell:'Hipótese apoiada em negócio ganho; não mede uso, capacidade ou contrato atual.',
      crossSell:'Venda em pelo menos duas outras contas autorizadas do mesmo tenant e segmento, produto não observado entre negócios ganhos da conta.',
      forgotten:'60+ dias desde última interação comercial datada e sem ação futura; desconhecimento não equivale a abandono.',
      growth:'Comparação de criação de negócios entre dois períodos de 90 dias, amostra mínima e +25%; apenas carteira interna.',
      news:'Somente sinais curados por Inteligência de Mercado, com vínculo de conta, fonte HTTPS, verificado=true e até 180 dias.'
    }
  };
}
