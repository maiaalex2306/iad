/* Router, ações e boot. */
(function (global) {
  'use strict';

  const P = global.IADPlaybook, Store = global.IADStore, E = global.IADEngine, U = global.IADUI, V = global.IADViews;

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
      conteudo.innerHTML = V.cockpit(hash.slice(5));
    } else if (hash === '#/dados') {
      conteudo.innerHTML = V.dados();
    } else {
      const rota = ROTAS.find(function (r) { return r.hash === hash; }) || ROTAS[0];
      conteudo.innerHTML = rota.render();
    }

    document.querySelectorAll('nav.tabs a').forEach(function (a) {
      const alvo = a.getAttribute('href');
      a.classList.toggle('ativo', alvo === hash || (hash.indexOf('#/op/') === 0 && alvo === '#/pipeline'));
    });
    conteudo.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function montarNav() {
    document.querySelector('nav.tabs').innerHTML = ROTAS.filter(function (r) { return !r.foraDasAbas; }).map(function (r) {
      return '<a href="' + r.hash + '"><span class="ico">' + r.ico + '</span>' + r.nome + '</a>';
    }).join('');
  }

  const App = {
    ir: function (hash) { location.hash = hash; },
    abrir: function (id) { location.hash = '#/op/' + id; },
    filtrar: function (grupo) { V.definirFiltro(grupo); render(); },

    novaConta: function () {
      U.formulario('Nova conta', [
        { id: 'nome', rotulo: 'Empresa' },
        { id: 'segmento', rotulo: 'Segmento' }
      ], {}, function (d) {
        if (!d.nome) return;
        Store.criarConta(d);
        location.hash = '#/contas';
        render();
      });
    },

    novoContato: function (contaId) {
      U.formulario('Novo contato', [
        { id: 'nome', rotulo: 'Nome' },
        { id: 'cargo', rotulo: 'Cargo' },
        { id: 'papel', rotulo: 'Papel na compra', tipo: 'select', opcoes: P.PAPEIS },
        { id: 'sentimento', rotulo: 'Posição', tipo: 'select', opcoes: [
          { valor: 'nao_acessado', rotulo: 'Não acessado' }, { valor: 'neutro', rotulo: 'Neutro' },
          { valor: 'favoravel', rotulo: 'Favorável' }, { valor: 'resistente', rotulo: 'Resistente' }] },
        { id: 'email', rotulo: 'E-mail' },
        { id: 'linkedin', rotulo: 'LinkedIn' }
      ], {}, function (d) {
        if (!d.nome) return;
        Store.criarContato(Object.assign({ contaId: contaId }, d));
        render();
      });
    },

    editarContato: function (id) {
      const c = Store.contato(id);
      if (!c) return;
      U.formulario('Editar contato', [
        { id: 'nome', rotulo: 'Nome' },
        { id: 'cargo', rotulo: 'Cargo' },
        { id: 'papel', rotulo: 'Papel na compra', tipo: 'select', opcoes: P.PAPEIS },
        { id: 'sentimento', rotulo: 'Posição', tipo: 'select', opcoes: [
          { valor: 'nao_acessado', rotulo: 'Não acessado' }, { valor: 'neutro', rotulo: 'Neutro' },
          { valor: 'favoravel', rotulo: 'Favorável' }, { valor: 'resistente', rotulo: 'Resistente' }] },
        { id: 'email', rotulo: 'E-mail' },
        { id: 'linkedin', rotulo: 'LinkedIn' }
      ], c, function (d) {
        Object.assign(c, d);
        Store.salvar();
        render();
      });
    },

    novaOportunidade: function (contaId) {
      const contas = Store.obter().contas;
      if (!contas.length) { alert('Cadastre uma conta primeiro.'); return App.novaConta(); }
      U.formulario('Nova oportunidade', [
        { id: 'titulo', rotulo: 'Título' },
        { id: 'contaId', rotulo: 'Conta', tipo: 'select', opcoes: contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; }), padrao: contaId || contas[0].id },
        { id: 'valor', rotulo: 'Valor (R$)', tipo: 'number' },
        { id: 'etapa', rotulo: 'Etapa CRM', tipo: 'select', opcoes: P.ETAPAS },
        { id: 'fechamentoPrevisto', rotulo: 'Fechamento previsto', tipo: 'date' }
      ], {}, function (d) {
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
      U.formulario('Editar oportunidade', [
        { id: 'titulo', rotulo: 'Título' },
        { id: 'contaId', rotulo: 'Conta', tipo: 'select', opcoes: contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; }) },
        { id: 'valor', rotulo: 'Valor (R$)', tipo: 'number' },
        { id: 'etapa', rotulo: 'Etapa CRM', tipo: 'select', opcoes: P.ETAPAS },
        { id: 'fechamentoPrevisto', rotulo: 'Fechamento previsto', tipo: 'date' },
        { id: 'notas', rotulo: 'Notas', tipo: 'textarea' }
      ], op, function (d) {
        Store.atualizarOportunidade(id, d);
        render();
      });
    },

    pontuar: function (opId, dim, valor) {
      Store.pontuar(opId, dim, valor);
      render();
    },

    /* Captura rápida: registrar de qualquer tela, sem procurar a oportunidade antes. */
    capturaRapida: function () {
      const abertas = Store.obter().oportunidades.filter(function (o) { return !o.desfecho; });
      if (!abertas.length) { alert('Nenhuma oportunidade aberta para registrar evidência.'); return; }
      App.novaEvidencia(null, abertas);
    },

    /* Evidência = o cliente se moveu. É o único registro que altera Evidence Age. */
    novaEvidencia: function (opId, listaAbertas) {
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
      campos.push(
        { id: 'titulo', rotulo: 'O que o cliente fez', tipo: 'textarea', voz: true, placeholder: 'Ex.: CFO pediu o payback antes de aprovar' },
        { id: 'dimensao', rotulo: 'Dimensão afetada', tipo: 'select', opcoes: P.DIMENSOES.map(function (d) { return { valor: d.id, rotulo: d.nome }; }) },
        { id: 'sugestao', rotulo: 'Ou escolha uma evidência típica', tipo: 'select', opcoes: [{ valor: '', rotulo: '— descrever acima —' }].concat(sugestoes) },
        { id: 'canal', rotulo: 'Canal', tipo: 'select', opcoes: ['Reunião', 'E-mail', 'WhatsApp', 'LinkedIn', 'Telefone', 'Documento'] },
        { id: 'data', rotulo: 'Data', tipo: 'date', padrao: Store.hoje() }
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
        Store.registrarEvento(alvo, { tipo: 'decision', titulo: titulo, dimensao: dimensao, canal: d.canal, data: d.data || Store.hoje() });
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

    exportar: function () {
      const blob = new Blob([Store.exportar()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'iad-crm-' + Store.hoje() + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
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
      if (!U.confirmar('Apagar todos os dados deste dispositivo?')) return;
      Store.limpar();
      location.hash = '#/painel';
      render();
    },

    carregarDemo: function () {
      if (Store.obter().oportunidades.length && !U.confirmar('Isso substitui os dados atuais. Continuar?')) return;
      global.IADSeed.carregar();
      location.hash = '#/painel';
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
