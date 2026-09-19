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
     resposta que só informa e não deixa agir vira relatório. `alvo` é o outro
     caminho: em vez de sair da conversa, refaz a mesma pergunta apontando para
     aquela negociação. É como a desambiguação funciona sem virar formulário. */
  function linha(texto, ir, alvo) {
    return { texto: texto, ir: ir || '', alvo: alvo || '' };
  }

  function daOportunidade(r, complemento) {
    return linha(r.op.titulo + ' · ' + nomeDaConta(r.op) +
      (complemento ? ' · ' + complemento : ''), '#/op/' + r.op.id);
  }

  function vazio(texto) {
    return { linhas: [linha(texto)], nada: true };
  }

  /* ---------------- o nome próprio ----------------
     O vendedor não pensa na carteira, pensa numa conta. "Como está a Pif Paf"
     é a pergunta que ele faz de verdade, e sem isto ela não tinha resposta.

     Quem resolve o nome é este arquivo, contra as empresas que existem — não
     a IA. Ela pode dizer que o vendedor citou "Pif Paf"; quem decide se isso
     é a Pif Paf Alimentos, e qual das negociações dela, é o aplicativo. Nome
     que não bate volta como "não achei", nunca como chute.

     Palavras que aparecem no nome de meia carteira e não distinguem ninguém.
     Sem esta lista, "grupo" casaria com todo mundo que tem Grupo no nome. */
  const GENERICAS = ['grupo', 'industria', 'industrias', 'comercio', 'comercial',
    'alimentos', 'ltda', 'sa', 'cia', 'companhia', 'empresa', 'do', 'da', 'de',
    'dos', 'das', 'e', 'brasil', 'brasileira', 'nacional', 'participacoes',
    'holding', 'agro', 'agroindustrial', 'servicos', 'solucoes', 'tecnologia'];

  /* O núcleo do nome: o que sobra quando se tira o genérico. "Pif Paf
     Alimentos" vira "pif paf", que é justamente como a pessoa escreve. */
  function nucleo(nome) {
    const partes = achatar(nome).split(/[^a-z0-9]+/).filter(function (w) {
      return w && GENERICAS.indexOf(w) === -1;
    });
    return partes.join(' ');
  }

  /* As três formas de citar a mesma empresa, da mais forte para a mais fraca.
     A força é o tamanho do trecho que casou: "pif paf" casando vale mais do
     que uma palavra solta, e é assim que duas empresas parecidas se separam. */
  function apelidos(nome) {
    const lista = [];
    const inteiro = achatar(nome);
    if (inteiro.length >= 4) lista.push(inteiro);
    const nu = nucleo(nome);
    if (nu.length >= 4 && nu !== inteiro) lista.push(nu);
    nu.split(' ').forEach(function (w) { if (w.length >= 5) lista.push(w); });
    return lista;
  }

  /* Devolve as negociações abertas da empresa citada, e o nome que casou.
     Zero, uma, ou várias — e várias não vira escolha automática: perguntar
     qual é mais barato do que pendurar a resposta no negócio errado. */
  function acharAlvo(texto) {
    const t = achatar(texto);
    if (t.length < 3) return null;

    let melhor = null;
    abertas().forEach(function (op) {
      const conta = Store.conta(op.contaId);
      const nomes = apelidos(op.titulo).concat(conta ? apelidos(conta.nome) : []);
      nomes.forEach(function (n) {
        if (t.indexOf(n) === -1) return;
        if (!melhor || n.length > melhor.forca) melhor = { forca: n.length, nome: n };
      });
    });
    if (!melhor) return null;

    /* Tudo que casou com a mesma força entra: é o caso da empresa com duas
       negociações abertas, que é exatamente quando se deve perguntar. */
    const ops = abertas().filter(function (op) {
      const conta = Store.conta(op.contaId);
      const nomes = apelidos(op.titulo).concat(conta ? apelidos(conta.nome) : []);
      return nomes.indexOf(melhor.nome) !== -1;
    });
    return { ops: ops, nome: melhor.nome };
  }

  /* Um exemplo escrito com a carteira da pessoa, para a dica na tela. Nome
     inventado numa dica ensina a escrever errado. */
  function exemploComNome() {
    const op = abertas()[0];
    if (!op) return '';
    const conta = Store.conta(op.contaId);
    return (conta && conta.nome) || op.titulo;
  }

  function precisaEscolher(alvo) {
    return {
      resumo: 'Qual negociação da ' + alvo.nome + '?',
      linhas: alvo.ops.map(function (op) {
        return linha(op.titulo + ' · ' + op.etapa, '', op.id);
      })
    };
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
          alvo: itens[0].resumo.op.id,
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
          /* O protagonista da resposta. É o que faz a pergunta seguinte —
             "e o que falta nela?" — ter a quem se referir. */
          alvo: topo.op.id,
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
          alvo: rs[0].op.id,
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
          alvo: rs[0].op.id,
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
          alvo: rs[0].op.id,
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
,

    /* ---------------- as quatro que pedem nome próprio ----------------
       Não viram chip: nove botões já é o limite do que se lê de relance, e
       estas não fazem sentido sem uma empresa junto. Elas aparecem na dica
       embaixo da caixa, escrita com uma conta da própria carteira. */

    {
      id: 'conta',
      comAlvo: true,
      chip: '',
      exemplos: ['como está a', 'como anda a', 'situação da', 'me fala da', 'status da'],
      palavras: ['como', 'situacao', 'situação', 'status', 'anda'],
      responder: function (op) {
        const r = E.resumo(op);
        const t = tarefasAbertas().filter(function (x) { return x.oportunidadeId === op.id; });
        const linhas = [
          linha('Decisão: IAD ' + r.iad + '/' + P.IAD_MAXIMO + ' · ' + r.classe.rotulo +
            ' · ' + r.classe.desc, '#/op/' + op.id),
          linha('Cliente: ' + dias(r.evidenceAge) + ' sem evidência (' + r.faixa.rotulo + ')',
            '#/op/' + op.id),
          linha('Grupo comprador: ' + r.coverage.mapeados + ' mapeados, ' +
            r.coverage.percentual + '% dos papéis críticos' +
            (r.coverage.temEconomicBuyer ? '' : ', sem o decisor econômico'),
            '#/op/' + op.id),
          linha('Etapa ' + op.etapa + ' há ' + dias(r.tempoNaEtapa) + ' · ' +
            (t.length ? t.length + (t.length === 1 ? ' tarefa aberta' : ' tarefas abertas')
                      : 'nenhuma tarefa aberta'), '#/op/' + op.id)
        ];
        /* O alerta mais grave entra por último, que é onde o olho para. */
        const grave = r.alertas.filter(function (a) { return a.nivel === 'alto'; })[0];
        if (grave) linhas.push(linha('⚠ ' + grave.texto, '#/op/' + op.id));

        return {
          resumo: op.titulo + ', da ' + nomeDaConta(op) + ' — ' + moeda(op.valor),
          linhas: linhas,
          maisEm: '#/op/' + op.id
        };
      }
    },

    {
      id: 'falta',
      comAlvo: true,
      chip: '',
      exemplos: ['o que falta na', 'o que fazer na', 'qual o próximo passo da',
        'por onde avanço na', 'o que está faltando'],
      palavras: ['falta', 'faltando', 'fazer', 'proximo', 'próximo', 'passo', 'avanco', 'avanço'],
      responder: function (op) {
        const ls = E.lacunas(op);
        if (!ls.length) return vazio('Nada em aberto nas oito decisões da ' + nomeDaConta(op) + '.');
        return {
          resumo: 'O que falta em ' + op.titulo,
          linhas: ls.slice(0, 6).map(function (l) {
            return linha(l.titulo + ': ' + l.falta, '#/op/' + op.id);
          }),
          maisEm: '#/op/' + op.id
        };
      }
    },

    {
      id: 'tarefas_da_conta',
      comAlvo: true,
      chip: '',
      exemplos: ['tarefas da', 'o que tenho marcado na', 'minhas tarefas na'],
      palavras: ['tarefa', 'tarefas', 'marcado', 'agenda'],
      responder: function (op) {
        const hoje = Store.hoje();
        const lista = tarefasAbertas()
          .filter(function (t) { return t.oportunidadeId === op.id; })
          .sort(function (a, b) { return String(a.vencimento).localeCompare(String(b.vencimento)); });
        if (!lista.length) {
          return vazio('Nenhuma tarefa aberta em ' + op.titulo + '. Negócio sem próxima ' +
            'tarefa é negócio parado.');
        }
        return {
          resumo: lista.length + (lista.length === 1 ? ' tarefa aberta em ' : ' tarefas abertas em ') +
            op.titulo,
          linhas: lista.map(function (t) {
            const atraso = t.vencimento && t.vencimento < hoje ? ' · atrasada' : '';
            return linha(data(t.vencimento) + ' · ' + (t.tipo ? t.tipo + ': ' : '') +
              t.titulo + atraso, '#/op/' + op.id);
          }),
          maisEm: '#/op/' + op.id
        };
      }
    },

    {
      id: 'quem_da_conta',
      comAlvo: true,
      chip: '',
      exemplos: ['quem eu conheço na', 'quem está no grupo comprador da',
        'com quem eu falo na', 'quais contatos da'],
      palavras: ['quem', 'contato', 'contatos', 'pessoa', 'pessoas', 'conheco', 'conheço', 'falo'],
      responder: function (op) {
        const gente = E.stakeholdersDaOp(op);
        if (!gente.length) {
          return vazio('Ninguém no grupo comprador de ' + op.titulo + '. Venda sem ' +
            'nome é venda que depende de sorte.');
        }
        const cob = E.coverage(op);
        return {
          resumo: gente.length + (gente.length === 1 ? ' pessoa mapeada, ' : ' pessoas mapeadas, ') +
            cob.percentual + '% dos papéis críticos' +
            (cob.faltando.length ? ' — falta ' + cob.faltando.join(', ') : ''),
          linhas: gente.map(function (c) {
            return linha(c.nome + (c.cargo ? ' · ' + c.cargo : '') +
              (c.papel ? ' · ' + c.papel : ''), '#/op/' + op.id);
          }),
          maisEm: '#/op/' + op.id
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
     para a IA em vez de chutar.

     Quando a frase traz o nome de uma empresa, a disputa muda: só concorrem as
     intenções que falam de UMA negociação. Quem escreveu o nome da Pif Paf não
     está perguntando da carteira inteira. */
  function achatar(t) {
    return String(t || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function pontuar(texto, candidatas) {
    const t = achatar(texto);
    const pontos = candidatas.map(function (i) {
      let n = 0;
      i.palavras.forEach(function (p) { if (t.indexOf(achatar(p)) !== -1) n++; });
      /* O exemplo inteiro batendo vale mais do que palavra solta. */
      i.exemplos.forEach(function (e) { if (t.indexOf(achatar(e)) !== -1) n += 3; });
      return { id: i.id, n: n };
    }).sort(function (a, b) { return b.n - a.n; });

    if (!pontos.length || !pontos[0].n) return null;
    if (pontos[1] && pontos[1].n === pontos[0].n) return null;   /* empate é dúvida */
    return pontos[0].id;
  }

  /* As palavras que não são nome de ninguém: artigos, pronomes, e o
     vocabulário das próprias intenções. Serve a uma pergunta só, e é uma
     pergunta de segurança: quando a frase pede uma negociação e não diz qual,
     dá para usar a da resposta anterior?

     Dá, se a frase não trouxer nome nenhum — "e o que falta nela?" é
     claramente sobre a de antes. Não dá, se trouxer: quem escreveu "como está
     a Zorglub" citou uma empresa, e responder sobre outra seria o pior erro
     possível aqui. Melhor dizer que não achei. */
  const COMUNS = ('a o as os um uma uns umas de do da dos das em no na nos nas ao aos ' +
    'por para pra com sem sob sobre que qual quais quem quando onde como porque ' +
    'e ou mas se me eu meu minha meus minhas nosso nossa te seu sua ' +
    'sao esta estao ta tao tem tenho temos ter teve foi vai vou ver diz fala falar ' +
    'ai la isso isto esse essa este aquele aquela ele ela eles elas ' +
    'nele nela neles nelas dele dela deles delas nesse nessa neste nesta desse dessa disso ' +
    'agora hoje amanha ontem antes depois ainda ja nao sim entao bem ' +
    'mais menos muito pouco tudo nada algo coisa favor ' +
    'conta contas empresa empresas negocio negocios negociacao negociacoes cliente clientes ' +
    'caso vez la so ate mesmo cada qualquer outro outra').split(' ');

  let vocabulario = null;
  function conhecidas() {
    if (vocabulario) return vocabulario;
    vocabulario = {};
    COMUNS.forEach(function (w) { vocabulario[w] = true; });
    INTENCOES.forEach(function (i) {
      i.palavras.concat(i.exemplos).forEach(function (frase) {
        achatar(frase).split(/[^a-z0-9]+/).forEach(function (w) {
          if (w) vocabulario[w] = true;
        });
      });
    });
    return vocabulario;
  }

  /* O que sobrou da frase depois de tirar tudo que é vocabulário. Se sobrou
     alguma coisa, foi um nome — e um nome que ninguém reconheceu. */
  function nomeNaoAchado(texto) {
    const v = conhecidas();
    const sobra = achatar(texto).split(/[^a-z0-9]+/).filter(function (w) {
      return w.length >= 3 && !v[w] && !/^\d+$/.test(w);
    });
    if (!sobra.length) return '';
    /* Devolve como o vendedor escreveu, não achatado: é o que ele vai ler. */
    const original = String(texto).split(/[^\wÀ-ÿ]+/).filter(function (w) {
      return sobra.indexOf(achatar(w)) !== -1;
    });
    return original.join(' ');
  }

  function globais() {
    return INTENCOES.filter(function (i) { return !i.comAlvo; });
  }

  function comAlvo() {
    return INTENCOES.filter(function (i) { return i.comAlvo; });
  }

  /* O entendimento local, já com nome próprio e com memória.

     `ultimo` é a negociação da resposta anterior. É o que faz "e o que falta
     nela?" funcionar — sem isso cada pergunta nasce órfã, e uma caixa de
     perguntas órfãs é uma busca, não uma conversa. */
  function entenderAqui(texto, ultimo) {
    const t = achatar(texto);
    if (t.length < 3) return null;

    const alvo = acharAlvo(texto);
    if (alvo) {
      /* Citou a empresa e mais nada ("e a Pif Paf?"): a pergunta é como ela
         está, que é o que se quer saber quando se diz só o nome. */
      return { id: pontuar(texto, comAlvo()) || 'conta', alvo: alvo };
    }

    const id = pontuar(texto, INTENCOES);
    if (!id) return null;

    const i = porId(id);
    if (!i.comAlvo) return { id: id, alvo: null };

    /* Pergunta sobre uma negociação sem dizer qual. Vale a da resposta
       anterior — e só ela: adivinhar uma terceira seria pior do que perguntar.

       Mas só quando a frase não cita nome nenhum. Citou e não casou: a empresa
       não está na carteira, e a resposta certa é dizer isso. */
    const citado = nomeNaoAchado(texto);
    if (citado) return { id: id, semAlvo: true, citado: citado };
    if (!ultimo) return { id: id, semAlvo: true };
    const op = Store.oportunidade(ultimo);
    if (!op || op.desfecho) return { id: id, semAlvo: true };
    return { id: id, alvo: { ops: [op], nome: nomeDaConta(op) } };
  }

  /* A IA só escolhe entre as intenções que existem, e só repete o nome que o
     vendedor escreveu. Ela não escreve resposta, não vê número e não resolve
     empresa nenhuma: devolve um id de uma lista fechada e um pedaço de texto,
     e os dois passam por conferência aqui. */
  function entenderComIA(texto, ultimo) {
    const IA = global.IADIA;
    if (!IA || !IA.disponivel()) return Promise.resolve(null);

    const opcoes = INTENCOES.map(function (i) {
      return i.id + ': ' + i.exemplos.slice(0, 3).join(' / ') +
        (i.comAlvo ? ' (precisa do nome de uma empresa)' : '');
    }).join('\n');

    /* O `extrair` recusa texto curto — e tem razão, para documento. Aqui
       "e agora?" é pergunta legítima, então ela vai emoldurada. */
    const pedido = 'Pergunta do vendedor: ' + texto;

    return IA.extrair('intencao', pedido, { opcoes: opcoes }).then(function (r) {
      if (!r || r.erro || !r.campos) return null;
      const id = String(r.campos.intencao || '').trim();
      const i = porId(id);
      if (!i) return null;
      if (!i.comAlvo) return { id: id, alvo: null };

      /* O nome vem da IA, a empresa vem da carteira. Ela pode ter lido
         "Pif Paf" na frase; quem decide se isso é uma conta é daqui. */
      const citado = String(r.campos.empresa || '').trim();
      const alvo = (citado && acharAlvo(citado)) || acharAlvo(texto);
      if (alvo) return { id: id, alvo: alvo };

      if (ultimo) {
        const op = Store.oportunidade(ultimo);
        if (op && !op.desfecho) return { id: id, alvo: { ops: [op], nome: nomeDaConta(op) } };
      }
      return { id: id, semAlvo: true, citado: citado };
    }).catch(function () { return null; });
  }

  function entender(texto, ultimo) {
    const local = entenderAqui(texto, ultimo);
    if (local) return Promise.resolve(Object.assign({ comIA: false }, local));
    return entenderComIA(texto, ultimo).then(function (r) {
      return r ? Object.assign({ comIA: true }, r) : null;
    });
  }

  /* Responder. `alvo` é o id da negociação, quando a pergunta tem uma.

     Devolve sempre um objeto com `id`, e mais `alvo` quando a resposta é de
     uma negociação — é assim que a caixa sabe o que guardar para a próxima
     pergunta. */
  function responder(id, alvoId) {
    const i = porId(id);
    if (!i) return null;

    if (!i.comAlvo) return Object.assign({ id: i.id, chip: i.chip }, i.responder());

    const op = alvoId ? Store.oportunidade(alvoId) : null;
    if (!op) {
      return {
        id: i.id, chip: i.chip, precisa: true,
        linhas: [linha('De qual empresa? Escreva o nome junto com a pergunta.')],
        nada: true
      };
    }
    return Object.assign({ id: i.id, chip: i.chip, alvo: op.id }, i.responder(op));
  }

  /* O que a caixa mostra quando a pergunta tem empresa: uma resposta, ou a
     escolha entre as negociações abertas dela. */
  function responderAoAlvo(id, alvo) {
    if (!alvo || !alvo.ops.length) return responder(id, null);
    if (alvo.ops.length > 1) {
      return Object.assign({ id: id, chip: '', escolher: true }, precisaEscolher(alvo));
    }
    return responder(id, alvo.ops[0].id);
  }

  global.IADConversa = {
    INTENCOES: INTENCOES,
    entender: entender,
    entenderAqui: entenderAqui,
    responder: responder,
    responderAoAlvo: responderAoAlvo,
    acharAlvo: acharAlvo,
    exemploComNome: exemploComNome,
    porId: porId,
    esc: esc
  };
})(window);
