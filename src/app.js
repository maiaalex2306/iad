/* Router, ações e boot. */
(function (global) {
  'use strict';

  const P = global.IADPlaybook, Store = global.IADStore, E = global.IADEngine,
    U = global.IADUI, V = global.IADViews, Arq = global.IADArquivos, Csv = global.IADCsv,
    A = global.IADAuth;

  const ROTAS = [
    { hash: '#/hoje', ico: '⚡', nome: 'Hoje', render: V.hoje },
    { hash: '#/painel', ico: '📊', nome: 'Painel', render: V.painel },
    { hash: '#/pipeline', ico: '🗂️', nome: 'Pipeline', render: V.pipeline },
    { hash: '#/revisao', ico: '🔄', nome: 'Revisão', render: V.revisao },
    { hash: '#/cadastros', ico: '📇', nome: 'Cadastros', render: V.cadastros },
    { hash: '#/contas', ico: '🏢', nome: 'Contas', render: V.contas, foraDasAbas: true },
    { hash: '#/playbook', ico: '🎯', nome: 'Playbook', render: V.playbook, foraDasAbas: true }
  ];

  let promptInstalacao = null;
  let leads = null;

  function render() {
    const conteudo = document.getElementById('conteudo');
    const logado = A.atual();

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
      return '<a href="' + r.hash + '"><span class="ico">' + r.ico + '</span>' + r.nome + '</a>';
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
        Store.criarNoCatalogo('produtos', Object.assign({}, d, { precoReferencia: Number(d.precoReferencia) || 0 }));
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
          precoReferencia: Number(d.precoReferencia) || 0, ativo: d.ativo === 'sim'
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
        { id: 'contaId', rotulo: 'Empresa', tipo: 'select',
          opcoes: [{ valor: '', rotulo: '— cadastrar nova abaixo —' }]
            .concat(contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; })) },
        { id: 'empresaNova', rotulo: 'Nome da nova empresa', placeholder: 'preencha só se for empresa nova' },
        { id: 'segmento', rotulo: 'Segmento da nova empresa', tipo: 'select',
          opcoes: [{ valor: '', rotulo: '— sem segmento —' }]
            .concat(Store.nomesDoCatalogo('segmentos').map(function (n) { return { valor: n, rotulo: n }; })) },
        { id: 'titulo', rotulo: 'Oportunidade' },
        { id: 'valor', rotulo: 'Valor (R$)', tipo: 'number' },
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
          contaId: contaId, titulo: d.titulo, valor: Number(d.valor) || 0,
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

      const pessoas = op ? E.stakeholdersDaOp(op) : [];
      campos.push(
        { id: 'titulo', rotulo: 'O que o cliente fez', tipo: 'textarea', voz: true, placeholder: 'Ex.: CFO pediu o payback antes de aprovar' },
        { id: 'dimensao', rotulo: 'Dimensão afetada', tipo: 'select', padrao: dimensaoSugerida || 'problema', opcoes: P.DIMENSOES.map(function (d) { return { valor: d.id, rotulo: d.nome }; }) },
        { id: 'forca', rotulo: 'Força da evidência', tipo: 'select', padrao: 'confirmado', opcoes: P.FORCAS.map(function (f) { return { valor: f.id, rotulo: f.rotulo + ' — ' + f.desc }; }) },
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
        render();
      }, function (dlg) {
        /* A dimensão se ajusta ao que está sendo escrito ou ditado; o vendedor pode trocar. */
        const texto = dlg.querySelector('[name="titulo"]');
        const select = dlg.querySelector('[name="dimensao"]');
        let tocado = false;
        select.addEventListener('change', function () { tocado = true; });
        texto.addEventListener('input', function () {
          if (tocado) return;
          const palpite = E.sugerirDimensao(texto.value);
          if (palpite) select.value = palpite;
        });
      });
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
          contaId = Store.criarConta({ nome: nome, segmento: d.segmento || '' }).id;
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
            forca: 'relato', contatoId: contato.id, canal: 'LinkedIn'
          });
        }

        leads = (leads || []).filter(function (l) { return l.id !== id; });
        global.IADIntegracoes.marcarProcessados([id]);
        location.hash = '#/op/' + op.id;
        render();
      });
    },

    /* ---------- acesso ---------- */
    telaAcesso: function (tela) { V.definirTelaAcesso(tela, null, ''); render(); },

    entrar: function () {
      const login = (document.getElementById('ac-login') || {}).value || '';
      const senha = (document.getElementById('ac-senha') || {}).value || '';
      if (!login || !senha) { V.definirTelaAcesso('login', null, 'Informe login e senha.'); return render(); }

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

      A.criarUsuario({ nome: nome, email: email, whatsapp: v('ac-whatsapp').trim() }, senha1)
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

    sair: function () {
      if (!U.confirmar('Sair do sistema?')) return;
      A.encerrarSessao();
      V.definirTelaAcesso('login', null, '');
      render();
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
        opcoes: [{ valor: 'usuario', rotulo: 'Usuário' }, { valor: 'admin', rotulo: 'Administrador' }]
      });
    }
    return campos;
  }

  /* ---------- campos reutilizados ---------- */
  function camposProduto() {
    return [
      { id: 'nome', rotulo: 'Produto' },
      { id: 'sku', rotulo: 'Código / SKU' },
      { id: 'categoria', rotulo: 'Categoria' },
      { id: 'unidade', rotulo: 'Unidade', placeholder: 'un, kg, t, hora, mês' },
      { id: 'precoReferencia', rotulo: 'Preço de referência (R$)', tipo: 'number' },
      { id: 'descricao', rotulo: 'Descrição', tipo: 'textarea' }
    ];
  }

  function camposConta() {
    const segmentos = Store.nomesDoCatalogo('segmentos');
    return [
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
      { id: 'titulo', rotulo: 'Título' },
      { id: 'contaId', rotulo: 'Conta', tipo: 'select', padrao: contaPadrao || (contas[0] && contas[0].id), opcoes: contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; }) },
      { id: 'valor', rotulo: 'Valor (R$)', tipo: 'number' },
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
    montarNav();
    A.garantirAdministrador().then(render).catch(function (e) {
      console.warn('Falha ao preparar o administrador:', e);
      render();
    });
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW não registrado:', e); });
    }
  });
})(window);
