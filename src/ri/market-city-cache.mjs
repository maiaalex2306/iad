/* PERF-36G — cache em memória da aba para municípios públicos IBGE.
 * Apenas códigos/nomes públicos: sem dados de cliente, tenant ou autenticação.
 * Duração curta, limite LRU e instâncias separadas por Document.
 * Nunca persistir em localStorage/IndexedDB nem substituir a validação IBGE.
 */
const DOCUMENT_CACHES=new WeakMap();
const DEFAULT_TTL_MS=6*60*60*1000;
const DEFAULT_MAX_UFS=8;
export function createMarketCityCache({now=()=>Date.now(),ttlMs=DEFAULT_TTL_MS,maxUfs=DEFAULT_MAX_UFS}={}){
 if(typeof now!=='function'||!Number.isFinite(ttlMs)||ttlMs<=0||
   !Number.isSafeInteger(maxUfs)||maxUfs<1||maxUfs>27)throw Error('Parâmetros de cache inválidos');
 const entries=new Map();
 function get(uf){
  const entry=entries.get(uf);
  if(!entry)return null;
  const age=now()-entry.stamp;
  if(!Number.isFinite(age)||age<0||age>ttlMs){entries.delete(uf);return null;}
  entries.delete(uf);entries.set(uf,entry);
  return entry.items;
 }
 function put(uf,items){
  if(!/^[A-Z]{2}$/.test(String(uf))||!Array.isArray(items)||
     !items.length||items.length>2000)return false;
  const clean=[],seen=new Set();
  for(const item of items){
   const key=String(item?.key||''),label=String(item?.label||''),value=item?.value;
   if(!/^\d{7}$/.test(key)||key.slice(0,2)!==String(value?.codigoIBGE||'').slice(0,2)||
     value?.codigoIBGE!==key||value?.uf!==uf||
     !label.trim()||label.length>160||seen.has(key))return false;
   seen.add(key);
   clean.push(Object.freeze({key,label,value:Object.freeze({
    codigoIBGE:key,nome:String(value.nome||label),uf
   })}));
  }
  const stamp=now();
  if(!Number.isFinite(stamp))return false;
  entries.delete(uf);
  entries.set(uf,{stamp,items:Object.freeze(clean)});
  while(entries.size>maxUfs)entries.delete(entries.keys().next().value);
  return true;
 }
 return Object.freeze({get,put,clear:()=>entries.clear()});
}
export function marketCityCacheForDocument(doc){
 if(!doc||typeof doc!=='object')throw Error('Document obrigatório');
 let cache=DOCUMENT_CACHES.get(doc);
 if(!cache){cache=createMarketCityCache();DOCUMENT_CACHES.set(doc,cache);}
 return cache;
}
