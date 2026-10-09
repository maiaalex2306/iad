/* Ajuda de contexto para qualquer elemento da tela.

   Em vez de escrever um balão dentro de cada botão — que dá certo hoje e é
   esquecido no próximo botão —, aqui há um balão só, flutuante, e qualquer
   elemento pede ajuda declarando data-ajuda. Um lugar para consertar, e
   impossível de esquecer: quem não declara simplesmente não tem balão.

   A posição é calculada na hora — sem regras de CSS por posição — e obedece a
   uma regra acima de qualquer outra: o balão NUNCA cobre o elemento que ele
   explica. Ajuda que tapa o botão impede o clique, e some quando a pessoa tira
   o mouse para enxergar. */
(function (global) {
  'use strict';

  const MARGEM = 8;
  let balao = null;
  let alvoAtual = null;

  function criar() {
    if (balao) return balao;
    balao = document.createElement('div');
    balao.className = 'balao-ajuda';
    balao.setAttribute('role', 'tooltip');
    document.body.appendChild(balao);
    return balao;
  }

  function esconder() {
    alvoAtual = null;
    if (balao) balao.classList.remove('visivel');
  }

  function mostrar(el) {
    const texto = el.getAttribute('data-ajuda');
    if (!texto) return;
    alvoAtual = el;

    const b = criar();
    const esc = global.IADUI.esc;
    const titulo = el.getAttribute('data-ajuda-titulo');

    /* Havia dois balões no app: este, flutuante, e um segundo escrito dentro
       de cada botão, com rótulo e linhas. Dois desenhos para a mesma coisa é
       a pessoa aprendendo duas vezes — e o segundo só existia porque este não
       sabia mostrar linha com rótulo. Agora sabe, e o outro deixou de existir.

       O formato é JSON no atributo: [rótulo, texto, destaque?]. Atributo com
       texto livre separado por algum caractere quebra no dia em que o texto
       contiver o caractere, e esse dia sempre chega. */
    let linhas = [];
    const bruto = el.getAttribute('data-ajuda-linhas');
    if (bruto) { try { linhas = JSON.parse(bruto) || []; } catch (e) { linhas = []; } }

    const alerta = el.getAttribute('data-ajuda-alerta');

    b.innerHTML = (titulo ? '<strong>' + esc(titulo) + '</strong>' : '') +
      '<span>' + esc(texto) + '</span>' +
      linhas.map(function (l) {
        return '<b class="rot">' + esc(l[0]) + '</b>' +
          '<span class="linha' + (l[2] ? ' agora' : '') + '">' + esc(l[1]) + '</span>';
      }).join('') +
      (alerta ? '<span class="alerta">' + esc(alerta) + '</span>' : '');

    /* Medir antes de posicionar: só assim dá para saber se cabe. */
    b.style.left = '0px';
    b.style.top = '0px';
    b.style.maxHeight = '';
    b.style.overflowY = '';
    b.classList.add('visivel');

    const r = el.getBoundingClientRect();
    const cx = b.offsetWidth, cy = b.offsetHeight;
    const largura = document.documentElement.clientWidth;
    const altura = document.documentElement.clientHeight;

    /* O BALÃO NUNCA PODE COBRIR O QUE ELE EXPLICA.

       Antes ele tentava embaixo e, se não coubesse, em cima — com um
       `Math.max(MARGEM, ...)` no fim. Esse Math.max era a armadilha: quando o
       balão era mais alto que o espaço acima do elemento, ele não ia para
       cima, ia para o TOPO DA TELA, em cima do próprio botão e de todos os
       vizinhos. A ajuda mais longa do app, num botão da barra do alto da
       página, caía exatamente nesse caso — e a ajuda do botão tapava o botão,
       junto com os quatro ao lado. Ajuda que impede o clique é pior do que
       ajuda nenhuma: a pessoa some o mouse para ler e o balão some junto.

       Agora são quatro tentativas, e a primeira que couber INTEIRA ganha:
       embaixo, em cima, à direita, à esquerda. Os lados nunca sobrepõem, então
       em tela baixa — notebook, janela pela metade — ele ainda tem para onde
       ir. Se nenhuma couber, vale a de maior folga e o balão ganha ROLAGEM em
       vez de invadir o elemento: ajuda rolável se lê, ajuda por cima do botão
       não se clica. */
    const vaos = [
      { eixo: 'y', onde: 'baixo', cabe: altura - r.bottom - 2 * MARGEM },
      { eixo: 'y', onde: 'cima', cabe: r.top - 2 * MARGEM },
      { eixo: 'x', onde: 'direita', cabe: largura - r.right - 2 * MARGEM },
      { eixo: 'x', onde: 'esquerda', cabe: r.left - 2 * MARGEM }
    ];
    const precisa = function (v) { return v.eixo === 'y' ? cy : cx; };

    let vao = vaos.filter(function (v) { return precisa(v) <= v.cabe; })[0];
    if (!vao) {
      /* Nenhum cabe. Fica o de maior sobra — e, entre dois quase iguais, o de
         cima ou de baixo, porque o balão é estreito e alto: cortar altura
         custa menos leitura do que espremer largura. */
      vao = vaos.slice().sort(function (a, b2) {
        return (b2.cabe - precisa(b2)) - (a.cabe - precisa(a));
      })[0];
    }

    /* Altura máxima: o vão escolhido, quando a escolha é vertical; a tela
       inteira menos as margens, quando é lateral. Em qualquer dos casos o
       balão passa a CABER onde foi posto, e o encosto abaixo não tem como
       trazê-lo de volta por cima do elemento. */
    const teto = vao.eixo === 'y' ? vao.cabe : altura - 2 * MARGEM;
    if (cy > teto) {
      b.style.maxHeight = Math.max(48, teto) + 'px';
      b.style.overflowY = 'auto';
    }

    const ch = b.offsetHeight, cw = b.offsetWidth;
    let x, y;
    if (vao.onde === 'baixo') { x = r.left; y = r.bottom + MARGEM; }
    else if (vao.onde === 'cima') { x = r.left; y = r.top - ch - MARGEM; }
    else if (vao.onde === 'direita') { x = r.right + MARGEM; y = r.top; }
    else { x = r.left - cw - MARGEM; y = r.top; }

    /* Encostar na borda sem sair dela. O eixo da escolha fica de fora: é ele
       que garante o não-sobrepor, e encostá-lo desfaria a garantia. */
    const presoX = function (v) { return Math.min(Math.max(MARGEM, v), Math.max(MARGEM, largura - cw - MARGEM)); };
    const presoY = function (v) { return Math.min(Math.max(MARGEM, v), Math.max(MARGEM, altura - ch - MARGEM)); };
    if (vao.eixo === 'y') { x = presoX(x); } else { y = presoY(y); }

    b.style.left = Math.round(x + global.scrollX) + 'px';
    b.style.top = Math.round(y + global.scrollY) + 'px';
  }

  function ligar() {
    /* Delegação: vale para o que já está na tela e para o que for redesenhado,
       que neste app é a tela inteira a cada ação. */
    document.addEventListener('mouseover', function (e) {
      const el = e.target.closest ? e.target.closest('[data-ajuda]') : null;
      if (el === alvoAtual) return;
      if (el) mostrar(el); else esconder();
    });
    document.addEventListener('focusin', function (e) {
      const el = e.target.closest ? e.target.closest('[data-ajuda]') : null;
      if (el) mostrar(el);
    });
    document.addEventListener('focusout', esconder);
    document.addEventListener('click', esconder);
    /* Sem esconder ao rolar: a posição é gravada em coordenadas do documento,
       então o balão acompanha o elemento. Esconder ali apagava a ajuda de quem
       rolava a página para chegar até o botão — que é como se chega à maioria
       deles. Redimensionar muda o layout, aí sim o cálculo perde a validade. */
    global.addEventListener('resize', esconder);
  }

  global.IADAjuda = { ligar: ligar, esconder: esconder };
})(window);
