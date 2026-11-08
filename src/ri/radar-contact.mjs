/* RI-45 — dados de contato para pistas comerciais.
 * Somente leitura do snapshot autorizado; nunca infere autoria pelo nome da empresa.
 * Cada indice existe apenas durante a renderizacao da sessao atual.
 */
const id=v=>typeof v==='string'&&v.trim().length>0;
const key=(tenant,value)=>JSON.stringify([tenant,value]);
const fold=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const text=v=>typeof v==='string'?v.trim().slice(0,200):'';
function permitted(row,scope){
 if(!row||!id(row.id)||!id(row.tenantId)||!scope||!id(scope.userId))return false;
 if(scope.role==='admin'&&scope.admin===true){
  return (scope.tenantFilter==='todas'||scope.tenantFilter===row.tenantId)&&
   (scope.ownerFilter==='todos'||scope.ownerFilter===row.donoId);
 }
 return scope.role==='gestor'&&id(scope.tenantId)&&row.tenantId===scope.tenantId;
}
export function safeLinkedInProfile(raw){
 if(typeof raw!=='string'||raw.length>400)return null;
 try{
  const value=raw.trim();
  const u=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||
     !/^(?:[a-z0-9-]+\.)*linkedin\.com$/i.test(u.hostname)||
     !/^\/(?:in|pub)\/[a-z0-9_%.-]+\/?$/i.test(u.pathname))return null;
  u.hash='';u.search='';
  return u.href;
 }catch{return null;}
}
export function safeTelephone(raw){
 const number=text(raw);
 const digits=number.replace(/\D/g,'');
 if(digits.length<8||digits.length>15)return null;
 return {label:number,href:'tel:'+(number.startsWith('+')?'+':'')+digits};
}
export function buildRadarContactIndex({snapshot,scope}={}){
 if(!Array.isArray(snapshot?.contas)||!Array.isArray(snapshot?.contatos)||
    !Array.isArray(snapshot?.oportunidades)||!scope||!id(scope.userId)||
    !['gestor','admin'].includes(scope.role)||
    (scope.role==='admin'&&scope.admin!==true))
  throw Error('Carteira e sessao autorizada obrigatorias');
 const accounts=new Set(),contactsByAccount=new Map(),contactsById=new Map(),opportunities=new Map();
 for(const account of snapshot.contas)
  if(permitted(account,scope))accounts.add(key(account.tenantId,account.id));
 for(const c of snapshot.contatos){
  if(!permitted(c,scope)||!accounts.has(key(c.tenantId,c.contaId)))continue;
  const k=key(c.tenantId,c.contaId);
  if(!contactsByAccount.has(k))contactsByAccount.set(k,[]);
  contactsByAccount.get(k).push(c);
  contactsById.set(key(c.tenantId,c.id),c);
 }
 for(const op of snapshot.oportunidades){
  if(!permitted(op,scope)||!accounts.has(key(op.tenantId,op.contaId)))continue;
  opportunities.set(key(op.tenantId,op.id),op);
 }
 const present=(c,relation)=>c?{
  name:text(c.nome)||'Contato sem nome',
  relation,
  linkedin:safeLinkedInProfile(c.linkedin),
  phone:safeTelephone(c.telefone)||safeTelephone(c.telefoneComercial)
 }:null;
 return function contactForRadarItem(item){
  if(!item||!accounts.has(key(item.tenantId,item.accountId))||
     !id(item.sourceOpportunityId))return null;
  const op=opportunities.get(key(item.tenantId,item.sourceOpportunityId));
  if(!op||op.contaId!==item.accountId)return null;
  const all=contactsByAccount.get(key(item.tenantId,item.accountId))||[];
  const get=contactId=>{
   const c=contactsById.get(key(item.tenantId,contactId));
   return c&&c.contaId===item.accountId?c:null;
  };
  const ev=Array.isArray(op.eventos)?
   op.eventos.find(e=>e&&id(e.id)&&e.id===item.sourceEventId):null;
  const direct=get(ev?.contatoId);
  if(direct)return present(direct,'contato vinculado ao registro');
  const quote=fold(item.evidence).slice(0,130);
  if(quote.length>=16&&Array.isArray(op.eventos)){
   const matched=new Set();
   for(const e of op.eventos){
    if(e?.tipo!=='decision'||!e.contatoId)continue;
    const body=fold(e.titulo||e.descricao);
    if(body&&(body.includes(quote)||quote.includes(body))) {
     const c=get(e.contatoId);if(c)matched.add(c);
    }
   }
   if(matched.size===1)return present([...matched][0],'contato da fala registrada');
  }
  const stakeholders=[...new Set(Array.isArray(op.stakeholders)?op.stakeholders:[])]
   .map(get).filter(Boolean);
  if(stakeholders.length===1)return present(stakeholders[0],'unico contato vinculado a oportunidade');
  // O unico contato cadastrado pode ser mostrado, sem afirmar que foi quem respondeu.
  if(stakeholders.length===0&&all.length===1)
   return present(all[0],'contato cadastrado na empresa; autoria a confirmar');
  return null;
 };
}
