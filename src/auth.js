/* Contas de acesso: empresas do sistema (tenants), usuários, sessão e papéis.

   Aviso honesto, repetido aqui porque é onde importa: sem servidor, este login
   organiza o acesso — ele não o protege. A senha é comparada dentro do próprio
   navegador, então quem abrir as ferramentas do desenvolvedor contorna tudo.
   A estrutura está desenhada para que, quando o backend entrar, só mude onde a
   verificação acontece: as telas e os papéis continuam iguais. */
(function (global) {
  'use strict';

  const Store = global.IADStore;
  const CHAVE_SESSAO = 'iad-crm:sessao:v1';
  const VALIDADE_CODIGO_MIN = 30;

  /* ---------- senha ---------- */
  function aleatorio(tamanho) {
    const bytes = new Uint8Array(tamanho);
    (global.crypto || global.msCrypto).getRandomValues(bytes);
    return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function hash(senha, sal) {
    const texto = new TextEncoder().encode(sal + '|' + senha);
    return crypto.subtle.digest('SHA-256', texto).then(function (buffer) {
      return Array.from(new Uint8Array(buffer))
        .map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  function definirSenha(usuario, senha) {
    const sal = aleatorio(8);
    return hash(senha, sal).then(function (h) {
      usuario.sal = sal;
      usuario.senhaHash = h;
      Store.salvar();
      return usuario;
    });
  }

  function conferirSenha(usuario, senha) {
    if (!usuario || !usuario.senhaHash) return Promise.resolve(false);
    return hash(senha, usuario.sal || '').then(function (h) { return h === usuario.senhaHash; });
  }

  /* ---------- consultas ---------- */
  function usuarios() { return Store.obter().usuarios || []; }
  function tenants() { return Store.obter().tenants || []; }
  function tenant(id) { return tenants().find(function (t) { return t.id === id; }); }
  function usuario(id) { return usuarios().find(function (u) { return u.id === id; }); }

  function porLogin(texto) {
    const alvo = String(texto || '').trim().toLowerCase();
    return usuarios().find(function (u) {
      return (u.login || '').toLowerCase() === alvo || (u.email || '').toLowerCase() === alvo;
    });
  }

  /* ---------- sessão ---------- */
  function sessao() {
    try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO)) || null; }
    catch (e) { return null; }
  }

  function atual() {
    const s = sessao();
    return s ? usuario(s.usuarioId) : null;
  }

  function ehAdmin() {
    const u = atual();
    return !!u && u.papel === 'admin';
  }

  function abrirSessao(u) {
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify({
      usuarioId: u.id, em: new Date().toISOString(),
      filtroTenant: 'todas', filtroUsuario: 'todos'
    }));
    return u;
  }

  function encerrarSessao() { localStorage.removeItem(CHAVE_SESSAO); }

  /* O administrador é o único que escolhe o que enxergar. */
  function filtros() {
    const s = sessao() || {};
    return { tenant: s.filtroTenant || 'todas', usuario: s.filtroUsuario || 'todos' };
  }

  function definirFiltros(novos) {
    const s = sessao();
    if (!s || !ehAdmin()) return;
    if (novos.tenant !== undefined) s.filtroTenant = novos.tenant;
    if (novos.usuario !== undefined) s.filtroUsuario = novos.usuario;
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
  }

  /* ---------- entrar ---------- */
  function entrar(login, senha) {
    const u = porLogin(login);
    if (!u) return Promise.reject(new Error('Usuário não encontrado.'));
    if (u.ativo === false) return Promise.reject(new Error('Este acesso está desativado.'));

    return conferirSenha(u, senha).then(function (ok) {
      if (!ok) throw new Error('Senha incorreta.');
      if (!u.emailConfirmado && u.papel !== 'admin') {
        const erro = new Error('E-mail ainda não confirmado.');
        erro.usuario = u;
        erro.pendente = 'codigo';
        throw erro;
      }
      if (!u.tenantId && u.papel !== 'admin') {
        const erro = new Error('Cadastro incompleto.');
        erro.usuario = u;
        erro.pendente = 'perfil';
        throw erro;
      }
      u.ultimoAcesso = new Date().toISOString();
      Store.salvar();
      return abrirSessao(u);
    });
  }

  /* ---------- primeiro acesso ---------- */
  function criarUsuario(dados, senha) {
    if (porLogin(dados.email) || (dados.login && porLogin(dados.login))) {
      return Promise.reject(new Error('Já existe um acesso com este e-mail ou login.'));
    }
    const novo = Object.assign({
      id: Store.uid('usr'), tenantId: null, nome: '', email: '', login: '', whatsapp: '',
      papel: 'usuario', ativo: true, emailConfirmado: false, codigo: null, codigoExpiraEm: null,
      criadoEm: Store.hoje(), ultimoAcesso: null
    }, dados);
    Store.obter().usuarios.push(novo);
    return definirSenha(novo, senha).then(function () { return novo; });
  }

  /* Código de seis dígitos. A geração é real; a entrega é que depende de servidor. */
  function gerarCodigo(u) {
    const numero = String(Math.floor(100000 + Math.random() * 900000));
    const expira = new Date(Date.now() + VALIDADE_CODIGO_MIN * 60000);
    u.codigo = numero;
    u.codigoExpiraEm = expira.toISOString();
    Store.salvar();
    return numero;
  }

  function confirmarCodigo(u, digitado) {
    if (!u.codigo) return { ok: false, motivo: 'Nenhum código foi gerado.' };
    if (u.codigoExpiraEm && new Date(u.codigoExpiraEm) < new Date()) {
      return { ok: false, motivo: 'O código expirou. Peça um novo.' };
    }
    if (String(digitado).trim() !== u.codigo) return { ok: false, motivo: 'Código incorreto.' };
    u.emailConfirmado = true;
    u.codigo = null;
    u.codigoExpiraEm = null;
    Store.salvar();
    return { ok: true };
  }

  /* Completar o cadastro: a empresa entra aqui, criada ou escolhida. */
  function completarPerfil(u, dados) {
    let tenantId = dados.tenantId;
    if (!tenantId && dados.empresaNova) {
      tenantId = criarTenant({ nome: dados.empresaNova, cnpj: dados.cnpj || '' }).id;
    }
    if (!tenantId) throw new Error('Informe a empresa.');
    u.tenantId = tenantId;
    u.nome = dados.nome || u.nome;
    u.whatsapp = dados.whatsapp || u.whatsapp;
    Store.salvar();
    return u;
  }

  function criarTenant(dados) {
    const novo = Object.assign({
      id: Store.uid('ten'), nome: '', cnpj: '', ativo: true, criadoEm: Store.hoje()
    }, dados);
    Store.obter().tenants.push(novo);
    Store.salvar();
    return novo;
  }

  /* ---------- administração ---------- */
  function salvarUsuario(id, dados, senhaNova) {
    const u = usuario(id);
    if (!u) return Promise.reject(new Error('Usuário não encontrado.'));
    Object.assign(u, dados);
    Store.salvar();
    return senhaNova ? definirSenha(u, senhaNova) : Promise.resolve(u);
  }

  function excluirUsuario(id) {
    const u = usuario(id);
    if (u && u.papel === 'admin') throw new Error('O administrador não pode ser excluído.');
    const estado = Store.obter();
    estado.usuarios = estado.usuarios.filter(function (x) { return x.id !== id; });
    Store.salvar();
  }

  /* ---------- sessão vinda do servidor ----------
     Quando o Supabase manda no login, quem autentica é ele — mas o resto do
     app pergunta sempre a atual(), e não deveria precisar saber de onde a
     sessão veio. Então o usuário do servidor é espelhado na tabela local, com
     o mesmo id, e tudo a jusante continua igual.

     O espelho não guarda senha: quem confere a senha é o servidor. */
  function espelharDaNuvem(usuarioNuvem, perfil) {
    const estado = Store.obter();
    estado.usuarios = estado.usuarios || [];
    estado.tenants = estado.tenants || [];

    const meta = usuarioNuvem.user_metadata || {};
    let u = usuario(usuarioNuvem.id);
    if (!u) {
      u = { id: usuarioNuvem.id, criadoEm: Store.hoje() };
      estado.usuarios.push(u);
    }

    u.naNuvem = true;
    u.email = usuarioNuvem.email || u.email || '';
    u.login = u.email;
    u.nome = (perfil && perfil.nome) || meta.nome || u.nome || u.email;
    u.whatsapp = (perfil && perfil.whatsapp) || meta.whatsapp || u.whatsapp || '';
    /* O papel vem do servidor: usuario, gestor ou admin. */
    u.papel = (perfil && ['admin', 'gestor'].indexOf(perfil.papel) !== -1) ? perfil.papel : 'usuario';
    u.tenantId = (perfil && perfil.tenant_id) || null;
    u.ativo = true;
    u.emailConfirmado = true;
    u.ultimoAcesso = new Date().toISOString();

    /* A empresa também é espelhada: as telas mostram o nome dela, não o id. */
    const empresa = perfil && perfil.tenants;
    if (u.tenantId) {
      let t = tenant(u.tenantId);
      if (!t) {
        t = { id: u.tenantId, nome: '', cnpj: '', criadoEm: Store.hoje() };
        estado.tenants.push(t);
      }
      if (empresa) { t.nome = empresa.nome || t.nome; t.cnpj = empresa.cnpj || t.cnpj; }
      if (!t.nome) t.nome = 'Minha empresa';
    }

    Store.salvar();
    return u;
  }

  /* Um login local só vale para quem não veio do servidor — hoje, o Adm.
     É a porta de serviço: sem internet, ou antes de a nuvem existir. */
  function ehLocal(texto) {
    const u = porLogin(texto);
    return !!u && !u.naNuvem;
  }

  /* O administrador padrão nasce com o sistema; sem ele ninguém entra.
     Menos quando o servidor manda no acesso: aí ele é porta dos fundos. A senha
     dele está no repositório, que é público, e o app está numa URL pública —
     qualquer pessoa que abrisse o endereço entraria. Com a nuvem configurada,
     quem autoriza é o Supabase, e este atalho deixa de existir. */
  function garantirAdministrador() {
    const N = global.IADNuvem;
    if (N && N.mandaNoAcesso()) {
      const estado0 = Store.obter();
      estado0.usuarios = (estado0.usuarios || []).filter(function (u) {
        return u.naNuvem || u.login !== 'Adm';
      });
      return Promise.resolve(null);
    }

    const estado = Store.obter();
    estado.usuarios = estado.usuarios || [];
    estado.tenants = estado.tenants || [];
    if (usuarios().some(function (u) { return u.papel === 'admin'; })) return Promise.resolve(null);

    const adm = {
      id: Store.uid('usr'), tenantId: null, nome: 'Administrador', email: '',
      login: 'Adm', whatsapp: '', papel: 'admin', ativo: true, emailConfirmado: true,
      codigo: null, codigoExpiraEm: null, criadoEm: Store.hoje(), ultimoAcesso: null
    };
    estado.usuarios.push(adm);

    /* A senha é sorteada, e não escrita aqui. Uma senha fixa no código de um
       repositório público não é senha: é uma porta com a chave pendurada na
       fechadura. Esta aparece uma vez na tela de quem abriu o app pela
       primeira vez, e só nesse aparelho — não há para onde ela vazar. */
    const senha = senhaSorteada();
    return definirSenha(adm, senha).then(function () {
      adm.senhaInicial = senha;
      return adm;
    });
  }

  /* 16 caracteres de um alfabeto sem os que se confundem à leitura (O/0, l/1),
     porque esta é feita para ser lida da tela e digitada uma vez. */
  function senhaSorteada() {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = new Uint32Array(16);
    (global.crypto || global.msCrypto).getRandomValues(bytes);
    let fora = '';
    for (let i = 0; i < bytes.length; i++) fora += letras[bytes[i] % letras.length];
    return fora;
  }

  global.IADAuth = {
    entrar, encerrarSessao, atual, ehAdmin, sessao, filtros, definirFiltros,
    usuarios, tenants, tenant, usuario, porLogin, criarUsuario, criarTenant,
    gerarCodigo, confirmarCodigo, completarPerfil, salvarUsuario, excluirUsuario,
    definirSenha, conferirSenha, garantirAdministrador, abrirSessao,
    espelharDaNuvem, ehLocal,
    VALIDADE_CODIGO_MIN
  };
})(window);
