/* IAD — a conversa com o assistente.
   ------------------------------------------------------------------
   A regra que sustenta este arquivo: **a IA não responde, ela só entende**.

   Quem calcula a resposta é o motor, com os dados de verdade. A IA serve para
   mapear "quais minhas tarefas do dia" na intenção `tarefas_hoje`, e nada
   mais. Duas razões, e as duas são o produto:

   1. Número inventado aqui é pior do que em qualquer outro lugar. Um CRM que
      diz "você tem 4 tarefas" quando são 6 perde a única coisa que ele tem
      para vender, que é confiança no número. Deixar a IA resumir um despejo de
      dados é justamente o jeito de produzir isso.

   2. Sem a IA, tudo continua funcionando. As perguntas viram botões, e as
      respostas saem iguais. O assistente fora do ar tira o texto livre, não
      tira a tela.

   Antes de chamar a IA, a pergunta passa por um casamento de palavras aqui
   mesmo. "Tarefas de hoje" não precisa de modelo nenhum para ser entendida —
   e o que não precisa de rede responde na hora. */
(function (global) {
  'use strict';

  const Store = global.IADStore;
  const E = global.IADEngine;
  const P = global.IADPlaybook;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function moeda(v) { return global.IADUI.compacto(v || 0); }
  function dias(n) { return n + (n === 1 ? ' dia' : ' dias'); }
  function data(d) { return global.IADUI.data(d); }

  function abertas() {
    return Store.dados().oportunidades.filter(function (o) { return !o.desfecho; });
  }

  function tarefasAbertas() {
    return (Store.dados().tarefas || []).filter(function (t) { return t.status === 'aberta'; });
  }

  function nomeDaConta(op) {
    const c = Store.conta(op.contaId);
    return (c && c.nome) || 'Sem empresa';
  }

  /* Um item de resposta. `ir` é o hash para onde a linha leva, quando leva —
     resposta que só informa e não deixa agir vira relatório. */
  function linha(texto, ir) {
    return { texto: texto, ir: ir || '' };
  }

  function daOportunidade(r, complemento) {
    return linha(r.op.titulo + ' · ' + nomeDaConta(r.op) +
      (complemento ? ' · ' + complemento : ''), '#/op/' + r.op.id);
  }

  function vazio(texto) {
    return { linhas: [linha(texto)], nada: true };
  }

  /* ---------------- as intenções ----------------
     Cada uma sabe responder sozinha, com o motor. Os exemplos servem a duas
     coisas: são os chips que aparecem na tela e são o que a IA recebe como
     lista fechada de opções. */
  const INTENCOES = [
    {
      id: 'tarefas_hoje',
      chip: 'Minhas tarefas de hoje',
      exemplos: ['quais minhas tarefas do dia', 'o que tenho para hoje', 'minha agenda de hoje',
        'tarefas de hoje', 'o que preciso fazer hoje'],
      palavras: ['tarefa', 'hoje', 'dia', 'agenda'],
      responder: function () {
        const hoje = Store.hoje();
        const lista = tarefasAbertas()
          .filter(function (t) { return t.vencimento && t.vencimento <= hoje; })
          .sort(function (a, b) { return String(a.vencimento).localeCompare(String(b.vencimento)); });

        if (!lista.length) return vazio('Nenhuma tarefa aberta para hoje. Sua agenda está limpa.');

        const atrasadas = lista.filter(function (t) { return t.vencimento < hoje; }).length;
        return {
          resumo: lista.length + (lista.length === 1 ? ' tarefa' : ' tarefas') +
            (atrasadas ? ', sendo ' + atrasadas + ' em atraso' : ''),
          linhas: lista.slice(0, 8).map(function (t) {
            const op = t.oportunidadeId ? Store.oportunidade(t.oportunidadeId) : null;
            const atraso = t.vencimento < hoje ? ' · atrasada desde ' + data(t.vencimento) : '';
            return linha((t.tipo ? t.tipo + ': ' : '') + t.titulo +
              (op ? ' · ' + nomeDaConta(op) : '') + atraso,
              op ? '#/op/' + op.id : '#/tarefas');
          }),
          maisEm: '#/tarefas'
        };
      }
    },

    {
      id: 'foco',
      chip: 'O que fazer agora',
      exemplos: ['o que eu faço agora', 'por onde começo', 'qual a prioridade',
        'o que é mais urgente', 'me diz o que fazer'],
      palavras: ['agora', 'prioridade', 'urgente', 'começo', 'foco'],
      responder: function () {
        const itens = E.focoDoDia(abertas(), Store.dados().tarefas || []);
        if (!itens.length) return vazio('Nada urgente na carteira. Bom momento para prospectar.');
        return {
          resumo: 'Comece por estas ' + Math.min(itens.length, 5),
          linhas: itens.slice(0, 5).map(function (i) {
            return linha(i.resumo.op.titulo + ' · ' + i.motivo + ' → ' + i.acao,
              '#/op/' + i.resumo.op.id);
          }),
          maisEm: '#/hoje'
        };
      }
    },

    {
      id: 'melhor',
      chip: 'Qual negócio está melhor',
      exemplos: ['qual conta está melhor', 'qual negócio está mais maduro',
        'qual está mais perto de fechar', 'meu melhor negócio'],
      palavras: ['melhor', 'maduro', 'maduros', 'fechar', 'avançado', 'adiantado'],
      responder: function () {
        /* Melhor é decisão madura com movimento recente. Valor não entra: o
           negócio grande e parado é justamente o que este CRM existe para não
           deixar parecer bom. */
        const rs = abertas().map(E.resumo)
          .filter(function (r) { return !r.op.nutricao; })
          .sort(function (a, b) {
            if (b.iad !== a.iad) return b.iad - a.iad;
            if (a.evidenceAge !== b.evidenceAge) return a.evidenceAge - b.evidenceAge;
            return b.coverage.percentual - a.coverage.percentual;
          });
        if (!rs.length) return vazio('Nenhuma negociação aberta na carteira.');
        const topo = rs[0];
        return {
          resumo: topo.op.titulo + ', da ' + nomeDaConta(topo.op) +
            ' — IAD ' + topo.iad + '/' + P.IAD_MAXIMO + ', ' + dias(topo.evidenceAge) +
            ' sem evidência, grupo comprador ' + topo.coverage.percentual + '%',
          linhas: rs.slice(0, 5).map(function (r) {
            return daOportunidade(r, 'IAD ' + r.iad + ' · ' + r.evidenceAge + 'd · ' + r.classe.rotulo);
          }),
          maisEm: '#/pipeline'
        };
      }
    },

    {
      id: 'pior',
      chip: 'O que está em risco',
      exemplos: ['qual negócio está em risco', 'o que está ruim', 'onde eu estou perdendo',
        'quais os falsos avançados'],
      palavras: ['risco', 'ruim', 'pior', 'perdendo', 'falso', 'travado'],
      responder: function () {
        const rs = abertas().map(E.resumo).filter(function (r) {
          return r.classe.id === 'falso' || r.classe.id === 'zumbi';
        }).sort(function (a, b) { return (b.op.valor || 0) - (a.op.valor || 0); });

        if (!rs.length) return vazio('Nenhum negócio classificado como falso avançado ou zumbi.');
        const valor = rs.reduce(function (s, r) { return s + (r.op.valor || 0); }, 0);
        return {
          resumo: rs.length + (rs.length === 1 ? ' negociação' : ' negociações') +
            ' somando ' + moeda(valor) + ' em risco',
          linhas: rs.slice(0, 6).map(function (r) {
            return daOportunidade(r, r.classe.rotulo + ' · ' + r.classe.desc);
          }),
          maisEm: '#/pipeline'
        };
      }
    },

    {
      id: 'sem_evidencia',
      chip: 'Quem sumiu',
      exemplos: ['quem está sem evidência', 'quem sumiu', 'quais contas pararam',
        'faz tempo que não falo com quem'],
      palavras: ['sumiu', 'parou', 'parado', 'evidência', 'evidencia', 'silêncio', 'silencio'],
      responder: function () {
        const rs = abertas().map(E.resumo)
          .filter(function (r) { return !r.op.nutricao && r.evidenceAge > 14; })
          .sort(function (a, b) { return b.evidenceAge - a.evidenceAge; });
        if (!rs.length) return vazio('Todo mundo se moveu nos últimos 14 dias.');
        return {
          resumo: rs.length + ' sem sinal do cliente há mais de 14 dias',
          linhas: rs.slice(0, 6).map(function (r) {
            return daOportunidade(r, dias(r.evidenceAge) + ' sem evidência');
          }),
          maisEm: '#/revisao'
        };
      }
    },

    {
      id: 'carteira',
      chip: 'Como está minha carteira',
      exemplos: ['como está minha carteira', 'quanto tenho no pipeline',
        'resumo do funil', 'quantas negociações eu tenho'],
      palavras: ['carteira', 'pipeline', 'funil', 'resumo', 'quanto', 'total'],
      responder: function () {
        const c = E.carteira(abertas());
        if (!c.qtd) return vazio('Carteira vazia. Nenhuma negociação aberta.');
        const grupos = Object.keys(c.porGrupo).map(function (k) {
          return linha(c.porGrupo[k].rotulo + ': ' + c.porGrupo[k].qtd + ' · ' +
            moeda(c.porGrupo[k].valor), '#/pipeline');
        });
        return {
          resumo: c.qtd + (c.qtd === 1 ? ' negociação' : ' negociações') + ' somando ' +
            moeda(c.total) + '. IAD médio ' + Math.round(c.iadMedio) + '/' + P.IAD_MAXIMO +
            ', ' + Math.round(c.evidenceAgeMedio) + ' dias sem evidência em média',
          linhas: grupos.concat([
            linha('Saudável (real + oculto promissor): ' + moeda(c.saudavel), '#/painel'),
            linha('Em risco (falso avançado + em construção): ' + moeda(c.emRisco), '#/painel')
          ]),
          maisEm: '#/painel'
        };
      }
    },

    {
      id: 'semana',
      chip: 'Minha semana',
      exemplos: ['o que tenho essa semana', 'minha semana', 'próximos dias',
        'o que vem pela frente'],
      palavras: ['semana', 'próximos', 'proximos', 'frente', 'amanhã', 'amanha'],
      responder: function () {
        const hoje = Store.hoje();
        const limite = new Date(hoje + 'T00:00:00');
        limite.setDate(limite.getDate() + 7);
        const ate = limite.toISOString().slice(0, 10);

        const lista = tarefasAbertas()
          .filter(function (t) { return t.vencimento && t.vencimento >= hoje && t.vencimento <= ate; })
          .sort(function (a, b) { return String(a.vencimento).localeCompare(String(b.vencimento)); });
        if (!lista.length) return vazio('Nada marcado para os próximos 7 dias.');
        return {
          resumo: lista.length + (lista.length === 1 ? ' tarefa' : ' tarefas') + ' nos próximos 7 dias',
          linhas: lista.slice(0, 8).map(function (t) {
            const op = t.oportunidadeId ? Store.oportunidade(t.oportunidadeId) : null;
            return linha(data(t.vencimento) + ' · ' + t.titulo + (op ? ' · ' + nomeDaConta(op) : ''),
              op ? '#/op/' + op.id : '#/tarefas');
          }),
          maisEm: '#/tarefas'
        };
      }
    },

    {
      id: 'decisor',
      chip: 'Onde falta o decisor',
      exemplos: ['onde falta o decisor econômico', 'quem não tem decisor',
        'estou falando com a pessoa certa', 'cobertura do grupo comprador'],
      palavras: ['decisor', 'econômico', 'economico', 'grupo', 'comprador', 'cobertura', 'stakeholder'],
      responder: function () {
        const rs = abertas().map(E.resumo)
          .filter(function (r) { return !r.coverage.temEconomicBuyer; })
          .sort(function (a, b) { return (b.op.valor || 0) - (a.op.valor || 0); });
        if (!rs.length) return vazio('Todas as negociações abertas já têm o decisor econômico mapeado.');
        return {
          resumo: rs.length + ' sem decisor econômico mapeado',
          linhas: rs.slice(0, 6).map(function (r) {
            return daOportunidade(r, 'grupo ' + r.coverage.percentual + '% · ' + r.op.etapa);
          }),
          maisEm: '#/pipeline'
        };
      }
    },

    {
      id: 'nutricao',
      chip: 'O que está em nutrição',
      exemplos: ['o que está em nutrição', 'quais contas estão paradas de propósito',
        'quem volta da nutrição'],
      palavras: ['nutrição', 'nutricao', 'adiado', 'esperando'],
      responder: function () {
        const rs = abertas().filter(function (o) { return o.nutricao; }).map(E.resumo);
        if (!rs.length) return vazio('Nenhuma negociação em nutrição.');
        const vencidas = rs.filter(function (r) { return E.nutricaoVencida(r.op); });
        return {
          resumo: rs.length + ' em nutrição' +
            (vencidas.length ? ', ' + vencidas.length + ' com prazo vencido' : ''),
          linhas: rs.map(function (r) {
            const n = r.op.nutricao || {};
            return daOportunidade(r, (n.motivoRotulo || 'em nutrição') +
              (n.retomarEm ? ' · retomar em ' + data(n.retomarEm) : ''));
          }),
          maisEm: '#/revisao'
        };
      }
    }
  ];

  function porId(id) {
    return INTENCOES.filter(function (i) { return i.id === id; })[0] || null;
  }

  /* ---------------- entender a pergunta ----------------
     Primeiro sem rede. Conta quantas palavras da intenção aparecem no texto, e
     só aceita quando uma ganha das outras — empate vira dúvida, e dúvida vai
     para a IA em vez de chutar. */
  function achatar(t) {
    return String(t || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function entenderAqui(texto) {
    const t = achatar(texto);
    if (t.length < 3) return null;

    const pontos = INTENCOES.map(function (i) {
      let n = 0;
      i.palavras.forEach(function (p) { if (t.indexOf(achatar(p)) !== -1) n++; });
      /* O exemplo inteiro batendo vale mais do que palavra solta. */
      i.exemplos.forEach(function (e) { if (t.indexOf(achatar(e)) !== -1) n += 3; });
      return { id: i.id, n: n };
    }).sort(function (a, b) { return b.n - a.n; });

    if (!pontos[0].n) return null;
    if (pontos[1] && pontos[1].n === pontos[0].n) return null;   /* empate é dúvida */
    return pontos[0].id;
  }

  /* A IA só escolhe entre as intenções que existem. Ela não escreve resposta,
     não vê número e não inventa conta: devolve um id de uma lista fechada, e
     id fora da lista é descartado aqui. */
  function entenderComIA(texto) {
    const IA = global.IADIA;
    if (!IA || !IA.disponivel()) return Promise.resolve(null);

    const opcoes = INTENCOES.map(function (i) {
      return i.id + ': ' + i.exemplos.slice(0, 3).join(' / ');
    }).join('\n');

    /* O `extrair` recusa texto curto — e tem razão, para documento. Aqui
       "e agora?" é pergunta legítima, então ela vai emoldurada. */
    const pedido = 'Pergunta do vendedor: ' + texto;

    return IA.extrair('intencao', pedido, { opcoes: opcoes }).then(function (r) {
      if (!r || r.erro || !r.campos) return null;
      const id = String(r.campos.intencao || '').trim();
      return porId(id) ? id : null;
    }).catch(function () { return null; });
  }

  function entender(texto) {
    const local = entenderAqui(texto);
    if (local) return Promise.resolve({ id: local, comIA: false });
    return entenderComIA(texto).then(function (id) {
      return id ? { id: id, comIA: true } : null;
    });
  }

  function responder(id) {
    const i = porId(id);
    if (!i) return null;
    const r = i.responder();
    return Object.assign({ id: i.id, chip: i.chip }, r);
  }

  global.IADConversa = {
    INTENCOES: INTENCOES,
    entender: entender,
    entenderAqui: entenderAqui,
    responder: responder,
    porId: porId,
    esc: esc
  };
})(window);
