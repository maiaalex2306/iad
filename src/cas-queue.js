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
    /* P0: só reconhecer uma edição como satisfeita quando o estado
       remoto comprova TODOS os campos do patch, a identidade/tenant
       coincidem e a revisão remota avançou. Nunca sobrescrever servidor. */
    function satisfazRemoto(op,remote){
      if(!op||!remote||op.table!=='oportunidades'||
        String(remote.id)!==String(op.recordId)||
        String(remote.tenant_id)!==tenant||
        !Number.isSafeInteger(Number(remote.revisao))||
        !Number.isSafeInteger(Number(op.expectedRevision))||
        Number(remote.revisao)<=Number(op.expectedRevision)||
        !op.patch||typeof op.patch!=='object'||Array.isArray(op.patch))return false;
      const keys=Object.keys(op.patch);
      if(!keys.length)return false;
      function igual(a,b){
        if(Object.is(a,b))return true;
        if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
        if(Array.isArray(a)!==Array.isArray(b))return false;
        if(Array.isArray(a))return a.length===b.length&&
          a.every(function(x,i){return igual(x,b[i]);});
        const ka=Object.keys(a),kb=Object.keys(b);
        return ka.length===kb.length&&
          ka.every(function(k){return Object.prototype.hasOwnProperty.call(b,k)&&igual(a[k],b[k]);});
      }
      return keys.every(function(k){
        return !['id','tenant_id','dono_id','revisao','criado_em','atualizado_em'].includes(k)&&
          Object.prototype.hasOwnProperty.call(remote,k)&&igual(op.patch[k],remote[k]);
      });
    }
    function reconhecerAplicada(operationId,remote){
      if(voos().has(key))throw Error('Fila CAS ocupada: aguarde a transmissão.');
      const q=load(),op=q[0];
      if(!op||op.operationId!==operationId)throw Error('Só a primeira edição pendente pode ser conciliada.');
      if(!satisfazRemoto(op,remote))throw Error('Campos divergentes: edição local preservada.');
      persistReceipt(op,Number(remote.revisao));
      const atual=load();
      if(!atual.length||atual[0].operationId!==operationId)
        throw Error('Fila CAS alterada: edição preservada.');
      atual.shift();
      save(atual);
      return {reconhecida:true,revisao:Number(remote.revisao)};
    }
    /* P0: escolha explicita do usuario por manter o servidor.
       Arquivar integralmente a edicao antes de retirar a cabeca da fila.
       Nao faz chamadas de rede nem altera o registro remoto. */
    const archiveKey=key+':resolved-v1';
    function archived(){
      const raw=storage.getItem(archiveKey);
      if(!raw)return [];
      const items=JSON.parse(raw);
      if(!Array.isArray(items)||items.some(function(item) {
        return !item||!item.operation||item.operation.userId!==user||
          item.operation.tenantId!==tenant||!item.operation.operationId;
      }))throw Error('Arquivo CAS invalido; operacoes preservadas.');
      return items;
    }
    function manterServidor(operationId,remote,expectedRemoteRevision){
      if(voos().has(key))throw Error('Fila CAS ocupada.');
      const op=load()[0];
      if(!op||op.operationId!==operationId)
        throw Error('Somente a primeira edicao pode ser resolvida.');
      if(!remote||String(remote.id)!==String(op.recordId)||
        String(remote.tenant_id)!==tenant||
        !Number.isSafeInteger(remote.revisao)||
        !Number.isSafeInteger(op.expectedRevision)||
        remote.revisao<=op.expectedRevision||
        remote.revisao!==expectedRemoteRevision||
        satisfazRemoto(op,remote))
        throw Error('Revisao remota mudou ou edicao sem conflito: fila preservada.');
      const history=archived();
      const anterior=history.find(function(x){
        return x.operation.operationId===operationId;
      });
      if(anterior) {
        /* Queda entre salvar historico e retirar a fila: retomada
           idempotente, sem perder o registro ou exigir um novo descarte. */
        if(JSON.stringify(anterior.operation)!==JSON.stringify(op)||
          anterior.revisaoRemota!==remote.revisao||
          anterior.motivo!=='usuario_optou_servidor')
          throw Error('Historico CAS divergente; fila preservada.');
      } else {
        history.push({operation:JSON.parse(JSON.stringify(op)),
          revisaoRemota:remote.revisao,motivo:'usuario_optou_servidor',
          arquivadaEm:new Date().toISOString()});
        storage.setItem(archiveKey,JSON.stringify(history));
      }
      const current=load();
      if(!current.length||current[0].operationId!==operationId)
        throw Error('Fila alterada; recuperacao interrompida.');
      current.shift();
      save(current);
      return {arquivada:true};
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
      confirmAck:confirmReceipt,
      satisfazRemoto:satisfazRemoto,
      reconhecerAplicada:reconhecerAplicada,
      manterServidor:manterServidor,
      archived:()=>archived().map(function(x){return JSON.parse(JSON.stringify(x));})});
  }
  return Object.freeze({create});
});