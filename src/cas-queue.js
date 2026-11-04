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
  /* P0 CAS: uma trava por storage e identidade, compartilhada por todas
     as instancias criadas na mesma aba. Sem isso duas chamadas a create()
     podem enviar o mesmo operationId em paralelo e disputar o ACK local. */
  const voosPorStorage = new WeakMap();
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
    /* ACK duravel antes de remover a operacao original: se cair a aba
       durante a reconciliacao, a proxima sessao recupera o recibo. */
    const receiptKey=key+':ack-v1';
    function receipts(){
      const raw=storage.getItem(receiptKey);
      if(!raw)return [];
      const found=JSON.parse(raw);
      if(!Array.isArray(found))throw Error('Recibos CAS invalidos; nao sobrescrever');
      for(const a of found) if(!a||!a.operation||a.operation.userId!==user||
        a.operation.tenantId!==tenant||!a.operation.operationId)
        throw Error('Recibos CAS de outra sessao');
      return found;
    }
    function persistReceipt(op,revision){
      const a=receipts();
      const found=a.find(x=>x.operation.operationId===op.operationId);
      if(found){
        if(JSON.stringify(found.operation)!==JSON.stringify(op))
          throw Error('Recibo CAS divergente');
        return;
      }
      a.push({operation:JSON.parse(JSON.stringify(op)),revisaoAtual:revision});
      storage.setItem(receiptKey,JSON.stringify(a));
    }
    function confirmReceipt(id){
      const a=receipts();
      const next=a.filter(x=>x.operation.operationId!==id);
      if(next.length!==a.length)storage.setItem(receiptKey,JSON.stringify(next));
      return next.length;
    }
    function voos() {
      let mapa=voosPorStorage.get(storage);
      if(!mapa){mapa=new Map();voosPorStorage.set(storage,mapa);}
      return mapa;
    }
    function enqueue(op){
      if(!op||op.userId!==user||op.tenantId!==tenant||!op.operationId) throw Error('Operação CAS de outra sessão');
      const q=load();
      const previous=q.find(x=>x.operationId===op.operationId)||
        receipts().find(x=>x.operation.operationId===op.operationId)?.operation;
      if(previous){
        if(JSON.stringify(previous)!==JSON.stringify(op)) throw Error('Idempotência divergente');
        return q.length;
      }
      q.push(JSON.parse(JSON.stringify(op)));save(q);return q.length;
    }
    function flush(){
      /* Reentrada compartilha o ACK da tentativa corrente. Não declarar
         busy como conflito nem criar um segundo envio para a mesma fila. */
      const mapa=voos();
      if(mapa.has(key)) return mapa.get(key);
      const tentativa=(async function(){
      let sent=0;
      const acks=[];
      try{
        let q=load();
        while(q.length){
          const op=q[0];
          const prior=receipts().find(x=>x.operation.operationId===op.operationId);
          const res=prior?{estado:'ok',revisao_atual:prior.revisaoAtual}:await send(op);
          if(!res||res.estado!=='ok') return {sent,blocked:true,reason:res&&res.estado||'sem_confirmacao',acks};
          const latest=load();
          if(!latest.length||latest[0].operationId!==op.operationId) throw Error('Fila alterada durante o envio');
          persistReceipt(op,res.revisao_atual);
          latest.shift();save(latest);sent++;acks.push({operationId:op.operationId,revisaoAtual:res.revisao_atual});
          q=latest;
        }
        return {sent,blocked:false,acks};
      } finally { /* limpeza de inflight no encerramento da promessa */ }
      })();
      const compartilhada=tentativa.finally(function(){
        if(mapa.get(key)===compartilhada) mapa.delete(key);
      });
      mapa.set(key,compartilhada);
      return compartilhada;
    }
    return Object.freeze({enqueue,flush,
      pending:()=>load().map(x=>JSON.parse(JSON.stringify(x))),
      pendingAcks:()=>receipts().map(x=>JSON.parse(JSON.stringify(x))),
      confirmAck:confirmReceipt});
  }
  return Object.freeze({create});
});