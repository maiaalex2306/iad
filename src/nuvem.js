/* Nuvem: Supabase como banco compartilhado, sem biblioteca.

   Estratégia deliberada: o app continua trabalhando com a cópia local, que é
   síncrona e funciona offline; a nuvem entra como sincronização — puxa ao entrar
   e empurra ao salvar. Isso mantém todo o resto do código como está, e o app
   continua abrindo sem internet, com o que foi sincronizado por último.

   O isolamento por empresa não depende deste arquivo: está nas políticas RLS do
   banco (nuvem/schema.sql). Aqui só mandamos o pedido; quem recusa é o Postgres. */
(function (global) {
  'use strict';

  const Store = global.IADStore;
  const CHAVE_CONFIG = 'iad-crm:nuvem:v1';
  const CHAVE_SESSAO = 'iad-crm:nuvem-sessao:v1';

  /* ---------- configuração ---------- */
  /* O que foi configurado neste navegador vence; o resto vem de src/config.js,
     para que quem abre o app pela primeira vez já ache o servidor. */
  function padrao() {
    const c = (global.IADConfig && global.IADConfig.supabase) || {};
    return { url: String(c.url || '').replace(/\/+$/, ''), chave: String(c.chave || '') };
  }

  function config() {
    const base = padrao();
    let salvo = null;
    try { salvo = JSON.parse(localStorage.getItem(CHAVE_CONFIG)); } catch (e) { salvo = null; }
    if (!salvo) return base;
    return { url: salvo.url || base.url, chave: salvo.chave || base.chave };
  }

  function salvarConfig(nova) {
    const url = String(nova.url || '').trim().replace(/\/+$/, '');
    localStorage.setItem(CHAVE_CONFIG, JSON.stringify({ url: url, chave: String(nova.chave || '').trim() }));
  }

  function configurada() { return !!(config().url && config().chave); }

  function sessao() {
    try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO)) || null; }
    catch (e) { return null; }
  }

  function guardarSessao(s) {
    if (s) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
    else localStorage.removeItem(CHAVE_SESSAO);
  }

  function conectado() { return !!(configurada() && sessao() && sessao().access_token); }

  /* Com a nuvem configurada, é ela quem manda no login: contas de verdade,
     e-mail de verdade. Sem ela, o app segue no modo local. */
  function mandaNoAcesso() { return configurada(); }

  /* ---------- chamadas ---------- */
  function cabecalhos(comAutenticacao) {
    const c = config();
    const h = { 'apikey': c.chave, 'content-type': 'application/json' };
    const s = sessao();
    h.Authorization = 'Bearer ' + ((comAutenticacao !== false && s && s.access_token) ? s.access_token : c.chave);
    return h;
  }

  /* O token do Supabase vive cerca de uma hora. Sem isto, o app funcionaria
     bem e começaria a falhar sozinho no meio do expediente, com uma mensagem
     que não diz nada ao vendedor. Numa recusa por token vencido, renovamos e
     repetimos a chamada uma vez — só uma, para um refresh inválido não virar
     laço infinito. */
  function chamar(caminho, opcoes) {
    return tentar(caminho, opcoes, true);
  }

  function tentar(caminho, opcoes, podeRenovar) {
    const c = config();
    if (!c.url) return Promise.reject(new Error('Configure o endereço do Supabase em ⚙︎ Dados.'));
    const o = opcoes || {};
    return fetch(c.url + caminho, {
      method: o.metodo || 'GET',
      headers: Object.assign(cabecalhos(o.autenticado), o.cabecalhos || {}),
      body: o.corpo ? JSON.stringify(o.corpo) : undefined
    }).catch(function () {
      /* "Failed to fetch" não ajuda ninguém: quase sempre é endereço errado ou sem internet. */
      throw new Error('Não foi possível falar com o servidor. Confira o endereço do projeto e sua conexão.');
    }).then(function (resposta) {
      if (resposta.status === 204) return null;
      return resposta.text().then(function (texto) {
        let corpo = null;
        try { corpo = texto ? JSON.parse(texto) : null; } catch (e) { corpo = { mensagem: texto }; }
        if (!resposta.ok) {
          const msg = (corpo && (corpo.error_description || corpo.msg || corpo.message || corpo.hint)) ||
            ('O servidor respondeu ' + resposta.status + '.');
          const vencido = resposta.status === 401 && o.autenticado !== false &&
            sessao() && sessao().refresh_token && /jwt|token/i.test(msg);
          if (vencido && podeRenovar) {
            return renovar().then(function () { return tentar(caminho, opcoes, false); });
          }
          const erro = new Error(msg);
          erro.status = resposta.status;
          throw erro;
        }
        return corpo;
      });
    });
  }

  /* ---------- autenticação (GoTrue) ---------- */
  function cadastrar(email, senha, dados) {
    return chamar('/auth/v1/signup', {
      metodo: 'POST', autenticado: false,
      corpo: { email: email, password: senha, data: dados || {} }
    }).then(function (r) {
      /* Com confirmação de e-mail ligada, o Supabase não devolve sessão aqui:
         ele manda o e-mail e espera o clique. */
      if (r && r.access_token) guardarSessao(r);
      return r;
    });
  }

  function entrar(email, senha) {
    return chamar('/auth/v1/token?grant_type=password', {
      metodo: 'POST', autenticado: false,
      corpo: { email: email, password: senha }
    }).then(function (r) {
      guardarSessao(r);
      return r;
    });
  }

  function sair() {
    const s = sessao();
    guardarSessao(null);
    if (!s) return Promise.resolve();
    return chamar('/auth/v1/logout', { metodo: 'POST' }).catch(function () {});
  }

  function renovar() {
    const s = sessao();
    if (!s || !s.refresh_token) return Promise.reject(new Error('Sem sessão para renovar.'));
    return chamar('/auth/v1/token?grant_type=refresh_token', {
      metodo: 'POST', autenticado: false, corpo: { refresh_token: s.refresh_token }
    }).then(function (r) { guardarSessao(r); return r; });
  }

  function eu() {
    return chamar('/auth/v1/user', {}).then(function (u) { return u; });
  }

  /* Duas leituras separadas de propósito. A pergunta "este usuário tem empresa?"
     decide se a pessoa entra ou fica presa na tela de empresa — e não pode
     depender de conseguir LER a empresa, que é outra permissão. Juntar as duas
     numa consulta só fazia uma falha na segunda derrubar a primeira. */
  function meuPerfil() {
    const s = sessao();
    if (!s || !s.user) return Promise.resolve(null);
    return chamar('/rest/v1/perfis?id=eq.' + s.user.id + '&select=*').then(function (linhas) {
      const perfil = (linhas && linhas[0]) || null;
      if (!perfil || !perfil.tenant_id) return perfil;
      /* O nome da empresa é enfeite: se não vier, o perfil continua valendo. */
      return chamar('/rest/v1/tenants?id=eq.' + perfil.tenant_id + '&select=id,nome,cnpj').then(
        function (ts) { perfil.tenants = (ts && ts[0]) || null; return perfil; },
        function () { return perfil; }
      );
    });
  }

  function salvarPerfil(dados) {
    const s = sessao();
    if (!s || !s.user) return Promise.reject(new Error('Entre na nuvem primeiro.'));
    return chamar('/rest/v1/perfis?id=eq.' + s.user.id, {
      metodo: 'PATCH', cabecalhos: { Prefer: 'return=representation' }, corpo: dados
    });
  }

  /* Criar a empresa e ligar o perfil a ela é uma coisa só, e é o banco que faz.
     Inserir em tenants daqui não funciona: o Postgres aplica as políticas de
     leitura à linha devolvida, e quem ainda não tem empresa não pode ler a que
     acabou de criar. Ver nuvem/correcao-01-criar-empresa.sql. */
  function criarMinhaEmpresa(nome, cnpj) {
    return chamar('/rest/v1/rpc/criar_minha_empresa', {
      metodo: 'POST', corpo: { p_nome: nome, p_cnpj: cnpj || '' }
    });
  }

  /* ---------- administração ----------
     As políticas do banco já deixam o administrador ler todos os perfis e
     empresas e atualizar perfis alheios. Faltava a tela — e enquanto ela não
     existia, incluir alguém no time exigia escrever SQL, que é onde o erro
     nasce. Quem não é administrador recebe lista vazia do próprio Postgres,
     não de uma checagem daqui. */
  function perfisDaNuvem() {
    return chamar('/rest/v1/perfis?select=*&order=criado_em.asc');
  }

  function empresasDaNuvem() {
    return chamar('/rest/v1/tenants?select=*&order=nome.asc');
  }

  function ligarPerfil(id, dados) {
    return chamar('/rest/v1/perfis?id=eq.' + encodeURIComponent(id), {
      metodo: 'PATCH', cabecalhos: { Prefer: 'return=representation' }, corpo: dados
    });
  }

  function souAdminNaNuvem() {
    const perfil = sessaoPerfil();
    return !!(perfil && perfil.papel === 'admin');
  }

  /* ---------- tradução entre o formato local e o do banco ---------- */
  const TABELAS = [
    { local: 'contas', remota: 'contas' },
    { local: 'contatos', remota: 'contatos' },
    { local: 'oportunidades', remota: 'oportunidades' },
    { local: 'tarefas', remota: 'tarefas' },
    { local: 'produtos', remota: 'produtos' },
    { local: 'segmentos', remota: 'segmentos' },
    { local: 'tiposTarefa', remota: 'tipos_tarefa' }
  ];

  /* camelCase no app, snake_case no Postgres: a conversão é mecânica. */
  function paraColuna(nome) { return nome.replace(/[A-Z]/g, function (l) { return '_' + l.toLowerCase(); }); }
  function paraCampo(nome) { return nome.replace(/_([a-z])/g, function (_, l) { return l.toUpperCase(); }); }

  const IGNORAR_AO_ENVIAR = ['donoId'];

  function paraBanco(registro, tenantId, donoId) {
    const saida = {};
    Object.keys(registro).forEach(function (campo) {
      if (IGNORAR_AO_ENVIAR.indexOf(campo) !== -1) return;
      const valor = registro[campo];
      if (valor === undefined) return;
      saida[paraColuna(campo)] = valor === '' && /Em$|previsto$|vencimento$/i.test(campo) ? null : valor;
    });
    saida.tenant_id = tenantId;
    if (donoId && ('donoId' in registro || 'dono_id' in saida)) saida.dono_id = donoId;
    saida.atualizado_em = new Date().toISOString();
    return saida;
  }

  function paraApp(linha) {
    const saida = {};
    Object.keys(linha).forEach(function (coluna) {
      if (coluna === 'atualizado_em') return;
      saida[paraCampo(coluna)] = linha[coluna] === null ? '' : linha[coluna];
    });
    return saida;
  }

  /* ---------- sincronização ---------- */
  function empurrar() {
    const perfil = sessaoPerfil();
    if (!perfil || !perfil.tenant_id) return Promise.reject(new Error('Seu usuário ainda não tem empresa na nuvem.'));

    const estado = Store.obter();
    const donoId = (sessao().user || {}).id;

    /* Uma tabela que falha não pode esconder as outras. Com Promise.all, o
       primeiro erro aborta tudo e o problema seguinte só aparece depois de
       consertar este — descobrir de um em um custa uma rodada por defeito.
       Aqui todas as tabelas são tentadas e os erros voltam juntos. */
    const envios = TABELAS.map(function (t) {
      const linhas = (estado[t.local] || []).map(function (r) { return paraBanco(r, perfil.tenant_id, donoId); });
      if (!linhas.length) return Promise.resolve({ tabela: t.remota, enviados: 0 });
      return chamar('/rest/v1/' + t.remota, {
        metodo: 'POST',
        cabecalhos: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        corpo: linhas
      }).then(
        function () { return { tabela: t.remota, enviados: linhas.length }; },
        function (e) { return { tabela: t.remota, enviados: 0, erro: e.message }; }
      );
    });

    return Promise.all(envios).then(function (resultados) {
      const falhas = resultados.filter(function (r) { return r.erro; });
      if (falhas.length) {
        throw new Error(falhas.map(function (f) { return f.tabela + ': ' + f.erro; }).join(' — '));
      }
      return resultados.reduce(function (s, r) { return s + r.enviados; }, 0);
    });
  }

  function puxar() {
    const buscas = TABELAS.map(function (t) {
      return chamar('/rest/v1/' + t.remota + '?select=*').then(
        function (linhas) { return { local: t.local, linhas: (linhas || []).map(paraApp) }; },
        function (e) { return { local: t.local, tabela: t.remota, erro: e.message }; }
      );
    });

    return Promise.all(buscas).then(function (resultados) {
      const falhas = resultados.filter(function (r) { return r.erro; });
      if (falhas.length) {
        throw new Error(falhas.map(function (f) { return f.tabela + ': ' + f.erro; }).join(' — '));
      }
      /* Só troca a cópia local depois que todas as tabelas vieram: substituir
         parte delas deixaria a carteira pela metade, com contas sem contatos. */
      const estado = Store.obter();
      resultados.forEach(function (r) { estado[r.local] = r.linhas; });
      Store.salvar();
      return resultados.reduce(function (s, r) { return s + r.linhas.length; }, 0);
    });
  }

  function sincronizar() {
    return empurrar().then(function (enviados) {
      return puxar().then(function (recebidos) {
        localStorage.setItem('iad-crm:nuvem-ultima', new Date().toISOString());
        return { enviados: enviados, recebidos: recebidos };
      });
    });
  }

  function ultimaSincronizacao() { return localStorage.getItem('iad-crm:nuvem-ultima') || ''; }

  /* O perfil fica junto da sessão para não pedir ao servidor a cada envio. */
  function sessaoPerfil() {
    const s = sessao();
    return s ? s.perfil : null;
  }

  function guardarPerfilNaSessao(perfil) {
    const s = sessao();
    if (!s) return;
    s.perfil = perfil;
    guardarSessao(s);
  }

  function estado() {
    return {
      configurada: configurada(),
      conectado: conectado(),
      email: (sessao() && sessao().user && sessao().user.email) || '',
      perfil: sessaoPerfil(),
      ultima: ultimaSincronizacao()
    };
  }

  global.IADNuvem = {
    config, salvarConfig, configurada, conectado, mandaNoAcesso, estado, sessao,
    cadastrar, entrar, sair, renovar, eu, meuPerfil, salvarPerfil, criarMinhaEmpresa,
    guardarPerfilNaSessao, empurrar, puxar, sincronizar, ultimaSincronizacao,
    perfisDaNuvem, empresasDaNuvem, ligarPerfil, souAdminNaNuvem,
    paraBanco, paraApp
  };
})(window);
