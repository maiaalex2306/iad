/* Helpers de interface: formatação, escape e diálogos. */
(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Centavos aparecem quando existem. Antes o formatador arredondava para
     inteiro, e R$ 46.700,50 era exibido como R$ 46.701 — número errado
     apresentado como fato. Valor redondo continua limpo, sem ",00" à toa. */
  function moeda(valor) {
    const n = Number(valor) || 0;
    const temCentavos = Math.abs(n * 100 - Math.round(n) * 100) > 0.5;
    return n.toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL',
      minimumFractionDigits: temCentavos ? 2 : 0,
      maximumFractionDigits: temCentavos ? 2 : 0
    });
  }

  /* Rótulo curto para cartões e gráficos. Uma casa decimal porque arredondar
     46.700 para "R$ 47k" some com R$ 300 sem avisar. */
  function compacto(valor) {
    const n = Number(valor) || 0;
    const curto = function (x, sufixo) {
      return 'R$ ' + x.toFixed(1).replace(/\.0$/, '').replace('.', ',') + sufixo;
    };
    if (Math.abs(n) >= 1e6) return curto(n / 1e6, 'M');
    if (Math.abs(n) >= 1e3) return curto(n / 1e3, 'k');
    return moeda(n);
  }

  /* ---------- o que o vendedor digita ----------
     "46.700,00", "46700,00", "R$ 46.700" e "46700" são todos 46700. Aceitamos
     as quatro grafias em vez de exigir uma — e nunca devolvemos um número
     diferente do que a pessoa quis dizer.

     O campo type="number" fazia justamente isso: com vírgula ele juntava os
     dígitos ("46700,00" virava 4.670.000) e com ponto de milhar dividia
     ("46.700,00" virava 46,7). Errado, e em silêncio. */
  function numeroDigitado(texto) {
    if (typeof texto === 'number') return isFinite(texto) ? texto : 0;
    const original = String(texto == null ? '' : texto).trim();
    if (!original) return 0;

    const negativo = /^-/.test(original) || /^\(.*\)$/.test(original);
    const limpo = original.replace(/[^0-9.,]/g, '');
    if (!limpo) return 0;

    const virgula = limpo.lastIndexOf(',');
    const ponto = limpo.lastIndexOf('.');
    let decimal;

    if (virgula !== -1 && ponto !== -1) {
      decimal = Math.max(virgula, ponto);       /* o último separador decide */
    } else if (virgula !== -1) {
      decimal = virgula;                        /* vírgula sozinha é decimal */
    } else if (ponto !== -1) {
      /* Ponto sozinho é ambíguo: "46.700" é milhar, "46.70" é decimal.
         Se todo grupo após o ponto tem três dígitos, é separador de milhar. */
      const grupos = limpo.split('.');
      const ehMilhar = grupos.slice(1).every(function (g) { return g.length === 3; });
      decimal = ehMilhar ? -1 : ponto;
    } else {
      decimal = -1;
    }

    const semSeparador = function (t) { return t.replace(/[.,]/g, ''); };
    const inteiro = semSeparador(decimal === -1 ? limpo : limpo.slice(0, decimal));
    const centavos = decimal === -1 ? '' : semSeparador(limpo.slice(decimal + 1));

    const n = Number((inteiro || '0') + (centavos ? '.' + centavos : ''));
    if (!isFinite(n)) return 0;
    return negativo ? -n : n;
  }

  /* Como o número volta para dentro do campo ao editar. */
  function paraCampoMoeda(valor) {
    const n = Number(valor) || 0;
    if (!n) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function data(iso) {
    if (!iso) return '—';
    const p = iso.slice(0, 10).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function numero(n, casas) {
    return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 });
  }

  /* Diálogo genérico: recebe HTML de formulário e devolve os campos preenchidos. */
  /* aoCancelar existe porque desistir nem sempre é neutro: na caixa que define
     a senha de quem chegou pelo convite, fechar sem preencher deixa a pessoa
     dentro do app e sem como voltar amanhã. Quem chama precisa poder dizer
     isso. Nas outras caixas o parâmetro não é passado e nada muda. */
  function formulario(titulo, campos, valores, aoConfirmar, aoMontar, aoCancelar) {
    const dlg = document.createElement('dialog');
    const html = campos.map(function (c) {
      const v = (valores && valores[c.id] != null) ? valores[c.id] : (c.padrao != null ? c.padrao : '');
      if (c.tipo === 'select') {
        return '<label class="campo"><span>' + esc(c.rotulo) + '</span><select name="' + c.id + '">' +
          c.opcoes.map(function (o) {
            const val = typeof o === 'string' ? o : o.valor;
            const rot = typeof o === 'string' ? o : o.rotulo;
            return '<option value="' + esc(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(rot) + '</option>';
          }).join('') + '</select></label>';
      }
      if (c.tipo === 'textarea') {
        return '<label class="campo"><span>' + esc(c.rotulo) + '</span><textarea name="' + c.id + '">' + esc(v) + '</textarea>' +
          (c.voz ? botaoVoz(c.id) : '') + '</label>';
      }
      if (c.tipo === 'moeda') {
        return '<label class="campo"><span>' + esc(c.rotulo) + '</span>' +
          '<input type="text" inputmode="decimal" name="' + c.id + '" value="' + esc(paraCampoMoeda(v)) +
          '" placeholder="0,00" autocomplete="off"></label>';
      }
      if (c.tipo === 'ia') return caixaIA(c);
      /* O olho existe nas telas de acesso desde sempre; faltava aqui dentro,
         que é justamente onde se troca a senha. */
      if (c.tipo === 'password') {
        return '<label class="campo"><span>' + esc(c.rotulo) + '</span>' +
          '<span class="campo-senha">' +
          '<input type="password" name="' + c.id + '" value="' + esc(v) + '"' +
          (c.placeholder ? ' placeholder="' + esc(c.placeholder) + '"' : '') + '>' +
          '<button type="button" class="olho" data-olho="' + c.id + '"' +
          ' aria-label="Mostrar a senha" data-ajuda="Mostra ou esconde a senha digitada.">👁</button>' +
          '</span></label>';
      }
      return '<label class="campo"><span>' + esc(c.rotulo) + '</span><input type="' + (c.tipo || 'text') + '" name="' + c.id + '" value="' + esc(v) + '"' + (c.placeholder ? ' placeholder="' + esc(c.placeholder) + '"' : '') + '></label>';
    }).join('');

    dlg.innerHTML =
      '<form method="dialog"><div class="corpo"><h2>' + esc(titulo) + '</h2>' + html + '</div>' +
      '<div class="rodape"><button class="btn ghost" value="cancelar" type="submit">Cancelar</button>' +
      '<button class="btn" value="ok" type="submit">Salvar</button></div></form>';

    document.body.appendChild(dlg);
    ligarVoz(dlg);
    ligarOlho(dlg);
    ligarIA(dlg, campos);
    ligarLimpezaDeSugestao(dlg);
    if (aoMontar) aoMontar(dlg);
    dlg.addEventListener('close', function () {
      if (dlg.returnValue === 'ok') {
        const dados = {};
        campos.forEach(function (c) {
          if (c.tipo === 'ia') return;          /* caixa de assistente não é dado */
          const el = dlg.querySelector('[name="' + c.id + '"]');
          dados[c.id] = (c.tipo === 'moeda' || c.tipo === 'number')
            ? numeroDigitado(el.value)
            : el.value.trim();
        });
        aoConfirmar(dados);
      } else if (aoCancelar) {
        aoCancelar();
      }
      dlg.remove();
    });
    dlg.showModal();
  }

  /* Ditado: o vendedor sai da reunião e fala a evidência.
     Só aparece onde o navegador tem reconhecimento de voz (Chrome, Edge, Safari). */
  function vozDisponivel() {
    return !!(global.SpeechRecognition || global.webkitSpeechRecognition);
  }

  function botaoVoz(campoId) {
    if (!vozDisponivel()) return '';
    return '<button type="button" class="btn ghost mini voz" data-voz="' + campoId + '">🎤 Ditar</button>';
  }

  function ligarVoz(dlg) {
    dlg.querySelectorAll('[data-voz]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        const campo = dlg.querySelector('[name="' + botao.dataset.voz + '"]');
        const Reconhecimento = global.SpeechRecognition || global.webkitSpeechRecognition;
        const rec = new Reconhecimento();
        rec.lang = 'pt-BR';
        rec.interimResults = false;
        rec.continuous = false;
        const rotuloOriginal = botao.textContent;
        botao.textContent = '● Ouvindo…';
        botao.disabled = true;
        const encerrar = function () { botao.textContent = rotuloOriginal; botao.disabled = false; };
        rec.onresult = function (e) {
          const texto = e.results[0][0].transcript;
          campo.value = campo.value ? campo.value + ' ' + texto : texto;
          campo.dispatchEvent(new Event('input'));
        };
        rec.onerror = function (e) {
          encerrar();
          if (e.error === 'not-allowed') alert('O navegador bloqueou o microfone. Libere o acesso para usar o ditado.');
        };
        rec.onend = encerrar;
        rec.start();
      });
    });
  }

  /* ---------- assistente de preenchimento ----------
     Um campo do tipo 'ia' vira uma caixa de texto livre acima do formulário:
     a pessoa cola a ata, e os campos abaixo se preenchem. A caixa só existe
     quando o assistente está disponível — sem servidor, o formulário é o de
     sempre, sem botão morto. */

  function assistenteAtivo() {
    return !!(global.IADIA && global.IADIA.disponivel());
  }

  function caixaIA(c) {
    if (!assistenteAtivo()) return '';
    return '<div class="caixa-ia">' +
      '<span class="rotulo">✨ ' + esc(c.rotulo || 'Cole a ata ou conte o que aconteceu') + '</span>' +
      '<textarea name="' + c.id + '" placeholder="' + esc(c.placeholder || '') + '">' + esc(c.padrao || '') + '</textarea>' +
      '<div class="linha">' +
        '<button type="button" class="btn mini" data-ia="' + c.id + '">Preencher os campos</button>' +
        botaoVoz(c.id) +
        '<span class="estado" data-ia-estado="' + c.id + '"></span>' +
      '</div>' +
      '<p class="rodape-ia">O assistente sugere. Quem confirma é você — e a nota da decisão continua sendo sua.</p>' +
    '</div>';
  }

  function ligarIA(dlg, campos) {
    campos.forEach(function (c) {
      if (c.tipo !== 'ia') return;
      const botao = dlg.querySelector('[data-ia="' + c.id + '"]');
      if (!botao) return;
      const caixa = dlg.querySelector('[name="' + c.id + '"]');
      const estado = dlg.querySelector('[data-ia-estado="' + c.id + '"]');

      botao.addEventListener('click', function () {
        const texto = caixa.value.trim();
        if (texto.length < 12) { estado.textContent = 'Escreva um pouco mais para eu ter o que ler.'; return; }
        botao.disabled = true;
        estado.textContent = 'Lendo…';
        const ctx = c.contexto ? c.contexto() : {};
        global.IADIA.extrair(c.extrair, texto, ctx).then(function (r) {
          botao.disabled = false;
          if (!r) { estado.textContent = 'Não consegui falar com o assistente agora. Preencha à mão.'; return; }
          const n = aplicarSugestoes(dlg, campos, r, c.nunca);
          estado.textContent = n
            ? (n === 1 ? '1 campo preenchido — confira.' : n + ' campos preenchidos — confira.')
            : 'Não achei nada para preencher neste texto.';
          if (c.aoAplicar) c.aoAplicar(dlg, r, n);
        });
      });
    });
  }

  /* Escreve os valores nos campos e deixa cada um visivelmente marcado, com a
     frase que originou o palpite. A marca some no instante em que a pessoa
     mexe no campo: aí ele deixou de ser sugestão e virou decisão dela. */
  function aplicarSugestoes(dlg, campos, resultado, nunca) {
    const valores = (resultado && resultado.campos) || {};
    const frases = (resultado && resultado.frases) || {};
    const proibidos = nunca || [];
    let n = 0;

    dlg.__aplicandoIA = true;
    campos.forEach(function (c) {
      if (c.tipo === 'ia') return;
      if (proibidos.indexOf(c.id) !== -1) return;
      const v = valores[c.id];
      if (v == null || v === '') return;
      const el = dlg.querySelector('[name="' + c.id + '"]');
      if (!el) return;
      if (el.tagName === 'SELECT') {
        const existe = Array.prototype.some.call(el.options, function (o) {
          return String(o.value) === String(v);
        });
        if (!existe) return;                 /* opção fora da lista real: descarta */
      }
      el.value = (c.tipo === 'moeda') ? paraCampoMoeda(v) : v;
      marcarSugerido(el, frases[c.id]);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      n++;
    });
    dlg.__aplicandoIA = false;
    return n;
  }

  function marcarSugerido(el, frase) {
    const rotulo = el.closest('label.campo');
    if (!rotulo) return;
    rotulo.classList.add('sugerido');
    const antiga = rotulo.querySelector('.origem');
    if (antiga) antiga.remove();
    if (frase) {
      const nota = document.createElement('small');
      nota.className = 'origem';
      nota.textContent = '“' + frase + '”';
      rotulo.appendChild(nota);
    }
  }

  function limparSugestao(el) {
    const rotulo = el.closest && el.closest('label.campo.sugerido');
    if (!rotulo) return;
    rotulo.classList.remove('sugerido');
    const origem = rotulo.querySelector('.origem');
    if (origem) origem.remove();
  }

  function ligarLimpezaDeSugestao(dlg) {
    ['input', 'change'].forEach(function (evento) {
      dlg.addEventListener(evento, function (e) {
        if (dlg.__aplicandoIA) return;
        limparSugestao(e.target);
      });
    });
  }

  function ligarOlho(dlg) {
    dlg.querySelectorAll('[data-olho]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        const campo = dlg.querySelector('[name="' + botao.dataset.olho + '"]');
        if (!campo) return;
        const escondida = campo.type === 'password';
        campo.type = escondida ? 'text' : 'password';
        botao.textContent = escondida ? '🙈' : '👁';
        botao.setAttribute('aria-label', escondida ? 'Esconder a senha' : 'Mostrar a senha');
      });
    });
  }

  function confirmar(mensagem) { return global.confirm(mensagem); }

  function barra(percentual, alt) {
    const p = Math.max(0, Math.min(100, Math.round(percentual)));
    return '<div class="barra' + (alt ? ' alt' : '') + '"><i style="width:' + p + '%"></i></div>';
  }

  global.IADUI = {
    esc: esc, moeda: moeda, compacto: compacto, data: data, numero: numero,
    numeroDigitado: numeroDigitado, paraCampoMoeda: paraCampoMoeda,
    formulario: formulario, confirmar: confirmar, barra: barra, vozDisponivel: vozDisponivel,
    assistenteAtivo: assistenteAtivo, marcarSugerido: marcarSugerido, limparSugestao: limparSugestao
  };
})(window);
