/* E-mail dentro da negociação: buscar, casar e agrupar por conversa.
   ------------------------------------------------------------------
   O irmão do src/whatsapp.js, e de propósito: o problema é o mesmo — a
   conversa acontece fora do CRM e morre na caixa de uma pessoa — e a resposta
   é a mesma. As mensagens moram no servidor, o app lê o que precisa, e o
   casamento com contato, empresa e negociação acontece aqui, na hora.

   A diferença boa: telefone chega escrito de quatro jeitos e obrigou o
   WhatsApp a três camadas de casamento com margem de erro. Endereço de e-mail
   é exato. `anamiranda@suzano.com.br` bate ou não bate, e isso simplifica tudo
   o que vem depois.

   A diferença ruim: e-mail tem domínio, e domínio é uma tentação. Casar
   `@suzano.com.br` com a conta Suzano funciona; casar `@gmail.com` com a
   primeira conta que tiver um contato do Gmail junta pessoas que não têm nada
   a ver umas com as outras. Por isso os provedores gratuitos estão fora dessa
   camada, escritos numa lista, embaixo. */
(function (global) {
  'use strict';

  const N = global.IADNuvem;
  const Store = global.IADStore;

  let mensagens = null;
  let buscando = null;
  let falha = '';
  let caixas = null;

  /* Domínio de provedor gratuito nunca identifica empresa. É a lista que
     impede o app de decidir que todo mundo com Gmail trabalha no mesmo lugar —
     e é o erro que, uma vez cometido, põe o contato de uma conta no grupo
     comprador de outra e não se desfaz sozinho. */
  const GRATUITOS = ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.br',
    'outlook.com', 'outlook.com.br', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.com.br',
    'icloud.com', 'me.com', 'uol.com.br', 'bol.com.br', 'terra.com.br', 'ig.com.br',
    'globo.com', 'r7.com', 'zipmail.com.br', 'proton.me', 'protonmail.com'];

  function limpo(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

  /* "ANA LUIZA <ANAMIRANDA@suzano.com.br>" → "anamiranda@suzano.com.br".
     O cabeçalho vem dos dois jeitos conforme o cliente de e-mail, e comparar
     sem normalizar é o mesmo que não comparar. */
  function endereco(v) {
    const t = String(v == null ? '' : v);
    const m = /<([^>]+)>/.exec(t);
    return limpo(m ? m[1] : t);
  }

  function dominio(v) {
    const e = endereco(v);
    const i = e.lastIndexOf('@');
    return i === -1 ? '' : e.slice(i + 1);
  }

  function ehGratuito(d) { return GRATUITOS.indexOf(String(d || '').toLowerCase()) !== -1; }

  /* ---------------- buscar ----------------
     Uma vez por sessão, e de novo quando alguém pedir. A tela desenha antes de
     a resposta chegar: e-mail é bom de ter, não é pré-requisito para o app
     funcionar. */
  function disponivel() { return !!(N && N.conectado && N.conectado()); }

  function carregar(forcar) {
    if (!disponivel()) return Promise.resolve([]);
    if (mensagens && !forcar) return Promise.resolve(mensagens);
    if (buscando && !forcar) return buscando;

    buscando = N.emailsDaNuvem().then(function (r) {
      mensagens = Array.isArray(r) ? r : [];
      falha = '';
      buscando = null;
      return mensagens;
    }).catch(function (e) {
      falha = (e && e.message) || 'Não consegui buscar os e-mails.';
      /* Tabela que ainda não existe no banco é o caso mais provável, e o erro
         cru manda procurar no lugar errado: parece defeito do app e é banco
         atrasado. */
      if (/relation|does not exist|schema cache/i.test(falha)) {
        falha = 'O banco ainda não tem a tabela de e-mails. Rode nuvem/correcao-18-emails.sql ' +
          'no SQL Editor do Supabase.';
      }
      mensagens = mensagens || [];
      buscando = null;
      return mensagens;
    });
    return buscando;
  }

  function carregadas() { return mensagens !== null; }
  function erro() { return falha; }
  function todas() { return mensagens || []; }
  function esquecer() { mensagens = null; buscando = null; falha = ''; caixas = null; }

  function carregarCaixas(forcar) {
    if (!disponivel()) return Promise.resolve([]);
    if (caixas && !forcar) return Promise.resolve(caixas);
    return N.caixasDeEmail().then(function (r) {
      caixas = Array.isArray(r) ? r : [];
      return caixas;
    }).catch(function () { caixas = caixas || []; return caixas; });
  }

  function minhasCaixas() { return caixas || []; }

  /* ---------------- o casamento ----------------

     Em camadas, da mais forte para a mais fraca, e cada uma diz o que sabe:

       1. gravado    alguém já casou esta conversa. Vale para a thread inteira.
       2. endereço   bate com o e-mail de um contato. É exato, e é o caso comum.
       3. domínio    não é gratuito e bate com o domínio de algum contato de uma
                     conta. A EMPRESA está identificada; a PESSOA não. Vira fila
                     de casar, com botão de criar o contato — que é como o
                     comitê de compra que ninguém apresentou aparece.

     Nunca há camada 4. Mensagem que não casou fica sem dono e visível, o que é
     honesto; adivinhar seria pôr conversa na carteira errada. */
  function contatoDoEndereco(e) {
    const alvo = endereco(e);
    if (!alvo) return null;
    return (Store.dados().contatos || []).filter(function (c) {
      return limpo(c.email) === alvo || limpo(c.emailPessoal) === alvo;
    })[0] || null;
  }

  function contaDoDominio(d) {
    if (!d || ehGratuito(d)) return null;
    const contatos = Store.dados().contatos || [];
    const achado = contatos.filter(function (c) {
      return dominio(c.email) === d || dominio(c.emailPessoal) === d;
    })[0];
    if (achado) return Store.conta(achado.contaId) || null;

    /* O site da empresa também identifica o domínio, e é o que faz a PRIMEIRA
       mensagem de uma conta nova casar — antes de existir qualquer contato com
       e-mail cadastrado. */
    return (Store.dados().contas || []).filter(function (c) {
      const dc = String(c.site || c.dominio || '').toLowerCase()
        .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
      return dc && dc === d;
    })[0] || null;
  }

  /* A negociação que recebe a conversa. Uma aberta é sem dúvida. Mais de uma é
     ambiguidade, e aí a mais madura ganha — é onde a evidência está e onde
     quem lê vai procurar. Zero aberta devolve nada, e a mensagem espera. */
  function negociacaoDaConta(contaId) {
    if (!contaId) return null;
    const E = global.IADEngine;
    const abertas = (Store.dados().oportunidades || []).filter(function (o) {
      return o.contaId === contaId && !o.desfecho;
    });
    if (!abertas.length) return null;
    if (abertas.length === 1) return abertas[0];
    return abertas.slice().sort(function (a, b) { return E.iad(b) - E.iad(a); })[0];
  }

  /* O outro lado da conversa: numa mensagem recebida é quem mandou; numa
     enviada é para quem foi. Sem isso, toda mensagem que o vendedor manda
     casaria com ele mesmo. */
  function doOutroLado(m) {
    return m.direcao === 'saida' ? endereco(m.para) : endereco(m.de);
  }

  function casar(m) {
    const gravadoContato = m.contato_id ? Store.contato(m.contato_id) : null;
    const gravadaOp = m.oportunidade_id ? Store.oportunidade(m.oportunidade_id) : null;
    if (gravadoContato || gravadaOp) {
      const conta = gravadoContato ? Store.conta(gravadoContato.contaId)
        : (gravadaOp ? Store.conta(gravadaOp.contaId) : null);
      return { contato: gravadoContato, conta: conta,
               op: (gravadaOp && !gravadaOp.desfecho) ? gravadaOp : negociacaoDaConta(conta && conta.id),
               como: 'gravado' };
    }

    const alvo = doOutroLado(m);
    const contato = contatoDoEndereco(alvo);
    if (contato) {
      const conta = Store.conta(contato.contaId);
      return { contato: contato, conta: conta, op: negociacaoDaConta(contato.contaId),
               como: 'endereco' };
    }

    const conta = contaDoDominio(dominio(alvo));
    if (conta) {
      return { contato: null, conta: conta, op: negociacaoDaConta(conta.id), como: 'dominio' };
    }

    return { contato: null, conta: null, op: null, como: '' };
  }

  /* ---------------- conversas ----------------

     Agrupadas por thread, que é o que o cliente de e-mail chama de "conversa".
     Quando a mensagem não traz thread — acontece com quem escreve do zero —, o
     próprio id serve: uma conversa de uma mensagem só é melhor do que todas as
     órfãs empilhadas numa conversa falsa. */
  function chaveDaConversa(m) { return String(m.thread || m.id || ''); }

  function conversas() {
    const por = {};
    todas().forEach(function (m) {
      const k = chaveDaConversa(m);
      if (!k) return;
      if (!por[k]) por[k] = { chave: k, mensagens: [], naoLidas: 0, ultima: null, assunto: '' };
      const c = por[k];
      c.mensagens.push(m);
      if (m.direcao === 'entrada' && !m.lida) c.naoLidas++;
      if (!c.ultima || String(m.enviada_em) > String(c.ultima.enviada_em)) c.ultima = m;
    });

    return Object.keys(por).map(function (k) {
      const c = por[k];
      c.mensagens.sort(function (a, b) {
        return String(a.enviada_em).localeCompare(String(b.enviada_em));
      });
      c.assunto = (c.mensagens[0] && c.mensagens[0].assunto) || '(sem assunto)';
      /* O casamento é da conversa, e quem manda é a mensagem recebida: é dela
         que sai o endereço do cliente. Numa conversa só de saída, a primeira
         serve. */
      const base = c.mensagens.filter(function (m) { return m.direcao === 'entrada'; })[0] || c.mensagens[0];
      const dono = casar(base);
      c.contato = dono.contato;
      c.conta = dono.conta;
      c.op = dono.op;
      c.como = dono.como;
      c.semDono = !dono.conta;
      c.deQuem = doOutroLado(base);
      c.deNome = base.de_nome || '';
      return c;
    }).sort(function (a, b) {
      return String((b.ultima || {}).enviada_em || '')
        .localeCompare(String((a.ultima || {}).enviada_em || ''));
    });
  }

  function conversasDaOportunidade(opId) {
    return conversas().filter(function (c) { return c.op && c.op.id === opId; });
  }

  /* As que o app reconheceu a empresa mas não a pessoa, e as que não casaram
     com nada. É a fila que faz o cadastro crescer sozinho. */
  function paraCasar() {
    return conversas().filter(function (c) { return !c.contato; });
  }

  function naoLidasDaOp(opId) {
    return conversasDaOportunidade(opId).reduce(function (s, c) { return s + c.naoLidas; }, 0);
  }

  function totalNaoLidas() {
    return conversas().reduce(function (s, c) { return s + c.naoLidas; }, 0);
  }

  function naFila() {
    return todas().filter(function (m) { return m.estado === 'fila' || m.estado === 'erro'; });
  }

  global.IADEmail = {
    carregar: carregar, carregadas: carregadas, erro: erro, esquecer: esquecer,
    disponivel: disponivel, todas: todas,
    carregarCaixas: carregarCaixas, minhasCaixas: minhasCaixas,
    conversas: conversas, conversasDaOportunidade: conversasDaOportunidade,
    paraCasar: paraCasar, casar: casar, naFila: naFila,
    naoLidasDaOp: naoLidasDaOp, totalNaoLidas: totalNaoLidas,
    endereco: endereco, dominio: dominio, ehGratuito: ehGratuito,
    contatoDoEndereco: contatoDoEndereco, contaDoDominio: contaDoDominio,
    negociacaoDaConta: negociacaoDaConta, GRATUITOS: GRATUITOS
  };
})(window);
