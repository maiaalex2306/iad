/* PERF-03D: journal local de operações CAS, isolado por identidade.
 * O módulo não assume sucesso antes do ACK do servidor e não executa upsert
 * como fallback. A integração no fluxo legado exige cobertura das demais
 * colunas e dos inserts/deletes antes de habilitar em produção. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.IADCASQueue=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create(storage,identity,send){
    if(!storage||!identity||typeof send!=='function') throw Error('Dependências CAS obrigatórias');
    const user=String(identity.userId||''),tenant=String(identity.tenantId||'');
    if(!user||!tenant) throw Error('Identidade incompleta');
    const key='iad-crm:cas:v273:'+encodeURIComponent(tenant)+':'+encodeURIComponent(user);
    function load(){
      const raw=storage.getItem(key);
      if(!raw) return [];
      const parsed=JSON.parse(raw);
      if(!Array.isArray(parsed)) throw Error('Fila CAS inválida; não sobrescrever');
      for(const x of parsed) if(!x||x.userId!==user||x.tenantId!==tenant||!x.operationId) throw Error('Fila de outra sessão');
      return parsed;
    }
    function save(queue){storage.setItem(key,JSON.stringify(queue));}
    let running=false;
    function enqueue(op){
      if(!op||op.userId!==user||op.tenantId!==tenant||!op.operationId) throw Error('Operação CAS de outra sessão');
      const q=load();
      const previous=q.find(x=>x.operationId===op.operationId);
      if(previous){
        if(JSON.stringify(previous)!==JSON.stringify(op)) throw Error('Idempotência divergente');
        return q.length;
      }
      q.push(JSON.parse(JSON.stringify(op)));save(q);return q.length;
    }
    async function flush(){
      if(running) return {busy:true};
      running=true;
      let sent=0;
      try{
        let q=load();
        while(q.length){
          const op=q[0];
          const res=await send(op);
          if(!res||res.estado!=='ok') return {sent,blocked:true,reason:res&&res.estado||'sem_confirmacao'};
          const latest=load();
          if(!latest.length||latest[0].operationId!==op.operationId) throw Error('Fila alterada durante o envio');
          latest.shift();save(latest);sent++;
          q=latest;
        }
        return {sent,blocked:false};
      }finally{running=false;}
    }
    return Object.freeze({enqueue,flush,pending:()=>load().map(x=>JSON.parse(JSON.stringify(x)))});
  }
  return Object.freeze({create});
});