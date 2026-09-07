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

      /* Uma coluna de vinte campos iguais não diz o que anda junto: nome,
         razão social e CNPJ são a identidade da empresa; cidade e UF são um
         lugar só. Seção separa assunto, meia largura junta o que se lê de uma
         vez. Sem as duas, o formulário fica com cara de banco de dados
         exposto — que era o caso. */
      if (c.tipo === 'secao') {
        return '<div class="secao-form"><span>' + esc(c.rotulo) + '</span>' +
          (c.ajuda ? '<em>' + esc(c.ajuda) + '</em>' : '') + '</div>';
      }
      if (c.tipo === 'aviso') {
        return '<p class="nota-form">' + esc(c.rotulo) + '</p>';
      }
      if (c.tipo === 'select') {
        return '<label class="campo' + (c.largura === 'metade' ? ' meia' : '') + '"><span>' + esc(c.rotulo) + '</span><select name="' + c.id + '">' +
          c.opcoes.map(function (o) {
            const val = typeof o === 'string' ? o : o.valor;
            const rot = typeof o === 'string' ? o : o.rotulo;
            return '<option value="' + esc(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(rot) + '</option>';
          }).join('') + '</select></label>';
      }
      if (c.tipo === 'textarea') {
        return '<label class="campo' + (c.largura === 'metade' ? ' meia' : '') + '"><span>' + esc(c.rotulo) + '</span><textarea name="' + c.id + '">' + esc(v) + '</textarea>' +
          (c.voz ? botaoVoz(c.id) : '') + '</label>';
      }
      if (c.tipo === 'moeda') {
        return '<label class="campo' + (c.largura === 'metade' ? ' meia' : '') + '"><span>' + esc(c.rotulo) + '</span>' +
          '<input type="text" inputmode="decimal" name="' + c.id + '" value="' + esc(paraCampoMoeda(v)) +
          '" placeholder="0,00" autocomplete="off"></label>';
      }
      if (c.tipo === 'ia') return caixaIA(c);
      /* O olho existe nas telas de acesso desde sempre; faltava aqui dentro,
         que é justamente onde se troca a senha. */
      if (c.tipo === 'password') {
        return '<label class="campo' + (c.largura === 'metade' ? ' meia' : '') + '"><span>' + esc(c.rotulo) + '</span>' +
          '<span class="campo-senha">' +
          '<input type="password" name="' + c.id + '" value="' + esc(v) + '"' +
          (c.placeholder ? ' placeholder="' + esc(c.placeholder) + '"' : '') + '>' +
          '<button type="button" class="olho" data-olho="' + c.id + '"' +
          ' aria-label="Mostrar a senha" data-ajuda="Mostra ou esconde a senha digitada.">👁</button>' +
          '</span></label>';
      }
      return '<label class="campo' + (c.largura === 'metade' ? ' meia' : '') + '"><span>' + esc(c.rotulo) + '</span><input type="' + (c.tipo || 'text') + '" name="' + c.id + '" value="' + esc(v) + '"' + (c.placeholder ? ' placeholder="' + esc(c.placeholder) + '"' : '') + '></label>';
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
        aoConfirmar(dados, dlg.documentosIA || []);
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

  /* Três entradas para a mesma análise: o que a pessoa escreve, o que ela
     dita, e os documentos que ela carrega. Pedir para copiar e colar o
     conteúdo de uma proposta em Word é pedir que ninguém use — e era isso que
     este app fazia. O botão diz "Análise da IA" e não "Preencher os campos"
     porque ele lê as três coisas juntas, não só a caixa de texto. */
  function caixaIA(c) {
    /* Esconder a caixa quando o assistente não responde evita botão morto, e
       está certo para quem nunca teve IA. Errado para quem tinha: some sem
       explicação, e o app parece ter mudado sozinho — foi o que aconteceu na
       primeira vez que a função caiu depois de funcionar. Some o que não
       funciona, fica a linha que diz onde olhar. */
    if (!assistenteAtivo()) {
      return '<p class="ia-fora">✨ Assistente fora do ar. ' +
        '<a href="#/dados" onclick="IADUI.fecharDialogos()">⚙︎ Dados diz por quê.</a></p>';
    }
    return '<div class="caixa-ia">' +
      '<span class="rotulo">✨ ' + esc(c.rotulo || 'Cole a ata ou conte o que aconteceu') + '</span>' +
      '<textarea name="' + c.id + '" placeholder="' + esc(c.placeholder || '') + '">' + esc(c.padrao || '') + '</textarea>' +
      '<input type="file" multiple hidden data-ia-arquivos="' + c.id + '"' +
      ' accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.tsv,.json,.rtf,.vtt,.srt">' +
      '<div class="linha">' +
        '<button type="button" class="btn mini" data-ia="' + c.id + '">Análise da IA</button>' +
        '<button type="button" class="btn ghost mini" data-ia-carregar="' + c.id + '"' +
        ' data-ajuda-titulo="Carregar documentos" data-ajuda="Word, Excel, PowerPoint, PDF, texto e planilhas. Pode escolher vários de uma vez. A IA lê todos junto com o que você escreveu.">📎 Carregar documentos</button>' +
        botaoVoz(c.id) +
        '<span class="estado" data-ia-estado="' + c.id + '"></span>' +
      '</div>' +
      '<div class="anexos-ia" data-ia-lista="' + c.id + '"></div>' +
      '<p class="rodape-ia">O assistente sugere. Quem confirma é você — e a nota da decisão continua sendo sua.</p>' +
    '</div>';
  }

  function tamanhoLegivel(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' kB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function ligarIA(dlg, campos) {
    campos.forEach(function (c) {
      if (c.tipo !== 'ia') return;
      const botao = dlg.querySelector('[data-ia="' + c.id + '"]');
      if (!botao) return;
      const caixa = dlg.querySelector('[name="' + c.id + '"]');
      const estado = dlg.querySelector('[data-ia-estado="' + c.id + '"]');
      const entrada = dlg.querySelector('[data-ia-arquivos="' + c.id + '"]');
      const lista = dlg.querySelector('[data-ia-lista="' + c.id + '"]');
      const carregar = dlg.querySelector('[data-ia-carregar="' + c.id + '"]');

      /* Os documentos ficam aqui, já lidos, e não no input: escolher outros
         arquivos numa segunda vez substituiria os primeiros, e a pessoa que
         carrega a proposta e depois a planilha espera ficar com as duas. */
      const docs = [];
      dlg.documentosIA = docs;   /* quem salva o formulário anexa estes ao registro */

      function pintarLista() {
        if (!lista) return;
        lista.innerHTML = docs.map(function (d, i) {
          return '<span class="anexo' + (d.erro ? ' com-erro' : '') + '"' +
            (d.erro ? ' title="' + esc(d.erro) + '"' : '') + '>' +
            esc(d.nome) + '<em>' + (d.erro ? 'não deu' : tamanhoLegivel(d.tamanho)) + '</em>' +
            '<button type="button" class="sai" data-tira="' + i + '" aria-label="Tirar este documento">×</button></span>';
        }).join('');
        lista.querySelectorAll('[data-tira]').forEach(function (b) {
          b.addEventListener('click', function () {
            docs.splice(parseInt(b.getAttribute('data-tira'), 10), 1);
            pintarLista();
          });
        });
      }

      if (carregar && entrada) {
        carregar.addEventListener('click', function () { entrada.click(); });
        entrada.addEventListener('change', function () {
          const escolhidos = Array.prototype.slice.call(entrada.files || []);
          if (!escolhidos.length) return;
          estado.textContent = 'Lendo ' + escolhidos.length + ' arquivo' + (escolhidos.length > 1 ? 's' : '') + '…';
          global.IADDocumentos.lerVarios(escolhidos).then(function (lidos) {
            lidos.forEach(function (d, i) { d.arquivo = escolhidos[i]; docs.push(d); });
            dlg.documentosIA = docs;
            entrada.value = '';                       /* deixa reescolher o mesmo arquivo */
            pintarLista();
            const ruins = docs.filter(function (d) { return d.erro; }).length;
            estado.textContent = ruins
              ? ruins + ' arquivo' + (ruins > 1 ? 's' : '') + ' não deu para ler — passe o mouse para ver o motivo.'
              : docs.length + ' documento' + (docs.length > 1 ? 's' : '') + ' carregado' + (docs.length > 1 ? 's' : '') + '.';
          });
        });
      }

      botao.addEventListener('click', function () {
        const digitado = caixa.value.trim();
        /* Documento e texto vão juntos, cada um anunciado: sem o nome do
           arquivo antes do conteúdo, a IA não tem como dizer de onde tirou o
           que preencheu — e é isso que a pessoa vai querer conferir.

           A cota é por documento, e não um corte no fim do texto todo: cortar
           no fim descarta os últimos arquivos inteiros, e quem carregou quatro
           esperava que os quatro contassem. Assim cada um entra com o começo,
           que é onde ficam cabeçalho, cliente e escopo. */
        const comTexto = docs.filter(function (d) { return d.texto; });
        /* 15000 e não 22000: a função corta em 16000, e mandar mais fazia o
           corte cair no meio do último documento, às cegas. Assim quem decide
           o que sobra é a cota por documento, que reparte, e não uma tesoura
           no fim do texto. */
        const sobra = Math.max(2000, 15000 - digitado.length);
        const cota = comTexto.length ? Math.floor(sobra / comTexto.length) : 0;
        const doArquivo = comTexto.map(function (d) {
          const t = d.texto.length > cota ? d.texto.slice(0, cota) + '\n[…]' : d.texto;
          return '=== ' + d.nome + ' ===\n' + t;
        }).join('\n\n');
        const texto = [digitado, doArquivo].filter(Boolean).join('\n\n');

        if (texto.length < 12) {
          estado.textContent = docs.length
            ? 'Os documentos carregados não tinham texto legível. Escreva ou carregue outro.'
            : 'Escreva algo, dite, ou carregue um documento para eu ler.';
          return;
        }
        botao.disabled = true;
        estado.textContent = 'Analisando…';
        const ctx = c.contexto ? c.contexto() : {};
        global.IADIA.extrair(c.extrair, texto, ctx).then(function (r) {
          botao.disabled = false;
          /* O motivo vem do assistente e é mostrado como veio. A frase única
             de antes — "não consegui falar com o assistente" — servia para
             tempo esgotado, recusa do servidor e material grande demais, e
             mandava procurar rede e chave quando o problema era volume. */
          if (r.erro) { estado.textContent = r.erro; return; }
          const n = aplicarSugestoes(dlg, campos, r, c.nunca);
          const corte = r.cortado ? ' Li só o começo do material — era muito.' : '';
          estado.textContent = (n
            ? (n === 1 ? '1 campo preenchido — confira.' : n + ' campos preenchidos — confira.')
            : 'Não achei nada para preencher neste material.') + corte;
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
    /* O link do aviso leva para outra tela, e o diálogo modal ficaria por
       cima dela. Fechar antes de navegar é o mínimo. */
    fecharDialogos: function () {
      document.querySelectorAll('dialog[open]').forEach(function (d) { d.close('cancelar'); });
    },
    esc: esc, moeda: moeda, compacto: compacto, data: data, numero: numero,
    numeroDigitado: numeroDigitado, paraCampoMoeda: paraCampoMoeda,
    formulario: formulario, confirmar: confirmar, barra: barra, vozDisponivel: vozDisponivel,
    assistenteAtivo: assistenteAtivo, marcarSugerido: marcarSugerido, limparSugestao: limparSugestao
  };
})(window);
