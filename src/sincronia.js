/* Quem leva ao servidor cada alteração, e conta quando não conseguiu.
   ==================================================================
   Antes, guardar era escrever no navegador e o envio acontecia uma vez por
   login. Entre um login e outro, o que a pessoa fazia existia só ali — e foi
   dessa janela que saiu tudo o que deu errado: dois computadores com
   carteiras diferentes, envio recusado sem ninguém ver, e a dúvida
   permanente sobre qual das cópias era a boa.

   Agora cada mudança sobe na hora. O que o servidor não aceitou não fica
   fingindo que está salvo: vira uma faixa que não sai da tela até ser
   resolvida, porque o preço de uma alteração perdida em silêncio é mais alto
   que o de uma faixa incômoda. */
(function (global) {
  'use strict';

  const Store = global.IADStore;

  /* `esperando` agrupa as mudanças de uma mesma ação. Pontuar uma decisão
     mexe na oportunidade e escreve um evento: são dois `salvar` seguidos, e
     mandar a carteira duas vezes não melhora nada. */
  const ESPERA = 600;

  let situacao = 'ocioso';       /* ocioso | salvando | erro */
  let recado = '';
  let enviando = false;
  let pedidoNovo = false;
  let relogio = null;
  let ouvinte = null;

  function estado() { return { situacao: situacao, recado: recado }; }

  function aoMudar(fn) { ouvinte = fn; }

  function avisar() { if (ouvinte) ouvinte(estado()); }

  function definir(nova, texto) {
    if (situacao === nova && recado === (texto || '')) return;
    situacao = nova;
    recado = texto || '';
    avisar();
  }

  function enviar() {
    const N = global.IADNuvem;
    if (!N || !N.conectado()) {
      definir('erro', 'Você está sem conexão com o servidor. Nada do que você mudou agora foi salvo.');
      return;
    }
    if (enviando) { pedidoNovo = true; return; }

    enviando = true;
    definir('salvando', '');
    N.empurrar().then(function () {
      enviando = false;
      definir('ocioso', '');
      if (pedidoNovo) { pedidoNovo = false; enviar(); }
    }, function (e) {
      enviando = false;
      pedidoNovo = false;
      definir('erro', (e && e.message) || 'erro desconhecido');
    });
  }

  function agendar() {
    if (relogio) clearTimeout(relogio);
    relogio = setTimeout(function () { relogio = null; enviar(); }, ESPERA);
  }

  /* Mandar agora, sem esperar o agrupamento. É o botão "tentar de novo". */
  function tentarDeNovo() {
    if (relogio) { clearTimeout(relogio); relogio = null; }
    enviar();
  }

  /* A saída honesta quando o envio não vai mesmo: jogar fora o que está na
     memória e recomeçar do que o servidor tem. Perde a alteração — e é isso
     que a pergunta diz, com todas as letras, antes de fazer. */
  function descartarERecarregar() {
    definir('ocioso', '');
    location.reload();
  }

  function ligar() {
    if (Store && Store.quandoMudar) Store.quandoMudar(agendar);
  }

  global.IADSincronia = {
    ligar, agendar, enviar, tentarDeNovo, descartarERecarregar, estado, aoMudar
  };
})(window);
