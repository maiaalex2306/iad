/* RI-M09 Signal Hunter independente: investigação externa, só após clique.
 * Sem importar dados ou alterar o índice de prontidão/CRM.
 */
import {isReviewableSourceURL} from './market-contract.mjs';

const TYPE_LABELS={
 expansao:'Expansão',investimento:'Investimento',contratacao:'Contratação executiva',
 licenciamento:'Licenciamento',projeto:'Projeto',mudanca_operacional:'Mudança operacional',outro:'Outro'
};
export function mountMarketSignals({card,company,doc,nuvem,valid,provider,getSequence}={}){
 if(!card||!doc||!company||!company.cnpj||!company.nome||
    !company.uf||!company.cidade||!company.segmento||
    typeof valid!=='function'||typeof getSequence!=='function')return ()=>{};
 const button=doc.createElement('button');button.type='button';
 button.className='btn';button.textContent='BUSCAR SINAIS EXTERNOS COM IA — CONSOME COTA';
 const panel=doc.createElement('section');panel.className='iad-market-signal-hunter';
 card.appendChild(button);card.appendChild(panel);
 let used=false,closed=false,abort=null;
 const p=(value,tag='p')=>{
  const node=doc.createElement(tag);node.textContent=value;panel.appendChild(node);
  return node;
 };
 button.addEventListener('click',async()=>{
  if(closed||used||button.disabled||!valid())return;
  const session=nuvem?.sessao?.(),cfg=nuvem?.config?.();
  if(!session?.access_token||!cfg?.url||!cfg?.chave){
   panel.replaceChildren();p('Autenticação necessária antes da busca de sinais.');return;
  }
  used=true;button.disabled=true;
  const seq=getSequence();abort=new AbortController();
  panel.replaceChildren();
  p('Investigando sinais externos com pesquisa web. O servidor pode consumir uma cota de pesquisa.');
  try{
   const response=await fetch(cfg.url.replace(/\/$/,'')+'/functions/v1/market-search',{
    method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.chave,
     Authorization:'Bearer '+session.access_token},
    body:JSON.stringify({action:'signals',provider:provider?.()||'both',
     target:{cnpj:company.cnpj,nome:company.nome},
     filters:{uf:company.uf,cidade:company.cidade,segmento:company.segmento,limit:1}}),
    signal:abort.signal
   });
   const payload=await response.json();
   if(closed||!valid()||getSequence()!==seq)return;
   panel.replaceChildren();
   if(!response.ok){
    p('Pesquisa de sinais não concluída: '+String(payload?.error||response.status)+
     '. Uma cota pode ter sido reservada; confirme antes de repetir.');
    return;
   }
   p('Signal Hunter — eventos externos para revisão','h5');
   p('Eventos relatados pelas IAs, com URLs citadas. Nenhum vínculo com compra foi confirmado; não houve alteração na shortlist ou no CRM.');
   if(payload.partial===true)p('Pesquisa parcial: pelo menos um provedor não concluiu.');
   const signals=(Array.isArray(payload.sinais)?payload.sinais:[])
    .filter(s=>s&&s.cnpj===company.cnpj&&Object.hasOwn(TYPE_LABELS,s.tipo)&&
     isReviewableSourceURL(s.url)).slice(0,8);
   if(!signals.length)p('Nenhum evento com CNPJ exato e URL HTTPS citada foi retornado nesta pesquisa. Isso não comprova ausência de projetos.');
   for(const event of signals){
    const section=doc.createElement('section');section.className='card';
    const title=doc.createElement('h6');title.textContent=TYPE_LABELS[event.tipo]+' — '+String(event.titulo||'Evento a conferir');section.appendChild(title);
    const date=doc.createElement('p');date.textContent='Publicação informada: '+
     (event.dataPublicacao||'data não informada')+' · Status: fonte citada, conteúdo e CNPJ não verificados';section.appendChild(date);
    if(event.resumo){const desc=doc.createElement('p');desc.textContent=String(event.resumo);section.appendChild(desc);}
    const a=doc.createElement('a');a.href=event.url;a.target='_blank';
    a.rel='noopener noreferrer';a.textContent='Conferir fonte citada';section.appendChild(a);
    panel.appendChild(section);
   }
   const engines=(Array.isArray(payload.providers)?payload.providers:[])
    .filter(x=>x==='OpenAI'||x==='Anthropic');
   p('Motores com busca concluída: '+(engines.join(' + ')||'não informado')+'. Evidências para revisão humana; nenhuma mensagem comercial foi enviada.');
   const usage=(Array.isArray(payload.usage)?payload.usage:[]).filter(x=>engines.includes(x?.provider));
   if(usage.length)p('Consumo informado: '+usage.map(u=>u.provider+': '+
    (Number.isSafeInteger(u.webSearchRequests)?u.webSearchRequests:'?')+
    ' buscas web').join(' | ')+'. Custo em R$ ainda não calculado.');
  }catch(error){
   if(!closed&&valid()&&getSequence()===seq&&error?.name!=='AbortError'){
    panel.replaceChildren();p('Falha de rede na investigação. A cota pode ter sido consumida; confira antes de repetir.');
   }
  }finally{abort=null;}
 });
 return ()=>{closed=true;if(abort)abort.abort();};
}
