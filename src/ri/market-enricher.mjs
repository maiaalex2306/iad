/* RI-M10 — Enricher profissional sob demanda, só pesquisa externa.
 * Nada vai para Inteligência Comercial ou Pipeline sem importação autorizada.
 */
import {isReviewableSourceURL} from './market-contract.mjs';

export function mountMarketEnricher({card,company,doc,nuvem,valid,provider,getSequence}={}){
 if(!card||!doc||!company||!company.cnpj||!company.nome||
    !company.uf||!company.cidade||!company.segmento||
    typeof valid!=='function'||typeof getSequence!=='function')return ()=>{};
 const button=doc.createElement('button');
 button.type='button';button.className='btn';
 button.textContent='PESQUISAR DECISORES PROFISSIONAIS — CONSOME COTA';
 const panel=doc.createElement('section');panel.className='iad-market-professional-enricher';
 card.appendChild(button);card.appendChild(panel);
 let attempted=false,closed=false,abort=null;
 const line=(text,tag='p')=>{
  const node=doc.createElement(tag);node.textContent=text;panel.appendChild(node);return node;
 };
 button.addEventListener('click',async()=>{
  if(closed||attempted||!valid()||button.disabled)return;
  const session=nuvem?.sessao?.(),cfg=nuvem?.config?.();
  if(!session?.access_token||!cfg?.url||!cfg?.chave){
   panel.replaceChildren();line('Autenticação necessária antes da investigação de decisores.');return;
  }
  attempted=true;button.disabled=true;
  const seq=getSequence();abort=new AbortController();
  panel.replaceChildren();
  line('Executando pesquisa web adicional de profissionais. O servidor reserva uma cota antes de consultar as IAs.');
  try{
   const response=await fetch(cfg.url.replace(/\/$/,'')+'/functions/v1/market-search',{
    method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.chave,
     Authorization:'Bearer '+session.access_token},
    body:JSON.stringify({action:'enrich',provider:provider?.()||'both',
     target:{cnpj:company.cnpj,nome:company.nome},
     filters:{uf:company.uf,cidade:company.cidade,segmento:company.segmento,limit:1}}),
    signal:abort.signal
   });
   const payload=await response.json();
   if(closed||!valid()||getSequence()!==seq)return;
   panel.replaceChildren();
   if(!response.ok){
    line('Pesquisa não concluída: '+String(payload?.error||response.status)+
     '. A cota pode ter sido reservada; consulte o controle antes de nova tentativa.');
    return;
   }
   line('Enricher — profissionais citados nas fontes','h5');
   line('Nome, cargo, vínculo com empresa, e-mail e perfil ainda NÃO foram verificados independentemente. Nenhum contato foi cadastrado ou abordado.');
   if(payload.partial===true)line('Pesquisa parcial: um ou mais provedores não concluíram.');
   const data=(Array.isArray(payload.decisores)?payload.decisores:[])
    .filter(c=>c&&c.cnpj===company.cnpj&&
     typeof c.nome==='string'&&typeof c.cargo==='string'&&isReviewableSourceURL(c.fonte)).slice(0,8);
   if(!data.length)line('Nenhum profissional com CNPJ exato e URL pública citada foi encontrado. Isso não comprova ausência de decisores.');
   for(const person of data){
    const section=doc.createElement('section');section.className='card';
    const title=doc.createElement('h6');title.textContent=person.nome+' — '+person.cargo;section.appendChild(title);
    const notice=doc.createElement('p');notice.textContent='Vínculo profissional citado, não verificado. Conferir a fonte antes de usar.';section.appendChild(notice);
    const addLink=(href,label)=>{
     if(!isReviewableSourceURL(href))return;
     const a=doc.createElement('a');a.href=href;a.target='_blank';
     a.rel='noopener noreferrer';a.textContent=label;section.appendChild(a);
    };
    addLink(person.fonte,'Conferir fonte profissional citada');
    if(person.linkedin&&/^https:\/\/([a-z]{2,3}\.)?(www\.)?linkedin\.com\/in\//i.test(person.linkedin))
     addLink(person.linkedin,'Perfil LinkedIn citado');
    if(person.emailCorporativo){
     const email=doc.createElement('p');
     email.textContent='E-mail corporativo informado (não validado): '+String(person.emailCorporativo);
     section.appendChild(email);
    }
    panel.appendChild(section);
   }
   const engines=(Array.isArray(payload.providers)?payload.providers:[])
    .filter(x=>x==='OpenAI'||x==='Anthropic');
   line('Motores participantes: '+(engines.join(' + ')||'não informado')+
    '. Sem gravação, disparos de mensagens ou verificação de entregabilidade.');
   const usage=(Array.isArray(payload.usage)?payload.usage:[]).filter(x=>engines.includes(x?.provider));
   if(usage.length)line('Consumo informado: '+usage.map(u=>u.provider+': '+
    (Number.isSafeInteger(u.webSearchRequests)?u.webSearchRequests:'?')+
    ' buscas web').join(' | ')+'. Custo em R$ ainda não calculado.');
  }catch(error){
   if(!closed&&valid()&&getSequence()===seq&&error?.name!=='AbortError'){
    panel.replaceChildren();line('Falha de rede. A cota pode ter sido consumida; confirme antes de repetir.');
   }
  }finally{abort=null;}
 });
 return ()=>{closed=true;if(abort)abort.abort();};
}
