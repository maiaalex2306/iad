/* Router, ações e boot. */
(function (global) {
  'use strict';

  const P = global.IADPlaybook, Store = global.IADStore, E = global.IADEngine,
    U = global.IADUI, V = global.IADViews, Arq = global.IADArquivos, Csv = global.IADCsv,
    A = global.IADAuth, IA = global.IADIA;

  const ROTAS = [
    { hash: '#/hoje', ico: '⚡', nome: 'Hoje', render: V.hoje,
      ajuda: 'O que precisa de você agora, em ordem de urgência. Comece o dia por aqui.' },
    { hash: '#/painel', ico: '📊', nome: 'Painel', render: V.painel,
      ajuda: 'A carteira em números e gráficos: quanto do pipeline tem decisão madura, por mês e por segmento.' },
    { hash: '#/pipeline', ico: '🗂️', nome: 'Pipeline', render: V.pipeline,
      ajuda: 'Todos os negócios abertos, em lista ou kanban, agrupados pela saúde da decisão.' },
    { hash: '#/revisao', ico: '🔄', nome: 'Revisão', render: V.revisao,
      ajuda: 'A reunião semanal numa tela: o que mudou na decisão de cada cliente nos últimos 7 dias.' },
    { hash: '#/cadastros', ico: '📇', nome: 'Cadastros', render: V.cadastros,
      ajuda: 'Empresas, contatos, oportunidades, segmentos, tipos de tarefa, produtos e usuários.' },
    { hash: '#/contas', ico: '🏢', nome: 'Contas', render: V.contas, foraDasAbas: true },
    { hash: '#/playbook', ico: '🎯', nome: 'Playbook', render: V.playbook, foraDasAbas: true }
  ];

  let promptInstalacao = null;
  let leads = null;

  function render() {
    const conteudo = document.getElementById('conteudo');
    let logado = A.atual();

    /* Com o servidor no comando, só vale sessão que veio dele. Uma sessão local
       antiga — ou o Adm de fábrica — não pode abrir a porta de um app público. */
    if (logado && global.IADNuvem.mandaNoAcesso() && !logado.naNuvem) {
      A.encerrarSessao();
      logado = null;
    }

    /* Registro sem empresa fica invisível. Aqui, com a sessão já conhecida,
       o que tiver nascido assim é adotado antes de a tela ser desenhada. */
    if (logado) Store.adotarOrfaos();

    document.body.classList.toggle('sem-sessao', !logado);
    if (!logado) {
      conteudo.innerHTML = V.acesso();
      const primeiro = document.querySelector('.cartao-acesso input');
      if (primeiro) primeiro.focus();
      return;
    }
    pintarTopo();

    const hash = location.hash || '#/hoje';

    if (hash.indexOf('#/op/') === 0) {
      const id = hash.slice(5);
      conteudo.innerHTML = V.cockpit(id);
      pintarArquivos(id);
    } else if (hash === '#/dados') {
      conteudo.innerHTML = V.dados();
      pintarUso();
      pintarLeads();
    } else {
      const rota = ROTAS.find(function (r) { return r.hash === hash; }) || ROTAS[0];
      conteudo.innerHTML = rota.render();
      pintarUsuariosNuvem();
    }

    document.querySelectorAll('nav.tabs a').forEach(function (a) {
      const alvo = a.getAttribute('href');
      a.classList.toggle('ativo', alvo === hash || (hash.indexOf('#/op/') === 0 && alvo === '#/pipeline'));
    });

    const barra = document.getElementById('barra-admin');
    if (barra) barra.innerHTML = V.barraAdmin();
    window.scrollTo(0, 0);
  }

  /* Quem está logado e de onde: some quando ninguém está. */
  function pintarTopo() {
    const alvo = document.getElementById('quem');
    if (!alvo) return;
    const u = A.atual();
    if (!u) { alvo.innerHTML = ''; return; }
    /* Para o administrador, repetir "Administrador" nas duas linhas não diz nada;
       o que ele precisa ver é qual recorte está enxergando no momento. */
    let onde;
    if (u.papel === 'admin') {
      const f = A.filtros();
      const alvoTenant = f.tenant === 'todas' ? null : A.tenant(f.tenant);
      onde = alvoTenant ? alvoTenant.nome : 'Todas as empresas';
    } else {
      const t = A.tenant(u.tenantId);
      onde = (t && t.nome) || '';
    }
    alvo.innerHTML = '<span class="nome">' + U.esc(u.nome || u.login) + '</span>' +
      '<span class="onde">' + U.esc(onde) + '</span>';
  }

  function montarNav() {
    document.querySelector('nav.tabs').innerHTML = ROTAS.filter(function (r) { return !r.foraDasAbas; }).map(function (r) {
      return '<a href="' + r.hash + '"' + (r.ajuda ? ' data-ajuda-titulo="' + r.nome + '" data-ajuda="' + U.esc(r.ajuda) + '"' : '') +
        '><span class="ico">' + r.ico + '</span>' + r.nome + '</a>';
    }).join('');
  }

  function pintarArquivos(opId) {
    const alvo = document.getElementById('lista-arquivos');
    if (!alvo) return;
    if (!Arq.disponivel()) {
      alvo.innerHTML = '<div class="tiny muted">Este navegador não guarda anexos.</div>';
      return;
    }
    Arq.listar(opId).then(function (lista) {
      const destino = document.getElementById('lista-arquivos');
      if (!destino) return;
      destino.innerHTML = lista.length
        ? lista.map(V.itemArquivo).join('')
        : '<div class="vazio small">Nenhum anexo.</div>';
    }).catch(function (e) {
      const destino = document.getElementById('lista-arquivos');
      if (destino) destino.innerHTML = '<div class="tiny muted">Não foi possível ler os anexos: ' + U.esc(e.message) + '</div>';
    });
  }

  function pintarUso() {
    const alvo = document.getElementById('uso-anexos');
    if (!alvo || !Arq.disponivel()) return;
    Arq.uso().then(function (u) {
      const destino = document.getElementById('uso-anexos');
      if (!destino) return;
      const mb = (u.bytes / 1048576).toFixed(1);
      destino.textContent = 'Anexos: ' + u.quantidade + ' arquivo(s), ' + mb + ' MB (guardados fora do JSON).';
    }).catch(function () {});
  }

  function recadoNuvem(texto, erro) {
    const alvo = document.getElementById('recado-nuvem');
    if (!alvo) return;
    alvo.innerHTML = '<div class="' + (erro ? 'aviso' : 'faixa-delta') + '" style="margin-top:12px">' + U.esc(texto) + '</div>';
  }

  function pintarLeads() {
    const alvo = document.getElementById('caixa-linkedhelper');
    if (alvo) alvo.innerHTML = V.listaLeads(leads);
  }

  /* Os usuários do servidor só chegam por rede, então a tela desenha primeiro e
     se completa depois. Guardamos o resultado para não repetir a consulta a
     cada redesenho — que aqui acontece a cada clique. */
  let perfisNuvem = null, empresasNuvem = null, convitesNuvem = null;

  function pintarUsuariosNuvem(recarregar) {
    const alvo = document.getElementById('usuarios-nuvem');
    if (!alvo) return;
    const N = global.IADNuvem;

    if (perfisNuvem && !recarregar) {
      alvo.innerHTML = V.listaUsuariosNuvem(perfisNuvem, empresasNuvem, (N.sessao().user || {}).id, convitesNuvem);
      return;
    }
    Promise.all([N.perfisDaNuvem(), N.empresasDaNuvem(), N.convitesDaNuvem().catch(function () { return []; })])
      .then(function (r) {
        perfisNuvem = r[0] || [];
        empresasNuvem = r[1] || [];
        convitesNuvem = r[2] || [];
        pintarUsuariosNuvem();
      })
      .catch(function (e) {
        const destino = document.getElementById('usuarios-nuvem');
        if (destino) destino.innerHTML = V.listaUsuariosNuvem({ erro: e.message }, [], null, null);
      });
  }

  /* ---------- entrada pelo servidor ----------
     Duas idas: uma para a senha, outra para o perfil. Quem ainda não tem
     empresa para na tela de empresa em vez de entrar numa carteira sem dono. */
  function entrarPelaNuvem(email, senha) {
    V.definirTelaAcesso('login', null, 'Entrando…');
    render();
    global.IADNuvem.entrar(email, senha)
      .then(concluirEntradaNaNuvem)
      .catch(function (e) {
        const msg = /Invalid login/i.test(e.message) ? 'E-mail ou senha não conferem.'
          : /not confirmed/i.test(e.message) ? 'Confirme seu e-mail pelo link que enviamos.'
          : e.message;
        V.definirTelaAcesso('login', null, msg);
        render();
      });
  }

  function concluirEntradaNaNuvem() {
    const N = global.IADNuvem;
    return N.meuPerfil().then(function (perfil) {
      N.guardarPerfilNaSessao(perfil);
      const u = N.sessao().user;

      if (!perfil) {
        /* Autenticado e sem linha de perfil é falha de instalação, não falta de
           empresa: mandar criar empresa aqui esconderia a causa. */
        V.definirTelaAcesso('login', null,
          'Entrou, mas o seu perfil não existe no banco. Rode nuvem/schema.sql no Supabase — é ele que cria o perfil no cadastro.');
        return render();
      }
      if (!perfil.tenant_id) {
        /* Sem empresa no servidor, quem entra é o primeiro e monta a casa.
           Havendo empresas, criar mais uma é decisão de quem administra — e o
           formulário simplesmente não aparece. */
        return N.existeEmpresa().then(function (existe) {
          V.definirPrimeiraEmpresa(!existe);
          V.definirTelaAcesso('empresa', { email: u.email }, '');
          render();
        });
      }

      A.abrirSessao(A.espelharDaNuvem(u, perfil));
      V.definirTelaAcesso('login', null, '');
      location.hash = '#/hoje';
      render();
      /* Trazer o que já existe no servidor é o que faz a troca de aparelho
         funcionar; falhar aqui não impede de usar o app com a cópia local. */
      return N.puxar().then(render, function () {});
    });
  }

  /* O perfil fica guardado na sessão para não pedir ao servidor a cada envio —
     mas isso fazia mudança de papel ou de empresa só valer depois de sair e
     entrar. Quem administra move alguém e a pessoa continua vendo a carteira
     antiga até fechar o app: pior do que lento, é enganoso. Relemos ao abrir. */
  function atualizarPerfilDaNuvem() {
    const N = global.IADNuvem;
    if (!N.conectado()) return;
    N.meuPerfil().then(function (perfil) {
      if (!perfil) return;
      const antes = N.estado().perfil || {};
      N.guardarPerfilNaSessao(perfil);
      const u = N.sessao().user;
      A.espelharDaNuvem(u, perfil);
      if (antes.papel !== perfil.papel || antes.tenant_id !== perfil.tenant_id) render();
    }).catch(function () {});

    /* A função do assistente é publicada à mão, num passo separado do login.
       Perguntamos ao servidor se ela existe antes de oferecer a caixa ✨. */
    IA.verificar().then(function (mudou) { if (mudou) render(); });
  }

  function textoDoConvite(email) {
    const c = (convitesNuvem || []).find(function (x) { return x.email === email; }) || {};
    const t = (empresasNuvem || []).find(function (x) { return x.id === c.tenant_id; });
    const endereco = location.origin + location.pathname;
    return 'Olá,\n\n' +
      'Criei o seu acesso ao IAD CRM' + (t ? ', na ' + t.nome : '') + '.\n\n' +
      'Para entrar, uma vez só:\n\n' +
      '1. Abra ' + endereco + '\n' +
      '2. Clique em "Criar meu acesso"\n' +
      '3. Use este e-mail: ' + email + '\n' +
      '4. Escolha a senha que quiser\n\n' +
      'A empresa já está definida — você não precisa escolher nada. ' +
      'Depois disso é só entrar com o e-mail e a senha.\n\n' +
      'Qualquer dúvida, me chame.';
  }

  const OPCOES_SIM_NAO = [{ valor: 'nao', rotulo: 'Não' }, { valor: 'sim', rotulo: 'Sim' }];

  const App = {
    ir: function (hash) { location.hash = hash; },
    abrir: function (id) { location.hash = '#/op/' + id; },
    filtrar: function (grupo) { V.definirFiltro(grupo); render(); },
    filtrarHistorico: function (tipo) { V.definirFiltroHistorico(tipo); render(); },
    filtrarHoje: function (chave) { V.definirFiltroHoje(chave); render(); },
    modoPipeline: function (modo) { V.definirModoPipeline(modo); render(); },
    abaCadastro: function (aba) { V.definirAbaCadastro(aba); render(); },

    /* Buscar re-renderiza a tela; devolvemos o foco e o cursor ao campo. */
    buscarCadastro: function (texto) {
      V.definirBuscaCadastro(texto);
      render();
      const campo = document.getElementById('busca-cadastro');
      if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
    },

    novoItemCatalogo: function (nome) {
      const titulo = nome === 'segmentos' ? 'Novo segmento' : 'Novo tipo de tarefa';
      U.formulario(titulo, [{ id: 'nome', rotulo: 'Nome' }], {}, function (d) {
        if (!d.nome) return;
        Store.criarNoCatalogo(nome, { nome: d.nome });
        render();
      });
    },

    editarItemCatalogo: function (nome, id) {
      const item = Store.catalogo(nome).find(function (i) { return i.id === id; });
      if (!item) return;
      U.formulario('Editar', [
        { id: 'nome', rotulo: 'Nome' },
        { id: 'ativo', rotulo: 'Situação', tipo: 'select', opcoes: [{ valor: 'sim', rotulo: 'Ativo' }, { valor: 'nao', rotulo: 'Inativo' }] }
      ], { nome: item.nome, ativo: item.ativo === false ? 'nao' : 'sim' }, function (d) {
        Store.atualizarNoCatalogo(nome, id, { nome: d.nome, ativo: d.ativo === 'sim' });
        render();
      });
    },

    excluirItemCatalogo: function (nome, id) {
      if (!U.confirmar('Excluir este item do cadastro? Os registros que já o usam continuam como estão.')) return;
      Store.removerDoCatalogo(nome, id);
      render();
    },

    novoProduto: function () {
      U.formulario('Novo produto', camposProduto(), {}, function (d) {
        if (!d.nome) return;
        Store.criarNoCatalogo('produtos', Object.assign({}, d, { precoReferencia: U.numeroDigitado(d.precoReferencia) }));
        render();
      });
    },

    editarProduto: function (id) {
      const p = Store.produto(id);
      if (!p) return;
      U.formulario('Editar produto', camposProduto().concat([
        { id: 'ativo', rotulo: 'Situação', tipo: 'select', opcoes: [{ valor: 'sim', rotulo: 'Ativo' }, { valor: 'nao', rotulo: 'Inativo' }] }
      ]), Object.assign({}, p, { ativo: p.ativo === false ? 'nao' : 'sim' }), function (d) {
        Store.atualizarNoCatalogo('produtos', id, Object.assign({}, d, {
          precoReferencia: U.numeroDigitado(d.precoReferencia), ativo: d.ativo === 'sim'
        }));
        render();
      });
    },

    /* Cadastro rápido: empresa, contato e oportunidade em um formulário só.
       É o que evita abrir três telas para registrar uma conversa de cinco minutos. */
    cadastroRapido: function (etapa) {
      const est = Store.dados();
      const contas = est.contas.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); });
      const produtos = Store.catalogoAtivos('produtos');

      const campos = [
        { id: 'atalhoNegocio', tipo: 'ia', extrair: 'oportunidade',
          rotulo: 'Conte de onde veio este negócio',
          placeholder: 'Ex.: Indicação na feira. Agro Verde, agroindústria em Sorocaba. Falei com o Marcelo Prates, o CFO, que está tocando o assunto internamente.',
          nunca: ['valor', 'fechamentoPrevisto'],
          contexto: function () { return IA.contextoDaConta(null); } },
        { id: 'contaId', rotulo: 'Empresa', tipo: 'select',
          opcoes: [{ valor: '', rotulo: '— cadastrar nova abaixo —' }]
            .concat(contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; })) },
        { id: 'empresaNova', rotulo: 'Nome da nova empresa', placeholder: 'preencha só se for empresa nova' },
        { id: 'segmento', rotulo: 'Segmento da nova empresa', tipo: 'select',
          opcoes: [{ valor: '', rotulo: '— sem segmento —' }]
            .concat(Store.nomesDoCatalogo('segmentos').map(function (n) { return { valor: n, rotulo: n }; })) },
        { id: 'titulo', rotulo: 'Oportunidade' },
        { id: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda' },
        { id: 'fechamentoPrevisto', rotulo: 'Fechamento previsto', tipo: 'date' },
        { id: 'contatoNome', rotulo: 'Contato (opcional)' },
        { id: 'contatoCargo', rotulo: 'Cargo do contato' },
        { id: 'contatoPapel', rotulo: 'Papel na compra', tipo: 'select', opcoes: P.PAPEIS },
        { id: 'contatoPerfil', rotulo: 'Perfil (Challenger)', tipo: 'select',
          opcoes: P.PERFIS.map(function (x) { return { valor: x.id, rotulo: x.rotulo }; }) }
      ];
      if (produtos.length) {
        campos.push({ id: 'produtoId', rotulo: 'Produto', tipo: 'select',
          opcoes: [{ valor: '', rotulo: '— nenhum —' }]
            .concat(produtos.map(function (p) { return { valor: p.id, rotulo: p.nome }; })) });
      }

      U.formulario('Cadastro rápido — ' + etapa, campos, {}, function (d) {
        if (!d.titulo) { alert('Dê um título à oportunidade.'); return; }

        let contaId = d.contaId;
        if (!contaId) {
          if (!d.empresaNova) { alert('Escolha uma empresa ou informe o nome da nova.'); return; }
          if (d.segmento) Store.criarNoCatalogo('segmentos', { nome: d.segmento });
          contaId = Store.criarConta({ nome: d.empresaNova, segmento: d.segmento || '' }).id;
        }

        const op = Store.criarOportunidade({
          contaId: contaId, titulo: d.titulo, valor: U.numeroDigitado(d.valor),
          etapa: etapa, fechamentoPrevisto: d.fechamentoPrevisto || ''
        });

        if (d.contatoNome) {
          const contato = Store.criarContato({
            contaId: contaId, nome: d.contatoNome, cargo: d.contatoCargo,
            papel: d.contatoPapel, perfil: d.contatoPerfil
          });
          op.stakeholders.push(contato.id);
        }

        if (d.produtoId) {
          const prod = Store.produto(d.produtoId);
          op.itens.push({ produtoId: d.produtoId, quantidade: 1, precoUnitario: prod ? prod.precoReferencia : 0 });
          if (!op.valor && prod) op.valor = prod.precoReferencia || 0;
        }

        Store.salvar();
        render();
      });
    },

    /* Kanban: arrastar move a etapa — e o histórico registra que foi só a etapa. */
    arrastar: function (evento, opId) {
      evento.dataTransfer.setData('text/plain', opId);
      evento.dataTransfer.effectAllowed = 'move';
    },

    soltar: function (evento, etapa) {
      evento.preventDefault();
      const opId = evento.dataTransfer.getData('text/plain');
      if (opId) App.moverEtapa(opId, etapa);
    },

    moverEtapa: function (opId, etapa) {
      const op = Store.oportunidade(opId);
      if (!op || op.etapa === etapa) return;
      Store.atualizarOportunidade(opId, { etapa: etapa });
      render();
    },

    definirInsight: function (opId) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      U.formulario('Insight comercial', [
        /* Aqui a IA não extrai: ela escreve um rascunho. A caixa já vem com o
           que o cliente disse sobre o problema, para o rascunho nascer do caso
           real e não de um lugar-comum de setor. */
        { id: 'baseInsight', tipo: 'ia', extrair: 'insight',
          rotulo: 'Rascunhar o reenquadramento a partir do caso',
          placeholder: 'Descreva o problema do cliente e o setor dele.',
          padrao: baseDoInsight(op),
          contexto: function () { return IA.contextoDaOportunidade(op); } },
        { id: 'texto', rotulo: 'O que o cliente não enxerga sozinho', tipo: 'textarea', voz: true,
          placeholder: 'Ex.: a perda não está na colheita, está no intervalo entre lotes — e ela cresce com o volume.' },
        { id: 'estado', rotulo: 'Em que ponto está', tipo: 'select',
          opcoes: P.ESTADOS_INSIGHT.map(function (e) { return { valor: e.id, rotulo: e.rotulo }; }) }
      ], op.insight || {}, function (d) {
        Store.definirInsight(opId, d);
        render();
      });
    },
    filtrarPeriodo: function (periodo) { V.definirPeriodo(periodo); render(); },
    filtrarSegmento: function (segmento) { V.definirSegmento(segmento); render(); },

    /* ---------- Contas e contatos ---------- */
    novaConta: function () {
      U.formulario('Nova conta', camposConta(), {}, function (d) {
        if (!d.nome) return;
        Store.criarConta(d);
        location.hash = '#/contas';
        render();
      });
    },

    editarConta: function (id) {
      const c = Store.conta(id);
      if (!c) return;
      U.formulario('Editar conta', camposConta(), c, function (d) {
        Object.assign(c, d);
        Store.salvar();
        render();
      });
    },

    novoContato: function (contaId) {
      const contas = Store.dados().contas;
      if (!contas.length) { alert('Cadastre uma empresa primeiro.'); return App.novaConta(); }
      const campos = contaId ? camposContato(contaId) : [{
        id: 'contaId', rotulo: 'Empresa', tipo: 'select',
        opcoes: contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; })
      }].concat(camposContato(null));
      U.formulario('Novo contato', campos, {}, function (d) {
        if (!d.nome) return;
        Store.criarContato(Object.assign({}, d, {
          contaId: contaId || d.contaId, reportaA: d.reportaA || null
        }));
        render();
      });
    },

    editarContato: function (id) {
      const c = Store.contato(id);
      if (!c) return;
      U.formulario('Editar contato', camposContato(c.contaId, c.id), c, function (d) {
        Object.assign(c, d, { reportaA: d.reportaA || null, influencia: Number(d.influencia) || 2 });
        Store.salvar();
        render();
      });
    },

    /* ---------- Oportunidades ---------- */
    novaOportunidade: function (contaId) {
      const contas = Store.dados().contas;
      if (!contas.length) { alert('Cadastre uma conta primeiro.'); return App.novaConta(); }
      U.formulario('Nova oportunidade', camposOportunidade(contas, contaId), {}, function (d) {
        if (!d.titulo) return;
        const op = Store.criarOportunidade(d);
        location.hash = '#/op/' + op.id;
        render();
      });
    },

    editarOportunidade: function (id) {
      const op = Store.oportunidade(id);
      if (!op) return;
      const contas = Store.dados().contas;
      U.formulario('Editar oportunidade', camposOportunidade(contas).concat([
        { id: 'notas', rotulo: 'Notas', tipo: 'textarea' }
      ]), op, function (d) {
        Store.atualizarOportunidade(id, d);
        render();
      });
    },

    /* Nota 2 significa comprovado. Sem evidência confirmada, o app explica e recusa. */
    pontuar: function (opId, dim, valor) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      if (valor === 2 && !E.podeComprovar(op, dim)) {
        const nome = P.DIMENSOES.find(function (d) { return d.id === dim; }).nome;
        if (U.confirmar(nome + ' só chega a 2 com uma evidência confirmada ou documentada do cliente.\n\nRegistrar essa evidência agora?')) {
          App.novaEvidencia(opId, null, dim);
        }
        return;
      }
      Store.pontuar(opId, dim, valor);
      render();
    },

    /* ---------- Evidências ---------- */
    capturaRapida: function () {
      const abertas = Store.dados().oportunidades.filter(function (o) { return !o.desfecho; });
      if (!abertas.length) { alert('Nenhuma oportunidade aberta para registrar evidência.'); return; }
      App.novaEvidencia(null, abertas);
    },

    /* Evidência = o cliente se moveu. É o único registro que altera Evidence Age. */
    novaEvidencia: function (opId, listaAbertas, dimensaoSugerida) {
      const op = opId ? Store.oportunidade(opId) : null;
      if (opId && !op) return;

      const sugestoes = [];
      P.DIMENSOES.forEach(function (d) {
        d.evidencias.forEach(function (ev) { sugestoes.push({ valor: d.id + '|' + ev, rotulo: d.nome + ' — ' + ev }); });
      });

      /* Compartilhados entre a montagem dos campos e o comportamento da janela. */
      let tocado = false;
      let notaTocada = false;
      let opSelecionada = op;

      const campos = [];
      if (listaAbertas) {
        campos.push({
          id: 'oportunidadeId', rotulo: 'Oportunidade', tipo: 'select',
          opcoes: listaAbertas.map(function (o) {
            const c = Store.conta(o.contaId);
            return { valor: o.id, rotulo: ((c && c.nome) ? c.nome + ' — ' : '') + o.titulo };
          })
        });
      }

      /* A caixa que preenche o resto. Um parágrafo colado vira título,
         dimensão, força, contato, canal, data e compromisso — sete campos.
         A nota fica de fora na marra: é ela que vira IAD. */
      campos.push({
        id: 'ata', tipo: 'ia', extrair: 'evidencia',
        rotulo: 'Cole a ata ou conte o que aconteceu',
        placeholder: 'Ex.: Call de ontem com a Agro Verde. Entrou o Marcelo Prates, que é CFO. Disse que a perda por contaminação está em 4% do lote e ficou de mandar os números até dia 30.',
        nunca: ['nota'],
        contexto: function () { return IA.contextoDaOportunidade(opSelecionada); },
        aoAplicar: function (dlg, r) {
          /* A IA devolve o nome de quem falou; aqui ele vira o contato certo. */
          const nome = (r.campos && r.campos.contato) || '';
          const select = dlg.querySelector('[name="contatoId"]');
          if (nome && select) {
            const achado = Array.prototype.filter.call(select.options, function (o) {
              return o.value && o.textContent.toLowerCase().indexOf(nome.toLowerCase().split(' ')[0]) !== -1;
            })[0];
            if (achado) { select.value = achado.value; U.marcarSugerido(select, nome); }
          }
          /* Força sugerida move a nota automática. Congelamos: a nota volta
             para "manter" e espera a escolha de quem esteve na reunião. */
          const nota = dlg.querySelector('[name="nota"]');
          if (nota) {
            notaTocada = true;
            nota.value = 'manter';
            U.marcarSugerido(nota, 'A nota é sua: o assistente não decide se a decisão amadureceu.');
          }
          tocado = true;
        }
      });

      const pessoas = op ? E.stakeholdersDaOp(op) : [];
      campos.push(
        { id: 'titulo', rotulo: 'O que o cliente fez', tipo: 'textarea', voz: true, placeholder: 'Ex.: CFO pediu o payback antes de aprovar' },
        { id: 'dimensao', rotulo: 'Dimensão afetada', tipo: 'select', padrao: dimensaoSugerida || 'problema', opcoes: P.DIMENSOES.map(function (d) { return { valor: d.id, rotulo: d.nome }; }) },
        { id: 'forca', rotulo: 'Força da evidência', tipo: 'select', padrao: 'confirmado', opcoes: P.FORCAS.map(function (f) { return { valor: f.id, rotulo: f.rotulo + ' — ' + f.desc }; }) },
        /* Registrar a evidência e pontuar eram dois gestos, e o segundo não era
           pedido em lugar nenhum: a pessoa lançava a evidência e o mapa continuava
           zerado, como se nada tivesse acontecido. Agora é a mesma janela. */
        { id: 'nota', rotulo: 'Como fica esta decisão', tipo: 'select', padrao: '2', opcoes: [
          { valor: 'manter', rotulo: 'Manter como está' },
          { valor: '0', rotulo: '0 — Não sabemos' },
          { valor: '1', rotulo: '1 — Parcial' },
          { valor: '2', rotulo: '2 — Comprovado pelo cliente' }
        ] },
        { id: 'sugestao', rotulo: 'Ou escolha uma evidência típica', tipo: 'select', opcoes: [{ valor: '', rotulo: '— descrever acima —' }].concat(sugestoes) }
      );
      if (pessoas.length) {
        campos.push({
          id: 'contatoId', rotulo: 'Quem produziu', tipo: 'select',
          opcoes: [{ valor: '', rotulo: '— não informado —' }].concat(pessoas.map(function (p) { return { valor: p.id, rotulo: p.nome }; }))
        });
      }
      campos.push(
        { id: 'canal', rotulo: 'Canal', tipo: 'select', opcoes: ['Reunião', 'E-mail', 'WhatsApp', 'LinkedIn', 'Telefone', 'Documento'] },
        { id: 'data', rotulo: 'Data', tipo: 'date', padrao: Store.hoje() },
        { id: 'compromissoTexto', rotulo: 'O que ficou combinado (opcional)' },
        { id: 'compromissoData', rotulo: 'Para quando', tipo: 'date' },
        { id: 'compromissoDono', rotulo: 'A vez é de quem', tipo: 'select', opcoes: [{ valor: 'cliente', rotulo: 'Do cliente' }, { valor: 'nos', rotulo: 'Nossa' }] }
      );

      U.formulario('Evidência do cliente', campos, {}, function (d) {
        let titulo = d.titulo, dimensao = d.dimensao;
        if (d.sugestao) {
          const partes = d.sugestao.split('|');
          dimensao = partes[0];
          if (!titulo) titulo = partes[1];
        }
        if (!titulo) return;
        const alvo = opId || d.oportunidadeId;
        Store.registrarEvento(alvo, {
          tipo: 'decision', titulo: titulo, dimensao: dimensao, forca: d.forca,
          contatoId: d.contatoId || null, canal: d.canal, data: d.data || Store.hoje(),
          compromisso: d.compromissoData
            ? { texto: d.compromissoTexto || 'Próximo passo combinado', data: d.compromissoData, dono: d.compromissoDono }
            : null
        });

        /* A evidência entra primeiro: é ela que autoriza o 2. */
        if (d.nota !== 'manter') {
          const nota = Number(d.nota);
          const atual = Store.oportunidade(alvo);
          if (nota === 2 && !E.podeComprovar(atual, dimensao)) {
            alert('Evidência registrada. A nota ficou em 1: só relato não comprova — para 2 é preciso uma evidência confirmada ou documentada.');
            Store.pontuar(alvo, dimensao, Math.max(1, atual.dims[dimensao] || 0));
          } else {
            Store.pontuar(alvo, dimensao, nota);
          }
        }
        render();
      }, function (dlg) {
        /* A dimensão se ajusta ao que está sendo escrito ou ditado; o vendedor pode trocar. */
        const texto = dlg.querySelector('[name="titulo"]');
        const select = dlg.querySelector('[name="dimensao"]');
        const forca = dlg.querySelector('[name="forca"]');
        const nota = dlg.querySelector('[name="nota"]');
        const escolhaOp = dlg.querySelector('[name="oportunidadeId"]');

        const opDoFormulario = function () {
          return op || (escolhaOp ? Store.oportunidade(escolhaOp.value) : null);
        };
        opSelecionada = opDoFormulario();

        /* O 2 vale "comprovado", e relato não comprova. Em vez de aceitar e
           recusar depois, a opção fica indisponível enquanto não puder valer. */
        const ajustarNota = function () {
          const alvo = opDoFormulario();
          const atual = (alvo && alvo.dims[select.value]) || 0;
          const podeDois = forca.value !== 'relato';
          const opcaoDois = nota.querySelector('option[value="2"]');

          opcaoDois.disabled = !podeDois;
          opcaoDois.textContent = podeDois
            ? '2 — Comprovado pelo cliente'
            : '2 — Comprovado (exige evidência confirmada)';

          if (notaTocada) {
            if (!podeDois && nota.value === '2') nota.value = '1';
            return;
          }
          const sugerida = podeDois ? 2 : 1;
          nota.value = String(Math.max(atual, sugerida));
        };

        nota.addEventListener('change', function () { notaTocada = true; });
        select.addEventListener('change', function () { tocado = true; ajustarNota(); });
        forca.addEventListener('change', ajustarNota);
        if (escolhaOp) escolhaOp.addEventListener('change', function () {
          opSelecionada = opDoFormulario();
          ajustarNota();
        });
        texto.addEventListener('input', function () {
          if (tocado) return;
          const palpite = E.sugerirDimensao(texto.value);
          if (palpite) { select.value = palpite; ajustarNota(); }
        });

        /* Enquanto se escreve: o palpite local acerta pelas palavras óbvias;
           o assistente acerta a diferença entre "vai levar ao CFO" e "o CFO
           participou", que é justamente o que separa relato de confirmado.
           Se a chamada falhar, fica valendo o palpite local — sem aviso. */
        if (IA.disponivel()) {
          const emFila = IA.fila();
          IA.aoParar(texto, 1000, function () {
            if (tocado || texto.value.trim().length < 20) return;
            emFila.pedir('classificar', texto.value, IA.contextoDaOportunidade(opDoFormulario()))
              .then(function (r) {
                if (!r || tocado) return;
                const c = r.campos || {};
                if (c.dimensao && select.querySelector('option[value="' + c.dimensao + '"]')) {
                  select.value = c.dimensao;
                  U.marcarSugerido(select, r.frases.dimensao);
                }
                if (c.forca && !notaTocada) {
                  forca.value = c.forca;
                  U.marcarSugerido(forca, r.frases.forca);
                }
                ajustarNota();
              });
          });
        }
        ajustarNota();
      });
    },

    /* ---------- Reunião inteira de uma vez ----------
       Uma transcrição de call ou uma página de anotações costuma conter cinco
       ou seis movimentos do cliente espalhados por dimensões diferentes: um
       receio (risco), uma exigência de comparação (critérios), alguém novo na
       mesa (stakeholders). Digitar isso um a um é o motivo pelo qual ninguém
       digita. Aqui o documento entra uma vez e sai como uma lista para conferir. */
    analisarReuniao: function (opId) {
      if (!IA.disponivel()) {
        alert('O assistente precisa da nuvem configurada e de você conectado.');
        return;
      }
      const op = Store.oportunidade(opId);
      if (!op) return;

      U.formulario('Analisar reunião ou documento', [
        { id: 'texto', rotulo: 'Cole a transcrição, a ata ou suas anotações', tipo: 'textarea', voz: true,
          placeholder: 'Cole aqui a transcrição do Meet, o resumo automático da call ou o que você anotou durante a reunião.' },
        { id: 'arquivo', rotulo: 'Ou escolha um arquivo de texto (.txt, .md, .vtt, .srt)', tipo: 'file' }
      ], {}, function (d) {
        if (!d.texto || d.texto.length < 60) {
          alert('Preciso de mais texto para separar as evidências.');
          return;
        }
        App.processarReuniao(opId, d.texto);
      }, function (dlg) {
        /* O arquivo não é anexado: ele é lido para dentro da caixa, onde a
           pessoa vê exatamente o que vai ser enviado ao assistente. */
        const entrada = dlg.querySelector('[name="arquivo"]');
        const caixa = dlg.querySelector('[name="texto"]');
        if (!entrada) return;
        entrada.setAttribute('accept', '.txt,.md,.vtt,.srt,.csv,.log,text/*');
        entrada.addEventListener('change', function () {
          const arquivo = entrada.files && entrada.files[0];
          if (!arquivo) return;
          IA.lerTexto(arquivo).then(function (t) {
            caixa.value = t;
            caixa.dispatchEvent(new Event('input'));
          }).catch(function (e) { alert(e.message); });
        });
      });
    },

    processarReuniao: function (opId, texto) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      const aviso = document.createElement('dialog');
      aviso.innerHTML = '<div class="corpo"><h2>Lendo a reunião…</h2>' +
        '<p class="small muted">Separando o que o cliente fez, por decisão. Leva alguns segundos.</p></div>';
      document.body.appendChild(aviso);
      aviso.showModal();

      IA.analisarReuniao(texto, IA.contextoDaOportunidade(op)).then(function (r) {
        aviso.close();
        aviso.remove();
        if (!r) { alert('Não consegui falar com o assistente agora. Tente de novo em instantes.'); return; }
        if (!r.evidencias.length) {
          alert('Li o texto e não encontrei nada que o CLIENTE tenha feito. Atividade nossa não conta como evidência.');
          return;
        }
        App.revisarReuniao(opId, r);
      });
    },

    /* A lista de conferência. Nada entra na base sem alguém marcar — cada
       evidência mexe no Evidence Age, e cada nota mexe no IAD que o dono da
       empresa vê. O assistente propõe; quem esteve na reunião assina. */
    revisarReuniao: function (opId, resultado) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      const dlg = document.createElement('dialog');
      dlg.className = 'revisao-ia';
      dlg.innerHTML = V.revisaoDaReuniao(op, resultado);
      document.body.appendChild(dlg);

      dlg.addEventListener('close', function () {
        if (dlg.returnValue === 'ok') {
          let evidencias = 0, notas = 0, pessoas = 0;

          resultado.evidencias.forEach(function (ev, i) {
            const marca = dlg.querySelector('[data-ev="' + i + '"]');
            if (!marca || !marca.checked) return;
            const forca = dlg.querySelector('[data-forca="' + i + '"]').value;
            const nota = dlg.querySelector('[data-nota="' + i + '"]').value;
            const contatoId = contatoPeloNome(op.contaId, ev.contato);

            Store.registrarEvento(opId, {
              tipo: 'decision', titulo: ev.titulo, dimensao: ev.dimensao, forca: forca,
              contatoId: contatoId, canal: ev.canal || 'Reunião', data: ev.data || Store.hoje(),
              compromisso: ev.compromissoData
                ? { texto: ev.compromissoTexto || 'Próximo passo combinado',
                    data: ev.compromissoData, dono: ev.compromissoDono || 'cliente' }
                : null
            });
            evidencias++;

            /* Mesma regra da evidência avulsa: 2 exige prova confirmada.
               Aqui isso importa mais, porque são várias notas de uma vez. */
            if (nota !== 'manter') {
              const alvo = Store.oportunidade(opId);
              const n = Number(nota);
              const permitida = (n === 2 && !E.podeComprovar(alvo, ev.dimensao))
                ? Math.max(1, alvo.dims[ev.dimensao] || 0)
                : n;
              Store.pontuar(opId, ev.dimensao, permitida);
              notas++;
            }
          });

          (resultado.contatos || []).forEach(function (c, i) {
            const marca = dlg.querySelector('[data-ct="' + i + '"]');
            if (!marca || !marca.checked) return;
            if (contatoPeloNome(op.contaId, c.nome)) return;   /* já existe */
            Store.criarContato({
              contaId: op.contaId, nome: c.nome, cargo: c.cargo || '',
              papel: c.papel || 'Usuário', sentimento: 'neutro',
              perfil: 'nao_classificado', influencia: 2
            });
            pessoas++;
          });

          const partes = [];
          if (evidencias) partes.push(evidencias + (evidencias === 1 ? ' evidência' : ' evidências'));
          if (notas) partes.push(notas + (notas === 1 ? ' nota' : ' notas'));
          if (pessoas) partes.push(pessoas + (pessoas === 1 ? ' pessoa' : ' pessoas'));
          if (partes.length) alert('Registrado: ' + partes.join(', ') + '.');
          render();
        }
        dlg.remove();
      });
      dlg.showModal();
    },

    /* Quatro perguntas fechadas: cada "sim" vira evidência, sem digitação livre. */
    fecharReuniao: function (opId) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      const campos = P.FECHAMENTO_REUNIAO.map(function (q) {
        return { id: q.id, rotulo: q.pergunta, tipo: 'select', opcoes: OPCOES_SIM_NAO };
      });
      campos.push(
        { id: 'data', rotulo: 'Data da reunião', tipo: 'date', padrao: Store.hoje() },
        { id: 'compromissoTexto', rotulo: 'Próximo passo combinado' },
        { id: 'compromissoData', rotulo: 'Para quando', tipo: 'date' },
        { id: 'compromissoDono', rotulo: 'A vez é de quem', tipo: 'select', opcoes: [{ valor: 'cliente', rotulo: 'Do cliente' }, { valor: 'nos', rotulo: 'Nossa' }] }
      );

      U.formulario('Fechamento de reunião', campos, {}, function (d) {
        let registradas = 0;
        P.FECHAMENTO_REUNIAO.forEach(function (q) {
          if (d[q.id] !== 'sim') return;
          Store.registrarEvento(opId, {
            tipo: 'decision', titulo: q.evidencia, dimensao: q.id,
            forca: q.forca, canal: 'Reunião', data: d.data || Store.hoje()
          });
          registradas++;
        });
        if (d.compromissoData) {
          Store.definirCompromisso(opId, {
            texto: d.compromissoTexto || 'Próximo passo combinado',
            data: d.compromissoData, dono: d.compromissoDono
          });
        }
        if (!registradas && !d.compromissoData) {
          alert('Nenhuma evidência e nenhum compromisso: para o cliente, essa reunião não mudou nada.');
        }
        render();
      });
    },

    novaAtividade: function (opId) {
      U.formulario('Atividade do vendedor', [
        { id: 'titulo', rotulo: 'O que nós fizemos', tipo: 'select', opcoes: P.ATIVIDADES_QUE_NAO_CONTAM },
        { id: 'canal', rotulo: 'Canal', tipo: 'select', opcoes: ['Reunião', 'E-mail', 'WhatsApp', 'LinkedIn', 'Telefone'] },
        { id: 'data', rotulo: 'Data', tipo: 'date', padrao: Store.hoje() }
      ], {}, function (d) {
        Store.registrarEvento(opId, { tipo: 'activity', titulo: d.titulo, canal: d.canal, data: d.data || Store.hoje() });
        render();
      });
    },

    removerEvento: function (opId, evId) {
      if (!U.confirmar('Excluir este evento?')) return;
      Store.removerEvento(opId, evId);
      render();
    },

    definirCompromisso: function (opId) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      U.formulario('Próximo compromisso', [
        { id: 'texto', rotulo: 'O que ficou combinado' },
        { id: 'data', rotulo: 'Para quando', tipo: 'date', padrao: Store.hoje() },
        { id: 'dono', rotulo: 'A vez é de quem', tipo: 'select', opcoes: [{ valor: 'cliente', rotulo: 'Do cliente' }, { valor: 'nos', rotulo: 'Nossa' }] }
      ], op.proximoCompromisso || {}, function (d) {
        Store.definirCompromisso(opId, d);
        render();
      });
    },

    /* ---------- Tarefas ---------- */
    novaTarefa: function (opId, decisaoAlvo) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      const r = E.resumo(op);
      U.formulario('Nova tarefa', [
        { id: 'titulo', rotulo: 'O que fazer' },
        { id: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: Store.nomesDoCatalogo('tiposTarefa') },
        {
          id: 'decisaoAlvo', rotulo: 'Decisão que pretende provocar', tipo: 'select',
          padrao: decisaoAlvo || (r.nbd.dimensao ? r.nbd.dimensao.id : 'problema'),
          opcoes: P.DIMENSOES.map(function (d) { return { valor: d.id, rotulo: d.nome }; })
        },
        { id: 'vencimento', rotulo: 'Para quando', tipo: 'date', padrao: Store.hoje() }
      ], {}, function (d) {
        if (!d.titulo) return;
        Store.criarTarefa(Object.assign({ oportunidadeId: opId }, d));
        render();
      });
    },

    concluirTarefa: function (id) {
      Store.concluirTarefa(id);
      render();
    },

    excluirTarefa: function (id) {
      if (!U.confirmar('Excluir esta tarefa?')) return;
      Store.excluirTarefa(id);
      render();
    },

    /* ---------- Arquivos ---------- */
    anexar: function (opId) {
      if (!Arq.disponivel()) { alert('Este navegador não guarda anexos.'); return; }
      const op = Store.oportunidade(opId);
      const entrada = document.createElement('input');
      entrada.type = 'file';
      entrada.onchange = function () {
        const arquivo = entrada.files[0];
        if (!arquivo) return;
        U.formulario('Anexar “' + arquivo.name + '”', [
          { id: 'categoria', rotulo: 'Qual decisão este documento destrava', tipo: 'select', opcoes: P.CATEGORIAS_ARQUIVO },
          { id: 'enviadoPor', rotulo: 'Quem enviou', tipo: 'select', opcoes: [{ valor: 'nos', rotulo: 'Nós' }, { valor: 'cliente', rotulo: 'O cliente' }] },
          { id: 'dimensao', rotulo: 'Dimensão (se virar evidência)', tipo: 'select', opcoes: P.DIMENSOES.map(function (d) { return { valor: d.id, rotulo: d.nome }; }) }
        ], {}, function (d) {
          Arq.salvar(arquivo, {
            oportunidadeId: opId, contaId: op ? op.contaId : null,
            categoria: d.categoria, enviadoPor: d.enviadoPor
          }).then(function () {
            /* Documento que o cliente enviou é evidência documentada — a mais forte que existe. */
            if (d.enviadoPor === 'cliente') {
              Store.registrarEvento(opId, {
                tipo: 'decision', titulo: 'Cliente enviou o documento: ' + arquivo.name,
                dimensao: d.dimensao, forca: 'documentado', canal: 'Documento'
              });
            }
            render();
            /* Anexo de texto guarda muito mais do que "chegou um documento":
               guarda o que o cliente disse. Em vez de exigir que a pessoa
               lembre de analisar depois, o convite aparece na hora. */
            if (IA.disponivel() && IA.ehTexto(arquivo)) {
              if (U.confirmar('Quer que eu leia “' + arquivo.name + '” e separe as evidências desta reunião?')) {
                IA.lerTexto(arquivo)
                  .then(function (t) { App.processarReuniao(opId, t); })
                  .catch(function (e) { alert(e.message); });
              }
            }
          }).catch(function (e) { alert(e.message); });
        });
      };
      entrada.click();
    },

    abrirArquivo: function (id) {
      Arq.abrir(id).catch(function (e) { alert(e.message); });
    },

    excluirArquivo: function (id, opId) {
      if (!U.confirmar('Excluir este anexo definitivamente?')) return;
      Arq.excluir(id).then(function () { pintarArquivos(opId); });
    },

    /* ---------- Importação por planilha ---------- */
    importarCsv: function (tipo) {
      const entrada = document.createElement('input');
      entrada.type = 'file';
      entrada.accept = '.csv,text/csv';
      entrada.onchange = function () {
        const arquivo = entrada.files[0];
        if (!arquivo) return;
        const leitor = new FileReader();
        leitor.onload = function () {
          try {
            const analisado = Csv.parse(String(leitor.result));
            if (!analisado.registros.length) { alert('A planilha está vazia ou sem cabeçalho.'); return; }
            const prévia = Csv.analisar(tipo, analisado.registros);
            const resumo = 'Importar ' + tipo + ':\n\n' +
              '• ' + prévia.novos.length + ' registro(s) novos\n' +
              '• ' + prévia.duplicados.length + ' já existentes (serão ignorados)\n' +
              '• ' + prévia.invalidos.length + ' com problema\n' +
              (prévia.invalidos.length
                ? '\nProblemas:\n' + prévia.invalidos.slice(0, 5).map(function (i) { return 'linha ' + i.linha + ': ' + i.motivo; }).join('\n') + '\n'
                : '') +
              '\nConfirmar a importação?';
            if (!prévia.novos.length) { alert(resumo.replace('\nConfirmar a importação?', '')); return; }
            if (!U.confirmar(resumo)) return;
            const total = Csv.importar(tipo, prévia.novos);
            alert(total + ' registro(s) importados.');
            render();
          } catch (e) {
            alert('Não foi possível ler a planilha: ' + e.message);
          }
        };
        leitor.readAsText(arquivo, 'utf-8');
      };
      entrada.click();
    },

    baixarModelo: function (tipo) {
      baixar(Csv.modelo(tipo), 'modelo-' + tipo + '.csv', 'text/csv;charset=utf-8');
    },

    /* ---------- Grupo comprador, gate e desfecho ---------- */
    ligarStakeholder: function (opId) {
      const op = Store.oportunidade(opId);
      const disponiveis = Store.contatosDaConta(op.contaId).filter(function (c) { return op.stakeholders.indexOf(c.id) === -1; });
      if (!disponiveis.length) {
        if (U.confirmar('Nenhum contato disponível nesta conta. Cadastrar um agora?')) App.novoContato(op.contaId);
        return;
      }
      U.formulario('Vincular ao buying group', [
        { id: 'contatoId', rotulo: 'Pessoa', tipo: 'select', opcoes: disponiveis.map(function (c) { return { valor: c.id, rotulo: c.nome + ' — ' + c.papel }; }) }
      ], {}, function (d) {
        op.stakeholders.push(d.contatoId);
        Store.salvar();
        render();
      });
    },

    ligarTodosStakeholders: function (opId) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      const soltos = Store.contatosDaConta(op.contaId).filter(function (c) {
        return op.stakeholders.indexOf(c.id) === -1;
      });
      if (!soltos.length) return;
      soltos.forEach(function (c) { op.stakeholders.push(c.id); });
      Store.salvar();
      render();
    },

    removerStakeholder: function (opId, contatoId) {
      const op = Store.oportunidade(opId);
      op.stakeholders = op.stakeholders.filter(function (id) { return id !== contatoId; });
      Store.salvar();
      render();
    },

    liberarGate: function (opId) {
      const quem = prompt('Quem autoriza emitir a proposta sem qualificação mínima? (fica registrado)');
      if (!quem) return;
      Store.atualizarOportunidade(opId, { gateLiberadoPor: quem });
      Store.registrarEvento(opId, { tipo: 'activity', titulo: 'Proposal Gate liberado manualmente por ' + quem, canal: 'CRM' });
      render();
    },

    encerrar: function (opId) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      const r = E.resumo(op);
      U.formulario('Encerrar negócio', [
        { id: 'tipo', rotulo: 'Desfecho', tipo: 'select', opcoes: P.DESFECHOS.map(function (d) { return { valor: d.id, rotulo: d.rotulo + ' — ' + d.pergunta }; }) },
        { id: 'data', rotulo: 'Data do fechamento', tipo: 'date', padrao: Store.hoje() },
        { id: 'valorFinal', rotulo: 'Valor final (R$)', tipo: 'number', padrao: op.valor },
        { id: 'concorrente', rotulo: 'Concorrente (se houver)' },
        { id: 'motivo', rotulo: 'Por que terminou assim', tipo: 'textarea', voz: true }
      ], {}, function (d) {
        Store.fecharOportunidade(opId, Object.assign({}, d, {
          iadFinal: r.iad,
          coverageFinal: r.coverage.percentual,
          evidenceAgeFinal: r.evidenceAge,
          diasEmAberto: E.diasEntre(op.criadoEm)
        }));
        render();
      });
    },

    reabrir: function (opId) {
      if (!U.confirmar('Reabrir este negócio? A foto do fechamento será descartada.')) return;
      Store.reabrirOportunidade(opId);
      render();
    },

    /* ---------- Dados ---------- */
    exportar: function () {
      baixar(Store.exportar(), 'iad-crm-' + Store.hoje() + '.json', 'application/json');
    },

    importar: function () {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = function () {
        const arquivo = input.files[0];
        if (!arquivo) return;
        const leitor = new FileReader();
        leitor.onload = function () {
          try { Store.importar(leitor.result); render(); alert('Dados importados.'); }
          catch (e) { alert('Não foi possível importar: ' + e.message); }
        };
        leitor.readAsText(arquivo);
      };
      input.click();
    },

    limpar: function () {
      if (!U.confirmar('Apagar todos os dados deste dispositivo? Os anexos permanecem.')) return;
      Store.limpar();
      location.hash = '#/hoje';
      render();
    },

    carregarDemo: function () {
      if (Store.dados().oportunidades.length && !U.confirmar('Isso substitui os dados atuais. Continuar?')) return;
      global.IADSeed.carregar();
      location.hash = '#/hoje';
      render();
    },

    /* ---------- Nuvem ---------- */
    configurarNuvem: function () {
      const N = global.IADNuvem;
      U.formulario('Conectar ao Supabase', [
        { id: 'url', rotulo: 'URL do projeto', placeholder: 'https://xxxxxxxx.supabase.co' },
        { id: 'chave', rotulo: 'Chave pública (anon / publishable)' }
      ], N.config(), function (d) {
        if (!d.url || !d.chave) { alert('Preencha os dois campos.'); return; }
        N.salvarConfig(d);
        render();
      });
    },

    entrarNuvem: function () {
      const N = global.IADNuvem;
      U.formulario('Entrar na nuvem', [
        { id: 'email', rotulo: 'E-mail' },
        { id: 'senha', rotulo: 'Senha', tipo: 'password' }
      ], {}, function (d) {
        recadoNuvem('Entrando…');
        N.entrar(d.email, d.senha)
          .then(function () { return N.meuPerfil(); })
          .then(function (perfil) {
            N.guardarPerfilNaSessao(perfil);
            render();
            recadoNuvem(perfil && perfil.tenant_id
              ? 'Conectado. Use "Sincronizar agora" para enviar e receber.'
              : 'Conectado. Defina sua empresa antes de sincronizar.');
          })
          .catch(function (e) { render(); recadoNuvem('Não entrou: ' + e.message, true); });
      });
    },

    cadastrarNuvem: function () {
      const N = global.IADNuvem;
      U.formulario('Criar acesso na nuvem', [
        { id: 'nome', rotulo: 'Seu nome' },
        { id: 'email', rotulo: 'E-mail' },
        { id: 'whatsapp', rotulo: 'WhatsApp' },
        { id: 'senha', rotulo: 'Senha (mínimo 6 caracteres)', tipo: 'password' }
      ], {}, function (d) {
        if (!d.email || (d.senha || '').length < 6) { alert('Informe e-mail e uma senha de ao menos 6 caracteres.'); return; }
        recadoNuvem('Criando…');
        N.cadastrar(d.email, d.senha, { nome: d.nome, whatsapp: d.whatsapp })
          .then(function (r) {
            render();
            recadoNuvem(r && r.access_token
              ? 'Acesso criado e conectado. Defina sua empresa.'
              : 'Acesso criado. Confirme o e-mail que o Supabase acabou de enviar e depois clique em "Entrar na nuvem".');
          })
          .catch(function (e) { render(); recadoNuvem('Não foi possível criar: ' + e.message, true); });
      });
    },

    definirEmpresaNuvem: function () {
      const N = global.IADNuvem;
      U.formulario('Minha empresa na nuvem', [
        { id: 'nome', rotulo: 'Nome da empresa' },
        { id: 'cnpj', rotulo: 'CNPJ' }
      ], {}, function (d) {
        if (!d.nome) return;
        recadoNuvem('Criando empresa…');
        N.criarMinhaEmpresa(d.nome, d.cnpj)
          .then(function () { return N.meuPerfil(); })
          .then(function (perfil) {
            N.guardarPerfilNaSessao(perfil);
            render();
            recadoNuvem('Empresa definida. Agora pode sincronizar.');
          })
          .catch(function (e) { render(); recadoNuvem('Falhou: ' + e.message, true); });
      });
    },

    sincronizarNuvem: function () {
      recadoNuvem('Sincronizando…');
      global.IADNuvem.sincronizar()
        .then(function (r) {
          render();
          recadoNuvem('Enviados ' + r.enviados + ' registro(s), recebidos ' + r.recebidos + '.');
        })
        .catch(function (e) { render(); recadoNuvem('Não sincronizou: ' + e.message, true); });
    },

    puxarNuvem: function () {
      if (!U.confirmar('Baixar a carteira da nuvem? O que estiver só neste aparelho e ainda não foi enviado será substituído.')) return;
      recadoNuvem('Baixando…');
      global.IADNuvem.puxar()
        .then(function (n) { render(); recadoNuvem(n + ' registro(s) baixados.'); })
        .catch(function (e) { render(); recadoNuvem('Não baixou: ' + e.message, true); });
    },

    sairNuvem: function () {
      global.IADNuvem.sair().then(function () { render(); });
    },

    /* ---------- Linked Helper ---------- */
    configurarPonte: function () {
      const I = global.IADIntegracoes;
      U.formulario('Ponte do Linked Helper', [
        { id: 'url', rotulo: 'Endereço da ponte', placeholder: 'https://ponte-iad.seu-subdominio.workers.dev/' },
        { id: 'token', rotulo: 'Chave de leitura' }
      ], I.config(), function (d) {
        I.salvarConfig(d);
        leads = null;
        render();
      });
    },

    buscarLeads: function () {
      const alvo = document.getElementById('caixa-linkedhelper');
      if (alvo) alvo.innerHTML = '<div class="tiny muted" style="margin-top:10px">Buscando…</div>';
      global.IADIntegracoes.buscar().then(function (lista) {
        leads = lista;
        pintarLeads();
      }).catch(function (e) {
        leads = null;
        if (alvo) alvo.innerHTML = '<div class="aviso" style="margin-top:10px">' + U.esc(e.message) + '</div>';
      });
    },

    /* Importação em lote: busca, confere e traz de uma vez. É o mesmo caminho
       do converterLead, sem a janela por lead — o que muda é a escala. */
    importarLeads: function () {
      const espera = document.createElement('dialog');
      espera.innerHTML = '<div class="corpo"><h2>Buscando na ponte…</h2>' +
        '<p class="small muted">Procurando quem respondeu no LinkedIn.</p></div>';
      document.body.appendChild(espera);
      espera.showModal();

      global.IADIntegracoes.buscar().then(function (lista) {
        espera.close(); espera.remove();
        leads = lista;
        if (!lista.length) { alert('Nenhuma resposta nova na ponte.'); return; }
        App.revisarImportacao(lista);
      }).catch(function (e) {
        espera.close(); espera.remove();
        alert(e.message);
      });
    },

    revisarImportacao: function (lista) {
      const dlg = document.createElement('dialog');
      dlg.className = 'revisao-ia';
      dlg.innerHTML = V.revisaoDaImportacao(lista);
      document.body.appendChild(dlg);

      dlg.addEventListener('close', function () {
        if (dlg.returnValue === 'ok') {
          const escolhidos = lista.filter(function (l, i) {
            const marca = dlg.querySelector('[data-lead="' + i + '"]');
            return marca && marca.checked;
          });
          const feitos = escolhidos.map(importarUmLead).filter(Boolean);
          if (feitos.length) {
            global.IADIntegracoes.marcarProcessados(escolhidos.map(function (l) { return l.id; }));
            leads = (leads || []).filter(function (l) {
              return escolhidos.indexOf(l) === -1;
            });
            alert(feitos.length === 1
              ? '1 oportunidade criada a partir do Linked Helper.'
              : feitos.length + ' oportunidades criadas a partir do Linked Helper.');
            location.hash = '#/pipeline';
          }
          render();
        }
        dlg.remove();
      });
      dlg.showModal();
    },

    descartarLead: function (id) {
      leads = (leads || []).filter(function (l) { return l.id !== id; });
      global.IADIntegracoes.marcarProcessados([id]);
      pintarLeads();
    },

    /* A resposta no LinkedIn é evidência do cliente: entra como tal, com força
       de relato — ele disse que tem o problema, ainda não provou. */
    converterLead: function (id) {
      const lead = (leads || []).find(function (l) { return l.id === id; });
      if (!lead) return;

      /* Saiu da empresa: a conta seria criada com um único contato que não
         trabalha mais nela. Perguntamos antes de deixar o dado entrar. */
      if (lead.saiuEm && !U.confirmar(
        lead.nome + ' saiu da ' + (lead.empresa || 'empresa') + ' em ' + lead.saiuEm + '.\n\n' +
        'Criar a oportunidade assim mesmo? Cancele para descartar ou para descobrir onde a pessoa está hoje.')) {
        return;
      }

      const contas = Store.dados().contas;
      const parecida = contas.find(function (c) {
        return lead.empresa && c.nome.toLowerCase().indexOf(lead.empresa.toLowerCase().slice(0, 12)) !== -1;
      });

      U.formulario('Nova oportunidade a partir do LinkedIn', [
        { id: 'contaId', rotulo: 'Empresa', tipo: 'select', padrao: parecida ? parecida.id : '',
          opcoes: [{ valor: '', rotulo: '— cadastrar a empresa abaixo —' }]
            .concat(contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; })) },
        { id: 'empresaNova', rotulo: 'Nome da nova empresa', padrao: parecida ? '' : lead.empresa },
        { id: 'segmento', rotulo: 'Segmento', tipo: 'select',
          opcoes: [{ valor: '', rotulo: '— sem segmento —' }]
            .concat(Store.nomesDoCatalogo('segmentos').map(function (n) { return { valor: n, rotulo: n }; })) },
        { id: 'titulo', rotulo: 'Oportunidade', padrao: lead.empresa ? 'Oportunidade — ' + lead.empresa : 'Oportunidade do LinkedIn' },
        { id: 'etapa', rotulo: 'Etapa', tipo: 'select', padrao: 'Conexão', opcoes: P.ETAPAS },
        { id: 'papel', rotulo: 'Papel na compra', tipo: 'select', opcoes: P.PAPEIS },
        { id: 'perfil', rotulo: 'Perfil (Challenger)', tipo: 'select',
          opcoes: P.PERFIS.map(function (x) { return { valor: x.id, rotulo: x.rotulo }; }) },
        { id: 'evidencia', rotulo: 'Evidência (o que o cliente disse)', tipo: 'textarea', padrao: lead.resposta },
        { id: 'dimensao', rotulo: 'Dimensão afetada', tipo: 'select', padrao: 'problema',
          opcoes: P.DIMENSOES.map(function (d) { return { valor: d.id, rotulo: d.nome }; }) }
      ], {}, function (d) {
        let contaId = d.contaId;
        if (!contaId) {
          const nome = d.empresaNova || lead.empresa;
          if (!nome) { alert('Informe a empresa.'); return; }
          if (d.segmento) Store.criarNoCatalogo('segmentos', { nome: d.segmento });
          contaId = Store.criarConta({
            nome: nome, segmento: d.segmento || '',
            site: lead.empresaSite || '', cidade: lead.empresaCidade || ''
          }).id;
        }

        const contato = Store.criarContato({
          contaId: contaId, nome: lead.nome || 'Contato do LinkedIn', cargo: lead.cargo,
          papel: d.papel, perfil: d.perfil, linkedin: lead.linkedin,
          email: lead.email, telefone: lead.telefone,
          sentimento: lead.resposta ? 'neutro' : 'nao_acessado', canalPreferido: 'LinkedIn'
        });

        const op = Store.criarOportunidade({
          contaId: contaId, titulo: d.titulo, etapa: d.etapa,
          notas: lead.linkedin ? 'Origem: Linked Helper · ' + lead.linkedin : 'Origem: Linked Helper'
        });
        op.stakeholders.push(contato.id);
        Store.salvar();

        if (d.evidencia) {
          Store.registrarEvento(op.id, {
            tipo: 'decision', titulo: d.evidencia, dimensao: d.dimensao,
            forca: 'relato', contatoId: contato.id, canal: 'LinkedIn',
            /* A data é a da resposta, não a de hoje. Um lead que ficou dois
               dias na ponte nasceria com o Evidence Age zerado errado. */
            data: lead.respostaEm || Store.hoje()
          });
        }

        /* A sequência escrita para este prospect já é o reenquadramento.
           Entra como rascunho: formulado por nós, ainda não apresentado. */
        if (lead.insight) {
          Store.definirInsight(op.id, { texto: lead.insight, estado: 'formulado' });
        }

        /* O lead é de quem prospectou, não de quem clicou em importar. */
        atribuirAoOperador(lead, [Store.conta(contaId), contato, op]);

        leads = (leads || []).filter(function (l) { return l.id !== id; });
        global.IADIntegracoes.marcarProcessados([id]);
        location.hash = '#/op/' + op.id;
        render();
      });
    },

    /* ---------- acesso ---------- */
    telaAcesso: function (tela) { V.definirTelaAcesso(tela, null, ''); render(); },

    /* Trocar a própria senha. Existe porque a senha inicial de um usuário é
       entregue por outra pessoa — e senha que passou pela mão de alguém não é
       mais senha até ser trocada. */
    trocarMinhaSenha: function () {
      const N = global.IADNuvem;
      if (!N.conectado()) {
        alert('Entre com sua conta do servidor para trocar a senha.');
        return;
      }
      U.formulario('Trocar minha senha', [
        { id: 'nova', rotulo: 'Nova senha', tipo: 'password', placeholder: 'mínimo 8 caracteres' },
        { id: 'confere', rotulo: 'Repita a nova senha', tipo: 'password' }
      ], {}, function (d) {
        if (d.nova.length < 8) { alert('A senha precisa ter pelo menos 8 caracteres.'); return; }
        if (d.nova !== d.confere) { alert('As duas senhas não são iguais. Tente de novo.'); return; }
        N.trocarMinhaSenha(d.nova).then(function () {
          alert('Senha trocada. Ela vale a partir do próximo acesso, em qualquer aparelho.');
        }).catch(function (e) {
          alert('Não consegui trocar a senha: ' + e.message);
        });
      });
    },

    verSenha: function (id, botao) {
      const campo = document.getElementById(id);
      if (!campo) return;
      const escondida = campo.type === 'password';
      campo.type = escondida ? 'text' : 'password';
      botao.textContent = escondida ? '🙈' : '👁';
      botao.setAttribute('aria-label', escondida ? 'Esconder a senha' : 'Mostrar a senha');
    },

    /* Quem esperava ser ligado a uma empresa tenta de novo sem sair e voltar. */
    tentarDeNovo: function () {
      V.definirTelaAcesso('empresa', null, 'Consultando o servidor…');
      render();
      concluirEntradaNaNuvem().catch(function (e) {
        V.definirTelaAcesso('empresa', null, e.message);
        render();
      });
    },

    entrar: function () {
      const login = (document.getElementById('ac-login') || {}).value || '';
      const senha = (document.getElementById('ac-senha') || {}).value || '';
      if (!login || !senha) { V.definirTelaAcesso('login', null, 'Informe login e senha.'); return render(); }

      /* Com a nuvem configurada, quem confere a senha é o servidor — sem exceção.
         O antigo atalho local abria o app público para quem soubesse a senha de
         fábrica, que está no repositório. Offline continua funcionando: a sessão
         já aberta persiste no aparelho. */
      if (global.IADNuvem.mandaNoAcesso()) return entrarPelaNuvem(login, senha);

      A.entrar(login, senha).then(function () {
        V.definirTelaAcesso('login', null, '');
        location.hash = '#/hoje';
        render();
      }).catch(function (e) {
        /* Quem parou no meio do primeiro acesso volta para onde parou. */
        if (e.pendente === 'codigo') {
          A.gerarCodigo(e.usuario);
          V.definirTelaAcesso('codigo', e.usuario, 'Confirme seu e-mail para continuar.');
        } else if (e.pendente === 'perfil') {
          V.definirTelaAcesso('perfil', e.usuario, 'Falta completar seu cadastro.');
        } else {
          V.definirTelaAcesso('login', null, e.message);
        }
        render();
      });
    },

    criarAcesso: function () {
      const v = function (id) { return (document.getElementById(id) || {}).value || ''; };
      const nome = v('ac-nome').trim(), email = v('ac-email').trim();
      const senha1 = v('ac-senha1'), senha2 = v('ac-senha2');

      if (!nome || !email) return recado('cadastro', 'Preencha nome e e-mail.');
      if (email.indexOf('@') === -1) return recado('cadastro', 'E-mail inválido.');
      if (senha1.length < 6) return recado('cadastro', 'A senha precisa de ao menos 6 caracteres.');
      if (senha1 !== senha2) return recado('cadastro', 'As senhas não conferem.');

      const dados = { nome: nome, email: email, whatsapp: v('ac-whatsapp').trim() };

      if (global.IADNuvem.mandaNoAcesso()) {
        recado('cadastro', 'Criando acesso…');
        global.IADNuvem.cadastrar(email, senha1, dados)
          .then(function () {
            V.definirTelaAcesso('confirme', { email: email }, '');
            render();
          })
          .catch(function (e) { recado('cadastro', e.message); });
        return;
      }

      A.criarUsuario(dados, senha1)
        .then(function (u) {
          A.gerarCodigo(u);
          V.definirTelaAcesso('codigo', u, '');
          render();
        })
        .catch(function (e) { recado('cadastro', e.message); });
    },

    reenviarCodigo: function () {
      const u = pendenteAtual();
      if (!u) return;
      A.gerarCodigo(u);
      V.definirTelaAcesso('codigo', u, 'Código novo gerado.');
      render();
    },

    confirmarCodigo: function () {
      const u = pendenteAtual();
      if (!u) return;
      const digitado = (document.getElementById('ac-codigo') || {}).value || '';
      const r = A.confirmarCodigo(u, digitado);
      if (!r.ok) return recado('codigo', r.motivo, u);
      V.definirTelaAcesso('perfil', u, '');
      render();
    },

    completarPerfil: function () {
      const u = pendenteAtual();
      if (!u) return;
      const v = function (id) { return (document.getElementById(id) || {}).value || ''; };
      try {
        A.completarPerfil(u, {
          tenantId: v('ac-empresa'), empresaNova: v('ac-empresa-nova').trim(),
          cnpj: v('ac-cnpj').trim(), nome: v('ac-nome2').trim(), whatsapp: v('ac-whats2').trim()
        });
      } catch (e) {
        return recado('perfil', e.message, u);
      }
      A.abrirSessao(u);
      V.definirTelaAcesso('login', null, '');
      location.hash = '#/hoje';
      render();
    },

    sair: function (semPerguntar) {
      if (!semPerguntar && !U.confirmar('Sair do sistema?')) return;
      A.encerrarSessao();
      const N = global.IADNuvem;
      const depois = function () { V.definirTelaAcesso('login', null, ''); render(); };
      if (N.conectado()) N.sair().then(depois, depois); else depois();
    },

    /* A empresa nasce no banco, não aqui: ver criar_minha_empresa no schema. */
    criarEmpresaAcesso: function () {
      const v = function (id) { return (document.getElementById(id) || {}).value || ''; };
      const nome = v('ac-empresa-nova').trim();
      if (!nome) return recado('empresa', 'Escreva o nome da empresa.');
      recado('empresa', 'Criando empresa…');
      global.IADNuvem.criarMinhaEmpresa(nome, v('ac-cnpj').trim())
        .then(function () { return concluirEntradaNaNuvem(); })
        .catch(function (e) {
          /* "já está ligado a uma empresa" chegando nesta tela é contradição: a
             tela só aparece quando o perfil veio sem empresa. Em vez de virar
             beco sem saída, relemos o perfil — na maioria das vezes a empresa
             está lá e a pessoa simplesmente entra. */
          if (/já está ligado/i.test(e.message)) {
            return concluirEntradaNaNuvem().catch(function () {
              recado('empresa', 'O servidor diz que você já tem empresa, mas ela não veio na leitura do seu perfil. ' +
                'Saia e entre de novo; se repetir, é um problema de permissão no banco.');
            });
          }
          recado('empresa', e.message);
        });
    },

    /* ---------- administração da nuvem ---------- */
    empresaDoPerfil: function (id, tenantId) {
      global.IADNuvem.definirEmpresaDoPerfil(id, tenantId)
        .then(function () { perfisNuvem = null; pintarUsuariosNuvem(true); })
        .catch(function (e) { alert('Não foi possível ligar à empresa: ' + e.message); pintarUsuariosNuvem(true); });
    },

    papelDoPerfil: function (id, papel) {
      if (papel === 'admin' && !U.confirmar('Administrador enxerga todas as empresas e pode mover pessoas entre elas. Confirma?')) {
        return pintarUsuariosNuvem(true);
      }
      global.IADNuvem.definirPapelDoPerfil(id, papel)
        .then(function () { perfisNuvem = null; pintarUsuariosNuvem(true); })
        .catch(function (e) { alert('Não foi possível mudar o papel: ' + e.message); pintarUsuariosNuvem(true); });
    },

    recarregarUsuariosNuvem: function () { perfisNuvem = null; pintarUsuariosNuvem(true); },

    novaEmpresaNuvem: function () {
      U.formulario('Nova empresa', [
        { id: 'nome', rotulo: 'Nome da empresa' },
        { id: 'cnpj', rotulo: 'CNPJ' }
      ], {}, function (d) {
        if (!d.nome) return;
        global.IADNuvem.criarEmpresa(d.nome, d.cnpj)
          .then(function () { perfisNuvem = null; pintarUsuariosNuvem(true); })
          .catch(function (e) { alert('Não foi possível criar a empresa: ' + e.message); });
      });
    },

    /* Registrar antes de a pessoa existir é o que faz o vínculo ser decidido
       aqui, e não por ela na tela de cadastro. */
    convidarPessoa: function () {
      const empresas = empresasNuvem || [];
      if (!empresas.length) { alert('Crie uma empresa antes de registrar pessoas nela.'); return; }
      U.formulario('Registrar pessoa', [
        { id: 'email', rotulo: 'E-mail que ela vai usar', tipo: 'email' },
        { id: 'tenantId', rotulo: 'Empresa', tipo: 'select',
          opcoes: empresas.map(function (t) { return { valor: t.id, rotulo: t.nome }; }) },
        { id: 'papel', rotulo: 'Papel', tipo: 'select', opcoes: [
          { valor: 'usuario', rotulo: 'Usuário — vê o que é dele' },
          { valor: 'gestor', rotulo: 'Gestor — vê a empresa inteira' },
          { valor: 'admin', rotulo: 'Administrador — vê todas as empresas' }] }
      ], {}, function (d) {
        const email = (d.email || '').trim();
        if (!email || email.indexOf('@') === -1) { alert('Informe um e-mail válido.'); return; }
        global.IADNuvem.convidar(email, d.tenantId, d.papel)
          .then(function () {
            perfisNuvem = null;
            pintarUsuariosNuvem(true);
            const empresa = empresas.find(function (t) { return t.id === d.tenantId; });
            if (U.confirmar('Registrada em ' + ((empresa && empresa.nome) || 'sua empresa') + '.\n\n' +
                'O sistema não envia e-mail — quem envia é você.\n\nAbrir seu e-mail com o convite pronto?')) {
              App.enviarConvite(email.toLowerCase());
            }
          })
          .catch(function (e) { alert('Não foi possível registrar: ' + e.message); });
      });
    },

    /* O sistema não manda e-mail — o do Supabase é limitado a poucos por hora e
       foi ele que travou o time. Então o app monta a mensagem e entrega pronta:
       quem envia é o administrador, do próprio endereço, que é mais confiável
       do que qualquer serviço gratuito. */
    enviarConvite: function (email) {
      const t = textoDoConvite(email);
      const url = 'mailto:' + encodeURIComponent(email) +
        '?subject=' + encodeURIComponent('Seu acesso ao IAD CRM') +
        '&body=' + encodeURIComponent(t);
      location.href = url;
    },

    copiarConvite: function (email) {
      const t = textoDoConvite(email);
      const pronto = function () { alert('Convite copiado. Cole no WhatsApp, no e-mail, onde preferir.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(pronto, function () { U.formulario('Convite', [
          { id: 'texto', rotulo: 'Copie e envie', tipo: 'textarea', padrao: t }], {}, function () {}); });
      } else {
        U.formulario('Convite', [{ id: 'texto', rotulo: 'Copie e envie', tipo: 'textarea', padrao: t }], {}, function () {});
      }
    },

    cancelarConvite: function (email) {
      if (!U.confirmar('Cancelar o registro de ' + email + '?')) return;
      global.IADNuvem.removerConvite(email)
        .then(function () { perfisNuvem = null; pintarUsuariosNuvem(true); })
        .catch(function (e) { alert('Não foi possível cancelar: ' + e.message); });
    },

    filtrarTenant: function (valor) { A.definirFiltros({ tenant: valor, usuario: 'todos' }); render(); },
    filtrarUsuarioAdmin: function (valor) { A.definirFiltros({ usuario: valor }); render(); },

    /* ---------- usuários ---------- */
    novoUsuario: function () {
      U.formulario('Novo usuário', camposUsuario(), {}, function (d) {
        if (!d.nome || !d.email) { alert('Nome e e-mail são obrigatórios.'); return; }
        if (!d.senha || d.senha.length < 6) { alert('Defina uma senha de ao menos 6 caracteres.'); return; }
        A.criarUsuario({
          nome: d.nome, email: d.email, login: d.login || d.email, whatsapp: d.whatsapp,
          tenantId: d.tenantId || Store.tenantDeTrabalho(), papel: d.papel,
          emailConfirmado: true
        }, d.senha).then(render).catch(function (e) { alert(e.message); });
      });
    },

    editarUsuario: function (id) {
      const u = A.usuario(id);
      if (!u) return;
      U.formulario('Editar usuário', camposUsuario(u).concat([
        { id: 'ativo', rotulo: 'Situação', tipo: 'select', opcoes: [{ valor: 'sim', rotulo: 'Ativo' }, { valor: 'nao', rotulo: 'Inativo' }] }
      ]), Object.assign({}, u, { senha: '', ativo: u.ativo === false ? 'nao' : 'sim' }), function (d) {
        A.salvarUsuario(id, {
          nome: d.nome, email: d.email, login: d.login, whatsapp: d.whatsapp,
          tenantId: d.tenantId || u.tenantId, papel: d.papel, ativo: d.ativo === 'sim'
        }, d.senha || null).then(render).catch(function (e) { alert(e.message); });
      });
    },

    excluirUsuario: function (id) {
      if (!U.confirmar('Excluir este acesso? Os registros criados por ele continuam no sistema.')) return;
      try { A.excluirUsuario(id); render(); }
      catch (e) { alert(e.message); }
    },

    instalar: function () {
      if (!promptInstalacao) {
        alert('Use o menu do navegador: “Instalar aplicativo” (Chrome/Edge) ou Compartilhar → “Adicionar à Tela de Início” (Safari/iPhone).');
        return;
      }
      promptInstalacao.prompt();
      promptInstalacao = null;
    }
  };

  function pendenteAtual() {
    return V.pendenteAcesso ? V.pendenteAcesso() : null;
  }

  function recado(tela, texto, usuario) {
    V.definirTelaAcesso(tela, usuario === undefined ? undefined : usuario, texto);
    render();
  }

  function camposUsuario(u) {
    const admin = A.ehAdmin();
    const empresas = A.tenants();
    const campos = [
      { id: 'nome', rotulo: 'Nome' },
      { id: 'email', rotulo: 'E-mail' },
      { id: 'login', rotulo: 'Login (opcional, o padrão é o e-mail)' },
      { id: 'whatsapp', rotulo: 'WhatsApp' },
      { id: 'senha', rotulo: u ? 'Nova senha (deixe vazio para manter)' : 'Senha', tipo: 'password' }
    ];
    if (admin) {
      campos.push({
        id: 'tenantId', rotulo: 'Empresa', tipo: 'select',
        opcoes: empresas.map(function (t) { return { valor: t.id, rotulo: t.nome }; })
      });
      campos.push({
        id: 'papel', rotulo: 'Papel', tipo: 'select',
        opcoes: [{ valor: 'usuario', rotulo: 'Usuário' }, { valor: 'gestor', rotulo: 'Gestor' },
                 { valor: 'admin', rotulo: 'Administrador' }]
      });
    }
    return campos;
  }

  /* Um lead vira três registros. Sem janela e sem digitação: o que não veio
     do LinkedIn fica em branco para o vendedor completar depois — melhor um
     campo vazio do que um palpite virando fato no painel. */
  function importarUmLead(lead) {
    const nome = lead.empresa || ('Contato ' + (lead.nome || 'do LinkedIn'));
    let conta = Store.dados().contas.find(function (c) {
      return lead.empresa && c.nome.toLowerCase().indexOf(lead.empresa.toLowerCase().slice(0, 12)) !== -1;
    });
    if (!conta) {
      conta = Store.criarConta({
        nome: nome, site: lead.empresaSite || '', cidade: lead.empresaCidade || ''
      });
    }

    const contato = Store.criarContato({
      contaId: conta.id, nome: lead.nome || 'Contato do LinkedIn', cargo: lead.cargo || '',
      linkedin: lead.linkedin || '', email: lead.email || '', telefone: lead.telefone || '',
      sentimento: lead.resposta ? 'neutro' : 'nao_acessado', canalPreferido: 'LinkedIn'
    });

    /* Quem já respondeu passou da prospecção: dizer que está em Prospecção
       seria etapa mais atrasada que a realidade, e o IAD compara as duas. */
    const op = Store.criarOportunidade({
      contaId: conta.id,
      titulo: (lead.empresa ? lead.empresa : (lead.nome || 'LinkedIn')) + ' — origem LH',
      etapa: lead.resposta ? 'Conexão' : 'Prospecção',
      origem: 'Linked Helper',
      notas: 'ORIGEM LH' + (lead.campanha ? ' · campanha: ' + lead.campanha : '') +
        (lead.operador ? ' · prospecção de ' + lead.operador : '') +
        (lead.linkedin ? '\n' + lead.linkedin : '') +
        (lead.headline ? '\n' + lead.headline : '')
    });
    op.stakeholders.push(contato.id);
    Store.salvar();

    if (lead.resposta) {
      Store.registrarEvento(op.id, {
        tipo: 'decision', titulo: lead.resposta.slice(0, 160), dimensao: 'problema',
        forca: 'relato', contatoId: contato.id, canal: 'LinkedIn',
        data: lead.respostaEm || Store.hoje()
      });
    }
    if (lead.insight) {
      Store.definirInsight(op.id, { texto: lead.insight, estado: 'formulado' });
    }
    atribuirAoOperador(lead, [conta, contato, op]);
    return op;
  }

  /* O lead pertence a quem prospectou, não a quem clicou em importar. Só
     funciona quando o operador do Linked Helper também é usuário do IAD —
     senão o registro fica com quem importou, que é o comportamento normal. */
  function atribuirAoOperador(lead, registros) {
    if (!lead.operadorEmail) return;
    const dono = A.porLogin(lead.operadorEmail);
    if (!dono) return;
    registros.forEach(function (r) { if (r) r.donoId = dono.id; });
    Store.salvar();
  }

  /* A IA devolve o nome de quem falou; a base trabalha com id. Casa pelo
     primeiro nome, que é como as pessoas aparecem numa transcrição. */
  function contatoPeloNome(contaId, nome) {
    if (!nome || !contaId) return null;
    const primeiro = String(nome).trim().toLowerCase().split(/\s+/)[0];
    if (primeiro.length < 3) return null;
    const achado = Store.contatosDaConta(contaId).filter(function (c) {
      return String(c.nome || '').toLowerCase().indexOf(primeiro) !== -1;
    })[0];
    return achado ? achado.id : null;
  }

  /* O material do rascunho de insight: o que o cliente já disse sobre o
     problema e o impacto. Sem isso o assistente escreveria genérico. */
  function baseDoInsight(op) {
    const conta = Store.conta(op.contaId);
    const partes = [];
    if (conta) {
      partes.push('Empresa: ' + conta.nome + (conta.segmento ? ' (' + conta.segmento + ')' : '') +
        (conta.porte ? ', porte: ' + conta.porte : '') + '.');
    }
    ['problema', 'impacto', 'prioridade'].forEach(function (dim) {
      E.evidenciasDaDimensao(op, dim).slice(-3).forEach(function (ev) {
        partes.push('O cliente: ' + ev.titulo);
      });
    });
    return partes.join('\n');
  }

  /* ---------- campos reutilizados ---------- */
  function camposProduto() {
    return [
      { id: 'nome', rotulo: 'Produto' },
      { id: 'sku', rotulo: 'Código / SKU' },
      { id: 'categoria', rotulo: 'Categoria' },
      { id: 'unidade', rotulo: 'Unidade', placeholder: 'un, kg, t, hora, mês' },
      { id: 'precoReferencia', rotulo: 'Preço de referência (R$)', tipo: 'moeda' },
      { id: 'descricao', rotulo: 'Descrição', tipo: 'textarea' }
    ];
  }

  function camposConta() {
    const segmentos = Store.nomesDoCatalogo('segmentos');
    return [
      { id: 'atalhoConta', tipo: 'ia', extrair: 'conta',
        rotulo: 'Cole o que você já sabe da empresa',
        placeholder: 'Ex.: Agro Verde Ltda, fica em Sorocaba, cerca de 300 funcionários, site agroverde.com.br, telefone (15) 3232-1010.',
        /* Prospect, cliente ou ex-cliente é fato comercial nosso — não sai de texto. */
        nunca: ['relacaoAtual'],
        contexto: function () { return IA.contextoDaConta(null); } },
      { id: 'nome', rotulo: 'Empresa (nome fantasia)' },
      { id: 'razaoSocial', rotulo: 'Razão social' },
      { id: 'cnpj', rotulo: 'CNPJ' },
      { id: 'segmento', rotulo: 'Segmento', tipo: 'select',
        opcoes: [{ valor: '', rotulo: '— sem segmento —' }]
          .concat(segmentos.map(function (n) { return { valor: n, rotulo: n }; })) },
      { id: 'telefone', rotulo: 'Telefone' },
      { id: 'porte', rotulo: 'Porte (faturamento ou funcionários)' },
      { id: 'cidade', rotulo: 'Cidade' },
      { id: 'uf', rotulo: 'UF' },
      { id: 'site', rotulo: 'Site' },
      { id: 'relacaoAtual', rotulo: 'Relação atual', tipo: 'select', opcoes: P.RELACOES_CONTA }
    ];
  }

  function camposContato(contaId, exceto) {
    const colegas = (contaId ? Store.contatosDaConta(contaId) : [])
      .filter(function (c) { return c.id !== exceto; });
    return [
      { id: 'atalhoContato', tipo: 'ia', extrair: 'contato',
        rotulo: 'Cole a assinatura do e-mail, o perfil do LinkedIn ou descreva a pessoa',
        placeholder: 'Ex.: Marcelo Prates — Diretor Financeiro, Agro Verde. marcelo.prates@agroverde.com.br, (15) 99812-3344. Foi quem pediu o payback.',
        contexto: function () { return IA.contextoDaConta(contaId); } },
      { id: 'nome', rotulo: 'Nome' },
      { id: 'cargo', rotulo: 'Cargo' },
      { id: 'papel', rotulo: 'Papel na compra', tipo: 'select', opcoes: P.PAPEIS },
      { id: 'sentimento', rotulo: 'Posição', tipo: 'select', opcoes: [
        { valor: 'nao_acessado', rotulo: 'Não acessado' }, { valor: 'neutro', rotulo: 'Neutro' },
        { valor: 'favoravel', rotulo: 'Favorável' }, { valor: 'resistente', rotulo: 'Resistente' }] },
      { id: 'perfil', rotulo: 'Perfil (Challenger)', tipo: 'select',
        opcoes: P.PERFIS.map(function (x) {
          const grupo = x.grupo === 'indefinido' ? '' : ' — ' + x.grupo;
          return { valor: x.id, rotulo: x.rotulo + grupo };
        }) },
      { id: 'influencia', rotulo: 'Influência na decisão', tipo: 'select', padrao: '2', opcoes: [
        { valor: '1', rotulo: '1 — opina' }, { valor: '2', rotulo: '2 — influencia' }, { valor: '3', rotulo: '3 — decide' }] },
      { id: 'reportaA', rotulo: 'Reporta a', tipo: 'select', opcoes: [{ valor: '', rotulo: '— não informado —' }]
        .concat(colegas.map(function (c) { return { valor: c.id, rotulo: c.nome + ' (' + c.papel + ')' }; })) },
      { id: 'email', rotulo: 'E-mail' },
      { id: 'telefone', rotulo: 'Telefone / WhatsApp' },
      { id: 'linkedin', rotulo: 'LinkedIn' }
    ];
  }

  function camposOportunidade(contas, contaPadrao) {
    return [
      { id: 'atalhoOp', tipo: 'ia', extrair: 'oportunidade',
        rotulo: 'Descreva a oportunidade em uma frase',
        placeholder: 'Ex.: Renovação do contrato de tratamento na Agro Verde; estão avaliando a Solmax também.',
        /* Valor, etapa e fechamento previsto são o pipeline e o diagnóstico.
           Se a IA mexer na etapa, ela apaga o alerta de "falso avançado". */
        nunca: ['valor', 'etapa', 'fechamentoPrevisto'],
        contexto: function () { return IA.contextoDaConta(contaPadrao); } },
      { id: 'titulo', rotulo: 'Título' },
      { id: 'contaId', rotulo: 'Conta', tipo: 'select', padrao: contaPadrao || (contas[0] && contas[0].id), opcoes: contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; }) },
      { id: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda' },
      { id: 'etapa', rotulo: 'Etapa CRM', tipo: 'select', opcoes: P.ETAPAS },
      { id: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: P.TIPOS_OPORTUNIDADE },
      { id: 'fechamentoPrevisto', rotulo: 'Fechamento previsto', tipo: 'date' },
      { id: 'concorrentes', rotulo: 'Concorrentes (inclusive “não fazer nada”)' }
    ];
  }

  function baixar(conteudo, nome, mime) {
    const blob = new Blob([conteudo], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  global.App = App;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    promptInstalacao = e;
  });

  window.addEventListener('hashchange', render);

  document.addEventListener('DOMContentLoaded', function () {
    Store.carregar();
    global.IADAjuda.ligar();
    montarNav();
    atualizarPerfilDaNuvem();
    A.garantirAdministrador().then(render).catch(function (e) {
      console.warn('Falha ao preparar o administrador:', e);
      render();
    });
    /* O app guarda o próprio código para funcionar offline, e é isso que faz uma
       versão nova demorar a aparecer: o primeiro recarregamento só instala a
       versão nova; quem usa o código novo é o carregamento seguinte. Duas vezes
       Ctrl+F5 não é instrução que se dê a um vendedor — então, quando a versão
       nova assume, a página se recarrega sozinha, uma vez. */
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      const jaControlado = !!navigator.serviceWorker.controller;
      let recarregando = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!jaControlado || recarregando) return;   /* na primeira visita não há o que trocar */
        recarregando = true;
        location.reload();
      });
      navigator.serviceWorker.register('sw.js')
        .then(function (registro) { registro.update(); })
        .catch(function (e) { console.warn('SW não registrado:', e); });
    }
  });
})(window);
