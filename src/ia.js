/* Assistente de preenchimento.

   O que este arquivo NÃO faz, de propósito: não fala com nenhuma IA. Ele fala
   com a Edge Function do Supabase (nuvem/funcoes/assistente), onde a chave
   mora. Trocar Groq por outro provedor não toca em uma linha daqui.

   Regra de comportamento: nenhuma tela pode esperar por IA. Toda chamada tem
   prazo, toda falha é silenciosa, e o formulário continua funcionando
   exatamente como funcionava antes de existir assistente. */
(function (global) {
  'use strict';

  const Nuvem = global.IADNuvem;
  const PRAZO = 12000;
  const PRAZO_REUNIAO = 60000;

  function disponivel() {
    return !!(Nuvem && Nuvem.conectado());
  }

  /* Uma extração. Resolve com {campos, frases} ou null — nunca rejeita. */
  function extrair(tipo, texto, contexto) {
    if (!disponivel()) return Promise.resolve(null);
    const t = String(texto || '').trim();
    if (t.length < 12) return Promise.resolve(null);

    const pedido = Nuvem.chamarFuncao('assistente', {
      tipo: tipo, texto: t, contexto: contexto || {}
    });

    const prazo = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, PRAZO);
    });

    return Promise.race([pedido, prazo]).then(function (r) {
      if (!r || r.erro || !r.campos) return null;
      return { campos: r.campos, frases: r.frases || {} };
    }).catch(function () { return null; });
  }

  /* Uma reunião inteira. Devolve {evidencias:[], contatos:[]} ou null.
     Prazo maior porque aqui o modelo lê uma transcrição, não uma frase. */
  function analisarReuniao(texto, contexto) {
    if (!disponivel()) return Promise.resolve(null);
    const t = String(texto || '').trim();
    if (t.length < 60) return Promise.resolve(null);

    const pedido = Nuvem.chamarFuncao('assistente', {
      tipo: 'reuniao', texto: t, contexto: contexto || {}
    });
    const prazo = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, PRAZO_REUNIAO);
    });

    return Promise.race([pedido, prazo]).then(function (r) {
      if (!r || r.erro || !Array.isArray(r.evidencias)) return null;
      return { evidencias: apenasConhecidas(r.evidencias), contatos: r.contatos || [] };
    }).catch(function () { return null; });
  }

  /* A função no servidor já descarta dimensão fora das oito. Aqui é descartado
     de novo, de propósito: quem grava no banco é este lado. Uma dimensão
     desconhecida viraria uma chave nova em op.dims — um número no painel do
     gestor que o engine não sabe somar nem explicar. */
  function apenasConhecidas(lista) {
    const P = global.IADPlaybook;
    const dimensoes = P.DIMENSOES.map(function (d) { return d.id; });
    const forcas = P.FORCAS.map(function (f) { return f.id; });
    return lista.filter(function (ev) {
      return ev && ev.titulo && dimensoes.indexOf(ev.dimensao) !== -1;
    }).map(function (ev) {
      if (forcas.indexOf(ev.forca) === -1) ev.forca = 'relato';
      return ev;
    });
  }

  /* Transcrição do Meet vem como .txt ou legenda (.vtt/.srt). Anotação vem
     como .md. Nada disso precisa de biblioteca: é texto. PDF e .docx são
     binários e ficam de fora — o app não carrega dependência para abri-los. */
  const EXTENSOES = ['.txt', '.md', '.vtt', '.srt', '.csv', '.json', '.log'];

  function ehTexto(arquivo) {
    if (!arquivo) return false;
    if (/^text\//.test(arquivo.type || '')) return true;
    const nome = String(arquivo.name || '').toLowerCase();
    return EXTENSOES.some(function (e) { return nome.slice(-e.length) === e; });
  }

  /* Legenda tem uma linha de tempo a cada fala. Sem limpar, metade do que a
     IA lê é "00:04:12.480 --> 00:04:15.120". */
  function limparLegenda(texto) {
    return texto
      .replace(/^WEBVTT.*$/gm, '')
      .replace(/^\d+\s*$/gm, '')
      .replace(/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->.*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function lerTexto(arquivo) {
    return new Promise(function (resolve, reject) {
      if (!ehTexto(arquivo)) {
        reject(new Error('Só consigo ler texto: .txt, .md, .vtt, .srt ou .csv. Para PDF ou Word, copie o conteúdo e cole na caixa.'));
        return;
      }
      const leitor = new FileReader();
      leitor.onload = function () { resolve(limparLegenda(String(leitor.result || ''))); };
      leitor.onerror = function () { reject(new Error('Não consegui ler este arquivo.')); };
      leitor.readAsText(arquivo);
    });
  }

  /* Sugestão enquanto se digita: só o último pedido vale. Sem isto, uma
     resposta lenta chega depois de uma rápida e sobrescreve o palpite novo
     com o antigo — o campo "muda sozinho" na frente da pessoa. */
  function fila() {
    let sequencia = 0;
    return {
      pedir: function (tipo, texto, contexto) {
        const meu = ++sequencia;
        return extrair(tipo, texto, contexto).then(function (r) {
          return meu === sequencia ? r : null;
        });
      }
    };
  }

  /* Espera a pessoa parar de digitar antes de gastar uma chamada. */
  function aoParar(elemento, ms, fn) {
    let t = null;
    elemento.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(fn, ms || 900);
    });
  }

  /* Contexto que o servidor precisa para escolher entre opções reais em vez
     de inventar. Só listas curtas, só do tenant de quem está usando. */
  function contextoDaConta(contaId) {
    const Store = global.IADStore;
    const ctx = { hoje: Store.hoje(), segmentos: Store.nomesDoCatalogo('segmentos') };
    if (contaId) {
      ctx.contatos = Store.contatosDaConta(contaId).map(function (c) { return c.nome; });
    }
    return ctx;
  }

  function contextoDaOportunidade(op) {
    return contextoDaConta(op ? op.contaId : null);
  }

  global.IADIA = {
    disponivel: disponivel,
    extrair: extrair,
    analisarReuniao: analisarReuniao,
    lerTexto: lerTexto,
    ehTexto: ehTexto,
    fila: fila,
    aoParar: aoParar,
    contextoDaConta: contextoDaConta,
    contextoDaOportunidade: contextoDaOportunidade
  };
})(window);
