/* LinkedIN Leads — módulo isolado de campanhas assistidas.
   Nunca recebe senha/cookie do LinkedIn, nem publica ou curte sem API autorizada.
   Estado temporário, por usuário/tenant; o Store e o CAS permanecem intocados. */
const LIMITE_ARQUIVO=2*1024*1024, LIMITE_LEADS=500;
let escopoAtivo='',estado=null,sequencia=0;
const novoEstado=()=>({campanhas:[],atual:'',aviso:''});
const str=(s,n=1200)=>String(s==null?'':s).trim().slice(0,n);
const normalizar=(s)=>str(s,200).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function urlLinkedIn(valor,tipo='qualquer'){
  try{
    const u=new URL(str(valor,600));
    if(u.protocol!=='https:'||!/(^|\.)linkedin\.com$/i.test(u.hostname))return '';
    if(u.username||u.password)return '';
    if(tipo==='perfil'&&!/^\/in\/[A-Za-z0-9_%-]+\/?$/i.test(u.pathname))return '';
    if(tipo==='publicacao'&&!/(\/posts\/|\/feed\/update\/|\/pulse\/|\/activity-|\/comments\/)/i.test(u.pathname))return '';
    u.hash='';
    return u.href;
  }catch{return '';}
}
export function parseCSV(texto){
  const textoLimpo=String(texto||'').replace(/^\uFEFF/,'');
  const primeira=textoLimpo.split(/\r?\n/,1)[0]||'';
  const separador=(primeira.match(/;/g)||[]).length>(primeira.match(/,/g)||[]).length?';':',';
  let campo='',linha=[],linhas=[],aspas=false;
  for(let i=0;i<textoLimpo.length;i++){
    const c=textoLimpo[i];
    if(c==='"'){
      if(aspas&&textoLimpo[i+1]==='"'){campo+='"';i++;}
      else aspas=!aspas;
    }else if(!aspas&&c===separador){linha.push(campo);campo='';}
    else if(!aspas&&(c==='\n'||c==='\r')){
      if(c==='\r'&&textoLimpo[i+1]==='\n')i++;
      linha.push(campo);if(linha.some(x=>x.trim()))linhas.push(linha);linha=[];campo='';
    }else campo+=c;
  }
  if(aspas)throw Error('CSV com aspas sem fechamento.');
  linha.push(campo);if(linha.some(x=>x.trim()))linhas.push(linha);
  return linhas;
}
export function extrairLeadsArquivo(texto){
  const raw=str(texto,LIMITE_ARQUIVO),rows=parseCSV(raw);
  if(!rows.length)return [];
  const cab=rows[0].map(normalizar);
  const campos={
    perfil:['linkedin','linkedin_url','profile_url','public_profile_url','url','perfil','link do perfil','linkedin profile url'],
    nome:['nome','name','full_name','full name','first name'],
    cargo:['cargo','position','job title','title','headline'],
    empresa:['empresa','company','company name','organization']
  };
  const indices={};
  for(const [campo,apelidos] of Object.entries(campos))indices[campo]=cab.findIndex(x=>apelidos.includes(x));
  const pareceCabecalho=Object.values(indices).some(i=>i>=0);
  if(!pareceCabecalho){
    return raw.split(/\r?\n/).slice(0,LIMITE_LEADS).map(l=>({perfil:urlLinkedIn(l.trim(),'perfil'),nome:'',cargo:'',empresa:''})).filter(x=>x.perfil);
  }
  if(indices.perfil<0)throw Error('Arquivo sem coluna de URL do perfil LinkedIn.');
  return rows.slice(1,LIMITE_LEADS+1).map(l=>({
    perfil:urlLinkedIn(l[indices.perfil]||'','perfil'),
    nome:indices.nome>=0?str(l[indices.nome],100):'',
    cargo:indices.cargo>=0?str(l[indices.cargo],120):'',
    empresa:indices.empresa>=0?str(l[indices.empresa],120):''
  })).filter(x=>x.perfil);
}
export function prepararMaterial(d){
  return [
    'AÇÃO SOLICITADA: '+(d.modo==='resposta'?'Responder ao comentário do lead em uma publicação':'Comentar a publicação'),
    'LEAD: '+str(d.nome,100),'CARGO: '+str(d.cargo,120),'EMPRESA: '+str(d.empresa,120),
    'PERFIL LINKEDIN: '+str(d.perfil,300),
    'PUBLICAÇÃO (conteúdo fornecido pelo usuário):\n'+str(d.post,8500),
    'COMENTÁRIO DO LEAD (se houver):\n'+str(d.comentarioLead,2200),
    'NOSSA SOLUÇÃO / CONTEXTO COMERCIAL (somente o que foi informado):\n'+str(d.contexto,1800)
  ].join('\n\n');
}
const campanhaAtual=()=>estado.campanhas.find(c=>c.id===estado.atual)||null;
function novaCampanha(nome){
  const c={id:'c'+(++sequencia),nome:str(nome,100)||'Campanha LinkedIN Leads',leads:[],selecionado:'',criado:new Date().toISOString()};
  estado.campanhas.push(c);estado.atual=c.id;return c;
}
function novoLead(d){
  return {id:'l'+(++sequencia),nome:str(d.nome,100),cargo:str(d.cargo,120),empresa:str(d.empresa,120),
    perfil:urlLinkedIn(d.perfil,'perfil'),postUrl:urlLinkedIn(d.postUrl,'publicacao'),
    commentUrl:urlLinkedIn(d.commentUrl),post:str(d.post,8500),comentarioLead:str(d.comentarioLead,2200),
    contexto:str(d.contexto,1800),modo:d.modo==='resposta'?'resposta':'publicacao',
    ai:null,rascunho:'',curtida:false,comentado:false};
}
function adicionar(c,d){
  if(!c)throw Error('Crie uma campanha antes de adicionar leads.');
  if(c.leads.length>=LIMITE_LEADS)throw Error('Limite de 500 leads por campanha nesta versão.');
  const lead=novoLead(d);
  if(!lead.perfil)throw Error('Informe um perfil válido https://www.linkedin.com/in/...');
  if(c.leads.some(x=>x.perfil===lead.perfil&&x.postUrl===lead.postUrl))throw Error('Este lead/publicação já está na campanha.');
  c.leads.push(lead);c.selecionado=lead.id;return lead;
}
function campoTexto(root,id){
  const e=root.querySelector('#'+id);return e?str(e.value,id==='lead-post'?8500:2200):'';
}
function lerFormulario(root){
  return {nome:campoTexto(root,'lead-nome'),cargo:campoTexto(root,'lead-cargo'),
    empresa:campoTexto(root,'lead-empresa'),perfil:campoTexto(root,'lead-perfil'),
    postUrl:campoTexto(root,'lead-post-url'),commentUrl:campoTexto(root,'lead-comment-url'),
    post:campoTexto(root,'lead-post'),comentarioLead:campoTexto(root,'lead-comment-text'),
    contexto:campoTexto(root,'lead-contexto'),modo:campoTexto(root,'lead-modo')};
}
function statusLead(l){return l.comentado?'Comentário confirmado':l.curtida?'Curtida confirmada':l.ai?'Rascunho gerado':'Pendente';}
export function mountLinkedInLeads({root,snapshot,scope,getScopeToken,nuvem}={}){
  if(!root||!root.ownerDocument||!scope||!snapshot||typeof getScopeToken!=='function')
    throw Error('Sessão e carteira autorizada necessárias.');
  const token=scope.token,identidade=[scope.userId,scope.tenantId,scope.tenantFilter,scope.ownerFilter].join('|');
  if(identidade!==escopoAtivo){escopoAtivo=identidade;estado=novoEstado();}
  const doc=root.ownerDocument;
  if(!doc.getElementById('iad-linkedin-styles')){
    const link=doc.createElement('link');link.id='iad-linkedin-styles';link.rel='stylesheet';
    link.href=new URL('assets/linkedin-leads.css',doc.baseURI).href;doc.head.appendChild(link);
  }
  const valido=()=>root.isConnected&&getScopeToken()===token;
  const e=(tag,txt='',cls='')=>{const n=doc.createElement(tag);n.textContent=txt;if(cls)n.className=cls;return n;};
  const aviso=(msg,erro=false)=>{estado.aviso=msg;const a=root.querySelector('#linkedin-aviso');if(a){a.textContent=msg;a.classList.toggle('erro',erro);}};
  const formularioVazio={nome:'',cargo:'',empresa:'',perfil:'',postUrl:'',commentUrl:'',post:'',comentarioLead:'',contexto:'',modo:'publicacao'};
  const contas=new Map((snapshot.contas||[]).map(c=>[String(c.id),c]));
  const crm=(snapshot.contatos||[]).filter(c=>urlLinkedIn(c.linkedin||'','perfil')).slice(0,500);
  let geracaoIA=0;
  function montar(){
    if(!valido())return;
    const camp=campanhaAtual(),lead=camp?.leads.find(x=>x.id===camp.selecionado)||null;
    root.innerHTML=String.raw`<div class="ll-head"><div><p class="ll-eyebrow">PROSPECÇÃO B2B</p><h2>LinkedIN Leads</h2><p>Campanhas, inteligência contextual e interações supervisionadas.</p></div><div class="ll-state">LinkedIn: sem integração autorizada<br><small>Login e senha nunca são coletados pelo CRM.</small></div></div>
    <div class="ll-layout"><section class="ll-panel"><h3>Campanhas</h3><div class="ll-row"><input id="ll-campaign-name" maxlength="100" placeholder="Nome da nova campanha" aria-label="Nome da campanha"><button class="btn" id="ll-create">Criar</button></div><label class="ll-label" for="ll-campaign-list">Selecionar campanha</label><select id="ll-campaign-list"></select><p class="ll-hint">Fluxo: fonte → selecionar lead → análise IA → curtir → comentar → registrar confirmação.</p><div class="ll-step">1 · Conexão com a rede: <b>não configurada</b></div><button class="btn alt" id="ll-login" type="button">Abrir login oficial LinkedIn</button><p class="ll-hint">Fazer login no site não concede acesso ao IaD CRM. Automação só após integração aprovada.</p></section>
    <section class="ll-panel"><h3>Fonte de leads</h3><p class="ll-hint">No Linked Helper existem LinkedIn, Sales Navigator, Recruiter, CSV, CRM e listas. Aqui, os caminhos operacionais são CRM, CSV/TXT e inclusão manual.</p><label class="ll-label" for="ll-crm-lead">Contato já cadastrado no IaD CRM</label><select id="ll-crm-lead"><option value="">Selecione um contato...</option></select><label class="ll-label" for="ll-upload">Importar perfis CSV / TXT</label><input id="ll-upload" type="file" accept=".csv,.txt,text/csv,text/plain"><p class="ll-hint">Máximo 2 MB, 500 leads. Nenhum perfil é buscado automaticamente no LinkedIn.</p><p class="ll-count" id="ll-count"></p></section></div>
    <section class="ll-panel"><h3>Workflow — Curtir e comentar publicações</h3><div class="ll-row"><label class="ll-label" for="ll-lead-list">Lead da campanha</label><select id="ll-lead-list"><option value="">Novo lead</option></select></div>
    <div class="ll-form"><label>Nome do lead<input id="lead-nome" maxlength="100"></label><label>Cargo<input id="lead-cargo" maxlength="120"></label><label>Empresa<input id="lead-empresa" maxlength="120"></label><label>URL do perfil LinkedIn<input id="lead-perfil" placeholder="https://www.linkedin.com/in/..."></label><label>URL da publicação<input id="lead-post-url" placeholder="https://www.linkedin.com/posts/..."></label><label>URL do comentário do lead (opcional)<input id="lead-comment-url" placeholder="https://www.linkedin.com/..."></label><label>Qual interação?<select id="lead-modo"><option value="publicacao">Curtir a publicação e comentar o post</option><option value="resposta">Curtir comentário do lead e responder ao comentário</option></select></label><label>Contexto da solução que queremos apresentar<textarea id="lead-contexto" rows="2" maxlength="1800" placeholder="Nossas capacidades reais, segmento e proposta de valor..."></textarea></label><label class="ll-full">Texto da publicação (obrigatório para análise)<textarea id="lead-post" rows="5" maxlength="8500" placeholder="Cole aqui o conteúdo do post..."></textarea></label><label class="ll-full">Texto do comentário do lead (quando houver)<textarea id="lead-comment-text" rows="3" maxlength="2200" placeholder="Cole aqui o comentário do lead..."></textarea></label></div>
    <div class="ll-row"><button class="btn alt" id="ll-save">Adicionar / atualizar lead</button><button class="btn" id="ll-generate">Analisar e gerar comentário com IA</button></div></section>
    <section class="ll-panel"><h3>Resultado da inteligência</h3><div class="ll-workflow"><span>1. Contexto</span><span>2. Análise IA</span><span>3. Curtida</span><span>4. Comentário</span><span>5. Registro</span></div><p id="ll-analysis" class="ll-hint">Selecione um lead, informe o conteúdo e clique em Analisar.</p><label class="ll-label" for="ll-draft">Comentário sugerido (editável)</label><textarea id="ll-draft" rows="6" maxlength="1200" placeholder="A IA criará uma proposta de comentário..."></textarea><div class="ll-row"><button class="btn alt" id="ll-open">Abrir publicação</button><button class="btn alt" id="ll-open-comment">Abrir comentário do lead</button><button class="btn alt" id="ll-copy">Copiar comentário</button></div><div class="ll-row"><button class="btn alt" id="ll-like">Confirmar curtida realizada manualmente</button><button class="btn alt" id="ll-commented">Confirmar comentário publicado manualmente</button></div><p class="ll-hint">Os botões registram somente a confirmação informada pelo usuário. Eles não executam ações no LinkedIn.</p><p id="linkedin-aviso" class="ll-alert" role="status" aria-live="polite"></p></section><section class="ll-panel"><h3>Execução da campanha</h3><div id="ll-results"></div></section>`;
    const q=id=>root.querySelector('#'+id);
    const campanhas=q('ll-campaign-list');
    campanhas.appendChild(e('option','Selecione...'));
    for(const c of estado.campanhas){const o=e('option',c.nome);o.value=c.id;o.selected=c.id===estado.atual;campanhas.appendChild(o);}
    const fonte=q('ll-crm-lead');crm.forEach((ct,i)=>{const conta=contas.get(String(ct.contaId))||{};const o=e('option',str(ct.nome,90)+' · '+str(conta.nome||ct.empresa,70));o.value=String(i);fonte.appendChild(o);});
    const select=q('ll-lead-list');
    for(const l of camp?.leads||[]){const o=e('option',(l.nome||l.perfil.split('/').filter(Boolean).pop())+' · '+statusLead(l));o.value=l.id;o.selected=l.id===camp.selecionado;select.appendChild(o);}
    q('ll-count').textContent=camp?camp.leads.length+' leads nesta campanha':'Crie uma campanha para incluir leads.';
    const d=lead||formularioVazio;
    const campos={ 'lead-nome':'nome','lead-cargo':'cargo','lead-empresa':'empresa','lead-perfil':'perfil',
      'lead-post-url':'postUrl','lead-comment-url':'commentUrl','lead-post':'post','lead-comment-text':'comentarioLead','lead-contexto':'contexto','lead-modo':'modo' };
    for(const [id,k] of Object.entries(campos))q(id).value=d[k]||'';
    if(lead){q('ll-analysis').textContent=lead.ai?'Tema: '+(lead.ai.resumo||'')+'\nGancho: '+(lead.ai.gancho||'')+(lead.ai.alerta?'\nVerificar: '+lead.ai.alerta:''):'Análise pendente para este lead.';q('ll-draft').value=lead.rascunho||'';}
    const dados=q('ll-results');dados.replaceChildren();
    if(!camp||!camp.leads.length)dados.appendChild(e('p','Nenhum lead incluído na campanha.','ll-hint'));
    else{
      const table=e('table','','ll-table'),thead=e('thead'),tr=e('tr');
      ['Lead','Perfil','Etapa','Revisão'].forEach(t=>tr.appendChild(e('th',t)));thead.appendChild(tr);table.appendChild(thead);
      const body=e('tbody');
      camp.leads.slice(0,200).forEach(l=>{
        const tr=e('tr');tr.appendChild(e('td',l.nome||'Sem nome'));
        const td=e('td'),a=e('a','Abrir perfil');a.href=l.perfil;a.target='_blank';a.rel='noopener noreferrer';td.appendChild(a);tr.appendChild(td);
        tr.appendChild(e('td',statusLead(l)));
        const action=e('td'),button=e('button','Selecionar','btn alt mini');button.type='button';button.onclick=()=>{camp.selecionado=l.id;montar();};action.appendChild(button);tr.appendChild(action);body.appendChild(tr);
      });table.appendChild(body);dados.appendChild(table);
    }
    if(estado.aviso)aviso(estado.aviso);
    q('ll-create').onclick=()=>{novaCampanha(q('ll-campaign-name').value);estado.aviso='Campanha criada. Adicione seus leads.';montar();};
    q('ll-campaign-list').onchange=()=>{estado.atual=campanhas.value;estado.aviso='';montar();};
    q('ll-login').onclick=()=>window.open('https://www.linkedin.com/login','_blank','noopener,noreferrer');
    q('ll-crm-lead').onchange=()=>{
      const idx=Number(fonte.value);
      if(fonte.value===''||!crm[idx])return;
      const ct=crm[idx],conta=contas.get(String(ct.contaId))||{};
      q('lead-nome').value=ct.nome||'';q('lead-cargo').value=ct.cargo||'';q('lead-empresa').value=conta.nome||ct.empresa||'';q('lead-perfil').value=ct.linkedin||'';
      aviso('Contato carregado da carteira autorizada. Informe a publicação antes de gerar a análise.');
    };
    q('ll-lead-list').onchange=()=>{if(!camp)return;camp.selecionado=select.value;estado.aviso='';montar();};
    q('ll-upload').onchange=async()=>{
      const file=q('ll-upload').files?.[0];if(!file)return;
      if(file.size>LIMITE_ARQUIVO)return aviso('Arquivo excede 2 MB.',true);
      if(!camp)return aviso('Crie uma campanha antes de importar.',true);
      try{const list=extrairLeadsArquivo(await file.text());let ok=0,repetidos=0;
        for(const item of list){try{adicionar(camp,item);ok++;}catch{repetidos++;}}
        estado.aviso=ok+' perfis adicionados; '+repetidos+' ignorados (duplicidade ou limite).';montar();
      }catch(err){aviso('Erro na importação: '+err.message,true);}
    };
    q('ll-save').onclick=()=>{
      const c=campanhaAtual();if(!c)return aviso('Crie uma campanha antes de salvar.',true);
      const d=lerFormulario(root);let atual=c.leads.find(x=>x.id===c.selecionado);
      if(!urlLinkedIn(d.perfil,'perfil'))return aviso('URL de perfil LinkedIn inválida.',true);
      if(atual){
        const salvo=novoLead(d);Object.assign(atual,salvo,{id:atual.id,ai:atual.ai,rascunho:q('ll-draft').value,
          curtida:atual.curtida,comentado:atual.comentado});
        aviso('Lead atualizado nesta sessão.');montar();
      }else try{adicionar(c,d);estado.aviso='Lead adicionado à campanha.';montar();}
      catch(err){aviso(err.message,true);}
    };
    q('ll-generate').onclick=async()=>{
      const c=campanhaAtual();if(!c)return aviso('Crie uma campanha antes de analisar.',true);
      const d=lerFormulario(root),perfil=urlLinkedIn(d.perfil,'perfil'),postUrl=urlLinkedIn(d.postUrl,'publicacao');
      if(!perfil||!postUrl)return aviso('Informe URLs válidas do perfil e da publicação.',true);
      if(d.post.length<40)return aviso('Cole o texto completo da publicação (mínimo de 40 caracteres).',true);
      if(d.modo==='resposta'&&d.comentarioLead.length<8)return aviso('Para responder ao lead, informe o texto do comentário dele.',true);
      if(!nuvem||typeof nuvem.chamarFuncao!=='function'||!nuvem.sessao?.())return aviso('Sessão de IA não disponível.',true);
      let l=c.leads.find(x=>x.id===c.selecionado);
      if(!l){try{l=adicionar(c,d);}catch(err){return aviso(err.message,true);}}
      else{const updated=novoLead(d);Object.assign(l,updated,{id:l.id,ai:null,rascunho:'',curtida:l.curtida,comentado:l.comentado});}
      const id=l.id,geracao=++geracaoIA,button=q('ll-generate');
      button.disabled=true;button.textContent='Analisando...';aviso('A IA está avaliando o tema e o contexto do lead.');
      try{
        const resp=await nuvem.chamarFuncao('assistente',{tipo:'linkedin_comentario',texto:prepararMaterial(d),
          contexto:{modo:d.modo,perfil,postUrl}});
        if(!valido()||geracao!==geracaoIA||campanhaAtual()?.id!==c.id)return;
        const alvo=c.leads.find(x=>x.id===id);
        if(!alvo)return;
        if(resp?.erro)throw Error(resp.erro);
        const res=resp?.campos||{},comentario=str(res.comentario,1200);
        if(comentario.length<30)throw Error('Resposta de IA vazia ou fora do formato esperado.');
        alvo.ai={resumo:str(res.resumo,250),gancho:str(res.gancho,250),alerta:str(res.alerta,220)};
        alvo.rascunho=comentario;estado.aviso='Comentário gerado. Revise e aprove antes de publicar.';montar();
      }catch(err){if(valido())aviso('Falha da IA: '+String(err?.message||err),true);}
      finally{if(button.isConnected){button.disabled=false;button.textContent='Analisar e gerar comentário com IA';}}
    };
    q('ll-draft').oninput=()=>{const c=campanhaAtual(),l=c?.leads.find(x=>x.id===c.selecionado);if(l)l.rascunho=q('ll-draft').value;};
    const lAtivo=()=>{const c=campanhaAtual();return c?.leads.find(x=>x.id===c.selecionado);};
    q('ll-open').onclick=()=>{const l=lAtivo(),url=urlLinkedIn(l?.postUrl,'publicacao');if(!url)return aviso('Selecione um lead com URL da publicação.',true);window.open(url,'_blank','noopener,noreferrer');};
    q('ll-open-comment').onclick=()=>{const l=lAtivo(),url=urlLinkedIn(l?.commentUrl);if(!url)return aviso('Não existe URL do comentário válida.',true);window.open(url,'_blank','noopener,noreferrer');};
    q('ll-copy').onclick=async()=>{const t=q('ll-draft').value.trim();if(!t)return aviso('Gere ou escreva o comentário antes de copiar.',true);try{await navigator.clipboard.writeText(t);aviso('Comentário copiado para a área de transferência.');}catch{q('ll-draft').focus();q('ll-draft').select();aviso('Selecione e copie o comentário manualmente.');}};
    q('ll-like').onclick=()=>{const l=lAtivo();if(!l)return aviso('Selecione um lead.',true);l.curtida=true;estado.aviso='Curtida registrada como confirmada pelo usuário, sem ação automática no LinkedIn.';montar();};
    q('ll-commented').onclick=()=>{const l=lAtivo();if(!l)return aviso('Selecione um lead.',true);if(!q('ll-draft').value.trim())return aviso('Preencha o comentário antes de confirmar.',true);l.rascunho=q('ll-draft').value;l.comentado=true;estado.aviso='Publicação registrada como confirmada pelo usuário, sem ação automática no LinkedIn.';montar();};
  }
  montar();
}
