/* Ajuda de contexto para qualquer elemento da tela.

   Em vez de escrever um balão dentro de cada botão — que dá certo hoje e é
   esquecido no próximo botão —, aqui há um balão só, flutuante, e qualquer
   elemento pede ajuda declarando data-ajuda. Um lugar para consertar, e
   impossível de esquecer: quem não declara simplesmente não tem balão.

   A posição é calculada na hora, então o balão vira para cima ou para a
   esquerda quando encostaria na borda — sem regras de CSS por posição. */
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
    const titulo = el.getAttribute('data-ajuda-titulo');
    b.innerHTML = (titulo ? '<strong>' + global.IADUI.esc(titulo) + '</strong>' : '') +
      '<span>' + global.IADUI.esc(texto) + '</span>';

    /* Medir antes de posicionar: só assim dá para saber se cabe. */
    b.style.left = '0px';
    b.style.top = '0px';
    b.classList.add('visivel');

    const r = el.getBoundingClientRect();
    const cx = b.offsetWidth, cy = b.offsetHeight;
    const largura = document.documentElement.clientWidth;
    const altura = document.documentElement.clientHeight;

    let x = r.left;
    if (x + cx + MARGEM > largura) x = Math.max(MARGEM, r.right - cx);

    let y = r.bottom + MARGEM;
    if (y + cy + MARGEM > altura) y = Math.max(MARGEM, r.top - cy - MARGEM);

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
    global.addEventListener('scroll', esconder, true);
    global.addEventListener('resize', esconder);
  }

  global.IADAjuda = { ligar: ligar, esconder: esconder };
})(window);
