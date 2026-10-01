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
    /* Sem esconder ao rolar: a posição é gravada em coordenadas do documento,
       então o balão acompanha o elemento. Esconder ali apagava a ajuda de quem
       rolava a página para chegar até o botão — que é como se chega à maioria
       deles. Redimensionar muda o layout, aí sim o cálculo perde a validade. */
    global.addEventListener('resize', esconder);
  }

  global.IADAjuda = { ligar: ligar, esconder: esconder };
})(window);
