/* LinkedIN Leads Console: interface enxuta, fila local persistente.
 * Não inspeciona DOM do LinkedIn nem executa curtidas/comentários externos.
 * Na versão desktop, links abertos são encaminhados ao WebContentsView integrado. */
import {importLinkedInCsvStream,CSV_MAX_BYTES} from './linkedin-csv-stream.mjs';
import {openLinkedInQueue,metaOf,saveMeta,addLeadBatch,leadAt,nextPendingLead,putLead,deleteCampaign,pageOf} from './linkedin-queue-db.mjs';
import {linkedinUrl,prepareLinkedInCampaign,campaignText} from './linkedin-comment-core.mjs';

const STATUS={
  pendente:'Aguardando',perfil_aberto:'Perfil revisado',post_localizado:'Publicação identificada',
  curtido:'Curtida confirmada pelo operador',rascunho:'Comentário preparado',confirmado:'Comentário confirmado pelo operador',
  sem_post:'Sem publicação',descartado:'Ignorado',erro:'Erro de execução'
};
const TERMINAL=new Set(['sem_post','descartado','confirmado']);
const el=(d,t,text='',cls='')=>{const e=d.createElement(t);e.textContent=text;if(cls)e.className=cls;return e;};
const button=(d,text,fn,alt=false)=>{
  const e=el(d,'button',text,'btn'+(alt?' alt':''));
  e.type='button';e.addEventListener('click',fn);return e;
};
const scopeEqual=(scope,token,getScopeToken,root)=>root.isConnected&&getScopeToken()===token;
const limit=(s,n)=>String(s||'').trim().slice(0,n);
function campaignId(){
  return 'import-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
}
export function mountLinkedInLeads({root,scope,getScopeToken,nuvem}={}){
  if(!root||!root.ownerDocument||!scope||typeof getScopeToken!=='function')
    throw new Error('Sessão autorizada de Gestor/Admin exigida.');
  const d=root.ownerDocument,token=scope.token;
  const valid=()=>scopeEqual(scope,token,getScopeToken,root);
  const ui=el(d,'div','','iad-linkedin-console');
  const title=el(d,'h2','LinkedIN Leads — Campanhas');
  const intro=el(d,'p','Importe seu CSV e trabalhe a fila de contatos, com comentários personalizados por IA. A navegação integrada fica disponível somente na versão desktop especializada.','small muted');
  const account=el(d,'section','','card');
  account.append(el(d,'h3','1 · LinkedIn'));
  const login=button(d,'Abrir LinkedIn',()=>{
    d.defaultView.open('https://www.linkedin.com/login','_blank','noopener,noreferrer');
  },true);
  const accInfo=el(d,'p','O login acontece diretamente no LinkedIn; nenhuma senha é fornecida ao CRM. No aplicativo especializado, o LinkedIn aparece na mesma janela.','small muted');
  account.append(login,accInfo);

  const imports=el(d,'section','','card');
  imports.append(el(d,'h3','2 · Importar perfis (até 100 MB)'));
  const help=el(d,'p','CSV com uma coluna LinkedIn ou profile_url. Nome, cargo e empresa são opcionais. A lista fica neste navegador, separada dos dados do CRM.','small muted');
  const file=el(d,'input');file.type='file';file.accept='.csv,text/csv';
  file.setAttribute('aria-label','Importar CSV de perfis do LinkedIn');
  const progress=el(d,'progress');progress.max=100;progress.value=0;progress.hidden=true;progress.style.width='100%';
  const importStatus=el(d,'p','Selecione sua planilha para criar uma campanha.','small muted');
  importStatus.setAttribute('role','status');importStatus.setAttribute('aria-live','polite');
  const cancel=button(d,'Cancelar importação',()=>{if(abort)abort.abort();},true);cancel.hidden=true;
  imports.append(help,file,progress,importStatus,cancel);

  const queue=el(d,'section','','card');
  queue.append(el(d,'h3','3 · Fila de campanha'));
  const counts=el(d,'p','Nenhuma campanha carregada.','small muted');counts.setAttribute('role','status');
  const message=el(d,'p','Aguardando importação.','small muted');
  message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const leadName=el(d,'h3','Nenhum perfil selecionado');
  const details=el(d,'p','','small muted');
  const actions=el(d,'div','','iad-linkedin-buttons');
  const start=button(d,'Preparar próximo perfil',()=>void nextLead(),false);
  const openProfile=button(d,'Abrir perfil',()=>openUrl(current?.perfil,'profile'),true);
  const skip=button(d,'Sem post → próximo lead',()=>void finish('sem_post'),true);
  const interacted=button(d,'Já interagido → próximo',()=>void finish('descartado'),true);
  const pause=button(d,'Pausar campanha',()=>void togglePause(),true);
  actions.append(start,openProfile,skip,interacted,pause);
  const list=el(d,'div','','iad-linkedin-import-list');
  queue.append(counts,leadName,details,actions,message,list);
  
  const postPanel=el(d,'details','','card');
  postPanel.append(el(d,'summary','Publicação e comentário (revisão)'));
  const postHelp=el(d,'p','O navegador integrado não extrai publicações automaticamente nesta versão. Informe o link e o texto do post, ou utilize os dados já presentes no CSV.','small muted');
  const postLabel=el(d,'label','','iad-linkedin-field');
  postLabel.append(el(d,'span','URL do post','iad-linkedin-label'));
  const postUrl=el(d,'input');postUrl.type='url';postUrl.placeholder='https://www.linkedin.com/posts/...';postUrl.maxLength=600;
  postLabel.append(postUrl);
  const postTextLabel=el(d,'label','','iad-linkedin-field');postTextLabel.append(el(d,'span','Texto da publicação','iad-linkedin-label'));
  const postText=el(d,'textarea');postText.rows=5;postText.maxLength=6000;postText.placeholder='Cole o texto do post, quando não estiver no CSV';
  postTextLabel.append(postText);
  const analyze=button(d,'Analisar post e gerar comentário',()=>void generate());
  const openPost=button(d,'Abrir publicação',()=>openUrl(postUrl.value,'post'),true);
  const liked=button(d,'Confirmei curtida',()=>void confirmLike(),true);
  const draft=el(d,'textarea','','iad-linkedin-result');draft.rows=5;draft.maxLength=1300;
  draft.placeholder='Comentário sugerido sobre água e efluentes';draft.setAttribute('aria-label','Comentário sugerido');
  const insight=el(d,'p','','small muted');
  const copy=button(d,'Copiar comentário',()=>void copyText(),true);
  const confirmed=button(d,'Confirmei publicação → próximo',()=>void finish('confirmado'),true);
  const interactions=el(d,'div','','iad-linkedin-buttons');interactions.append(openPost,liked,analyze,copy,confirmed);
  postPanel.append(postHelp,postLabel,postTextLabel,interactions,insight,draft);

  const warning=el(d,'p','Esta versão organiza a campanha e prepara comentários; não publica nem curte automaticamente. Limites de revisão da ferramenta não são limites oficiais do LinkedIn.','small muted');
  ui.append(title,intro,account,imports,queue,postPanel,warning);
  root.replaceChildren(ui);
  let db=null,meta=null,current=null,busy=false,abort=null,request=0,uiGeneration=0;
  const scopeKey=JSON.stringify([scope.userId,scope.tenantId,scope.role,scope.tenantFilter,scope.ownerFilter]);
  const show=(messageText,err=false)=>{
    if(!valid())return;
    message.textContent=messageText;
    message.style.color=err?'#b42318':'';
  };
  function disabled(){
    const importBusy=!!abort,loading=busy,paused=!!meta?.paused;
    file.disabled=importBusy||loading;
    start.disabled=!meta?.campaign||importBusy||loading||paused;
    openProfile.disabled=!current||importBusy||loading||paused;
    skip.disabled=!current||importBusy||loading||paused;
    interacted.disabled=!current||importBusy||loading||paused;
    pause.disabled=!meta?.campaign||importBusy||loading;
    openPost.disabled=!current||importBusy||loading||paused;
    liked.disabled=!current||importBusy||loading||paused;
    analyze.disabled=!current||importBusy||loading||paused;
    copy.disabled=!draft.value.trim()||importBusy||loading;
    confirmed.disabled=!current||!draft.value.trim()||importBusy||loading||paused;
    if(meta)pause.textContent=meta.paused?'Retomar campanha':'Pausar campanha';
  }
  function showCurrent(){
    if(!valid())return;
    leadName.textContent=current?current.lead||'Perfil LinkedIn':'Nenhum perfil selecionado';
    details.textContent=current?
      [current.empresa,current.cargo,STATUS[current.estado]||current.estado].filter(Boolean).join(' · '):
      'Selecione um perfil da campanha para continuar.';
    postUrl.value=current?.postUrl||'';
    postText.value=current?.post||'';
    draft.value=current?.rascunho||'';
    insight.textContent=current?.fundamento||'';
    if(meta)counts.textContent='Perfis válidos: '+meta.valid+' · Sem post: '+(meta.semPost||0)+
      ' · Já interagidos: '+(meta.descartados||0)+' · Curtidas confirmadas: '+(meta.curtidas||0)+
      ' · Comentários confirmados: '+(meta.confirmados||0)+
      (meta.paused?' · Pausada':'');
    disabled();
  }
  async function persist(){
    if(!db||!meta||!valid())return;
    meta.activeLine=current?.linha||0;meta.lastUpdatedAt=new Date().toISOString();
    await saveMeta(db,scope,meta);
  }
  async function select(lead){
    current=lead||null;uiGeneration++;showCurrent();
    if(current)show('Perfil selecionado. Abra o LinkedIn na vista integrada ou no navegador e confira a publicação.');
    else show('Fim da fila: nenhum perfil pendente após o atual.');
    await persist();
  }
  async function nextLead(){
    if(!valid()||!meta?.campaign||busy||meta.paused)return;
    busy=true;disabled();
    try{
      const next=await nextPendingLead(db,scope,meta.campaign,current?.linha||0);
      if(!valid())return;
      await select(next);
    }catch(e){show('Erro ao consultar fila: '+e.message,true);}
    finally{busy=false;disabled();}
  }
  async function finish(status){
    if(!valid()||!current||!meta?.campaign||busy||meta.paused)return;
    if(status==='confirmado'&&(!current.curtidaConfirmada||draft.value.trim().length<20)){
      show('Confirme a curtida e revise um comentário de pelo menos 20 caracteres.',true);return;
    }
    busy=true;disabled();
    try{
      if(TERMINAL.has(current.estado))throw new Error('Este lead já foi encerrado.');
      if(status==='confirmado'){
        current.rascunho=limit(draft.value,1300);
        current.comentarioPublicado=current.rascunho;
        current.comentarioConfirmadoEm=new Date().toISOString();
        meta.confirmados=(meta.confirmados||0)+1;
      }else if(status==='sem_post'){meta.semPost=(meta.semPost||0)+1;}
      else {meta.descartados=(meta.descartados||0)+1;}
      current.estado=status;
      const old=current;
      await putLead(db,old);
      const next=await nextPendingLead(db,scope,meta.campaign,old.linha);
      if(!valid())return;
      current=next||null;uiGeneration++;
      await persist();
      showCurrent();
      show(next?'Registrado. Próximo perfil carregado.':'Fim da fila; progresso registrado localmente.');
    }catch(e){show('Não foi possível registrar o resultado: '+e.message,true);}
    finally{busy=false;disabled();}
  }
  async function confirmLike(){
    if(!valid()||!current||busy||meta?.paused)return;
    const link=linkedinUrl(postUrl.value,'post');
    if(!link)return show('Informe a URL de publicação válida antes da confirmação.',true);
    try{
      current.postUrl=link;current.post=limit(postText.value,6000);
      if(!current.curtidaConfirmada){current.curtidaConfirmada=true;meta.curtidas=(meta.curtidas||0)+1;}
      current.curtidaConfirmadaEm=current.curtidaConfirmadaEm||new Date().toISOString();
      if(current.estado!=='rascunho')current.estado='curtido';
      await putLead(db,current);await persist();showCurrent();
      show('Curtida registrada conforme sua confirmação; o CRM não verificou a ação no LinkedIn.');
    }catch(e){show('Falha ao salvar curtida: '+e.message,true);}
  }
  async function generate(){
    if(!valid()||!current||busy||meta?.paused)return;
    let prepared;
    try{
      prepared=prepareLinkedInCampaign({...current,postUrl:postUrl.value,post:postText.value,
        solucao:'Tecnologias e inteligência para monitoramento online, qualidade da água, efluentes e eficiência operacional.'});
    }catch(e){return show(e.message,true);}
    if(typeof nuvem?.chamarFuncao!=='function')return show('Assistente indisponível nesta sessão.',true);
    busy=true;const seq=++request,selected=uiGeneration;disabled();
    insight.textContent='Analisando publicação e contexto comercial...';
    try{
      const response=await nuvem.chamarFuncao('assistente',{
        tipo:'linkedin_comment_draft',texto:campaignText(prepared),
        contexto:{clienteNome:prepared.lead,estilo:'consultivo'}
      });
      if(!valid()||seq!==request||uiGeneration!==selected||meta?.paused)return;
      if(response?.erro)throw new Error(response.erro);
      const text=limit(response?.campos?.comentario,1300);
      if(text.length<30)throw new Error('A IA não retornou comentário válido.');
      current.postUrl=prepared.postUrl;current.post=prepared.post;
      current.rascunho=text;current.fundamento=limit(response?.campos?.fundamento,600);
      current.estado='rascunho';
      await putLead(db,current);
      if(!valid()||uiGeneration!==selected)return;
      showCurrent();postPanel.open=true;
      show('Sugestão gerada para aprovação. Nenhuma ação foi publicada automaticamente.');
    }catch(e){show('Falha ao gerar comentário: '+String(e.message||e).slice(0,180),true);}
    finally{busy=false;disabled();}
  }
  async function copyText(){
    const text=draft.value.trim();if(!text)return;
    try{await d.defaultView.navigator.clipboard.writeText(text);show('Texto copiado; publique somente após revisão.');}
    catch{draft.focus();draft.select();show('Copie o texto selecionado manualmente.');}
  }
  function openUrl(raw,kind){
    if(!valid()||meta?.paused)return;
    const url=linkedinUrl(raw,kind);
    if(!url)return show('URL LinkedIn ausente ou inválida.',true);
    d.defaultView.open(url,'_blank','noopener,noreferrer');
    show('Abertura solicitada. No aplicativo especializado, o LinkedIn aparece na vista integrada.');
  }
  async function togglePause(){
    if(!meta||busy)return;
    meta.paused=!meta.paused;request++;
    try{await persist();showCurrent();show(meta.paused?'Campanha pausada.':'Campanha retomada.');}
    catch(e){show('Falha ao gravar pausa: '+e.message,true);}
  }
  async function renderPage(){
    if(!db||!meta?.campaign||!valid())return;
    const rows=await pageOf(db,scope,meta.campaign,0,10);
    if(!valid())return;
    list.replaceChildren();
    const label=el(d,'p','Amostra dos primeiros 10 perfis importados:','small muted');
    list.append(label);
    rows.forEach(row=>{
      const div=el(d,'div','','iad-linkedin-import-row');
      const name=el(d,'strong',row.lead||'Lead');
      const status=el(d,'span',STATUS[row.estado]||'Aguardando','small muted');
      const choose=button(d,'Selecionar',()=>void selectByLine(row.linha),true);
      div.append(name,status,choose);list.append(div);
    });
  }
  async function selectByLine(line){
    if(!db||!meta?.campaign||busy||meta.paused)return;
    try{const row=await leadAt(db,scope,meta.campaign,line);if(valid())await select(row);}
    catch(e){show('Falha ao abrir lead: '+e.message,true);}
  }
  file.addEventListener('change',async()=>{
    const selected=file.files?.[0];
    if(!selected||!valid()||abort)return;
    if(selected.size>CSV_MAX_BYTES){importStatus.textContent='Arquivo ultrapassa 100 MiB.';return;}
    abort=new AbortController();const ctrl=abort,oldMeta=meta,temporary=campaignId();
    file.disabled=true;cancel.hidden=false;progress.hidden=false;progress.value=0;disabled();
    importStatus.textContent='Preparando importação por lotes...';
    try{
      if(!db)db=await openLinkedInQueue();
      const result=await importLinkedInCsvStream(selected,{
        signal:ctrl.signal,
        onBatch:async batch=>addLeadBatch(db,scope,temporary,batch),
        onProgress:info=>{
          if(!valid())return;
          progress.value=info.percent;
          importStatus.textContent='Importando '+info.percent+'% · '+info.valid+
            ' perfis válidos · '+info.duplicates+' duplicados · '+info.invalid+' inválidos.';
        }
      });
      if(!valid()||ctrl.signal.aborted)throw new Error('Importação interrompida pela mudança de sessão.');
      meta={campaign:temporary,valid:result.summary.valid,semPost:0,descartados:0,
        curtidas:0,confirmados:0,paused:false,activeLine:0,createdAt:new Date().toISOString()};
      await persist();current=null;uiGeneration++;showCurrent();
      await renderPage();
      importStatus.textContent='Importação concluída: '+result.summary.valid+' válidos, '+
        result.summary.duplicates+' duplicados, '+result.summary.invalid+' inválidos.';
      show('Campanha pronta. Selecione Preparar próximo perfil.');
      if(oldMeta?.campaign&&oldMeta.campaign!==temporary)
        deleteCampaign(db,scope,oldMeta.campaign).catch(()=>{});
    }catch(e){
      if(db)await deleteCampaign(db,scope,temporary).catch(()=>{});
      meta=oldMeta;showCurrent();
      importStatus.textContent='Importação cancelada ou falhou: '+String(e.message||e).slice(0,200);
    }finally{if(abort===ctrl)abort=null;file.value='';cancel.hidden=true;progress.hidden=true;disabled();}
  });
  draft.addEventListener('input',()=>{if(current)current.rascunho=limit(draft.value,1300);disabled();});
  async function init(){
    try{
      db=await openLinkedInQueue();
      if(!valid()){db.close();return;}
      meta=await metaOf(db,scope);
      if(!valid()){db.close();return;}
      if(meta?.campaign){
        current=meta.activeLine?await leadAt(db,scope,meta.campaign,meta.activeLine):null;
        if(!valid())return;
        if(!current)current=await nextPendingLead(db,scope,meta.campaign,0);
        showCurrent();await renderPage();
        importStatus.textContent='Campanha restaurada do armazenamento local deste navegador.';
        show('Fila retomada. Os dados não foram enviados ao CRM nem ao LinkedIn.');
      }else showCurrent();
    }catch(e){importStatus.textContent='Armazenamento local indisponível: '+e.message;showCurrent();}
  }
  disabled();void init();
}