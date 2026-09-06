/* Telas. Cada função devolve HTML; as ações chamam window.App.*  */
(function (global) {
  'use strict';

  const P = global.IADPlaybook, Store = global.IADStore, E = global.IADEngine, U = global.IADUI;
  const esc = U.esc;

  /* ---------------- Acesso: login, primeiro acesso e confirmação ---------------- */
  let telaAcesso = 'login';
  let primeiraEmpresa = false;   /* nenhuma empresa no servidor: quem entra monta a casa */
  let pendente = null;      /* usuário no meio do primeiro acesso */
  let recadoAcesso = '';

  function definirPrimeiraEmpresa(sim) { primeiraEmpresa = !!sim; }

  function definirTelaAcesso(tela, usuario, recado) {
    telaAcesso = tela;
    if (usuario !== undefined) pendente = usuario;
    recadoAcesso = recado || '';
  }

  function acesso() {
    const A = global.IADAuth;
    const naNuvem = global.IADNuvem.mandaNoAcesso();
    const corpo = (naNuvem
      ? { login: telaLogin, cadastro: telaCadastroNuvem, confirme: telaConfirmeNuvem, empresa: telaEmpresaNuvem }
      : { login: telaLogin, cadastro: telaCadastro, codigo: telaCodigo, perfil: telaPerfil }
    )[telaAcesso] || telaLogin;

    return '<div class="acesso">' +
      painelAcesso() +
      '<div class="acesso-forma"><div class="cartao-acesso">' +
      '<div class="marca-acesso">IAD <span>CRM</span></div>' +
      '<p class="tiny muted lema-mobile" style="margin:0 0 18px">Gestão comercial orientada à decisão</p>' +
      (recadoAcesso ? '<div class="aviso" style="margin-bottom:14px">' + esc(recadoAcesso) + '</div>' : '') +
      corpo(A) +
      '</div></div></div>';
  }

  /* O painel escuro existe para que a primeira tela já diga do que se trata:
     quem abre o app pela primeira vez precisa saber por que ele é diferente
     de um CRM de funil. Some abaixo de 940px, onde só atrapalharia. */
  function painelAcesso() {
    const pilares = [
      ['1', 'Oito decisões, não oito etapas', 'O IAD mede o que mudou na cabeça do cliente — de 0 a 16.'],
      ['2', 'Só evidência do cliente conta', 'Proposta enviada e follow-up feito não movem o índice.'],
      ['3', 'A próxima decisão, explícita', 'O app aponta qual decisão provocar agora, e por qual canal.']
    ];
    return '<div class="acesso-painel">' +
      '<div><div class="marca-acesso">IAD <span>CRM</span></div>' +
      '<p class="lema">O funil organiza. A decisão fecha.</p></div>' +
      '<ul>' + pilares.map(function (p) {
        return '<li><span class="num">' + p[0] + '</span>' +
          '<span><strong>' + esc(p[1]) + '</strong>' +
          '<span class="diz">' + esc(p[2]) + '</span></span></li>';
      }).join('') + '</ul>' +
      '</div>';
  }

  function campo(id, rotulo, tipo, valor, extra) {
    /* Senha digitada às cegas é onde nasce o "não consigo entrar" que é só erro
       de digitação. O olho revela o que foi escrito, sem guardar nada. */
    if (tipo === 'password') {
      return '<label class="campo"><span>' + esc(rotulo) + '</span>' +
        '<span class="campo-senha">' +
        '<input id="' + id + '" type="password" value="' + esc(valor || '') + '"' + (extra || '') + '>' +
        '<button type="button" class="olho" onclick="App.verSenha(\'' + id + '\', this)"' +
        ' aria-label="Mostrar a senha" data-ajuda="Mostra ou esconde a senha digitada.">👁</button>' +
        '</span></label>';
    }
    return '<label class="campo"><span>' + esc(rotulo) + '</span>' +
      '<input id="' + id + '" type="' + (tipo || 'text') + '" value="' + esc(valor || '') + '"' +
      (extra || '') + '></label>';
  }

  function telaLogin() {
    const naNuvem = global.IADNuvem.mandaNoAcesso();
    return '<h2 style="margin-bottom:' + (naNuvem ? '6' : '14') + 'px">Entrar</h2>' +
      (naNuvem ? '<p class="tiny muted" style="margin-bottom:14px">Sua conta é verificada no servidor.</p>' : '') +
      campo('ac-login', naNuvem ? 'E-mail' : 'Login ou e-mail', 'text', '', ' autocomplete="username"') +
      campo('ac-senha', 'Senha', 'password', '', ' autocomplete="current-password" onkeydown="if(event.key===\'Enter\')App.entrar()"') +
      '<button class="btn alt" style="width:100%;margin-top:6px" onclick="App.entrar()">Entrar</button>' +
      '<p class="small muted" style="margin:16px 0 0">Primeiro acesso? ' +
      '<a href="#" onclick="event.preventDefault();App.telaAcesso(\'cadastro\')">Criar meu acesso</a></p>';
  }

  function telaCadastro() {
    return '<h2 style="margin-bottom:6px">Criar acesso</h2>' +
      '<p class="tiny muted" style="margin-bottom:14px">Depois disso confirmamos seu e-mail com um código.</p>' +
      campo('ac-nome', 'Seu nome', 'text') +
      campo('ac-email', 'E-mail', 'email', '', ' autocomplete="email"') +
      campo('ac-whatsapp', 'WhatsApp', 'text', '', ' placeholder="(00) 00000-0000"') +
      campo('ac-senha1', 'Senha', 'password', '', ' autocomplete="new-password"') +
      campo('ac-senha2', 'Repita a senha', 'password') +
      '<button class="btn alt" style="width:100%;margin-top:6px" onclick="App.criarAcesso()">Continuar</button>' +
      '<p class="small muted" style="margin:16px 0 0">' +
      '<a href="#" onclick="event.preventDefault();App.telaAcesso(\'login\')">Voltar para o login</a></p>';
  }

  /* ---------- primeiro acesso com servidor ----------
     Aqui não há código na tela: quem confirma o e-mail é o Supabase, pelo link
     que ele manda. O código de seis dígitos existia só porque, sem servidor,
     não havia como mandar e-mail nenhum. */
  function telaCadastroNuvem() {
    return '<h2 style="margin-bottom:6px">Criar acesso</h2>' +
      '<p class="tiny muted" style="margin-bottom:14px">Você vai receber um e-mail para confirmar.</p>' +
      campo('ac-nome', 'Seu nome', 'text') +
      campo('ac-email', 'E-mail', 'email', '', ' autocomplete="email"') +
      campo('ac-whatsapp', 'WhatsApp', 'text', '', ' placeholder="(00) 00000-0000"') +
      campo('ac-senha1', 'Senha', 'password', '', ' autocomplete="new-password"') +
      campo('ac-senha2', 'Repita a senha', 'password') +
      '<button class="btn alt" style="width:100%;margin-top:6px" onclick="App.criarAcesso()">Criar acesso</button>' +
      '<p class="small muted" style="margin:16px 0 0">' +
      '<a href="#" onclick="event.preventDefault();App.telaAcesso(\'login\')">Voltar para o login</a></p>';
  }

  function telaConfirmeNuvem() {
    return '<h2 style="margin-bottom:6px">Confirme seu e-mail</h2>' +
      '<p class="small muted">Enviamos um e-mail para <strong>' +
      esc((pendente && pendente.email) || '') + '</strong>. Abra e clique no link.</p>' +
      '<div class="aviso" style="margin:12px 0">Ao clicar, o navegador pode mostrar uma página de erro. ' +
      'A confirmação já aconteceu assim mesmo — o link tenta voltar para um endereço que não existe aqui.</div>' +
      '<button class="btn alt" style="width:100%" onclick="App.telaAcesso(\'login\')">Já confirmei, quero entrar</button>';
  }

  /* Duas telas diferentes, e a diferença importa: quem monta a casa cria a
     primeira empresa; quem chega depois não cria nada, espera ser ligado. Dar o
     formulário a todo mundo foi o que produziu empresas paralelas e carteiras
     divididas. */
  function telaEmpresaNuvem() {
    if (!primeiraEmpresa) {
      return '<h2 style="margin-bottom:6px">Falta ligar você a uma empresa</h2>' +
        '<p class="small muted" style="margin-bottom:14px">Sua conta existe e a senha está certa. ' +
        'O que falta é quem administra o sistema ligar você à empresa — sem isso não há carteira para mostrar.</p>' +
        '<div class="aviso" style="margin-bottom:14px">Avise quem administra e diga o e-mail que você usou. ' +
        'Leva um minuto do lado dele.</div>' +
        '<button class="btn alt" style="width:100%" onclick="App.tentarDeNovo()">Já me ligaram, tentar de novo</button>' +
        '<p class="small muted" style="margin:14px 0 0">' +
        '<a href="#" onclick="event.preventDefault();App.sair(true)">Sair</a></p>';
    }
    return '<h2 style="margin-bottom:6px">Sua empresa</h2>' +
      '<p class="tiny muted" style="margin-bottom:14px">Você é o primeiro a entrar, então cria a empresa e passa a administrá-la. ' +
      'Quem vier depois não cria: você liga cada pessoa à empresa dela.</p>' +
      campo('ac-empresa-nova', 'Nome da empresa', 'text') +
      campo('ac-cnpj', 'CNPJ', 'text') +
      '<button class="btn alt" style="width:100%;margin-top:6px" onclick="App.criarEmpresaAcesso()">Criar e entrar</button>' +
      '<p class="small muted" style="margin:14px 0 0">' +
      '<a href="#" onclick="event.preventDefault();App.sair(true)">Sair</a></p>';
  }

  function telaCodigo() {
    const codigo = pendente && pendente.codigo;
    return '<h2 style="margin-bottom:6px">Confirme seu e-mail</h2>' +
      '<p class="small muted">Enviamos um código de seis dígitos para <strong>' +
      esc((pendente && pendente.email) || '') + '</strong>.</p>' +
      (codigo
        ? '<div class="aviso" style="margin:12px 0"><strong>Modo local:</strong> este app roda sem servidor, ' +
          'então o e-mail não sai de verdade. Seu código é <span class="mono-destaque">' + esc(codigo) + '</span>.</div>'
        : '') +
      campo('ac-codigo', 'Código de seis dígitos', 'text', '', ' inputmode="numeric" maxlength="6" onkeydown="if(event.key===\'Enter\')App.confirmarCodigo()"') +
      '<button class="btn alt" style="width:100%;margin-top:6px" onclick="App.confirmarCodigo()">Confirmar</button>' +
      '<p class="small muted" style="margin:14px 0 0">' +
      '<a href="#" onclick="event.preventDefault();App.reenviarCodigo()">Gerar outro código</a> · ' +
      '<a href="#" onclick="event.preventDefault();App.telaAcesso(\'login\')">Voltar</a></p>';
  }

  function telaPerfil(A) {
    const empresas = A.tenants();
    return '<h2 style="margin-bottom:6px">Complete seu cadastro</h2>' +
      '<p class="tiny muted" style="margin-bottom:14px">Você vai enxergar as oportunidades da sua empresa.</p>' +
      (empresas.length
        ? '<label class="campo"><span>Empresa</span><select id="ac-empresa">' +
          '<option value="">— cadastrar nova abaixo —</option>' +
          empresas.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.nome) + '</option>'; }).join('') +
          '</select></label>'
        : '') +
      campo('ac-empresa-nova', 'Nome da empresa', 'text') +
      campo('ac-cnpj', 'CNPJ da empresa', 'text') +
      campo('ac-nome2', 'Seu nome', 'text', (pendente && pendente.nome) || '') +
      campo('ac-whats2', 'WhatsApp', 'text', (pendente && pendente.whatsapp) || '') +
      '<button class="btn alt" style="width:100%;margin-top:6px" onclick="App.completarPerfil()">Concluir e entrar</button>';
  }

  /* Barra do administrador: o único que escolhe empresa e usuário. */
  function barraAdmin() {
    const A = global.IADAuth;
    if (!A.ehAdmin()) return '';
    const f = A.filtros();
    const empresas = A.tenants();
    const pessoas = A.usuarios().filter(function (u) {
      return u.papel !== 'admin' && (f.tenant === 'todas' || u.tenantId === f.tenant);
    });

    return '<div class="barra-admin">' +
      '<span class="etiqueta">Administrador</span>' +
      '<label>Empresa<select onchange="App.filtrarTenant(this.value)">' +
        '<option value="todas"' + (f.tenant === 'todas' ? ' selected' : '') + '>Todas as empresas</option>' +
        empresas.map(function (t) {
          return '<option value="' + esc(t.id) + '"' + (f.tenant === t.id ? ' selected' : '') + '>' + esc(t.nome) + '</option>';
        }).join('') + '</select></label>' +
      '<label>Usuário<select onchange="App.filtrarUsuarioAdmin(this.value)">' +
        '<option value="todos"' + (f.usuario === 'todos' ? ' selected' : '') + '>Todos os usuários</option>' +
        pessoas.map(function (u) {
          return '<option value="' + esc(u.id) + '"' + (f.usuario === u.id ? ' selected' : '') + '>' + esc(u.nome || u.email || u.login) + '</option>';
        }).join('') + '</select></label>' +
      '</div>';
  }

  /* ---------------- Hoje: a tela do vendedor ---------------- */
  const URGENCIAS = [
    { chave: 3, rotulo: 'Urgente', classe: 'dead', cor: 'var(--dead)' },
    { chave: 2, rotulo: 'Prioridade', classe: 'warn', cor: 'var(--risk)' },
    { chave: 'resto', rotulo: 'Em dia', classe: 'ok', cor: 'var(--ok)' }
  ];
  let filtroHoje = 'todos';

  function hoje() {
    const est = Store.dados();
    if (!est.oportunidades.length) return boasVindas();

    const G = global.IADGraficos;
    const foco = E.focoDoDia(est.oportunidades, est.tarefas);
    if (!foco.itens.length) {
      return '<h1>Hoje</h1><div class="card"><div class="vazio">Nenhum negócio aberto. Toda a carteira está encerrada.</div></div>';
    }

    const balde = function (i) { return i.urgencia >= 3 ? 3 : (i.urgencia === 2 ? 2 : 'resto'); };
    const grupos = URGENCIAS.map(function (u) {
      const itens = foco.itens.filter(function (i) { return balde(i) === u.chave; });
      return Object.assign({}, u, {
        qtd: itens.length,
        valor: itens.reduce(function (s, i) { return s + (i.resumo.op.valor || 0); }, 0)
      });
    });

    const cartoesResumo = grupos.map(function (g) {
      const ativo = String(filtroHoje) === String(g.chave);
      return '<button class="tile ' + g.classe + (ativo ? ' ativo' : '') + '" onclick="App.filtrarHoje(\'' + g.chave + '\')">' +
        '<span class="qtd">' + g.qtd + '</span>' +
        '<span class="rot">' + esc(g.rotulo) + '</span>' +
        '<span class="val">' + U.compacto(g.valor) + '</span></button>';
    }).join('');

    const visiveis = foco.itens.filter(function (i) {
      return filtroHoje === 'todos' || String(balde(i)) === String(filtroHoje);
    });

    const itens = visiveis.slice(0, 15).map(cartaoFoco).join('') ||
      '<div class="vazio">Nada neste filtro.</div>';

    return '<div class="row"><h1>Hoje</h1><span class="espaco"></span>' +
      '<button class="btn alt mini" onclick="App.capturaRapida()" data-ajuda-titulo="Registrar evidência" data-ajuda="O cliente se moveu. Só isso zera o tempo sem evidência e permite subir a nota da decisão.">+ Evidência</button></div>' +
      '<p class="muted small">' + (grupos[0].qtd
        ? grupos[0].qtd + ' negócio(s) precisam de você agora · ' + U.compacto(grupos[0].valor) + ' envolvidos'
        : 'Nada urgente hoje.') + '</p>' +
      '<div class="tiles">' + cartoesResumo +
        '<button class="tile todos' + (filtroHoje === 'todos' ? ' ativo' : '') + '" onclick="App.filtrarHoje(\'todos\')">' +
        '<span class="qtd">' + foco.itens.length + '</span><span class="rot">Todos</span>' +
        '<span class="val">' + U.compacto(foco.itens.reduce(function (s, i) { return s + (i.resumo.op.valor || 0); }, 0)) + '</span></button>' +
      '</div>' +
      '<div class="card" style="padding:14px 16px">' +
        G.composicao(grupos.filter(function (g) { return g.valor > 0; }).map(function (g) {
          return { rotulo: g.rotulo, valor: g.valor, cor: g.cor };
        })) + '</div>' +
      '<div class="lista-foco">' + itens + '</div>';
  }

  function cartaoFoco(i) {
    const r = i.resumo;
    const rotulos = ['', 'Atenção', 'Prioridade', 'Urgente'];
    const classes = ['', '', 'warn', 'dead'];
    const tarefas = (i.tarefas || []).slice(0, 3).map(function (t) {
      const atrasada = t.vencimento < Store.hoje();
      return '<div class="tarefa-linha"><button class="quadro" onclick="event.stopPropagation();App.concluirTarefa(\'' + t.id + '\')" title="Concluir"></button>' +
        '<span class="small">' + esc(t.titulo) + '</span>' +
        '<span class="espaco"></span><span class="tiny ' + (atrasada ? 'atrasado' : 'muted') + '">' + U.data(t.vencimento) + '</span></div>';
    }).join('');

    const falta = r.lacunas.length
      ? r.lacunas.slice(0, 3).map(function (l) { return esc(l.titulo); }).join(' · ') +
        (r.lacunas.length > 3 ? ' · +' + (r.lacunas.length - 3) : '')
      : 'nada — resta formalizar';

    return '<div class="foco u' + i.urgencia + '">' +
      '<div class="row"><strong>' + esc(r.op.titulo) + '</strong><span class="espaco"></span>' +
      (i.urgencia ? '<span class="pill ' + classes[i.urgencia] + '">' + rotulos[i.urgencia] + '</span>' : '') +
      '<span class="pill navy">' + U.compacto(r.op.valor) + '</span></div>' +
      '<div class="small muted">' + esc((r.conta && r.conta.nome) || '') + ' · ' + esc(r.op.etapa) + '</div>' +

      '<div class="linha-avanco">' + tiraDecisao(r.op) +
        '<span class="iad">' + r.iad + '<span class="de">/16</span></span>' +
        '<span class="espaco"></span>' +
        '<span class="pill ' + r.faixa.classe + '">' + r.evidenceAge + 'd</span>' +
        '<span class="pill">grupo ' + r.coverage.percentual + '%</span>' +
      '</div>' +

      '<div class="motivo"><strong>' + esc(i.motivo) + '</strong><br><span class="muted">' + esc(i.acao) + '</span></div>' +
      '<div class="tiny muted" style="margin-top:6px">Falta: ' + falta + '</div>' +
      (tarefas ? '<div class="tarefas">' + tarefas + '</div>' : '') +
      '<div class="row" style="margin-top:10px">' +
      '<button class="btn alt mini" onclick="App.novaEvidencia(\'' + r.op.id + '\')" data-ajuda-titulo="Registrar evidência" data-ajuda="O que o cliente fez nesta semana. Se nada mudou do lado dele, não houve avanço — e é isso que a revisão quer expor.">Registrar evidência</button>' +
      '<button class="btn ghost mini" onclick="App.abrir(\'' + r.op.id + '\')">Abrir</button></div></div>';
  }

  /* ---------------- Painel executivo ---------------- */
  let filtroPeriodo = 'todos';
  let filtroSegmento = 'todos';

  function painel() {
    const est = Store.dados();
    if (!est.oportunidades.length) return boasVindas();

    const G = global.IADGraficos;
    const abertas = est.oportunidades.filter(function (o) { return !o.desfecho; });
    const meses = E.mesesDisponiveis(est.oportunidades);
    const segmentos = E.segmentosDisponiveis(est.oportunidades);

    /* Se o filtro apontar para um mês que sumiu, volta para tudo. */
    if (filtroPeriodo !== 'todos' && meses.indexOf(filtroPeriodo) === -1) filtroPeriodo = 'todos';
    if (filtroSegmento !== 'todos' && segmentos.indexOf(filtroSegmento) === -1) filtroSegmento = 'todos';

    const selecionadas = E.filtrar(abertas, { periodo: filtroPeriodo, segmento: filtroSegmento });
    const c = E.carteira(selecionadas);
    const resumos = c.resumos;

    const filtros =
      '<div class="filtros">' +
        '<div class="grupo-filtro"><span class="rot">Período</span>' +
          pill('todos', filtroPeriodo, 'App.filtrarPeriodo', 'Todos', 'Sem recorte de mês: o painel inteiro considera toda a carteira aberta.') +
          meses.map(function (m) { return pill(m, filtroPeriodo, 'App.filtrarPeriodo', E.rotuloMes(m),
            'Recorta o painel inteiro pelos negócios com fechamento previsto para ' + E.rotuloMes(m) + '.'); }).join('') +
        '</div>' +
        '<div class="grupo-filtro"><span class="rot">Segmento</span>' +
          pill('todos', filtroSegmento, 'App.filtrarSegmento', 'Todos', 'Sem recorte de segmento: todos os mercados juntos.') +
          segmentos.map(function (seg) { return pill(seg, filtroSegmento, 'App.filtrarSegmento', seg,
            'Recorta o painel inteiro pelas empresas do segmento ' + seg + '.'); }).join('') +
        '</div>' +
      '</div>';

    if (!resumos.length) {
      return '<h1>Painel de decisão</h1>' + filtros +
        '<div class="card"><div class="vazio">Nenhuma oportunidade aberta neste recorte.</div></div>';
    }

    const composicao = G.composicao([
      { rotulo: 'Saudável', valor: c.saudavel, cor: G.CORES_SAUDE.saudavel },
      { rotulo: 'Em risco', valor: c.emRisco, cor: G.CORES_SAUDE.risco },
      { rotulo: 'Zumbi', valor: c.zumbi, cor: G.CORES_SAUDE.zumbi }
    ]);

    const porMes = E.porMes(resumos);
    const porEtapa = E.porEtapa(resumos).map(function (e) {
      return { rotulo: e.etapa, valor: e.valor, saudavel: e.saudavel, risco: e.valor - e.saudavel, zumbi: 0,
               nota: e.qtd + ' neg. · IAD médio ' + U.numero(e.iadMedio, 1) };
    });
    const porSegmento = E.porSegmento(resumos).map(function (seg) {
      return { rotulo: seg.segmento, valor: seg.valor, saudavel: seg.saudavel, risco: seg.risco, zumbi: seg.zumbi,
               nota: seg.qtd + ' neg. · IAD médio ' + U.numero(seg.iadMedio, 1) };
    });
    const travas = c.travas.slice(0, 8).map(function (t) {
      return { rotulo: t.nome, valor: t.valor, nota: t.qtd + ' negócio(s)' };
    });
    const evidencia = E.distribuicaoEvidencia(resumos);

    const kpi = function (rot, val, obs, classe) {
      return '<div class="kpi ' + (classe || '') + '"><div class="rot">' + esc(rot) + '</div><div class="val">' + val + '</div>' +
        '<div class="obs">' + esc(obs || '') + '</div></div>';
    };

    return '<div class="row"><h1>Painel de decisão</h1><span class="espaco"></span>' +
      '<span class="tiny muted">' + (filtroPeriodo === 'todos' ? 'todos os meses' : E.rotuloMes(filtroPeriodo)) +
      ' · ' + (filtroSegmento === 'todos' ? 'todos os segmentos' : esc(filtroSegmento)) + '</span></div>' +
      filtros +

      '<div class="grid k4">' +
        kpi('Pipeline aberto', U.compacto(c.total), c.qtd + ' oportunidades') +
        kpi('Saudável', U.compacto(c.saudavel), 'decisão madura e em movimento', 'bom') +
        kpi('Em risco', U.compacto(c.emRisco), 'decisão imatura para a etapa', 'atencao') +
        kpi('Zumbi', U.compacto(c.zumbi), 'sem evidência há +30 dias', 'ruim') +
      '</div>' +
      '<div class="card"><h2>Composição do pipeline</h2>' + composicao +
        '<div class="grid k4" style="margin-top:14px">' +
          kpi('IAD médio', U.numero(c.iadMedio, 1) + '<span class="small muted">/16</span>', 'maturidade da decisão') +
          kpi('Evidence Age médio', U.numero(c.evidenceAgeMedio, 1) + '<span class="small muted">d</span>', 'sem movimento do cliente') +
          kpi('Coverage', Math.round(c.coverageMedio) + '%', 'papéis críticos cobertos') +
          kpi('Prontidão', Math.round(c.prontidaoMedia) + '%', 'para emitir proposta') +
        '</div></div>' +

      '<div class="card"><h2>Como estão os negócios por mês</h2>' +
        '<p class="tiny muted">Por mês de fechamento previsto. Toque em um mês para filtrar o painel inteiro.</p>' +
        G.colunasPorMes(porMes, 'App.filtrarPeriodo') + '</div>' +

      '<div class="grid k2">' +
        '<div class="card"><h2>Por etapa do funil</h2>' +
          '<p class="tiny muted">O comprimento é o dinheiro; a cor diz quanto dele tem decisão madura.</p>' +
          G.barrasHorizontais(porEtapa, { descricao: 'Valor por etapa, separado por saúde da decisão' }) + '</div>' +
        '<div class="card"><h2>Por segmento</h2>' +
          '<p class="tiny muted">Onde a carteira está concentrada e com que qualidade.</p>' +
          G.barrasHorizontais(porSegmento, { descricao: 'Valor por segmento, separado por saúde da decisão' }) + '</div>' +
      '</div>' +

      '<div class="card"><h2>Cada oportunidade e suas 8 decisões</h2>' +
        '<p class="tiny muted">Uma linha por negócio, do maior valor para o menor. Toque para abrir.</p>' +
        G.matriz(E.matrizDecisoes(resumos, 14), P.DIMENSOES) + '</div>' +

      '<div class="grid k2">' +
        '<div class="card"><h2>O que está travando a receita</h2>' +
          '<p class="tiny muted">Valor que só anda quando esta decisão acontecer dentro do cliente.</p>' +
          G.barrasHorizontais(travas, { semLegenda: true, descricao: 'Valor parado por decisão pendente' }) + '</div>' +
        '<div class="card"><h2>Tempo sem evidência do cliente</h2>' +
          '<p class="tiny muted">Quanto do pipeline está parado, e há quanto tempo.</p>' +
          G.composicao(evidencia.map(function (f) {
            return { rotulo: f.rotulo + ' (' + f.qtd + ')', valor: f.valor,
                     cor: { ok: 'var(--ok)', warn: 'var(--warn)', risk: 'var(--risk)', dead: 'var(--dead)' }[f.classe] };
          })) + '</div>' +
      '</div>' +

      riscosCriticos(resumos) +
      aprendizado();
  }

  function pill(valor, atual, acao, rotulo, ajuda) {
    return '<button class="pill' + (String(valor) === String(atual) ? ' orange' : '') + '" onclick="' + acao + '(\'' +
      String(valor).replace(/'/g, "\\'") + '\')"' + (ajuda ? ' data-ajuda="' + esc(ajuda) + '"' : '') +
      '>' + esc(rotulo) + '</button>';
  }

  function riscosCriticos(resumos) {
    const criticos = resumos
      .map(function (r) { return { r: r, altos: r.alertas.filter(function (a) { return a.nivel === 'alto'; }) }; })
      .filter(function (x) { return x.altos.length; })
      .sort(function (a, b) { return (b.r.op.valor || 0) - (a.r.op.valor || 0); })
      .slice(0, 6)
      .map(function (x) {
        return '<button class="item g-' + x.r.classe.id + '" onclick="App.abrir(\'' + x.r.op.id + '\')">' +
          '<div class="row"><span class="tit">' + esc(x.r.op.titulo) + '</span><span class="espaco"></span>' +
          '<span class="pill navy">' + U.compacto(x.r.op.valor) + '</span></div>' +
          '<div class="small muted">' + esc((x.r.conta && x.r.conta.nome) || '') + ' · ' + esc(x.r.op.etapa) + '</div>' +
          '<div class="row" style="margin-top:7px;gap:8px">' + tiraDecisao(x.r.op) + '<span class="tiny muted">' + x.r.iad + '/16</span></div>' +
          '<div class="small" style="margin-top:6px">⚠ ' + esc(x.altos[0].texto) + '</div></button>';
      }).join('');

    if (!criticos) return '';
    return '<div class="sec-titulo"><h2>Riscos críticos</h2><span class="tiny muted">maior valor primeiro</span></div>' +
      '<div class="lista">' + criticos + '</div>';
  }

  /* O que a carteira fechada já ensinou. Com pouca amostra, diz que é pouca amostra. */
  function aprendizado() {
    const a = E.aprendizado(Store.dados().oportunidades);
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
      '<p class="small muted">Comece com dados de demonstração para entender o modelo, cadastre sua primeira conta ou importe sua carteira de uma planilha.</p>' +
      '<div class="row"><button class="btn alt" onclick="App.carregarDemo()" data-ajuda-titulo="Demonstração" data-ajuda="Carrega uma carteira fictícia com os cinco grupos de pipeline, para treinar a leitura do modelo. Substitui o que está aqui.">Carregar demonstração</button>' +
      '<button class="btn ghost" onclick="App.novaConta()" data-ajuda-titulo="Primeira empresa" data-ajuda="Cadastre a empresa. Depois vêm os contatos e a oportunidade — ou faça tudo de uma vez pelo botão + Oportunidade.">Criar primeira conta</button>' +
      '<button class="btn ghost" onclick="App.ir(\'#/dados\')" data-ajuda-titulo="Importar planilha" data-ajuda="Traz empresas, contatos ou oportunidades de um CSV. Os modelos ficam em ⚙︎ Dados.">Importar planilha</button></div></div>';
  }

  /* ---------------- Pipeline ---------------- */
  let filtroGrupo = 'todos';
  /* A regra que move um negócio entre estes grupos é a lógica central do app, e
     estava invisível: o vendedor via o rótulo e não sabia o que o tirava dali.
     Cada balão diz o que é, o que faz entrar e o que faz sair — que é como as
     oportunidades navegam entre as alternativas.

     A ordem importa: o app testa de cima para baixo e o negócio fica no
     primeiro grupo que servir. Por isso Zumbi ganha de todos. */
  const FILTROS = [
    ['todos', 'Todos', {
      oQue: 'Toda a carteira aberta. Os cinco grupos abaixo são exclusivos.',
      entra: 'O app testa as regras nesta ordem e o negócio fica na primeira que servir: Zumbi, Falso avançado, Oculto promissor, Negócio real, Em construção.',
      sai: 'Nada muda de grupo por decisão sua: muda quando a decisão do cliente, o tempo sem evidência ou a etapa mudam.',
      faca: 'Comece pelos vermelhos: Falso avançado e Zumbi são os que distorcem a previsão.'
    }],
    ['real', 'Negócio real', {
      oQue: 'Decisão madura, movimento recente e consenso em construção. É o que a previsão pode contar.',
      entra: 'IAD 11 ou mais · até 14 dias sem evidência do cliente · metade ou mais dos papéis críticos mapeados.',
      sai: 'Passar de 14 dias sem evidência devolve para Em construção; passar de 30 vira Zumbi.',
      faca: 'Mantenha o ritmo e proteja a data. Aqui o risco é achar que está ganho.'
    }],
    ['oculto', 'Oculto promissor', {
      oQue: 'A decisão amadureceu mais rápido do que a etapa do funil indica. A previsão está subestimando este negócio.',
      entra: 'IAD 11 ou mais, com a etapa ainda antes de Proposta.',
      sai: 'Ao mover para Proposta: vira Negócio real se o gate estiver liberado e houver decisor econômico; senão cai em Falso avançado.',
      faca: 'Acelere. Leve à proposta antes que o interesse esfrie.'
    }],
    ['construcao', 'Em construção', {
      oQue: 'A decisão ainda está sendo formada. É onde o negócio fica quando nenhuma outra regra serve.',
      entra: 'Nenhuma das outras condições se aplica — normalmente IAD abaixo de 11.',
      sai: 'Chegar a IAD 11 com evidência dos últimos 14 dias e metade dos papéis críticos leva a Negócio real.',
      faca: 'Ataque a lacuna que o cockpit aponta como primeira. Resolver uma costuma destravar as seguintes.'
    }],
    ['falso', 'Falso avançado', {
      oQue: 'Etapa adiantada com decisão imatura. É o maior destruidor de previsão de vendas.',
      entra: 'Etapa em Proposta ou adiante e ao menos um destes: IAD abaixo de 11, Proposal Gate não liberado, ou nenhum decisor econômico mapeado.',
      sai: 'Resolvendo as três condições — ou voltando a etapa para onde a decisão realmente está.',
      faca: 'Pare de empurrar a proposta e volte a comprovar. Insistir aqui gasta o negócio.'
    }],
    ['zumbi', 'Zumbi', {
      oQue: 'Mais de 30 dias sem nenhuma evidência do comprador. Ocupa lugar na previsão e na sua cabeça.',
      entra: 'Mais de 30 dias sem evidência do cliente — não importa o IAD nem a etapa. Esta regra vence todas as outras.',
      sai: 'Qualquer evidência nova do cliente zera o relógio e devolve o negócio ao grupo que a decisão dele indicar.',
      faca: 'Requalifique com uma tentativa clara, ou encerre como perdido por inação.'
    }],
    ['fechados', 'Encerrados', {
      oQue: 'Negócios com desfecho registrado: ganho, perdido para concorrente, perdido por inação ou adiado.',
      entra: 'Ao clicar em Encerrar no cockpit. O retrato das oito decisões fica congelado naquele momento.',
      sai: 'Reabrir no cockpit devolve o negócio à carteira ativa.',
      faca: 'É daqui que sai o Aprendizado do painel: quais decisões estavam fracas nos negócios perdidos.'
    }]
  ];

  let modoPipeline = 'lista';

  function pipeline() {
    const est = Store.dados();
    const filtros = FILTROS.map(function (f) {
      return '<button class="pill tem-ajuda' + (filtroGrupo === f[0] ? ' orange' : '') +
        '" onclick="App.filtrar(\'' + f[0] + '\')">' + esc(f[1]) +
        ajudaDoGrupo(f[1], f[2]) + '</button>';
    }).join(' ');

    if (filtroGrupo === 'fechados') return cabecalhoPipeline(filtros) + listaFechados(est);

    const resumos = est.oportunidades.filter(function (o) { return !o.desfecho; }).map(E.resumo)
      .filter(function (r) { return filtroGrupo === 'todos' || r.classe.id === filtroGrupo; })
      .sort(function (a, b) { return b.saude - a.saude; });

    if (!resumos.length) {
      return cabecalhoPipeline(filtros) + '<div class="vazio">Nenhuma oportunidade neste filtro.</div>';
    }

    return cabecalhoPipeline(filtros) +
      (modoPipeline === 'kanban'
        ? kanban(resumos)
        : '<div class="lista">' + resumos.map(cardOportunidade).join('') + '</div>');
  }

  function cabecalhoPipeline(filtros) {
    const alternar = ['lista', 'kanban'].map(function (m) {
      return '<button class="pill' + (modoPipeline === m ? ' orange' : '') + '" onclick="App.modoPipeline(\'' + m + '\')" data-ajuda="' +
        (m === 'lista' ? 'Lista ordenada pela saúde da decisão, com IAD, tempo sem evidência e cobertura em cada linha.'
                       : 'Colunas por etapa do funil. A cor da borda continua sendo a decisão: arrastar o cartão não move a decisão do cliente.') +
        '">' +
        (m === 'lista' ? '☰ Lista' : '▦ Kanban') + '</button>';
    }).join(' ');

    return '<div class="row"><h1>Pipeline</h1><span class="espaco"></span>' + alternar +
      '<button class="btn alt mini" onclick="App.novaOportunidade()" data-ajuda-titulo="Nova oportunidade" data-ajuda="Cria o negócio. A empresa e os contatos podem ser cadastrados na mesma janela.">+ Oportunidade</button></div>' +
      '<div class="row filtros-pipeline" style="margin:8px 0 14px">' + filtros + '</div>';
  }

  /* Kanban por etapa do funil. A cor da borda continua sendo a decisão,
     não a etapa — mover o cartão não move a decisão. */
  function kanban(resumos) {
    const etapas = P.ETAPAS.filter(function (e) { return e !== 'Venda'; });
    const colunas = etapas.map(function (etapa) {
      const doGrupo = resumos.filter(function (r) { return r.op.etapa === etapa; });
      const valor = doGrupo.reduce(function (s, r) { return s + (r.op.valor || 0); }, 0);
      const cartoes = doGrupo.map(function (r) { return cartaoKanban(r, etapas); }).join('') ||
        '<div class="vazio tiny">—</div>';
      return '<section class="coluna" ondragover="event.preventDefault()" ondrop="App.soltar(event,\'' + etapa + '\')">' +
        '<header><div class="row" style="gap:6px"><strong>' + esc(etapa) + '</strong><span class="espaco"></span>' +
        '<button class="mais" title="Cadastro rápido nesta etapa" onclick="App.cadastroRapido(\'' + etapa + '\')">+</button></div>' +
        '<span class="tiny muted">' + doGrupo.length + ' · ' + U.compacto(valor) + '</span></header>' +
        '<div class="cartoes">' + cartoes + '</div></section>';
    }).join('');

    return '<div class="kanban">' + colunas + '</div>' +
      '<p class="tiny muted" style="margin-top:8px">Arraste o cartão para mudar a etapa, ou use as setas. A mudança fica registrada no histórico.</p>';
  }

  function cartaoKanban(r, etapas) {
    const i = etapas.indexOf(r.op.etapa);
    const seta = function (destino, simbolo, titulo) {
      if (destino < 0 || destino >= etapas.length) return '';
      return '<button class="seta" title="' + esc(titulo + etapas[destino]) + '" ' +
        'onclick="event.stopPropagation();App.moverEtapa(\'' + r.op.id + '\',\'' + etapas[destino] + '\')">' + simbolo + '</button>';
    };

    return '<article class="mini g-' + r.classe.id + '" draggable="true" ' +
      'ondragstart="App.arrastar(event,\'' + r.op.id + '\')" onclick="App.abrir(\'' + r.op.id + '\')">' +
      '<div class="titulo">' + esc(r.op.titulo) + '</div>' +
      '<div class="tiny muted">' + esc((r.conta && r.conta.nome) || '') + '</div>' +
      '<div class="row" style="margin:7px 0 4px;gap:6px">' + tiraDecisao(r.op) + '</div>' +
      '<div class="row tiny" style="gap:6px">' +
        '<strong>' + U.compacto(r.op.valor) + '</strong>' +
        '<span class="muted">IAD ' + r.iad + '</span>' +
        '<span class="espaco"></span>' +
        '<span class="pill ' + r.faixa.classe + '">' + r.evidenceAge + 'd</span>' +
      '</div>' +
      '<div class="rodape-mini">' + seta(i - 1, '‹', 'Voltar para ') + seta(i + 1, '›', 'Avançar para ') + '</div>' +
      '</article>';
  }

  function listaFechados(est) {
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

    return '<div class="lista">' + itens + '</div>';
  }

  /* Tira compacta: o mesmo mapa das 8 decisões, do tamanho de uma linha. */
  function tiraDecisao(op) {
    return '<span class="tira" aria-hidden="true">' + P.DIMENSOES.map(function (d) {
      const n = op.dims[d.id] || 0;
      const provado = n === 2 && E.podeComprovar(op, d.id);
      return '<i class="' + (n === 2 ? (provado ? 't2' : 't2 sem-prova') : 't' + n) + '" title="' + esc(d.nome) + '"></i>';
    }).join('') + '</span>';
  }

  function cardOportunidade(r) {
    const comp = r.compromisso;
    return '<button class="item g-' + r.classe.id + '" onclick="App.abrir(\'' + r.op.id + '\')">' +
      '<div class="row"><span class="tit">' + esc(r.op.titulo) + '</span><span class="espaco"></span>' +
      '<span class="pill navy">' + U.compacto(r.op.valor) + '</span></div>' +
      '<div class="small muted" style="margin:2px 0 8px">' + esc((r.conta && r.conta.nome) || 'Sem conta') + ' · ' + esc(r.op.etapa) + ' · ' + r.tempoNaEtapa + 'd nesta etapa</div>' +
      '<div class="row tiny">' +
        '<span class="pill">IAD ' + r.iad + '/16</span>' +
        '<span class="pill ' + r.faixa.classe + '">' + r.evidenceAge + 'd sem evidência</span>' +
        '<span class="pill">Grupo ' + r.coverage.percentual + '%</span>' +
        (comp && comp.vencido ? '<span class="pill dead">compromisso vencido</span>' : '') +
        ((r.op.adiamentos || 0) >= 2 ? '<span class="pill warn">' + r.op.adiamentos + ' adiamentos</span>' : '') +
      '</div>' +
      '<div class="row" style="margin-top:9px;gap:8px">' + tiraDecisao(r.op) +
      '<span class="tiny muted">' + r.iad + '/16</span></div>' +
      '<div class="tiny muted" style="margin-top:6px">Falta: ' +
      esc(r.lacunas.length ? r.lacunas.slice(0, 2).map(function (l) { return l.titulo; }).join(', ') +
        (r.lacunas.length > 2 ? ' e mais ' + (r.lacunas.length - 2) : '') : 'nada — resta formalizar') + '</div>' +
      '</button>';
  }

  /* ---------------- Curva do IAD ----------------
     Série única, degraus: o IAD só muda quando uma decisão muda. */
  function curvaIAD(op) {
    const pontos = E.curva(op);
    if (pontos.length < 2) {
      return '<div class="vazio small">A curva aparece a partir da segunda mudança de pontuação.</div>';
    }

    const L = 40, T = 14, larg = 620, alt = 170, D = 26;
    const x0 = L, x1 = larg - 16, y0 = T, y1 = alt - D;
    const datas = pontos.map(function (p) { return new Date(p.data + 'T00:00:00').getTime(); });
    const min = Math.min.apply(null, datas), max = Math.max.apply(null, datas);
    const px = function (t) { return max === min ? x1 : x0 + ((t - min) / (max - min)) * (x1 - x0); };
    const py = function (v) { return y1 - (Math.max(0, Math.min(16, v)) / 16) * (y1 - y0); };

    let d = '';
    pontos.forEach(function (p, i) {
      const X = px(datas[i]), Y = py(p.iad);
      if (i === 0) d += 'M' + X.toFixed(1) + ' ' + Y.toFixed(1);
      else d += ' H' + X.toFixed(1) + ' V' + Y.toFixed(1);
    });

    const grade = [0, 8, 16].map(function (v) {
      return '<line x1="' + x0 + '" y1="' + py(v) + '" x2="' + x1 + '" y2="' + py(v) + '" stroke="var(--line)" stroke-width="1" fill="none"/>' +
        '<text x="' + (x0 - 8) + '" y="' + (py(v) + 4) + '" text-anchor="end" font-size="10" fill="var(--muted)">' + v + '</text>';
    }).join('');

    const marcas = pontos.map(function (p, i) {
      if (!p.dimensao && i !== pontos.length - 1) return '';
      const X = px(datas[i]), Y = py(p.iad);
      const titulo = U.data(p.data) + ' · IAD ' + p.iad +
        (p.dimensao ? ' · ' + p.dimensao + ' ' + p.de + '→' + p.para : '');
      return '<circle cx="' + X.toFixed(1) + '" cy="' + Y.toFixed(1) + '" r="4.5" fill="var(--surface)" stroke="var(--navy-2)" stroke-width="2">' +
        '<title>' + esc(titulo) + '</title></circle>';
    }).join('');

    const ultimo = pontos[pontos.length - 1];
    const ux = px(datas[datas.length - 1]), uy = py(ultimo.iad);

    return '<div class="grafico"><svg viewBox="0 0 ' + larg + ' ' + alt + '" width="100%" height="' + alt + '" role="img" ' +
      'aria-label="Evolução do IAD ao longo do tempo, de ' + U.data(pontos[0].data) + ' a ' + U.data(ultimo.data) + '">' +
      grade +
      '<path d="' + d + '" fill="none" stroke="var(--navy-2)" stroke-width="2" stroke-linejoin="round"/>' +
      marcas +
      '<text x="' + Math.min(ux + 8, larg - 60) + '" y="' + Math.max(uy - 8, 14) + '" font-size="11" font-weight="700" fill="var(--navy-2)">IAD ' + ultimo.iad + '</text>' +
      '<text x="' + x0 + '" y="' + (alt - 8) + '" font-size="10" fill="var(--muted)">' + U.data(pontos[0].data) + '</text>' +
      '<text x="' + x1 + '" y="' + (alt - 8) + '" font-size="10" fill="var(--muted)" text-anchor="end">' + U.data(ultimo.data) + '</text>' +
      '</svg></div>' +
      '<p class="tiny muted">Cada degrau é uma decisão que mudou. Passe o ponteiro sobre um ponto para ver qual.</p>';
  }

  /* ---------------- Cockpit da oportunidade ---------------- */
  function cockpit(id) {
    const op = Store.oportunidade(id);
    if (!op) return '<div class="vazio">Oportunidade não encontrada.</div>';
    const r = E.resumo(op);
    const conta = r.conta;

    const desf = op.desfecho ? P.DESFECHOS.find(function (x) { return x.id === op.desfecho.tipo; }) : null;
    const banner = desf
      ? '<div class="card" style="margin-top:10px"><div class="row"><span class="pill ' + desf.classe + '">' + esc(desf.rotulo) + '</span>' +
        '<span class="small muted">encerrado em ' + U.data(op.desfecho.data) + ' · IAD ' + op.desfecho.iadFinal + '/16 · ' + (op.desfecho.diasEmAberto || 0) + ' dias em aberto</span>' +
        '<span class="espaco"></span><button class="btn ghost mini" onclick="App.reabrir(\'' + op.id + '\')">Reabrir</button></div>' +
        (op.desfecho.motivo ? '<p class="small" style="margin:10px 0 0">' + esc(op.desfecho.motivo) + '</p>' : '') +
        (op.desfecho.concorrente ? '<p class="tiny muted" style="margin:6px 0 0">Concorrente: ' + esc(op.desfecho.concorrente) + '</p>' : '') + '</div>'
      : '';

    return '<div class="row"><button class="btn ghost mini" onclick="App.ir(\'#/pipeline\')">← Pipeline</button>' +
      '<span class="espaco"></span><button class="btn ghost mini" onclick="App.editarOportunidade(\'' + op.id + '\')" data-ajuda-titulo="Editar" data-ajuda="Muda título, valor, etapa, tipo, previsão e concorrentes. Não mexe nas decisões.">Editar</button>' +
      (op.desfecho ? '' : '<button class="btn ghost mini" onclick="App.encerrar(\'' + op.id + '\')" data-ajuda-titulo="Encerrar" data-ajuda="Registra o desfecho e congela o retrato das oito decisões. É daqui que sai o Aprendizado do painel.">Encerrar</button>') + '</div>' +
      banner +
      '<h1 style="margin-top:10px">' + esc(op.titulo) + '</h1>' +
      '<p class="muted small">' + esc((conta && conta.nome) || 'Sem conta') + ' · ' + U.moeda(op.valor) + ' · ' + esc(op.tipo || 'Novo negócio') +
      ' · Etapa CRM: ' + esc(op.etapa) + ' há ' + r.tempoNaEtapa + ' dias' +
      (op.fechamentoPrevisto ? ' · previsão ' + U.data(op.fechamentoPrevisto) : '') + '</p>' +
      (op.concorrentes
        ? '<p class="tiny muted" style="margin:-6px 0 0">Contra: ' + esc(op.concorrentes) + '</p>'
        : '') +

      blocoAvanco(op, r) +
      blocoLacunas(op, r) +
      blocoInsight(op, r) +
      blocoProximoPasso(op, r) +
      blocoAlertas(r) +
      detalhe('As 8 decisões', 'pontue aqui', blocoDimensoes(op)) +
      detalhe('Proposal Gate', r.gates.prontidao + '% de prontidão', blocoGate(op, r)) +
      detalhe('Buying group', r.coverage.mapeados + ' pessoa(s) · ' + r.coverage.percentual + '% dos papéis críticos', blocoGrupo(op, r)) +
      detalhe('Tarefas', contarTarefas(op), blocoTarefas(op)) +
      detalhe('Arquivos', 'anexos por decisão', blocoArquivos(op)) +
      detalhe('Evolução da decisão', 'a curva do IAD', curvaIAD(op)) +
      detalhe('Histórico', 'tudo o que aconteceu', blocoHistorico(op));
  }

  function contarTarefas(op) {
    const abertas = Store.tarefasDaOportunidade(op.id).filter(function (t) { return t.status === 'aberta'; });
    return abertas.length ? abertas.length + ' aberta(s)' : 'nenhuma aberta';
  }

  /* Seções de detalhe ficam recolhidas: o topo responde, o resto aprofunda. */
  function detalhe(titulo, resumo, conteudo) {
    return '<details class="bloco"><summary><span class="tit">' + esc(titulo) + '</span>' +
      '<span class="resumo">' + esc(resumo) + '</span></summary>' +
      '<div class="corpo">' + conteudo + '</div></details>';
  }

  /* Mesmo balão das oito decisões, com o vocabulário dos grupos de pipeline. */
  function ajudaDoGrupo(nome, a) {
    const linha = function (rotulo, texto) {
      return '<span class="ajuda-rot">' + rotulo + '</span><span class="ajuda-linha">' + esc(texto) + '</span>';
    };
    return '<span class="ajuda" role="tooltip">' +
      '<span class="ajuda-titulo">' + esc(nome) + '</span>' +
      '<span class="ajuda-pergunta">' + esc(a.oQue) + '</span>' +
      linha('Entra quando', a.entra) +
      linha('Sai quando', a.sai) +
      linha('O que fazer', a.faca) +
      '</span>';
  }

  /* ---------------- Avanço: o mapa das 8 decisões ---------------- */
  const ESTADOS = ['Não sabemos', 'Parcial', 'Comprovado'];

  function mapaDecisao(op, clicavel) {
    return '<div class="mapa-decisao">' + P.DIMENSOES.map(function (d) {
      const n = op.dims[d.id] || 0;
      const provado = n === 2 && E.podeComprovar(op, d.id);
      const classe = n === 2 ? (provado ? 'q2' : 'q2 sem-prova') : 'q' + n;
      const marca = n === 2 ? (provado ? '✓' : '!') : (n === 1 ? '◐' : '');
      const abre = clicavel ? ' onclick="App.novaEvidencia(\'' + op.id + '\',null,\'' + d.id + '\')"' : '';
      return '<button class="celula tem-ajuda ' + classe + '"' + abre + '>' +
        '<span class="marca">' + marca + '</span>' +
        '<span class="rot">' + esc(d.nome) + '</span>' +
        '<span class="estado">' + esc(n === 2 && !provado ? 'sem prova' : ESTADOS[n]) + '</span>' +
        ajudaDaDimensao(d, n, provado) +
        '</button>';
    }).join('') + '</div>';
  }

  /* Ajuda pelo contexto: o nome da decisão sozinho não diz o que ela quer saber,
     e ninguém abre o Playbook no meio de uma pontuação. O balão traz a pergunta,
     o que cada nota significa — com a atual em destaque — e o que comprova.

     Vai dentro do <button>, então só pode conter conteúdo de frase: spans com
     display block, nunca div ou ul. */
  function ajudaDaDimensao(d, n, provado) {
    const niveis = d.niveis.map(function (texto, i) {
      return '<span class="nivel' + (i === n ? ' agora' : '') + '">' +
        '<span class="n">' + i + '</span>' + esc(texto) + '</span>';
    }).join('');

    const comprova = d.evidencias.slice(0, 3).map(function (e) {
      return '<span class="ev">' + esc(e) + '</span>';
    }).join('');

    return '<span class="ajuda" role="tooltip">' +
      '<span class="ajuda-titulo">' + esc(d.nome) + '</span>' +
      '<span class="ajuda-pergunta">' + esc(d.pergunta) + '</span>' +
      '<span class="ajuda-rot">O que cada nota significa</span>' +
      '<span class="niveis">' + niveis + '</span>' +
      '<span class="ajuda-rot">O que comprova</span>' +
      '<span class="evs">' + comprova + '</span>' +
      (n === 2 && !provado
        ? '<span class="ajuda-alerta">Está em 2 sem evidência confirmada ou documentada.</span>'
        : '') +
      '</span>';
  }

  function blocoAvanco(op, r) {
    const notas = P.DIMENSOES.map(function (d) { return op.dims[d.id] || 0; });
    const provadas = notas.filter(function (n) { return n === 2; }).length;
    const parciais = notas.filter(function (n) { return n === 1; }).length;
    const zeros = notas.filter(function (n) { return n === 0; }).length;
    const faltam = 16 - r.iad;
    const d = r.delta;

    const resumoDelta = d.mudancas.length || d.evidencias
      ? (d.iadDelta > 0 ? '+' + d.iadDelta + ' esta semana · ' : '') + d.evidencias + ' evidência(s) em 7 dias' +
        (d.mudancas.length ? ' · ' + d.mudancas.map(function (m) { return m.nome + ' ' + m.de + '→' + m.para; }).join(', ') : '')
      : 'Nada mudou na decisão nos últimos 7 dias.';

    return '<div class="card destaque-avanco">' +
      '<div class="row"><h2 style="margin:0">Avanço da decisão</h2><span class="espaco"></span>' +
      '<span class="pill ' + r.faixa.classe + '">' + r.evidenceAge + 'd sem evidência</span>' +
      '<span class="pill">' + esc(r.classe.rotulo) + '</span></div>' +

      '<div class="medidor">' +
        '<div class="numero">' + r.iad + '<span class="de">/16</span></div>' +
        '<div class="trilho">' + U.barra((r.iad / 16) * 100) +
          '<div class="legenda tiny muted">' + provadas + ' comprovadas · ' + parciais + ' parciais · ' + zeros + ' em branco · faltam ' + faltam + ' pontos</div>' +
        '</div>' +
      '</div>' +

      mapaDecisao(op, !op.desfecho) +
      '<p class="tiny muted" style="margin:8px 0 0">Toque em uma decisão para registrar a evidência que a comprova.</p>' +
      '<div class="faixa-delta ' + (d.mudancas.length || d.evidencias ? '' : 'parado') + '">' + esc(resumoDelta) + '</div>' +
      '</div>';
  }

  /* ---------------- O que falta ---------------- */
  function blocoLacunas(op, r) {
    if (op.desfecho) return '';
    const lacunas = r.lacunas;
    if (!lacunas.length) {
      return '<div class="card"><h2>O que falta</h2>' +
        '<p class="small">Nada. As oito decisões estão comprovadas, o grupo comprador está coberto e há um próximo passo combinado. O que resta é formalizar.</p></div>';
    }

    const itens = lacunas.map(function (l, i) {
      const rotulo = l.tipo === 'dimensao'
        ? (l.nota === 0 ? 'não sabemos' : 'falta comprovar')
        : ({ comprovacao: 'sem prova', papel: 'papel ausente', mobilizador: 'sem mobilizador',
             insight: 'Teach', compromisso: 'sem data' }[l.tipo] || 'pendente');
      const classe = l.tipo === 'dimensao' && l.nota === 1 ? 'warn' : (l.tipo === 'papel' ? 'risk' : 'dead');

      /* O mesmo texto para as oito decisões não ajuda: o que muda é o que conta
         como evidência em cada uma. Os balões saem do próprio playbook. */
      const d = l.dimensao;
      const acoes = d
        ? '<button class="btn alt mini" onclick="App.novaEvidencia(\'' + op.id + '\',null,\'' + d.id + '\')"' +
            ' data-ajuda-titulo="Evidência de ' + esc(d.nome) + '"' +
            ' data-ajuda="' + esc('O que o CLIENTE fez nesta decisão. Conta, por exemplo: ' +
                d.evidencias.slice(0, 2).join('; ').toLowerCase() + '. O que você apresentou não conta.') + '">Registrar evidência</button>' +
          '<button class="btn ghost mini" onclick="App.novaTarefa(\'' + op.id + '\',\'' + d.id + '\')"' +
            ' data-ajuda-titulo="Tarefa para ' + esc(d.nome) + '"' +
            ' data-ajuda="' + esc('O que VOCÊ vai fazer para provocar esta decisão. Por exemplo: ' +
                d.canais.whatsapp + ' Tarefa é atividade sua: aparece em Hoje, mas não move o índice.') + '">Criar tarefa</button>'
        : (l.tipo === 'compromisso'
            ? '<button class="btn alt mini" onclick="App.definirCompromisso(\'' + op.id + '\')" data-ajuda-titulo="Combinar data" data-ajuda="Registra o próximo passo e a data. Negócio sem próximo passo combinado é negócio no ar.">Combinar data</button>'
            : (l.tipo === 'insight'
                ? '<button class="btn alt mini" onclick="App.definirInsight(\'' + op.id + '\')" data-ajuda-titulo="Definir insight" data-ajuda="O reenquadramento do Challenger: o que você ensina a este cliente que ele não veria sozinho.">Definir insight</button>'
                : '<button class="btn ghost mini" onclick="App.ligarStakeholder(\'' + op.id + '\')" data-ajuda-titulo="Vincular pessoa" data-ajuda="Traz um contato da empresa para o grupo comprador deste negócio.">Vincular pessoa</button>'));

      return '<li class="lacuna">' +
        '<span class="ordem">' + (i + 1) + '</span>' +
        '<div class="conteudo">' +
          '<div class="row"><strong>' + esc(l.titulo) + '</strong><span class="pill ' + classe + '">' + rotulo + '</span></div>' +
          '<p class="small muted">' + esc(l.falta) + '</p>' +
          (l.pergunta ? '<p class="tiny"><span class="muted">A responder:</span> ' + esc(l.pergunta) + '</p>' : '') +
          '<p class="tiny"><span class="muted">O que resolve:</span> ' + esc(l.comoProvar) + '</p>' +
          '<div class="row">' + acoes + '</div>' +
        '</div></li>';
    }).join('');

    return '<div class="card"><div class="row"><h2 style="margin:0">O que falta</h2><span class="espaco"></span>' +
      '<span class="pill">' + lacunas.length + ' item(ns)</span></div>' +
      '<p class="tiny muted" style="margin:6px 0 12px">Em ordem de prioridade: resolver o primeiro costuma destravar os seguintes.</p>' +
      '<ol class="lacunas">' + itens + '</ol></div>';
  }

  /* Teach, do Challenger: o reenquadramento que o cliente não teria sozinho. */
  function blocoInsight(op, r) {
    const ins = op.insight || { estado: 'nenhum', texto: '' };
    const estado = P.ESTADOS_INSIGHT.find(function (e) { return e.id === ins.estado; }) || P.ESTADOS_INSIGHT[0];
    const classe = { nenhum: 'dead', formulado: 'warn', apresentado: 'warn', aceito: 'ok' }[ins.estado] || '';

    return '<div class="card"><div class="row"><h2 style="margin:0">Insight comercial</h2><span class="espaco"></span>' +
      '<span class="pill ' + classe + '">' + esc(estado.rotulo) + '</span>' +
      '<button class="btn ghost mini" onclick="App.definirInsight(\'' + op.id + '\')"' +
      ' data-ajuda-titulo="Insight comercial" data-ajuda="O reenquadramento do Challenger: a verdade sobre o negócio do cliente que ele não enxerga sozinho. Sem isso a conversa começa no problema que ele já conhece — e aí quem decide é o preço.">' +
      (ins.texto ? 'Editar' : 'Definir') + '</button></div>' +
      (ins.texto
        ? '<p class="small" style="margin:10px 0 0">' + esc(ins.texto) + '</p>'
        : '<p class="small muted" style="margin:10px 0 0">Qual verdade sobre o negócio do cliente ele não enxerga sozinho? Sem isso, a conversa começa no problema que ele já sabe que tem — e aí o preço decide.</p>') +
      dicasDoInsight(op, r, ins) +
      '</div>';
  }

  /* ---------------- Dicas: o que fazer agora, tiradas deste negócio ----------------
     O bloco dizia o que é um insight e parava aí. Estas dicas são montadas com o
     que já está gravado — a lacuna do topo, o compromisso, quem está no grupo,
     o concorrente declarado — em vez de conselho genérico de venda. */
  function dicasDoInsight(op, r, ins) {
    if (!r) return '';
    const dicas = [];
    const conta = r.conta;

    if (ins.estado === 'nenhum') {
      dicas.push({ urgencia: 'agora', texto: 'Escreva o reenquadramento antes da próxima conversa. Comece por: "o que ' +
        ((conta && conta.nome) || 'este cliente') + ' trata como custo de operação e na verdade é perda de receita?"' });
      if (op.concorrentes) {
        dicas.push({ urgencia: '', texto: 'Você anotou "' + op.concorrentes + '" como concorrência. O insight precisa mudar o critério de escolha, senão a comparação vira preço.' });
      }
    } else if (ins.estado === 'formulado') {
      dicas.push({ urgencia: 'agora', texto: 'O insight existe mas não foi apresentado. Leve-o à próxima conversa e registre a reação como evidência.' });
    } else if (ins.estado === 'apresentado') {
      dicas.push({ urgencia: 'agora', texto: 'Apresentado, ainda não adotado. Só conta quando o cliente repetir o reenquadramento como se fosse dele — ouça isso e registre como evidência de Problema.' });
    } else {
      dicas.push({ urgencia: '', texto: 'O cliente adotou o reenquadramento. Agora use os critérios dele: peça que a avaliação inclua o que o insight revelou.' });
    }

    const primeira = (r.lacunas || [])[0];
    if (primeira) {
      dicas.push({ urgencia: 'depois', texto: 'A lacuna do topo é ' + primeira.titulo + '. ' + primeira.comoProvar + '.' });
    }

    const c = r.compromisso;
    if (!c) {
      dicas.push({ urgencia: 'agora', texto: 'Não há próximo passo combinado com data. Sem isso não dá para saber se o negócio atrasou.' });
    } else if (c.vencido) {
      dicas.push({ urgencia: 'agora', texto: 'O compromisso "' + c.texto + '" venceu há ' + c.diasAtraso + ' dia(s). Retome ou combine outro.' });
    }

    if (r.coverage && r.coverage.mapeados <= 1) {
      dicas.push({ urgencia: 'depois', texto: 'O negócio depende de uma pessoa só. Peça a ela a apresentação a quem paga e a quem usa.' });
    }

    return '<div class="dicas">' +
      '<span class="dicas-rot">O que fazer agora</span>' +
      dicas.slice(0, 4).map(function (d) {
        return '<span class="dica' + (d.urgencia === 'agora' ? ' urgente' : '') + '">' +
          (d.urgencia === 'agora' ? '<span class="sino">!</span>' : '<span class="sino">·</span>') +
          '<span>' + esc(d.texto) + '</span></span>';
      }).join('') + '</div>';
  }

  /* ---------------- Próximo passo: compromisso + recomendação ---------------- */
  function blocoProximoPasso(op, r) {
    const c = r.compromisso;
    const compromisso = c
      ? '<div class="row"><span class="pill ' + (c.vencido ? 'dead' : 'ok') + '">' +
          (c.vencido ? 'vencido há ' + c.diasAtraso + 'd' : 'em ' + c.diasAte + 'd') + '</span>' +
          '<strong>' + esc(c.texto) + '</strong></div>' +
        '<p class="tiny muted" style="margin:6px 0 0">' + U.data(c.data) + ' · a vez é ' + (c.dono === 'cliente' ? 'do cliente' : 'nossa') + '.</p>'
      : '<p class="small muted" style="margin:0">Nenhum próximo passo combinado com data.</p>';

    const canais = r.nbd.canais ? P.CANAIS.map(function (canal) {
      return '<tr><td><strong>' + esc(canal.nome) + '</strong></td><td>' + esc(r.nbd.canais[canal.id]) + '</td></tr>';
    }).join('') : '';

    return '<div class="card"><div class="row"><h2 style="margin:0">Próximo passo</h2><span class="espaco"></span>' +
      '<button class="btn ghost mini" onclick="App.definirCompromisso(\'' + op.id + '\')">' + (c ? 'Atualizar' : 'Combinar data') + '</button></div>' +
      '<div style="margin:10px 0 14px">' + compromisso + '</div>' +
      (r.nbd.critico ? '<div class="aviso" style="margin-bottom:10px">Risco crítico nesta oportunidade.</div>' : '') +
      '<p class="small"><span class="muted">Decisão a provocar:</span> <strong>' + esc(r.nbd.decisao) + '</strong></p>' +
      '<p class="small muted">' + esc(r.nbd.acao) + '</p>' +
      (canais ? detalhe('Como fazer em cada canal', r.nbd.conteudo || '', '<div class="tabela-rolagem"><table><tbody>' + canais + '</tbody></table></div>') : '') +
      '<div class="row" style="margin-top:12px"><button class="btn alt" onclick="App.novaEvidencia(\'' + op.id + '\')">Registrar evidência</button>' +
      '<button class="btn ghost" onclick="App.fecharReuniao(\'' + op.id + '\')">Fechamento de reunião</button>' +
      '<button class="btn ghost" onclick="App.novaAtividade(\'' + op.id + '\')">Atividade</button></div></div>';
  }

  let filtroHistorico = 'tudo';

  /* "O que falta" já lista compromisso, papéis e provas pendentes.
     Aqui ficam só os riscos que aquela lista não cobre. */
  const ALERTAS_JA_COBERTOS = ['compromisso', 'comprovacao', 'papel'];

  function blocoAlertas(r) {
    const html = r.alertas.filter(function (a) {
      return ALERTAS_JA_COBERTOS.indexOf(a.tipo) === -1;
    }).map(function (a) {
      return '<div class="aviso" style="margin-bottom:6px">' + (a.nivel === 'alto' ? '🔴 ' : '🟡 ') + esc(a.texto) + '</div>';
    }).join('');
    return html ? '<div class="card"><h2>Alertas</h2>' + html + '</div>' : '';
  }

  function blocoDimensoes(op) {
    const dims = P.DIMENSOES.map(function (d) {
      const v = op.dims[d.id] || 0;
      const provas = E.evidenciasDaDimensao(op, d.id);
      const pode = E.podeComprovar(op, d.id);
      const notas = [0, 1, 2].map(function (n) {
        const bloqueado = n === 2 && !pode;
        return '<button class="' + (v === n ? 'on' + n : '') + (bloqueado ? ' bloqueado' : '') + '" ' +
          'onclick="App.pontuar(\'' + op.id + '\',\'' + d.id + '\',' + n + ')" ' +
          'title="' + esc(bloqueado ? 'Exige uma evidência confirmada ou documentada' : d.niveis[n]) + '">' + n + '</button>';
      }).join('');
      return '<div class="dim"><div class="cab"><span class="nome">' + esc(d.nome) + '</span><div class="notas">' + notas + '</div></div>' +
        '<div class="small muted" style="margin-top:4px">' + esc(d.pergunta) + '</div>' +
        '<div class="tiny muted" style="margin-top:3px">' + esc(d.niveis[v]) +
        ' · ' + provas.length + ' evidência(s)' + (pode ? ', ao menos uma confirmada' : ', nenhuma confirmada') + '</div></div>';
    }).join('');

    return '<div class="card"><h2>As 8 decisões</h2>' +
      '<p class="tiny muted">0 = desconhecido · 1 = parcial · 2 = comprovado pelo cliente. A nota 2 exige evidência confirmada ou documentada.</p>' + dims + '</div>';
  }

  function blocoGate(op, r) {
    const gatesHtml = r.gates.itens.map(function (i) {
      return '<span class="pill ' + (i.ok ? 'ok' : 'dead') + '">' + esc(i.nome) + ' ' + i.atual + '/' + i.min + '</span>';
    }).join(' ');

    return '<div class="card"><h2>Proposal Gate</h2>' +
      '<div class="row"><span class="pill ' + (r.gates.liberado ? 'ok' : 'risk') + '">Prontidão ' + r.gates.prontidao + '%</span>' +
      (op.gateLiberadoPor ? '<span class="pill warn">Liberado manualmente por ' + esc(op.gateLiberadoPor) + '</span>' : '') + '</div>' +
      '<div style="margin:10px 0">' + U.barra(r.gates.prontidao, !r.gates.liberado) + '</div>' +
      '<div class="row">' + gatesHtml + '</div>' +
      (r.gates.liberado
        ? '<p class="small" style="margin-top:10px">Qualificação mínima atendida: a proposta agora formaliza decisões já tomadas.</p>'
        : '<p class="small" style="margin-top:10px">Faltam: ' + esc(r.gates.pendentes.map(function (p) { return p.nome; }).join(', ')) + '.</p>' +
          '<button class="btn ghost mini" onclick="App.liberarGate(\'' + op.id + '\')" data-ajuda-titulo="Liberar mesmo assim" data-ajuda="Emite proposta sem a qualificação mínima. Fica registrado quem autorizou — proposta cedo demais é o jeito mais caro de descobrir que o cliente não estava comprando.">Liberar proposta mesmo assim (fica registrado)</button>') +
      '</div>';
  }

  function blocoGrupo(op, r) {
    /* Quem decide primeiro: influência era preenchida e não ordenava nada. */
    const pessoas = E.stakeholdersDaOp(op).slice().sort(function (a, b) {
      return (b.influencia || 2) - (a.influencia || 2);
    }).map(function (p) {
      const chefe = p.reportaA ? Store.contato(p.reportaA) : null;
      return '<div class="pessoa"><div class="nome"><span class="dot ' + p.sentimento + '"></span>' + esc(p.nome) + '</div>' +
        '<div class="tiny muted">' + esc(p.cargo || '—') + '</div>' +
        '<div class="tiny" style="margin-top:5px">' + esc(p.papel) + ' · influência ' + (p.influencia || 2) + '/3</div>' +
        perfilEtiqueta(p) +
        (chefe ? '<div class="tiny muted">reporta a ' + esc(chefe.nome) + '</div>' : '') +
        (p.canalPreferido ? '<div class="tiny muted">fala melhor por ' + esc(p.canalPreferido) + '</div>' : '') +
        '<div class="row tiny" style="margin-top:7px"><button class="btn ghost mini" onclick="App.editarContato(\'' + p.id + '\')">Editar</button>' +
        '<button class="btn ghost mini" onclick="App.removerStakeholder(\'' + op.id + '\',\'' + p.id + '\')">Remover</button></div></div>';
    }).join('') || '<div class="vazio small">Nenhum stakeholder ligado. Venda single-threaded é o maior risco silencioso.</div>';

    const aut = r.autoria;
    const cobPerfis = r.coverage;
    const notaPerfis = '<p class="tiny muted" style="margin:0 0 8px">' +
      cobPerfis.mobilizadores + ' mobilizador(es) · ' + cobPerfis.bloqueadores + ' bloqueador(es) · ' +
      cobPerfis.naoClassificados + ' sem perfil.</p>';
    const notaAutoria = aut.total
      ? '<p class="tiny muted" style="margin:0 0 10px">' + aut.total + ' evidência(s) de ' + aut.pessoas + ' pessoa(s)' +
        (aut.principal ? ' · ' + Math.round(aut.concentracao * 100) + '% vieram de ' + esc(aut.principal.nome) : '') + '.</p>'
      : '';

    /* Contato cadastrado na empresa e não ligado a este negócio some da conta
       da cobertura. Em vez de deixar isso silencioso, o botão diz quantos são. */
    const soltos = Store.contatosDaConta(op.contaId).filter(function (c) {
      return (op.stakeholders || []).indexOf(c.id) === -1;
    });

    return '<div class="card"><div class="row"><h2 style="margin:0">Buying group</h2><span class="espaco"></span>' +
      (soltos.length
        ? '<button class="btn alt mini" onclick="App.ligarTodosStakeholders(\'' + op.id + '\')" data-ajuda-titulo="Vincular todos" data-ajuda="Traz para este negócio os contatos já cadastrados na empresa. Sem eles, a cobertura fica em zero e o app acusa venda de uma perna só.">+ Vincular os ' +
          soltos.length + ' da empresa</button>'
        : '') +
      '<button class="btn ghost mini" onclick="App.ligarStakeholder(\'' + op.id + '\')" data-ajuda-titulo="Vincular pessoa" data-ajuda="Escolhe um contato da empresa para o grupo comprador deste negócio.">+ Vincular pessoa</button></div>' +
      '<p class="tiny muted" style="margin:6px 0 4px">Papéis críticos faltando: ' + (r.coverage.faltando.length ? esc(r.coverage.faltando.join(', ')) : 'nenhum') + '</p>' +
      notaPerfis + notaAutoria +
      '<div class="mapa">' + pessoas + '</div></div>';
  }

  function perfilEtiqueta(p) {
    const perfil = P.PERFIS.find(function (x) { return x.id === (p.perfil || 'nao_classificado'); });
    if (!perfil || perfil.grupo === 'indefinido') return '<div class="tiny muted">perfil não classificado</div>';
    const classe = { mobilizador: 'ok', falador: 'warn', bloqueador: 'dead' }[perfil.grupo] || '';
    return '<div style="margin-top:5px"><span class="pill ' + classe + '" title="' + esc(perfil.dica) + '">' + esc(perfil.rotulo) + '</span></div>';
  }

  function blocoTarefas(op) {
    const tarefas = Store.tarefasDaOportunidade(op.id)
      .sort(function (a, b) { return a.vencimento.localeCompare(b.vencimento); });
    const abertas = tarefas.filter(function (t) { return t.status === 'aberta'; });

    const linhas = abertas.map(function (t) {
      const d = P.DIMENSOES.find(function (x) { return x.id === t.decisaoAlvo; });
      const atrasada = t.vencimento < Store.hoje();
      return '<div class="tarefa-linha"><button class="quadro" onclick="App.concluirTarefa(\'' + t.id + '\')" title="Concluir"></button>' +
        '<span class="small">' + esc(t.titulo) + (d ? ' <span class="tiny muted">→ ' + esc(d.nome) + '</span>' : '') + '</span>' +
        '<span class="espaco"></span>' +
        '<span class="tiny ' + (atrasada ? 'atrasado' : 'muted') + '">' + U.data(t.vencimento) + '</span>' +
        '<button class="btn ghost mini" onclick="App.excluirTarefa(\'' + t.id + '\')">✕</button></div>';
    }).join('') || '<div class="vazio small">Nenhuma tarefa aberta.</div>';

    return '<div class="card"><div class="row"><h2 style="margin:0">Tarefas</h2><span class="espaco"></span>' +
      '<button class="btn ghost mini" onclick="App.novaTarefa(\'' + op.id + '\')">+ Tarefa</button></div>' +
      '<p class="tiny muted" style="margin:6px 0 10px">Toda tarefa aponta para a decisão que pretende provocar. Tarefa sem decisão-alvo é agenda, não venda.</p>' +
      '<div class="tarefas">' + linhas + '</div></div>';
  }

  function blocoArquivos(op) {
    return '<div class="card"><div class="row"><h2 style="margin:0">Arquivos</h2><span class="espaco"></span>' +
      '<button class="btn ghost mini" onclick="App.anexar(\'' + op.id + '\')">+ Anexar</button></div>' +
      '<p class="tiny muted" style="margin:6px 0 10px">Organizados pela decisão que destravam. Documento enviado pelo cliente vira evidência.</p>' +
      '<div id="lista-arquivos" class="lista-arquivos"><div class="tiny muted">Carregando anexos…</div></div></div>';
  }

  function itemArquivo(a) {
    const kb = a.tamanho > 1048576
      ? (a.tamanho / 1048576).toFixed(1) + ' MB'
      : Math.max(1, Math.round(a.tamanho / 1024)) + ' KB';
    return '<div class="arquivo"><div class="row"><strong class="small">' + esc(a.nome) + '</strong>' +
      '<span class="espaco"></span><span class="pill">' + esc(a.categoria) + '</span></div>' +
      '<div class="tiny muted">' + kb + ' · ' + U.data(a.data) + ' · ' + (a.enviadoPor === 'cliente' ? 'enviado pelo cliente' : 'enviado por nós') + '</div>' +
      '<div class="row" style="margin-top:6px"><button class="btn ghost mini" onclick="App.abrirArquivo(\'' + a.id + '\')">Abrir</button>' +
      '<button class="btn ghost mini" onclick="App.excluirArquivo(\'' + a.id + '\',\'' + a.oportunidadeId + '\')">Excluir</button></div></div>';
  }


  function blocoHistorico(op) {
    const tipos = [['tudo', 'Tudo'], ['decision', 'Evidências'], ['pontuacao', 'Pontuação'], ['activity', 'Atividades'], ['sistema', 'Sistema']];
    const filtros = tipos.map(function (t) {
      return '<button class="pill' + (filtroHistorico === t[0] ? ' orange' : '') + '" onclick="App.filtrarHistorico(\'' + t[0] + '\')">' + esc(t[1]) + '</button>';
    }).join(' ');

    const eventos = E.historico(op)
      .filter(function (e) { return filtroHistorico === 'tudo' || e.tipo === filtroHistorico; })
      .slice(0, 40)
      .map(function (e) {
        const dim = P.DIMENSOES.find(function (d) { return d.id === e.dimensao; });
        const forca = e.forca ? P.FORCAS.find(function (f) { return f.id === e.forca; }) : null;
        const quem = e.contatoId ? Store.contato(e.contatoId) : null;

        let rotulo, classe;
        if (e.tipo === 'decision') { rotulo = 'Evidência do cliente'; classe = 'ev'; }
        else if (e.tipo === 'pontuacao') { rotulo = 'Pontuação'; classe = 'pt'; }
        else if (e.tipo === 'sistema') { rotulo = 'Sistema'; classe = 'sis'; }
        else { rotulo = 'Atividade do vendedor (não conta como avanço)'; classe = 'at'; }

        const titulo = e.tipo === 'pontuacao' && dim ? dim.nome + ' ' + esc(e.titulo) : esc(e.titulo);

        return '<div class="evento ' + classe + '">' +
          '<div class="quando">' + U.data(e.data) + ' · ' + rotulo +
          (dim && e.tipo !== 'pontuacao' ? ' · ' + esc(dim.nome) : '') +
          (e.canal ? ' · ' + esc(e.canal) : '') + '</div>' +
          '<div class="small">' + titulo + '</div>' +
          (forca || quem
            ? '<div class="tiny muted">' + (forca ? esc(forca.rotulo) : '') + (quem ? (forca ? ' · ' : '') + 'por ' + esc(quem.nome) : '') + '</div>'
            : '') +
          (e.justificativa ? '<div class="tiny muted">' + esc(e.justificativa) + '</div>' : '') +
          (e.compromisso && e.compromisso.data ? '<div class="tiny muted">Combinado: ' + esc(e.compromisso.texto) + ' até ' + U.data(e.compromisso.data) + '</div>' : '') +
          (e.tipo === 'sistema' || e.tipo === 'pontuacao' ? '' :
            '<button class="btn ghost mini" style="margin-top:5px" onclick="App.removerEvento(\'' + op.id + '\',\'' + e.id + '\')">Excluir</button>') +
          '</div>';
      }).join('') || '<div class="vazio small">Nenhum evento neste filtro.</div>';

    return '<div class="card"><h2>Histórico</h2>' +
      '<div class="row" style="margin:6px 0 12px">' + filtros + '</div>' +
      '<div class="timeline">' + eventos + '</div></div>';
  }

  /* ---------------- Revisão semanal ---------------- */

  /* ---------------- Revisão semanal ---------------- */
  function revisao() {
    const est = Store.dados();
    const resumos = est.oportunidades
      .filter(function (o) { return !o.desfecho; })
      .map(E.resumo)
      .sort(function (a, b) { return b.evidenceAge - a.evidenceAge; });

    if (!resumos.length) return '<h1>Revisão semanal</h1><div class="vazio">Sem oportunidades abertas.</div>';

    const cards = resumos.map(function (r) {
      const d = r.delta;
      const comp = r.compromisso;
      return '<div class="card"><div class="row"><h3 style="margin:0">' + esc(r.op.titulo) + '</h3><span class="espaco"></span>' +
        '<span class="pill ' + r.faixa.classe + '">' + r.evidenceAge + 'd</span></div>' +
        '<div class="small muted">' + esc((r.conta && r.conta.nome) || '') + ' · ' + esc(r.op.etapa) + ' · ' + U.compacto(r.op.valor) + ' · IAD ' + r.iad + '/16</div>' +
        '<p class="small" style="margin-top:10px"><strong>O que mudou na decisão do cliente nos últimos 7 dias?</strong></p>' +
        (d.evidencias || d.mudancas.length
          ? '<ul class="small" style="margin:0 0 8px 18px">' +
            (d.mudancas.map(function (m) { return '<li>' + esc(m.nome) + ': ' + m.de + ' → ' + m.para + '</li>'; }).join('')) +
            '<li>' + d.evidencias + ' evidência(s) registrada(s)</li></ul>'
          : '<div class="aviso" style="margin-bottom:8px">Nada mudou. Sem evidência nova do lado do cliente, não houve avanço real.</div>') +
        (comp
          ? '<p class="tiny ' + (comp.vencido ? 'atrasado' : 'muted') + '">Compromisso: ' + esc(comp.texto) + ' — ' + U.data(comp.data) +
            (comp.vencido ? ' (vencido há ' + comp.diasAtraso + 'd)' : '') + '</p>'
          : '<p class="tiny atrasado">Sem próximo passo combinado com data.</p>') +
        '<p class="small muted">Próxima decisão a provocar: ' + esc(r.nbd.decisao) + '</p>' +
        '<div class="row"><button class="btn alt mini" onclick="App.novaEvidencia(\'' + r.op.id + '\')" data-ajuda-titulo="Registrar evidência" data-ajuda="O que o cliente fez nesta semana. Se nada mudou do lado dele, não houve avanço — e é isso que a revisão quer expor.">Registrar evidência</button>' +
        '<button class="btn ghost mini" onclick="App.definirCompromisso(\'' + r.op.id + '\')" data-ajuda-titulo="Definir compromisso" data-ajuda="O próximo passo e a data. Sem isso o negócio fica no ar e o app marca em vermelho.">Definir compromisso</button>' +
        '<button class="btn ghost mini" onclick="App.abrir(\'' + r.op.id + '\')" data-ajuda-titulo="Abrir cockpit" data-ajuda="A tela completa do negócio: as oito decisões, lacunas, grupo comprador, gate e histórico.">Abrir cockpit</button></div></div>';
    }).join('');

    return '<h1>Revisão semanal</h1>' +
      '<p class="muted small">Uma pergunta só, por negócio. Respostas que começam com “nós” não valem.</p>' + cards;
  }

  /* ---------------- Contas e contatos ---------------- */
  function contas() {
    const est = Store.dados();
    if (!est.contas.length) {
      return '<div class="row"><h1>Contas</h1><span class="espaco"></span><button class="btn alt mini" onclick="App.novaConta()">+ Conta</button></div><div class="vazio">Nenhuma conta cadastrada.</div>';
    }
    const lista = est.contas.map(function (c) {
      const pessoas = Store.contatosDaConta(c.id);
      const ops = est.oportunidades.filter(function (o) { return o.contaId === c.id; });
      const abertas = ops.filter(function (o) { return !o.desfecho; });
      const valor = abertas.reduce(function (s, o) { return s + (o.valor || 0); }, 0);
      const ultima = abertas.map(function (o) { return E.evidenceAge(o); }).sort(function (a, b) { return a - b; })[0];

      const chips = pessoas.map(function (p) {
        return '<button class="pill" onclick="App.editarContato(\'' + p.id + '\')"><span class="dot ' + p.sentimento + '"></span>' + esc(p.nome) + ' · ' + esc(p.papel) + '</button>';
      }).join(' ') || '<span class="tiny muted">Nenhum contato.</span>';

      const local = [c.cidade, c.uf].filter(Boolean).join('/');
      const ficha = [c.segmento, c.porte, local, c.relacaoAtual].filter(Boolean).join(' · ');

      return '<div class="card"><div class="row"><h3 style="margin:0">' + esc(c.nome) + '</h3><span class="espaco"></span>' +
        '<span class="pill">' + abertas.length + ' aberta(s)</span>' +
        (valor ? '<span class="pill navy">' + U.compacto(valor) + '</span>' : '') + '</div>' +
        '<div class="tiny muted">' + esc(ficha || '—') + (ultima != null ? ' · última evidência há ' + ultima + 'd' : '') + '</div>' +
        '<div class="row" style="margin-top:10px">' + chips + '</div>' +
        '<div class="row" style="margin-top:10px"><button class="btn ghost mini" onclick="App.novoContato(\'' + c.id + '\')" data-ajuda-titulo="Novo contato" data-ajuda="Adiciona uma pessoa a esta empresa. O papel na compra e a posição alimentam a cobertura e os alertas.">+ Contato</button>' +
        '<button class="btn ghost mini" onclick="App.novaOportunidade(\'' + c.id + '\')">+ Oportunidade</button>' +
        '<button class="btn ghost mini" onclick="App.editarConta(\'' + c.id + '\')" data-ajuda="Muda os dados da empresa. O segmento aqui é o que agrupa o painel.">Editar</button></div></div>';
    }).join('');
    return '<div class="row"><h1>Contas</h1><span class="espaco"></span><button class="btn alt mini" onclick="App.novaConta()">+ Conta</button></div>' + lista;
  }

  /* ---------------- Cadastros ---------------- */
  const AJUDA_NOVO = {
    empresas: 'Cadastra uma empresa.', contatos: 'Cadastra uma pessoa e a liga a uma empresa.',
    oportunidades: 'Cria um negócio.', segmentos: 'Acrescenta um segmento à lista.',
    tiposTarefa: 'Acrescenta um tipo de tarefa.', produtos: 'Cadastra um produto com preço de referência.',
    usuarios: 'Cadastra um usuário neste aparelho. Com a nuvem ligada, as contas ficam no servidor.'
  };

  const AJUDA_CADASTRO = {
    empresas: 'As contas. O segmento aqui é o que agrupa o painel; a relação atual separa quem já compra de quem nunca comprou.',
    contatos: 'As pessoas. O papel na compra e a posição são o que alimenta a cobertura e os alertas do grupo comprador.',
    oportunidades: 'Os negócios. A etapa organiza o funil; quem mede o avanço são as oito decisões dentro de cada um.',
    segmentos: 'A lista que alimenta o campo Segmento das empresas e a análise por segmento no painel.',
    tiposTarefa: 'A lista de tipos que aparece ao criar uma tarefa.',
    produtos: 'O catálogo com preço de referência, para compor o valor das oportunidades.',
    usuarios: 'Quem tem acesso. Com a nuvem ligada, as contas ficam no servidor — cadastrar aqui só afeta este aparelho.'
  };

  const ABAS_CADASTRO = [
    ['empresas', 'Empresas'], ['contatos', 'Contatos'], ['oportunidades', 'Oportunidades'],
    ['segmentos', 'Segmentos'], ['tiposTarefa', 'Tipos de tarefa'], ['produtos', 'Produtos'],
    ['usuarios', 'Usuários']
  ];
  let abaCadastro = 'empresas';
  let buscaCadastro = '';

  function cadastros() {
    const est = Store.dados();
    const abas = ABAS_CADASTRO.map(function (a) {
      return '<button class="pill' + (abaCadastro === a[0] ? ' orange' : '') + '" onclick="App.abaCadastro(\'' + a[0] + '\')" data-ajuda="' + esc(AJUDA_CADASTRO[a[0]] || '') + '">' + esc(a[1]) + '</button>';
    }).join(' ');

    const criar = {
      empresas: 'App.novaConta()', contatos: 'App.novoContato()', oportunidades: 'App.novaOportunidade()',
      segmentos: "App.novoItemCatalogo('segmentos')", tiposTarefa: "App.novoItemCatalogo('tiposTarefa')",
      produtos: 'App.novoProduto()', usuarios: 'App.novoUsuario()'
    }[abaCadastro];

    const corpo = {
      empresas: listaEmpresas, contatos: listaContatos, oportunidades: listaOportunidades,
      segmentos: function (e) { return listaCatalogo(e, 'segmentos'); },
      tiposTarefa: function (e) { return listaCatalogo(e, 'tiposTarefa'); },
      produtos: listaProdutos, usuarios: listaUsuarios
    }[abaCadastro](est);

    return '<div class="row"><h1>Cadastros</h1><span class="espaco"></span>' +
      '<button class="btn alt mini" onclick="' + criar + '" data-ajuda="' + esc(AJUDA_NOVO[abaCadastro] || 'Cria um item nesta aba.') + '">+ Novo</button></div>' +
      '<div class="row" style="margin:8px 0 10px">' + abas + '</div>' +
      '<input id="busca-cadastro" class="busca" type="search" placeholder="Buscar…" value="' + esc(buscaCadastro) +
      '" oninput="App.buscarCadastro(this.value)">' +
      corpo;
  }

  function combina(texto) {
    if (!buscaCadastro) return true;
    return String(texto || '').toLowerCase().indexOf(buscaCadastro.toLowerCase()) !== -1;
  }

  function tabela(colunas, linhas, vazio) {
    if (!linhas) return '<div class="vazio">' + esc(vazio) + '</div>';
    return '<div class="card" style="padding:0"><div class="tabela-rolagem"><table><thead><tr>' +
      colunas.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + linhas + '</tbody></table></div></div>';
  }

  function listaEmpresas(est) {
    const linhas = est.contas.filter(function (c) {
      return combina(c.nome) || combina(c.razaoSocial) || combina(c.cnpj) || combina(c.segmento) || combina(c.cidade);
    }).map(function (c) {
      const ops = est.oportunidades.filter(function (o) { return o.contaId === c.id && !o.desfecho; });
      const valor = ops.reduce(function (s, o) { return s + (o.valor || 0); }, 0);
      return '<tr><td><strong>' + esc(c.nome) + '</strong>' +
        (c.razaoSocial ? '<span class="tiny muted">' + esc(c.razaoSocial) + '</span>' : '') +
        (c.cnpj ? '<span class="tiny muted">' + esc(c.cnpj) + '</span>' : '') + '</td>' +
        '<td>' + esc(c.segmento || '—') + '</td>' +
        '<td>' + esc([c.cidade, c.uf].filter(Boolean).join('/') || '—') + '</td>' +
        '<td>' + esc(c.relacaoAtual || '—') + '</td>' +
        '<td class="right">' + Store.contatosDaConta(c.id).length + '</td>' +
        '<td class="right">' + ops.length + (valor ? '<span class="tiny muted">' + U.compacto(valor) + '</span>' : '') + '</td>' +
        '<td class="right" style="white-space:nowrap">' +
          '<button class="btn ghost mini" onclick="App.editarConta(\'' + c.id + '\')" data-ajuda="Muda os dados da empresa. O segmento aqui é o que agrupa o painel.">Editar</button> ' +
          '<button class="btn ghost mini" onclick="App.novoContato(\'' + c.id + '\')" data-ajuda-titulo="Novo contato" data-ajuda="Adiciona uma pessoa a esta empresa. O papel na compra e a posição alimentam a cobertura e os alertas.">+ Contato</button> ' +
          '<button class="btn ghost mini" onclick="App.novaOportunidade(\'' + c.id + '\')" data-ajuda-titulo="Nova oportunidade" data-ajuda="Cria um negócio para esta empresa. Os contatos já cadastrados entram no grupo comprador.">+ Op.</button>' +
        '</td></tr>';
    }).join('');
    return tabela(['Empresa', 'Segmento', 'Cidade', 'Relação', 'Contatos', 'Oportunidades', ''], linhas, 'Nenhuma empresa encontrada.');
  }

  function listaContatos(est) {
    const linhas = est.contatos.filter(function (c) {
      const conta = Store.conta(c.contaId);
      return combina(c.nome) || combina(c.cargo) || combina(c.email) || combina(conta && conta.nome);
    }).map(function (c) {
      const conta = Store.conta(c.contaId);
      const perfil = P.PERFIS.find(function (x) { return x.id === (c.perfil || 'nao_classificado'); });
      const classePerfil = { mobilizador: 'ok', falador: 'warn', bloqueador: 'dead' }[perfil.grupo] || '';
      return '<tr><td><strong>' + esc(c.nome) + '</strong>' +
        '<span class="tiny muted">' + esc(c.cargo || '—') + '</span></td>' +
        '<td>' + esc((conta && conta.nome) || '—') + '</td>' +
        '<td>' + esc(c.papel) + '</td>' +
        '<td>' + (perfil.grupo === 'indefinido' ? '<span class="tiny muted">sem perfil</span>'
          : '<span class="pill ' + classePerfil + '">' + esc(perfil.rotulo) + '</span>') + '</td>' +
        '<td><span class="dot ' + c.sentimento + '"></span><span class="tiny">' + esc(c.email || c.telefone || '—') + '</span></td>' +
        '<td class="right"><button class="btn ghost mini" onclick="App.editarContato(\'' + c.id + '\')" data-ajuda="Muda os dados da pessoa, inclusive papel na compra, posição e perfil Challenger.">Editar</button></td></tr>';
    }).join('');
    return tabela(['Contato', 'Empresa', 'Papel', 'Perfil', 'Contato', ''], linhas, 'Nenhum contato encontrado.');
  }

  function listaOportunidades(est) {
    const linhas = est.oportunidades.filter(function (o) {
      const conta = Store.conta(o.contaId);
      return combina(o.titulo) || combina(conta && conta.nome) || combina(o.etapa);
    }).sort(function (a, b) { return (b.valor || 0) - (a.valor || 0); }).map(function (o) {
      const conta = Store.conta(o.contaId);
      const r = E.resumo(o);
      return '<tr><td><strong>' + esc(o.titulo) + '</strong>' +
        '<span class="tiny muted">' + esc(o.tipo || '') + '</span></td>' +
        '<td>' + esc((conta && conta.nome) || '—') + '</td>' +
        '<td>' + (o.desfecho ? '<span class="pill">encerrada</span>' : esc(o.etapa)) + '</td>' +
        '<td class="right">' + U.compacto(o.valor) + '</td>' +
        '<td class="right">' + r.iad + '/16</td>' +
        '<td class="right" style="white-space:nowrap">' +
          '<button class="btn ghost mini" onclick="App.abrir(\'' + o.id + '\')">Abrir</button> ' +
          '<button class="btn ghost mini" onclick="App.editarOportunidade(\'' + o.id + '\')">Editar</button></td></tr>';
    }).join('');
    return tabela(['Oportunidade', 'Empresa', 'Etapa', 'Valor', 'IAD', ''], linhas, 'Nenhuma oportunidade encontrada.');
  }

  function listaCatalogo(est, nome) {
    const usos = function (item) {
      if (nome === 'segmentos') return est.contas.filter(function (c) { return c.segmento === item.nome; }).length;
      return est.tarefas.filter(function (t) { return t.tipo === item.nome; }).length;
    };
    const linhas = Store.catalogo(nome).filter(function (i) { return combina(i.nome); }).map(function (i) {
      return '<tr><td><strong>' + esc(i.nome) + '</strong></td>' +
        '<td>' + (i.ativo === false ? '<span class="pill">inativo</span>' : '<span class="pill ok">ativo</span>') + '</td>' +
        '<td class="right">' + usos(i) + '</td>' +
        '<td class="right" style="white-space:nowrap">' +
          '<button class="btn ghost mini" onclick="App.editarItemCatalogo(\'' + nome + '\',\'' + i.id + '\')">Editar</button> ' +
          '<button class="btn ghost mini" onclick="App.excluirItemCatalogo(\'' + nome + '\',\'' + i.id + '\')">Excluir</button></td></tr>';
    }).join('');
    return tabela([nome === 'segmentos' ? 'Segmento' : 'Tipo de tarefa', 'Situação', 'Em uso', ''], linhas, 'Nada cadastrado ainda.');
  }

  function listaProdutos(est) {
    const linhas = Store.catalogo('produtos').filter(function (p) {
      return combina(p.nome) || combina(p.sku) || combina(p.categoria);
    }).map(function (p) {
      const usos = est.oportunidades.filter(function (o) {
        return (o.itens || []).some(function (i) { return i.produtoId === p.id; });
      }).length;
      return '<tr><td><strong>' + esc(p.nome) + '</strong>' +
        (p.descricao ? '<span class="tiny muted">' + esc(p.descricao) + '</span>' : '') + '</td>' +
        '<td>' + esc(p.sku || '—') + '</td>' +
        '<td>' + esc(p.categoria || '—') + '</td>' +
        '<td>' + esc(p.unidade || '—') + '</td>' +
        '<td class="right">' + (p.precoReferencia ? U.moeda(p.precoReferencia) : '—') + '</td>' +
        '<td class="right">' + usos + '</td>' +
        '<td class="right" style="white-space:nowrap">' +
          '<button class="btn ghost mini" onclick="App.editarProduto(\'' + p.id + '\')">Editar</button> ' +
          '<button class="btn ghost mini" onclick="App.excluirItemCatalogo(\'produtos\',\'' + p.id + '\')">Excluir</button></td></tr>';
    }).join('');
    return tabela(['Produto', 'SKU', 'Categoria', 'Unidade', 'Preço de referência', 'Em uso', ''], linhas, 'Nenhum produto cadastrado.');
  }

  function listaUsuarios() {
    const A = global.IADAuth;
    const eu = A.atual();
    const todos = A.usuarios().filter(function (u) {
      if (A.ehAdmin()) return true;
      return u.tenantId === (eu && eu.tenantId);
    }).filter(function (u) {
      const t = A.tenant(u.tenantId);
      return combina(u.nome) || combina(u.email) || combina(u.login) || combina(t && t.nome);
    });

    const linhas = todos.map(function (u) {
      const t = A.tenant(u.tenantId);
      const souEu = eu && eu.id === u.id;
      return '<tr><td><strong>' + esc(u.nome || '—') + (souEu ? ' <span class="pill">você</span>' : '') + '</strong>' +
        '<span class="tiny muted">' + esc(u.login ? 'login: ' + u.login : u.email) + '</span></td>' +
        '<td>' + esc(u.papel === 'admin' ? 'Todas as empresas' : ((t && t.nome) || '—')) + '</td>' +
        '<td>' + esc(u.email || '—') + '</td>' +
        '<td>' + esc(u.whatsapp || '—') + '</td>' +
        '<td>' + (u.papel === 'admin' ? '<span class="pill navy">Administrador</span>' : '<span class="pill">Usuário</span>') + '</td>' +
        '<td>' + (u.ativo === false ? '<span class="pill dead">inativo</span>'
          : (u.emailConfirmado ? '<span class="pill ok">ativo</span>' : '<span class="pill warn">e-mail pendente</span>')) + '</td>' +
        '<td class="right" style="white-space:nowrap">' +
          '<button class="btn ghost mini" onclick="App.editarUsuario(\'' + u.id + '\')">Editar</button>' +
          (u.papel === 'admin' ? '' : ' <button class="btn ghost mini" onclick="App.excluirUsuario(\'' + u.id + '\')">Excluir</button>') +
        '</td></tr>';
    }).join('');

    /* Com a nuvem no comando, criar usuário aqui não cria conta nenhuma: quem
       guarda contas é o Supabase. Para o administrador existe a tela de baixo,
       que lê e edita os perfis do servidor; para os demais, fica o aviso. */
    const N = global.IADNuvem;
    const aviso = N.mandaNoAcesso()
      ? (N.souAdminNaNuvem()
          ? '<div id="usuarios-nuvem"><p class="tiny muted">Carregando os usuários do servidor…</p></div>' +
            '<p class="tiny muted" style="margin:14px 0 6px">Abaixo, os usuários deste aparelho — não são contas do servidor.</p>'
          : '<div class="aviso" style="margin-bottom:12px">As contas ficam no servidor. ' +
            'Para incluir alguém: peça que a pessoa abra o app, use <strong>Criar meu acesso</strong> e confirme o e-mail. ' +
            'Quem administra liga a pessoa à empresa. Cadastrar por aqui só afeta este aparelho.</div>')
      : '';

    return aviso + tabela(['Usuário', 'Empresa', 'E-mail', 'WhatsApp', 'Papel', 'Situação', ''], linhas, 'Nenhum usuário encontrado.');
  }

  /* Painel do administrador: os usuários que existem no servidor, com a empresa
     de cada um editável. É o que substitui escrever SQL para incluir alguém —
     e é ali que os enganos aconteciam. */
  function listaUsuariosNuvem(perfis, empresas, eu) {
    if (!perfis) return '<p class="tiny muted">Carregando os usuários do servidor…</p>';
    if (perfis.erro) {
      return '<div class="aviso">Não foi possível ler os usuários do servidor: ' + esc(perfis.erro) + '</div>';
    }
    if (!perfis.length) return '<div class="vazio small">Nenhum usuário no servidor.</div>';

    const opcoes = function (atual) {
      return '<option value="">— sem empresa —</option>' +
        empresas.map(function (t) {
          return '<option value="' + esc(t.id) + '"' + (t.id === atual ? ' selected' : '') + '>' + esc(t.nome) + '</option>';
        }).join('');
    };

    const linhas = perfis.map(function (p) {
      const souEu = eu && p.id === eu;
      return '<tr><td><strong>' + esc(p.nome || '—') + (souEu ? ' <span class="pill">você</span>' : '') + '</strong>' +
        '<span class="tiny muted">' + esc(p.id.slice(0, 8)) + '…</span></td>' +
        '<td><select onchange="App.empresaDoPerfil(\'' + p.id + '\', this.value)"' +
          ' data-ajuda="Liga esta pessoa a uma empresa. É a empresa que decide qual carteira ela enxerga.">' +
          opcoes(p.tenant_id) + '</select></td>' +
        '<td><select onchange="App.papelDoPerfil(\'' + p.id + '\', this.value)"' +
          (souEu ? ' disabled' : '') +
          ' data-ajuda="Administrador enxerga todas as empresas e pode ligar pessoas a elas.">' +
          '<option value="usuario"' + (p.papel !== 'admin' ? ' selected' : '') + '>Usuário</option>' +
          '<option value="admin"' + (p.papel === 'admin' ? ' selected' : '') + '>Administrador</option>' +
          '</select></td>' +
        '<td>' + (p.tenant_id ? '<span class="pill ok">ativo</span>' : '<span class="pill warn">sem empresa</span>') + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="card" style="margin-bottom:14px"><div class="row"><h3 style="margin:0">Usuários no servidor</h3>' +
      '<span class="espaco"></span><span class="pill navy">administrador</span>' +
      '<button class="btn alt mini" onclick="App.novaEmpresaNuvem()"' +
      ' data-ajuda-titulo="Nova empresa" data-ajuda="Cria uma empresa no servidor. Só quem administra pode.">+ Empresa</button>' +
      '<button class="btn alt mini" onclick="App.convidarPessoa()"' +
      ' data-ajuda-titulo="Registrar pessoa" data-ajuda="Reserva o e-mail da pessoa numa empresa. Quando ela criar o acesso, entra já ligada — sem escolher empresa e sem poder escolher errado.">+ Pessoa</button>' +
      '<button class="btn ghost mini" onclick="App.recarregarUsuariosNuvem()"' +
      ' data-ajuda="Relê a lista do servidor.">Atualizar</button></div>' +
      '<p class="tiny muted" style="margin:6px 0 10px">Quem está sem empresa entra no app mas não enxerga carteira nenhuma. ' +
      'Ligue a pessoa à empresa aqui em vez de escrever SQL.</p>' +
      tabela(['Pessoa', 'Empresa', 'Papel', 'Situação'], linhas, 'Nenhum usuário.') +
      listaConvites(arguments[3], empresas) + '</div>';
  }

  /* Pessoas registradas que ainda não criaram o acesso. Ficar de olho nelas é o
     que evita a pergunta "cadastrei e não entrou" virar mistério. */
  function listaConvites(convites, empresas) {
    if (!convites || !convites.length) return '';
    const nomeDa = function (id) {
      const t = empresas.find(function (x) { return x.id === id; });
      return t ? t.nome : '—';
    };
    const linhas = convites.map(function (c) {
      return '<tr><td><strong>' + esc(c.email) + '</strong></td>' +
        '<td>' + esc(nomeDa(c.tenant_id)) + '</td>' +
        '<td>' + esc(c.papel === 'admin' ? 'Administrador' : 'Usuário') + '</td>' +
        '<td class="right" style="white-space:nowrap">' +
        '<button class="btn alt mini" onclick="App.enviarConvite(\'' + esc(c.email) + '\')"' +
        ' data-ajuda-titulo="Enviar convite" data-ajuda="Abre seu programa de e-mail com a mensagem pronta. O sistema não envia sozinho: quem envia é você, do seu endereço.">Enviar</button> ' +
        '<button class="btn ghost mini" onclick="App.copiarConvite(\'' + esc(c.email) + '\')"' +
        ' data-ajuda="Copia o texto do convite para colar no WhatsApp ou em outro lugar.">Copiar</button> ' +
        '<button class="btn ghost mini" onclick="App.cancelarConvite(\'' + esc(c.email) + '\')"' +
        ' data-ajuda="Cancela o registro. A pessoa ainda poderá criar acesso, mas entrará sem empresa.">Cancelar</button></td></tr>';
    }).join('');
    return '<h4 style="margin:18px 0 6px">Aguardando primeiro acesso</h4>' +
      '<p class="tiny muted" style="margin:0 0 8px">Já registradas. Quando criarem o acesso com este e-mail, entram direto na empresa indicada. ' +
      '<strong>O sistema não envia e-mail:</strong> use Enviar ou Copiar e mande você mesmo.</p>' +
      tabela(['E-mail', 'Empresa', 'Papel', ''], linhas, '');
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
    const forcas = P.FORCAS.map(function (f) {
      return '<tr><td><strong>' + esc(f.rotulo) + '</strong></td><td>' + esc(f.desc) + '</td></tr>';
    }).join('');

    return '<h1>Playbook da decisão</h1>' +
      '<div class="card"><h2>A regra</h2>' +
      '<p>O estágio mostra onde a oportunidade está. As decisões mostram se ela realmente avançou.</p>' +
      '<p class="small muted">Não conta como avanço:</p><div class="row">' + naoContam + '</div></div>' +
      '<div class="card"><h2>Força da evidência</h2>' +
      '<p class="small">Uma decisão só chega a 2 com evidência confirmada ou documentada.</p>' +
      '<div class="tabela-rolagem"><table><tbody>' + forcas + '</tbody></table></div></div>' +
      '<div class="card"><h2>Quem move a decisão por dentro</h2>' +
      '<p class="small">Do <em>Challenger Customer</em>: nem todo contato acessível move a compra. Três perfis mobilizam, três apenas conversam, um bloqueia.</p>' +
      '<div class="tabela-rolagem"><table><thead><tr><th>Perfil</th><th>Grupo</th><th>Como trabalhar</th></tr></thead><tbody>' +
      P.PERFIS.filter(function (x) { return x.grupo !== 'indefinido'; }).map(function (x) {
        const classe = { mobilizador: 'ok', falador: 'warn', bloqueador: 'dead' }[x.grupo];
        return '<tr><td><strong>' + esc(x.rotulo) + '</strong></td>' +
          '<td><span class="pill ' + classe + '">' + esc(x.grupo) + '</span></td>' +
          '<td>' + esc(x.dica) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="tiny muted" style="margin-top:8px">A pesquisa por trás desses perfis vem da CEB/Gartner e é defendida sobretudo por quem a produziu. Use como hipótese de trabalho, não como lei.</p></div>' +
      '<div class="sec-titulo"><h2>As 8 decisões e a cadência multicanal</h2></div>' + dims;
  }

  /* ---------------- Dados ---------------- */
  function dados() {
    const est = Store.dados();
    return '<h1>Dados e instalação</h1>' +
      '<div class="card"><h2>Instalar no desktop e no celular</h2>' +
      '<p class="small">Este é um PWA: o mesmo código roda no navegador, instala no Windows/macOS/Linux e vira ícone no Android e no iPhone.</p>' +
      '<ul class="small"><li><strong>Android/Chrome/Edge:</strong> menu ⋮ → “Instalar aplicativo”.</li>' +
      '<li><strong>iPhone/Safari:</strong> Compartilhar → “Adicionar à Tela de Início”.</li>' +
      '<li><strong>Desktop:</strong> ícone de instalar na barra de endereço.</li></ul>' +
      '<button class="btn alt" onclick="App.instalar()" data-ajuda-titulo="Instalar" data-ajuda="Cria um ícone próprio no computador ou celular. O app passa a abrir em janela separada e a funcionar sem internet.">Instalar aplicativo</button></div>' +

      '<div class="card"><h2>Importar planilha</h2>' +
      '<p class="small muted">Traga a carteira que já existe. Importe nesta ordem: empresas, depois contatos, depois oportunidades — contatos e oportunidades precisam da empresa já cadastrada.</p>' +
      '<div class="row"><button class="btn" onclick="App.importarCsv(\'empresas\')" data-ajuda="Importa empresas de um CSV. Comece por aqui: contatos e oportunidades precisam da empresa já cadastrada.">Empresas</button>' +
      '<button class="btn" onclick="App.importarCsv(\'contatos\')" data-ajuda="Importa contatos. Cada linha precisa nomear uma empresa que já exista.">Contatos</button>' +
      '<button class="btn" onclick="App.importarCsv(\'oportunidades\')" data-ajuda="Importa oportunidades. As oito decisões começam em zero: quem as pontua é a evidência.">Oportunidades</button></div>' +
      '<div class="row" style="margin-top:10px"><span class="tiny muted">Modelos:</span>' +
      '<button class="btn ghost mini" onclick="App.baixarModelo(\'empresas\')" data-ajuda="Baixa um CSV de exemplo com as colunas certas para empresas.">empresas.csv</button>' +
      '<button class="btn ghost mini" onclick="App.baixarModelo(\'contatos\')" data-ajuda="Baixa um CSV de exemplo com as colunas certas para contatos.">contatos.csv</button>' +
      '<button class="btn ghost mini" onclick="App.baixarModelo(\'oportunidades\')" data-ajuda="Baixa um CSV de exemplo com as colunas certas para oportunidades.">oportunidades.csv</button></div></div>' +

      blocoNuvem() +
      blocoLinkedHelper() +

      '<div class="card"><h2>Backup</h2>' +
      '<p class="small muted">Os dados ficam no dispositivo (offline). Exporte para levar de máquina ou compartilhar com o time. Anexos não entram no JSON.</p>' +
      '<div class="row"><button class="btn" onclick="App.exportar()" data-ajuda-titulo="Exportar" data-ajuda="Baixa toda a carteira num arquivo, para backup ou para levar de máquina. Anexos não entram.">Exportar JSON</button>' +
      '<button class="btn ghost" onclick="App.importar()" data-ajuda-titulo="Importar" data-ajuda="Substitui a carteira deste aparelho pelo conteúdo do arquivo. Suas contas de acesso são preservadas.">Importar JSON</button></div>' +
      '<p class="tiny muted" style="margin-top:10px">' + est.contas.length + ' contas · ' + est.contatos.length + ' contatos · ' +
      est.oportunidades.length + ' oportunidades · ' + est.tarefas.length + ' tarefas.</p>' +
      '<p class="tiny muted" id="uso-anexos">Anexos: calculando…</p></div>' +

      '<div class="card"><h2>Demonstração</h2>' +
      '<p class="small muted">Carrega uma carteira fictícia com os grupos de pipeline para treinar a leitura do modelo.</p>' +
      '<div class="row"><button class="btn ghost" onclick="App.carregarDemo()" data-ajuda-titulo="Demonstração" data-ajuda="Carrega uma carteira fictícia com os cinco grupos de pipeline, para treinar a leitura do modelo. Substitui o que está aqui.">Carregar demonstração</button>' +
      '<button class="btn ghost" onclick="App.limpar()" data-ajuda-titulo="Apagar tudo" data-ajuda="Apaga a carteira deste aparelho. Não apaga o que já foi sincronizado no servidor, nem os acessos.">Apagar tudo</button></div></div>';
  }

  /* A nuvem é opcional: sem ela o app segue local, como sempre foi. */
  function blocoNuvem() {
    const N = global.IADNuvem;
    const e = N.estado();

    if (!e.configurada) {
      return '<div class="card"><div class="row"><h2 style="margin:0">Nuvem (Supabase)</h2><span class="espaco"></span>' +
        '<button class="btn ghost mini" onclick="App.configurarNuvem()" data-ajuda-titulo="Configurar nuvem" data-ajuda="Endereço e chave pública do Supabase. Já vêm preenchidos; só troque para apontar a outro banco.">Configurar</button></div>' +
        '<p class="small muted" style="margin:8px 0 0">Ligue o app a um banco na nuvem para a equipe compartilhar a mesma carteira e para o login passar a ser verificado no servidor. ' +
        'O passo a passo e o arquivo do banco estão na pasta <code>nuvem/</code> do projeto.</p></div>';
    }

    if (!e.conectado) {
      return '<div class="card"><div class="row"><h2 style="margin:0">Nuvem (Supabase)</h2><span class="espaco"></span>' +
        '<span class="pill warn">desconectado</span>' +
        '<button class="btn ghost mini" onclick="App.configurarNuvem()" data-ajuda-titulo="Alterar nuvem" data-ajuda="Troca o endereço e a chave pública do banco. Só mexa para apontar a outro projeto Supabase.">Alterar</button></div>' +
        '<p class="small muted" style="margin:8px 0 12px">Configurada, mas ninguém entrou nesta máquina.</p>' +
        '<div class="row"><button class="btn alt mini" onclick="App.entrarNuvem()" data-ajuda-titulo="Entrar na nuvem" data-ajuda="Autentica no servidor com o e-mail e senha da sua conta, para sincronizar a carteira.">Entrar na nuvem</button>' +
        '<button class="btn ghost mini" onclick="App.cadastrarNuvem()" data-ajuda-titulo="Criar acesso" data-ajuda="Cria a conta no servidor. Chega um e-mail de confirmação — a confirmação vale mesmo que o link mostre página de erro.">Criar acesso na nuvem</button></div></div>';
    }

    const perfil = e.perfil || {};
    const semEmpresa = !perfil.tenant_id;
    return '<div class="card"><div class="row"><h2 style="margin:0">Nuvem (Supabase)</h2><span class="espaco"></span>' +
      '<span class="pill ok">conectado</span></div>' +
      '<p class="small muted" style="margin:8px 0 4px">' + esc(e.email) +
      (perfil.nome ? ' · ' + esc(perfil.nome) : '') +
      (perfil.papel === 'admin' ? ' · <strong>administrador</strong>' : '') + '</p>' +
      (e.ultima ? '<p class="tiny muted" style="margin:0 0 12px">Última sincronização: ' + esc(e.ultima.replace('T', ' ').slice(0, 16)) + '</p>' : '') +
      (semEmpresa
        ? '<div class="aviso" style="margin-bottom:12px">Seu usuário ainda não tem empresa na nuvem. Defina antes de sincronizar — é ela que separa a sua carteira das outras.</div>' +
          '<button class="btn alt mini" onclick="App.definirEmpresaNuvem()">Definir minha empresa</button>'
        : '<div class="aviso-empresa">Sincronizando para <strong>' +
            esc((perfil.tenants && perfil.tenants.nome) || 'sua empresa') + '</strong>. ' +
            'Tudo que subir daqui passa a pertencer a ela.</div>' +
          '<div class="row"><button class="btn alt mini" onclick="App.sincronizarNuvem()" data-ajuda-titulo="Sincronizar" data-ajuda="Envia a sua carteira e traz o que os outros mudaram. Nada sobe sozinho: sincronize ao começar e ao terminar o dia.">Sincronizar agora</button>' +
          '<button class="btn ghost mini" onclick="App.puxarNuvem()" data-ajuda-titulo="Só baixar" data-ajuda="Traz do servidor sem enviar nada daqui. Útil ao abrir o app noutro aparelho.">Só baixar</button>' +
          '<button class="btn ghost mini" onclick="App.sairNuvem()">Sair da nuvem</button></div>' +
          '<p class="tiny muted" style="margin:10px 0 0">Sincronizar envia a sua carteira e traz o que os outros mudaram. ' +
          'O app continua funcionando offline com a última cópia baixada.</p>') +
      '<div id="recado-nuvem"></div></div>';
  }

  /* O app não recebe webhook — quem recebe é a ponte. Aqui só buscamos o que chegou. */
  function blocoLinkedHelper() {
    const c = global.IADIntegracoes.config();
    return '<div class="card"><div class="row"><h2 style="margin:0">Linked Helper</h2><span class="espaco"></span>' +
      '<button class="btn ghost mini" onclick="App.configurarPonte()" data-ajuda-titulo="Ponte do Linked Helper" data-ajuda="Endereço e chave de leitura da ponte no Cloudflare. É por onde as respostas do LinkedIn chegam.">' + (c.url ? 'Alterar ponte' : 'Configurar ponte') + '</button>' +
      (c.url ? '<button class="btn alt mini" onclick="App.buscarLeads()" data-ajuda-titulo="Buscar respostas" data-ajuda="Procura na ponte quem respondeu no LinkedIn. Cada resposta vira empresa, contato e oportunidade com um clique.">Buscar respostas</button>' : '') + '</div>' +
      (c.url
        ? '<p class="tiny muted" style="margin:8px 0 0">Ponte: ' + esc(c.url) + '</p>'
        : '<p class="small muted" style="margin:8px 0 0">Quando alguém responde no LinkedIn, o Linked Helper dispara um webhook. Como este app roda no navegador, ele não tem endereço para receber: quem recebe é uma ponte, e o app busca de lá. O código da ponte está na pasta <code>ponte/</code> do projeto.</p>') +
      '<div id="caixa-linkedhelper"></div></div>';
  }

  function listaLeads(leads) {
    if (!leads) return '';
    if (!leads.length) return '<div class="vazio small">Nenhuma resposta nova na ponte.</div>';
    return '<div class="lista" style="margin-top:12px">' + leads.map(function (l) {
      return '<div class="foco u0">' +
        '<div class="row"><strong>' + esc(l.nome || 'Sem nome') + '</strong>' +
        (l.cargo ? '<span class="tiny muted">' + esc(l.cargo) + '</span>' : '') +
        '<span class="espaco"></span>' +
        (l.campanha ? '<span class="pill">' + esc(l.campanha) + '</span>' : '') + '</div>' +
        '<div class="small muted">' + esc(l.empresa || 'empresa não informada') + (l.local ? ' · ' + esc(l.local) : '') + '</div>' +
        (l.resposta ? '<div class="motivo" style="margin-top:8px">“' + esc(l.resposta) + '”</div>' : '') +
        '<div class="row" style="margin-top:10px">' +
        '<button class="btn alt mini" onclick="App.converterLead(\'' + esc(l.id) + '\')">Criar oportunidade</button>' +
        (l.linkedin ? '<a class="btn ghost mini" href="' + esc(l.linkedin) + '" target="_blank" rel="noopener">Abrir perfil</a>' : '') +
        '<button class="btn ghost mini" onclick="App.descartarLead(\'' + esc(l.id) + '\')">Descartar</button>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  global.IADViews = {
    hoje, painel, pipeline, cockpit, revisao, contas, cadastros, playbook, dados, itemArquivo, listaLeads,
    acesso, barraAdmin, definirTelaAcesso, definirPrimeiraEmpresa, listaUsuariosNuvem,
    pendenteAcesso: function () { return pendente; },
    definirFiltro: function (f) { filtroGrupo = f; },
    definirFiltroHistorico: function (f) { filtroHistorico = f; },
    definirFiltroHoje: function (f) { filtroHoje = f; },
    definirModoPipeline: function (m) { modoPipeline = m; },
    definirAbaCadastro: function (a) { abaCadastro = a; buscaCadastro = ''; },
    definirBuscaCadastro: function (b) { buscaCadastro = b; },
    definirPeriodo: function (f) { filtroPeriodo = f; },
    definirSegmento: function (f) { filtroSegmento = f; }
  };
})(window);
