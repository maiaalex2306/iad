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
export function normalizeHeader(value){
  return String(value||'').replace(/^\ufeff/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]/g,'');
}
/* LinkedIn URLs are identifiers, not automatically confirmed live profiles.
 * Keep opaque member IDs case-sensitive (ACo...); do not alter sales IDs.
 * Reject non-LinkedIn domains, credentials and non-profile routes.
 */
export function normalizeProfile(input){
  const source=String(input||'').trim().replace(/[\u200b-\u200d\uFEFF]/g,'');
  if(!source||source.length>2000)return '';
  const embedded=source.match(/https?:\/\/(?:[a-z0-9-]+\.)*linkedin\.com\/[^\s"'<>)]{1,900}/i);
  const raw=embedded?embedded[0]:source;
  let u;
  try{u=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);}catch{return '';}
  if(u.username||u.password||u.port||!/^(?:[a-z0-9-]+\.)*linkedin\.com$/i.test(u.hostname))return '';
  if(!['https:','http:'].includes(u.protocol))return '';
  const path=u.pathname.replace(/\/+$/,'');
  const profile=/^\/in\/([^/]+)(?:\/.*)?$/i.exec(path);
  if(profile){
    let slug;
    try{slug=decodeURIComponent(profile[1]);}catch{return '';}
    if(slug.length>200||!(/^[\p{L}\p{N}._-]{1,200}$/u.test(slug)))return '';
    const opaque=/^(?:ACo|ACw)[a-zA-Z0-9_-]{8,}$/.test(slug);
    const canonical=opaque?slug:slug.toLowerCase();
    return 'https://www.linkedin.com/in/'+encodeURIComponent(canonical)+'/';
  }
  if(/^\/profile\/view$/i.test(path)){
    const id=(u.searchParams.get('id')||'').trim();
    if(!/^[a-zA-Z0-9_.-]{1,200}$/.test(id))return '';
    return 'https://www.linkedin.com/profile/view?id='+encodeURIComponent(id);
  }
  const specialized=/^\/(sales\/(?:people|profile)|recruiter\/profile)\/([^/?#]+)$/i.exec(path);
  if(specialized){
    let value;
    try{value=decodeURIComponent(specialized[2]);}catch{return '';}
    if(value.length>350||!(/^[\p{L}\p{N}_,.\-]{2,350}$/u.test(value)))return '';
    return 'https://www.linkedin.com/'+specialized[1].toLowerCase()+'/'+encodeURIComponent(value).replace(/%2C/gi,',');
  }
  return '';
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
export function columnsFromCsvHeader(header) {
  const headers=header.map(normalizeHeader);
  const fields={};
  for(const [field,aliases] of Object.entries(ALIASES))
    fields[field]=headers.findIndex(h=>aliases.includes(h));
  const candidates=headers.map((h,i)=>({h,i})).filter(({h})=>
    ALIASES.perfil.includes(h)||
    (/linkedin|salesnav|recruiter|profileurl|urlprofile|urlperfil|perfilurl|linkperfil|profilelink/i.test(h)&&
     !/post|publica|coment|company|empresa|organization|organizacao/i.test(h)));
  const prioritized=candidates.filter(x=>x.h!=='url').concat(candidates.filter(x=>x.h==='url'));
  fields.perfilCandidatos=prioritized.map(x=>x.i);
  fields.perfil=fields.perfilCandidatos[0]??-1;
  // Some LH and Sales Navigator CSVs have column names unknown to our CRM.
  // Their profile URLs can still be detected in the individual records.
  fields.headerCount=headers.length;
  return fields;
}
export function findLinkedInProfileInCells(cells,fields){
  const preferred=fields.perfilCandidatos||[];
  const indices=[...preferred,...cells.map((_,i)=>i).filter(i=>!preferred.includes(i))];
  let winner=null,sourceIndex=-1,sourceGroup=-1;
  const seen=new Set();
  for(const index of indices){
    const normalized=normalizeProfile(cells[index]);
    if(!normalized)continue;
    const group=preferred.includes(index)?0:1;
    if(group<sourceGroup)continue;
    if(!winner){winner=normalized;sourceIndex=index;sourceGroup=group;seen.add(normalized);continue;}
    if(group>sourceGroup)break;
    seen.add(normalized);
  }
  if(seen.size>1)return {profile:'',sourceIndex:-1,ambiguous:true};
  return {profile:winner||'',sourceIndex,ambiguous:false};
}
/** Extract confirmed profile URL patterns from arbitrary TXT/HTML/CSV text.
 * Do not treat company pages, posts, or other domains as personal profiles. */
export function extractLinkedInProfilesFromText(text){
  const input=String(text||'');
  const matches=input.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*linkedin\.com\/[^\s<>"'()[\]{}]+/gi)||[];
  const result=[],seen=new Set();
  for(let raw of matches){
    raw=raw.replace(/[.,;:!?]+$/g,'');
    const profile=normalizeProfile(raw);
    if(profile&&!seen.has(profile)){result.push(profile);seen.add(profile);}
  }
  return result;
}
export function profileFailureReason(cells,fields){
  const found=findLinkedInProfileInCells(cells,fields);
  if(found.ambiguous)return 'perfil_ambiguo';
  const preferred=fields.perfilCandidatos||[];
  if(preferred.length&&preferred.every(i=>!String(cells[i]||'').trim())&&
    !cells.some(v=>/linkedin\.com|https?:\/\/|www\./i.test(String(v||''))))
    return 'sem_link';
  const values=cells.map(v=>String(v||'').trim());
  if(!values.some(Boolean))return 'sem_link';
  const urls=values.filter(v=>/linkedin\.com|https?:\/\/|www\./i.test(v));
  if(!urls.length)return 'campo_sem_url';
  if(urls.some(v=>/linkedin\.com/i.test(v)))return 'formato_linkedin_nao_suportado';
  return 'link_externo';
}
export function csvLeadFromCells(cells,fields,line){
  const raw=(key,limit)=>fields[key]<0?'':String(cells[fields[key]]||'').trim().slice(0,limit);
  const match=findLinkedInProfileInCells(cells,fields);
  if(!match.profile||match.ambiguous)return null;
  const profile=match.profile;
  const item={linha:line,perfil:profile,
    lead:raw('nome',120),cargo:raw('cargo',140),empresa:raw('empresa',160),
    resumoPerfil:raw('resumoPerfil',1200),postUrl:raw('postUrl',600),
    post:raw('post',6000),comentarioLead:raw('comentarioLead',2000),
    estado:'pendente'};
  if(!item.lead){
    const slug=profile.split('/in/')[1];
    item.lead=(slug?decodeURIComponent(slug).replace(/\/$/,'').replace(/[-_]/g,' '):'Perfil LinkedIn').slice(0,120);
  }
  return item;
}
export function importLinkedInCsv(text,{maxRows=10000}={}){
  const {rows,separator}=parseCsvTable(text,{maxRows});
  if(rows.length<2)throw new Error('Inclua cabeçalho e pelo menos uma linha com dados.');
  const fields=columnsFromCsvHeader(rows[0]);
  const leads=[],problems=[],seen=new Set();
  let invalid=0,duplicates=0;
  rows.slice(1).forEach((cells,i)=>{
    const item=csvLeadFromCells(cells,fields,i+2);
    if(!item){invalid++;if(problems.length<30)problems.push({line:i+2,reason:profileFailureReason(cells,fields)});return;}
    if(seen.has(item.perfil)){duplicates++;return;}
    seen.add(item.perfil);
    leads.push(item);
  });
  return {leads,summary:{total:rows.length-1,valid:leads.length,invalid,duplicates,separator,problems}};
}
