/* P5e: cache incremental efêmero por sessão, revisão e conjunto visível.
   Falha fechada: toda escrita não identificada exige recálculo total. */
(function (global) {
 'use strict';
 function criar(store, engine) {
  let entradas=new Map(), escopo=null, revisao=-1, dia=null, ids=null;
  let completo=true, alterados=new Set(), valido=true, hit=0, miss=0;
  const desinscrever=store.inscreverMudancas(function(e) {
   if(!e || e.revisao!==revisao+1 || e.tipo==='full' || !e.id) {
     completo=true; alterados.clear();
   } else if(!completo) alterados.add(String(e.id));
   revisao=e && Number.isSafeInteger(e.revisao)?e.revisao:-1;
  });
  function assinatura(){
    const c=store.contexto(),u=c&&c.usuario,f=c&&c.filtros||{};
    return u&&u.id&&c.tenantId ? JSON.stringify([u.id,c.tenantId,u.papel||'',
      f.tenant||'',f.usuario||'']) : null;
  }
  function calcular(ops,atrasos){
   if(!valido)throw Error('P5e: cache revogado');
   const novaAssinatura=assinatura(),hoje=store.hoje(),r=store.revisao();
   const abertas=ops.filter(o=>!o.desfecho);
   const chaves=abertas.map(o=>String(o.id));
   const conjunto=chaves.slice().sort().join('\u0001');
   if(!novaAssinatura || novaAssinatura!==escopo || r!==revisao ||
      hoje!==dia || conjunto!==ids) completo=true;
   if(completo) { entradas.clear(); alterados.clear(); miss+=abertas.length; }
   const resumos=abertas.map(o=>{
     const k=String(o.id);
     if(!completo && !alterados.has(k) && entradas.has(k)) {hit++;return entradas.get(k);}
     const resumo=engine.resumo(o,atrasos);
     entradas.set(k,resumo);if(!completo)miss++;
     return resumo;
   });
   const carteira=engine.carteira(abertas,atrasos,resumos);
   escopo=novaAssinatura;revisao=r;dia=hoje;ids=conjunto;completo=false;alterados.clear();
   return carteira;
  }
  function revogar(){valido=false;desinscrever();entradas.clear();alterados.clear();}
  function stats(){return {hits:hit,misses:miss,ativos:entradas.size};}
  return {calcular,revogar,stats};
 }
 global.IADP5e={criar};
})(window);
