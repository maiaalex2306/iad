/* Arquivos em IndexedDB: não cabem no localStorage, que guarda o resto.
   Metadados e conteúdo ficam separados para listar sem carregar os blobs. */
(function (global) {
  'use strict';

  const BANCO = 'iad-crm-arquivos';
  const VERSAO = 1;
  const META = 'meta';
  const DADOS = 'dados';

  let bancoAberto = null;

  function abrir() {
    if (bancoAberto) return Promise.resolve(bancoAberto);
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) return reject(new Error('Este navegador não guarda anexos.'));
      const req = indexedDB.open(BANCO, VERSAO);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(META)) {
          const loja = db.createObjectStore(META, { keyPath: 'id' });
          loja.createIndex('oportunidadeId', 'oportunidadeId', { unique: false });
        }
        if (!db.objectStoreNames.contains(DADOS)) db.createObjectStore(DADOS, { keyPath: 'id' });
      };
      req.onsuccess = function () { bancoAberto = req.result; resolve(bancoAberto); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function transacao(db, lojas, modo) {
    return db.transaction(lojas, modo);
  }

  function promessa(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  const LIMITE_BYTES = 25 * 1024 * 1024;

  function salvar(arquivo, meta) {
    return abrir().then(function (db) {
      if (arquivo.size > LIMITE_BYTES) {
        throw new Error('Arquivo maior que 25 MB. Guarde-o fora do app e anexe apenas o resumo.');
      }
      const id = global.IADStore.uid('arq');
      const registro = Object.assign({
        id: id, nome: arquivo.name, mime: arquivo.type || 'application/octet-stream',
        tamanho: arquivo.size, data: global.IADStore.hoje(),
        oportunidadeId: null, contaId: null, categoria: 'Outro', enviadoPor: 'nos'
      }, meta);
      const tx = transacao(db, [META, DADOS], 'readwrite');
      tx.objectStore(META).put(registro);
      tx.objectStore(DADOS).put({ id: id, blob: arquivo });
      return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { resolve(registro); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function listar(oportunidadeId) {
    return abrir().then(function (db) {
      const loja = transacao(db, [META], 'readonly').objectStore(META);
      return promessa(loja.getAll()).then(function (todos) {
        const lista = oportunidadeId
          ? todos.filter(function (a) { return a.oportunidadeId === oportunidadeId; })
          : todos;
        return lista.sort(function (a, b) { return b.data.localeCompare(a.data); });
      });
    });
  }

  function abrirArquivo(id) {
    return abrir().then(function (db) {
      const loja = transacao(db, [DADOS], 'readonly').objectStore(DADOS);
      return promessa(loja.get(id));
    }).then(function (registro) {
      if (!registro) throw new Error('Anexo não encontrado.');
      const url = URL.createObjectURL(registro.blob);
      global.open(url, '_blank');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    });
  }

  function excluir(id) {
    return abrir().then(function (db) {
      const tx = transacao(db, [META, DADOS], 'readwrite');
      tx.objectStore(META).delete(id);
      tx.objectStore(DADOS).delete(id);
      return new Promise(function (resolve, reject) {
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function uso() {
    return listar().then(function (todos) {
      return {
        quantidade: todos.length,
        bytes: todos.reduce(function (s, a) { return s + (a.tamanho || 0); }, 0)
      };
    });
  }

  function disponivel() { return !!global.indexedDB; }

  global.IADArquivos = { salvar, listar, abrir: abrirArquivo, excluir, uso, disponivel, LIMITE_BYTES };
})(window);
