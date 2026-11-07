/* LinkedIN Leads CSV — importação local, sem salvar no CRM ou pesquisar na rede.
   Tratamento estrito de links, cabeçalhos variados e deduplicação por perfil.
   O arquivo permanece somente na memória desta aba. */
const ALIASES={
  perfil:['linkedin','linkedinurl','linklinkedin','perfil','perfillinkedin','linkdoperfil','profileurl','profilelink','publicprofileurl','urlperfil','linkedinprofile','linkedinprofileurl','url'],
  nome:['nome','nomecompleto','lead','contato','name','fullname','firstname','firstnamelastname'],
  cargo:['cargo','funcao','titulo','jobtitle','headline','position','role'],
  empresa:['empresa','companhia','company','companyname','organizacao','conta','account'],
  resumoPerfil:['resumoperfil','resumo','descricao','headlineperfil','about','summary','biografia'],
  postUrl:['posturl','urlpost','urlpublicacao','linkpost','publicacao','publicationurl'],
  post:['posttexto','textopost','conteudopost','postcontent'],
  comentarioLead:['comentariolead','comentariodolead','textocomentario','leadcomment','commenttext']
};
function normalizeHeader(value){
  return String(value||'').replace(/^\ufeff/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]/g,'');
}
export function normalizeProfile(input){
  const raw=String(input||'').trim();
  if(!raw||raw.length>700)return '';
  let u;
  try{u=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);}
  catch(_){return '';}
  if(u.protocol!=='https:'||!/(^|\.)linkedin\.com$/i.test(u.hostname) ||
     u.username||u.password)return '';
  const match=/^\/in\/([a-z0-9_%-]{3,200})\/?$/i.exec(u.pathname);
  if(!match)return '';
  let slug;
  try{slug=decodeURIComponent(match[1]);}catch(_){return '';}
  if(!/^[a-z0-9_-]{3,200}$/i.test(slug))return '';
  return 'https://www.linkedin.com/in/'+slug.toLowerCase()+'/';
}
function chooseSeparator(header){
  const counters={',':0,';':0,'\t':0};
  let quote=false;
  for(let i=0;i<header.length;i++){
    const ch=header[i];
    if(ch==='"'){if(quote&&header[i+1]==='"')i++;else quote=!quote;continue;}
    if(!quote&&(ch==='\n'||ch==='\r'))break;
    if(!quote&&Object.prototype.hasOwnProperty.call(counters,ch))counters[ch]++;
  }
  return Object.keys(counters).sort((a,b)=>counters[b]-counters[a])[0];
}
export function parseCsvTable(text,{maxRows=10000}={}){
  const raw=String(text||'').replace(/^\ufeff/,'');
  const sep=chooseSeparator(raw);
  const rows=[];let row=[],cell='',quote=false;
  function pushRow(){
    row.push(cell);cell='';
    if(row.some(v=>v.trim()!==''))rows.push(row);
    row=[];
    if(rows.length>maxRows+1)throw new Error('O CSV ultrapassa o limite de '+maxRows+' leads.');
  }
  for(let i=0;i<raw.length;i++){
    const ch=raw[i];
    if(quote){
      if(ch==='"'){if(raw[i+1]==='"'){cell+='"';i++;}else quote=false;}
      else cell+=ch;
      continue;
    }
    if(ch==='"'){if(cell.trim()==='')quote=true;else throw new Error('Aspas em posição inválida no CSV.');}
    else if(ch===sep){row.push(cell);cell='';}
    else if(ch==='\n'){pushRow();}
    else if(ch==='\r'){if(raw[i+1]==='\n')i++;pushRow();}
    else cell+=ch;
  }
  if(quote)throw new Error('CSV contém aspas sem fechamento.');
  if(cell||row.length)pushRow();
  return {separator:sep,rows};
}
export function importLinkedInCsv(text,{maxRows=10000}={}){
  const {rows,separator}=parseCsvTable(text,{maxRows});
  if(rows.length<2)throw new Error('Inclua cabeçalho e pelo menos uma linha com dados.');
  const headers=rows[0].map(normalizeHeader);
  const fields={};
  for(const [field,aliases] of Object.entries(ALIASES)){
    const position=headers.findIndex(h=>aliases.includes(h));
    fields[field]=position;
  }
  if(fields.perfil<0)throw new Error('CSV sem coluna de perfil. Use "LinkedIn", "Perfil LinkedIn" ou "profile_url".');
  const leads=[],problems=[],seen=new Set();
  let invalid=0,duplicates=0;
  rows.slice(1).forEach((cells,i)=>{
    const raw=(key,limit)=>fields[key]<0?'':String(cells[fields[key]]||'').trim().slice(0,limit);
    const profile=normalizeProfile(raw('perfil',700));
    if(!profile){invalid++;if(problems.length<30)problems.push({line:i+2,reason:'Perfil LinkedIn inválido ou não público (/in/ obrigatório).'});return;}
    if(seen.has(profile)){duplicates++;return;}
    seen.add(profile);
    const item={
      linha:i+2,perfil:profile,
      lead:raw('nome',120),cargo:raw('cargo',140),
      empresa:raw('empresa',160),resumoPerfil:raw('resumoPerfil',1200),
      postUrl:raw('postUrl',600),post:raw('post',6000),
      comentarioLead:raw('comentarioLead',2000),
      estado:'pendente'
    };
    if(!item.lead)item.lead=profile.split('/in/')[1].replace(/\/$/,'').replace(/[-_]/g,' ').slice(0,120);
    leads.push(item);
  });
  return {leads,summary:{total:rows.length-1,valid:leads.length,invalid,duplicates,separator,problems}};
}
