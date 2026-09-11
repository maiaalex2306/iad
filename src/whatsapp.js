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
     3. Nada bate. Fica em "Sem dono", e o vendedor escolhe.

     Se o contato estiver em duas negociações abertas, o app não escolhe:
     pergunta. Chutar aqui seria pendurar evidência no negócio errado, que é
     o único erro que este CRM não pode cometer. */
  function contatoDoTelefone(telefoneCurto) {
    if (!telefoneCurto) return null;
    const gente = Store.dados().contatos || [];

    /* O WhatsApp primeiro, o comercial depois, e em duas passadas de propósito.
       Numa passada só, um contato cujo telefone comercial coincide com o
       WhatsApp de outro ganharia a conversa por estar antes na lista. O campo
       WhatsApp é a resposta certa quando ele existe; o comercial é o palpite
       razoável quando ele não existe. */
    for (let i = 0; i < gente.length; i++) {
      if (curto(gente[i].telefone) === telefoneCurto) return gente[i];
    }
    for (let i = 0; i < gente.length; i++) {
      if (curto(gente[i].telefoneComercial) === telefoneCurto) return gente[i];
    }
    return null;
  }

  function negociacoesDoContato(contatoId) {
    if (!contatoId) return [];
    return (Store.dados().oportunidades || []).filter(function (o) {
      return !o.desfecho && (o.stakeholders || []).indexOf(contatoId) !== -1;
    });
  }

  function casar(telefoneCurto) {
    const contato = contatoDoTelefone(telefoneCurto);
    if (!contato) return { contato: null, op: null, opcoes: [], semDono: true };

    const ops = negociacoesDoContato(contato.id);
    if (ops.length === 1) return { contato: contato, op: ops[0], opcoes: ops, semDono: false };
    /* Zero negociações abertas: a pessoa é conhecida, o negócio não existe.
       Duas ou mais: conhecida demais para o app escolher sozinho. */
    return { contato: contato, op: null, opcoes: ops, semDono: false };
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
      const dono = casar(k);
      c.contato = (gravado && Store.contato(gravado.contato_id)) || dono.contato;
      const opGravada = gravado && gravado.oportunidade_id
        ? Store.oportunidade(gravado.oportunidade_id) : null;
      c.op = (opGravada && !opGravada.desfecho ? opGravada : null) || dono.op;
      c.opcoes = dono.opcoes;
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
    curto: curto, soDigitos: soDigitos, bonito: bonito
  };
})(window);
