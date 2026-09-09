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
    /* Debaixo do Pipeline de propósito: o pipeline é a foto das contas, a
       tarefa é o que muda a foto. Quem abre o app para trabalhar desce um
       item e está no lugar certo. */
    { hash: '#/tarefas', ico: '✅', nome: 'Tarefas', render: V.tarefas,
      ajuda: 'Todas as suas tarefas numa lista só: filtre por responsável, período, tipo e status, aja em lote, e conclua contando o que aconteceu — que é o que faz as oito decisões andarem.' },
    { hash: '#/revisao', ico: '🔄', nome: 'Revisão', render: V.revisao,
      ajuda: 'A reunião semanal numa tela: o que mudou na decisão de cada cliente nos últimos 7 dias.' },
    { hash: '#/cadastros', ico: '📇', nome: 'Cadastros', render: V.cadastros,
      ajuda: 'Empresas, contatos, oportunidades, segmentos, tipos de tarefa, produtos e usuários.' },
    /* Saiu da engrenagem do topo e entrou no menu: era a única tela do app
       escondida atrás de um ícone, e ninguém procura nuvem, backup e
       importação num símbolo. */
    { hash: '#/dados', ico: '⚙️', nome: 'Configuração', render: V.dados,
      ajuda: 'Nuvem, Linked Helper, backup, importação de planilha, instalação no celular e demonstração.' },
    { hash: '#/contas', ico: '🏢', nome: 'Contas', render: V.contas, foraDasAbas: true },
    /* Deixou de ser tela escondida: é a teoria que o vendedor precisa antes de
       marcar a próxima reunião, e teoria fora do menu é teoria que ninguém lê. */
    { hash: '#/playbook', ico: '❓', nome: 'Método', render: V.playbook,
      ajuda: 'A teoria inteira: como uma tarefa vira avanço, o que conta como evidência em cada uma das oito decisões e o que fazer em cada canal.' }
  ];

  /* Uma função do servidor pode faltar por dois motivos, e o navegador não
     sabe distinguir os dois: ou ela não foi publicada, ou foi publicada com o
     "Verify JWT" ligado — e aí o porteiro do Supabase recusa o pedido de
     permissão que todo navegador manda antes (o preflight, que por definição
     vai sem token), o navegador bloqueia a chamada e o erro chega aqui sem
     status nenhum. Dizer só "não está publicado" manda a pessoa procurar no
     lugar errado, então a mensagem cita os dois. */
  const SEM_FUNCAO = 'não foi publicada, ou foi publicada com o "Verify JWT" ' +
    'ligado — e nesse caso o navegador nem chega a mandar o pedido.';

  let promptInstalacao = null;
  let leads = null;
  /* Falha da última sincronização, para a tela poder dizer o que houve. */
  let avisoSincronizacao = '';

  function render() {
    const conteudo = document.getElementById('conteudo');
    let logado = A.atual();

    /* Com o servidor no comando, só vale sessão que veio dele. Uma sessão local
       antiga — ou o Adm de fábrica — não pode abrir a porta de um app público. */
    if (logado && global.IADNuvem.mandaNoAcesso() && !logado.naNuvem) {
      A.encerrarSessao();
      logado = null;
    }

    /* Trocou a pessoa, trocam os filtros. Sem isto, quem filtrava "as
       negociações do Alexandre", saía e entrava como outra pessoa via um
       pipeline vazio — o filtro continuava valendo, apontando para alguém que
       não existe na empresa nova. A tela dizia "0 negociações" e não tinha
       como estar mais certa nem mais inútil. */
    V.conferirSessao(logado ? logado.id : null);

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

    /* A faixa entra DENTRO do conteúdo, e não entre a barra e ele: no desktop
       o topo é fixo, quem fica antes do <main> nasce embaixo dele, e a faixa
       aparecia como um risco laranja de dez pixels. Aqui ela herda o
       espaçamento que já existe e não precisa saber a altura do topo. */
    const faixa = faixaDeAviso();

    if (hash.indexOf('#/op/') === 0) {
      const id = hash.slice(5);
      conteudo.innerHTML = faixa + V.cockpit(id);
      pintarArquivos(id);
    } else {
      const rota = ROTAS.find(function (r) { return r.hash === hash; }) || ROTAS[0];
      conteudo.innerHTML = faixa + rota.render();
      /* Duas telas se completam depois de desenhadas: Dados mede o espaço
         usado e busca os leads na ponte; Cadastros lista quem está no
         servidor. Nenhuma das duas pode segurar o render. */
      if (rota.hash === '#/dados') { pintarUso(); pintarLeads(); }
      else pintarUsuariosNuvem();
    }

    document.querySelectorAll('nav.tabs a').forEach(function (a) {
      const alvo = a.getAttribute('href');
      a.classList.toggle('ativo', alvo === hash || (hash.indexOf('#/op/') === 0 && alvo === '#/pipeline'));
    });

    const barra = document.getElementById('barra-admin');
    if (barra) barra.innerHTML = V.barraAdmin();

    window.scrollTo(0, 0);
  }

  /* A tabela e a barra de lote se redesenham sozinhas; o resto da tela, não.
     Marcar uma linha não pode reconstruir a página inteira: a caixa de busca
     perderia o foco e a rolagem voltaria ao topo a cada clique. */
  function repintarTarefas() {
    if ((location.hash || '') !== '#/tarefas') return;
    const conteudo = document.getElementById('conteudo');
    if (!conteudo) return;
    const rolagem = window.scrollY;
    const ativo = document.activeElement;
    const nome = ativo && ativo.tagName === 'INPUT' && ativo.type === 'search' ? 'busca' : '';
    const posicao = nome ? ativo.selectionStart : 0;
    conteudo.innerHTML = V.tarefas();
    if (nome) {
      const campo = conteudo.querySelector('input[type="search"]');
      if (campo) { campo.focus(); try { campo.setSelectionRange(posicao, posicao); } catch (e) {} }
    }
    window.scrollTo(0, rolagem);
  }

  /* Mesmo motivo do repintarTarefas: buscar não pode reconstruir a página
     inteira a cada tecla. */
  function repintarPipeline() {
    if ((location.hash || '') !== '#/pipeline') return;
    const conteudo = document.getElementById('conteudo');
    if (!conteudo) return;
    const rolagem = window.scrollY;
    const ativo = document.activeElement;
    const busca = ativo && ativo.tagName === 'INPUT' && ativo.type === 'search';
    const posicao = busca ? ativo.selectionStart : 0;
    conteudo.innerHTML = V.pipeline();
    if (busca) {
      const campo = conteudo.querySelector('input[type="search"]');
      if (campo) { campo.focus(); try { campo.setSelectionRange(posicao, posicao); } catch (e) {} }
    }
    window.scrollTo(0, rolagem);
  }

  /* Concluir várias contando o que aconteceu em cada uma: abre o relato da
     primeira e, quando ela fecha, chama a próxima. Uma fila, não cinco
     janelas empilhadas. */
  function contarUmaAUma(ids) {
    const proxima = function () {
      const id = ids.shift();
      if (!id) { render(); return; }
      const t = Store.tarefa(id);
      if (!t || t.status !== 'aberta' || !t.oportunidadeId) { proxima(); return; }
      App.concluirComRelato(t.oportunidadeId, id, proxima);
    };
    proxima();
  }

  /* Para o administrador, "onde foram parar os registros" tem resposta dentro
     do app: o RLS devolve as linhas das outras empresas só para ele. */
  function mostrarOndeEstao() {
    const alvo = document.getElementById('onde-estao');
    if (!alvo) return;
    alvo.innerHTML = '<p class="small muted">Procurando em todas as empresas…</p>';
    global.IADNuvem.ondeEstaoOsRegistros().then(function (r) {
      const bloco = r.map(function (t) {
        if (t.erro) return '<li>' + U.esc(t.tabela) + ': ' + U.esc(t.erro) + '</li>';
        const ids = Object.keys(t.por);
        if (!ids.length) return '<li><strong>' + U.esc(t.tabela) + '</strong>: nenhuma linha em empresa alguma.</li>';
        return '<li><strong>' + U.esc(t.tabela) + '</strong>: ' + ids.map(function (id) {
          const e = A.tenant(id);
          return U.esc((e && e.nome) || id) + ' — ' + t.por[id];
        }).join(' · ') + '</li>';
      }).join('');
      alvo.innerHTML = '<p class="small" style="margin:10px 0 4px"><strong>Onde estão, olhando todas as empresas:</strong></p>' +
        '<ul class="small">' + bloco + '</ul>';
    }, function (e) {
      alvo.innerHTML = '<p class="small muted">Não consegui procurar: ' + U.esc(e.message) + '</p>';
    });
  }

  /* Duas faixas, e a diferença entre elas importa.

     A falha de sincronização é um acontecimento: guardo numa variável e ela
     some quando dá certo. Já "o servidor não devolveu carteira nenhuma" é um
     ESTADO — continua verdadeiro no recarregamento seguinte, quando a variável
     já morreu. Guardar a mensagem faria a segunda desaparecer justamente para
     quem fechou e abriu o app tentando resolver. Então ela é recalculada do
     que está guardado, toda vez. */
  function faixaDeAviso() {
    if (avisoSincronizacao) {
      return '<div class="aviso faixa-aviso">' + U.esc(avisoSincronizacao) +
        '<button class="btn ghost mini" onclick="App.tentarBaixarDeNovo()">Tentar de novo</button></div>';
    }
    if (!global.IADNuvem.conectado()) return '';

    const local = Store.obter();
    const movimento = (local.contas || []).length + (local.oportunidades || []).length;
    const configuracao = (local.segmentos || []).length + (local.tiposTarefa || []).length;
    if (movimento || !configuracao) return '';

    return '<div class="aviso faixa-aviso">O servidor respondeu e não devolveu nenhuma empresa nem oportunidade ' +
      'para esta conta — só as listas de configuração. Isso é permissão ou carimbo de empresa, do lado ' +
      'do servidor, e não um filtro daqui. ' +
      '<button class="btn ghost mini" onclick="App.ir(\'#/dados\')">Ver o diagnóstico</button>' +
      '<button class="btn ghost mini" onclick="App.tentarBaixarDeNovo()">Baixar de novo</button></div>';
  }

  /* Quem está logado e de onde: some quando ninguém está. */
  function pintarTopo() {
    const alvo = document.getElementById('quem');
    const menu = document.getElementById('menu-quem');
    if (!alvo) return;
    const u = A.atual();
    if (!u) {
      alvo.innerHTML = '';
      if (menu) { menu.hidden = true; menu.innerHTML = ''; }
      return;
    }
    if (menu && !menu.hidden) menu.innerHTML = V.menuDoUsuario();
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
      '<span class="onde">' + U.esc(onde) + '</span><span class="seta">▾</span>';
  }

  /* O menu abre no clique e fecha em qualquer outro: clique fora, Esc, ou
     uma escolha dentro dele. Fechar sozinho é o que separa um menu de um
     painel que fica no caminho. */
  function fecharMenuUsuario() {
    const menu = document.getElementById('menu-quem');
    const botao = document.getElementById('quem');
    if (menu) menu.hidden = true;
    if (botao) botao.setAttribute('aria-expanded', 'false');
  }

  document.addEventListener('click', function (e) {
    const menu = document.getElementById('menu-quem');
    if (!menu || menu.hidden) return;
    if (e.target.closest('.quem-caixa')) return;
    fecharMenuUsuario();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') fecharMenuUsuario();
  });

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

  /* Bloqueio tem de barrar na porta, não só nos dados. As políticas do banco
     já negam tudo a quem está bloqueado, mas então a pessoa entraria e veria
     um app vazio — que é a pior explicação possível. Aqui ela é recusada com o
     motivo, e a sessão é encerrada para não ficar meio dentro.

     Quem pergunta o motivo é o banco: bloqueado não consegue ler a linha da
     empresa, então a tela não teria como distinguir "você foi bloqueado" de
     "sua empresa foi bloqueada".

     O papel entra aqui porque o banco e a tela precisam concordar, e não
     concordavam: nas políticas, administrador com a empresa bloqueada continua
     entrando — é ele quem desbloqueia, e tirar o acesso dele junto tranca o
     sistema por fora. Esta função não abria essa exceção, e o primeiro
     administrador que bloqueou a própria empresa ficou de fora do próprio
     sistema. Bloqueio da PESSOA continua valendo para todos, administrador
     inclusive: aí quem destrava é outro administrador, ou o SQL Editor. */
  function recusarSeBloqueado(perfil) {
    return global.IADNuvem.minhaSituacao().then(function (s) {
      if (!s) return null;
      if (s.perfil_ativo === false) {
        return 'Seu acesso está bloqueado. Procure quem administra o sistema.';
      }
      if (s.empresa_ativa === false) {
        if (perfil && perfil.papel === 'admin') return null;
        return 'O acesso da ' + (s.empresa_nome || 'sua empresa') +
          ' está bloqueado. Procure quem administra o sistema.';
      }
      return null;
    }).catch(function () { return null; });   /* servidor sem a correção 09 não barra ninguém */
  }

  /* O perfil vem antes da checagem porque é ele que diz o papel — e sem o
     papel a checagem não sabe quem pode entrar apesar do bloqueio. */
  function concluirEntradaNaNuvem() {
    const N = global.IADNuvem;
    return N.meuPerfil().then(function (perfil) {
      return recusarSeBloqueado(perfil).then(function (motivo) {
        if (!motivo) return seguirEntradaNaNuvem(perfil);
        return N.sair().catch(function () {}).then(function () {
          V.definirTelaAcesso('login', null, motivo);
          render();
        });
      });
    });
  }

  function seguirEntradaNaNuvem(jaLido) {
    const N = global.IADNuvem;
    return Promise.resolve(jaLido !== undefined ? jaLido : N.meuPerfil()).then(function (perfil) {
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

      /* Perguntar ao servidor se o assistente existe só acontecia no boot, e
         no boot ainda não havia sessão para perguntar. Quem entrava agora
         ficava sem IA até recarregar a página — e nada dizia isso, porque o
         desenho é justamente não mostrar botão morto. Ausência silenciosa por
         defeito é indistinguível de ausência silenciosa por escolha. */
      IA.verificar().then(function (mudou) { if (mudou) render(); });

      /* Só o administrador enxerga mais de uma empresa, e é a lista do
         servidor que faz o "trocar de empresa" ter o que trocar. Falhar aqui
         não impede nada: ele fica com a empresa do próprio perfil, que é o
         que tinha antes. */
      if (A.ehAdmin()) {
        N.empresasDaNuvem().then(function (lista) {
          if (A.espelharEmpresas(lista)) render();
        }, function (e) {
          /* Falhar aqui deixava o administrador com uma empresa só na lista e
             nenhuma explicação — o mesmo silêncio de sempre, no lugar em que
             ele mais atrapalha, que é o de trocar de empresa. */
          avisoSincronizacao = 'Não consegui listar as empresas do servidor: ' +
            (e && e.message ? e.message : 'erro desconhecido') +
            ' — a troca de empresa fica só com a sua.';
          render();
        });
      }

      /* Trazer o que já existe no servidor é o que faz a troca de aparelho
         funcionar; falhar aqui não impede de usar o app com a cópia local.

         O que não pode é falhar calado. Quem acabou de entrar com outra conta
         fica olhando a cópia da conta anterior — ou nenhuma — sem nada na tela
         explicando por quê, e conclui que o sistema perdeu a carteira dele. */
      avisoSincronizacao = '';
      return N.puxar().then(function () {
        /* Baixar zero registros de movimento não é o mesmo que não baixar, e
           na tela era: as duas davam um pipeline vazio e calado. Quando as
           tabelas de configuração vêm cheias e as de trabalho vêm vazias, a
           resposta é do servidor — permissão ou carimbo de empresa —, e é isso
           que a faixa diz, em vez de deixar a pessoa concluir que o app perdeu
           a carteira dela. */
        avisoSincronizacao = '';
        render();
      }, function (e) {
        avisoSincronizacao = 'Não consegui trazer os dados do servidor: ' +
          (e && e.message ? e.message : 'erro desconhecido') +
          ' — o que está na tela é a última cópia baixada neste aparelho.';
        render();
      });
    });
  }

  /* O perfil fica guardado na sessão para não pedir ao servidor a cada envio —
     mas isso fazia mudança de papel ou de empresa só valer depois de sair e
     entrar. Quem administra move alguém e a pessoa continua vendo a carteira
     antiga até fechar o app: pior do que lento, é enganoso. Relemos ao abrir. */
  function atualizarPerfilDaNuvem() {
    const N = global.IADNuvem;
    if (!N.conectado()) return Promise.resolve();

    /* Bloqueio aplicado com a pessoa já dentro só valeria no próximo login, e
       sessão do Supabase dura muito. Relemos ao abrir, junto com o perfil —
       e depois dele, porque a checagem precisa do papel para saber quem entra
       apesar da empresa bloqueada. */
    const lendo = N.meuPerfil().then(function (perfil) {
      return recusarSeBloqueado(perfil).then(function (motivo) {
        if (!motivo) return perfil;
        return N.sair().catch(function () {}).then(function () {
          A.encerrarSessao();
          V.definirTelaAcesso('login', null, motivo);
          render();
          return null;
        });
      });
    }).then(function (perfil) {
      if (!perfil) return;
      const antes = N.estado().perfil || {};
      N.guardarPerfilNaSessao(perfil);
      const u = N.sessao().user;
      A.espelharDaNuvem(u, perfil);
      if (antes.papel !== perfil.papel || antes.tenant_id !== perfil.tenant_id) render();
    }).catch(function () {});

    /* A função do assistente é publicada à mão, num passo separado do login.
       Perguntamos ao servidor se ela existe antes de oferecer a caixa ✨.
       Esta não entra na promessa devolvida: ninguém deve esperar por ela para
       ver a tela — se o assistente estiver no ar, a caixa aparece sozinha. */
    IA.verificar().then(function (mudou) { if (mudou) render(); });

    return lendo;
  }

  /* ---------- chegada pelo link do e-mail ---------- */

  /* O convite e o "esqueci a senha" trazem a pessoa de volta com tudo depois
     do #, no formato de um formulário: access_token, refresh_token, type. O
     roteador do app também usa o #, e não reconhecia nada disso — a pessoa
     clicava no link, chegava com a credencial na mão e via a tela de login,
     que é exatamente o que ela não consegue passar: ela não tem senha ainda. */
  function credencialNoEndereco() {
    const bruto = (location.hash || '').replace(/^#/, '');
    if (bruto.indexOf('access_token=') === -1 && bruto.indexOf('error=') === -1) return null;
    const p = new URLSearchParams(bruto);
    return {
      access_token: p.get('access_token') || '',
      refresh_token: p.get('refresh_token') || '',
      expires_in: p.get('expires_in') || '',
      tipo: p.get('type') || '',
      erro: p.get('error_code') || p.get('error') || '',
      detalhe: (p.get('error_description') || '').replace(/\+/g, ' ')
    };
  }

  /* Fora do endereço assim que lido. Um access_token no histórico do navegador
     vaza pelo botão de voltar, pelos favoritos e por qualquer captura de tela —
     e ele vale como senha até expirar. */
  function limparEndereco() {
    const limpo = location.pathname + location.search;
    if (history.replaceState) history.replaceState(null, '', limpo);
    else location.hash = '';
  }

  function recusaDoLink(c) {
    if (/expired/i.test(c.erro) || /expired/i.test(c.detalhe)) {
      return 'O link deste e-mail já expirou.\n\n' +
        'Peça ao administrador para enviar o convite de novo — o link novo funciona.';
    }
    if (/access_denied|otp/i.test(c.erro)) {
      return 'Este link não vale mais. Ele serve uma vez só, e já foi usado ou substituído.\n\n' +
        'Se você ainda não definiu sua senha, peça um convite novo ao administrador.';
    }
    return 'O servidor recusou este link: ' + (c.detalhe || c.erro || 'motivo não informado') + '.';
  }

  /* Depois de entrar pelo link, escolher a senha é o único passo que falta —
     e é o que transforma um acesso de uma vez só em conta de verdade. Quem
     desiste continua dentro, com a sessão válida, mas fica sem como voltar
     amanhã: por isso a desistência avisa onde terminar depois, em vez de
     empurrar a caixa de novo. */
  function pedirSenhaNova(nome) {
    /* Quem foi convidado pode chegar sem nome: o convite do GoTrue cria a conta
       só com o e-mail. Perguntamos aqui, que é a única tela por onde essa
       pessoa passa antes de virar um usuário como os outros — e ela é a fonte
       certa para o próprio nome. Quem já tem nome não é perguntado de novo. */
    const faltaNome = !nome;
    const campos = [];
    if (faltaNome) campos.push({ id: 'nome', rotulo: 'Seu nome', tipo: 'text' });
    campos.push({ id: 'nova', rotulo: 'Sua senha', tipo: 'password', placeholder: 'mínimo 8 caracteres' });
    campos.push({ id: 'confere', rotulo: 'Repita a senha', tipo: 'password' });

    U.formulario('Bem-vindo' + (nome ? ', ' + nome : '') + ' — escolha sua senha', campos, {}, function (d) {
      if (d.nova.length < 8) { alert('A senha precisa ter pelo menos 8 caracteres.'); pedirSenhaNova(nome); return; }
      if (d.nova !== d.confere) { alert('As duas senhas não são iguais. Tente de novo.'); pedirSenhaNova(nome); return; }

      /* O nome vai primeiro, e sozinho não impede nada: se ele falhar, a senha
         ainda precisa ser gravada — sem senha a pessoa não volta amanhã, e é
         esse o passo que não pode se perder. */
      const gravarNome = (faltaNome && d.nome)
        ? global.IADNuvem.salvarMeuNome({ nome: d.nome, whatsapp: '' }).catch(function () {})
        : Promise.resolve();

      gravarNome.then(function () {
        return global.IADNuvem.trocarMinhaSenha(d.nova);
      }).then(function () {
        alert('Senha definida. A partir de agora você entra com o seu e-mail e esta senha, ' +
          'em qualquer aparelho.');
        atualizarPerfilDaNuvem();
        render();
      }).catch(function (e) {
        alert('Não consegui gravar a senha: ' + e.message + '\n\nTente de novo.');
        pedirSenhaNova(nome);
      });
    }, null, function () {
      alert('Você está dentro, mas ainda sem senha — e sem ela não dá para voltar amanhã.\n\n' +
        'Defina a sua em ⚙︎ → Minha conta, antes de fechar o app.');
    });
  }

  /* Roda antes de qualquer desenho de tela. Devolve promessa porque o boot
     precisa esperar: desenhar a tela de login e só depois descobrir que a
     pessoa já estava autenticada faria a tela piscar do errado para o certo. */
  function adotarCredencialDoEndereco() {
    const c = credencialNoEndereco();
    if (!c) return Promise.resolve('');
    limparEndereco();

    if (c.erro || !c.access_token) {
      alert(recusaDoLink(c));
      return Promise.resolve('');
    }

    return global.IADNuvem.adotarTokens(c).then(function (u) {
      /* Convite e recuperação chegam pelo mesmo caminho e terminam igual: nos
         dois casos a pessoa está sem senha utilizável. Quem pede a senha é o
         boot, depois de desenhar a tela — pedir agora poria a caixa sobre a
         tela de login, que é justamente a que vai sumir. */
      return (u && u.user_metadata && u.user_metadata.nome) || ' ';
    }).catch(function (e) {
      alert('Entrei no servidor com o seu link, mas não consegui carregar a sua conta: ' +
        e.message + '\n\nTente abrir o link de novo.');
      return '';
    });
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

    /* O segmento carrega o mapa do mercado; o tipo de tarefa é só um nome.
       Os três campos existem para responder o que o vendedor se pergunta ao
       abrir um prospect novo: isto é desse segmento? o que vendo? com quem
       falo? Cada empresa tem os seus — a tabela é por empresa desde sempre. */
    camposDoCatalogo: function (nome) {
      const campos = [{ id: 'nome', rotulo: 'Nome' }];
      if (nome !== 'segmentos') return campos;
      return campos.concat([
        { id: 'subsegmentos', rotulo: 'Subsegmentos', tipo: 'textarea',
          placeholder: 'Frigoríficos; abatedouros; laticínios; massas' },
        { id: 'oportunidades', rotulo: 'Oportunidades', tipo: 'textarea',
          placeholder: 'Água de processo; CIP; ETA; ETE; reúso' },
        { id: 'personas', rotulo: 'Principais personas', tipo: 'textarea',
          placeholder: 'Gerente de Utilidades; Gerente de Qualidade' }
      ]);
    },

    novoItemCatalogo: function (nome) {
      const titulo = nome === 'segmentos' ? 'Novo segmento' : 'Novo tipo de tarefa';
      U.formulario(titulo, App.camposDoCatalogo(nome), {}, function (d) {
        if (!d.nome) return;
        Store.criarNoCatalogo(nome, {
          nome: d.nome,
          subsegmentos: d.subsegmentos || '',
          oportunidades: d.oportunidades || '',
          personas: d.personas || ''
        });
        render();
      });
    },

    editarItemCatalogo: function (nome, id) {
      const item = Store.catalogo(nome).find(function (i) { return i.id === id; });
      if (!item) return;
      const campos = App.camposDoCatalogo(nome).concat([
        { id: 'ativo', rotulo: 'Situação', tipo: 'select', opcoes: [{ valor: 'sim', rotulo: 'Ativo' }, { valor: 'nao', rotulo: 'Inativo' }] }
      ]);
      U.formulario('Editar', campos, {
        nome: item.nome,
        subsegmentos: item.subsegmentos || '',
        oportunidades: item.oportunidades || '',
        personas: item.personas || '',
        ativo: item.ativo === false ? 'nao' : 'sim'
      }, function (d) {
        const mudancas = { nome: d.nome, ativo: d.ativo === 'sim' };
        if (nome === 'segmentos') {
          mudancas.subsegmentos = d.subsegmentos || '';
          mudancas.oportunidades = d.oportunidades || '';
          mudancas.personas = d.personas || '';
        }
        Store.atualizarNoCatalogo(nome, id, mudancas);
        render();
      });
    },

    excluirItemCatalogo: function (nome, id) {
      if (nome === 'produtos' && !podeMexerEmProduto()) return;
      if (!U.confirmar('Excluir este item do cadastro? Os registros que já o usam continuam como estão.')) return;
      Store.removerDoCatalogo(nome, id);
      render();
    },

    /* A tela esconde os botões; isto recusa a ação. Esconder não impede: a
       função continua no window. Mesma dupla dos usuários. */
    novoProduto: function () {
      if (!podeMexerEmProduto()) return;
      U.formulario('Novo produto', camposProduto(), {}, function (d) {
        if (!d.nome) return;
        Store.criarNoCatalogo('produtos', Object.assign({}, d, { precoReferencia: U.numeroDigitado(d.precoReferencia) }));
        render();
      });
    },

    editarProduto: function (id) {
      if (!podeMexerEmProduto()) return;
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
        { id: 'fechamentoPrevisto', rotulo: 'Fechamento previsto', tipo: 'date',
          padrao: Store.daquiADias(Store.PRAZO_PADRAO_DE_FECHAMENTO) },
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
          Store.vincularStakeholder(op, contato.id);
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

    /* Mudar de etapa é uma declaração: "este negócio avançou". O IAD existe
       para perguntar se a decisão do cliente avançou junto. Por isso a
       análise acontece aqui, no gesto, e não numa tela que ninguém abre. */
    moverEtapa: function (opId, etapa) {
      const op = Store.oportunidade(opId);
      if (!op || op.etapa === etapa) return;
      Store.atualizarOportunidade(opId, { etapa: etapa });
      render();
      if (IA.disponivel()) App.planejar(opId, etapa);
    },

    /* Análise sob demanda. Não roda ao abrir o cockpit: cada chamada custa, e
       abrir a tela não é pedir análise. */
    planejar: function (opId, etapaNova) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      if (!IA.disponivel()) { alert('Não consegui falar com o assistente. A função "assistente" ' +
        SEM_FUNCAO + '\n\nVeja nuvem/IA.md.');  return; }

      const r = E.resumo(op);
      const dlg = document.createElement('dialog');
      dlg.className = 'revisao-ia';
      dlg.innerHTML = '<div class="corpo"><h2>Lendo este negócio…</h2>' +
        '<p class="small muted">' + U.esc(op.titulo) + ' · IAD ' + r.iad + '/16' +
        (etapaNova ? ' · agora em ' + U.esc(etapaNova) : '') + '</p></div>';
      document.body.appendChild(dlg);
      dlg.showModal();

      IA.planoDaOportunidade(op, r, etapaNova).then(function (plano) {
        dlg.close(); dlg.remove();
        if (!plano) { alert('Não consegui falar com o assistente agora.'); return; }
        V.definirPlano(opId, plano);

        /* Vindo da mudança de etapa, o resultado é uma janela — o vendedor
           acabou de agir e a resposta tem de encontrá-lo ali. Vindo do botão,
           preenche o bloco do cockpit, sem interromper. */
        if (etapaNova) {
          const janela = document.createElement('dialog');
          janela.className = 'revisao-ia';
          janela.innerHTML = '<form method="dialog"><div class="corpo">' +
            '<h2>O que a etapa ' + U.esc(etapaNova) + ' exige</h2>' +
            '<p class="small muted">Etapa mudou. Estas decisões ainda não acompanham.</p>' +
            V.planoDaIA(op, plano) +
            '</div><div class="rodape">' +
            '<button class="btn" value="ok" type="submit">Entendi</button>' +
            '</div></form>';
          document.body.appendChild(janela);
          janela.addEventListener('close', function () { janela.remove(); });
          janela.showModal();
          return;
        }

        render();   /* o bloco se redesenha com o plano guardado */
      });
    },

    /* Ler o que está registrado e propor as oito notas de uma vez.

       Isto não quebra a regra de que a IA não pontua. Ela propõe, o vendedor
       confere as oito numa tela e confirma — e a trava do motor continua de
       pé: nota 2 sem evidência confirmada cai para 1, venha de onde vier.
       O que muda é o custo. Oito formulários é o motivo de ninguém pontuar. */
    lerDecisoes: function (opId) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      if (!IA.disponivel()) { alert('Não consegui falar com o assistente. A função "assistente" ' +
        SEM_FUNCAO + '\n\nVeja nuvem/IA.md.');  return; }

      U.formulario('Ler as oito decisões', [
        { id: 'texto', rotulo: 'Cole uma reunião, se tiver (opcional)', tipo: 'textarea', voz: true,
          placeholder: 'Deixe vazio para o assistente ler só o que já está registrado nesta oportunidade.' }
      ], {}, function (d) {
        const r = E.resumo(op);
        const espera = document.createElement('dialog');
        espera.innerHTML = '<div class="corpo"><h2>Lendo as evidências…</h2>' +
          '<p class="small muted">Comparando o que o cliente disse com as oito decisões.</p></div>';
        document.body.appendChild(espera);
        espera.showModal();

        IA.sugerirNotas(op, r, d.texto).then(function (resp) {
          espera.close(); espera.remove();
          if (!resp || resp.erro) { alert((resp && resp.erro) || 'O servidor respondeu vazio.'); return; }
          App.revisarNotas(opId, resp.decisoes || []);
        });
      });
    },

    revisarNotas: function (opId, decisoes) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      const dlg = document.createElement('dialog');
      dlg.className = 'revisao-ia';
      dlg.innerHTML = V.revisaoDasNotas(op, decisoes);
      document.body.appendChild(dlg);

      dlg.addEventListener('close', function () {
        if (dlg.returnValue === 'ok') {
          let mudadas = 0, rebaixadas = 0;
          P.DIMENSOES.forEach(function (d) {
            const campo = dlg.querySelector('[data-nota="' + d.id + '"]');
            if (!campo || campo.value === 'manter') return;
            const alvo = Store.oportunidade(opId);
            const pedida = Number(campo.value);
            /* A mesma regra de sempre, aplicada aqui também: 2 é "comprovado",
               e só relato não comprova. Vale para a IA como vale para todo mundo. */
            const permitida = (pedida === 2 && !E.podeComprovar(alvo, d.id))
              ? Math.max(1, alvo.dims[d.id] || 0)
              : pedida;
            if (permitida !== (alvo.dims[d.id] || 0)) {
              Store.pontuar(opId, d.id, permitida, 'Lido pelo assistente e confirmado');
              mudadas++;
              if (permitida !== pedida) rebaixadas++;
            }
          });
          const depois = E.iad(Store.oportunidade(opId));
          alert(mudadas
            ? mudadas + (mudadas === 1 ? ' decisão gravada' : ' decisões gravadas') +
              '. IAD agora: ' + depois + '/16.' +
              (rebaixadas ? '\n\n' + rebaixadas + ' ficou em 1: para 2 é preciso evidência confirmada ou documentada.' : '')
            : 'Nada mudou.');
          render();
        }
        dlg.remove();
      });
      dlg.showModal();
    },

    /* Um passo vira tarefa com a decisão-alvo já preenchida: é isso que liga
       a sugestão ao mapa, em vez de deixá-la como texto na tela. */
    tarefaDoPasso: function (opId, indice) {
      const plano = V.planoGuardado ? V.planoGuardado(opId) : null;
      const passo = plano && plano.passos[indice];
      if (!passo) return;
      Store.criarTarefa({
        oportunidadeId: opId, titulo: passo.acao.slice(0, 160),
        tipo: 'Preparar', decisaoAlvo: passo.dimensao, vencimento: Store.hoje()
      });
      alert('Tarefa criada, mirando ' + passo.dimensao + '. Ajuste o prazo em Hoje.');
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
    /* `depois` existe para quem chegou aqui no meio de outra coisa — cadastrar
       a empresa dentro da oportunidade. Sem ele, salvar a conta jogava a pessoa
       na lista de contas e o negócio que ela estava criando se perdia. */
    novaConta: function (depois) {
      U.formulario('Nova conta', camposConta(), {}, function (d, docs, pessoas) {
        if (!d.nome) { if (depois) depois(null); return; }
        const nova = Store.criarConta(d);
        anexarAoRegistro(docs, { contaId: nova.id });
        const n = criarContatosPropostos(nova.id, pessoas);
        if (!depois) location.hash = '#/contas';
        render();
        if (n) {
          alert(nova.nome + ' cadastrada com ' +
            (n === 1 ? '1 contato' : n + ' contatos') + '.\n\n' +
            'Confira o papel de cada um na compra — é ele que alimenta a cobertura do grupo comprador.');
        }
        if (depois) depois(nova);
      }, null, function () { if (depois) depois(null); });
    },

    editarConta: function (id) {
      const c = Store.conta(id);
      if (!c) return;
      U.formulario('Editar conta', camposConta(), c, function (d, docs, pessoas) {
        Object.assign(c, d);
        Store.salvar();
        anexarAoRegistro(docs, { contaId: id });
        criarContatosPropostos(id, pessoas);
        render();
      });
    },

    /* Documentos da empresa, como no RD Station: o que se carregou uma vez
       continua ali para quem abrir depois. Não confundir com o que a IA leu —
       ler é momento, anexar é memória, e são gestos diferentes ainda que o
       arquivo seja o mesmo. */
    arquivosDaConta: function (contaId) {
      const c = Store.conta(contaId);
      if (!c) return;
      if (!Arq.disponivel()) { alert('Este navegador não guarda anexos.'); return; }

      const dlg = document.createElement('dialog');
      dlg.innerHTML = '<div class="corpo"><h2>Documentos · ' + U.esc(c.nome) + '</h2>' +
        '<p class="nota-form">Ficam neste aparelho, ligados a esta empresa. ' +
        'Word, Excel, PowerPoint, PDF, imagem — o que for.</p>' +
        '<input type="file" multiple hidden id="anexos-conta-arquivo">' +
        '<div class="row"><button class="btn alt mini" type="button" id="anexos-conta-add">📎 Carregar documentos</button></div>' +
        '<div id="anexos-conta-lista"><p class="tiny muted">Carregando…</p></div></div>' +
        '<div class="rodape"><button class="btn" value="ok" type="submit">Fechar</button></div>';
      dlg.innerHTML = '<form method="dialog">' + dlg.innerHTML + '</form>';
      document.body.appendChild(dlg);
      dlg.addEventListener('close', function () { dlg.remove(); render(); });

      const lista = dlg.querySelector('#anexos-conta-lista');
      const entrada = dlg.querySelector('#anexos-conta-arquivo');

      function pintar() {
        Arq.listar({ contaId: contaId }).then(function (itens) {
          if (!itens.length) {
            lista.innerHTML = '<div class="vazio small">Nenhum documento ainda.</div>';
            return;
          }
          lista.innerHTML = '<table><tbody>' + itens.map(function (a) {
            return '<tr><td><strong>' + U.esc(a.nome) + '</strong>' +
              '<span class="tiny muted">' + U.esc(a.data) + '</span></td>' +
              '<td class="right tiny muted">' + Math.max(1, Math.round(a.tamanho / 1024)) + ' kB</td>' +
              '<td class="right" style="white-space:nowrap">' +
              '<button type="button" class="btn ghost mini" data-abre="' + a.id + '">Abrir</button> ' +
              '<button type="button" class="btn ghost mini" data-tira="' + a.id + '">Excluir</button></td></tr>';
          }).join('') + '</tbody></table>';

          lista.querySelectorAll('[data-abre]').forEach(function (b) {
            b.addEventListener('click', function () { Arq.abrir(b.getAttribute('data-abre')); });
          });
          lista.querySelectorAll('[data-tira]').forEach(function (b) {
            b.addEventListener('click', function () {
              if (!U.confirmar('Excluir este documento? Não tem volta.')) return;
              Arq.excluir(b.getAttribute('data-tira')).then(pintar);
            });
          });
        });
      }

      dlg.querySelector('#anexos-conta-add').addEventListener('click', function () { entrada.click(); });
      entrada.addEventListener('change', function () {
        const escolhidos = Array.prototype.slice.call(entrada.files || []);
        entrada.value = '';
        if (!escolhidos.length) return;
        Promise.all(escolhidos.map(function (a) {
          return Arq.salvar(a, { contaId: contaId }).catch(function (e) {
            alert('Não consegui guardar ' + a.name + ': ' + e.message);
          });
        })).then(pintar);
      });

      pintar();
      dlg.showModal();
    },

    /* Mesma regra da oportunidade: o formulário que a pessoa pediu abre
       sempre, e a empresa que falta se cadastra de dentro dele. */
    novoContato: function (contaId, valores) {
      const contas = Store.dados().contas;
      const campos = contaId ? camposContato(contaId) : [{
        id: 'contaId', rotulo: 'Empresa', tipo: 'select',
        padrao: (contas[0] && contas[0].id) || '',
        opcoes: (contas.length ? [] : [{ valor: '', rotulo: '— nenhuma empresa cadastrada ainda —' }])
          .concat(contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; }))
          .concat([{ valor: NOVA_CONTA, rotulo: '+ Cadastrar nova empresa…' }])
      }].concat(camposContato(null));

      U.formulario('Novo contato', campos, valores || {}, function (d) {
        if (!d.nome) return;
        const alvo = contaId || d.contaId;
        if (!alvo || alvo === NOVA_CONTA) {
          alert('Escolha a empresa desta pessoa.\n\n' +
            'Se ela ainda não existe, use "+ Cadastrar nova empresa" no próprio campo.');
          return App.novoContato(contaId, d);
        }
        Store.criarContato(Object.assign({}, d, {
          contaId: alvo, reportaA: d.reportaA || null
        }));
        render();
      }, function (dlg) {
        const sel = dlg.querySelector('[name="contaId"]');
        if (!sel) return;
        sel.addEventListener('change', function () {
          if (sel.value !== NOVA_CONTA) return;
          const guardado = valoresDoFormulario(dlg, campos);
          dlg.close('cancelar');
          App.novaConta(function (nova) {
            App.novoContato(contaId, Object.assign(guardado, nova ? { contaId: nova.id } : {}));
          });
        });
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
    /* Sem conta cadastrada, isto dizia "cadastre uma conta primeiro" e abria o
       formulário de conta — e ali acabava. Quem clicou em "+ Oportunidade"
       tinha de clicar de novo depois, se lembrasse. Beco sem saída com aviso
       educado continua sendo beco sem saída.

       Agora o caminho não se interrompe: cadastra a empresa e volta para a
       oportunidade, com ela já escolhida. O que a pessoa tinha digitado antes
       volta junto — perder o título porque faltava a empresa seria trocar um
       aborrecimento por outro. */
    novaOportunidade: function (contaId, valores) {
      const contas = Store.dados().contas;

      /* Sem empresa nenhuma, isto abria o cadastro de empresa antes da
         oportunidade. Funcionava, mas inverte o que a pessoa pediu: ela
         clicou em oportunidade, quer ver a oportunidade. Agora o formulário do
         negócio abre sempre, e a empresa se cadastra de dentro dele — pelo
         próprio campo Empresa, que é onde ela olha ao perceber que falta. */
      const campos = camposOportunidade(contas, contaId);
      U.formulario('Nova oportunidade', campos, valores || {}, function (d, docs, pessoas, empresaNova, material) {
        if (!d.titulo) return;

        /* A empresa que a IA achou e não existia entra aqui, se ficou marcada.
           Antes do negócio, porque o negócio precisa do id dela. */
        let alvo = d.contaId;
        let criada = null;
        if ((!alvo || alvo === NOVA_CONTA) && empresaNova) {
          criada = Store.criarConta(empresaNova);
          alvo = criada.id;
        }
        if (!alvo || alvo === NOVA_CONTA) {
          alert('Escolha a empresa deste negócio.\n\n' +
            'Se ela ainda não existe, use "+ Cadastrar nova empresa" no próprio campo.');
          return App.novaOportunidade(contaId, d);
        }

        /* Contato e produtos não são campos da oportunidade: são registros
           próprios e itens. Fora do Object.assign, senão entrariam no negócio
           como propriedades soltas que ninguém lê. */
        const doForm = { produtoIds: d.produtoIds, contatoId: d.contatoId,
          contatoNome: d.contatoNome, contatoCargo: d.contatoCargo, contatoPapel: d.contatoPapel,
          contatoEmail: d.contatoEmail, contatoTelefone: d.contatoTelefone };
        ['produtoIds', 'contatoId', 'contatoNome', 'contatoCargo', 'contatoPapel',
          'contatoEmail', 'contatoTelefone'].forEach(function (k) { delete d[k]; });

        const op = Store.criarOportunidade(Object.assign({}, d, { contaId: alvo }));
        anexarAoRegistro(docs, { oportunidadeId: op.id, contaId: alvo });
        const novoContato = criarContatoDoFormulario(alvo, op, doForm);
        const itens = aplicarItens(op, doForm.produtoIds);
        const quantos = criarContatosPropostos(alvo, pessoas);
        location.hash = '#/op/' + op.id;
        render();
        /* "criada" e não "empresaNova": a pessoa pode ter escolhido outra
           empresa no select depois de a IA propor uma nova, e aí a ficha
           proposta não vira cadastro nenhum. Anunciar que virou seria mentir
           sobre o que ficou no banco. */
        if (criada || quantos || novoContato || itens) {
          alert('Pronto:' +
            (criada ? '\n· empresa ' + criada.nome + ' cadastrada' : '') +
            (novoContato ? '\n· contato ' + novoContato.nome + ' cadastrado e vinculado ao grupo comprador' : '') +
            (quantos ? '\n· ' + (quantos === 1 ? '1 contato' : quantos + ' contatos') + ' adicionados' : '') +
            (itens ? '\n· ' + (itens === 1 ? '1 item' : itens + ' itens') + ' do catálogo' : '') +
            '\n· negócio criado.\n\nConfira o papel de cada pessoa na compra — é ele que alimenta a cobertura do grupo comprador.');
        }

        /* E agora o material inteiro, de novo, com a leitura de reunião.

           A extração do cadastro tira campos: título, segmento, a ficha da
           empresa, as pessoas. É pouco quando o que foi colado é uma ata de
           uma hora — todo o resto, que é justamente a decisão do cliente, ia
           embora com o texto, e o negócio nascia zerado ao lado de duas
           reuniões de conteúdo. Colar a mesma ata depois, numa tarefa, para
           só então o índice andar, é trabalho que o app já tinha em mãos.

           Só quando o material é grande: um "indicação na feira, falei com o
           Marcelo" não tem oito decisões dentro, e abrir uma leitura por
           causa disso seria gastar uma chamada para dizer que não achou nada. */
        if (material && material.length >= 400 && IA.disponivel()) {
          App.processarReuniao(op.id, material, true, [], null);
        }
      }, function (dlg) {
        /* O contato acompanha a empresa: trocar de empresa tem de trocar a
           lista de pessoas, senão a oportunidade nasce com o contato de outra
           conta — que é o erro mais difícil de perceber depois. */
        ligarContatoDaEmpresa(dlg);

        /* A opção "+ Nova empresa" no próprio select: é onde a pessoa está
           olhando quando descobre que a empresa não existe. */
        const sel = dlg.querySelector('[name="contaId"]');
        if (!sel) return;
        sel.addEventListener('change', function () {
          if (sel.value !== NOVA_CONTA) {
            /* Escolheu uma empresa de verdade: a ficha que a IA propôs deixa
               de valer, e o convite some da tela junto. */
            dlg.empresaNovaIA = null;
            const caixa = dlg.querySelector('[data-empresa-ia]');
            if (caixa && caixa.querySelector('[data-cria-empresa]')) caixa.innerHTML = '';
            return;
          }
          const guardado = valoresDoFormulario(dlg, campos);
          dlg.close('cancelar');
          App.novaConta(function (nova) {
            App.novaOportunidade(nova ? nova.id : contaId, guardado);
          });
        });
      });
    },

    editarOportunidade: function (id) {
      const op = Store.oportunidade(id);
      if (!op) return;
      const contas = Store.dados().contas;
      const jaTem = (op.itens || []).map(function (i) { return i.produtoId; });
      U.formulario('Editar oportunidade', camposOportunidade(contas, op.contaId, {
        edicao: true, produtoIds: jaTem
      }).concat([
        { id: 'notas', rotulo: 'Notas', tipo: 'textarea' }
      ]), op, function (d) {
        const ids = d.produtoIds;
        delete d.produtoIds;
        Store.atualizarOportunidade(id, d);
        /* Desmarcar tudo é uma escolha, não um esquecimento: limpa os itens. */
        const atual = Store.oportunidade(id);
        if (ids && ids.length) aplicarItens(atual, ids);
        else if (atual) { atual.itens = []; Store.salvar(); }
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
    /* O botão do alto da tela: "acabei de falar com um cliente". Também entra
       por tarefa — a tarefa é a evidência, e uma evidência sem a interação
       que a produziu é um efeito sem causa. A única pergunta a mais é em qual
       negócio, e ela só aparece quando há mais de um. */
    capturaRapida: function () {
      const abertas = Store.dados().oportunidades.filter(function (o) { return !o.desfecho; });
      if (!abertas.length) { alert('Nenhum negócio aberto para registrar uma tarefa.'); return; }
      if (abertas.length === 1) { App.novaTarefa(abertas[0].id, '', { situacao: 'feita' }); return; }
      U.formulario('Em qual negócio?', [{
        id: 'oportunidadeId', rotulo: 'Negócio', tipo: 'select',
        opcoes: abertas.map(function (o) {
          const c = Store.conta(o.contaId);
          return { valor: o.id, rotulo: ((c && c.nome) ? c.nome + ' — ' : '') + o.titulo };
        })
      }], {}, function (d) {
        if (d.oportunidadeId) App.novaTarefa(d.oportunidadeId, '', { situacao: 'feita' });
      });
    },

    /* Evidência = o cliente se moveu. É o único registro que altera Evidence Age. */
    novaEvidencia: function (opId, listaAbertas, dimensaoSugerida, padroes, aoTerminar) {
      const op = opId ? Store.oportunidade(opId) : null;
      if (opId && !op) return;
      /* Quando a evidência vem de uma tarefa recém-concluída, o canal e a data
         já são conhecidos: repetir a pergunta é pedir que a pessoa erre. */
      const vindos = padroes || {};

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
        { id: 'canal', rotulo: 'Canal', tipo: 'select', padrao: vindos.canal || '',
          opcoes: ['Reunião', 'Visita', 'Telefonema', 'WhatsApp', 'E-mail', 'LinkedIn', 'Documento'] },
        { id: 'data', rotulo: 'Data', tipo: 'date', padrao: vindos.data || Store.hoje() },
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
        if (aoTerminar) aoTerminar();
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

    processarReuniao: function (opId, texto, relerNotas, docs, depois) {
      const op = Store.oportunidade(opId);
      if (!op) return;
      /* A ata que a IA acabou de ler fica anexada ao negócio, como no RD
         Station: ler é momento, anexar é memória. Sem isto, quem carregou o
         .docx da reunião ficava só com as evidências e perdia o documento. */
      anexarAoRegistro(docs, { oportunidadeId: opId, contaId: op.contaId,
        categoria: 'Ata de reunião' });
      const aviso = document.createElement('dialog');
      aviso.innerHTML = '<div class="corpo"><h2>Lendo a reunião…</h2>' +
        '<p class="small muted">Separando o que o cliente fez, por decisão. Leva alguns segundos.</p></div>';
      document.body.appendChild(aviso);
      aviso.showModal();

      const ctx = IA.contextoDaOportunidade(op);
      if (tarefaEmCurso) ctx.tarefa = tarefaEmCurso;
      IA.analisarReuniao(texto, ctx, op, E.resumo(op)).then(function (r) {
        aviso.close();
        aviso.remove();
        /* O motivo vem do servidor e aparece como veio. A frase única de antes
           — "não consegui falar com o assistente" — servia para tempo
           esgotado, chave da IA vencida, modelo fora do ar e material grande
           demais, e mandava procurar rede quando o problema era outro. A
           tarefa e os anexos já estão gravados: só a leitura falhou. */
        if (!r || r.erro) {
          alert('A tarefa e os documentos foram gravados. O que falhou foi a leitura:\n\n' +
            ((r && r.erro) || 'O servidor respondeu vazio.'));
          render();
          if (depois) depois();
          return;
        }
        if (!r.evidencias.length) {
          alert('Li o texto e não encontrei nada que o CLIENTE tenha feito. Atividade nossa não conta como evidência.');
          render();
          if (depois) depois();
          return;
        }
        App.aplicarLeituraDaIA(opId, r, relerNotas ? texto : null, depois);
      });
    },

    /* A lista de conferência. Nada entra na base sem alguém marcar — cada
       evidência mexe no Evidence Age, e cada nota mexe no IAD que o dono da
       empresa vê. O assistente propõe; quem esteve na reunião assina. */
    /* ---------- O assistente aplica; o vendedor só fez a tarefa ----------
       Antes havia duas telas de conferência: uma para as evidências e outra
       para as oito notas. Duas telas depois de já ter feito a reunião e já
       ter escrito a ata é onde o gesto morria — e o índice ficava zerado no
       painel do gestor não porque nada aconteceu, mas porque ninguém teve
       paciência de confirmar duas vezes.

       Agora entra sozinho, e o que segura a qualidade não é o clique da
       pessoa: é a mesma trava de sempre, do motor. Nota 2 exige evidência
       confirmada ou documentada; relato não comprova, venha de quem vier.
       Dimensão que a IA inventa é descartada dos dois lados. E nota só sobe
       sozinha — rebaixar sem ninguém olhar apagaria trabalho de quem pontuou
       à mão, e isso não se desfaz.

       O que a pessoa recebe é o relatório do que mudou, com uma porta para
       ajustar. Ler não é trabalho; preencher é. */
    aplicarLeituraDaIA: function (opId, resultado, textoParaNotas, depois) {
      const op = Store.oportunidade(opId);
      if (!op) return;

      let evidencias = 0, pessoas = 0;
      (resultado.evidencias || []).forEach(function (ev) {
        Store.registrarEvento(opId, {
          tipo: 'decision', titulo: ev.titulo, dimensao: ev.dimensao,
          forca: ev.forca || 'relato', contatoId: contatoPeloNome(op.contaId, ev.contato),
          canal: ev.canal || 'Reunião', data: ev.data || Store.hoje(),
          compromisso: ev.compromissoData
            ? { texto: ev.compromissoTexto || 'Próximo passo combinado',
                data: ev.compromissoData, dono: ev.compromissoDono || 'cliente' }
            : null
        });
        evidencias++;
      });

      let completados = 0;
      (resultado.contatos || []).forEach(function (c) {
        if (!c || !c.nome) return;
        /* contatoPeloNome devolve o ID, não a ficha — é assim que a evidência
           usa. Aqui precisa da ficha para completá-la. */
        const jaExiste = Store.contato(contatoPeloNome(op.contaId, c.nome));
        if (jaExiste) {
          /* A pessoa já estava cadastrada e o material disse algo novo sobre
             ela. Isso costumava ser jogado fora: o contato entrava uma vez,
             sem cargo e sem papel, e continuava assim para sempre por mais
             reuniões que tivesse. Agora completa — e SÓ completa: o que já
             estava preenchido é escolha de alguém e não se mexe. */
          if (completarEmBranco(jaExiste, {
            cargo: c.cargo, email: c.email, telefone: c.telefone
          })) completados++;
          /* Papel, sentimento e influência têm padrão de fábrica, então
             "vazio" não existe neles: só entram quando ainda estão no padrão.
             O papel importa mais do que parece — todo contato nasce "Usuário",
             e uma conta inteira parada em Usuário mostra 0% dos papéis
             críticos cobertos, que é alarme que não distingue nada. */
          if (c.papel && jaExiste.papel === 'Usuário' && c.papel !== 'Usuário') {
            jaExiste.papel = c.papel;
            completados++;
          }
          if (c.sentimento && jaExiste.sentimento === 'nao_acessado') jaExiste.sentimento = c.sentimento;
          if (c.influencia && !jaExiste.influencia) jaExiste.influencia = Number(c.influencia);
          Store.vincularStakeholder(op, jaExiste.id);
          Store.salvar();
          return;
        }
        const novo = Store.criarContato({
          contaId: op.contaId, nome: c.nome, cargo: c.cargo || '',
          papel: c.papel || 'Usuário', email: c.email || '', telefone: c.telefone || '',
          sentimento: c.sentimento || 'neutro',
          perfil: 'nao_classificado', influencia: Number(c.influencia) || 2
        });
        Store.vincularStakeholder(op, novo.id);
        Store.salvar();
        pessoas++;
      });

      const empresa = aplicarFichaDaEmpresa(op.contaId, resultado.empresa);
      const negocio = aplicarNegocioDaIA(opId, resultado.negocio);
      const base = { evidencias: evidencias, pessoas: pessoas,
        completados: completados, empresa: empresa, negocio: negocio };
      render();

      /* As oito vieram na mesma resposta: não há segunda chamada a fazer.
         A trava do 2 é aplicada aqui, depois de as evidências novas já terem
         entrado — é ela que enxerga se a prova existe. */
      if (resultado.decisoes && resultado.decisoes.length) {
        const mudancas = aplicarNotasDaIA(opId, resultado.decisoes);
        render();
        mostrarResumo(opId, base, mudancas, resultado.decisoes, depois, '');
        return;
      }
      /* Só quando não vieram — função antiga publicada, ou resposta sem elas —
         é que gastamos a segunda chamada. */
      relerAsOito(opId, textoParaNotas, base, depois);
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
    filtrarTarefas: function (v) { V.definirFiltroTarefas(v); render(); },
    periodoTarefas: function (v) { V.definirPeriodoTarefas(v); render(); },

    /* ---------- Uma tarefa só, e reunião é um tipo dela ----------
       Antes havia dois botões: "+ Tarefa" para o que eu vou fazer e
       "Registrar reunião" para o que eu já fiz. São o mesmo objeto em dois
       momentos, e separá-los deixava metade do trabalho fora da conta: a
       reunião registrada não virava tarefa, então o painel dizia "0 tarefas"
       para quem tinha passado o dia inteiro em visita.

       Aqui a pergunta é uma: esta tarefa é para fazer, ou já foi feita? A
       resposta muda o formulário e muda o que o sistema aprende. Tarefa
       planejada que se conclui mostra disciplina de método; tarefa registrada
       depois mostra o vendedor correndo atrás do próprio histórico. As duas
       contam no funil, e não contam igual na metodologia — é por isso que a
       origem fica gravada, e não apenas o "concluída". */
    novaTarefa: function (opId, decisaoAlvo, opcoes) {
      const op = Store.oportunidade(opId);
      const o = opcoes || {};
      /* Sem negócio conhecido a tarefa nasce pela empresa: uma empresa tem
         várias negociações, e escolher "a negociação" numa lista com todas as
         da carteira é procurar agulha. Empresa primeiro, negociação depois —
         e só as daquela empresa. */
      const r = op ? E.resumo(op) : null;
      const PERGUNTAS = P.FECHAMENTO_REUNIAO.map(function (q) { return 'q_' + q.id; });
      /* Tudo o que só faz sentido depois de a tarefa ter acontecido. Os
         documentos NÃO estão nesta lista: ficam visíveis sempre. */
      const DO_RELATO = ['secaoRelato', 'feitaEm', 'relato', 'evidenciaDireta',
        'compromissoTexto', 'compromissoData', 'compromissoDono'].concat(PERGUNTAS);
      const DO_PLANEJAMENTO = ['vencimento', 'hora'];

      const campos = camposDeDestino(op, o).concat([
        { id: 'titulo', rotulo: 'Assunto da tarefa', padrao: o.titulo || '' },
        { id: 'descricao', rotulo: 'Descrição (opcional)', tipo: 'textarea',
          placeholder: 'O que precisa ser dito, levado ou perguntado. Fica com a tarefa.' },
        { id: 'tipo', rotulo: 'Como (canal)', tipo: 'select', largura: 'metade',
          padrao: o.tipo || '', opcoes: Store.nomesDoCatalogo('tiposTarefa') },
        { id: 'situacao', rotulo: 'Situação', tipo: 'select', largura: 'metade',
          padrao: o.situacao || 'afazer',
          opcoes: [{ valor: 'afazer', rotulo: 'A fazer' }, { valor: 'feita', rotulo: 'Já foi feita' }] },
        /* O anexo fica aqui em cima e nunca some. É o material que carrega a
           informação — proposta, ata, planilha de consumo, dossiê — e escondê-lo
           atrás de uma escolha era escondê-lo de quem mais precisa dele. Se a
           tarefa já foi feita, a IA lê o conteúdo junto com o que foi digitado;
           em qualquer caso os arquivos ficam anexados ao negócio. */
        { id: 'arquivo', tipo: 'file',
          rotulo: 'Documentos (Word, PDF, Excel, PowerPoint, texto) — pode escolher vários' },
        {
          id: 'decisaoAlvo', rotulo: 'Decisão que pretende provocar', tipo: 'select',
          padrao: decisaoAlvo || ((r && r.nbd.dimensao) ? r.nbd.dimensao.id : 'problema'),
          opcoes: P.DIMENSOES.map(function (d) { return { valor: d.id, rotulo: d.nome }; })
        },
        { tipo: 'slot', slot: 'metodo' },
        { id: 'vencimento', rotulo: 'Para quando', tipo: 'date', padrao: Store.hoje(), largura: 'metade' },
        { id: 'hora', rotulo: 'Hora (opcional)', tipo: 'time', largura: 'metade' },
        { id: 'donoId', rotulo: 'Responsável', tipo: 'select',
          padrao: (A.atual() || {}).id || '',
          opcoes: [{ valor: '', rotulo: '— sem responsável —' }]
            .concat(A.usuarios().map(function (u) { return { valor: u.id, rotulo: u.nome }; })) },

        { id: 'secaoRelato', tipo: 'secao', rotulo: 'O que aconteceu',
          ajuda: 'O assistente lê tudo junto — o que você escreveu e o conteúdo dos documentos anexados acima — separa o que o CLIENTE fez e relê as oito decisões. Preencha o que tiver; nada aqui é obrigatório.' },
        { id: 'feitaEm', rotulo: 'Quando foi feita', tipo: 'date', padrao: Store.hoje(), largura: 'metade' },
        { id: 'relato', rotulo: 'Cole a ata, a transcrição ou conte o que aconteceu', tipo: 'textarea', voz: true,
          placeholder: 'Cole aqui o resumo automático da call, a transcrição ou suas anotações. Some ao conteúdo dos documentos anexados acima.' }
      ]);

      /* As quatro perguntas fechadas do fim de reunião. Cada "sim" vira
         evidência sem digitação — é o caminho de quem está no carro depois da
         visita. Somam ao que veio da ata, não substituem. */
      P.FECHAMENTO_REUNIAO.forEach(function (q) {
        campos.push({ id: 'q_' + q.id, rotulo: q.pergunta, tipo: 'select', opcoes: OPCOES_SIM_NAO });
      });

      campos.push(
        { id: 'compromissoTexto', rotulo: 'Próximo passo combinado' },
        { id: 'compromissoData', rotulo: 'Para quando', tipo: 'date', largura: 'metade' },
        { id: 'compromissoDono', rotulo: 'A vez é de quem', tipo: 'select', largura: 'metade',
          opcoes: [{ valor: 'cliente', rotulo: 'Do cliente' }, { valor: 'nos', rotulo: 'Nossa' }] },
        { id: 'evidenciaDireta', rotulo: 'Quer registrar também uma evidência específica?',
          tipo: 'select', padrao: o.evidenciaDireta || 'nao', opcoes: OPCOES_SIM_NAO }
      );

      U.formulario(op ? 'Nova tarefa' : 'Criar tarefa', campos, {}, function (d, docs) {
        if (!d.titulo) { alert('A tarefa precisa de um assunto.'); return; }

        const alvo = op || resolverNegocioDaTarefa(d);
        if (!alvo) return;

        const feita = d.situacao === 'feita';
        const quando = feita ? (d.feitaEm || Store.hoje()) : (d.vencimento || Store.hoje());

        /* Com quem foi. Se a pessoa é nova, nasce aqui e já entra no grupo
           comprador do negócio — é a mesma pessoa, não faz sentido cadastrar
           duas vezes. */
        const comQuem = contatoDaTarefa(alvo, d);

        const tarefa = Store.criarTarefa({
          oportunidadeId: alvo.id, titulo: d.titulo, descricao: d.descricao || '', tipo: d.tipo,
          decisaoAlvo: d.decisaoAlvo, vencimento: quando, hora: d.hora || '',
          contatoId: comQuem ? comQuem.id : null,
          origem: feita ? 'registrada' : 'planejada'
        });
        if (d.donoId) Store.atualizarTarefa(tarefa.id, { donoId: d.donoId });
        /* Tarefa a fazer também guarda o material: a proposta que vou enviar
           fica anexada ao negócio desde já. */
        if (!feita) {
          anexarAoRegistro(docs, { oportunidadeId: alvo.id, contaId: alvo.contaId, categoria: 'Outro' });
          render();
          return;
        }
        concluirComOQueAconteceu(alvo, tarefa.id, d, docs, d.decisaoAlvo);
      }, function (dlg) {
        U.ligarDocumentos(dlg, 'arquivo', 'relato');
        ligarPainelDeMetodo(dlg);
        if (!op) ligarEmpresaENegocio(dlg);
        ligarContatoDaTarefa(dlg);
        const situacao = dlg.querySelector('[name="situacao"]');
        const ajustar = function () {
          const feita = situacao.value === 'feita';
          U.mostrarCampos(dlg, DO_RELATO, feita);
          U.mostrarCampos(dlg, DO_PLANEJAMENTO, !feita);
        };
        situacao.addEventListener('change', ajustar);
        ajustar();
      });
    },

    /* Concluir uma tarefa que já estava aberta. Mesmos campos do "já foi
       feita", sem repetir o que a tarefa já sabe (título, canal, decisão). */
    concluirComRelato: function (opId, tarefaId, aoTerminar) {
      const op = Store.oportunidade(opId);
      const tarefa = Store.dados().tarefas.filter(function (t) { return t.id === tarefaId; })[0];
      if (!op || !tarefa) { if (aoTerminar) aoTerminar(); return; }

      const campos = [
        { id: 'feitaEm', rotulo: 'Quando foi feita', tipo: 'date', padrao: Store.hoje(), largura: 'metade' },
        { id: 'arquivo', tipo: 'file',
          rotulo: 'Documentos (Word, PDF, Excel, PowerPoint, texto) — pode escolher vários' },
        { id: 'relato', rotulo: 'Cole a ata, a transcrição ou conte o que aconteceu', tipo: 'textarea', voz: true,
          placeholder: 'Cole aqui o resumo automático da call, a transcrição ou suas anotações. Some ao conteúdo dos documentos anexados acima.' }
      ];
      P.FECHAMENTO_REUNIAO.forEach(function (q) {
        campos.push({ id: 'q_' + q.id, rotulo: q.pergunta, tipo: 'select', opcoes: OPCOES_SIM_NAO });
      });
      campos.push(
        { id: 'compromissoTexto', rotulo: 'Próximo passo combinado' },
        { id: 'compromissoData', rotulo: 'Para quando', tipo: 'date', largura: 'metade' },
        { id: 'compromissoDono', rotulo: 'A vez é de quem', tipo: 'select', largura: 'metade',
          opcoes: [{ valor: 'cliente', rotulo: 'Do cliente' }, { valor: 'nos', rotulo: 'Nossa' }] },
        { id: 'evidenciaDireta', rotulo: 'Quer registrar também uma evidência específica?',
          tipo: 'select', opcoes: OPCOES_SIM_NAO }
      );

      U.formulario('Concluir: ' + tarefa.titulo, campos, {}, function (d, docs) {
        d.tipo = tarefa.tipo;
        concluirComOQueAconteceu(op, tarefaId, d, docs, tarefa.decisaoAlvo, aoTerminar);
      }, function (dlg) {
        U.ligarDocumentos(dlg, 'arquivo', 'relato');
      /* Cancelar não pode parar a fila: quem desistiu de contar esta segue
         para a próxima, e a tarefa fica aberta como estava. */
      }, aoTerminar || null);
    },

    /* O quadradinho do cockpit fecha a tarefa sem contar nada. Fecha mesmo —
       tem gente que só quer riscar a linha —, mas fica marcado como sem
       relato, igual ao lote: uma tarefa que não moveu decisão nenhuma não
       pode parecer, na tela seguinte, igual a uma que moveu. */
    concluirTarefa: function (id) {
      Store.concluirTarefa(id, null, false, true);
      render();
    },

    excluirTarefa: function (id) {
      if (!U.confirmar('Excluir esta tarefa?')) return;
      Store.excluirTarefa(id);
      render();
    },

    /* ---------- Menu da conta ---------- */

    menuUsuario: function (e) {
      if (e) e.stopPropagation();
      const menu = document.getElementById('menu-quem');
      const botao = document.getElementById('quem');
      if (!menu) return;
      const abrindo = menu.hidden;
      if (abrindo) menu.innerHTML = V.menuDoUsuario();
      menu.hidden = !abrindo;
      if (botao) botao.setAttribute('aria-expanded', abrindo ? 'true' : 'false');
    },

    /* Trocar a empresa ativa é o filtro global do administrador — o mesmo que
       a barra dele e a barra do Pipeline usam. Um estado, três portas. */
    trocarEmpresa: function (id) {
      A.definirFiltros({ tenant: id, usuario: 'todos' });
      fecharMenuUsuario();
      render();
    },

    irDoMenu: function (hash) {
      fecharMenuUsuario();
      location.hash = hash;
    },

    /* Trocar de pessoa é trocar de conta, e conta se troca entrando com ela.
       Alternar sem senha seria dizer que a senha não importa — e o dono de
       cada registro criado é quem está logado, não quem a tela diz que é. */
    trocarDeConta: function () {
      if (!U.confirmar('Sair desta conta e entrar com outra?\n\n' +
        'O que já foi sincronizado continua no servidor. O que estiver só neste aparelho continua aqui.')) return;
      App.sair(true, 'Entre com a outra conta.');
    },

    /* ---------- Filtros do Pipeline ---------- */

    pipelineCampo: function (campo, valor) {
      const m = {};
      m[campo] = valor;
      V.pipelineFiltrar(m);
      render();
    },

    /* Digitar não pode redesenhar a tela a cada tecla: o campo perderia o foco
       no meio da palavra. Mesma solução da tela de Tarefas. */
    pipelineBusca: function (v) {
      V.pipelineFiltrar({ busca: v });
      clearTimeout(App._buscaPipeline);
      App._buscaPipeline = setTimeout(function () { repintarPipeline(); }, 220);
    },

    pipelineLimpar: function (alvo) {
      if (alvo === 'tudo') {
        V.pipelineLimparTudo();
        if (A.ehAdmin()) A.definirFiltros({ tenant: 'todas', usuario: 'todos' });
      }
      else if (alvo === 'tenant') A.definirFiltros({ tenant: 'todas' });
      else if (alvo === 'usuarioAdmin') A.definirFiltros({ usuario: 'todos' });
      else if (alvo === 'responsavel') V.pipelineFiltrar({ responsavel: 'todos' });
      else if (alvo === 'status') V.pipelineFiltrar({ status: 'abertas' });
      else if (alvo === 'iad') V.pipelineFiltrar({ iadMin: '', iadMax: '' });
      else if (alvo === 'valor') V.pipelineFiltrar({ valorMin: '', valorMax: '' });
      else if (alvo === 'previsao') V.pipelineFiltrar({ previsaoDe: '', previsaoAte: '' });
      else {
        const m = {};
        m[alvo] = (typeof V.pipelineEstado()[alvo] === 'boolean') ? false : '';
        V.pipelineFiltrar(m);
      }
      U.fecharDialogos();
      render();
    },

    /* A gaveta é uma janela modal encostada na direita: abre, responde a
       pergunta e fecha. Cada mudança já vale na hora — "Ver o resultado" só
       fecha, e existe porque um painel sem botão de sair não parece fechável. */
    pipelineFiltros: function () {
      const dlg = document.createElement('dialog');
      dlg.className = 'gaveta';
      dlg.innerHTML = V.gavetaDeFiltros();
      document.body.appendChild(dlg);
      dlg.addEventListener('close', function () { dlg.remove(); render(); });
      dlg.showModal();
    },

    /* ---------- Tela de Tarefas ---------- */

    tarefasResponsavel: function (v) { V.tarefasFiltrar({ responsavel: v, pagina: 1 }); render(); },
    tarefasStatus: function (v) { V.tarefasFiltrar({ status: v, pagina: 1 }); render(); },
    /* Trocar de empresa zera a negociação: a negociação escolhida era de
       outra empresa, e mantê-la deixaria a lista vazia sem explicar por quê. */
    tarefasEmpresa: function (v) { V.tarefasFiltrar({ empresa: v, negocio: '', pagina: 1 }); render(); },
    tarefasNegocio: function (v) { V.tarefasFiltrar({ negocio: v, pagina: 1 }); render(); },
    tarefasBusca: function (v) {
      /* Digitar não pode redesenhar a tela a cada tecla: o campo perderia o
         foco no meio da palavra. O filtro entra, a tabela é repintada, e a
         caixa de busca fica onde está. */
      V.tarefasFiltrar({ busca: v, pagina: 1 });
      clearTimeout(App._buscaTarefa);
      App._buscaTarefa = setTimeout(function () { repintarTarefas(); }, 220);
    },
    tarefasPeriodo: function (de, ate) {
      const m = { pagina: 1 };
      if (de !== null) m.de = de;
      if (ate !== null) m.ate = ate;
      V.tarefasFiltrar(m);
      render();
    },
    tarefasTipo: function (tipo, ligado) {
      const atuais = V.tarefasEstado().tipos.slice();
      const i = atuais.indexOf(tipo);
      if (ligado && i === -1) atuais.push(tipo);
      if (!ligado && i !== -1) atuais.splice(i, 1);
      V.tarefasFiltrar({ tipos: atuais, pagina: 1 });
      render();
    },
    tarefasOrdenar: function (chave) {
      const f = V.tarefasEstado();
      V.tarefasFiltrar(f.ordem === chave ? { crescente: !f.crescente } : { ordem: chave, crescente: true });
      render();
    },
    tarefasPagina: function (n) { V.tarefasFiltrar({ pagina: Math.max(1, n) }); render(); },
    tarefasPorPagina: function (n) { V.tarefasFiltrar({ porPagina: Number(n) || 25, pagina: 1 }); render(); },
    tarefasResumo: function (aberto) { V.tarefasFiltrar({ resumoAberto: !!aberto }); },

    /* O botão do aviso na tela de Configuração. Cria só o que falta, e conta
       quantas criou — repetir o clique não duplica nada, porque a próxima
       leitura já não acha negócio sem tarefa. */
    criarTarefasDoLH: function () {
      const faltando = V.oportunidadesDoLHSemTarefa();
      if (!faltando.length) { alert('Nenhuma negociação do Linked Helper está sem tarefa.'); return; }
      faltando.forEach(criarTarefaAtrasadaDoLH);
      Store.salvar();
      render();
      alert(faltando.length + (faltando.length === 1
        ? ' tarefa criada, vencendo hoje.'
        : ' tarefas criadas, vencendo hoje.') +
        '\n\nElas estão em Tarefas, com a conversa do LinkedIn dentro.');
    },

    /* O índice do manual. Rola até a seção em vez de trocar de rota: o manual
       é uma tela só, e mandar para outra rota faria o botão Voltar do navegador
       sair do manual em vez de subir nele. */
    irNoManual: function (id) {
      if (location.hash !== '#/playbook') { location.hash = '#/playbook'; }
      setTimeout(function () {
        const alvo = document.getElementById(id);
        if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    },

    semanasDoAprendizado: function (n) { V.definirSemanasDoAprendizado(Number(n) || 8); render(); },

    /* O plano da semana. Escreve na própria tela em vez de abrir diálogo: é
       texto para reler ao lado da tabela que o gerou, não um aviso para
       dispensar. */
    planoDeDesenvolvimento: function () {
      const alvo = document.getElementById('plano-desenvolvimento');
      if (!alvo) return;
      alvo.innerHTML = '<p class="small muted">Lendo as últimas ' + V.semanasDoAprendizado() + ' semanas…</p>';
      const est = Store.dados();
      const ev = E.evolucao(est.oportunidades, est.tarefas || [], V.semanasDoAprendizado());
      IA.planoDeDesenvolvimento(ev).then(function (r) {
        if (!r || r.erro) {
          alvo.innerHTML = '<div class="aviso">Não consegui gerar o plano: ' +
            U.esc((r && r.erro) || 'sem resposta') + '</div>';
          return;
        }
        const lista = function (titulo, itens, classe) {
          if (!itens.length) return '';
          return '<div class="coluna-plano"><h4 class="' + classe + '">' + titulo + '</h4><ul class="small">' +
            itens.map(function (t) { return '<li>' + U.esc(t) + '</li>'; }).join('') + '</ul></div>';
        };
        const mudancas = r.mudancas.map(function (m) {
          return '<li><strong>' + U.esc(m.acao) + '</strong>' +
            (m.porque ? '<span class="tiny muted">Porque: ' + U.esc(m.porque) + '</span>' : '') +
            (m.medir ? '<span class="tiny muted">Como saber se deu certo: ' + U.esc(m.medir) + '</span>' : '') +
            '</li>';
        }).join('');

        alvo.innerHTML =
          (r.leitura ? '<p class="leitura-plano">' + U.esc(r.leitura) + '</p>' : '') +
          '<div class="duas-colunas-plano">' +
            lista('Melhorou', r.indoBem, 'subiu') +
            lista('Piorou', r.indoMal, 'caiu') +
          '</div>' +
          (mudancas
            ? '<h4 style="margin:14px 0 6px">O que mudar na semana que vem</h4>' +
              '<ol class="passos-plano">' + mudancas + '</ol>'
            : '<p class="small muted">A IA não propôs mudança: com esta amostra, ela não tem o que sustentar.</p>') +
          '<p class="tiny muted" style="margin-top:10px">Gerado em ' + U.data(Store.hoje()) +
          ' a partir dos números da tabela acima — e de nada além deles.</p>';
      });
    },

    tarefasLimpar: function (alvo) {
      if (alvo === 'responsavel') V.tarefasFiltrar({ responsavel: 'todos' });
      else if (alvo === 'empresa') V.tarefasFiltrar({ empresa: '', negocio: '' });
      else if (alvo === 'negocio') V.tarefasFiltrar({ negocio: '' });
      else if (alvo === 'periodo') V.tarefasFiltrar({ de: '', ate: '' });
      else if (alvo === 'status') V.tarefasFiltrar({ status: 'todos' });
      else if (alvo === 'busca') V.tarefasFiltrar({ busca: '' });
      else if (alvo.indexOf('tipo:') === 0) {
        const nome = alvo.slice(5);
        V.tarefasFiltrar({ tipos: V.tarefasEstado().tipos.filter(function (t) { return t !== nome; }) });
      }
      V.tarefasFiltrar({ pagina: 1 });
      render();
    },

    tarefasMarcar: function (id, ligado) { V.tarefasMarcar([id], ligado); repintarTarefas(); },
    tarefasMarcarPagina: function (ligado) { V.tarefasMarcar(V.tarefasDaPagina(), ligado); repintarTarefas(); },
    tarefasMarcarTudo: function (ligado) { V.tarefasMarcar(V.tarefasVisiveis(), ligado); repintarTarefas(); },
    tarefasLimparSelecao: function () { V.tarefasMarcar(null, false); repintarTarefas(); },

    tarefasAdiar: function () {
      const ids = V.tarefasSelecionadas();
      if (!ids.length) return;
      U.formulario('Adiar ' + ids.length + (ids.length === 1 ? ' tarefa' : ' tarefas'), [
        { id: 'data', rotulo: 'Nova data', tipo: 'date', padrao: Store.hoje() },
        { id: 'motivo', rotulo: 'Por que adiou (opcional)',
          placeholder: 'O cliente pediu, faltou material, agenda cheia…' }
      ], {}, function (d) {
        if (!d.data) return;
        ids.forEach(function (id) { Store.adiarTarefa(id, d.data, d.motivo); });
        V.tarefasMarcar(null, false);
        render();
      });
    },

    tarefasAtribuir: function () {
      const ids = V.tarefasSelecionadas();
      if (!ids.length) return;
      const usuarios = A.usuarios();
      if (!usuarios.length) { alert('Nenhum usuário cadastrado.'); return; }
      U.formulario('Atribuir ' + ids.length + (ids.length === 1 ? ' tarefa' : ' tarefas'), [
        { id: 'donoId', rotulo: 'Responsável', tipo: 'select',
          opcoes: usuarios.map(function (u) { return { valor: u.id, rotulo: u.nome }; }) }
      ], {}, function (d) {
        if (!d.donoId) return;
        ids.forEach(function (id) { Store.atualizarTarefa(id, { donoId: d.donoId }); });
        V.tarefasMarcar(null, false);
        render();
      });
    },

    /* Concluir em lote é a única porta desta tela por onde uma tarefa fecha
       sem dizer o que aconteceu — e por isso ela não fecha calada.

       O método inteiro depende de uma distinção: riscar a linha é atividade
       nossa; o que move as oito decisões é o que o CLIENTE fez, e isso só
       existe se alguém contar. Fechar cinco tarefas em silêncio deixaria o
       funil andando e o índice parado, sem nada na tela explicando por quê.
       Então perguntamos, e a saída de contar uma a uma é a primeira. */
    tarefasConcluir: function () {
      const ids = V.tarefasSelecionadas();
      if (!ids.length) return;
      const comNegocio = ids.filter(function (id) {
        const t = Store.tarefa(id);
        return t && t.status === 'aberta' && t.oportunidadeId;
      });

      U.formulario('Concluir ' + ids.length + (ids.length === 1 ? ' tarefa' : ' tarefas'), [
        { tipo: 'secao', rotulo: 'Como quer fechar',
          ajuda: 'Fechar sem relato move o funil e não move nenhuma das oito decisões: quem as move é o que o cliente fez, e isso está no que você contar. As fechadas sem relato ficam marcadas e voltam no filtro "Concluídas sem relato".' },
        { id: 'modo', rotulo: 'Modo', tipo: 'select', padrao: comNegocio.length ? 'uma' : 'lote',
          opcoes: [
            { valor: 'uma', rotulo: 'Contar o que aconteceu — uma a uma (' + comNegocio.length + ')' },
            { valor: 'lote', rotulo: 'Fechar sem relato, resolvo depois' }
          ] },
        { id: 'feitaEm', rotulo: 'Data da conclusão', tipo: 'date', padrao: Store.hoje() }
      ], {}, function (d) {
        if (d.modo === 'uma' && comNegocio.length) {
          V.tarefasMarcar(null, false);
          contarUmaAUma(comNegocio.slice());
          return;
        }
        ids.forEach(function (id) {
          const t = Store.tarefa(id);
          if (t && t.status === 'aberta') Store.concluirTarefa(id, d.feitaEm || Store.hoje(), false, true);
        });
        V.tarefasMarcar(null, false);
        render();
        alert(ids.length + (ids.length === 1 ? ' tarefa fechada' : ' tarefas fechadas') +
          ' sem relato.\n\nNenhuma das oito decisões se moveu — para isso é preciso contar o que o cliente fez. ' +
          'Elas estão no filtro “Concluídas sem relato”, esperando.');
      });
    },

    editarTarefa: function (id) {
      const t = Store.tarefa(id);
      if (!t) return;
      const atual = t.oportunidadeId ? Store.oportunidade(t.oportunidadeId) : null;
      const contas = Store.dados().contas.slice().sort(function (a, b) {
        return String(a.nome).localeCompare(String(b.nome));
      });
      const contaAtual = atual ? atual.contaId : (contas[0] ? contas[0].id : '');

      U.formulario('Editar tarefa', [
        /* Mudar a tarefa de negociação é mudar de conta: as duas perguntas
           aparecem juntas, e a de negociação segue a de empresa. Sem isso, a
           lista traria as negociações de toda a carteira e a tarefa acabaria
           num negócio parecido de outra empresa. */
        { tipo: 'secao', rotulo: 'A que negócio esta tarefa pertence' },
        { id: 'contaId', rotulo: 'Empresa', tipo: 'select', padrao: contaAtual,
          opcoes: contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; }) },
        { id: 'oportunidadeId', rotulo: 'Negociação', tipo: 'select', padrao: t.oportunidadeId || '',
          opcoes: opcoesDeNegocio(contaAtual) },
        { id: 'negocioNovo', rotulo: 'Nome da nova negociação',
          placeholder: 'Reúso da ETE, Água de processo, Torre de resfriamento…' },
        { id: 'contatoId', rotulo: 'Com quem (contato)', tipo: 'select',
          padrao: t.contatoId || '', opcoes: opcoesDeContato(contaAtual) },
        { id: 'contatoNome', rotulo: 'Nome do novo contato' },
        { id: 'contatoCargo', rotulo: 'Cargo', largura: 'metade' },
        { id: 'contatoPapel', rotulo: 'Papel na compra', tipo: 'select', largura: 'metade', opcoes: P.PAPEIS },
        { id: 'contatoEmail', rotulo: 'E-mail', largura: 'metade' },
        { id: 'contatoTelefone', rotulo: 'Telefone / WhatsApp', largura: 'metade' },

        { tipo: 'secao', rotulo: 'A tarefa' },
        { id: 'titulo', rotulo: 'Assunto da tarefa', padrao: t.titulo },
        { id: 'descricao', rotulo: 'Descrição', tipo: 'textarea', padrao: t.descricao || '' },
        { id: 'tipo', rotulo: 'Como (canal)', tipo: 'select', largura: 'metade',
          padrao: t.tipo, opcoes: Store.nomesDoCatalogo('tiposTarefa') },
        { id: 'decisaoAlvo', rotulo: 'Decisão que pretende provocar', tipo: 'select', largura: 'metade',
          padrao: t.decisaoAlvo || '',
          opcoes: [{ valor: '', rotulo: '— nenhuma —' }]
            .concat(P.DIMENSOES.map(function (d) { return { valor: d.id, rotulo: d.nome }; })) },
        { id: 'vencimento', rotulo: 'Data', tipo: 'date', largura: 'metade', padrao: t.vencimento },
        { id: 'hora', rotulo: 'Horário', tipo: 'time', largura: 'metade', padrao: t.hora || '' },
        { id: 'donoId', rotulo: 'Responsável', tipo: 'select', padrao: t.donoId || '',
          opcoes: [{ valor: '', rotulo: '— sem responsável —' }]
            .concat(A.usuarios().map(function (u) { return { valor: u.id, rotulo: u.nome }; })) }
      ], {}, function (d) {
        if (!d.titulo) { alert('A tarefa precisa de um assunto.'); return; }
        const alvo = resolverNegocioDaTarefa(d);
        if (!alvo) return;
        /* Mudar a data por aqui é correção, não adiamento: quem adia usa o
           botão de adiar, e é ele que conta. Misturar os dois apagaria o
           sinal de "esta tarefa já foi empurrada quatro vezes". */
        const comQuem = contatoDaTarefa(alvo, d);
        Store.atualizarTarefa(id, {
          titulo: d.titulo, descricao: d.descricao || '', tipo: d.tipo,
          vencimento: d.vencimento || t.vencimento,
          hora: d.hora || '', donoId: d.donoId || null,
          oportunidadeId: alvo.id, decisaoAlvo: d.decisaoAlvo || '',
          contatoId: comQuem ? comQuem.id : (d.contatoId === NOVO_CONTATO ? t.contatoId : (d.contatoId || null))
        });
        render();
      }, function (dlg) {
        ligarEmpresaENegocio(dlg);
        ligarContatoDaTarefa(dlg);
        /* As duas ligações acima repintam os selects a partir da empresa, e
           repintar apaga o que estava escolhido. Devolver aqui é o que faz
           "Editar" abrir mostrando a tarefa como ela é, e não como ela
           começaria se fosse nova. */
        const negocio = dlg.querySelector('[name="oportunidadeId"]');
        if (negocio && t.oportunidadeId) negocio.value = t.oportunidadeId;
        const comQuem = dlg.querySelector('[name="contatoId"]');
        if (comQuem && t.contatoId) comQuem.value = t.contatoId;
      }, null, [
        { rotulo: 'Excluir', classe: 'ghost', acao: function () {
          if (!U.confirmar('Excluir esta tarefa?')) return false;
          Store.excluirTarefa(id);
          render();
        } }
      ]);
    },

    /* Criar tarefa a partir da tela de Tarefas: um caminho só. O formulário é
       o mesmo do cockpit, com dois campos a mais no topo — empresa e
       negociação — porque aqui nenhum dos dois é conhecido ainda. */
    novaTarefaLivre: function () {
      if (!Store.dados().contas.length) {
        if (U.confirmar('Nenhuma empresa cadastrada. Cadastrar uma agora?')) App.novaConta();
        return;
      }
      App.novaTarefa(null);
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
            if (IA.disponivel() && global.IADDocumentos.aceito(arquivo)) {
              if (U.confirmar('Quer que eu leia “' + arquivo.name + '” e separe as evidências desta reunião?')) {
                global.IADDocumentos.ler(arquivo)
                  .then(function (t) {
                    if (!t || t.length < 60) { alert('Não consegui tirar texto legível deste arquivo.'); return; }
                    App.processarReuniao(opId, t);
                  })
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
        Store.vincularStakeholder(op, d.contatoId);
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
      soltos.forEach(function (c) { Store.vincularStakeholder(op, c.id); });
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

    /* A consulta que responde "onde foram parar", para colar no SQL Editor.
       Curta de propósito: um arquivo de noventa linhas é um convite a deixar
       para depois. */
    copiarConsultaDeOnde: function () {
      const texto = [
        '-- Onde estão as contas e as oportunidades, por empresa.',
        '-- Rode no Supabase → SQL Editor (ele passa por cima do RLS).',
        'select t.nome as empresa, c.tenant_id, count(*) as contas',
        '  from public.contas c left join public.tenants t on t.id = c.tenant_id',
        ' group by 1,2 order by contas desc;',
        '',
        'select t.nome as empresa, o.tenant_id, count(*) as oportunidades',
        '  from public.oportunidades o left join public.tenants t on t.id = o.tenant_id',
        ' group by 1,2 order by oportunidades desc;'
      ].join('\n');
      const pronto = function () { alert('Consulta copiada. Cole no SQL Editor do Supabase e rode.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(pronto, function () { prompt('Copie:', texto); });
      } else {
        prompt('Copie:', texto);
      }
    },

    /* Pergunta ao servidor o que ele acha de quem está chamando e escreve o
       veredito na própria tela. É o que fecha o caso sem ninguém abrir o SQL
       Editor: as três causas de pipeline vazio se distinguem pelas respostas
       de sou_gestor(), meu_tenant() e a contagem que o RLS deixa passar. */
    perguntarAoServidor: function () {
      const alvo = document.getElementById('resposta-servidor');
      if (!alvo) return;
      alvo.innerHTML = '<p class="small muted">Perguntando ao servidor…</p>';
      const N = global.IADNuvem;

      Promise.all([N.comoOServidorMeVe(), N.primeirasLinhas('contas'), N.primeirasLinhas('oportunidades')])
        .then(function (r) {
          const v = r[0], contas = r[1], ops = r[2];
          const eu = A.atual() || {};
          const linhas = [];
          const diz = function (rot, texto) {
            linhas.push('<li><strong>' + U.esc(rot) + ':</strong> ' + texto + '</li>');
          };

          diz('sou_gestor() existe no banco', v.souGestor.existe
            ? 'sim, e devolveu <strong>' + String(v.souGestor.valor) + '</strong>'
            : '<strong class="atrasado">NÃO</strong> — a correção 5 nunca rodou neste servidor');
          diz('meu_tenant()', v.meuTenant.existe ? U.esc(String(v.meuTenant.valor)) : 'função ausente');
          diz('sou_admin()', v.souAdmin.existe ? String(v.souAdmin.valor) : 'função ausente');
          diz('Empresa do seu perfil', U.esc(eu.tenantId || '(nenhuma)'));
          const quanto = function (r) {
            if (r.erro) return '<span class="atrasado">' + U.esc(r.erro) + '</span>';
            if (!r.tem) return '<strong class="atrasado">nenhuma</strong>';
            return r.quantas >= r.limite ? 'pelo menos ' + r.limite : String(r.quantas);
          };
          diz('Contas que o servidor deixa você ler', quanto(contas));
          diz('Oportunidades que o servidor deixa você ler', quanto(ops));

          /* O veredito, que é o ponto de tudo isto: uma frase e o que fazer. */
          let veredito;
          if (!v.souGestor.existe) {
            veredito = 'A correção 5 não foi aplicada neste servidor. Sem ela o gestor é tratado como ' +
              'vendedor comum e só vê o que tem o dono_id dele — e estas contas foram criadas por outro ' +
              'login seu. <strong>Rode nuvem/correcao-05-gestor.sql no SQL Editor.</strong>';
          } else if (v.souGestor.valor !== true) {
            veredito = 'A correção está aplicada, mas o servidor não considera você gestor: o papel na ' +
              'tabela perfis não é gestor nem admin. <strong>Um administrador precisa mudar o seu papel</strong> ' +
              'em Cadastros → Usuários.';
          } else if (v.meuTenant.existe && String(v.meuTenant.valor) !== String(eu.tenantId || '')) {
            veredito = 'O servidor diz que a sua empresa é outra: <strong>' + U.esc(String(v.meuTenant.valor)) +
              '</strong>, e o app está trabalhando com ' + U.esc(eu.tenantId || '(nenhuma)') +
              '. Saia e entre de novo para o app pegar a empresa certa.';
          } else if (contas.erro || ops.erro) {
            veredito = 'O servidor recusou a leitura em vez de devolver uma lista vazia — ' +
              'isso é erro de permissão ou de instalação, não carteira vazia. ' +
              '<strong>Me mande este quadro.</strong>';
          } else if (contas.tem || ops.tem) {
            veredito = 'O servidor tem registros para você e o app mostrou zero. ' +
              '<strong>Aí o problema é do app</strong> — me mande este quadro.';
          } else {
            veredito = 'Você é gestor, na empresa certa, e o servidor não tem nenhuma conta nesta empresa. ' +
              'Os seus registros estão em <strong>outra empresa</strong> — ou nunca chegaram ao servidor. ' +
              (v.souAdmin.valor === true
                ? 'Como você é administrador, o próprio servidor me deixa olhar as outras empresas: a lista ' +
                  'abaixo diz qual dos dois é o caso.'
                : 'Quem sabe qual dos dois é o administrador, ou esta consulta no SQL Editor do Supabase.' +
                  '<button class="btn ghost mini" onclick="App.copiarConsultaDeOnde()">Copiar a consulta</button>');
          }

          alvo.innerHTML = '<ul class="small" style="margin:10px 0">' + linhas.join('') + '</ul>' +
            '<div class="aviso faixa-aviso">' + veredito + '</div>' +
            '<div id="onde-estao"></div>';

          /* O administrador consegue a resposta sem sair do app: o RLS devolve
             as linhas das outras empresas só para ele. */
          if (v.souAdmin.valor === true) mostrarOndeEstao();
        }, function (e) {
          alvo.innerHTML = '<div class="aviso">Não consegui perguntar: ' + U.esc(e.message) + '</div>';
        });
    },

    /* O diagnóstico vira texto para colar numa mensagem. É a diferença entre
       "sumiu tudo" e um relato que dá para responder. */
    copiarDiagnostico: function () {
      const d = Store.diagnostico();
      const linhas = [
        'DIAGNÓSTICO IAD CRM — ' + new Date().toISOString(),
        'Usuário: ' + (d.usuario || '?') + ' (' + (d.login || '?') + ') · papel ' + (d.papel || '?'),
        'Empresa: ' + (d.minhaEmpresa || '(nenhuma)') + ' [' + (d.meuTenantId || 'sem id') + ']',
        d.filtrosDoAdmin ? 'Recorte de admin: ' + JSON.stringify(d.filtrosDoAdmin) : '',
        '',
        'Coleções (guardados / visíveis):',
        d.colecoes.map(function (c) { return '  ' + c.colecao + ': ' + c.guardados + ' / ' + c.visiveis; }).join('\n'),
        '',
        'Registros por empresa: ' + JSON.stringify(d.registrosPorEmpresa),
        'Empresas espelhadas: ' + JSON.stringify(d.empresasEspelhadas),
        'Oportunidades sem dono: ' + d.oportunidadesSemDono
      ].filter(Boolean).join('\n');

      const pronto = function () { alert('Diagnóstico copiado. Cole na mensagem.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(linhas).then(pronto, function () { prompt('Copie o texto abaixo:', linhas); });
      } else {
        prompt('Copie o texto abaixo:', linhas);
      }
    },

    /* O botão do aviso de sincronização. Repete só a descida — quem acabou de
       entrar quer ver a carteira, não empurrar a cópia local por cima dela. */
    tentarBaixarDeNovo: function () {
      avisoSincronizacao = 'Baixando de novo…';
      render();
      global.IADNuvem.puxar().then(function () {
        avisoSincronizacao = '';
        render();
      }, function (e) {
        avisoSincronizacao = 'Ainda não consegui trazer os dados: ' +
          (e && e.message ? e.message : 'erro desconhecido') +
          ' — o que está na tela é a última cópia baixada neste aparelho.';
        render();
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
        leads = lista;
        if (!lista.length) {
          espera.close(); espera.remove();
          alert('Nenhuma resposta nova na ponte.');
          return;
        }

        /* Várias SDRs mandam prospects de segmentos diferentes. Classificar
           empresa por empresa à mão é o que faz ninguém classificar — e sem
           segmento o painel por segmento não diz nada. Uma chamada só para o
           lote inteiro, e o vendedor corrige o que quiser na tela seguinte. */
        const comEmpresa = lista.filter(function (l) { return l.empresa; });
        if (!comEmpresa.length) {
          espera.close(); espera.remove();
          return App.revisarImportacao(lista, 'Nenhum lead veio com empresa identificada — não há o que classificar.');
        }

        espera.querySelector('h2').textContent = 'Classificando os segmentos…';
        espera.querySelector('p').textContent =
          comEmpresa.length === 1 ? '1 empresa' : comEmpresa.length + ' empresas';

        espera.querySelector('h2').textContent = 'Lendo as empresas e as conversas…';
        IA.classificarSegmentos(comEmpresa.map(function (l) {
          return {
            nome: l.empresa, dominio: l.empresaDominio, site: l.empresaSite,
            setor: l.empresaSetor, cidade: l.empresaCidade,
            descricao: l.empresaDescricao, oQueFazLa: l.oQueFazLa,
            contato: l.nome, cargo: l.cargo, headline: l.headline,
            conversa: l.conversa || []
          };
        })).then(function (r) {
          comEmpresa.forEach(function (l, i) {
            const achado = r.mapa[i];
            if (!achado) return;
            if (achado.segmento) l.segmentoSugerido = achado.segmento;
            l.confiancaSegmento = achado.confianca || '';
            l.porqueSegmento = achado.porque || '';
            l.maisProximoSegmento = achado.maisProximo || '';
            if (achado.papel) l.papelSugerido = achado.papel;
            /* O insight da campanha é o mesmo texto para o lote inteiro; o da
               IA é sobre esta conversa. Quando existem os dois, vale o desta
               conversa — foi para isso que a conversa foi lida. */
            if (achado.insight) l.insight = achado.insight;
          });
          espera.close(); espera.remove();
          App.revisarImportacao(lista, r.motivo);
        });
      }).catch(function (e) {
        espera.close(); espera.remove();
        alert(e.message);
      });
    },

    /* O botão vive dentro do <dialog> da importação, que não passa pelo render
       do app: mexer no select ali é mexer no DOM que já está na tela. */
    usarSegmentoProximo: function (i, botao) {
      const dlg = botao.closest('dialog');
      const sel = dlg && dlg.querySelector('[data-segmento="' + i + '"]');
      if (!sel) return;
      const alvo = Array.prototype.filter.call(sel.options, function (o) {
        return o.value === botao.textContent;
      })[0];
      if (!alvo) return;
      sel.value = alvo.value;
      botao.disabled = true;
    },

    revisarImportacao: function (lista, avisoSegmento) {
      const dlg = document.createElement('dialog');
      dlg.className = 'revisao-ia';
      dlg.innerHTML = V.revisaoDaImportacao(lista, avisoSegmento);
      document.body.appendChild(dlg);
      ligarMarcacaoEmLote(dlg);

      dlg.addEventListener('close', function () {
        if (dlg.returnValue === 'ok') {
          const escolhidos = lista.filter(function (l, i) {
            const marca = dlg.querySelector('[data-lead="' + i + '"]');
            return marca && marca.checked;
          });
          const feitos = escolhidos.map(function (l) {
            const i = lista.indexOf(l);
            const escolha = dlg.querySelector('[data-segmento="' + i + '"]');
            const papel = dlg.querySelector('[data-papel="' + i + '"]');
            if (papel) l.papelSugerido = papel.value;
            return importarUmLead(l, escolha ? escolha.value : '');
          }).filter(Boolean);
          if (feitos.length) {
            global.IADIntegracoes.marcarProcessados(escolhidos.map(function (l) { return l.id; }));
            leads = (leads || []).filter(function (l) {
              return escolhidos.indexOf(l) === -1;
            });
            /* Dizer "5 oportunidades criadas" quando três eram interação nova
               de negócio que já existia é dizer o número errado — e o vendedor
               vai procurar no pipeline cinco cartões que não estão lá. */
            const criados = feitos.filter(function (f) { return f.novo; }).length;
            const atualizados = feitos.length - criados;
            const contatosNovos = feitos.filter(function (f) { return f.contatoNovo && !f.novo; }).length;
            alert([
              criados ? (criados === 1 ? '1 oportunidade criada' : criados + ' oportunidades criadas') : '',
              atualizados ? (atualizados === 1 ? '1 oportunidade atualizada' : atualizados + ' oportunidades atualizadas') : '',
              contatosNovos ? (contatosNovos === 1 ? '1 contato novo no buying group' : contatosNovos + ' contatos novos no buying group') : ''
            ].filter(Boolean).join('\n') + '\n\nOrigem: Linked Helper.');
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
            site: lead.empresaSite || '', cidade: lead.empresaCidade || '',
            descricao: lead.empresaDescricao || ''
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
          origem: 'Linked Helper', campanha: lead.campanha || '',
          sdr: lead.operador || '', sdrEmail: lead.operadorEmail || '',
          notas: notasDoLead(lead)
        });
        Store.vincularStakeholder(op, contato.id);
        Store.salvar();

        /* A troca inteira com a SDR vai para o histórico mesmo quando o
           vendedor reescreve a evidência: o texto dele é o que conta como
           avanço, a conversa é o que explica de onde ele saiu. */
        registrarTranscricaoDoLead(op, lead);

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

        /* Empresa que veio do LH é empresa com quem ninguém falou ainda, venha
           ela pelo lote ou uma por uma. A tarefa de fazer o contato nasce nos
           dois caminhos: sem ela o cartão fica na Conexão sem data marcada,
           que é como nasce negócio zumbi. */
        const tarefa = tarefaDoLead(op, contato, lead, true, true);

        /* O lead é de quem prospectou, não de quem clicou em importar. */
        atribuirAoOperador(lead, [Store.conta(contaId), contato, op, tarefa]);

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

    sair: function (semPerguntar, recado) {
      if (!semPerguntar && !U.confirmar('Sair do sistema?')) return;
      fecharMenuUsuario();
      A.encerrarSessao();
      const N = global.IADNuvem;
      /* O recado sobrevive ao logout de propósito: quem clicou em "trocar de
         conta" precisa ver na tela de entrada por que está ali. */
      const depois = function () { V.definirTelaAcesso('login', null, recado || ''); render(); };
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

    /* Manda o e-mail de senha nova. O link volta para o app com os tokens
       depois do #, e o boot faz o resto — é o mesmo caminho do convite.

       A resposta é a mesma para e-mail cadastrado e não cadastrado, de
       propósito: distinguir os dois faria desta tela uma forma de descobrir
       quem usa o sistema. */
    recuperarSenha: function () {
      const N = global.IADNuvem;
      if (!N.mandaNoAcesso()) { alert('Sem servidor configurado, a senha é deste aparelho.'); return; }
      U.formulario('Esqueci minha senha', [
        { id: 'email', rotulo: 'Seu e-mail', tipo: 'email' }
      ], {}, function (d) {
        const email = (d.email || '').trim();
        if (!email || email.indexOf('@') === -1) { alert('Informe um e-mail válido.'); return; }
        N.recuperarSenha(email, location.origin + location.pathname).then(function () {
          alert('Se este e-mail tiver conta, o link para definir a senha já está a caminho.\n\n' +
            'Abra o link no mesmo navegador, e o app pede a senha nova.');
        }).catch(function (e) {
          alert('Não consegui pedir o e-mail: ' + e.message);
        });
      });
    },

    /* Editar os dados de outra pessoa, e bloquear ou desbloquear. As três
       são atribuições do administrador, e quem confere isso é o banco: a tela
       pode esconder o botão, mas esconder não é impedir. Ver a correção 09.

       Não há excluir, e é decisão, não esquecimento: desligar um vendedor não
       pode apagar a carteira que ele atendia — cliente continua cliente depois
       que o vendedor sai. Bloqueio faz o mesmo trabalho e volta atrás. */
    editarPessoaNuvem: function (id) {
      const p = (perfisNuvem || []).find(function (x) { return x.id === id; }) || {};
      U.formulario('Editar pessoa', [
        { id: 'nome', rotulo: 'Nome', tipo: 'text', padrao: p.nome || '' },
        { id: 'whatsapp', rotulo: 'WhatsApp', tipo: 'text', padrao: p.whatsapp || '',
          placeholder: '(00) 00000-0000' }
      ], {}, function (d) {
        const nome = (d.nome || '').trim();
        if (!nome) { alert('Escreva um nome.'); return; }
        global.IADNuvem.definirDadosDoPerfil(id, nome, d.whatsapp)
          .then(function () { perfisNuvem = null; pintarUsuariosNuvem(true); })
          .catch(function (e) { alert('Não foi possível gravar: ' + e.message); });
      });
    },

    bloquearPessoa: function (id, estaBloqueada) {
      const p = (perfisNuvem || []).find(function (x) { return x.id === id; }) || {};
      const quem = p.nome || 'esta pessoa';
      if (!estaBloqueada && !U.confirmar('Bloquear ' + quem + '?\n\n' +
          'Ela não entra mais no sistema. Nada é apagado: os registros dela ' +
          'continuam na empresa, e você pode desbloquear quando quiser.')) return;
      global.IADNuvem.definirBloqueioDoPerfil(id, estaBloqueada)
        .then(function () { perfisNuvem = null; pintarUsuariosNuvem(true); })
        .catch(function (e) { alert('Não foi possível: ' + e.message); });
    },

    editarEmpresaNuvem: function (id) {
      const t = (empresasNuvem || []).find(function (x) { return x.id === id; }) || {};
      U.formulario('Editar empresa', [
        { id: 'nome', rotulo: 'Nome', tipo: 'text', padrao: t.nome || '' },
        { id: 'cnpj', rotulo: 'CNPJ', tipo: 'text', padrao: t.cnpj || '' }
      ], {}, function (d) {
        const nome = (d.nome || '').trim();
        if (!nome) { alert('A empresa precisa de um nome.'); return; }
        global.IADNuvem.definirDadosDaEmpresa(id, nome, d.cnpj)
          .then(function () { empresasNuvem = null; perfisNuvem = null; pintarUsuariosNuvem(true); })
          .catch(function (e) { alert('Não foi possível gravar: ' + e.message); });
      });
    },

    bloquearEmpresa: function (id, estaBloqueada) {
      const t = (empresasNuvem || []).find(function (x) { return x.id === id; }) || {};
      const quantos = (perfisNuvem || []).filter(function (p) { return p.tenant_id === id; }).length;
      /* Bloquear a própria empresa assusta: some a carteira e parece que o
         sistema quebrou. Não é impedido — administrador continua entrando, e
         é ele quem desbloqueia —, mas tem de estar dito antes, não depois. */
      const meu = global.IADNuvem.estado().perfil || {};
      const minhaEmpresa = meu.tenant_id === id;
      if (!estaBloqueada && !U.confirmar('Bloquear a ' + (t.nome || 'empresa') + '?\n\n' +
          'Ninguém dela entra mais' + (quantos ? ' — são ' + quantos + ' pessoa' + (quantos > 1 ? 's' : '') : '') + '. ' +
          'Só quem administra continua enxergando, e é quem desbloqueia.\n\n' +
          (minhaEmpresa ? 'Atenção: esta é a SUA empresa. Você continua entrando, porque administra o sistema, mas todo o resto da equipe dela fica de fora.\n\n' : '') +
          'Nenhum registro é apagado.')) return;
      global.IADNuvem.definirBloqueioDaEmpresa(id, estaBloqueada)
        .then(function () { empresasNuvem = null; perfisNuvem = null; pintarUsuariosNuvem(true); })
        .catch(function (e) { alert('Não foi possível: ' + e.message); });
    },

    /* Repergunta ao servidor sem recarregar a página: quem acabou de mexer nos
       segredos da função quer saber agora se resolveu. */
    reverAssistente: function () {
      IA.verificar().then(function () { render(); });
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
        { id: 'nome', rotulo: 'Nome da pessoa', tipo: 'text', placeholder: 'como ela aparece na lista' },
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
        global.IADNuvem.convidar(email, d.tenantId, d.papel, d.nome)
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

    /* Envia de verdade, pelo servidor, quando a função de convite estiver
       publicada. Se ela não estiver, cai no caminho antigo — abrir o programa
       de e-mail com a mensagem pronta — em vez de deixar o botão sem efeito.

       Quem manda é o Supabase, e o remetente é o endereço configurado no SMTP
       dele. Ver nuvem/EMAIL.md. */
    enviarConvite: function (email) {
      const N = global.IADNuvem;
      if (!N.conectado()) return App.enviarPeloProgramaDeEmail(email);

      N.chamarFuncao('convite', {
        email: email,
        destino: location.origin + location.pathname
      }).then(function () {
        alert('Convite enviado para ' + email + '.\n\nA pessoa recebe um link para definir a senha dela.');
        render();
      }).catch(function (e) {
        /* Erro sem status quer dizer que a resposta nem chegou ao navegador:
           o gateway do Supabase recusou a chamada antes, e sem cabeçalho de
           CORS não há o que ler. Isso acontece tanto com função que não
           existe quanto com função publicada de Verify JWT ligado — daqui os
           dois são iguais, então a mensagem cita os dois (ver SEM_FUNCAO).

           Nos dois casos o caminho manual continua servindo, que é o que
           importa para quem está com o convite na mão. */
        if (!e.status || e.status === 404) {
          alert('Não consegui falar com o envio automático de e-mail. ' +
            'A função "convite" ' + SEM_FUNCAO + '\n\n' +
            'O passo a passo está em nuvem/EMAIL.md.\n\n' +
            'Abrindo seu programa de e-mail com a mensagem pronta.');
          return App.enviarPeloProgramaDeEmail(email);
        }
        alert('Não consegui enviar: ' + e.message);
      });
    },

    enviarPeloProgramaDeEmail: function (email) {
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
    /* As três guardas abaixo repetem o que a tela já decide ao desenhar os
       botões. Não é redundância: esconder um botão não impede nada — a função
       continua no window, e o console do navegador chega nela. A tela evita o
       engano; estas linhas evitam a burla. A regra que vale de verdade é a do
       servidor, nas políticas do banco; aqui é o cadastro deste aparelho. */
    novoUsuario: function () {
      if (!A.ehAdmin()) {
        alert('Só quem administra cria acessos. Peça a quem administra o sistema.');
        return;
      }
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
      const eu = A.atual();
      if (!A.ehAdmin() && !(eu && eu.id === id)) {
        alert('Você só edita os seus próprios dados.');
        return;
      }
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
      const eu = A.atual();
      if (!A.ehAdmin()) {
        alert('Só quem administra remove acessos. Peça a quem administra o sistema.');
        return;
      }
      if (eu && eu.id === id) {
        alert('Você não pode remover o seu próprio acesso.');
        return;
      }
      if (!U.confirmar('Excluir este acesso deste aparelho?\n\n' +
          'A conta no servidor continua existindo — lá o caminho é bloquear. ' +
          'Os registros criados por ela continuam no sistema.')) return;
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

  /* Marcar e desmarcar todos, com o contador acompanhando.

     O contador não é enfeite: a lista rola, e o botão mexe em caixas que estão
     fora da tela. Sem um número mudando, "Marcar todos" numa lista de vinte é
     um clique que não parece ter feito nada. Ele também acompanha os cliques
     avulsos, senão passaria a mentir no instante seguinte. */
  function ligarMarcacaoEmLote(dlg) {
    const caixas = Array.prototype.slice.call(dlg.querySelectorAll('[data-lead]'));
    const conta = dlg.querySelector('[data-conta-marcados]');
    if (!caixas.length) return;

    const pintar = function () {
      if (!conta) return;
      const n = caixas.filter(function (c) { return c.checked; }).length;
      conta.textContent = n + ' de ' + caixas.length + (n === 1 ? ' marcado' : ' marcados');
    };
    dlg.querySelectorAll('[data-marcar]').forEach(function (b) {
      b.addEventListener('click', function () {
        const ligar = b.getAttribute('data-marcar') === 'todos';
        caixas.forEach(function (c) { c.checked = ligar; });
        pintar();
      });
    });
    caixas.forEach(function (c) { c.addEventListener('change', pintar); });
    pintar();
  }

  /* ---------- reconciliação: o mesmo mundo chegando duas vezes ----------

     A ponte não manda "o lead"; ela manda uma INTERAÇÃO. A mesma pessoa
     responde de novo na semana seguinte, um colega dela responde a mesma
     campanha, a mesma pessoa cai numa campanha nova — e cada uma dessas
     coisas chega como um registro novo, com id novo, que a ponte nunca viu
     marcado como processado.

     Enquanto isto aqui criava tudo sempre, quatro leituras da mesma empresa
     deixavam quatro contatos, quatro oportunidades e quatro tarefas. E a
     conta piorava sozinha: a oportunidade nasce com todos os contatos da
     conta vinculados, então a quarta cópia entrava com o buying group cheio
     de cópias da mesma pessoa, e a cobertura de papéis passava a mentir.

     Então antes de criar qualquer coisa, procura-se o que já existe. */

  function achatarNome(x) {
    return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /* O perfil do LinkedIn é o identificador mais confiável que a ponte manda:
     é único, é estável e vem em quase todo registro. O e-mail vem menos e o
     nome é o último recurso — homônimo dentro da mesma empresa é raro, mas
     "Marcos" e "Marcos Silva" na mesma conta são a mesma pessoa. */
  function perfilLinkedin(url) {
    const m = /linkedin\.com\/in\/([^/?#]+)/i.exec(String(url || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function contatoJaExistente(contaId, lead) {
    const lista = Store.contatosDaConta(contaId);
    if (!lista.length) return null;

    const perfil = perfilLinkedin(lead.linkedin);
    if (perfil) {
      const porPerfil = lista.filter(function (c) { return perfilLinkedin(c.linkedin) === perfil; })[0];
      if (porPerfil) return porPerfil;
    }
    const email = String(lead.email || '').trim().toLowerCase();
    if (email) {
      const porEmail = lista.filter(function (c) {
        return String(c.email || '').trim().toLowerCase() === email;
      })[0];
      if (porEmail) return porEmail;
    }
    const nome = achatarNome(lead.nome);
    if (!nome) return null;
    return lista.filter(function (c) {
      const dele = achatarNome(c.nome);
      if (!dele) return false;
      return dele === nome || dele.indexOf(nome + ' ') === 0 || nome.indexOf(dele + ' ') === 0;
    })[0] || null;
  }

  /* O domínio identifica a empresa melhor que o nome: "Envu" e "Envu Brasil"
     são a mesma, "Alpha Engenharia" e "Alpha Alimentos" não são. O nome fica
     como reserva, porque muito registro vem sem site. */
  function contaJaExistente(lead) {
    const contas = Store.dados().contas;
    const dominio = String(lead.empresaDominio || lead.empresaSite || '')
      .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
    if (dominio) {
      const porSite = contas.filter(function (c) {
        const dela = String(c.site || '').replace(/^https?:\/\//, '').replace(/^www\./, '')
          .replace(/\/.*$/, '').toLowerCase();
        return dela && dela === dominio;
      })[0];
      if (porSite) return porSite;
    }
    if (!lead.empresa) return null;
    const alvo = achatarNome(lead.empresa);
    if (!alvo) return null;
    return contas.filter(function (c) {
      const dela = achatarNome(c.nome);
      if (!dela) return false;
      return dela === alvo || dela.indexOf(alvo) === 0 || alvo.indexOf(dela) === 0;
    })[0] || null;
  }

  /* Uma oportunidade por empresa e campanha, enquanto ela estiver aberta.
     Campanha diferente é abordagem diferente, com outra promessa e outro
     ciclo: vira negócio novo. Negócio já fechado também não recebe interação
     nova — o desfecho congelou a foto da decisão, e mexer nele reescreveria
     um resultado já apurado. */
  function oportunidadeJaExistente(contaId, lead) {
    const campanha = achatarNome(lead.campanha);
    return Store.dados().oportunidades.filter(function (o) {
      if (o.contaId !== contaId || o.desfecho) return false;
      if (o.origem !== 'Linked Helper') return false;
      return achatarNome(o.campanha) === campanha;
    })[0] || null;
  }

  /* O Linked Helper reenvia a conversa inteira a cada interação, não só a
     mensagem nova. Regravar tudo encheria o histórico de repetição e faria a
     mesma frase do cliente virar evidência três vezes — IAD subindo porque a
     ponte falou duas vezes, que é o oposto do método. */
  function mensagensNovas(op, conversa) {
    const jaEscrito = (op.eventos || []).filter(function (e) {
      return e.tipo === 'sistema' && /Conversa no LinkedIn/.test(e.titulo || '');
    }).map(function (e) { return e.detalhe || ''; }).join('\n');
    if (!jaEscrito) return conversa;
    return conversa.filter(function (m) { return jaEscrito.indexOf(m.texto) === -1; });
  }

  /* Um lead vira três registros quando é gente nova, e vira uma atualização
     quando não é. Sem janela e sem digitação: o que não veio do LinkedIn fica
     em branco para o vendedor completar depois — melhor um campo vazio do que
     um palpite virando fato no painel. */
  function importarUmLead(lead, segmento) {
    const nome = lead.empresa || ('Contato ' + (lead.nome || 'do LinkedIn'));
    if (segmento) Store.criarNoCatalogo('segmentos', { nome: segmento });

    /* ---------- a empresa ---------- */
    let conta = contaJaExistente(lead);
    if (!conta) {
      conta = Store.criarConta({
        nome: nome, segmento: segmento || '',
        site: lead.empresaSite || '', cidade: lead.empresaCidade || '',
        /* A descrição do LinkedIn é a matéria-prima do segmento e do insight.
           Descartá-la obrigava a IA a reclassificar a empresa do zero mais
           tarde, sem nada além do nome. */
        descricao: lead.empresaDescricao || ''
      });
    } else {
      /* Só o que está vazio. O vendedor que corrigiu o nome da empresa ou
         escolheu outro segmento não pode ver a próxima leitura desfazer
         isso — a ponte não sabe mais que ele. */
      if (segmento && !conta.segmento) conta.segmento = segmento;
      if (!conta.site && lead.empresaSite) conta.site = lead.empresaSite;
      if (!conta.cidade && lead.empresaCidade) conta.cidade = lead.empresaCidade;
      if (!conta.descricao && lead.empresaDescricao) conta.descricao = lead.empresaDescricao;
    }

    /* ---------- o contato ---------- */
    let contato = contatoJaExistente(conta.id, lead);
    const ehContatoNovo = !contato;
    if (!contato) {
      contato = Store.criarContato({
        contaId: conta.id, nome: lead.nome || 'Contato do LinkedIn', cargo: lead.cargo || '',
        /* O papel sai do cargo, e é ele que a cobertura do grupo comprador conta.
           Deixar todo mundo em "Usuário" fazia toda conta importada nascer com
           0% dos papéis críticos — alarme que não distingue nada. */
        papel: lead.papelSugerido || 'Usuário',
        linkedin: lead.linkedin || '', email: lead.email || '', telefone: lead.telefone || '',
        sentimento: lead.resposta ? 'neutro' : 'nao_acessado', canalPreferido: 'LinkedIn'
      });
    } else {
      completarEmBranco(contato, {
        cargo: lead.cargo, linkedin: lead.linkedin, email: lead.email, telefone: lead.telefone
      });
      /* "Usuário" e "não acessado" são o padrão de fábrica, não uma escolha:
         podem ser substituídos. Papel que o vendedor mudou à mão, não. */
      if (lead.papelSugerido && contato.papel === 'Usuário') contato.papel = lead.papelSugerido;
      if (lead.resposta && contato.sentimento === 'nao_acessado') contato.sentimento = 'neutro';
      Store.salvar();
    }

    /* ---------- a oportunidade ---------- */
    let op = oportunidadeJaExistente(conta.id, lead);
    const ehNegocioNovo = !op;
    if (!op) {
      /* Quem já respondeu passou da prospecção: dizer que está em Prospecção
         seria etapa mais atrasada que a realidade, e o IAD compara as duas. */
      op = Store.criarOportunidade({
        contaId: conta.id,
        titulo: (lead.empresa ? lead.empresa : (lead.nome || 'LinkedIn')) + ' — origem LH',
        etapa: lead.resposta ? 'Conexão' : 'Prospecção',
        /* Com várias SDRs mandando prospect, saber de quem veio e de qual
           campanha é o que permite ler o resultado depois, por pessoa e por
           campanha. Fica em campo próprio, não perdido dentro das notas. */
        origem: 'Linked Helper',
        campanha: lead.campanha || '',
        sdr: lead.operador || '',
        sdrEmail: lead.operadorEmail || '',
        notas: notasDoLead(lead)
      });
    } else if (lead.resposta && op.etapa === 'Prospecção') {
      /* Da primeira vez ninguém tinha respondido. Agora respondeu: a etapa
         estava atrás da realidade, e é exatamente essa diferença que o
         método chama de negócio escondido. */
      Store.atualizarOportunidade(op.id, { etapa: 'Conexão' });
    }

    /* A oportunidade nasce com os contatos da conta já vinculados. Empurrar o
       recém-criado de novo punha a mesma pessoa duas vezes no buying group.
       No caso do colega que respondeu depois, é aqui que ele entra. */
    Store.vincularStakeholder(op, contato.id);
    Store.salvar();

    const falasNovas = registrarConversaDoLead(op, contato, lead);
    if (lead.insight && (!op.insight || !op.insight.texto)) {
      Store.definirInsight(op.id, { texto: lead.insight, estado: 'formulado' });
    }
    const tarefa = tarefaDoLead(op, contato, lead,
      ehNegocioNovo || ehContatoNovo || falasNovas.length, ehNegocioNovo);
    atribuirAoOperador(lead, [conta, contato, op, tarefa]);
    return { op: op, novo: ehNegocioNovo, contatoNovo: ehContatoNovo, falas: falasNovas.length };
  }

  /* Empresa que veio do LH é empresa com quem ninguém falou ainda. A importação
     criava conta, contato e negócio e parava aí: o cartão nascia na Conexão sem
     nada marcado para acontecer, e o que não tem data não acontece — vira a
     coluna cheia de negócio parado que o método chama de zumbi.

     Então toda importação também abre a tarefa de fazer o contato, vencendo no
     próprio dia da importação, com a conversa do LinkedIn escrita dentro dela.
     Escrita dentro: quem for ligar não devia ter que abrir o negócio e caçar o
     histórico para descobrir o que a SDR prometeu antes de discar.

     Quando a leitura é a segunda de um negócio que já existe, a regra muda de
     forma e não de intenção. Abrir uma tarefa idêntica a cada interação daria
     a mesma pilha de tarefa repetida que a lista de hoje tem — e a lista de
     tarefas repetida é lista que ninguém abre. Então: se a tarefa de contato
     ainda está aberta, ela é reescrita com a conversa nova, porque quem for
     ligar precisa da última fala e não da primeira. Se ela já foi feita e o
     cliente voltou a falar, aí sim nasce uma nova — resposta do cliente sem
     data marcada para responder é o começo do negócio zumbi. */
  function tarefaDoLead(op, contato, lead, temNovidade, ehNegocioNovo) {
    Store.criarNoCatalogo('tiposTarefa', { nome: 'Apresentação' });

    const aberta = Store.dados().tarefas.filter(function (t) {
      return t.oportunidadeId === op.id && t.status === 'aberta' &&
        /LH/.test(t.titulo || '');
    })[0];

    if (aberta) {
      if (!temNovidade) return aberta;
      aberta.descricao = descricaoDaTarefaDoLead(op, contato, lead);
      /* O contato da tarefa passa a ser quem falou por último: é com ele que
         a conversa está de pé. */
      aberta.contatoId = contato ? contato.id : aberta.contatoId;
      Store.salvar();
      return aberta;
    }

    if (!temNovidade) return null;

    return Store.criarTarefa({
      titulo: ehNegocioNovo
        ? 'Empresa Importada do LH - Fazer Contato'
        : 'Nova interação no LH - Responder',
      tipo: 'Apresentação',
      oportunidadeId: op.id,
      contatoId: contato ? contato.id : null,
      vencimento: Store.hoje(),
      origem: 'planejada',
      descricao: descricaoDaTarefaDoLead(op, contato, lead)
    });
  }

  /* As importações que aconteceram antes de a tarefa existir. Aqui o lead já
     não está mais na mão — mas nada do que a tarefa precisa se perdeu: campanha
     e SDR estão em campo próprio do negócio, e a conversa ficou escrita no
     evento de sistema que a importação gravou no histórico. Então a descrição
     se remonta do que está guardado, em vez de nascer vazia. */
  function criarTarefaAtrasadaDoLH(op) {
    const contato = (op.stakeholders || []).map(function (s) {
      return Store.contato(typeof s === 'string' ? s : s.contatoId);
    }).filter(Boolean)[0] || null;

    const evento = (op.eventos || []).filter(function (e) {
      return e.tipo === 'sistema' && /Conversa no LinkedIn/.test(e.titulo || '');
    })[0];

    Store.criarNoCatalogo('tiposTarefa', { nome: 'Apresentação' });
    return Store.criarTarefa({
      titulo: 'Empresa Importada do LH - Fazer Contato',
      tipo: 'Apresentação',
      oportunidadeId: op.id,
      contatoId: contato ? contato.id : null,
      vencimento: Store.hoje(),
      origem: 'planejada',
      donoId: op.donoId || null,
      descricao: [
        'Empresa importada do Linked Helper.',
        [op.campanha ? 'Campanha: ' + op.campanha : 'Campanha: (não informada)',
         op.sdr ? 'SDR: ' + op.sdr + (op.sdrEmail ? ' (' + op.sdrEmail + ')' : '') : 'SDR: (não informada)',
         'Contato: ' + (contato ? contato.nome + (contato.cargo ? ' — ' + contato.cargo : '') : '(sem contato vinculado)')
        ].join('\n'),
        evento && evento.detalhe
          ? 'Conversa no LinkedIn:\n' + evento.detalhe
          : 'Conversa no LinkedIn:\n(não ficou registrada nesta importação.)'
      ].join('\n\n')
    });
  }

  /* A conversa inteira, em ordem e com quem falou o quê. Fica a conversa toda e
     não só o último par porque "Sim, pode mandar" não se explica sozinho — o
     que foi prometido está na pergunta, e é isso que a pessoa precisa honrar na
     ligação. */
  function descricaoDaTarefaDoLead(op, contato, lead) {
    const quem = [
      op.campanha ? 'Campanha: ' + op.campanha : 'Campanha: (não informada)',
      op.sdr ? 'SDR: ' + op.sdr + (op.sdrEmail ? ' (' + op.sdrEmail + ')' : '') : 'SDR: (não informada)',
      'Contato: ' + ((contato && contato.nome) || lead.nome || '(sem nome)') +
        (contato && contato.cargo ? ' — ' + contato.cargo : ''),
      lead.linkedin ? 'LinkedIn: ' + lead.linkedin : ''
    ].filter(Boolean).join('\n');

    const conversa = falasDoLead(lead);
    let troca;
    if (!conversa.length) {
      troca = 'Conversa no LinkedIn:\n(nenhuma mensagem veio do Linked Helper — a empresa entrou pela ' +
        'campanha, sem troca registrada.)';
    } else {
      troca = 'Conversa no LinkedIn:\n' + conversa.map(function (m) {
        const autor = m.nosso ? (op.sdr || lead.operador || 'SDR')
                              : (m.de || (contato && contato.nome) || lead.nome || 'Prospect');
        return autor + (m.quando ? ' (' + U.data(m.quando) + ')' : '') + ':\n' + m.texto;
      }).join('\n\n');
    }

    return ['Empresa importada do Linked Helper em ' + U.data(Store.hoje()) + '.', quem, troca].join('\n\n');
  }

  /* O que não cabe em campo próprio, mas quem abre a conta amanhã precisa ler. */
  function notasDoLead(lead) {
    const rede = [
      lead.grau === 'DISTANCE_1' ? '1º grau' : '',
      lead.mutuos ? lead.mutuos + (Number(lead.mutuos) === 1 ? ' conexão em comum' : ' conexões em comum') : '',
      lead.conectadoEm ? 'conectados desde ' + lead.conectadoEm : ''
    ].filter(Boolean).join(' · ');

    return ['ORIGEM LH' + (lead.campanha ? ' · campanha: ' + lead.campanha : '') +
      (lead.operador ? ' · prospecção de ' + lead.operador : ''),
      lead.linkedin, lead.headline, rede,
      lead.oQueFazLa ? 'Faz lá: ' + lead.oQueFazLa : ''
    ].filter(Boolean).join('\n');
  }

  /* A conversa inteira entra no histórico — a pergunta da SDR e a resposta
     dele —, porque a resposta sozinha não se explica: "Sim, pode enviar o
     material" só quer dizer alguma coisa ao lado do que foi perguntado.

     Só as falas DELE viram evidência, e a dimensão sai das palavras que ele
     usou. Carimbar toda resposta de LinkedIn como evidência de "Problema" era
     dizer que o cliente admitiu um problema quando ele apenas respondeu: nota
     inventada é pior que campo vazio. Sem pista, a evidência entra sem
     dimensão — conta como sinal de vida do comprador, não como avanço. */
  function falasDoLead(lead) {
    if (lead.conversa && lead.conversa.length) return lead.conversa;
    if (lead.resposta) return [{ de: lead.nome, texto: lead.resposta, quando: lead.respostaEm, nosso: false }];
    return [];
  }

  function registrarTranscricaoDoLead(op, lead) {
    const conversa = mensagensNovas(op, falasDoLead(lead));
    if (!conversa.length) return conversa;

    const jaTinhaConversa = (op.eventos || []).some(function (e) {
      return e.tipo === 'sistema' && /Conversa no LinkedIn/.test(e.titulo || '');
    });

    const transcricao = conversa.map(function (m) {
      return (m.quando ? U.data(m.quando) + ' · ' : '') +
        (m.nosso ? (lead.operador || 'SDR') : (m.de || lead.nome || 'Prospect')) + ': ' + m.texto;
    }).join('\n');

    op.eventos.unshift({
      id: Store.uid('evt'), tipo: 'sistema',
      data: conversa[conversa.length - 1].quando || Store.hoje(),
      titulo: (jaTinhaConversa ? 'Continuação da conversa no LinkedIn com ' : 'Conversa no LinkedIn com ') +
        (lead.operador || 'a SDR') +
        ' (' + conversa.length + (conversa.length === 1 ? ' mensagem' : ' mensagens') + ')',
      detalhe: transcricao
    });
    Store.salvar();
    return conversa;
  }

  function registrarConversaDoLead(op, contato, lead) {
    const conversa = registrarTranscricaoDoLead(op, lead);
    if (!conversa.length) return conversa;

    const dele = conversa.filter(function (m) { return !m.nosso; });
    const ultima = dele[dele.length - 1];
    if (!ultima) return conversa;

    Store.registrarEvento(op.id, {
      tipo: 'decision', titulo: ultima.texto.slice(0, 160),
      dimensao: E.sugerirDimensao(ultima.texto) || '',
      forca: 'relato', contatoId: contato.id, canal: 'LinkedIn',
      data: ultima.quando || Store.hoje()
    });
    return conversa;
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

  /* O método na hora de fazer a tarefa, e não numa tela que ninguém abre.

     A pergunta da decisão, o que conta como evidência dela e o que fazer no
     canal escolhido — os três mudam junto com os dois selects logo acima.
     Escrever a teoria só no Playbook é escrever para quem já sabe: quem
     precisa dela está aqui, criando a tarefa, decidindo o que vai falar. */
  function ligarPainelDeMetodo(dlg) {
    const caixa = dlg.querySelector('[data-metodo]');
    const alvo = dlg.querySelector('[name="decisaoAlvo"]');
    const canal = dlg.querySelector('[name="tipo"]');
    if (!caixa || !alvo) return;

    /* Os canais do playbook são quatro; os tipos de tarefa são nove e o
       usuário cria os dele. O de-para leva cada tipo ao conselho mais
       próximo, e o que não tem correspondência cai no de e-mail, que é o
       mais genérico dos quatro. */
    const PARA_CANAL = {
      'WhatsApp': 'whatsapp', 'Telefonema': 'whatsapp', 'Reunião': 'whatsapp', 'Visita': 'whatsapp',
      'E-mail': 'email', 'Proposta': 'email', 'Apresentação': 'email',
      'LinkedIn': 'linkedin', 'Preparação': 'linkedin', 'Cobrar retorno': 'whatsapp'
    };

    const pintar = function () {
      const d = P.DIMENSOES.filter(function (x) { return x.id === alvo.value; })[0];
      if (!d) { caixa.innerHTML = ''; return; }
      const tipo = canal ? canal.value : '';
      const chave = PARA_CANAL[tipo] || 'email';
      const nomeCanal = (P.CANAIS.filter(function (c) { return c.id === chave; })[0] || {}).nome || '';
      caixa.innerHTML = '<div class="metodo-tarefa">' +
        '<span class="rotulo">Como esta tarefa faz ' + U.esc(d.nome) + ' andar</span>' +
        '<p class="pergunta">' + U.esc(d.pergunta) + '</p>' +
        (tipo ? '<p class="conselho"><strong>' + U.esc(tipo) + '</strong> — ' +
          U.esc(d.canais[chave]) + ' <em>(cadência de ' + U.esc(nomeCanal) + ')</em></p>' : '') +
        '<p class="conta"><strong>Conta como evidência:</strong> ' +
        U.esc(d.evidencias.slice(0, 3).join(' · ')) + '</p>' +
        '<p class="tiny muted">Para a nota 2 a evidência precisa ser confirmada ou documentada. ' +
        'O que nós fizemos — apresentar, propor, cobrar — não conta.</p>' +
        '</div>';
    };

    alvo.addEventListener('change', pintar);
    if (canal) canal.addEventListener('change', pintar);
    pintar();
  }

  /* O fecho de uma tarefa, venha ele do formulário de criar ou do de concluir.

     Tudo aqui é aditivo, e é essa a diferença: antes o vendedor tinha de
     escolher UM modo de contar — ata, ou perguntas, ou evidência — e quem
     tinha a ata E queria responder as perguntas não podia. Agora ele preenche
     o que tem, e o que estiver preenchido conta.

     O texto que vai para a IA é o que ele digitou MAIS o conteúdo dos
     documentos que anexou: a caixa de documentos escreve o texto de cada
     arquivo dentro do campo de relato, anunciado pelo nome do arquivo, e é
     esse conjunto que o assistente lê. São os documentos que trazem a
     informação — proposta, dossiê, planilha de consumo —, e ler só o que foi
     digitado seria jogar fora justamente a parte mais rica. */
  /* ---------- de quem é a tarefa: empresa e negociação ----------

     Toda tarefa pertence a uma negociação, e toda negociação pertence a uma
     empresa. A mesma empresa tem várias negociações abertas ao mesmo tempo —
     é o caso normal, não a exceção —, então uma lista única com todas as
     negociações da carteira faz o vendedor procurar agulha e escolher a
     errada. Empresa primeiro; a negociação sai da empresa escolhida.

     Quando a tarefa nasce de dentro de um negócio (cockpit, lacuna, plano),
     nada disso aparece: os dois já estão decididos e repetir a pergunta é
     ruído. Nesse caso o destino vira uma linha de contexto, para quem abriu o
     formulário conferir onde vai gravar. */
  const NOVO_NEGOCIO = '__novo__';

  function camposDeDestino(op, o) {
    if (op) {
      const conta = Store.conta(op.contaId);
      return [{ tipo: 'secao', rotulo: 'Onde vai gravar',
        ajuda: (conta ? conta.nome : 'sem empresa') + ' · ' + op.titulo }]
        .concat(camposDoContatoDaTarefa(op.contaId, o));
    }

    const contas = Store.dados().contas.slice().sort(function (a, b) {
      return String(a.nome).localeCompare(String(b.nome));
    });
    const padraoConta = o.contaId || (contas[0] ? contas[0].id : '');

    return [
      { tipo: 'secao', rotulo: 'A que negócio esta tarefa pertence',
        ajuda: 'Uma empresa pode ter várias negociações abertas. A tarefa entra em uma delas — é por ela que o avanço da decisão é contado.' },
      { id: 'contaId', rotulo: 'Empresa', tipo: 'select', padrao: padraoConta,
        opcoes: contas.length
          ? contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; })
          : [{ valor: '', rotulo: '— nenhuma empresa cadastrada —' }] },
      { id: 'oportunidadeId', rotulo: 'Negociação', tipo: 'select', padrao: o.oportunidadeId || '',
        opcoes: opcoesDeNegocio(padraoConta) },
      /* Só aparece quando a escolha é "nova". Sem este campo a negociação
         nascia com o nome da empresa, e o pipeline de quem tem três negócios
         na Marilan ficava com "Marilan" no meio de "Reúso da ETE" e "Água de
         processo" — o nome que menos ajuda a distinguir. */
      { id: 'negocioNovo', rotulo: 'Nome da nova negociação',
        placeholder: 'Reúso da ETE, Água de processo, Torre de resfriamento…' }
    ].concat(camposDoContatoDaTarefa(padraoConta, o));
  }

  /* Com quem é a tarefa. Faltava, e a falta era grave: sem a pessoa, a
     evidência que sai da conclusão nasce órfã, e é o contato que carrega o
     papel na compra — que é o que alimenta a cobertura do grupo comprador. A
     tarefa dizia em que negócio mexeu e não dizia com quem se falou.

     Fica logo abaixo do destino porque a pergunta é a mesma: onde isto
     acontece, e com quem. E traz a porta de cadastrar, porque a pessoa nova
     costuma aparecer justamente na tarefa em que ela apareceu. */
  function camposDoContatoDaTarefa(contaId, o) {
    return [
      { id: 'contatoId', rotulo: 'Com quem (contato)', tipo: 'select',
        padrao: (o && o.contatoId) || '', opcoes: opcoesDeContato(contaId) },
      { id: 'contatoNome', rotulo: 'Nome do novo contato' },
      { id: 'contatoCargo', rotulo: 'Cargo', largura: 'metade' },
      { id: 'contatoPapel', rotulo: 'Papel na compra', tipo: 'select', largura: 'metade', opcoes: P.PAPEIS },
      { id: 'contatoEmail', rotulo: 'E-mail', largura: 'metade' },
      { id: 'contatoTelefone', rotulo: 'Telefone / WhatsApp', largura: 'metade' }
    ];
  }

  /* O contato escolhido, ou o que acabou de ser digitado. Vincular ao grupo
     comprador é de propósito: quem participa de uma tarefa participa da
     compra, e deixar isso solto era o jeito de o grupo comprador ficar com
     0% de cobertura enquanto o vendedor conversava com meia empresa. */
  function contatoDaTarefa(op, d) {
    if (d.contatoId && d.contatoId !== NOVO_CONTATO) {
      const existente = Store.contato(d.contatoId);
      if (existente) { Store.vincularStakeholder(op, existente.id); Store.salvar(); }
      return existente || null;
    }
    if (d.contatoId !== NOVO_CONTATO || !d.contatoNome) return null;
    const novo = Store.criarContato({
      contaId: op.contaId, nome: d.contatoNome, cargo: d.contatoCargo || '',
      papel: d.contatoPapel || 'Usuário', email: d.contatoEmail || '',
      telefone: d.contatoTelefone || '', sentimento: 'neutro',
      perfil: 'nao_classificado', influencia: 2
    });
    Store.vincularStakeholder(op, novo.id);
    Store.salvar();
    return novo;
  }

  /* Duas ligações: quando não há negócio fixo, a lista de pessoas segue a
     empresa escolhida (senão a tarefa nasce com o contato de outra conta);
     e em qualquer caso os campos do contato novo só aparecem quando alguém
     escolhe cadastrar. */
  function ligarContatoDaTarefa(dlg) {
    const contato = dlg.querySelector('[name="contatoId"]');
    if (!contato) return;
    if (dlg.querySelector('[name="contaId"]')) { ligarContatoDaEmpresa(dlg); return; }
    const ajustar = function () {
      U.mostrarCampos(dlg, CAMPOS_CONTATO_NOVO, contato.value === NOVO_CONTATO);
    };
    contato.addEventListener('change', ajustar);
    ajustar();
  }

  /* Só as negociações abertas da empresa escolhida, mais a saída de abrir uma
     nova: a tarefa que inaugura um negócio é comum — o cliente ligou pedindo
     outra coisa — e obrigar a sair da tela para cadastrar antes é o tipo de
     desvio em que a tarefa não é registrada. */
  function opcoesDeNegocio(contaId) {
    const abertas = Store.dados().oportunidades.filter(function (x) {
      return x.contaId === contaId && !x.desfecho;
    });
    return abertas.map(function (x) {
      return { valor: x.id, rotulo: x.titulo + ' · ' + U.moeda(x.valor) + ' · ' + x.etapa };
    }).concat([{ valor: NOVO_NEGOCIO, rotulo: '+ Nova negociação nesta empresa…' }]);
  }

  function ligarEmpresaENegocio(dlg) {
    const conta = dlg.querySelector('[name="contaId"]');
    const negocio = dlg.querySelector('[name="oportunidadeId"]');
    if (!conta || !negocio) return;

    const ajustarNome = function () {
      U.mostrarCampos(dlg, ['negocioNovo'], negocio.value === NOVO_NEGOCIO);
    };
    const pintar = function () {
      negocio.innerHTML = opcoesDeNegocio(conta.value).map(function (x) {
        return '<option value="' + U.esc(x.valor) + '">' + U.esc(x.rotulo) + '</option>';
      }).join('');
      ajustarNome();
    };
    conta.addEventListener('change', pintar);
    negocio.addEventListener('change', ajustarNome);
    pintar();
  }

  /* Devolve o negócio onde a tarefa vai entrar — criando-o quando o vendedor
     escolheu "nova negociação". Devolve null quando não dá para decidir, e aí
     quem chamou não grava nada: tarefa órfã não aparece em lugar nenhum. */
  function resolverNegocioDaTarefa(d) {
    if (d.oportunidadeId && d.oportunidadeId !== NOVO_NEGOCIO) {
      return Store.oportunidade(d.oportunidadeId);
    }
    const conta = Store.conta(d.contaId);
    if (!conta) {
      alert('Escolha a empresa da negociação. Se ela ainda não existe, cadastre em Cadastros → Empresas.');
      return null;
    }
    /* Nasce em Prospecção com o nome que o vendedor deu; sem nome, o da
       empresa, que ao menos não fica em branco. Valor e etapa se corrigem no
       cockpit em dois cliques e não valem uma pergunta aqui — quem está
       criando uma tarefa está com pressa. */
    return Store.criarOportunidade({
      contaId: conta.id, titulo: (d.negocioNovo || '').trim() || conta.nome, etapa: 'Prospecção'
    });
  }

  function concluirComOQueAconteceu(op, tarefaId, d, docs, dimensaoAlvo, aoTerminar) {
    const quando = d.feitaEm || Store.hoje();
    const temRelato = !!(d.relato && d.relato.length >= 60);

    Store.concluirTarefa(tarefaId, quando, temRelato);
    /* O contexto da tarefa viaja junto até a leitura. A IA lia a ata sem saber
       que aquilo era "Visita com a Aline Prado mirando Impacto" — e essa é
       exatamente a informação que separa uma leitura genérica de uma leitura
       que sabe o que procurar. */
    const oQueEra = Store.tarefa(tarefaId);
    const comQuem = oQueEra && oQueEra.contatoId ? Store.contato(oQueEra.contatoId) : null;
    tarefaEmCurso = {
      tarefaId: tarefaId,
      tipoTarefa: d.tipo || '',
      titulo: oQueEra ? oQueEra.titulo : '',
      descricao: oQueEra ? (oQueEra.descricao || '') : '',
      decisaoAlvo: dimensaoAlvo || '',
      contato: comQuem ? comQuem.nome + (comQuem.cargo ? ' — ' + comQuem.cargo : '') : '',
      quando: quando
    };
    const encerrar = function () {
      tarefaEmCurso = null;
      if (aoTerminar) aoTerminar();
    };

    /* As perguntas entram antes da leitura da ata: assim a releitura das oito
       — que acontece no fim — já enxerga as evidências que elas produziram. */
    const respondidas = gravarPerguntasDoFim(op, d, quando);
    registrarFechamento(op, d, temRelato ? null : docs);

    const depois = function () {
      if (d.evidenciaDireta === 'sim') {
        App.novaEvidencia(op.id, null, dimensaoAlvo, { canal: d.tipo, data: quando }, encerrar);
        return;
      }
      encerrar();
    };

    if (temRelato) {
      /* processarReuniao anexa os documentos, aplica as evidências e relê as
         oito. A evidência direta espera o fim disso para não abrir por cima. */
      App.processarReuniao(op.id, d.relato, true, docs, depois);
      return;
    }
    if (d.relato) {
      alert('Texto curto demais para eu separar evidências. A tarefa, os documentos e o resto foram gravados.');
    }
    render();
    if (respondidas) { relerAsOito(op.id, '', { evidencias: respondidas }, depois); return; }
    depois();
  }

  /* As quatro perguntas fechadas do fim de reunião. Cada "sim" vira evidência
     do cliente na dimensão da pergunta — sem digitação, que é o ponto: quem
     acabou a visita responde quatro selects, não escreve uma ata.

     A nota não sobe aqui de propósito. Evidência é o que aconteceu; nota é
     quanto a decisão amadureceu, e continua sendo escolha de quem esteve lá. */
  function gravarPerguntasDoFim(op, d, quando) {
    let n = 0;
    P.FECHAMENTO_REUNIAO.forEach(function (q) {
      if (d['q_' + q.id] !== 'sim') return;
      Store.registrarEvento(op.id, {
        tipo: 'decision', titulo: q.evidencia, dimensao: q.id,
        forca: q.forca, canal: d.tipo || 'Reunião', data: quando || Store.hoje()
      });
      n++;
    });
    return n;
  }

  /* Com evidência nova gravada, as oito são relidas sobre o retrato
     atualizado. Vale para a ata e vale para as quatro perguntas: sem isto, o
     caminho sem digitação gravava a evidência e deixava o índice parado —
     e quem respondeu "sim, entrou alguém novo" vai olhar o mapa esperando
     ver Stakeholders andar. */
  function relerAsOito(opId, textoExtra, jaFeito, depois) {
    const base = jaFeito || {};
    const atual = Store.oportunidade(opId);
    if (!IA.disponivel() || !atual) {
      if (base.evidencias || base.pessoas) mostrarResumo(opId, base, [], [], depois);
      else if (depois) depois();
      return;
    }
    IA.sugerirNotas(atual, E.resumo(atual), textoExtra || '').then(function (resp) {
      const decisoes = (resp && resp.decisoes) || [];
      const mudancas = aplicarNotasDaIA(opId, decisoes);
      render();
      /* Falhar na releitura não apaga o que já entrou: as evidências e o que
         mudou no negócio estão gravados, e é isso que o resumo mostra — com o
         motivo da releitura não ter acontecido. */
      mostrarResumo(opId, base, mudancas, decisoes, depois,
        (resp && resp.erro) ? resp.erro : '');
    });
  }

  /* O que o material disse sobre o NEGÓCIO: valor, etapa, previsão,
     concorrentes. Uma proposta anexada tem o preço lá dentro — deixar o
     vendedor redigitar isso é pedir que o pipeline do dono da empresa fique
     desatualizado, que era exatamente o caso.

     Duas travas, o mesmo espírito das notas:

     · a etapa só AVANÇA. Uma ata que menciona a proposta enviada não pode
       jogar de volta para Prospecção um negócio que já está em Validação;
     · nada entra sem o trecho literal que sustenta — o servidor já descarta
       valor e etapa sem citação.

     E avançar para Proposta NÃO é passar por cima do Proposal Gate: o gate
     continua gritando "0% de prontidão" no cockpit, que é o sinal útil. Ele
     existe para dizer que a proposta foi precoce, não para impedir o app de
     registrar que ela existe. */
  /* Completar o que está em branco, e só isso. A regra vale para a empresa e
     para as pessoas, e é o que torna seguro deixar a IA escrever na ficha:
     ela preenche buraco, nunca corrige quem digitou. Devolve se mexeu. */
  function completarEmBranco(registro, novos) {
    let mexeu = false;
    Object.keys(novos || {}).forEach(function (k) {
      const valor = novos[k];
      if (!valor) return;
      if (registro[k] && String(registro[k]).trim()) return;
      registro[k] = valor;
      mexeu = true;
    });
    return mexeu;
  }

  /* A ficha da empresa, alimentada pelo que a reunião revelou. Uma ata de
     uma hora costuma dizer quantas plantas o cliente tem, onde ficam, o que
     ele produz e o que ele precisa resolver — e tudo isso ia embora com o
     texto. Agora fica na conta, que é onde a próxima pessoa vai procurar. */
  function aplicarFichaDaEmpresa(contaId, ficha) {
    const conta = Store.conta(contaId);
    if (!conta || !ficha) return [];
    const antes = {};
    Object.keys(ficha).forEach(function (k) { antes[k] = conta[k]; });
    if (!completarEmBranco(conta, ficha)) return [];
    Store.salvar();
    const ROTULO = { descricao: 'O que a empresa faz', necessidades: 'Necessidades',
      porte: 'Porte', cidade: 'Cidade', uf: 'UF', site: 'Site',
      telefone: 'Telefone', cnpj: 'CNPJ' };
    return Object.keys(ficha).filter(function (k) {
      return !antes[k] && conta[k];
    }).map(function (k) {
      return { campo: ROTULO[k] || k, de: 'em branco',
        para: String(conta[k]).slice(0, 120), trecho: '' };
    });
  }

  function aplicarNegocioDaIA(opId, negocio) {
    const n = negocio || {};
    const op = Store.oportunidade(opId);
    if (!op) return [];
    const mudancas = [];
    const alteracoes = {};

    if (n.valor > 0 && n.valor !== op.valor) {
      alteracoes.valor = n.valor;
      mudancas.push({ campo: 'Valor', de: U.moeda(op.valor || 0), para: U.moeda(n.valor),
        trecho: n.valorFrase || '' });
    }

    if (n.etapa && n.etapa !== op.etapa) {
      const ordem = P.ETAPAS.indexOf(n.etapa);
      const atual = P.ETAPAS.indexOf(op.etapa);
      if (ordem > atual) {
        alteracoes.etapa = n.etapa;
        mudancas.push({ campo: 'Etapa no CRM', de: op.etapa, para: n.etapa,
          trecho: n.etapaFrase || '' });
      }
    }

    if (n.previsao && n.previsao !== op.fechamentoPrevisto) {
      alteracoes.fechamentoPrevisto = n.previsao;
      mudancas.push({ campo: 'Fechamento previsto',
        de: op.fechamentoPrevisto ? U.data(op.fechamentoPrevisto) : 'sem data',
        para: U.data(n.previsao), trecho: '' });
    }

    /* Concorrente novo soma ao que já estava: quem apareceu antes não some. */
    if (n.concorrentes) {
      const tem = String(op.concorrentes || '').toLowerCase();
      const novos = String(n.concorrentes).split(/[,;]/).map(function (x) { return x.trim(); })
        .filter(function (x) { return x && tem.indexOf(x.toLowerCase()) === -1; });
      if (novos.length) {
        alteracoes.concorrentes = [op.concorrentes, novos.join(', ')].filter(Boolean).join(', ');
        mudancas.push({ campo: 'Concorrentes', de: op.concorrentes || 'nenhum',
          para: alteracoes.concorrentes, trecho: '' });
      }
    }

    if (Object.keys(alteracoes).length) Store.atualizarOportunidade(opId, alteracoes);
    return mudancas;
  }

  /* Aplica as notas propostas. Duas travas, e as duas são do motor, não da
     tela: nota 2 sem evidência confirmada ou documentada cai para 1; e nota
     nunca desce sozinha — a IA relê o mesmo retrato a cada tarefa e propor 0
     para uma decisão que alguém pontuou à mão apagaria esse trabalho sem
     ninguém ver. Devolve o que mudou, para o relatório. */
  /* Qual tarefa está sendo concluída agora. A releitura das oito acontece duas
     ou três chamadas adiante — depois de anexar documentos e de a IA responder
     —, e o caminho entre aqui e lá é uma cadeia de callbacks com assinaturas
     que outras telas também usam. Em vez de alargar todas elas, o fluxo (que é
     modal, um de cada vez) deixa a origem anotada aqui e limpa no fim. */
  let tarefaEmCurso = null;

  function aplicarNotasDaIA(opId, decisoes) {
    const mudancas = [];
    (decisoes || []).forEach(function (proposta) {
      const d = P.DIMENSOES.filter(function (x) { return x.id === proposta.dimensao; })[0];
      if (!d) return;
      const alvo = Store.oportunidade(opId);
      const atual = alvo.dims[d.id] || 0;
      const pedida = Number(proposta.nota);
      if (!(pedida >= 0 && pedida <= 2)) return;

      const travada = (pedida === 2 && !E.podeComprovar(alvo, d.id));
      const permitida = travada ? Math.max(1, atual) : pedida;
      if (permitida <= atual) return;                        /* só sobe */

      Store.pontuar(opId, d.id, permitida, 'Lido pelo assistente na conclusão da tarefa', tarefaEmCurso);
      mudancas.push({ nome: d.nome, de: atual, para: permitida,
        travada: travada, porque: proposta.porque || '', trecho: proposta.trecho || '' });
    });
    return mudancas;
  }

  /* O relatório do que entrou. Não é uma tela de conferência: não há nada
     para marcar. Fica a porta de ajuste, para quem discordar. */
  function mostrarResumo(opId, base, mudancas, decisoes, depois, erroDaReleitura) {
    const op = Store.oportunidade(opId);
    const mexeuNoNegocio = (base.negocio || []).length + (base.empresa || []).length + (base.completados || 0);
    if (!op || (!base.evidencias && !base.pessoas && !mudancas.length && !mexeuNoNegocio && !erroDaReleitura)) {
      if (depois) depois();
      return;
    }
    const dlg = document.createElement('dialog');
    dlg.className = 'revisao-ia';
    dlg.innerHTML = V.resumoDaLeitura(op, base, mudancas, erroDaReleitura);
    document.body.appendChild(dlg);
    dlg.addEventListener('close', function () {
      const escolha = dlg.returnValue;
      dlg.remove();
      /* Quando a releitura falhou não há proposta nenhuma para ajustar: abrir
         a tela das oito ali mostrava "0 → 0" nas oito e "Gravar as notas" não
         gravava nada — um beco sem saída que parecia defeito. O botão passa a
         ser "Tentar de novo", que é o que a pessoa quer. */
      if (escolha === 'tentar') { relerAsOito(opId, '', {}, depois); return; }
      /* Discordar é a única coisa que ainda pede um clique — e é a tela que
         já existia, com as oito e o motivo de cada uma. */
      if (escolha === 'ajustar') { App.revisarNotas(opId, decisoes || []); return; }
      if (depois) depois();
    });
    dlg.showModal();
  }

  /* O que a pessoa acabou de informar ao fechar uma tarefa — o compromisso e
     os documentos — não depende da IA e grava primeiro. Se o assistente
     estiver fora do ar, ou o texto for curto demais, isto já está salvo. */
  function registrarFechamento(op, d, docs) {
    if (d.compromissoData) {
      Store.registrarEvento(op.id, {
        tipo: 'activity', titulo: 'Próximo passo combinado', canal: 'Reunião',
        data: d.feitaEm || Store.hoje(),
        compromisso: {
          texto: d.compromissoTexto || 'Próximo passo combinado',
          data: d.compromissoData, dono: d.compromissoDono || 'cliente'
        }
      });
    }
    anexarAoRegistro(docs, { oportunidadeId: op.id, contaId: op.contaId,
      categoria: 'Ata de reunião' });
  }

  /* O que foi carregado para a IA ler fica anexado ao registro. É o que o
     vendedor espera: ele carregou a proposta uma vez, ela tem de continuar
     ali. Falhar aqui não desfaz o cadastro — o registro já está salvo, e
     perder o anexo é menos grave do que perder a empresa. */
  function anexarAoRegistro(docs, alvo) {
    if (!docs || !docs.length || !Arq.disponivel()) return;
    docs.forEach(function (d) {
      if (!d.arquivo) return;
      Arq.salvar(d.arquivo, alvo).catch(function () {});
    });
  }

  /* As pessoas que o vendedor marcou na caixa do assistente viram contatos da
     conta. Nascem com papel e influência neutros de propósito: quem decide se
     alguém é o econômico ou o técnico é quem conversou com a pessoa, e chutar
     isso encheria a cobertura do grupo comprador de certeza falsa — que é
     justamente o que este CRM existe para não fazer.

     Repetido não entra: o mesmo dossiê analisado duas vezes não pode duplicar
     a Aline. */
  function criarContatosPropostos(contaId, pessoas) {
    if (!contaId || !pessoas || !pessoas.length) return 0;
    const chave = function (t) {
      return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    };
    const existentes = Store.contatosDaConta(contaId).map(function (c) { return chave(c.nome); });
    let n = 0;
    pessoas.forEach(function (p) {
      if (!p || !p.nome || existentes.indexOf(chave(p.nome)) !== -1) return;
      Store.criarContato({
        contaId: contaId,
        nome: p.nome,
        cargo: p.cargo || p.area || '',
        email: p.email || '',
        telefone: p.telefone || ''
      });
      existentes.push(chave(p.nome));
      n++;
    });
    return n;
  }

  const NOVA_CONTA = '__nova_empresa__';

  /* Depois de a IA ler o material, a empresa que ela achou já existe ou não.
     Existindo, escolhemos — o vendedor não precisa procurar num select o nome
     que ele acabou de ver na tela. Não existindo, oferecemos cadastrar junto,
     com a ficha que ela montou. É o gesto único que o vendedor pediu: um
     documento vira negócio, empresa e pessoas de uma vez.

     Oferecemos, não fazemos: a empresa só nasce se a caixa ficar marcada. */
  function resolverEmpresaDaIA(dlg, r, contas) {
    const caixa = dlg.querySelector('[data-empresa-ia]');
    if (!caixa) return;
    const ficha = r.empresa || {};
    const nome = String(ficha.nome || (r.campos && r.campos.empresaNova) || '').trim();
    dlg.empresaNovaIA = null;
    if (!nome) { caixa.innerHTML = ''; return; }

    const chave = function (t) {
      return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]/g, '');
    };
    const alvo = chave(nome);
    const achada = contas.find(function (c) {
      const k = chave(c.nome);
      return k === alvo || (k.length >= 4 && alvo.length >= 4 && (k.indexOf(alvo) === 0 || alvo.indexOf(k) === 0));
    });

    const sel = dlg.querySelector('[name="contaId"]');
    if (achada) {
      if (sel) sel.value = achada.id;
      caixa.innerHTML = '<p class="achou-empresa">Empresa reconhecida: <strong>' +
        U.esc(achada.nome) + '</strong> — já cadastrada, e já escolhida acima.</p>';
      return;
    }

    dlg.empresaNovaIA = Object.assign({}, ficha, { nome: nome });

    /* O select TEM de sair de cima da empresa que estava escolhida. Ele nasce
       na primeira da lista, e sem esta linha a tela dizia "Supermercados Mambo
       ainda não está cadastrada" logo acima de um campo Empresa mostrando
       "Marilan – Marília" — e o negócio nascia na Marilan. Duas afirmações
       contraditórias na mesma tela, e a errada era a que valia. */
    if (sel) sel.value = NOVA_CONTA;

    const detalhe = [ficha.cidade, ficha.uf, ficha.cnpj, ficha.segmento].filter(Boolean).join(' · ');
    caixa.innerHTML = '<label class="empresa-nova-ia">' +
      '<input type="checkbox" checked data-cria-empresa>' +
      '<span><strong>' + U.esc(nome) + '</strong> ainda não está cadastrada — cadastrar junto com o negócio.' +
      (detalhe ? '<em>' + U.esc(detalhe) + '</em>' : '') + '</span></label>';
    const marca = caixa.querySelector('[data-cria-empresa]');
    marca.addEventListener('change', function () {
      dlg.empresaNovaIA = marca.checked ? Object.assign({}, ficha, { nome: nome }) : null;
    });
  }

  /* O que já está digitado, para reabrir o formulário sem perder nada. Lê o
     que está na tela, não o que foi passado ao abrir: a pessoa pode ter
     mudado tudo antes de perceber que faltava a empresa. */
  function valoresDoFormulario(dlg, campos) {
    const v = {};
    campos.forEach(function (c) {
      if (!c.id || c.tipo === 'ia') return;
      /* Escolha múltipla não tem [name]: sem esta linha, ir cadastrar a
         empresa no meio do formulário apagava os produtos já marcados. */
      if (c.tipo === 'multi') {
        const caixa = dlg.querySelector('[data-multi="' + c.id + '"]');
        if (!caixa) return;
        const marcados = Array.prototype.filter.call(caixa.querySelectorAll('input[type="checkbox"]'),
          function (x) { return x.checked; }).map(function (x) { return x.value; });
        if (marcados.length) v[c.id] = marcados;
        return;
      }
      const el = dlg.querySelector('[name="' + c.id + '"]');
      if (el && el.value && el.value !== NOVA_CONTA) v[c.id] = el.value;
    });
    return v;
  }

  function podeMexerEmProduto() {
    if (A.ehGestor()) return true;
    alert('Produtos são do catálogo da empresa — só o gestor cadastra e edita.\n\n' +
      'Contas, contatos e oportunidades você cria normalmente.');
    return false;
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

  /* A conta nasce carimbada com a empresa de quem está trabalhando e com o
     dono — isso o Store já fazia. O que faltava era estar escrito na tela:
     num sistema multiempresa, cadastrar sem saber em qual empresa a coisa vai
     cair é como assinar sem ler. */
  function ondeVaiCair() {
    const N = global.IADNuvem;
    const perfil = N.estado().perfil || {};
    const eu = A.atual() || {};
    const empresa = (perfil.tenants && perfil.tenants.nome) ||
      (Store.tenant && Store.tenant(eu.tenantId) && Store.tenant(eu.tenantId).nome) || '';
    const quem = perfil.nome || eu.nome || '';
    if (!empresa && !quem) return null;
    return { tipo: 'aviso',
      rotulo: 'Vai para ' + (empresa || 'a sua empresa') +
        (quem ? ', no nome de ' + quem : '') + '.' };
  }

  function camposConta() {
    const segmentos = Store.nomesDoCatalogo('segmentos');
    const campos = [
      { id: 'atalhoConta', tipo: 'ia', extrair: 'conta',
        rotulo: 'Cole, dite ou carregue o que você já sabe da empresa',
        placeholder: 'Cole aqui um e-mail, um trecho do site, o perfil do LinkedIn — ou carregue a proposta, a planilha de consumo, o edital. A IA lê tudo junto.',
        /* Prospect, cliente ou ex-cliente é fato comercial nosso — não sai de texto. */
        nunca: ['relacaoAtual'],
        contexto: function () { return IA.contextoDaConta(null); } }
    ];

    const onde = ondeVaiCair();
    if (onde) campos.push(onde);

    return campos.concat([
      { tipo: 'secao', rotulo: 'Identificação' },
      { id: 'nome', rotulo: 'Empresa (nome fantasia)' },
      { id: 'razaoSocial', rotulo: 'Razão social', largura: 'metade' },
      { id: 'cnpj', rotulo: 'CNPJ', largura: 'metade' },

      /* A IA escolhe o segmento de uma lista fechada — a desta empresa. Ela não
         inventa "Alimentos" se "Alimentos" não estiver cadastrado, e é por isso
         que o campo fica vazio em sistema recém-instalado: não há de onde
         escolher. Dizer isso vale mais que explicar a arquitetura. */
      { tipo: 'secao', rotulo: 'Classificação',
        ajuda: segmentos.length
          ? 'A IA escolhe entre os ' + segmentos.length + ' segmentos da sua empresa.'
          : 'Sua empresa ainda não tem segmentos cadastrados — por isso a IA não preenche este campo. Cadastre em Cadastros → Segmentos.' },
      { id: 'segmento', rotulo: 'Segmento', tipo: 'select', largura: 'metade',
        opcoes: [{ valor: '', rotulo: '— sem segmento —' }]
          .concat(segmentos.map(function (n) { return { valor: n, rotulo: n }; })) },
      { id: 'relacaoAtual', rotulo: 'Relação atual', tipo: 'select', largura: 'metade',
        opcoes: P.RELACOES_CONTA },
      /* Setor saiu da ficha: repetia o segmento aos olhos de quem preenche, e
         campo que parece repetido é campo que fica vazio. O setor que o Linked
         Helper traz continua sendo usado — como sinal para a IA escolher o
         segmento, que é onde ele de fato serve, e não como mais uma caixa. */
      { id: 'porte', rotulo: 'Porte (faturamento ou funcionários)', largura: 'metade' },

      { tipo: 'secao', rotulo: 'Onde fica e como falar' },
      { id: 'cidade', rotulo: 'Cidade', largura: 'metade' },
      { id: 'uf', rotulo: 'UF', largura: 'metade' },
      { id: 'pais', rotulo: 'País', largura: 'metade', placeholder: 'Brasil' },
      { id: 'telefone', rotulo: 'Telefone', largura: 'metade' },
      { id: 'site', rotulo: 'Site', largura: 'metade' },
      { id: 'linkedin', rotulo: 'LinkedIn da empresa', largura: 'metade',
        placeholder: 'linkedin.com/company/...' },

      { tipo: 'secao', rotulo: 'O que ela faz e do que precisa',
        ajuda: 'A descrição é de onde a IA tira o segmento. As necessidades são o que você lê antes de ligar.' },
      { id: 'descricao', rotulo: 'Descrição', tipo: 'textarea',
        placeholder: 'O que a empresa produz, para quem vende, onde opera.' },
      { id: 'necessidades', rotulo: 'Necessidades e dores', tipo: 'textarea',
        placeholder: 'O gargalo, a exigência, o prazo — com os números que aparecerem.' }
    ]);
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

  const NOVO_CONTATO = '__novo_contato__';

  /* Os contatos de UMA empresa, mais a saída de cadastrar um na hora. Quem
     está abrindo a oportunidade acabou de falar com alguém; mandar cadastrar
     a pessoa em outra tela antes é o desvio em que o contato não é
     cadastrado — e negócio sem contato nasce com o grupo comprador vazio,
     que é o alarme mais barulhento e mais inútil do app. */
  function opcoesDeContato(contaId) {
    const pessoas = contaId ? Store.contatosDaConta(contaId) : [];
    return [{ valor: '', rotulo: pessoas.length ? '— escolher depois —' : '— nenhum contato nesta empresa —' }]
      .concat(pessoas.map(function (c) {
        return { valor: c.id, rotulo: c.nome + (c.cargo ? ' — ' + c.cargo : '') };
      }))
      .concat([{ valor: NOVO_CONTATO, rotulo: '+ Cadastrar novo contato…' }]);
  }

  const CAMPOS_CONTATO_NOVO = ['contatoNome', 'contatoCargo', 'contatoEmail', 'contatoTelefone', 'contatoPapel'];

  function ligarContatoDaEmpresa(dlg) {
    const conta = dlg.querySelector('[name="contaId"]');
    const contato = dlg.querySelector('[name="contatoId"]');
    if (!conta || !contato) return;

    const ajustarNovo = function () {
      U.mostrarCampos(dlg, CAMPOS_CONTATO_NOVO, contato.value === NOVO_CONTATO);
    };
    const pintar = function () {
      /* Empresa nova ainda não tem id, e portanto não tem contatos: o campo
         vira só a porta de cadastrar. */
      const alvo = (conta.value && conta.value !== NOVA_CONTA) ? conta.value : '';
      contato.innerHTML = opcoesDeContato(alvo).map(function (x) {
        return '<option value="' + U.esc(x.valor) + '">' + U.esc(x.rotulo) + '</option>';
      }).join('');
      ajustarNovo();
    };
    conta.addEventListener('change', pintar);
    contato.addEventListener('change', ajustarNovo);
    pintar();
  }

  /* O que o vendedor escolheu vira item da oportunidade. Quantidade 1 e preço
     de referência: a negociação do preço acontece depois, e chutar quantidade
     aqui seria inventar. O valor do negócio só é preenchido quando estava
     zerado — se a pessoa digitou um valor, ele vence a soma do catálogo. */
  function aplicarItens(op, ids) {
    const escolhidos = (ids || []).filter(Boolean);
    if (!escolhidos.length) return 0;
    op.itens = escolhidos.map(function (id) {
      const p = Store.produto(id);
      return { produtoId: id, quantidade: 1, precoUnitario: p ? (p.precoReferencia || 0) : 0 };
    });
    if (!op.valor) {
      op.valor = op.itens.reduce(function (soma, i) { return soma + (i.precoUnitario || 0); }, 0);
    }
    Store.salvar();
    return op.itens.length;
  }

  /* Cria o contato que o vendedor digitou no próprio formulário e o vincula
     ao grupo comprador. Devolve o contato, ou null quando não havia nada
     para criar. */
  function criarContatoDoFormulario(contaId, op, d) {
    if (d.contatoId && d.contatoId !== NOVO_CONTATO) {
      if (op) Store.vincularStakeholder(op, d.contatoId);
      return null;
    }
    if (d.contatoId !== NOVO_CONTATO || !String(d.contatoNome || '').trim()) return null;
    const novo = Store.criarContato({
      contaId: contaId, nome: d.contatoNome.trim(), cargo: d.contatoCargo || '',
      email: d.contatoEmail || '', telefone: d.contatoTelefone || '',
      papel: d.contatoPapel || 'Usuário'
    });
    if (op) Store.vincularStakeholder(op, novo.id);
    return novo;
  }

  /* Produtos e serviços são catálogo da empresa, não do dia: mexer no preço
     de referência muda o valor de toda oportunidade que usar o item. Por isso
     o vendedor ESCOLHE aqui e só o gestor cadastra, em Cadastros → Produtos.
     A regra já vale na tela de cadastro e nas ações; aqui a mensagem apenas
     diz onde ela está, para quem não achar o que precisa. */
  function campoDeProdutos(padrao) {
    const produtos = Store.catalogoAtivos('produtos');
    const gestor = A.ehGestor();
    return {
      id: 'produtoIds', tipo: 'multi', rotulo: 'Produtos e serviços desta oportunidade',
      padrao: padrao || [],
      ajuda: produtos.length
        ? 'Escolha quantos quiser. O valor do negócio é somado dos preços de referência quando você deixa o campo Valor em branco.'
        : '',
      vazio: gestor
        ? 'Nenhum produto cadastrado. Cadastre em Cadastros → Produtos.'
        : 'Nenhum produto cadastrado. Só o gestor da sua empresa cadastra produtos e serviços — peça a ele.',
      opcoes: produtos.map(function (p) {
        return {
          valor: p.id,
          rotulo: p.nome,
          nota: [p.categoria, p.unidade, p.precoReferencia ? U.moeda(p.precoReferencia) : '']
            .filter(Boolean).join(' · ')
        };
      })
    };
  }

  function camposOportunidade(contas, contaPadrao, opcoes) {
    const o = opcoes || {};
    const contaInicial = contaPadrao || (contas[0] && contas[0].id) || '';
    const base = [
      { id: 'atalhoOp', tipo: 'ia', extrair: 'oportunidade',
        rotulo: 'Cole, dite ou carregue o que você tem sobre este negócio',
        placeholder: 'Ata da reunião, proposta, e-mail, planilha de consumo — a IA lê tudo e monta o negócio, a empresa e as pessoas de uma vez.',
        /* Valor, etapa e fechamento previsto são o pipeline e o diagnóstico.
           Se a IA mexer na etapa, ela apaga o alerta de "falso avançado". */
        nunca: ['valor', 'etapa', 'fechamentoPrevisto'],
        contexto: function () { return IA.contextoDaConta(contaPadrao); },
        aoAplicar: function (dlg, r) { resolverEmpresaDaIA(dlg, r, contas); } },
      { id: 'titulo', rotulo: 'Título' },
      { tipo: 'slot', slot: 'empresa-ia' },
      /* A opção de cadastrar vem sempre, e primeiro quando não há nenhuma:
         é a única coisa útil a fazer ali naquele momento. */
      { id: 'contaId', rotulo: 'Empresa', tipo: 'select',
        padrao: contaInicial,
        opcoes: (contas.length ? [] : [{ valor: '', rotulo: '— nenhuma empresa cadastrada ainda —' }])
          .concat(contas.map(function (c) { return { valor: c.id, rotulo: c.nome }; }))
          .concat([{ valor: NOVA_CONTA, rotulo: '+ Cadastrar nova empresa…' }]) }
    ];

    /* Na edição o contato não aparece: quem já tem negócio tem grupo
       comprador, e ele se mexe no cockpit, onde cada pessoa tem papel,
       influência e perfil. Repetir aqui daria duas verdades sobre a mesma
       coisa. */
    const doContato = o.edicao ? [] : [
      { id: 'contatoId', rotulo: 'Contato', tipo: 'select', opcoes: opcoesDeContato(contaInicial) },
      { id: 'contatoNome', rotulo: 'Nome do novo contato' },
      { id: 'contatoCargo', rotulo: 'Cargo', largura: 'metade' },
      { id: 'contatoPapel', rotulo: 'Papel na compra', tipo: 'select', largura: 'metade', opcoes: P.PAPEIS },
      { id: 'contatoEmail', rotulo: 'E-mail', largura: 'metade' },
      { id: 'contatoTelefone', rotulo: 'Telefone / WhatsApp', largura: 'metade' }
    ];

    return base.concat(doContato).concat([
      campoDeProdutos(o.produtoIds),
      { id: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda' },
      { id: 'etapa', rotulo: 'Etapa CRM', tipo: 'select', opcoes: P.ETAPAS },
      { id: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: P.TIPOS_OPORTUNIDADE },
      { id: 'fechamentoPrevisto', rotulo: 'Fechamento previsto', tipo: 'date',
        padrao: Store.daquiADias(Store.PRAZO_PADRAO_DE_FECHAMENTO) },
      { id: 'concorrentes', rotulo: 'Concorrentes (inclusive “não fazer nada”)' }
    ]);
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

    /* Antes de tudo: quem chega pelo link do e-mail já vem autenticado, e
       precisa ser reconhecido antes que a tela de login apareça. Só depois
       disso é que vale ler o perfil no servidor — a leitura depende da sessão
       que a linha de cima acabou de criar. */
    let chegouPeloLink = '';
    adotarCredencialDoEndereco().then(function (nome) {
      chegouPeloLink = nome;
      /* Esperar o perfil evita o pisca-pisca: sem isso a tela de login apareceria
         por um instante para alguém que acabou de entrar. */
      return atualizarPerfilDaNuvem();
    }).then(function () {
      return A.garantirAdministrador();
    }).then(function (adm) {
      render();
      if (chegouPeloLink) pedirSenhaNova(chegouPeloLink.trim());
      /* A senha sorteada aparece uma vez, aqui, porque não existe em lugar
         nenhum além deste aparelho: se ninguém anotar, ninguém entra. */
      if (adm && adm.senhaInicial) {
        alert('Este aparelho ainda não tinha administrador, então criei um.\n\n' +
          'Login: Adm\nSenha: ' + adm.senhaInicial + '\n\n' +
          'Anote agora — esta senha não aparece de novo. Troque-a no primeiro acesso.');
      }
    }).catch(function (e) {
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
