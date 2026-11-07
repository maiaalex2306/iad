/* LinkedIN Leads — campanha assistida e revisada pelo operador.
   Nenhum login, senha, cookie, token ou comando do LinkedIn passa pelo CRM.
   Post e comentário são fornecidos conscientemente pelo usuário.
   Sem OAuth aprovado, copiar/abrir publicação NÃO é publicar ou curtir. */
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
  if (campaign.comentarioLead.length<8) throw new Error('Cole o comentário do lead para contextualizar a interação.');
  return campaign;
}

export function campaignText(c) {
  return [
    'POST DO LINKEDIN (conteúdo fornecido pelo usuário):',c.post,
    'COMENTÁRIO DO LEAD NO POST:',c.comentarioLead,
    'LEAD:',c.lead,
    'CARGO:',c.cargo||'não informado',
    'EMPRESA:',c.empresa||'não informada',
    'DADOS PÚBLICOS DO PERFIL INFORMADOS PELO USUÁRIO:',c.resumoPerfil||'não informado',
    'NOSSA SOLUÇÃO / POSICIONAMENTO:',c.solucao||'não informado',
    'ESTILO SOLICITADO:',c.estilo,
    'TAREFA: redigir um comentário público à publicação, considerando também o comentário feito pelo lead.'
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
  const notices=elem(doc,'p','Primeiro fluxo: curtir um comentário do lead e comentar o post com apoio da IA. Nesta fase, as interações externas exigem sua ação no LinkedIn.','small muted');
  const safe=elem(doc,'p','Sua senha é digitada somente em linkedin.com. O IaD CRM não solicita nem armazena senha, cookies ou tokens do LinkedIn.','small muted');
  const login=action(doc,'Abrir login oficial do LinkedIn',()=>globalThis.open('https://www.linkedin.com/login','_blank','noopener,noreferrer'),true);
  const acesso=elem(doc,'section','','card');
  acesso.append(elem(doc,'h2','1. Conta LinkedIn'),safe,login);

  const form=elem(doc,'form','','card');
  form.noValidate=true;
  form.append(elem(doc,'h2','2. Selecionar publicação e lead'));
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
  const comentarioLead=inputField(doc,form,'Comentário feito pelo lead','textarea',{max:2000,rows:3,required:true,placeholder:'Cole o comentário específico do lead que deseja curtir'});
  const solucao=inputField(doc,form,'Nossa proposta de valor / conexão com o assunto','textarea',{max:1200,rows:3,placeholder:'Qual contribuição real podemos oferecer a este segmento?'});
  const estiloLabel=elem(doc,'label','','iad-linkedin-field');
  estiloLabel.append(elem(doc,'span','Abordagem','iad-linkedin-label'));
  const estilo=elem(doc,'select');
  [['consultivo','Consultiva'],['tecnico','Técnica'],['objetivo','Objetiva']].forEach(x=>estilo.append(selectOption(doc,x[0],x[1])));
  estiloLabel.append(estilo);form.append(estiloLabel);
  picker.addEventListener('change',()=>{
    const c=contatos[Number(picker.value)];
    if(!c||picker.value==='')return;
    lead.value=String(c.nome||'').slice(0,120);cargo.value=String(c.cargo||'').slice(0,140);
    empresa.value=(empresas.get(String(c.contaId))||'').slice(0,160);
    perfil.value=linkedinUrl(c.linkedin,'profile')||'';
  });

  const status=elem(doc,'p','Pronto para receber os dados do post.','small muted');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const generate=action(doc,'Analisar post e criar comentário com IA',()=>{});
  form.append(generate,status);
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
  confirmado.addEventListener('change',()=>{registro.textContent=confirmado.checked?'Confirmação local desta sessão. Não foi feita verificação automática no LinkedIn nem gravação na carteira.':'';});
  resultado.append(elem(doc,'h2','3. Revisar e executar no LinkedIn'),
    elem(doc,'p','A IA só sugere. Revise pertinência, informações e tom antes de qualquer interação.','small muted'),
    analise,textArea,elem(doc,'div','','iad-linkedin-buttons'),caixaConfirmacao,registro);
  const actions=resultado.querySelector('.iad-linkedin-buttons');actions.append(bCopiar,bAbrir);
  bCopiar.disabled=true;textArea.disabled=true;
  generate.onclick=async()=>{
    if(!valid())return;
    let c;
    try{c=prepareLinkedInCampaign({lead:lead.value,cargo:cargo.value,empresa:empresa.value,perfil:perfil.value,
      postUrl:postUrl.value,resumoPerfil:resumoPerfil.value,post:post.value,comentarioLead:comentarioLead.value,
      solucao:solucao.value,estilo:estilo.value});}
    catch(e){status.textContent=e.message;return;}
    if(!nuvem||typeof nuvem.chamarFuncao!=='function'){status.textContent='Assistente indisponível nesta sessão.';return;}
    generate.disabled=true;textArea.disabled=true;bCopiar.disabled=true;
    status.textContent='Enviando o contexto à IA. Nenhuma ação será executada no LinkedIn.';
    confirmado.checked=false;registro.textContent='';
    try{
      const res=await nuvem.chamarFuncao('assistente',{
        tipo:'linkedin_comment_draft',texto:campaignText(c),contexto:{
          clienteNome:c.lead,estilo:c.estilo
        }
      });
      if(!valid())return;
      if(res?.erro)throw new Error(res.erro);
      const campos=res?.campos||{};
      const comentario=String(campos.comentario||'').trim();
      if(!comentario)throw new Error('A IA não devolveu um comentário válido.');
      textArea.value=comentario;analise.textContent=String(campos.fundamento||'');
      textArea.disabled=false;bCopiar.disabled=false;
      status.textContent='Rascunho pronto para revisão. Nenhuma curtida nem comentário foi publicado.';
    }catch(e){
      if(!valid())return;
      textArea.value='';analise.textContent='';
      status.textContent='Não foi possível gerar o comentário: '+String(e?.message||'erro de IA').slice(0,220);
    }finally{if(valid())generate.disabled=false;}
  };
  root.replaceChildren(elem(doc,'h2','LinkedIN Leads — Campanha 01'),notices,acesso,form,resultado);
}
