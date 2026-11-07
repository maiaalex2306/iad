/* Fila IndexedDB isolada por usuario/empresa/filtros, sem gravação no Store/CAS.
   Permite listas maiores que a RAM ao gravar o CSV por lotes. */
export const LINKEDIN_QUEUE_DB='iad-linkedin-leads-local-v1';
const MAX_ORDER=Number.MAX_SAFE_INTEGER;
const TERMINAL=new Set(['sem_post','confirmado','descartado']);
export function scopeKeyOf(scope={}){
  return JSON.stringify([String(scope.userId||''),String(scope.tenantId||''),
    String(scope.role||''),String(scope.tenantFilter||''),String(scope.ownerFilter||'')]);
}
export function openLinkedInQueue(){
  if(typeof indexedDB==='undefined')return Promise.reject(new Error('IndexedDB indisponível neste navegador.'));
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(LINKEDIN_QUEUE_DB,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('leads')){
        const store=db.createObjectStore('leads',{keyPath:['scope','campaign','linha']});
        store.createIndex('by_profile',['scope','campaign','perfil'],{unique:true});
      }
      if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'scope'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Não foi possível abrir o IndexedDB.'));
    request.onblocked=()=>reject(new Error('Feche outras abas do CRM e tente novamente.'));
  });
}
function run(db,stores,mode,callback){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,mode);
    let response;
    tx.oncomplete=()=>resolve(response);
    tx.onabort=()=>reject(tx.error||new Error('Transação cancelada.'));
    tx.onerror=()=>reject(tx.error||new Error('Erro no IndexedDB.'));
    callback(tx,value=>{response=value;});
  });
}
export function metaOf(db,scope){
  return run(db,['meta'],'readonly',(tx,done)=>{
    const req=tx.objectStore('meta').get(scopeKeyOf(scope));
    req.onsuccess=()=>done(req.result||null);
  });
}
export function saveMeta(db,scope,data){
  const key=scopeKeyOf(scope);
  return run(db,['meta'],'readwrite',(tx,done)=>{
    const req=tx.objectStore('meta').put({...data,scope:key});
    req.onsuccess=()=>done({...data,scope:key});
  });
}
export function addLeadBatch(db,scope,campaign,rows){
  const key=scopeKeyOf(scope);
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['leads'],'readwrite');
    const store=tx.objectStore('leads');
    let inserted=0,duplicates=0;
    tx.oncomplete=()=>resolve({inserted,duplicates});
    tx.onerror=()=>reject(tx.error||new Error('Falha ao gravar lote de leads.'));
    tx.onabort=()=>reject(tx.error||new Error('Lote cancelado.'));
    for(const item of rows){
      const req=store.add({...item,scope:key,campaign});
      req.onsuccess=()=>inserted++;
      req.onerror=(event)=>{
        if(req.error?.name==='ConstraintError'){
          event.preventDefault();event.stopPropagation();duplicates++;
        }
      };
    }
  });
}
export function leadAt(db,scope,campaign,linha){
  return run(db,['leads'],'readonly',(tx,done)=>{
    const req=tx.objectStore('leads').get([scopeKeyOf(scope),campaign,linha]);
    req.onsuccess=()=>done(req.result||null);
  });
}
function cursorQuery(db,scope,campaign,fromLine,limit,predicate=()=>true){
  const key=scopeKeyOf(scope);
  return run(db,['leads'],'readonly',(tx,done)=>{
    const store=tx.objectStore('leads');
    const range=IDBKeyRange.bound([key,campaign,Math.max(0,fromLine)],[key,campaign,MAX_ORDER]);
    const req=store.openCursor(range);
    const found=[];
    req.onsuccess=()=>{
      const c=req.result;
      if(!c){done(found);return;}
      if(predicate(c.value))found.push(c.value);
      if(found.length>=limit){done(found);return;}
      c.continue();
    };
  });
}
export async function pageOf(db,scope,campaign,fromLine=0,pageSize=25){
  return cursorQuery(db,scope,campaign,fromLine,Math.max(1,Math.min(100,pageSize)));
}
export async function nextPendingLead(db,scope,campaign,afterLine=0){
  const rows=await cursorQuery(db,scope,campaign,afterLine+1,1,row=>!TERMINAL.has(row.estado));
  return rows[0]||null;
}
export function putLead(db,row){
  if(!row||!row.scope||!row.campaign||!Number.isInteger(row.linha))
    return Promise.reject(new Error('Lead sem identidade da campanha.'));
  return run(db,['leads'],'readwrite',(tx,done)=>{
    const request=tx.objectStore('leads').put(row);
    request.onsuccess=()=>done(row);
  });
}
export function deleteCampaign(db,scope,campaign){
  if(!campaign)return Promise.resolve();
  return run(db,['leads'],'readwrite',(tx,done)=>{
    const key=scopeKeyOf(scope);
    const range=IDBKeyRange.bound([key,campaign,0],[key,campaign,MAX_ORDER]);
    const req=tx.objectStore('leads').delete(range);
    req.onsuccess=()=>done(true);
  });
}
