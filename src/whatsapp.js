/* IAD — as conversas do WhatsApp.
   ------------------------------------------------------------------
   A regra que organiza este arquivo inteiro, e que vale repetir porque é
   contraintuitiva:

   > Mensagem não é evidência. Evidência é o que o cliente decidiu, e quem diz
   > que uma mensagem virou decisão é o vendedor, não o sistema.

   "Bom dia, tudo bem?" não move decisão nenhuma. Ler tudo sozinho encheria o
   histórico de evidência inventada, gastaria leitura à toa e — o pior — faria
   o IAD subir com conversa fiada. A leitura é barata quando alguém escolhe o
   que vale a pena ler.

   Por isso aqui não tem IA, não tem nota e não tem avanço. Tem lista, tem
   casamento com quem já está no CRM, e tem um botão que transforma a conversa
   escolhida numa tarefa concluída. Daí em diante é o caminho que já existe.

   As mensagens moram só no servidor. Quem as escreve é a Edge Function
   `whatsapp`, com a chave de serviço; o app só lê, com a sessão da pessoa e o
   RLS decidindo o que ela enxerga. Não entram no localStorage nem na
   sincronização: são muitas, mudam sozinhas e não são do vendedor — são dele
   com o cliente. */
(function (global) {
  'use strict';

  const Store = global.IADStore;
  const N = global.IADNuvem;

  /* O que veio do servidor, guardado em memória para a tela não pedir de novo
     a cada clique. Nulo é "ainda não busquei", que é diferente de vazio. */
  let mensagens = null;
  let buscando = null;
  let falha = '';

  function soDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

  /* Os últimos 8 dígitos. O mesmo telefone chega escrito de quatro jeitos —
     com 55, sem 55, com o 9 na frente, com zero de operadora — e comparar os
     últimos 8 casa os quatro sem inventar regra de DDD nem de nono dígito.
     É a mesma conta que a função faz do outro lado. */
  function curto(v) {
    const d = soDigitos(v);
    return d.length > 8 ? d.slice(-8) : d;
  }

  /* O telefone como gente escreve. A Meta entrega só dígitos com o país na
     frente, e "5519991234567" na tela é número de sistema, não de pessoa. */
  function bonito(v) {
    const d = soDigitos(v);
    const sem = d.length > 11 && d.indexOf('55') === 0 ? d.slice(2) : d;
    if (sem.length === 11) return '(' + sem.slice(0, 2) + ') ' + sem.slice(2, 7) + '-' + sem.slice(7);
    if (sem.length === 10) return '(' + sem.slice(0, 2) + ') ' + sem.slice(2, 6) + '-' + sem.slice(6);
    /* Número de fora do Brasil, ou coisa que não reconheço: sai como veio, com
       o + na frente. Inventar formatação de país que não conheço é pior. */
    return d ? '+' + d : '';
  }

  function disponivel() {
    return !!(N && N.conectado && N.conectado());
  }

  /* ---------------- buscar ----------------
     Uma vez por sessão, e de novo quando alguém pedir. A tela desenha antes de
     a resposta chegar: conversa é bom de ter, não é pré-requisito para o app
     funcionar, e segurar o render por causa dela seria pior. */
  function carregar(forcar) {
    if (!disponivel()) return Promise.resolve([]);
    if (mensagens && !forcar) return Promise.resolve(mensagens);
    if (buscando && !forcar) return buscando;

    buscando = N.mensagensWhatsapp().then(function (r) {
      mensagens = Array.isArray(r) ? r : [];
      falha = '';
      buscando = null;
      return mensagens;
    }).catch(function (e) {
      falha = (e && e.message) || 'Não consegui buscar as conversas.';
      mensagens = mensagens || [];
      buscando = null;
      return mensagens;
    });
    return buscando;
  }

  function carregadas() { return mensagens !== null; }
  function erro() { return falha; }
  function todas() { return mensagens || []; }

  /* ---------------- o casamento, em três degraus ----------------
     1. O telefone bate com um contato. A conversa é dele e, por ele, da
        empresa dele.
     2. O contato está no grupo comprador de UMA negociação aberta. A conversa
        também é daquela negociação.
     3. Nada bate, ou bate com mais de um. Fica em "Sem dono", e o vendedor
        escolhe.

     ---------------- por que não basta comparar os últimos 8 ----------------

     O problema real é que o mesmo telefone chega escrito de quatro jeitos. A
     Meta sempre entrega o número internacional completo — 5519991234567 —, e o
     vendedor digitou o que quis: com 55 ou sem, com o nono dígito ou sem, com
     parênteses ou sem.

     Comparar os últimos 8 dígitos resolve os quatro de uma vez, porque o nono
     dígito entra ANTES dos 8 finais: "19 99123-4567" e "19 9123-4567" têm os
     mesmos 8 no fim. Foi por isso que escolhi essa regra.

     Só que ela sozinha é perigosa, e o perigo cresce com a carteira: dois
     números de DDDs diferentes podem terminar nos mesmos 8 dígitos. Numa base
     de trinta contatos isso praticamente não acontece; numa de três mil,
     acontece. E o estrago é o pior possível aqui — a conversa de um cliente
     aparecendo embaixo do nome de outro.

     Então a comparação é em camadas, da mais forte para a mais fraca, e a mais
     fraca só vale quando ela é a ÚNICA resposta:

       3. o número inteiro é igual, com país e tudo
       2. mesmo DDD e mesmos 8 finais — é o caso do nono dígito
       1. só os 8 finais batem — palpite, e só serve se ninguém mais bater

     Empate na camada 1 não vira escolha: vira pergunta. O app prefere dizer
     "não sei de quem é" a pendurar a conversa na pessoa errada. */

  function soDigitosDe(v) { return soDigitos(v); }

  /* Os DDDs que existem. A lista importa por um motivo que não é purismo:
     sem ela, um número americano de 11 dígitos — 1 415 555 0000 — parecia um
     celular brasileiro e ganhava um 55 na frente, virando outro número. */
  const DDDS = ('11 12 13 14 15 16 17 18 19 ' +
    '21 22 24 27 28 ' +
    '31 32 33 34 35 37 38 ' +
    '41 42 43 44 45 46 47 48 49 ' +
    '51 53 54 55 ' +
    '61 62 63 64 65 66 67 68 69 ' +
    '71 73 74 75 77 79 ' +
    '81 82 83 84 85 86 87 88 89 ' +
    '91 92 93 94 95 96 97 98 99').split(' ');

  /* Onze dígitos com DDD válido ainda não basta: celular brasileiro tem o
     nono dígito obrigatório, e ele é sempre 9. É esse detalhe que separa
     "11 9xxxx-xxxx" de um número de fora que por acaso começa com 1.

     Dez dígitos é fixo, e o primeiro do assinante vai de 2 a 5. */
  function pareceBrasileiro(d) {
    if (d.length === 11) return DDDS.indexOf(d.slice(0, 2)) !== -1 && d.charAt(2) === '9';
    if (d.length === 10) return DDDS.indexOf(d.slice(0, 2)) !== -1 && d.charAt(2) >= '2' && d.charAt(2) <= '5';
    return false;
  }

  /* Número do Brasil digitado sem o país ganha o 55 — e só ele. O que não
     parece brasileiro fica como veio: inventar país é transformar o número de
     alguém no número de outra pessoa. */
  function comPais(v) {
    const d = soDigitosDe(v);
    return pareceBrasileiro(d) ? '55' + d : d;
  }

  /* O DDD, quando dá para afirmar que é do Brasil. Vazio quer dizer "não sei",
     e não sei nunca casa com não sei. */
  function ddd(v) {
    const d = comPais(v);
    if (d.indexOf('55') !== 0) return '';
    const local = d.slice(2);
    return (local.length === 10 || local.length === 11) ? local.slice(0, 2) : '';
  }

  const CAMADA = { INTEIRO: 3, DDD: 2, FINAL: 1 };

  function forcaDoCasamento(cadastrado, recebido) {
    const a = comPais(cadastrado), b = comPais(recebido);
    if (!a || !b) return 0;
    if (a === b) return CAMADA.INTEIRO;

    const fimA = curto(a), fimB = curto(b);
    if (!fimA || fimA !== fimB) return 0;

    const dA = ddd(a), dB = ddd(b);
    if (dA && dB && dA === dB) return CAMADA.DDD;
    return CAMADA.FINAL;
  }

  /* Quem pode ser o dono deste número, e com que força. O campo WhatsApp vale
     mais que o comercial na mesma camada: um é onde a conversa acontece, o
     outro é o telefone da mesa que alguém cadastrou junto. */
  function candidatos(recebido) {
    const achados = [];
    (Store.dados().contatos || []).forEach(function (c) {
      const porZap = forcaDoCasamento(c.telefone, recebido);
      const porMesa = forcaDoCasamento(c.telefoneComercial, recebido);
      const forca = Math.max(porZap, porMesa);
      if (!forca) return;
      achados.push({ contato: c, forca: forca, campo: porZap >= porMesa ? 'whatsapp' : 'comercial' });
    });

    achados.sort(function (x, y) {
      if (y.forca !== x.forca) return y.forca - x.forca;
      if (x.campo !== y.campo) return x.campo === 'whatsapp' ? -1 : 1;
      return 0;
    });
    return achados;
  }

  function contatoDoTelefone(recebido) {
    const lista = candidatos(recebido);
    if (!lista.length) return null;

    const melhor = lista[0];
    /* Camada forte: número inteiro igual, ou mesmo DDD. Aí não há dúvida
       mesmo que outro contato apareça mais abaixo com um palpite fraco. */
    if (melhor.forca > CAMADA.FINAL) return melhor.contato;

    /* Camada fraca: só os 8 finais. Vale se for a única resposta — e se duas
       pessoas diferentes empatam aqui, o app não escolhe. Mesmo contato
       aparecendo duas vezes (WhatsApp e comercial) não é empate. */
    const empatados = lista.filter(function (x) {
      return x.forca === melhor.forca && x.contato.id !== melhor.contato.id;
    });
    return empatados.length ? null : melhor.contato;
  }

  function negociacoesDoContato(contatoId) {
    if (!contatoId) return [];
    return (Store.dados().oportunidades || []).filter(function (o) {
      return !o.desfecho && (o.stakeholders || []).indexOf(contatoId) !== -1;
    });
  }

  function casar(recebido) {
    const contato = contatoDoTelefone(recebido);
    if (!contato) {
      /* Sem dono, mas nem sempre sem pista: quando o empate foi na camada
         fraca, as pessoas que empataram vão para a tela. Escolher entre duas
         é bem mais fácil do que procurar numa lista de trezentas. */
      const quase = candidatos(recebido).map(function (x) { return x.contato; });
      return { contato: null, op: null, opcoes: [], semDono: true, parecidos: quase };
    }

    const ops = negociacoesDoContato(contato.id);
    if (ops.length === 1) {
      return { contato: contato, op: ops[0], opcoes: ops, semDono: false, parecidos: [] };
    }
    /* Zero negociações abertas: a pessoa é conhecida, o negócio não existe.
       Duas ou mais: conhecida demais para o app escolher sozinho. */
    return { contato: contato, op: null, opcoes: ops, semDono: false, parecidos: [] };
  }

  /* ---------------- as conversas ----------------
     Uma por pessoa, não uma por mensagem. É assim que se lê WhatsApp e é
     assim que o vendedor pensa: "a conversa com o Carlos", não "as 40
     mensagens do número 19991234567".

     O histórico dos 6 meses fica de fora da contagem de não lidas de
     propósito. Ele não é novidade, é passado — marcar 800 mensagens antigas
     como não lidas transformaria a tela num alarme inútil no primeiro dia. */
  function conversas() {
    const por = {};
    todas().forEach(function (m) {
      const k = m.telefone_curto || curto(m.telefone);
      if (!k) return;
      if (!por[k]) {
        por[k] = {
          chave: k, telefone: m.telefone || '', nome: '',
          mensagens: [], naoLidas: 0, ultima: null, historico: 0
        };
      }
      const c = por[k];
      c.mensagens.push(m);
      if (m.nome_exibicao && !c.nome) c.nome = m.nome_exibicao;
      if (m.origem === 'historico') c.historico++;
      else if (m.direcao === 'entrada' && !m.lida) c.naoLidas++;
      if (!c.ultima || String(m.enviada_em) > String(c.ultima.enviada_em)) c.ultima = m;
    });

    return Object.keys(por).map(function (k) {
      const c = por[k];
      c.mensagens.sort(function (a, b) {
        return String(a.enviada_em).localeCompare(String(b.enviada_em));
      });
      /* O vínculo gravado numa mensagem vale para a conversa inteira: quem
         casou uma vez casou o telefone, não aquela linha. */
      const gravado = c.mensagens.filter(function (m) { return m.contato_id; }).pop();
      /* O número INTEIRO, não a chave de 8 dígitos: é ele que permite as
         camadas fortes do casamento. A chave serve para agrupar, não para
         reconhecer. */
      const dono = casar(c.telefone || k);
      c.contato = (gravado && Store.contato(gravado.contato_id)) || dono.contato;
      const opGravada = gravado && gravado.oportunidade_id
        ? Store.oportunidade(gravado.oportunidade_id) : null;
      c.op = (opGravada && !opGravada.desfecho ? opGravada : null) || dono.op;
      c.opcoes = dono.opcoes;
      c.parecidos = c.contato ? [] : (dono.parecidos || []);
      c.semDono = !c.contato;
      return c;
    }).sort(function (a, b) {
      /* Quem escreveu por último primeiro. Cliente que acabou de falar é a
         coisa mais quente da tela. */
      return String((b.ultima || {}).enviada_em || '')
        .localeCompare(String((a.ultima || {}).enviada_em || ''));
    });
  }

  function conversa(chave) {
    return conversas().filter(function (c) { return c.chave === chave; })[0] || null;
  }

  /* Quantas mensagens novas esperam numa negociação. É o que a tarja azul do
     cartão do pipeline mostra, e o que põe o negócio no topo de Hoje. */
  function naoLidasDaOp(opId) {
    let n = 0;
    conversas().forEach(function (c) {
      if (c.op && c.op.id === opId) n += c.naoLidas;
    });
    return n;
  }

  function totalNaoLidas() {
    return conversas().reduce(function (s, c) { return s + c.naoLidas; }, 0);
  }

  /* Conversas com mensagem nova, do mais recente para o mais antigo. */
  function responderam() {
    return conversas().filter(function (c) { return c.naoLidas > 0; });
  }

  /* ---------------- escrever ----------------
     Só duas colunas o app mexe: `lida`, e o par contato/oportunidade do
     casamento. O conteúdo da mensagem ele nunca altera — o que o cliente
     escreveu é o que o cliente escreveu. */
  function marcarLidas(chave) {
    const c = conversa(chave);
    if (!c) return Promise.resolve();
    const ids = c.mensagens
      .filter(function (m) { return m.direcao === 'entrada' && !m.lida && m.origem !== 'historico'; })
      .map(function (m) { return m.id; });
    if (!ids.length) return Promise.resolve();

    /* Otimista: a tela muda na hora e o servidor confirma depois. Se falhar, a
       próxima busca traz a verdade de volta — o custo de errar aqui é uma
       bolinha azul a mais, não um número errado. */
    ids.forEach(function (id) {
      const m = todas().filter(function (x) { return x.id === id; })[0];
      if (m) m.lida = true;
    });
    return N.marcarLidasWhatsapp(ids).catch(function () {});
  }

  function vincular(chave, contatoId, oportunidadeId) {
    const c = conversa(chave);
    if (!c) return Promise.resolve();
    c.mensagens.forEach(function (m) {
      m.contato_id = contatoId || null;
      m.oportunidade_id = oportunidadeId || null;
    });
    return N.vincularWhatsapp(c.chave, contatoId, oportunidadeId).catch(function () {});
  }

  /* O texto da conversa, do jeito que a IA vai ler quando o vendedor mandar.
     Quem falou importa tanto quanto o que foi dito: sem os nomes, a leitura
     não sabe separar o que o CLIENTE decidiu do que nós propusemos — que é a
     única coisa que o motor quer saber. */
  const TETO_DO_RELATO = 80;

  function comoTexto(chave, quantas) {
    const c = conversa(chave);
    if (!c) return '';
    const eu = 'Eu';
    const ele = (c.contato && c.contato.nome) || c.nome || c.telefone || 'Cliente';

    /* A carga dos 6 meses fica de fora por padrão, e isto não é economia de
       espaço: é a mesma regra de novo. Registrar o que aconteceu é dizer "isto
       aqui virou decisão", e mandar meio ano de conversa junto faria a IA
       propor evidência de coisa que o cliente disse em abril — evidência velha
       entrando como avanço de hoje, que é exatamente o que o `evidenceAge`
       existe para denunciar.

       Quando só há histórico, entra o fim dele: o vendedor clicou no botão, e
       devolver um campo vazio seria pior do que devolver o passado marcado
       como passado. E o campo é editável de qualquer jeito. */
    let lista = c.mensagens.filter(function (m) { return m.origem !== 'historico'; });
    if (!lista.length) lista = c.mensagens.slice(-30);
    lista = lista.slice(-(quantas || TETO_DO_RELATO));

    return lista.map(function (m) {
      const quem = m.direcao === 'saida' ? eu : ele;
      const dia = String(m.enviada_em || '').slice(0, 10);
      const corpo = m.texto || ('[' + (m.tipo || 'anexo') + ']');
      return dia + ' ' + quem + ': ' + corpo;
    }).join('\n');
  }

  function esquecer() { mensagens = null; buscando = null; falha = ''; }

  global.IADWhatsapp = {
    carregar: carregar, carregadas: carregadas, erro: erro, esquecer: esquecer,
    disponivel: disponivel,
    conversas: conversas, conversa: conversa, casar: casar,
    naoLidasDaOp: naoLidasDaOp, totalNaoLidas: totalNaoLidas, responderam: responderam,
    marcarLidas: marcarLidas, vincular: vincular, comoTexto: comoTexto,
    curto: curto, soDigitos: soDigitos, bonito: bonito,
    candidatos: candidatos, comPais: comPais, ddd: ddd,
    pareceBrasileiro: pareceBrasileiro
  };
})(window);
