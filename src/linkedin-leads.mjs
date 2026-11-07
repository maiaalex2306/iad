/* LinkedIN Leads — campanha assistida e revisada pelo operador.
   Nenhum login, senha, cookie, token ou comando do LinkedIn passa pelo CRM.
   Post e comentário são fornecidos conscientemente pelo usuário.
   Sem OAuth aprovado, copiar/abrir publicação NÃO é publicar ou curtir. */
import {importLinkedInCsv} from './linkedin-csv.mjs';
import {campaignSummary,nextPending,skipWithoutPost,setProfileOpened,setLikeConfirmed,setCommentConfirmed,canReviewProfile,reviewWindow,TERMINAIS} from './linkedin-campaign-engine.mjs';

export function linkedinUrl(input,kind='post') {
  let parsed;
  try { parsed=new URL(String(input||'').trim()); } catch (_) { return ''; }
  if (parsed.protocol!=='https:' || !/(^|\.)linkedin\.com$/i.test(parsed.hostname) ||
      parsed.username || parsed.password) return '';
  if (kind==='profile' && !/^\/in\/[^/?#]+\/?$/i.test(parsed.pathname)) return '';
  if (kind==='post' &&
      !(/^\/feed\/update\/[^/?#]+/i.test(parsed.pathname) ||
        /^\/posts\/[^/?#]+/i.test(parsed.pathname) ||
        /^\/pulse\/[^/?#]+/i.test(parsed.pathname))) return '';
  parsed.hash='';
  return parsed.href;
}

export function prepareLinkedInCampaign(fields={}) {
  const trim=(value,limit)=>String(value||'').trim().slice(0,limit);
  const campaign={
    lead:trim(fields.lead,120),cargo:trim(fields.cargo,140),
    empresa:trim(fields.empresa,160),perfil:linkedinUrl(fields.perfil,'profile'),
    postUrl:linkedinUrl(fields.postUrl,'post'),
    resumoPerfil:trim(fields.resumoPerfil,1200),
    post:trim(fields.post,6000),comentarioLead:trim(fields.comentarioLead,2000),
    solucao:trim(fields.solucao,1200),estilo:['consultivo','tecnico','objetivo'].includes(fields.estilo)?fields.estilo:'consultivo'
  };
  if (!campaign.lead) throw new Error('Informe o nome do lead.');
  if (!campaign.postUrl) throw new Error('Informe um link válido de publicação do LinkedIn.');
  if (campaign.post.length<40) throw new Error('Cole o texto do post (mínimo de 40 caracteres).');
  return campaign;
}

export function campaignText(c) {
  return [
    'POST DO LINKEDIN (conteúdo fornecido pelo usuário):',c.post,
    'COMENTÁRIO DO LEAD NO POST (opcional):',c.comentarioLead||'não informado',
    'LEAD:',c.lead,
    'CARGO:',c.cargo||'não informado',
    'EMPRESA:',c.empresa||'não informada',
    'DADOS PÚBLICOS DO PERFIL INFORMADOS PELO USUÁRIO:',c.resumoPerfil||'não informado',
    'NOSSA SOLUÇÃO / POSICIONAMENTO:',c.solucao||'não informado',
    'ESTILO SOLICITADO:',c.estilo,
    'TAREFA: redigir um comentário público simpático e útil sobre a publicação, introduzindo uma reflexão pertinente sobre água e convidando delicadamente para uma conversa sobre o tema. O comentário do lead é contexto opcional.'
  ].join('\n');
}

function elem(doc,tag,text='',classe='') {
  const e=doc.createElement(tag);
  if(text)e.textContent=String(text);
  if(classe)e.className=classe;
  return e;
}
function inputField(doc,container,label,type='text',opts={}) {
  const wrap=elem(doc,'label','','iad-linkedin-field'),title=elem(doc,'span',label,'iad-linkedin-label');
  const input=type==='textarea'?elem(doc,'textarea'):elem(doc,'input');
  if(type!=='textarea')input.type=type;
  input.placeholder=opts.placeholder||'';
  input.maxLength=opts.max||2000;
  if(type==='textarea')input.rows=opts.rows||3;
  if(opts.required)input.required=true;
  input.autocomplete='off';
  wrap.append(title,input);container.append(wrap);
  return input;
}
function action(doc,text,onClick,alt=false) {
  const e=elem(doc,'button',text,'btn'+(alt?' alt':''));
  e.type='button';e.addEventListener('click',onClick);return e;
}
function selectOption(doc,value,label) {
  const e=elem(doc,'option',label);e.value=value;return e;
}
export function mountLinkedInLeads({root,snapshot,scope,getScopeToken,nuvem}={}) {
  if(!root||!root.ownerDocument||!scope||typeof getScopeToken!=='function')
    throw new Error('Sessão autorizada obrigatória.');
  const doc=root.ownerDocument;
  const valid=()=>root.isConnected&&getScopeToken()===scope.token;
  const notices=elem(doc,'p','Fluxo: login → CSV → abrir perfil → procurar post → curtir → analisar → comentar sobre água → próximo lead. Sem post: marcar e avançar. Ações externas exigem sua confirmação no LinkedIn.','small muted');
  const safe=elem(doc,'p','Sua senha é digitada somente em linkedin.com. O IaD CRM não solicita nem armazena senha, cookies ou tokens do LinkedIn.','small muted');
  const login=action(doc,'Abrir login oficial do LinkedIn',()=>globalThis.open('https://www.linkedin.com/login','_blank','noopener,noreferrer'),true);
  const acesso=elem(doc,'section','','card');
  acesso.append(elem(doc,'h2','1. Conta LinkedIn'),safe,login);
  const arquivoBox=elem(doc,'section','','card');
  arquivoBox.append(elem(doc,'h2','2. Importar leads por CSV'),
    elem(doc,'p','Forneça os perfis que serão analisados. Cabeçalhos aceitos: LinkedIn ou profile_url; Nome, Cargo, Empresa, Resumo Perfil, Post URL, Texto Post e Comentário Lead são opcionais. Arquivo processado somente nesta aba, sem cadastrar automaticamente contatos no CRM.','small muted'));
  const csvFile=elem(doc,'input');
  csvFile.type='file';csvFile.accept='.csv,text/csv';csvFile.setAttribute('aria-label','Selecionar planilha CSV de leads');
  const csvSearch=elem(doc,'input');csvSearch.type='search';
  csvSearch.placeholder='Buscar lead, cargo ou empresa na lista importada';
  csvSearch.setAttribute('aria-label','Filtrar leads do CSV');
  csvSearch.style.width='100%';csvSearch.hidden=true;
  const csvStatus=elem(doc,'p','Nenhuma planilha importada.','small muted');
  csvStatus.setAttribute('role','status');csvStatus.setAttribute('aria-live','polite');
  const csvRows=elem(doc,'div','','iad-linkedin-import-list');
  const csvPager=elem(doc,'div','','iad-linkedin-buttons');
  const csvPrevious=action(doc,'Anterior',()=>{page=Math.max(0,page-1);renderCsv();},true);
  const csvNext=action(doc,'Próxima',()=>{page++;renderCsv();},true);
  const csvPage=elem(doc,'span','','small muted');
  csvPager.append(csvPrevious,csvPage,csvNext);csvPager.hidden=true;
  arquivoBox.append(csvFile,csvStatus,csvSearch,csvRows,csvPager);
  let campaignRows=[],page=0,activeRow=null,requestVersion=0,campaignPaused=false;
  function openProfileFor(row,providedUrl) {
    if(!valid()||campaignPaused){status.textContent='Campanha pausada ou sessão alterada.';return;}
    const url=linkedinUrl(providedUrl||row?.perfil,'profile');
    if(!url){status.textContent='URL do perfil inválida. Informe um endereço /in/.';return;}
    if(row){
      const gate=canReviewProfile(campaignRows,row);
      if(!gate.ok){status.textContent=gate.reason+(gate.nextAt?' Tente após '+new Date(gate.nextAt).toLocaleTimeString('pt-BR')+'.':'');return;}
      if(activeRow!==row)selectCsvRow(row,false);
    }
    doc.defaultView.open(url,'_blank','noopener,noreferrer');
    status.textContent='Abertura solicitada no LinkedIn. Quando o perfil estiver aberto, confirme a revisão na fila. Se não houver publicação, marque Sem post.';
  }
  function renderCsv(){
    if(!valid())return;
    const term=csvSearch.value.trim().toLocaleLowerCase('pt-BR');
    const filtered=term?campaignRows.filter(x=>[x.lead,x.empresa,x.cargo,x.perfil].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(term))):campaignRows;
    const pageMax=Math.max(1,Math.ceil(filtered.length/25));page=Math.min(page,pageMax-1);
    csvRows.replaceChildren();
    for(const item of filtered.slice(page*25,(page+1)*25)){
      const row=elem(doc,'div','','iad-linkedin-import-row');
      const title=elem(doc,'strong',item.lead||'Lead');
      const details=elem(doc,'span',[item.empresa,item.cargo].filter(Boolean).join(' · ')||'Dados adicionais não informados','small muted');
      const names={rascunho:'Rascunho gerado',confirmado:'Comentário confirmado',sem_post:'Sem post',curtido:'Curtida confirmada',post_localizado:'Post localizado',perfil_aberto:'Perfil aberto',erro:'Erro'};
      const state=elem(doc,'span',names[item.estado]||'Pendente','small muted');
      const open=action(doc,'Abrir perfil',()=>openProfileFor(item,item.perfil),true);
      const choose=action(doc,activeRow===item?'Selecionado':'Selecionar',()=>selectCsvRow(item),true);
      row.append(title,details,state,open,choose);csvRows.append(row);
    }
    csvPage.textContent=filtered.length+' lead(s) · página '+(page+1)+' de '+pageMax;
    csvPrevious.disabled=page===0;csvNext.disabled=page>=pageMax-1;
    csvPager.hidden=!campaignRows.length;csvSearch.hidden=!campaignRows.length;
    if(typeof refreshQueue==='function')refreshQueue();
  }
  csvSearch.addEventListener('input',()=>{page=0;renderCsv();});
  async function readCsv(file){
    const data=await file.arrayBuffer();
    const bytes=new Uint8Array(data);
    if(bytes[0]===0xff && bytes[1]===0xfe)return new TextDecoder('utf-16le').decode(data);
    if(bytes[0]===0xfe && bytes[1]===0xff)return new TextDecoder('utf-16be').decode(data);
    try{return new TextDecoder('utf-8',{fatal:true}).decode(data);}
    catch(_){return new TextDecoder('windows-1252').decode(data);}
  }
  csvFile.addEventListener('change',async()=>{
    if(!valid())return;
    const file=csvFile.files?.[0];if(!file)return;
    if(file.size>3*1024*1024){csvStatus.textContent='CSV maior que 3 MB. Divida a lista em arquivos menores.';return;}
    if(!/\.csv$/i.test(file.name)){csvStatus.textContent='Selecione um arquivo com extensão .csv.';return;}
    csvStatus.textContent='Lendo e validando planilha...';
    try{
      const text=await readCsv(file);
      if(!valid())return;
      const parsed=importLinkedInCsv(text);
      campaignRows=parsed.leads;page=0;activeRow=null;requestVersion++;campaignPaused=false;
      btnPause.textContent='Pausar campanha';
      csvSearch.value='';
      const s=parsed.summary;
      csvStatus.textContent=file.name+': '+s.valid+' perfil(is) válido(s), '+s.duplicates+' duplicado(s), '+s.invalid+' inválido(s), de '+s.total+' linhas. Dados locais nesta aba. '+(s.problems.length?'Primeiros erros nas linhas: '+s.problems.slice(0,8).map(p=>p.line).join(', ')+'.':'');
      renderCsv();
      if(campaignRows.length)selectCsvRow(campaignRows[0],false);
    }catch(e){csvStatus.textContent='Falha na leitura: '+String(e?.message||e).slice(0,240);}
  });

  const form=elem(doc,'form','','card');
  form.noValidate=true;
  form.append(elem(doc,'h2','4. Selecionar publicação e lead'));
  form.addEventListener('submit',e=>e.preventDefault());
  const cols=elem(doc,'div','','iad-linkedin-grid');
  const contatos=(Array.isArray(snapshot?.contatos)?snapshot.contatos:[]).filter(x=>x&&x.nome).slice(0,1500);
  const empresas=new Map((Array.isArray(snapshot?.contas)?snapshot.contas:[]).map(x=>[String(x.id),String(x.nome||'')]));
  const pickerBox=elem(doc,'label','','iad-linkedin-field');
  pickerBox.append(elem(doc,'span','Lead já cadastrado (opcional)','iad-linkedin-label'));
  const picker=elem(doc,'select');picker.append(selectOption(doc,'','Selecionar manualmente'));
  contatos.sort((a,b)=>String(a.nome).localeCompare(String(b.nome),'pt-BR')).forEach((c,i)=>{
    picker.append(selectOption(doc,String(i),String(c.nome).slice(0,80)+' — '+(empresas.get(String(c.contaId))||'sem empresa')));
  });
  pickerBox.append(picker);cols.append(pickerBox);
  const lead=inputField(doc,cols,'Nome do lead','text',{max:120,required:true});
  const cargo=inputField(doc,cols,'Cargo','text',{max:140});
  const empresa=inputField(doc,cols,'Empresa','text',{max:160});
  const perfil=inputField(doc,cols,'Endereço do perfil do lead','url',{max:500,placeholder:'https://www.linkedin.com/in/...'});
  const postUrl=inputField(doc,cols,'URL da publicação','url',{max:600,required:true,placeholder:'https://www.linkedin.com/posts/...'});
  form.append(cols);
  const resumoPerfil=inputField(doc,form,'Resumo público do perfil do lead','textarea',{max:1200,rows:3,placeholder:'Experiência, área de atuação e prioridades expressas publicamente'});
  const post=inputField(doc,form,'Texto da publicação','textarea',{max:6000,rows:5,required:true,placeholder:'Cole aqui o post para análise: o CRM não o extrai automaticamente'});
  const comentarioLead=inputField(doc,form,'Comentário do lead (opcional)','textarea',{max:2000,rows:3,placeholder:'Inclua apenas se o lead comentou a publicação'});
  const solucao=inputField(doc,form,'Nossa proposta de valor / conexão com o assunto','textarea',{max:1200,rows:3,placeholder:'Qual contribuição real podemos oferecer a este segmento?'});
  const estiloLabel=elem(doc,'label','','iad-linkedin-field');
  estiloLabel.append(elem(doc,'span','Abordagem','iad-linkedin-label'));
  const estilo=elem(doc,'select');
  [['consultivo','Consultiva'],['tecnico','Técnica'],['objetivo','Objetiva']].forEach(x=>estilo.append(selectOption(doc,x[0],x[1])));
  estiloLabel.append(estilo);form.append(estiloLabel);
  function selectCsvRow(item,scroll=true) {
    if(!valid())return;
    activeRow=item;requestVersion++;
    picker.value='';
    lead.value=item.lead||'';cargo.value=item.cargo||'';
    empresa.value=item.empresa||'';perfil.value=item.perfil||'';
    resumoPerfil.value=item.resumoPerfil||'';postUrl.value=linkedinUrl(item.postUrl,'post')||'';
    post.value=item.post||'';comentarioLead.value=item.comentarioLead||'';
    textArea.value=item.rascunho||'';analise.textContent=item.fundamento||'';
    bCopiar.disabled=!textArea.value;textArea.disabled=!textArea.value;
    confirmado.checked=item.estado==='confirmado';registro.textContent='';
    status.textContent='Abra o perfil e procure uma publicação. Se não houver, use Sem post → próximo lead.';
    renderCsv();
    if(scroll)form.scrollIntoView({behavior:'smooth',block:'start'});
  }
  picker.addEventListener('change',()=>{
    const c=contatos[Number(picker.value)];
    if(!c||picker.value==='')return;
    activeRow=null;requestVersion++;renderCsv();
    lead.value=String(c.nome||'').slice(0,120);cargo.value=String(c.cargo||'').slice(0,140);
    empresa.value=(empresas.get(String(c.contaId))||'').slice(0,160);
    perfil.value=linkedinUrl(c.linkedin,'profile')||'';
  });

  const status=elem(doc,'p','Pronto para receber os dados do post.','small muted');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const generate=action(doc,'Analisar post e criar comentário com IA',()=>{});
  const profileOpen=action(doc,'Abrir perfil do lead para pesquisa',()=>{
    openProfileFor(activeRow,perfil.value);
  },true);
  const formActions=elem(doc,'div','','iad-linkedin-buttons');
  formActions.append(profileOpen,generate);form.append(formActions,status);
  const resultado=elem(doc,'section','','card');
  const textArea=elem(doc,'textarea','','iad-linkedin-result');
  textArea.rows=6;textArea.maxLength=1300;textArea.placeholder='A sugestão aparecerá aqui e poderá ser editada.';
  const analise=elem(doc,'p','','small muted');
  const bCopiar=action(doc,'Copiar comentário',async()=>{
    if(!valid()||!textArea.value.trim())return;
    try{
      await doc.defaultView.navigator.clipboard.writeText(textArea.value);
      if(valid())status.textContent='Comentário copiado. Ainda não foi publicado.';
    }catch(_){textArea.focus();textArea.select();status.textContent='Selecione e copie o comentário manualmente.';}
  },true);
  const bAbrir=action(doc,'Abrir post para curtir e comentar',()=>{
    const link=linkedinUrl(postUrl.value,'post');
    if(!link){status.textContent='URL de publicação inválida.';return;}
    doc.defaultView.open(link,'_blank','noopener,noreferrer');
    status.textContent='Publicação aberta. Curta o comentário do lead e publique o texto aprovado diretamente no LinkedIn.';
  },true);
  const caixaConfirmacao=elem(doc,'label','','iad-linkedin-confirm');
  const confirmado=elem(doc,'input');confirmado.type='checkbox';
  caixaConfirmacao.append(confirmado,elem(doc,'span','Confirmei manualmente a curtida e a publicação no LinkedIn.'));
  const registro=elem(doc,'p','','small muted');
  confirmado.addEventListener('change',()=>{
    registro.textContent=confirmado.checked?'Confirmação local desta sessão. Não foi feita verificação automática no LinkedIn nem gravação na carteira.':'';
    if(activeRow&&valid()&&confirmado.checked){
      try{setCommentConfirmed(activeRow,textArea.value);activeRow.rascunho=textArea.value;renderCsv();registro.textContent='Comentário confirmado manualmente. Use Próximo perfil para continuar.';}
      catch(e){confirmado.checked=false;registro.textContent=e.message;}
    }else if(activeRow&&!confirmado.checked&&activeRow.estado==='confirmado'){
      activeRow.estado='rascunho';renderCsv();
    }
  });
  resultado.append(elem(doc,'h2','4. Revisar e executar no LinkedIn'),
    elem(doc,'p','A IA sugere um comentário sobre água e uma conversa profissional. Revise o conteúdo antes de publicar.','small muted'),
    analise,textArea,elem(doc,'div','','iad-linkedin-buttons'),caixaConfirmacao,registro);
  const actions=resultado.querySelector('.iad-linkedin-buttons');actions.append(bCopiar,bAbrir);
  bCopiar.disabled=true;textArea.disabled=true;
  generate.onclick=async()=>{
    if(!valid())return;
    if(campaignPaused){status.textContent='Campanha pausada. Retome antes de analisar outro post.';return;}
    if(activeRow&&TERMINAIS.includes(activeRow.estado)){status.textContent='Este lead já foi encerrado; não substituirei o comentário registrado.';return;}
    let c;
    try{c=prepareLinkedInCampaign({lead:lead.value,cargo:cargo.value,empresa:empresa.value,perfil:perfil.value,
      postUrl:postUrl.value,resumoPerfil:resumoPerfil.value,post:post.value,comentarioLead:comentarioLead.value,
      solucao:solucao.value,estilo:estilo.value});}
    catch(e){status.textContent=e.message;return;}
    if(!nuvem||typeof nuvem.chamarFuncao!=='function'){status.textContent='Assistente indisponível nesta sessão.';return;}
    const currentVersion=++requestVersion;
    generate.disabled=true;textArea.disabled=true;bCopiar.disabled=true;
    status.textContent='Enviando o contexto à IA. Nenhuma ação será executada no LinkedIn.';
    confirmado.checked=false;registro.textContent='';
    try{
      const res=await nuvem.chamarFuncao('assistente',{
        tipo:'linkedin_comment_draft',texto:campaignText(c),contexto:{
          clienteNome:c.lead,estilo:c.estilo
        }
      });
      if(!valid()||currentVersion!==requestVersion)return;
      if(res?.erro)throw new Error(res.erro);
      const campos=res?.campos||{};
      const comentario=String(campos.comentario||'').trim();
      if(!comentario)throw new Error('A IA não devolveu um comentário válido.');
      textArea.value=comentario;analise.textContent=String(campos.fundamento||'');
      textArea.disabled=false;bCopiar.disabled=false;
      if(activeRow){activeRow.estado='rascunho';activeRow.rascunho=comentario;activeRow.fundamento=analise.textContent;renderCsv();}
      status.textContent='Rascunho pronto para revisão. Nenhuma curtida nem comentário foi publicado.';
    }catch(e){
      if(!valid()||currentVersion!==requestVersion)return;
      textArea.value='';analise.textContent='';
      status.textContent='Não foi possível gerar o comentário: '+String(e?.message||'erro de IA').slice(0,220);
    }finally{if(valid()){generate.disabled=false;}}
  };
  const fila=elem(doc,'section','','card');
  const filaResumo=elem(doc,'p','','small muted');
  filaResumo.setAttribute('role','status');filaResumo.setAttribute('aria-live','polite');
  const filaMsg=elem(doc,'p','Primeiro perfil será selecionado ao importar o CSV.','small muted');
  filaMsg.setAttribute('role','status');
  const btnReviewed=action(doc,'Confirmei a abertura do perfil',()=>{
    if(campaignPaused||!activeRow)return;
    const gate=canReviewProfile(campaignRows,activeRow);
    if(!gate.ok){filaMsg.textContent=gate.reason+(gate.nextAt?' Disponível após '+new Date(gate.nextAt).toLocaleTimeString('pt-BR')+'.':'');return;}
    try{
      setProfileOpened(activeRow);
      filaMsg.textContent='Acesso ao perfil confirmado nesta campanha. Procure uma publicação ou marque Sem post.';
      renderCsv();
    }catch(e){filaMsg.textContent=e.message;}
  },true);
  const btnNext=action(doc,'Próximo perfil',()=>{
    if(campaignPaused){filaMsg.textContent='Campanha pausada.';return;}
    if(activeRow&&!TERMINAIS.includes(activeRow.estado||'pendente')){
      filaMsg.textContent='Conclua este lead ou use Sem post antes de avançar; assim a fila não perde pendências.';
      return;
    }
    const next=nextPending(campaignRows,activeRow);
    if(next)selectCsvRow(next,false);
    else filaMsg.textContent='Fim da fila ou todos os próximos perfis já foram processados.';
  },true);
  const btnSkip=action(doc,'Sem post → próximo lead',()=>{
    if(campaignPaused){filaMsg.textContent='Campanha pausada.';return;}
    if(!activeRow){filaMsg.textContent='Selecione um perfil da lista.';return;}
    try{
      const nome=activeRow.lead;
      const next=skipWithoutPost(campaignRows,activeRow);
      if(next)selectCsvRow(next,false);
      else{activeRow=null;requestVersion++;renderCsv();}
      filaMsg.textContent=nome+' marcado Sem post. '+(next?'Próximo lead selecionado.':'Fim da fila.');
      refreshQueue();
    }catch(e){filaMsg.textContent=e.message;}
  },true);
  const btnLocated=action(doc,'Encontrei um post',()=>{
    if(campaignPaused||!activeRow)return;
    if(TERMINAIS.includes(activeRow.estado)){filaMsg.textContent='Lead encerrado. Revise o resultado antes de editar.';return;}
    const u=linkedinUrl(postUrl.value,'post');
    if(!u){filaMsg.textContent='Informe o endereço válido da publicação primeiro.';return;}
    activeRow.postUrl=u;activeRow.post=post.value;
    activeRow.estado='post_localizado';
    filaMsg.textContent='Post registrado. Abra a publicação para curtir e confirme a curtida após executar.';
    renderCsv();
  },true);
  const btnLike=action(doc,'Confirmei curtida',()=>{
    if(campaignPaused||!activeRow)return;
    if(TERMINAIS.includes(activeRow.estado)){filaMsg.textContent='Lead encerrado.';return;}
    activeRow.postUrl=linkedinUrl(postUrl.value,'post');
    try{
      setLikeConfirmed(activeRow);
      filaMsg.textContent='Curtida registrada conforme sua confirmação manual. Agora gere o comentário com IA.';
      renderCsv();
    }catch(e){filaMsg.textContent=e.message;}
  },true);
  const btnPause=action(doc,'Pausar campanha',()=>{
    campaignPaused=!campaignPaused;
    btnPause.textContent=campaignPaused?'Retomar campanha':'Pausar campanha';
    filaMsg.textContent=campaignPaused?'Campanha pausada; fila sem avanço.':'Campanha retomada.';
    refreshQueue();
  },true);
  function refreshQueue(){
    const c=campaignSummary(campaignRows),w=reviewWindow(campaignRows);
    filaResumo.textContent='Meta interna de revisão: '+w.used+'/'+w.limit+' perfis nas últimas 24h (somente desta lista e desta sessão) · Total: '+c.total+' | Pendentes: '+c.pendentes+' | Sem post: '+c.semPost+
      ' | Curtidas confirmadas: '+c.curtidas+' | Comentários confirmados: '+c.confirmados+
      (activeRow?' | Atual: '+activeRow.lead:'');
    for(const b of [btnNext,btnSkip,btnLocated,btnLike,btnReviewed])b.disabled=campaignPaused||!campaignRows.length;
    btnSkip.disabled ||= !activeRow;
    btnLocated.disabled ||= !activeRow;
    btnLike.disabled ||= !activeRow;
    btnReviewed.disabled ||= !activeRow;
  }
  const filaBotoes=elem(doc,'div','','iad-linkedin-buttons');
  filaBotoes.append(btnReviewed,btnLocated,btnLike,btnSkip,btnNext,btnPause);
  fila.append(elem(doc,'h2','3. Executar fila de perfis'),filaResumo,filaBotoes,filaMsg,
    elem(doc,'p','A revisão tem intervalo interno de 60 segundos e meta de até 20 perfis por 24 horas, calculados somente nesta lista aberta (não persistem após recarregar). Não são limites do LinkedIn. Ações externas são manuais nesta versão. Não existe intervalo que garanta evitar bloqueio. Diante de limite, CAPTCHA ou restrição do LinkedIn, pause a campanha. A automação futura exige acesso oficial autorizado e bloqueios de quota.','small muted'));
  refreshQueue();
  root.replaceChildren(elem(doc,'h2','LinkedIN Leads — Campanha 01'),notices,acesso,arquivoBox,fila,form,resultado);
}
