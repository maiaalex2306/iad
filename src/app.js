/* Router, ações e boot. */
(function (global) {
  'use strict';

  const P = global.IADPlaybook, Store = global.IADStore, E = global.IADEngine,
    U = global.IADUI, V = global.IADViews, Arq = global.IADArquivos, Csv = global.IADCsv;

  const ROTAS = [
    { hash: '#/hoje', ico: '⚡', nome: 'Hoje', render: V.hoje },
    { hash: '#/painel', ico: '📊', nome: 'Painel', render: V.painel },
    { hash: '#/pipeline', ico: '🗂️', nome: 'Pipeline', render: V.pipeline },
    { hash: '#/revisao', ico: '🔄', nome: 'Revisão', render: V.revisao },
    { hash: '#/contas', ico: '🏢', nome: 'Contas', render: V.contas },
    { hash: '#/playbook', ico: '🎯', nome: 'Playbook', render: V.playbook, foraDasAbas: true }
  ];

  let promptInstalacao = null;

  function render() {
    const hash = location.hash || '#/hoje';
    const conteudo = document.getElementById('conteudo');

    if (hash.indexOf('#/op/') === 0) {
      const id = hash.slice(5);
      conteudo.innerHTML = V.cockpit(id);
      pintarArquivos(id);
    } else if (hash === '#/dados') {
      conteudo.innerHTML = V.dados();
      pintarUso();
    } else {
      const rota = ROTAS.find(function (r) { return r.hash === hash; }) || ROTAS[0];
      conteudo.innerHTML = rota.render();
    }

    document.querySelectorAll('nav.tabs a').forEach(function (a) {
      const alvo = a.getAttribute('href');
      a.classList.toggle('ativo', alvo === hash || (hash.indexOf('#/op/') === 0 && alvo === '#/pipeline'));
    });
    window.scrollTo(0, 0);
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

  const OPCOES_SIM_NAO = [{ valor: 'nao', rotulo: 'Não' }, { valor: 'sim', rotulo: 'Sim' }];

  const App = {
    ir: function (hash) { location.hash = hash; },
    abrir: function (id) { location.hash = '#/op/' + id; },
    filtrar: function (grupo) { V.definirFiltro(grupo); render(); },
    filtrarHistorico: function (tipo) { V.definirFiltroHistorico(tipo); render(); },
    filtrarHoje: function (chave) { V.definirFiltroHoje(chave); render(); },
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
      U.formulario('Novo contato', camposContato(contaId), {}, function (d) {
        if (!d.nome) return;
        Store.criarContato(Object.assign({ contaId: contaId }, d, { reportaA: d.reportaA || null }));
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
      const contas = Store.obter().contas;
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
      const contas = Store.obter().contas;
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
      const abertas = Store.obter().oportunidades.filter(function (o) { return !o.desfecho; });
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
        { id: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: P.TIPOS_TAREFA },
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
      if (Store.obter().oportunidades.length && !U.confirmar('Isso substitui os dados atuais. Continuar?')) return;
      global.IADSeed.carregar();
      location.hash = '#/hoje';
      render();
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

  /* ---------- campos reutilizados ---------- */
  function camposConta() {
    return [
      { id: 'nome', rotulo: 'Empresa' },
      { id: 'segmento', rotulo: 'Segmento' },
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
    render();
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW não registrado:', e); });
    }
  });
})(window);
