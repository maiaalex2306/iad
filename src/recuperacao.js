/* Recuperação autônoma: NÃO importa app.js, Store, sessão local ou roteador. */
(function () {
  'use strict';

  var cfg = (window.IADConfig && window.IADConfig.supabase) || {};
  var url = String(cfg.url || '').replace(/\/+$/, '');
  var chave = String(cfg.chave || '');
  var status = document.getElementById('status');
  var frmNova = document.getElementById('form-nova');
  var frmSolicitar = document.getElementById('form-solicitar');
  var nova = document.getElementById('nova');
  var confirma = document.getElementById('confirmacao');
  var btnGravar = document.getElementById('gravar');
  var btnEnviar = document.getElementById('enviar');
  var token = '';
  var hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  var query = new URLSearchParams((location.search || '').replace(/^\?/, ''));

  /* Fragmento pode conter credenciais de sessão. Nunca deixar no histórico. */
  if (history.replaceState) history.replaceState(null, '', location.pathname);

  function mostrar(mensagem, tipo) {
    status.textContent = mensagem;
    status.className = tipo || '';
  }

  function descricaoErro(e) {
    var s = String((e && e.message) || '');
    if (/expir|expired|invalid.*(token|link)|otp/i.test(s)) {
      return 'O link é inválido, já foi utilizado ou expirou. Solicite um link novo abaixo.';
    }
    if (/password.*same|same.*password/i.test(s)) {
      return 'Escolha uma senha diferente da anterior e tente novamente.';
    }
    if (/password|senha/i.test(s) && /weak|short|length|least/i.test(s)) {
      return 'A senha não atende à política de segurança do servidor. Escolha uma senha mais forte.';
    }
    return 'Não foi possível validar ou salvar a senha. ' +
      (s && s.length < 170 ? s : 'Confira a conexão e solicite um novo link.');
  }

  async function chamar(caminho, metodo, corpo, accessToken) {
    var res = await fetch(url + caminho, {
      method: metodo || 'GET',
      headers: {
        'apikey': chave,
        'Authorization': 'Bearer ' + (accessToken || chave),
        'Content-Type': 'application/json'
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    });
    var txt = await res.text();
    var data = {};
    try { data = txt ? JSON.parse(txt) : {}; }
    catch (e) { data = {}; }
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || data.message ||
        data.error || ('Erro HTTP ' + res.status));
    }
    return data;
  }

  function pedirNovoLink(mensagem, tipo) {
    token = '';
    frmNova.hidden = true;
    frmSolicitar.hidden = false;
    mostrar(mensagem, tipo);
  }

  function prontoParaDefinir() {
    frmNova.hidden = false;
    frmSolicitar.hidden = true;
    mostrar('Link validado. Digite a NOVA senha duas vezes. A senha antiga não é necessária.', 'success');
    nova.focus();
  }

  async function inicializar() {
    if (!url.startsWith('https://') || !chave) {
      mostrar('Configuração de autenticação indisponível. Contate o administrador.', 'error');
      return;
    }
    var erro = hash.get('error_code') || query.get('error_code') ||
      hash.get('error') || query.get('error');
    if (erro) {
      pedirNovoLink('O link de recuperação foi recusado ou expirou. Solicite um novo.', 'error');
      return;
    }
    var tipo = hash.get('type') || query.get('type');
    var accessToken = hash.get('access_token');
    var tokenHash = query.get('token_hash') || hash.get('token_hash');

    if ((tipo === 'recovery' || tipo === 'invite') && (accessToken || tokenHash)) {
      try {
        if (accessToken) {
          token = accessToken;
        } else {
          var sessao = await chamar('/auth/v1/verify', 'POST', {
            type: tipo, token_hash: tokenHash
          });
          token = String(sessao.access_token || '');
        }
        if (!token) throw new Error('O link não gerou uma sessão de recuperação.');
        var usuario = await chamar('/auth/v1/user', 'GET', null, token);
        if (!usuario || !usuario.id) throw new Error('O Supabase não confirmou a identidade.');
        prontoParaDefinir();
      } catch (e) {
        pedirNovoLink(descricaoErro(e), 'error');
      }
      return;
    }
    if (query.get('code')) {
      pedirNovoLink('Este link usa um fluxo de autenticação incompatível com o CRM atual. Solicite outro link ou fale com o administrador.', 'error');
      return;
    }
    pedirNovoLink('Informe seu e-mail para receber um link de recuperação de senha.', '');
  }

  frmNova.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    if (!token) { pedirNovoLink('Sua autorização expirou. Solicite outro link.', 'error'); return; }
    if (nova.value.length < 8) {
      mostrar('A senha precisa ter pelo menos 8 caracteres.', 'error'); return;
    }
    if (nova.value !== confirma.value) {
      mostrar('Os dois campos de NOVA senha não estão iguais. Confira antes de salvar.', 'error'); return;
    }
    btnGravar.disabled = true;
    mostrar('Gravando nova senha no Supabase…');
    try {
      await chamar('/auth/v1/user', 'PUT', { password: nova.value }, token);
      token = '';
      nova.value = '';
      confirma.value = '';
      frmNova.hidden = true;
      mostrar('Senha atualizada com sucesso. Volte para o login e entre com a nova senha.', 'success');
    } catch (e) {
      mostrar(descricaoErro(e), 'error');
    } finally {
      btnGravar.disabled = false;
    }
  });

  frmSolicitar.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var email = String(document.getElementById('email').value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      mostrar('Informe um e-mail válido.', 'error'); return;
    }
    btnEnviar.disabled = true;
    mostrar('Solicitando novo link…');
    try {
      var redirect = location.origin + '/';
      await chamar('/auth/v1/recover?redirect_to=' + encodeURIComponent(redirect),
        'POST', { email: email });
      mostrar('Se a conta estiver cadastrada, o e-mail de recuperação será enviado. Abra o link mais recente recebido.', 'success');
    } catch (e) {
      mostrar('Não foi possível solicitar o link. Confira sua conexão e tente novamente.', 'error');
    } finally {
      btnEnviar.disabled = false;
    }
  });

  inicializar().catch(function () {
    pedirNovoLink('Ocorreu uma falha ao iniciar a recuperação. Solicite um novo link.', 'error');
  });
})();
