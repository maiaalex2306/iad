/* Decision Engine: IAD, Evidence Age, Decision Velocity, Coverage,
   Proposal Gates, Forecast e Next Best Decision. Regras primeiro; IA depois. */
(function (global) {
  'use strict';

  const P = global.IADPlaybook;
  const Store = global.IADStore;

  function iad(op) {
    return P.DIMENSOES.reduce(function (soma, d) { return soma + (op.dims[d.id] || 0); }, 0);
  }

  function diasEntre(dataISO, referencia) {
    const a = new Date(dataISO + 'T00:00:00');
    const b = referencia ? new Date(referencia + 'T00:00:00') : new Date();
    return Math.max(0, Math.floor((b - a) / 86400000));
  }

  function eventosDeDecisao(op) {
    return (op.eventos || []).filter(function (e) { return e.tipo === 'decision'; });
  }

  /* Evidence Age: dias desde a última evidência do CLIENTE.
     Atividade do vendedor não zera o contador — por definição. */
  function evidenceAge(op) {
    const decisoes = eventosDeDecisao(op);
    if (!decisoes.length) return diasEntre(op.criadoEm);
    const maisRecente = decisoes.reduce(function (max, e) { return e.data > max ? e.data : max; }, decisoes[0].data);
    return diasEntre(maisRecente);
  }

  function faixaEvidencia(dias) {
    return P.FAIXAS_EVIDENCIA.find(function (f) { return dias <= f.max; });
  }

  /* Decision Velocity: microdecisões comprovadas nos últimos 30 dias. */
  function decisionVelocity(op) {
    return eventosDeDecisao(op).filter(function (e) { return diasEntre(e.data) <= 30; }).length;
  }

  function stakeholdersDaOp(op) {
    return (op.stakeholders || []).map(function (id) { return Store.contato(id); }).filter(Boolean);
  }

  /* Coverage: papéis críticos do buying group com relacionamento real. */
  function mobilizadores(op) {
    return stakeholdersDaOp(op).filter(function (p) {
      return P.PERFIS_MOBILIZADORES.indexOf(p.perfil) !== -1;
    });
  }

  function bloqueadores(op) {
    return stakeholdersDaOp(op).filter(function (p) { return p.perfil === 'bloqueador'; });
  }

  function coverage(op) {
    const pessoas = stakeholdersDaOp(op);
    const papeisPresentes = new Set(pessoas.map(function (p) { return p.papel; }));
    const criticosCobertos = P.PAPEIS_CRITICOS.filter(function (papel) { return papeisPresentes.has(papel); });
    const engajados = pessoas.filter(function (p) { return p.sentimento === 'favoravel' || p.sentimento === 'neutro'; });
    const resistentes = pessoas.filter(function (p) { return p.sentimento === 'resistente'; });
    const favoraveis = pessoas.filter(function (p) { return p.sentimento === 'favoravel'; });
    /* Resistência de quem assina não é a mesma coisa que resistência de quem
       opera: uma trava o negócio, a outra atrasa. */
    const resistentesCriticos = resistentes.filter(function (p) {
      return P.PAPEIS_CRITICOS.indexOf(p.papel) !== -1;
    });
    return {
      resistentes: resistentes.length,
      favoraveis: favoraveis.length,
      resistentesCriticos: resistentesCriticos,
      naoAcessados: pessoas.filter(function (p) { return p.sentimento === 'nao_acessado'; }).length,
      mapeados: pessoas.length,
      papeis: papeisPresentes.size,
      criticosCobertos: criticosCobertos.length,
      criticosTotal: P.PAPEIS_CRITICOS.length,
      percentual: Math.round((criticosCobertos.length / P.PAPEIS_CRITICOS.length) * 100),
      engajados: engajados.length,
      temEconomicBuyer: papeisPresentes.has('Decisor econômico'),
      temChampion: papeisPresentes.has('Champion / Mobilizer'),
      mobilizadores: mobilizadores(op).length,
      bloqueadores: bloqueadores(op).length,
      naoClassificados: pessoas.filter(function (p) { return !p.perfil || p.perfil === 'nao_classificado'; }).length,
      faltando: P.PAPEIS_CRITICOS.filter(function (papel) { return !papeisPresentes.has(papel); })
    };
  }

  /* Proposal Gate: a proposta é consequência da qualificação. */
  function gates(op) {
    const itens = P.GATES_PROPOSTA.map(function (g) {
      const dim = P.DIMENSOES.find(function (d) { return d.id === g.dim; });
      const atual = op.dims[g.dim] || 0;
      return { dim: g.dim, nome: dim.nome, min: g.min, atual: atual, ok: atual >= g.min };
    });
    const aprovados = itens.filter(function (i) { return i.ok; }).length;
    return {
      itens: itens,
      aprovados: aprovados,
      total: itens.length,
      prontidao: Math.round((aprovados / itens.length) * 100),
      liberado: aprovados === itens.length,
      pendentes: itens.filter(function (i) { return !i.ok; })
    };
  }

  const ORDEM_ETAPAS = P.ETAPAS;
  function indiceEtapa(op) { return ORDEM_ETAPAS.indexOf(op.etapa); }
  function depoisDaProposta(op) { return indiceEtapa(op) >= ORDEM_ETAPAS.indexOf('Proposta'); }

  /* Saúde: etapa não entra na conta. Só decisão, movimento e consenso. */
  function saude(op) {
    const pontos = iad(op);
    const idade = evidenceAge(op);
    const cob = coverage(op);
    const g = gates(op);

    let score = (pontos / 16) * 45;
    score += Math.max(0, 25 - idade) / 25 * 20;
    score += (cob.percentual / 100) * 20;
    score += (g.prontidao / 100) * 15;
    if (!cob.temEconomicBuyer && depoisDaProposta(op)) score -= 12;
    if (cob.mapeados <= 1) score -= 8;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /* Os quatro grupos que aparecem quando se separa etapa de decisão. */
  function classificar(op) {
    const pontos = iad(op);
    const idade = evidenceAge(op);
    const cob = coverage(op);
    if (idade > 30) return { id: 'zumbi', rotulo: 'Zumbi', desc: 'Sem evidência nova do comprador há mais de 30 dias.' };
    /* Etapa adiantada não é avanço: sem maturidade, sem gate ou sem decisor econômico, é falso avanço. */
    if (depoisDaProposta(op) && (pontos < 11 || !gates(op).liberado || !cob.temEconomicBuyer)) {
      return { id: 'falso', rotulo: 'Falso avançado', desc: 'Etapa adiantada, decisão imatura.' };
    }
    if (!depoisDaProposta(op) && pontos >= 11) return { id: 'oculto', rotulo: 'Oculto promissor', desc: 'Decisão madura antes da etapa indicar.' };
    if (pontos >= 11 && idade <= 14 && cob.percentual >= 50) {
      return { id: 'real', rotulo: 'Negócio real', desc: 'Decisão madura, movimento recente e consenso em construção.' };
    }
    return { id: 'construcao', rotulo: 'Em construção', desc: 'Decisão ainda sendo formada.' };
  }

  /* Next Best Decision: qual decisão precisa ocorrer DENTRO do cliente agora.
     A ordem importa — problema antes de impacto, stakeholders antes de consenso. */
  const ORDEM_DECISAO = ['problema', 'prioridade', 'impacto', 'stakeholders', 'criterios', 'processo', 'consenso', 'risco'];

  function nextBestDecision(op) {
    const cob = coverage(op);

    if (depoisDaProposta(op) && !cob.temEconomicBuyer) {
      const dim = P.DIMENSOES.find(function (d) { return d.id === 'stakeholders'; });
      return {
        dimensao: dim,
        critico: true,
        decisao: 'O decisor econômico precisa entrar na conversa antes de qualquer nova revisão de proposta.',
        acao: dim.canais.whatsapp,
        canais: dim.canais,
        conteudo: dim.conteudo
      };
    }

    const idade = evidenceAge(op);
    const alvo = ORDEM_DECISAO.find(function (id) { return (op.dims[id] || 0) < 2; });
    if (!alvo) {
      return {
        dimensao: null,
        critico: idade > 14,
        decisao: 'As oito decisões estão comprovadas. A próxima decisão é a formalização: data de assinatura e liberação orçamentária.',
        acao: 'Feche o Mutual Action Plan com data de assinatura e responsáveis dos dois lados.',
        canais: null,
        conteudo: 'Mutual Action Plan'
      };
    }

    const dim = P.DIMENSOES.find(function (d) { return d.id === alvo; });
    const nivel = op.dims[alvo] || 0;
    return {
      dimensao: dim,
      critico: idade > 21,
      decisao: dim.pergunta,
      acao: nivel === 0 ? dim.canais.whatsapp : dim.canais.email,
      canais: dim.canais,
      conteudo: dim.conteudo,
      evidenciasAceitas: dim.evidencias
    };
  }

  function alertas(op) {
    const lista = [];
    const idade = evidenceAge(op);
    const cob = coverage(op);
    const g = gates(op);
    const f = faixaEvidencia(idade);

    if (idade > 14) lista.push({ tipo: 'evidencia', nivel: idade > 30 ? 'alto' : 'medio', texto: idade + ' dias sem evidência do comprador (' + f.rotulo + ').' });
    if (cob.mapeados <= 1) lista.push({ tipo: 'single', nivel: 'alto', texto: 'Venda single-threaded: depende de uma única pessoa.' });
    if (depoisDaProposta(op) && !cob.temEconomicBuyer) lista.push({ tipo: 'papel', nivel: 'alto', texto: 'Em proposta ou adiante sem acesso ao decisor econômico.' });
    if (depoisDaProposta(op) && !g.liberado) lista.push({ tipo: 'gate', nivel: 'alto', texto: 'Proposta emitida com prontidão de apenas ' + g.prontidao + '%.' });
    if (!cob.temChampion) lista.push({ tipo: 'papel', nivel: 'medio', texto: 'Nenhum champion identificado no grupo comprador.' });
    if (cob.mapeados && !cob.mobilizadores) {
      lista.push({ tipo: 'mobilizador', nivel: 'alto', texto: 'Nenhum mobilizador no grupo: ninguém ali move a decisão por dentro.' });
    }
    if (cob.bloqueadores) {
      lista.push({ tipo: 'mobilizador', nivel: 'medio', texto: cob.bloqueadores + ' bloqueador(es) identificado(s) no grupo comprador.' });
    }
    /* A posição de cada pessoa era preenchida e não gerava nada. Quem decide
       estar contra é o sinal mais caro de ignorar. */
    if (cob.resistentesCriticos && cob.resistentesCriticos.length) {
      const nomes = cob.resistentesCriticos.map(function (p) { return p.nome + ' (' + p.papel + ')'; }).join(', ');
      lista.push({ tipo: 'posicao', nivel: 'alto', texto: 'Resistência em papel crítico: ' + nomes + '.' });
    } else if (cob.mapeados >= 2 && !cob.favoraveis) {
      lista.push({ tipo: 'posicao', nivel: 'medio', texto: 'Ninguém favorável no grupo comprador: nenhum aliado declarado.' });
    }
    if (cob.mapeados >= 3 && cob.naoAcessados >= Math.ceil(cob.mapeados / 2)) {
      lista.push({ tipo: 'posicao', nivel: 'medio', texto: cob.naoAcessados + ' de ' + cob.mapeados + ' pessoas ainda não acessadas.' });
    }
    const ins = op.insight || {};
    if ((op.dims.problema || 0) === 2 && ins.estado !== 'aceito') {
      lista.push({ tipo: 'insight', nivel: 'medio', texto: 'Problema comprovado, mas o cliente ainda não adotou nosso reenquadramento.' });
    }
    if (decisionVelocity(op) === 0) lista.push({ tipo: 'velocity', nivel: 'medio', texto: 'Decision Velocity zerada nos últimos 30 dias.' });

    const comp = compromisso(op);
    if (comp && comp.vencido) {
      lista.push({ tipo: 'compromisso', nivel: 'alto', texto: 'Compromisso vencido há ' + comp.diasAtraso + ' dia(s): ' + comp.texto + '.' });
    } else if (!comp) {
      lista.push({ tipo: 'compromisso', nivel: 'medio', texto: 'Nenhum próximo passo combinado com data.' });
    }
    if ((op.adiamentos || 0) >= 2) {
      lista.push({ tipo: 'adiamento', nivel: 'alto', texto: 'Data de fechamento adiada ' + op.adiamentos + ' vezes.' });
    }
    const aut = autoria(op);
    if (aut.total >= 3 && aut.concentracao === 1 && aut.principal) {
      lista.push({ tipo: 'autoria', nivel: 'medio', texto: 'Todas as evidências vieram de ' + aut.principal.nome + '.' });
    }
    P.DIMENSOES.forEach(function (d) {
      if ((op.dims[d.id] || 0) === 2 && !podeComprovar(op, d.id)) {
        lista.push({ tipo: 'comprovacao', nivel: 'medio', texto: d.nome + ' está como comprovado sem evidência confirmada.' });
      }
    });
    return lista;
  }

  function resumo(op) {
    return {
      op: op,
      conta: Store.conta(op.contaId),
      iad: iad(op),
      evidenceAge: evidenceAge(op),
      faixa: faixaEvidencia(evidenceAge(op)),
      velocity: decisionVelocity(op),
      coverage: coverage(op),
      gates: gates(op),
      saude: saude(op),
      classe: classificar(op),
      nbd: nextBestDecision(op),
      alertas: alertas(op),
      compromisso: compromisso(op),
      lacunas: lacunas(op),
      tempoNaEtapa: tempoNaEtapa(op),
      delta: deltaSemana(op),
      autoria: autoria(op)
    };
  }

  /* ---------- Agregações para o painel ---------- */

  function mesDe(op) {
    const d = op.fechamentoPrevisto || op.criadoEm;
    return d ? d.slice(0, 7) : '';
  }

  function rotuloMes(mes) {
    const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const partes = mes.split('-');
    return nomes[Number(partes[1]) - 1] + '/' + partes[0].slice(2);
  }

  function segmentoDe(op) {
    const c = Store.conta(op.contaId);
    return (c && c.segmento) || 'Sem segmento';
  }

  function filtrar(oportunidades, filtros) {
    const f = filtros || {};
    return oportunidades.filter(function (o) {
      if (f.periodo && f.periodo !== 'todos' && mesDe(o) !== f.periodo) return false;
      if (f.segmento && f.segmento !== 'todos' && segmentoDe(o) !== f.segmento) return false;
      return true;
    });
  }

  function mesesDisponiveis(oportunidades) {
    const meses = {};
    oportunidades.filter(function (o) { return !o.desfecho; }).forEach(function (o) {
      const m = mesDe(o);
      if (m) meses[m] = true;
    });
    return Object.keys(meses).sort();
  }

  function segmentosDisponiveis(oportunidades) {
    const segs = {};
    oportunidades.forEach(function (o) { segs[segmentoDe(o)] = true; });
    return Object.keys(segs).sort();
  }

  /* Saúde em três faixas — é o que colore quase todos os gráficos. */
  function faixaSaude(r) {
    if (r.classe.id === 'zumbi') return 'zumbi';
    if (r.classe.id === 'real' || r.classe.id === 'oculto') return 'saudavel';
    return 'risco';
  }

  function porMes(resumos) {
    const mapa = {};
    resumos.forEach(function (r) {
      const m = mesDe(r.op);
      if (!m) return;
      mapa[m] = mapa[m] || { mes: m, rotulo: rotuloMes(m), qtd: 0, valor: 0, saudavel: 0, risco: 0, zumbi: 0 };
      mapa[m].qtd += 1;
      mapa[m].valor += r.op.valor || 0;
      mapa[m][faixaSaude(r)] += r.op.valor || 0;
    });
    return Object.keys(mapa).sort().map(function (k) { return mapa[k]; });
  }

  function porSegmento(resumos) {
    const mapa = {};
    resumos.forEach(function (r) {
      const seg = segmentoDe(r.op);
      mapa[seg] = mapa[seg] || { segmento: seg, qtd: 0, valor: 0, somaIad: 0, saudavel: 0, risco: 0, zumbi: 0 };
      mapa[seg].qtd += 1;
      mapa[seg].valor += r.op.valor || 0;
      mapa[seg].somaIad += r.iad;
      mapa[seg][faixaSaude(r)] += r.op.valor || 0;
    });
    return Object.keys(mapa).map(function (k) {
      const m = mapa[k];
      m.iadMedio = m.qtd ? m.somaIad / m.qtd : 0;
      return m;
    }).sort(function (a, b) { return b.valor - a.valor; });
  }

  function porEtapa(resumos) {
    return P.ETAPAS.filter(function (e) { return e !== 'Venda'; }).map(function (etapa) {
      const doGrupo = resumos.filter(function (r) { return r.op.etapa === etapa; });
      return {
        etapa: etapa,
        qtd: doGrupo.length,
        valor: doGrupo.reduce(function (s, r) { return s + (r.op.valor || 0); }, 0),
        saudavel: doGrupo.filter(function (r) { return faixaSaude(r) === 'saudavel'; })
          .reduce(function (s, r) { return s + (r.op.valor || 0); }, 0),
        iadMedio: doGrupo.length ? doGrupo.reduce(function (s, r) { return s + r.iad; }, 0) / doGrupo.length : 0
      };
    }).filter(function (e) { return e.qtd; });
  }

  /* Matriz oportunidade × decisão: a carteira inteira em um quadro. */
  function matrizDecisoes(resumos, limite) {
    return resumos.slice()
      .sort(function (a, b) { return (b.op.valor || 0) - (a.op.valor || 0); })
      .slice(0, limite || 14)
      .map(function (r) {
        return {
          resumo: r,
          titulo: r.op.titulo,
          conta: (r.conta && r.conta.nome) || '',
          valor: r.op.valor || 0,
          iad: r.iad,
          celulas: P.DIMENSOES.map(function (d) {
            const nota = r.op.dims[d.id] || 0;
            return {
              dimensao: d.nome,
              nota: nota,
              semProva: nota === 2 && !podeComprovar(r.op, d.id)
            };
          })
        };
      });
  }

  function distribuicaoEvidencia(resumos) {
    return P.FAIXAS_EVIDENCIA.map(function (f) {
      const doGrupo = resumos.filter(function (r) { return r.faixa.rotulo === f.rotulo; });
      return {
        rotulo: f.rotulo, classe: f.classe, qtd: doGrupo.length,
        valor: doGrupo.reduce(function (s, r) { return s + (r.op.valor || 0); }, 0)
      };
    });
  }

  /* Carteira: onde está o dinheiro e qual decisão o está segurando. */
  function carteira(oportunidades) {
    const abertas = oportunidades.filter(function (o) { return !o.desfecho; });
    const resumos = abertas.map(resumo);
    const total = resumos.reduce(function (s, r) { return s + (r.op.valor || 0); }, 0);
    const porGrupo = {};
    resumos.forEach(function (r) {
      const k = r.classe.id;
      porGrupo[k] = porGrupo[k] || { rotulo: r.classe.rotulo, valor: 0, qtd: 0 };
      porGrupo[k].valor += r.op.valor || 0;
      porGrupo[k].qtd += 1;
    });

    const travas = {};
    resumos.forEach(function (r) {
      if (!r.nbd.dimensao) return;
      const k = r.nbd.dimensao.id;
      travas[k] = travas[k] || { nome: r.nbd.dimensao.nome, valor: 0, qtd: 0 };
      travas[k].valor += r.op.valor || 0;
      travas[k].qtd += 1;
    });

    const media = function (fn) {
      return resumos.length ? resumos.reduce(function (s, r) { return s + fn(r); }, 0) / resumos.length : 0;
    };

    return {
      resumos: resumos,
      total: total,
      qtd: resumos.length,
      porGrupo: porGrupo,
      travas: Object.keys(travas).map(function (k) { return Object.assign({ id: k }, travas[k]); })
        .sort(function (a, b) { return b.valor - a.valor; }),
      iadMedio: media(function (r) { return r.iad; }),
      evidenceAgeMedio: media(function (r) { return r.evidenceAge; }),
      coverageMedio: media(function (r) { return r.coverage.percentual; }),
      prontidaoMedia: media(function (r) { return r.gates.prontidao; }),
      saudavel: resumos.filter(function (r) { return r.classe.id === 'real' || r.classe.id === 'oculto'; })
        .reduce(function (s, r) { return s + (r.op.valor || 0); }, 0),
      emRisco: resumos.filter(function (r) { return r.classe.id === 'falso' || r.classe.id === 'construcao'; })
        .reduce(function (s, r) { return s + (r.op.valor || 0); }, 0),
      zumbi: resumos.filter(function (r) { return r.classe.id === 'zumbi'; })
        .reduce(function (s, r) { return s + (r.op.valor || 0); }, 0)
    };
  }

  function pesoForca(forca) {
    const f = P.FORCAS.find(function (x) { return x.id === forca; });
    return f ? f.peso : 1;
  }

  function evidenciasDaDimensao(op, dimensao) {
    return eventosDeDecisao(op).filter(function (e) { return e.dimensao === dimensao; });
  }

  /* Nota 2 significa "comprovado". Sem uma evidência ao menos confirmada,
     não é comprovação: é opinião do vendedor sobre o cliente. */
  function podeComprovar(op, dimensao) {
    return evidenciasDaDimensao(op, dimensao).some(function (e) {
      return pesoForca(e.forca) >= P.FORCA_MINIMA_PARA_COMPROVAR;
    });
  }

  /* Quem produziu as evidências. Se vier tudo da mesma pessoa, a conta
     inteira está apoiada nela — e agora isso é fato, não suposição. */
  function autoria(op) {
    const contagem = {};
    eventosDeDecisao(op).forEach(function (e) {
      if (!e.contatoId) return;
      contagem[e.contatoId] = (contagem[e.contatoId] || 0) + 1;
    });
    const ids = Object.keys(contagem);
    const total = ids.reduce(function (s, id) { return s + contagem[id]; }, 0);
    const principal = ids.sort(function (a, b) { return contagem[b] - contagem[a]; })[0];
    return {
      pessoas: ids.length,
      total: total,
      principal: principal ? Store.contato(principal) : null,
      concentracao: total ? (contagem[principal] || 0) / total : 0
    };
  }

  /* O compromisso combinado é o relógio mais honesto do funil:
     não mede o nosso esforço, mede a palavra do cliente. */
  function compromisso(op) {
    const c = op.proximoCompromisso;
    if (!c || !c.data) return null;
    const atraso = diasEntre(c.data);
    const vencido = new Date(c.data + 'T00:00:00') < new Date(Store.hoje() + 'T00:00:00');
    return {
      texto: c.texto || 'Próximo passo combinado',
      data: c.data,
      dono: c.dono || 'cliente',
      vencido: vencido,
      diasAtraso: vencido ? atraso : 0,
      diasAte: vencido ? 0 : diasEntre(Store.hoje(), c.data)
    };
  }

  function tempoNaEtapa(op) {
    return diasEntre(op.etapaDesde || op.criadoEm);
  }

  /* Mediana da própria carteira, não benchmark de mercado. */
  function medianaEtapaGanhos(oportunidades, etapa) {
    const tempos = oportunidades
      .filter(function (o) { return o.desfecho && o.desfecho.tipo === 'ganho'; })
      .map(function (o) { return o.desfecho.diasEmAberto || 0; })
      .filter(function (d) { return d > 0; })
      .sort(function (a, b) { return a - b; });
    if (!tempos.length) return null;
    const meio = Math.floor(tempos.length / 2);
    const total = tempos.length % 2 ? tempos[meio] : (tempos[meio - 1] + tempos[meio]) / 2;
    /* Aproximação: o tempo total dividido pelas etapas do processo. */
    return Math.round(total / P.ETAPAS.length);
  }

  /* Delta da semana: o que mudou na decisão nos últimos 7 dias. */
  function deltaSemana(op) {
    const recentes = (op.snapshots || []).filter(function (s) { return diasEntre(s.data) <= 7; });
    const evidencias = eventosDeDecisao(op).filter(function (e) { return diasEntre(e.data) <= 7; });
    const mudancas = recentes.filter(function (s) { return s.dimensaoAlterada; }).map(function (s) {
      const d = P.DIMENSOES.find(function (x) { return x.id === s.dimensaoAlterada; });
      return { nome: d ? d.nome : s.dimensaoAlterada, de: s.de, para: s.para };
    });
    const ganho = mudancas.reduce(function (soma, m) { return soma + ((m.para || 0) - (m.de || 0)); }, 0);
    return { iadDelta: ganho, evidencias: evidencias.length, mudancas: mudancas };
  }

  /* Série para a curva do IAD: um ponto por snapshot, do mais antigo ao mais novo. */
  function curva(op) {
    const pontos = (op.snapshots || []).map(function (s) {
      const d = s.dimensaoAlterada ? P.DIMENSOES.find(function (x) { return x.id === s.dimensaoAlterada; }) : null;
      return { data: s.data, iad: s.iad, dimensao: d ? d.nome : null, de: s.de, para: s.para };
    });
    if (op.desfecho) pontos.push({ data: op.desfecho.data, iad: op.desfecho.iadFinal, dimensao: null, fecho: true });
    return pontos;
  }

  /* Histórico unificado: evidência, atividade, pontuação e mudanças de sistema
     na mesma linha do tempo, em ordem. */
  function historico(op) {
    return (op.eventos || []).slice().sort(function (a, b) {
      return b.data.localeCompare(a.data);
    });
  }

  /* Sugestão de dimensão a partir do texto da evidência: pura palavra-chave,
     visível e sempre editável pelo vendedor. Não é IA, e não finge ser. */
  const PISTAS = {
    problema: ['problema', 'perda', 'retrabalho', 'parada', 'gargalo', 'desperdicio', 'reclamacao', 'dificuldade', 'falha'],
    prioridade: ['prazo', 'urgente', 'trimestre', 'meta', 'safra', 'cronograma', 'adiar', 'este ano', 'orcamento anual'],
    impacto: ['payback', 'roi', 'retorno', 'economia', 'business case', 'calculo', 'numeros', 'r$', 'reducao de custo', 'estimativa'],
    criterios: ['criterio', 'requisito', 'checklist', 'rfp', 'comparativo', 'avaliacao', 'especificacao', 'edital'],
    stakeholders: ['cfo', 'ceo', 'diretor', 'gerente', 'apresentou', 'incluiu', 'entrou', 'participou', 'convidou', 'novo decisor'],
    consenso: ['reuniao interna', 'alinhou', 'alinhamento', 'apoio', 'encaminhou', 'comite', 'internamente', 'defendeu'],
    risco: ['piloto', 'prova de conceito', 'poc', 'referencia', 'visita', 'sla', 'garantia', 'teste', 'seguranca'],
    processo: ['contrato', 'juridico', 'assinatura', 'homologacao', 'cadastro', 'compras', 'alcada', 'aprovacao', 'faturamento']
  };
  const ORDEM_DESEMPATE = ['processo', 'consenso', 'stakeholders', 'risco', 'criterios', 'impacto', 'prioridade', 'problema'];

  function sugerirDimensao(texto) {
    if (!texto) return null;
    const limpo = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let melhor = null, melhorPontos = 0;
    ORDEM_DESEMPATE.forEach(function (id) {
      const pontos = PISTAS[id].filter(function (pista) { return limpo.indexOf(pista) !== -1; }).length;
      if (pontos > melhorPontos) { melhorPontos = pontos; melhor = id; }
    });
    return melhor;
  }

  /* O que falta, em ordem, com o caminho para resolver cada item.
     Responde à pergunta que o vendedor faz olhando a tela: e agora? */
  function lacunas(op) {
    const lista = [];
    const cob = coverage(op);

    ORDEM_DECISAO.forEach(function (id) {
      const d = P.DIMENSOES.find(function (x) { return x.id === id; });
      const nota = op.dims[id] || 0;
      const provas = evidenciasDaDimensao(op, id);

      /* Nota 2 sem evidência confirmada também é lacuna: falta a prova, não a nota. */
      if (nota === 2) {
        if (podeComprovar(op, id)) return;
        lista.push({
          tipo: 'comprovacao',
          dimensao: d,
          nota: nota,
          titulo: d.nome,
          falta: 'Está como comprovado, mas nenhuma evidência confirmada sustenta isso.',
          comoProvar: d.evidencias[0],
          evidencias: d.evidencias,
          registradas: provas.length,
          canal: d.canais.email,
          pontos: 0
        });
        return;
      }
      /* Com nota 0 o texto era a própria pergunta da decisão, o que se lia como
         afirmação: "O cliente reconheceu o problema" logo abaixo de "não
         sabemos". Agora descreve o estado — que já está escrito em niveis[0] —
         e a pergunta vai à parte, rotulada como pergunta. */
      const falta = nota === 0
        ? d.niveis[0]
        : 'Falta comprovar: hoje é ' + d.niveis[1].toLowerCase().replace(/\.$/, '') + '.';

      lista.push({
        tipo: 'dimensao',
        dimensao: d,
        nota: nota,
        titulo: d.nome,
        falta: falta,
        pergunta: d.pergunta,
        comoProvar: d.evidencias[0],
        evidencias: d.evidencias,
        registradas: provas.length,
        canal: nota === 0 ? d.canais.whatsapp : d.canais.email,
        pontos: 2 - nota
      });
    });

    if (cob.faltando.length) {
      lista.push({
        tipo: 'papel',
        papeis: cob.faltando,
        titulo: cob.faltando.length === 1 ? cob.faltando[0] : 'Papéis ausentes no grupo comprador',
        falta: 'Ninguém ocupa ' + (cob.faltando.length === 1 ? 'este papel' : 'estes papéis') + ': ' + cob.faltando.join(', ') + '.',
        comoProvar: 'Peça ao champion a apresentação a essas áreas e registre a evidência quando elas participarem.',
        pontos: 0
      });
    }

    if (cob.mapeados && !cob.mobilizadores) {
      lista.push({
        tipo: 'mobilizador',
        titulo: 'Nenhum mobilizador identificado',
        falta: 'O grupo tem ' + cob.mapeados + ' pessoa(s), mas nenhuma classificada como Go-Getter, Professor ou Cético.',
        comoProvar: 'Classifique os contatos pelo perfil e procure quem já mobilizou uma mudança antes.',
        pontos: 0
      });
    }

    const insight = op.insight || {};
    if (insight.estado !== 'aceito') {
      lista.push({
        tipo: 'insight',
        titulo: 'Insight comercial',
        falta: insight.estado === 'nenhum'
          ? 'Não há um reenquadramento formulado: estamos vendendo solução para um problema que o cliente já definiu sozinho.'
          : 'O insight foi ' + (insight.estado === 'formulado' ? 'formulado, mas não apresentado' : 'apresentado, mas o cliente ainda não o adotou') + '.',
        comoProvar: 'Evidência que resolve: o cliente repetir o reenquadramento como se fosse dele.',
        pontos: 0
      });
    }

    if (!compromisso(op)) {
      lista.push({
        tipo: 'compromisso',
        titulo: 'Próximo passo combinado',
        falta: 'Não há data combinada — sem isso não dá para saber se o negócio atrasou.',
        comoProvar: 'Feche uma data com o cliente e registre de quem é a vez.',
        pontos: 0
      });
    }

    return lista;
  }

  /* Foco do dia: o app procura o vendedor, em vez de esperar ser procurado.
     Uma linha por negócio, a mais urgente primeiro. */
  function focoDoDia(oportunidades, tarefas) {
    const itens = [];
    const porOp = {};
    (tarefas || []).filter(function (t) { return t.status === 'aberta'; }).forEach(function (t) {
      if (!t.oportunidadeId) return;
      (porOp[t.oportunidadeId] = porOp[t.oportunidadeId] || []).push(t);
    });

    oportunidades.filter(function (o) { return !o.desfecho; }).forEach(function (op) {
      const r = resumo(op);
      const push = function (urgencia, motivo, acao) {
        itens.push({ resumo: r, urgencia: urgencia, motivo: motivo, acao: acao, tarefas: porOp[op.id] || [] });
      };
      const comp = r.compromisso;
      const vencidas = (porOp[op.id] || []).filter(function (t) { return t.vencimento < Store.hoje(); });

      if (comp && comp.vencido) {
        push(3, 'Compromisso vencido há ' + comp.diasAtraso + ' dia(s): ' + comp.texto,
          comp.dono === 'cliente'
            ? 'Cobre o retorno combinado e reagende com data nova.'
            : 'A bola está com você: entregue o que foi combinado hoje.');
      } else if (vencidas.length) {
        push(3, vencidas.length + ' tarefa(s) vencida(s)', vencidas[0].titulo);
      } else if (r.evidenceAge > 30) {
        push(3, r.evidenceAge + ' dias sem evidência do cliente', 'Requalifique ou encerre: registre o desfecho real.');
      } else if (depoisDaProposta(op) && !r.coverage.temEconomicBuyer) {
        push(3, 'Em ' + op.etapa.toLowerCase() + ' sem acesso ao decisor econômico', r.nbd.acao);
      } else if (depoisDaProposta(op) && !r.gates.liberado) {
        push(3, 'Proposta emitida com prontidão de ' + r.gates.prontidao + '%', 'Feche as lacunas: ' + r.gates.pendentes.map(function (p) { return p.nome; }).join(', ') + '.');
      } else if (r.evidenceAge > 14) {
        push(2, r.evidenceAge + ' dias sem evidência do cliente', r.nbd.acao);
      } else if (r.velocity === 0) {
        push(2, 'Nenhuma microdecisão nos últimos 30 dias', r.nbd.acao);
      } else if (r.coverage.mapeados <= 1) {
        push(1, 'Depende de uma única pessoa', r.nbd.acao);
      } else {
        push(0, 'Próxima decisão: ' + (r.nbd.dimensao ? r.nbd.dimensao.nome : 'formalização'), r.nbd.acao);
      }
    });
    itens.sort(function (a, b) {
      return b.urgencia - a.urgencia || (b.resumo.op.valor || 0) - (a.resumo.op.valor || 0);
    });
    return {
      itens: itens,
      urgentes: itens.filter(function (i) { return i.urgencia >= 2; }),
      valorUrgente: itens.filter(function (i) { return i.urgencia >= 2; })
        .reduce(function (s, i) { return s + (i.resumo.op.valor || 0); }, 0)
    };
  }

  /* Aprendizado: compara a foto da decisão no fechamento entre ganhos e perdas.
     É a única forma de o IAD deixar de ser hipótese. */
  function aprendizado(oportunidades) {
    const fechadas = oportunidades.filter(function (o) { return o.desfecho; });
    const por = function (tipo) { return fechadas.filter(function (o) { return o.desfecho.tipo === tipo; }); };
    const ganhos = por('ganho');
    const perdidos = fechadas.filter(function (o) {
      return o.desfecho.tipo === 'perdido_concorrente' || o.desfecho.tipo === 'perdido_inacao';
    });
    const media = function (lista, fn) {
      return lista.length ? lista.reduce(function (s, o) { return s + fn(o); }, 0) / lista.length : null;
    };
    const iadDe = function (o) { return o.desfecho.iadFinal != null ? o.desfecho.iadFinal : 0; };

    const porDimensao = P.DIMENSOES.map(function (d) {
      const g = media(ganhos, function (o) { return (o.desfecho.dimsFinal || {})[d.id] || 0; });
      const p = media(perdidos, function (o) { return (o.desfecho.dimsFinal || {})[d.id] || 0; });
      return { id: d.id, nome: d.nome, ganho: g, perdido: p, diferenca: (g == null || p == null) ? null : g - p };
    }).sort(function (a, b) { return (b.diferenca || 0) - (a.diferenca || 0); });

    return {
      total: fechadas.length,
      ganhos: ganhos.length,
      perdidosConcorrente: por('perdido_concorrente').length,
      perdidosInacao: por('perdido_inacao').length,
      adiados: por('adiado').length,
      valorGanho: ganhos.reduce(function (s, o) { return s + (o.desfecho.valorFinal || 0); }, 0),
      taxaGanho: fechadas.length ? ganhos.length / fechadas.length : null,
      taxaInacao: fechadas.length ? por('perdido_inacao').length / fechadas.length : null,
      iadGanhos: media(ganhos, iadDe),
      iadPerdidos: media(perdidos, iadDe),
      coverageGanhos: media(ganhos, function (o) { return o.desfecho.coverageFinal || 0; }),
      coveragePerdidos: media(perdidos, function (o) { return o.desfecho.coverageFinal || 0; }),
      cicloGanhos: media(ganhos, function (o) { return o.desfecho.diasEmAberto || 0; }),
      porDimensao: porDimensao,
      confiavel: ganhos.length >= 5 && perdidos.length >= 5,
      fechadas: fechadas
    };
  }

  global.IADEngine = {
    iad, evidenceAge, faixaEvidencia, decisionVelocity, coverage, gates,
    saude, classificar, nextBestDecision, alertas, resumo, carteira,
    focoDoDia, aprendizado, sugerirDimensao, podeComprovar, evidenciasDaDimensao,
    filtrar, mesesDisponiveis, segmentosDisponiveis, rotuloMes, segmentoDe, faixaSaude,
    porMes, porSegmento, porEtapa, matrizDecisoes, distribuicaoEvidencia,
    autoria, compromisso, mobilizadores, bloqueadores, tempoNaEtapa, medianaEtapaGanhos, deltaSemana, curva, historico, lacunas,
    stakeholdersDaOp, diasEntre, indiceEtapa, depoisDaProposta
  };
})(window);
