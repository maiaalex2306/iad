/* RI-M08: investigação adicional individual de Mercado, acionada pelo usuário.
 * Resultado externo fica isolado da carteira, shortlist e importação.
 * Cada clique validado usa a cota existente da função market-search.
 */
import {normalizeMarketCompanies,isReviewableSourceURL} from './market-contract.mjs';

export function mountMarketInvestigation({card,company,doc,nuvem,valid,provider,getSequence}={}){
 if(!card||!doc||!company||!company.nome||
    !company.uf||!company.cidade||!company.segmento||
    typeof valid!=='function'||typeof getSequence!=='function')return ()=>{};
 const button=doc.createElement('button');
 button.type='button';button.className='btn';
 button.textContent=company.cnpj?'INVESTIGAR EMPRESA COM IA — CONSOME COTA':
  'LOCALIZAR IDENTIDADE E CNPJ COM IA — CONSOME COTA';
 const panel=doc.createElement('section');panel.className='iad-market-independent-investigation';
 card.appendChild(button);card.appendChild(panel);
 let abort=null,attempted=false,closed=false;
 const line=(content,tag='p')=>{
  const node=doc.createElement(tag);node.textContent=content;panel.appendChild(node);return node;
 };
 button.addEventListener('click',async()=>{
  if(closed||attempted||!valid()||button.disabled)return;
  const session=nuvem?.sessao?.(),cfg=nuvem?.config?.();
  if(!session?.access_token||!cfg?.url||!cfg?.chave){
   panel.replaceChildren();line('Sessão de nuvem necessária para investigar esta empresa.');return;
  }
  attempted=true;button.disabled=true;
  const sequence=getSequence();abort=new AbortController();
  panel.replaceChildren();
  line('Pesquisa web adicional independente. O servidor reserva uma cota antes de consultar as IAs.');
  try{
   const response=await fetch(cfg.url.replace(/\/$/,'')+'/functions/v1/market-search',{
    method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.chave,
     'Authorization':'Bearer '+session.access_token},
    body:JSON.stringify({action:'investigate',provider:provider?.()||'both',
     target:{cnpj:company.cnpj||null,nome:company.nome},
     filters:{uf:company.uf,cidade:company.cidade,segmento:company.segmento,limit:1}}),
    signal:abort.signal
   });
   const payload=await response.json();
   if(closed||!valid()||getSequence()!==sequence)return;
   panel.replaceChildren();
   if(!response.ok){
    line('Investigação não concluída: '+String(payload?.error||response.status)+
     '. A cota pode ter sido consumida; consulte o controle antes de outra tentativa.');
    return;
   }
   const candidates=normalizeMarketCompanies(payload.data||[],{
    source:payload.source||'Investigação independente',retrievedAt:payload.retrievedAt||''});
   const found=company.cnpj?candidates.filter(x=>x.cnpj===company.cnpj):candidates.slice(0,3);
   line(company.cnpj?'Analyst — pesquisa web independente':'Analyst — identidade por nome e município','h5');
   const providers=(Array.isArray(payload.providers)?payload.providers:[])
    .filter(p=>p==='OpenAI'||p==='Anthropic');
   line('IAs participantes: '+(providers.join(' + ')||'não informado')+
    '. Nenhum resultado alterou a carteira ou a shortlist anterior.');
   if(payload.partial===true)line('Pesquisa parcial: um ou mais provedores não concluíram.');
   if(!found.length){
    line(company.cnpj?'CNPJ exato não corroborado nas respostas citadas.':
      'Nenhuma identidade empresarial compatível com nome e município foi localizada com fontes citadas.');
    return;
   }
   if(!company.cnpj)line('ATENÇÃO: são hipóteses de identidade para conferência. Mesmo um CNPJ com dígitos válidos não comprova vínculo jurídico. Não há importação automática.');
   for(const match of found){
    line((match.cnpj?'CNPJ relatado (NÃO verificado): '+match.cnpj:'CNPJ ainda pendente')+
     '; nome: '+(match.razaoSocial||match.nome)+'; local: '+match.cidade+'/'+match.uf+'.');
    const sources=(match.fontes||[]).filter(x=>isReviewableSourceURL(x.url)).slice(0,8);
    if(!sources.length)line('Não há URL HTTPS pública para conferir.');
    for(const source of sources){
     const a=doc.createElement('a');a.href=source.url;a.target='_blank';
     a.rel='noopener noreferrer';a.textContent=source.titulo||source.url;
     panel.appendChild(a);line('');
    }
    if(match.contatos.length)
     line('Possíveis decisores citados: '+match.contatos.map(c=>c.nome+' — '+c.cargo).join('; ')+
      '. Vínculo e contato profissional não foram validados.');
    if(match.noticias.length)
     line('Notícias a revisar: '+match.noticias.map(n=>n.titulo).join('; ')+
      '. Notícias não comprovam intenção de compra.');
   }
   const usage=(Array.isArray(payload.usage)?payload.usage:[])
    .filter(x=>['OpenAI','Anthropic'].includes(x?.provider));
   if(usage.length)line('Consumo informado: '+usage.map(x=>x.provider+' '+
    (Number.isSafeInteger(x.webSearchRequests)?x.webSearchRequests:'?')+
    ' buscas web').join(' | ')+'. Valor monetário ainda não confirmado.');
  }catch(e){
   if(!closed&&valid()&&getSequence()===sequence&&e?.name!=='AbortError'){
    panel.replaceChildren();line('Falha de rede. A cota pode ter sido reservada; confira antes de tentar novamente.');
   }
  }finally{abort=null;}
 });
 return ()=>{closed=true;if(abort)abort.abort();};
}
