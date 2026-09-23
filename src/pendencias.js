/* A caixa de saída: o que ainda não chegou ao servidor.
   =====================================================
   Desde a v180 o servidor é a única verdade e a memória é a única cópia
   local — de propósito, porque foi o `localStorage` mandando que produziu
   carteira de uma empresa no aparelho de outra.

   Só que "a memória é a única cópia" tem um preço que ninguém tinha pago
   ainda: quando o envio falha, o que foi feito existe SÓ na aba aberta. Basta
   fechar, recarregar, o telefone matar a aba para economizar memória — e
   dezessete oportunidades importadas do Linked Helper somem sem nunca terem
   existido em lugar nenhum. Foi exatamente isso que aconteceu.

   Isto aqui não desfaz a regra: não é uma segunda verdade que compete com o
   servidor, e nada lê daqui para montar a tela. É uma FILA DE ENVIO — o que
   já foi feito e ainda não chegou lá. Fica gravada antes de cada tentativa e
   só é apagada quando o servidor confirma.

   Fica em IndexedDB e não em localStorage por dois motivos: a carteira inteira
   não cabe nos 5 MB do localStorage, e é onde os anexos já moram.

   Guarda o dono junto. Fila de um login não é resgatada por outro: seria o
   mesmo vazamento entre empresas que a v180 existe para impedir. */
(function (global) {
  'use strict';

  const BANCO = 'iad-crm-pendencias';
  const VERSAO = 1;
  const LOJA = 'fila';
  const CHAVE = 'unica';

  let bancoAberto = null;

  function disponivel() { return !!global.indexedDB; }

  function abrir() {
    if (bancoAberto) return Promise.resolve(bancoAberto);
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) return reject(new Error('Este navegador não guarda a fila de envio.'));
      const req = indexedDB.open(BANCO, VERSAO);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: 'id' });
      };
      req.onsuccess = function () { bancoAberto = req.result; resolve(bancoAberto); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function promessa(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /* Quanta coisa tem aqui dentro, em linguagem de gente. É o que a faixa
     mostra: "17 oportunidades" diz muito mais do que "1 pendência". */
  const CONTADAS = [
    ['contas', 'empresa', 'empresas'],
    ['contatos', 'contato', 'contatos'],
    ['oportunidades', 'oportunidade', 'oportunidades'],
    ['tarefas', 'tarefa', 'tarefas'],
    ['notas', 'nota', 'notas']
  ];

  function resumir(estado) {
    if (!estado) return '';
    const partes = [];
    CONTADAS.forEach(function (c) {
      const n = (estado[c[0]] || []).length;
      if (n) partes.push(n + ' ' + (n === 1 ? c[1] : c[2]));
    });
    return partes.join(', ');
  }

  /* Grava a fila. Nunca rejeita: se o IndexedDB falhar, o envio tem de
     continuar mesmo assim — uma fila que não pôde ser gravada é pior do que
     antes, mas travar o envio por causa dela seria pior ainda. */
  function guardar(estado, donoId) {
    if (!disponivel() || !estado) return Promise.resolve(false);
    return abrir().then(function (db) {
      const tx = db.transaction([LOJA], 'readwrite');
      tx.objectStore(LOJA).put({
        id: CHAVE, quando: new Date().toISOString(),
        donoId: donoId || '', versao: (global.IADVersao || {}).numero || '',
        estado: estado
      });
      return new Promise(function (resolve) {
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      });
    }).catch(function () { return false; });
  }

  /* Devolve a fila deste dono, ou null. Fila de outro login não volta: é
     carteira de outra pessoa, e ressuscitá-la aqui seria o vazamento entre
     empresas de novo. */
  function ler(donoId) {
    if (!disponivel()) return Promise.resolve(null);
    return abrir().then(function (db) {
      return promessa(db.transaction([LOJA], 'readonly').objectStore(LOJA).get(CHAVE));
    }).then(function (r) {
      if (!r || !r.estado) return null;
      if (donoId && r.donoId && r.donoId !== donoId) return null;
      return r;
    }).catch(function () { return null; });
  }

  function limpar() {
    if (!disponivel()) return Promise.resolve();
    return abrir().then(function (db) {
      const tx = db.transaction([LOJA], 'readwrite');
      tx.objectStore(LOJA).delete(CHAVE);
      return new Promise(function (resolve) {
        tx.oncomplete = resolve; tx.onerror = resolve;
      });
    }).catch(function () {});
  }

  global.IADPendencias = { disponivel, guardar, ler, limpar, resumir };
})(window);
