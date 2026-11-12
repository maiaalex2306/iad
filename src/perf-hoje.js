/* PERF-01: atualização localizada da tela Hoje.
   Orientação vinda da IA NÃO altera IAD, urgência nem ordenação. Portanto
   só repinta a seção da orientação do cartão visível; evita recalcular 243
   negócios a cada uma das até 60 leituras automáticas do dia. */
(function (global) {
  'use strict';
  function visivelHoje() {
    return (global.location.hash || '') === '#/hoje' &&
      global.IADAuth && global.IADAuth.atual && !!global.IADAuth.atual();
  }
  function atualizarOrientacao(item) {
    if (!visivelHoje() || !item || !item.resumo || !item.resumo.op) return false;
    const id = String(item.resumo.op.id || '');
    const atual = global.IADStore.oportunidade(id);
    /* Evita pintar resposta de sessão/carteira anterior após trocar usuário. */
    if (!atual || atual !== item.resumo.op) return false;
    const lista = document.querySelectorAll('.iad-orientacao-foco[data-op-id]');
    for (let i = 0; i < lista.length; i++) {
      const alvo = lista[i];
      if (alvo.getAttribute('data-op-id') !== id) continue;
      const views = global.IADViews;
      if (!views || !views.orientacaoFoco) return false;
      const p = global.IADPerformance;
      const atualizar = function () { alvo.innerHTML = views.orientacaoFoco(item); };
      if (p) p.medir('hoje.orientacao-local', atualizar);
      else atualizar();
      return true;
    }
    /* Negócio fora da página atual: será desenhado quando usuário navegar. */
    return false;
  }
  function atualizarProgresso(feitos,total,fase) {
    if (!visivelHoje()) return false;
    const bloco = document.querySelector('.analise-dia[data-iad-progresso]');
    if (!bloco) return false;
    const contador = bloco.querySelector('[data-iad-contador]');
    const barra = bloco.querySelector('[data-iad-barra]');
    const texto = bloco.querySelector('[data-iad-fase]');
    if (!contador || !barra || !texto) return false;
    contador.textContent = feitos + ' de ' + total;
    barra.style.width = Math.max(0,Math.min(100,total ? Math.round(feitos*100/total) : 0)) + '%';
    texto.textContent = (fase || '') + ' Pode continuar trabalhando — ela avisa quando terminar.';
    return true;
  }
  global.IADPerfHoje = { atualizarOrientacao:atualizarOrientacao,
    atualizarProgresso:atualizarProgresso };
})(window);
