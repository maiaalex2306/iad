/* Telas. Cada função devolve HTML; as ações chamam window.App.*  */
(function (global) {
  'use strict';

  const P = global.IADPlaybook, Store = global.IADStore, E = global.IADEngine, U = global.IADUI;
  const esc = U.esc;

  /* ---------------- Hoje: a tela do vendedor ---------------- */
  function hoje() {
    const est = Store.obter();
    if (!est.oportunidades.length) return boasVindas();

    const foco = E.focoDoDia(est.oportunidades);
    if (!foco.itens.length) {
      return cabecalhoHoje(foco) + '<div class="card"><div class="vazio">Nenhum negócio aberto. Toda a carteira está encerrada.</div></div>';
    }

    const urgencias = ['', 'Atenção', 'Prioridade', 'Urgente'];
    const classes = ['', '', 'warn', 'dead'];

    const itens = foco.itens.slice(0, 12).map(function (i) {
      const r = i.resumo;
      return '<div class="foco u' + i.urgencia + '">' +
        '<div class="row"><strong>' + esc(r.op.titulo) + '</strong><span class="espaco"></span>' +
        (i.urgencia ? '<span class="pill ' + classes[i.urgencia] + '">' + urgencias[i.urgencia] + '</span>' : '') +
        '<span class="pill navy">' + U.compacto(r.op.valor) + '</span></div>' +
        '<div class="small muted">' + esc((r.conta && r.conta.nome) || '') + ' · ' + esc(r.op.etapa) + ' · IAD ' + r.iad + '/16</div>' +
        '<div class="small" style="margin-top:8px"><strong>' + esc(i.motivo) + '</strong></div>' +
        '<div class="small muted">' + esc(i.acao) + '</div>' +
        '<div class="row" style="margin-top:10px">' +
        '<button class="btn alt mini" onclick="App.novaEvidencia(\'' + r.op.id + '\')">Registrar evidência</button>' +
        '<button class="btn ghost mini" onclick="App.abrir(\'' + r.op.id + '\')">Abrir</button></div></div>';
    }).join('');

    return cabecalhoHoje(foco) + '<div class="lista-foco">' + itens + '</div>';
  }

  function cabecalhoHoje(foco) {
    const n = foco.urgentes.length;
    return '<div class="row"><h1>Hoje</h1><span class="espaco"></span>' +
      '<button class="btn alt mini" onclick="App.capturaRapida()">+ Evidência</button></div>' +
      '<p class="muted small">' +
      (n
        ? n + ' negócio(s) precisam de você agora · ' + U.compacto(foco.valorUrgente) + ' envolvidos'
        : 'Nada urgente. A lista abaixo está em ordem de prioridade.') +
      '</p>';
  }

  /* ---------------- Painel executivo ---------------- */
  function painel() {
    const est = Store.obter();
    if (!est.oportunidades.length) return boasVindas();
    const c = E.carteira(est.oportunidades);

    const kpi = function (rot, val, obs) {
      return '<div class="kpi"><div class="rot">' + esc(rot) + '</div><div class="val">' + val + '</div><div class="obs">' + esc(obs || '') + '</div></div>';
    };

    const grupos = ['real', 'oculto', 'construcao', 'falso', 'zumbi'].map(function (id) {
      const g = c.porGrupo[id];
      if (!g) return '';
      return '<tr><td>' + esc(g.rotulo) + '</td><td class="right">' + g.qtd + '</td><td class="right">' + U.compacto(g.valor) + '</td>' +
        '<td class="right">' + Math.round((g.valor / (c.total || 1)) * 100) + '%</td></tr>';
    }).join('');

    const travas = c.travas.slice(0, 5).map(function (t) {
      return '<tr><td>' + esc(t.nome) + '</td><td class="right">' + t.qtd + '</td><td class="right">' + U.compacto(t.valor) + '</td></tr>';
    }).join('');

    const criticos = c.resumos
      .map(function (r) { return { r: r, altos: r.alertas.filter(function (a) { return a.nivel === 'alto'; }) }; })
      .filter(function (x) { return x.altos.length; })
      .sort(function (a, b) { return (b.r.op.valor || 0) - (a.r.op.valor || 0); })
      .slice(0, 6)
      .map(function (x) {
        return '<button class="item g-' + x.r.classe.id + '" onclick="App.abrir(\'' + x.r.op.id + '\')">' +
          '<div class="row"><span class="tit">' + esc(x.r.op.titulo) + '</span><span class="espaco"></span>' +
          '<span class="pill navy">' + U.compacto(x.r.op.valor) + '</span></div>' +
          '<div class="small muted">' + esc((x.r.conta && x.r.conta.nome) || '') + ' · ' + esc(x.r.op.etapa) + ' · IAD ' + x.r.iad + '/16</div>' +
          '<div class="small" style="margin-top:6px">⚠ ' + esc(x.altos[0].texto) + '</div></button>';
      }).join('') || '<div class="vazio">Nenhum risco crítico aberto.</div>';

    return '<h1>Painel de decisão</h1>' +
      '<p class="muted small">Onde está o dinheiro e qual decisão do cliente o está segurando.</p>' +
      '<div class="grid k4">' +
        kpi('Pipeline aberto', U.compacto(c.total), c.qtd + ' oportunidades') +
        kpi('Pipeline saudável', U.compacto(c.saudavel), 'decisão madura e em movimento') +
        kpi('Pipeline em risco', U.compacto(c.emRisco), 'decisão imatura para a etapa') +
        kpi('Pipeline zumbi', U.compacto(c.zumbi), 'sem evidência há +30 dias') +
      '</div>' +
      '<div class="grid k4" style="margin-top:12px">' +
        kpi('IAD médio', U.numero(c.iadMedio, 1) + '<span class="small muted">/16</span>', 'maturidade da decisão') +
        kpi('Evidence Age médio', U.numero(c.evidenceAgeMedio, 1) + '<span class="small muted"> dias</span>', 'tempo sem movimento do cliente') +
        kpi('Stakeholder Coverage', Math.round(c.coverageMedio) + '%', 'papéis críticos cobertos') +
        kpi('Proposal Readiness', Math.round(c.prontidaoMedia) + '%', 'prontidão média para propor') +
      '</div>' +
      '<div class="grid k2" style="margin-top:14px">' +
        '<div class="card"><h2>Qualidade do pipeline</h2><div class="tabela-rolagem"><table><thead><tr><th>Grupo</th><th class="right">Qtd</th><th class="right">Valor</th><th class="right">%</th></tr></thead><tbody>' + grupos + '</tbody></table></div></div>' +
        '<div class="card"><h2>O que está travando a receita</h2><div class="tabela-rolagem"><table><thead><tr><th>Decisão pendente</th><th class="right">Qtd</th><th class="right">Valor</th></tr></thead><tbody>' + (travas || '<tr><td colspan="3" class="muted">Sem travas mapeadas.</td></tr>') + '</tbody></table></div>' +
        '<p class="tiny muted" style="margin-top:10px">Leia como: “este valor só anda quando esta decisão acontecer dentro do cliente”.</p></div>' +
      '</div>' +
      '<div class="sec-titulo"><h2>Riscos críticos</h2><span class="tiny muted">maior valor primeiro</span></div>' +
      '<div class="lista">' + criticos + '</div>' +
      aprendizado();
  }

  /* O que a carteira fechada já ensinou. Com pouca amostra, diz que é pouca amostra. */
  function aprendizado() {
    const a = E.aprendizado(Store.obter().oportunidades);
    if (!a.total) {
      return '<div class="sec-titulo"><h2>Aprendizado da carteira</h2></div>' +
        '<div class="card"><div class="vazio small">Nenhum negócio encerrado ainda. Ao fechar uma oportunidade — ganha ou perdida — o app congela a foto das oito decisões daquele dia. É a comparação entre essas fotos que valida o modelo.</div></div>';
    }

    const pct = function (v) { return v == null ? '—' : Math.round(v * 100) + '%'; };
    const num = function (v, c) { return v == null ? '—' : U.numero(v, c || 1); };

    const linhas = a.porDimensao.map(function (d) {
      return '<tr><td>' + esc(d.nome) + '</td><td class="right">' + num(d.ganho) + '</td>' +
        '<td class="right">' + num(d.perdido) + '</td>' +
        '<td class="right">' + (d.diferenca == null ? '—' : (d.diferenca > 0 ? '+' : '') + num(d.diferenca)) + '</td></tr>';
    }).join('');

    const top = a.porDimensao.filter(function (d) { return d.diferenca != null && d.diferenca > 0; })[0];

    return '<div class="sec-titulo"><h2>Aprendizado da carteira</h2><span class="tiny muted">' + a.total + ' negócio(s) encerrado(s)</span></div>' +
      '<div class="grid k4">' +
        '<div class="kpi"><div class="rot">Taxa de ganho</div><div class="val">' + pct(a.taxaGanho) + '</div><div class="obs">' + a.ganhos + ' ganhos</div></div>' +
        '<div class="kpi"><div class="rot">Perdas por inação</div><div class="val">' + pct(a.taxaInacao) + '</div><div class="obs">' + a.perdidosInacao + ' clientes não decidiram</div></div>' +
        '<div class="kpi"><div class="rot">IAD no fechamento</div><div class="val">' + num(a.iadGanhos) + '<span class="small muted"> × ' + num(a.iadPerdidos) + '</span></div><div class="obs">ganhos × perdidos</div></div>' +
        '<div class="kpi"><div class="rot">Coverage no fechamento</div><div class="val">' + (a.coverageGanhos == null ? '—' : Math.round(a.coverageGanhos) + '%') + '<span class="small muted"> × ' + (a.coveragePerdidos == null ? '—' : Math.round(a.coveragePerdidos) + '%') + '</span></div><div class="obs">ganhos × perdidos</div></div>' +
      '</div>' +
      '<div class="card" style="margin-top:12px"><h3>Quais decisões separaram ganho de perda</h3>' +
      (a.confiavel
        ? (top ? '<p class="small">Maior diferença até aqui: <strong>' + esc(top.nome) + '</strong>.</p>' : '')
        : '<div class="aviso" style="margin-bottom:10px">Amostra pequena (' + a.ganhos + ' ganhos, ' + (a.perdidosConcorrente + a.perdidosInacao) + ' perdas). Leia como indício, não como conclusão — a partir de cerca de cinco de cada lado os números começam a significar algo.</div>') +
      '<div class="tabela-rolagem"><table><thead><tr><th>Decisão</th><th class="right">Ganhos</th><th class="right">Perdidos</th><th class="right">Diferença</th></tr></thead><tbody>' + linhas + '</tbody></table></div>' +
      '<p class="tiny muted" style="margin-top:8px">Nota média (0 a 2) de cada dimensão no dia em que o negócio foi encerrado.</p></div>';
  }

  function boasVindas() {
    return '<div class="card"><h1>Bem-vindo ao IAD CRM</h1>' +
      '<p>Este CRM não mede o que o vendedor fez. Mede o que mudou na decisão do comprador.</p>' +
      '<p class="small muted">Comece com dados de demonstração para entender o modelo, ou cadastre sua primeira conta.</p>' +
      '<div class="row"><button class="btn alt" onclick="App.carregarDemo()">Carregar demonstração</button>' +
      '<button class="btn ghost" onclick="App.novaConta()">Criar primeira conta</button></div></div>';
  }

  /* ---------------- Pipeline ---------------- */
  let filtroGrupo = 'todos';

  function pipeline() {
    const est = Store.obter();
    if (filtroGrupo === 'fechados') return pipelineFechados(est);
    const resumos = est.oportunidades.filter(function (o) { return !o.desfecho; }).map(E.resumo)
      .filter(function (r) { return filtroGrupo === 'todos' || r.classe.id === filtroGrupo; })
      .sort(function (a, b) { return b.saude - a.saude; });

    const filtros = [['todos', 'Todos'], ['real', 'Negócio real'], ['oculto', 'Oculto promissor'], ['construcao', 'Em construção'], ['falso', 'Falso avançado'], ['zumbi', 'Zumbi'], ['fechados', 'Encerrados']]
      .map(function (f) {
        return '<button class="pill' + (filtroGrupo === f[0] ? ' orange' : '') + '" onclick="App.filtrar(\'' + f[0] + '\')">' + esc(f[1]) + '</button>';
      }).join(' ');

    const itens = resumos.map(cardOportunidade).join('') ||
      '<div class="vazio">Nenhuma oportunidade neste filtro.</div>';

    return '<div class="row"><h1>Pipeline</h1><span class="espaco"></span>' +
      '<button class="btn alt mini" onclick="App.novaOportunidade()">+ Oportunidade</button></div>' +
      '<div class="row" style="margin:8px 0 14px">' + filtros + '</div>' +
      '<div class="lista">' + itens + '</div>';
  }

  function cabecalhoPipeline(filtros) {
    return '<div class="row"><h1>Pipeline</h1><span class="espaco"></span>' +
      '<button class="btn alt mini" onclick="App.novaOportunidade()">+ Oportunidade</button></div>' +
      '<div class="row" style="margin:8px 0 14px">' + filtros + '</div>';
  }

  function pipelineFechados(est) {
    const filtros = [['todos', 'Todos'], ['real', 'Negócio real'], ['oculto', 'Oculto promissor'], ['construcao', 'Em construção'], ['falso', 'Falso avançado'], ['zumbi', 'Zumbi'], ['fechados', 'Encerrados']]
      .map(function (f) {
        return '<button class="pill' + (filtroGrupo === f[0] ? ' orange' : '') + '" onclick="App.filtrar(\'' + f[0] + '\')">' + esc(f[1]) + '</button>';
      }).join(' ');

    const fechadas = est.oportunidades.filter(function (o) { return o.desfecho; })
      .sort(function (a, b) { return b.desfecho.data.localeCompare(a.desfecho.data); });

    const itens = fechadas.map(function (op) {
      const d = P.DESFECHOS.find(function (x) { return x.id === op.desfecho.tipo; }) || { rotulo: op.desfecho.tipo, classe: '' };
      const conta = Store.conta(op.contaId);
      return '<button class="item" onclick="App.abrir(\'' + op.id + '\')">' +
        '<div class="row"><span class="tit">' + esc(op.titulo) + '</span><span class="espaco"></span>' +
        '<span class="pill ' + d.classe + '">' + esc(d.rotulo) + '</span></div>' +
        '<div class="small muted">' + esc((conta && conta.nome) || '') + ' · ' + U.compacto(op.desfecho.valorFinal) + ' · encerrado em ' + U.data(op.desfecho.data) + '</div>' +
        '<div class="tiny muted" style="margin-top:6px">IAD no fechamento: ' + op.desfecho.iadFinal + '/16 · grupo comprador ' + (op.desfecho.coverageFinal || 0) + '%' +
        (op.desfecho.motivo ? ' · ' + esc(op.desfecho.motivo) : '') + '</div></button>';
    }).join('') || '<div class="vazio">Nenhum negócio encerrado ainda.</div>';

    return cabecalhoPipeline(filtros) + '<div class="lista">' + itens + '</div>';
  }

  function cardOportunidade(r) {
    return '<button class="item g-' + r.classe.id + '" onclick="App.abrir(\'' + r.op.id + '\')">' +
      '<div class="row"><span class="tit">' + esc(r.op.titulo) + '</span><span class="espaco"></span>' +
      '<span class="pill navy">' + U.compacto(r.op.valor) + '</span></div>' +
      '<div class="small muted" style="margin:2px 0 8px">' + esc((r.conta && r.conta.nome) || 'Sem conta') + ' · ' + esc(r.op.etapa) + '</div>' +
      '<div class="row tiny">' +
        '<span class="pill">IAD ' + r.iad + '/16</span>' +
        '<span class="pill ' + r.faixa.classe + '">' + r.evidenceAge + 'd sem evidência</span>' +
        '<span class="pill">Grupo ' + r.coverage.percentual + '%</span>' +
        '<span class="pill">' + esc(r.classe.rotulo) + '</span>' +
      '</div>' +
      '<div style="margin-top:9px">' + U.barra(r.saude) + '</div>' +
      '<div class="tiny muted" style="margin-top:5px">Próxima decisão: ' + esc(r.nbd.dimensao ? r.nbd.dimensao.nome : 'formalização') + '</div>' +
      '</button>';
  }

  /* ---------------- Cockpit da oportunidade ---------------- */
  function cockpit(id) {
    const op = Store.oportunidade(id);
    if (!op) return '<div class="vazio">Oportunidade não encontrada.</div>';
    const r = E.resumo(op);

    const dims = P.DIMENSOES.map(function (d) {
      const v = op.dims[d.id] || 0;
      const notas = [0, 1, 2].map(function (n) {
        return '<button class="' + (v === n ? 'on' + n : '') + '" onclick="App.pontuar(\'' + op.id + '\',\'' + d.id + '\',' + n + ')" title="' + esc(d.niveis[n]) + '">' + n + '</button>';
      }).join('');
      return '<div class="dim"><div class="cab"><span class="nome">' + esc(d.nome) + '</span><div class="notas">' + notas + '</div></div>' +
        '<div class="small muted" style="margin-top:4px">' + esc(d.pergunta) + '</div>' +
        '<div class="tiny muted" style="margin-top:3px">Nível atual: ' + esc(d.niveis[v]) + '</div></div>';
    }).join('');

    const gatesHtml = r.gates.itens.map(function (i) {
      return '<span class="pill ' + (i.ok ? 'ok' : 'dead') + '">' + esc(i.nome) + ' ' + i.atual + '/' + i.min + '</span>';
    }).join(' ');

    const pessoas = E.stakeholdersDaOp(op).map(function (p) {
      return '<div class="pessoa"><div class="nome"><span class="dot ' + p.sentimento + '"></span>' + esc(p.nome) + '</div>' +
        '<div class="tiny muted">' + esc(p.cargo || '—') + '</div>' +
        '<div class="tiny" style="margin-top:5px">' + esc(p.papel) + '</div>' +
        '<div class="row tiny" style="margin-top:7px"><button class="btn ghost mini" onclick="App.editarContato(\'' + p.id + '\')">Editar</button>' +
        '<button class="btn ghost mini" onclick="App.removerStakeholder(\'' + op.id + '\',\'' + p.id + '\')">Remover</button></div></div>';
    }).join('') || '<div class="vazio small">Nenhum stakeholder ligado. Venda single-threaded é o maior risco silencioso.</div>';

    const eventos = (op.eventos || []).slice(0, 25).map(function (e) {
      const dim = P.DIMENSOES.find(function (d) { return d.id === e.dimensao; });
      return '<div class="evento ' + (e.tipo === 'activity' ? 'activity' : '') + '">' +
        '<div class="quando">' + U.data(e.data) + ' · ' + (e.tipo === 'activity' ? 'Atividade do vendedor (não conta como avanço)' : 'Evidência do cliente' + (dim ? ' · ' + esc(dim.nome) : '')) + (e.canal ? ' · ' + esc(e.canal) : '') + '</div>' +
        '<div class="small">' + esc(e.titulo) + '</div>' +
        '<button class="btn ghost mini" style="margin-top:5px" onclick="App.removerEvento(\'' + op.id + '\',\'' + e.id + '\')">Excluir</button></div>';
    }).join('') || '<div class="vazio small">Nenhum evento registrado.</div>';

    const alertasHtml = r.alertas.map(function (a) {
      return '<div class="aviso" style="margin-bottom:6px">' + (a.nivel === 'alto' ? '🔴 ' : '🟡 ') + esc(a.texto) + '</div>';
    }).join('');

    const canais = r.nbd.canais ? P.CANAIS.map(function (c) {
      return '<tr><td><strong>' + esc(c.nome) + '</strong></td><td>' + esc(r.nbd.canais[c.id]) + '</td></tr>';
    }).join('') : '';

    const desf = op.desfecho ? P.DESFECHOS.find(function (x) { return x.id === op.desfecho.tipo; }) : null;
    const banner = desf
      ? '<div class="card" style="margin-top:10px"><div class="row"><span class="pill ' + desf.classe + '">' + esc(desf.rotulo) + '</span>' +
        '<span class="small muted">encerrado em ' + U.data(op.desfecho.data) + ' · IAD ' + op.desfecho.iadFinal + '/16 · ' + (op.desfecho.diasEmAberto || 0) + ' dias em aberto</span>' +
        '<span class="espaco"></span><button class="btn ghost mini" onclick="App.reabrir(\'' + op.id + '\')">Reabrir</button></div>' +
        (op.desfecho.motivo ? '<p class="small" style="margin:10px 0 0">' + esc(op.desfecho.motivo) + '</p>' : '') +
        (op.desfecho.concorrente ? '<p class="tiny muted" style="margin:6px 0 0">Concorrente: ' + esc(op.desfecho.concorrente) + '</p>' : '') + '</div>'
      : '';

    return '<div class="row"><button class="btn ghost mini" onclick="App.ir(\'#/pipeline\')">← Pipeline</button>' +
      '<span class="espaco"></span><button class="btn ghost mini" onclick="App.editarOportunidade(\'' + op.id + '\')">Editar</button>' +
      (op.desfecho ? '' : '<button class="btn ghost mini" onclick="App.encerrar(\'' + op.id + '\')">Encerrar</button>') + '</div>' +
      banner +
      '<h1 style="margin-top:10px">' + esc(op.titulo) + '</h1>' +
      '<p class="muted small">' + esc((r.conta && r.conta.nome) || 'Sem conta') + ' · ' + U.moeda(op.valor) + ' · Etapa CRM: ' + esc(op.etapa) + '</p>' +

      '<div class="grid k4">' +
        '<div class="kpi"><div class="rot">IAD</div><div class="val">' + r.iad + '<span class="small muted">/16</span></div><div class="obs">' + esc(r.classe.rotulo) + '</div></div>' +
        '<div class="kpi"><div class="rot">Evidence Age</div><div class="val">' + r.evidenceAge + '<span class="small muted">d</span></div><div class="obs">' + esc(r.faixa.rotulo) + '</div></div>' +
        '<div class="kpi"><div class="rot">Decision Velocity</div><div class="val">' + r.velocity + '</div><div class="obs">decisões em 30 dias</div></div>' +
        '<div class="kpi"><div class="rot">Buying Group</div><div class="val">' + r.coverage.percentual + '%</div><div class="obs">' + r.coverage.mapeados + ' pessoas mapeadas</div></div>' +
      '</div>' +

      '<div class="card" style="margin-top:14px"><h2>Próxima melhor decisão</h2>' +
        (r.nbd.critico ? '<div class="aviso" style="margin-bottom:10px">Risco crítico nesta oportunidade.</div>' : '') +
        '<p><strong>' + esc(r.nbd.decisao) + '</strong></p>' +
        '<p class="small muted">Ação recomendada: ' + esc(r.nbd.acao) + '</p>' +
        (r.nbd.conteudo ? '<p class="tiny muted">Material de apoio: ' + esc(r.nbd.conteudo) + '</p>' : '') +
        (canais ? '<div class="tabela-rolagem" style="margin-top:8px"><table><tbody>' + canais + '</tbody></table></div>' : '') +
        '<div class="row" style="margin-top:12px"><button class="btn alt" onclick="App.novaEvidencia(\'' + op.id + '\')">Registrar evidência do cliente</button>' +
        '<button class="btn ghost" onclick="App.novaAtividade(\'' + op.id + '\')">Registrar atividade</button></div></div>' +

      (alertasHtml ? '<div class="card"><h2>Alertas</h2>' + alertasHtml + '</div>' : '') +

      '<div class="card"><h2>As 8 decisões</h2><p class="tiny muted">0 = desconhecido · 1 = parcial · 2 = comprovado pelo cliente</p>' + dims + '</div>' +

      '<div class="card"><h2>Proposal Gate</h2>' +
        '<div class="row"><span class="pill ' + (r.gates.liberado ? 'ok' : 'risk') + '">Prontidão ' + r.gates.prontidao + '%</span>' +
        (op.gateLiberadoPor ? '<span class="pill warn">Liberado manualmente por ' + esc(op.gateLiberadoPor) + '</span>' : '') + '</div>' +
        '<div style="margin:10px 0">' + U.barra(r.gates.prontidao, !r.gates.liberado) + '</div>' +
        '<div class="row">' + gatesHtml + '</div>' +
        (r.gates.liberado
          ? '<p class="small" style="margin-top:10px">Qualificação mínima atendida: a proposta agora formaliza decisões já tomadas.</p>'
          : '<p class="small" style="margin-top:10px">Faltam: ' + esc(r.gates.pendentes.map(function (p) { return p.nome; }).join(', ')) + '.</p>' +
            '<button class="btn ghost mini" onclick="App.liberarGate(\'' + op.id + '\')">Liberar proposta mesmo assim (fica registrado)</button>') +
      '</div>' +

      '<div class="card"><div class="row"><h2 style="margin:0">Buying group</h2><span class="espaco"></span>' +
        '<button class="btn ghost mini" onclick="App.ligarStakeholder(\'' + op.id + '\')">+ Vincular pessoa</button></div>' +
        '<p class="tiny muted" style="margin:6px 0 10px">Papéis críticos faltando: ' + (r.coverage.faltando.length ? esc(r.coverage.faltando.join(', ')) : 'nenhum') + '</p>' +
        '<div class="mapa">' + pessoas + '</div></div>' +

      '<div class="card"><h2>Linha do tempo da decisão</h2>' +
        '<p class="tiny muted">Verde = o cliente se moveu. Cinza = nós nos movemos.</p>' +
        '<div class="timeline">' + eventos + '</div></div>';
  }

  /* ---------------- Revisão semanal ---------------- */
  function revisao() {
    const est = Store.obter();
    const resumos = est.oportunidades
      .filter(function (o) { return o.etapa !== 'Venda'; })
      .map(E.resumo)
      .sort(function (a, b) { return b.evidenceAge - a.evidenceAge; });

    if (!resumos.length) return '<h1>Revisão semanal</h1><div class="vazio">Sem oportunidades abertas.</div>';

    const cards = resumos.map(function (r) {
      const mudou = (r.op.eventos || []).filter(function (e) { return e.tipo === 'decision' && E.diasEntre(e.data) <= 7; });
      return '<div class="card"><div class="row"><h3 style="margin:0">' + esc(r.op.titulo) + '</h3><span class="espaco"></span>' +
        '<span class="pill ' + r.faixa.classe + '">' + r.evidenceAge + 'd</span></div>' +
        '<div class="small muted">' + esc((r.conta && r.conta.nome) || '') + ' · ' + esc(r.op.etapa) + ' · ' + U.compacto(r.op.valor) + ' · IAD ' + r.iad + '/16</div>' +
        '<p class="small" style="margin-top:10px"><strong>O que mudou na decisão do cliente nos últimos 7 dias?</strong></p>' +
        (mudou.length
          ? '<ul class="small" style="margin:0 0 8px 18px">' + mudou.map(function (e) { return '<li>' + esc(e.titulo) + '</li>'; }).join('') + '</ul>'
          : '<div class="aviso" style="margin-bottom:8px">Nada mudou. Sem evidência nova do lado do cliente, não houve avanço real.</div>') +
        '<p class="small muted">Próxima decisão a provocar: ' + esc(r.nbd.decisao) + '</p>' +
        '<div class="row"><button class="btn alt mini" onclick="App.novaEvidencia(\'' + r.op.id + '\')">Registrar evidência</button>' +
        '<button class="btn ghost mini" onclick="App.abrir(\'' + r.op.id + '\')">Abrir cockpit</button></div></div>';
    }).join('');

    return '<h1>Revisão semanal</h1>' +
      '<p class="muted small">Uma pergunta só, por negócio. Respostas que começam com “nós” não valem.</p>' + cards;
  }

  /* ---------------- Contas e contatos ---------------- */
  function contas() {
    const est = Store.obter();
    if (!est.contas.length) {
      return '<div class="row"><h1>Contas</h1><span class="espaco"></span><button class="btn alt mini" onclick="App.novaConta()">+ Conta</button></div><div class="vazio">Nenhuma conta cadastrada.</div>';
    }
    const lista = est.contas.map(function (c) {
      const pessoas = Store.contatosDaConta(c.id);
      const ops = est.oportunidades.filter(function (o) { return o.contaId === c.id; });
      const chips = pessoas.map(function (p) {
        return '<button class="pill" onclick="App.editarContato(\'' + p.id + '\')"><span class="dot ' + p.sentimento + '"></span>' + esc(p.nome) + ' · ' + esc(p.papel) + '</button>';
      }).join(' ') || '<span class="tiny muted">Nenhum contato.</span>';
      return '<div class="card"><div class="row"><h3 style="margin:0">' + esc(c.nome) + '</h3><span class="espaco"></span>' +
        '<span class="pill">' + ops.length + ' oportunidade(s)</span></div>' +
        '<div class="tiny muted">' + esc(c.segmento || '—') + '</div>' +
        '<div class="row" style="margin-top:10px">' + chips + '</div>' +
        '<div class="row" style="margin-top:10px"><button class="btn ghost mini" onclick="App.novoContato(\'' + c.id + '\')">+ Contato</button>' +
        '<button class="btn ghost mini" onclick="App.novaOportunidade(\'' + c.id + '\')">+ Oportunidade</button></div></div>';
    }).join('');
    return '<div class="row"><h1>Contas</h1><span class="espaco"></span><button class="btn alt mini" onclick="App.novaConta()">+ Conta</button></div>' + lista;
  }

  /* ---------------- Playbook ---------------- */
  function playbook() {
    const dims = P.DIMENSOES.map(function (d) {
      const canais = P.CANAIS.map(function (c) {
        return '<tr><td style="white-space:nowrap"><strong>' + esc(c.nome) + '</strong></td><td>' + esc(d.canais[c.id]) + '</td></tr>';
      }).join('');
      return '<div class="card"><h3>' + esc(d.nome) + '</h3>' +
        '<p class="small"><strong>' + esc(d.pergunta) + '</strong></p>' +
        '<p class="tiny muted">Evidências que contam: ' + esc(d.evidencias.join(' · ')) + '</p>' +
        '<div class="tabela-rolagem"><table><tbody>' + canais + '</tbody></table></div>' +
        '<p class="tiny muted" style="margin-top:8px">Material: ' + esc(d.conteudo) + '</p></div>';
    }).join('');

    const naoContam = P.ATIVIDADES_QUE_NAO_CONTAM.map(function (a) { return '<span class="pill dead">' + esc(a) + '</span>'; }).join(' ');

    return '<h1>Playbook da decisão</h1>' +
      '<div class="card"><h2>A regra</h2>' +
      '<p>O estágio mostra onde a oportunidade está. As decisões mostram se ela realmente avançou.</p>' +
      '<p class="small muted">Não conta como avanço:</p><div class="row">' + naoContam + '</div></div>' +
      '<div class="sec-titulo"><h2>As 8 decisões e a cadência multicanal</h2></div>' + dims;
  }

  /* ---------------- Dados ---------------- */
  function dados() {
    const est = Store.obter();
    return '<h1>Dados e instalação</h1>' +
      '<div class="card"><h2>Instalar no desktop e no celular</h2>' +
      '<p class="small">Este é um PWA: o mesmo código roda no navegador, instala no Windows/macOS/Linux e vira ícone no Android e no iPhone.</p>' +
      '<ul class="small"><li><strong>Android/Chrome/Edge:</strong> menu ⋮ → “Instalar aplicativo”.</li>' +
      '<li><strong>iPhone/Safari:</strong> Compartilhar → “Adicionar à Tela de Início”.</li>' +
      '<li><strong>Desktop:</strong> ícone de instalar na barra de endereço.</li></ul>' +
      '<button class="btn alt" id="btn-instalar" onclick="App.instalar()">Instalar aplicativo</button></div>' +
      '<div class="card"><h2>Backup</h2>' +
      '<p class="small muted">Os dados ficam no dispositivo (offline). Exporte para levar de máquina ou compartilhar com o time.</p>' +
      '<div class="row"><button class="btn" onclick="App.exportar()">Exportar JSON</button>' +
      '<button class="btn ghost" onclick="App.importar()">Importar JSON</button></div>' +
      '<p class="tiny muted" style="margin-top:10px">' + est.contas.length + ' contas · ' + est.contatos.length + ' contatos · ' + est.oportunidades.length + ' oportunidades.</p></div>' +
      '<div class="card"><h2>Demonstração</h2>' +
      '<p class="small muted">Carrega uma carteira fictícia com os quatro grupos de pipeline para treinar a leitura do modelo.</p>' +
      '<div class="row"><button class="btn ghost" onclick="App.carregarDemo()">Carregar demonstração</button>' +
      '<button class="btn ghost" onclick="App.limpar()">Apagar tudo</button></div></div>';
  }

  global.IADViews = {
    hoje, painel, pipeline, cockpit, revisao, contas, playbook, dados,
    definirFiltro: function (f) { filtroGrupo = f; }
  };
})(window);
