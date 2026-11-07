/* PERF-04 P5d: ponte de eventos e invalidação conservadora.
   Sem cache persistente e sem interferir no motor original. */
(function (global) {
 'use strict';
 function criar(store, contexto) {
   if (!store || typeof store.inscreverMudancas !== 'function' ||
       typeof contexto !== 'function') throw new Error('P5d: dependências ausentes');
   let escopo = null, ultimaRevisao = -1, dirty = new Set(), full = true;
   let ativo = true;
   function assinatura() {
     const x = contexto();
     if (!x || !x.usuarioId || !x.tenantId || !Number.isSafeInteger(x.revisao))
       return null;
     return JSON.stringify([x.usuarioId,x.tenantId,x.papel||'',
       x.filtroTenant||'',x.filtroUsuario||'']);
   }
   const desinscrever = store.inscreverMudancas(function (e) {
     if (!ativo) return;
     if (!e || !Number.isSafeInteger(e.revisao) ||
         e.revisao !== ultimaRevisao + 1 || e.tipo === 'full' || !e.id) {
       full = true; dirty.clear();
     } else if (!full) {
       dirty.add(String(e.id));
     }
     if (e && Number.isSafeInteger(e.revisao)) ultimaRevisao = e.revisao;
   });
   function consumir() {
     if (!ativo) throw new Error('P5d: revogado');
     const atual = assinatura(), rev = store.revisao();
     if (!atual || atual !== escopo || rev !== ultimaRevisao) {
       full = true; dirty.clear(); escopo = atual; ultimaRevisao = rev;
     }
     const r = { completo: full, ids: Array.from(dirty), revisao: rev };
     full = false; dirty.clear();
     return r;
   }
   function revogar() { if(!ativo)return;ativo=false;desinscrever();dirty.clear();full=true; }
   return { consumir: consumir, revogar: revogar };
 }
 global.IADP5dEventos = { criar: criar };
})(window);
