/* Arquivos em IndexedDB: não cabem no localStorage, que guarda o resto.
   Metadados e conteúdo ficam separados para listar sem carregar os blobs. */
(function (global) {
  'use strict';

  const BANCO = 'iad-crm-arquivos';
  const VERSAO = 2;
  const META = 'meta';
  const DADOS = 'dados';

  let bancoAberto = null;
  let aberturaEmAndamento = null;

  function abrir() {
    if (bancoAberto) return Promise.resolve(bancoAberto);
    /* PERF-11H: chamadas simultâneas de listar/uso/salvar não podem abrir
       conexões paralelas. A anterior, rejeitada em onblocked, podia abrir
       tardiamente e ficar órfã; a próxima migração travava outra vez. */
    if (aberturaEmAndamento) return aberturaEmAndamento;
    const tentativa = new Promise(function (resolve, reject) {
      if (!global.indexedDB) return reject(new Error('Este navegador não guarda anexos.'));
      const req = indexedDB.open(BANCO, VERSAO);
      let bloqueado = false;
      req.onupgradeneeded = function () {
        const db = req.result;
        const loja = db.objectStoreNames.contains(META)
          ? req.transaction.objectStore(META)
          : db.createObjectStore(META, { keyPath: 'id' });
        ['oportunidadeId', 'contaId', 'tarefaId'].forEach(function (campo) {
          if (!loja.indexNames.contains(campo))
            loja.createIndex(campo, campo, { unique: false });
        });
        if (!db.objectStoreNames.contains(DADOS)) db.createObjectStore(DADOS, { keyPath: 'id' });
      };
      req.onsuccess = function () {
        const db = req.result;
        /* onblocked já avisou/rejeitou a chamada. Se a aba antiga fechou
           mais tarde, NÃO reter uma conexão de uma tentativa abandonada. */
        if (bloqueado) { db.close(); return; }
        bancoAberto = db;
        db.onversionchange = function () {
          /* Fechar exatamente ESTA conexão, mesmo que outra já esteja ativa. */
          db.close();
          if (bancoAberto === db) bancoAberto = null;
        };
        resolve(db);
      };
      req.onblocked = function () {
        bloqueado = true;
        reject(new Error('Feche outras abas do IaD CRM para atualizar os índices de anexos.'));
      };
      req.onerror = function () { reject(req.error); };
    });
    aberturaEmAndamento = tentativa;
    /* finally não consome o erro. O chamador ainda recebe a rejeição original
       e uma nova tentativa poderá começar depois de fechar outras abas. */
    return tentativa.finally(function () {
      if (aberturaEmAndamento === tentativa) aberturaEmAndamento = null;
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
        /* `tarefaId` faltava, e a falta tinha cara de perda: quem anexava pelo
           formulário de Editar tarefa via o arquivo sumir. Ele não sumia — ia
           para a aba Arquivos do negócio, que é onde documento mora. Só que
           nada ligava o arquivo à tarefa que o trouxe, então o formulário não
           tinha como mostrar de volta o que você acabou de pôr. */
        oportunidadeId: null, contaId: null, tarefaId: null, categoria: 'Outro', enviadoPor: 'nos'
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

  /* Aceita o id de uma oportunidade (como sempre aceitou) ou um filtro
     {contaId} / {oportunidadeId}. O registro sempre teve contaId; só o filtro
     não sabia usá-lo, e por isso documento de empresa não tinha onde morar. */
  function listar(filtro) {
    const por = (typeof filtro === 'string' || filtro == null)
      ? { oportunidadeId: filtro || null }
      : filtro;
    return abrir().then(function (db) {
      const loja = transacao(db, [META], 'readonly').objectStore(META);
      const chave = ['oportunidadeId', 'contaId', 'tarefaId'].find(function (k) {
        return por && por[k];
      });
      const leitura = chave && loja.indexNames.contains(chave)
        ? loja.index(chave).getAll(por[chave]) : loja.getAll();
      return promessa(leitura).then(function (todos) {
        const lista = todos.filter(function (a) {
          if (por.oportunidadeId && a.oportunidadeId !== por.oportunidadeId) return false;
          if (por.contaId && a.contaId !== por.contaId) return false;
          if (por.tarefaId && a.tarefaId !== por.tarefaId) return false;
          return true;
        });
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

  /* Os anexos de uma negociação passam para outra. Existe por causa do juntar
     negociações: os arquivos moram aqui, no IndexedDB, e não no estado que o
     store manipula — sem esta passagem eles ficariam apontando para um id que
     não existe mais e sumiriam da tela sem nunca terem sido apagados, que é a
     pior forma de perder um documento. */
  function repontar(deOpId, paraOpId) {
    if (!deOpId || !paraOpId || deOpId === paraOpId) return Promise.resolve(0);
    return abrir().then(function (db) {
      const loja = transacao(db, [META], 'readonly').objectStore(META);
      return promessa(loja.index('oportunidadeId').getAll(deOpId));
    }).then(function (todos) {
      const meus = (todos || []).filter(function (a) { return a.oportunidadeId === deOpId; });
      if (!meus.length) return 0;
      return abrir().then(function (db) {
        const tx = transacao(db, [META], 'readwrite');
        const loja = tx.objectStore(META);
        meus.forEach(function (a) { a.oportunidadeId = paraOpId; loja.put(a); });
        return new Promise(function (resolve, reject) {
          tx.oncomplete = function () { resolve(meus.length); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
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

  global.IADArquivos = { salvar, listar, abrir: abrirArquivo, excluir, repontar, uso, disponivel, LIMITE_BYTES };
})(window);
