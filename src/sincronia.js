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
   que o de uma faixa incômoda.

   O QUE FALTAVA, e custou dezessete oportunidades
   -----------------------------------------------
   A faixa aparecia e o envio PARAVA ali. Só voltava a tentar se a pessoa
   clicasse em "Tentar de novo" — e o que ela tinha feito existia apenas na
   aba aberta. Fechar o navegador, recarregar, o celular matar a aba: sumia,
   sem nunca ter existido em lugar nenhum.

   Três coisas mudaram, e as três são sobre não perder:

   1. A fila é gravada em disco ANTES de cada tentativa e só apagada quando o
      servidor confirma. Fechar a aba deixou de ser destruir o trabalho.
   2. O envio insiste sozinho, com espera crescente, e volta a tentar na hora
      em que a internet volta ou a aba é reaberta — que é justamente quando o
      app "ficou parado um tempo" e a sessão venceu.
   3. Antes de tentar, a sessão é renovada quando está perto de vencer. A
      falha depois da ociosidade era o token de uma hora morrendo em silêncio. */
(function (global) {
  'use strict';

  const Store = global.IADStore;

  /* `esperando` agrupa as mudanças de uma mesma ação. Pontuar uma decisão
     mexe na oportunidade e escreve um evento: são dois `salvar` seguidos, e
     mandar a carteira duas vezes não melhora nada. */
  const ESPERA = 600;

  /* A escada de reenvio. Começa rápido porque a falha mais comum é a sessão
     vencida, que a renovação resolve na primeira repetição; termina em um
     minuto porque insistir de dez em dez segundos contra um servidor fora do
     ar não ajuda ninguém e esquenta o telefone. Nunca desiste. */
  const ESCADA = [2000, 5000, 15000, 30000, 60000];

  let situacao = 'ocioso';       /* ocioso | salvando | erro */
  let recado = '';
  let enviando = false;
  let pedidoNovo = false;
  let relogio = null;
  let relogioDeNovo = null;
  let degrau = 0;
  let naFila = false;            /* há coisa gravada e não confirmada */
  /* Desde quando não consegue salvar, e quantas vezes tentou. Não é
     estatística: é o que permite ao app INTERROMPER quem está trabalhando em
     vez de deixar a pessoa empilhar uma hora de trabalho olhando para uma
     faixa no alto da tela que ela não está vendo. */
  let erradoDesde = 0;
  let falhas = 0;
  let ouvinte = null;
  /* Colunas que o banco ainda não tem. O envio passou sem elas — ninguém
     perdeu nada e nada está travado —, mas aquele campo não existe do lado de
     lá, e isso tem de aparecer. Separado de `recado` de propósito: não é erro,
     não bloqueia, e tratar as duas coisas como a mesma faria o aviso grave
     perder o peso. */
  let atrasadas = [];

  function estado() {
    return { situacao: situacao, recado: recado, naFila: naFila,
      tentandoDeNovo: !!relogioDeNovo,
      falhas: falhas, desde: erradoDesde, atrasadas: atrasadas.slice(),
      segundosParado: erradoDesde ? Math.round((Date.now() - erradoDesde) / 1000) : 0 };
  }

  function aoMudar(fn) { ouvinte = fn; }

  function avisar() { if (ouvinte) ouvinte(estado()); }

  function definir(nova, texto) {
    /* O episódio começa na primeira falha e só termina quando grava. Entre
       uma tentativa e outra a situação oscila entre 'erro' e 'salvando', e
       zerar o relógio nessa oscilação faria "há quanto tempo não salva"
       recomeçar do zero para sempre — que é como um aviso deixa de avisar. */
    if (nova === 'erro') {
      falhas++;
      if (!erradoDesde) erradoDesde = Date.now();
    } else if (nova === 'ocioso' || nova === 'pausado') {
      /* 'pausado' zera junto com 'ocioso': o relógio de "há quanto tempo não
         grava" não pode correr enquanto ninguém está logado, senão o aviso
         aparece inteiro no primeiro segundo depois do login. */
      falhas = 0;
      erradoDesde = 0;
    }
    if (situacao === nova && recado === (texto || '')) { avisar(); return; }
    situacao = nova;
    recado = texto || '';
    avisar();
  }

  /* ---------- enquanto ninguém está dentro, isto cala a boca ----------

     O relato: "aparecem mensagens toda vez que vamos entrar no sistema ou
     quando cai por 20 minutos de não uso". E a mensagem era a mais grave que
     este app tem — "O seu trabalho não está indo para o servidor" —, aberta
     por cima da TELA DE LOGIN.

     Fazia sentido do lado de dentro do código e nenhum do lado de fora. Sem
     sessão, o servidor recusa tudo; o envio falhava, a escada de reenvio
     seguia correndo e o aviso aparecia. Sozinho, era verdade. Na tela de
     login era ruído puro: quem está ali não fez nada que pudesse ter se
     perdido, não tem o que consertar, e o botão "Tentar gravar agora" ia
     falhar de novo pelo mesmo motivo.

     Pior: ensina a ignorar. O aviso existe para o dia em que o servidor cai
     no meio do trabalho de alguém — e esse dia chega depois de o vendedor já
     ter aprendido a fechar essa caixa sem ler.

     Então, sem ninguém dentro, o envio PAUSA. A fila continua gravada no
     aparelho, com o dono carimbado, e sobe no próximo login — que é o que ela
     sempre fez. O que some é o alarme sobre uma falha que não é falha. */
  function temSessao() {
    const N = global.IADNuvem;
    const A = global.IADAuth;
    const s = N && N.sessao && N.sessao();
    const dentro = A && A.atual && A.atual();
    return !!(s && s.user && s.user.id && dentro);
  }

  function donoAtual() {
    const N = global.IADNuvem;
    const s = N && N.sessao && N.sessao();
    return (s && s.user && s.user.id) || '';
  }

  /* Grava a fila antes de tentar. Se o IndexedDB não existir ou falhar, o
     envio segue: a fila é uma rede de segurança, não um pedágio. */
  /* A cópia de emergência é gravada antes de cada tentativa — e era gravada
     SEMPRE, inclusive quando não havia nada por enviar. No arranque seguinte o
     app achava essa cópia, concluía que havia trabalho perdido e anunciava
     "recuperei o que tinha ficado para trás" com os números da carteira
     inteira. Toda entrada. Sem nunca ter ficado nada para trás.

     Era o aviso de sempre virando paisagem — a mesma doença da caixa que
     abria na tela de login, num lugar diferente.

     Agora a cópia só existe quando existe trabalho para proteger. E quando
     não existe, a cópia velha some: deixá-la lá seria o mesmo anúncio errado
     amanhã. Na dúvida, `haMudancas` responde SIM — cópia à toa custa um aviso
     a mais; cópia que faltou custa o trabalho. */
  /* E a cópia do VAZIO nunca é gravada.

     Entre abrir o app e a carteira descer do servidor existe um intervalo de
     alguns segundos em que a memória está zerada. Qualquer tentativa de envio
     nesse intervalo gravava um retrato do nada — e esse retrato, no arranque
     seguinte, era colado por cima da carteira inteira.

     Carteira vazia não tem trabalho para proteger: a cópia dela não serve
     para nada e pode apagar tudo. Das duas, a segunda é a que importa. */
  function temMovimento(e) {
    return ['contas', 'contatos', 'oportunidades', 'tarefas'].some(function (n) {
      return (((e && e[n]) || []).length) > 0;
    });
  }

  function guardarFila() {
    const P = global.IADPendencias;
    if (!P || !P.disponivel() || !Store || !Store.obter) return Promise.resolve();

    const N = global.IADNuvem;
    if (N && N.haMudancas && !N.haMudancas()) return limparFila();

    const estado = Store.obter();
    if (!temMovimento(estado)) return Promise.resolve();

    return P.guardar(estado, donoAtual()).then(function (ok) {
      if (ok && !naFila) { naFila = true; avisar(); }
    });
  }

  function limparFila() {
    const P = global.IADPendencias;
    if (!P) return Promise.resolve();
    return P.limpar().then(function () {
      if (naFila) { naFila = false; avisar(); }
    });
  }

  /* A sessão do Supabase dura cerca de uma hora. Quando o app fica parado e
     alguém volta a mexer, a primeira chamada pega o token já morto. O
     `chamar` sabe renovar depois de um 401 — mas renovar ANTES é o que evita
     a falha aparecer na tela. Falhar aqui não impede a tentativa: pode ser
     que o token ainda sirva, e quem decide isso é o servidor. */
  function renovarSePreciso() {
    const N = global.IADNuvem;
    if (!N || !N.precisaRenovar || !N.precisaRenovar()) return Promise.resolve();
    return N.renovar().catch(function () {});
  }

  function agendarDeNovo() {
    if (relogioDeNovo) return;
    const espera = ESCADA[Math.min(degrau, ESCADA.length - 1)];
    degrau++;
    relogioDeNovo = setTimeout(function () {
      relogioDeNovo = null;
      enviar();
    }, espera);
    avisar();
  }

  function pararDeTentar() {
    if (relogioDeNovo) { clearTimeout(relogioDeNovo); relogioDeNovo = null; }
    degrau = 0;
  }

  function enviar() {
    const N = global.IADNuvem;

    /* Ninguém dentro: guarda e espera. Nada de erro, nada de escada, nada de
       aviso — não há falha nenhuma aqui, só ausência de quem assine. */
    if (!temSessao()) {
      pararDeTentar();
      guardarFila();
      definir('pausado', '');
      return;
    }

    /* Sem servidor configurado não há o que tentar, e insistir seria mentir.
       Mas a fila é gravada do mesmo jeito: o trabalho tem de sobreviver à
       aba, esteja o servidor de pé ou não. */
    if (!N || !N.conectado()) {
      guardarFila();
      definir('erro', 'Você está sem conexão com o servidor. O que você mudou está guardado neste aparelho ' +
        'e sobe sozinho assim que a conexão voltar.');
      agendarDeNovo();
      return;
    }
    if (enviando) { pedidoNovo = true; return; }

    enviando = true;
    definir('salvando', '');

    guardarFila()
      .then(renovarSePreciso)
      .then(function () { return N.retomarFilaCAS ? N.retomarFilaCAS() : null; })
      .then(function () { return N.empurrar(); })
      .then(function (r) {
        enviando = false;
        pararDeTentar();
        atrasadas = (r && r.atrasadas) || [];
        return limparFila();
      })
      .then(function () {
        definir('ocioso', '');
        if (pedidoNovo) { pedidoNovo = false; enviar(); }
      }, function (e) {
        enviando = false;
        pedidoNovo = false;
        definir('erro', (e && e.message) || 'erro desconhecido');
        /* Insiste sempre. Antes parava aqui, e o que estava na memória
           dependia de alguém clicar num botão que podia nem estar à vista. */
        agendarDeNovo();
      });
  }

  function agendar() {
    /* Fora da sessão não há alteração do vendedor para subir — e agendar
       serviria só para marcar a hora de um erro que não interessa a ninguém. */
    if (!temSessao()) { guardarFila(); return; }
    if (relogio) clearTimeout(relogio);
    relogio = setTimeout(function () { relogio = null; enviar(); }, ESPERA);
  }

  /* Mandar agora, sem esperar o agrupamento. É o botão "tentar de novo", e é
     também o que a volta da internet e a volta para a aba chamam. */
  function tentarDeNovo() {
    if (relogio) { clearTimeout(relogio); relogio = null; }
    pararDeTentar();
    enviar();
  }

  /* Chamado quando alguém entra. A fila que ficou da sessão anterior — ou do
     logout por ociosidade — sobe agora, que é o primeiro instante em que ela
     PODE subir. */
  function retomar() {
    if (!temSessao()) return;
    tentarDeNovo();
  }

  /* A saída honesta quando o envio não vai mesmo: jogar fora o que está na
     memória e recomeçar do que o servidor tem. Perde a alteração — e é isso
     que a pergunta diz, com todas as letras, antes de fazer.

     Agora apaga a fila junto, e só depois recarrega. Sem isso, a entrada
     seguinte ofereceria de volta exatamente o que a pessoa acabou de mandar
     jogar fora. */
  function descartarERecarregar() {
    definir('ocioso', '');
    pararDeTentar();
    limparFila().then(function () { location.reload(); },
      function () { location.reload(); });
  }

  /* O que ficou de uma sessão anterior que não chegou ao fim.

     Não é lido para montar a tela — continua valendo que o servidor é a
     única verdade. É a fila de envio que sobreviveu ao fechamento da aba, e
     o que ela merece é subir, não ser mostrada. */
  function filaPendente() {
    const P = global.IADPendencias;
    if (!P) return Promise.resolve(null);
    return P.ler(donoAtual());
  }

  function marcarNaFila(tem) {
    if (naFila !== !!tem) { naFila = !!tem; avisar(); }
  }

  function ligar() {
    if (Store && Store.quandoMudar) Store.quandoMudar(agendar);

    /* Os dois momentos em que vale a pena tentar de novo na hora, em vez de
       esperar o próximo degrau da escada: a internet voltou, ou a pessoa
       voltou para a aba. O segundo é exatamente o caso do relato — o app
       ficou parado, a sessão venceu, e a primeira ação depois disso falhava. */
    global.addEventListener('online', function () {
      if (!temSessao()) return;
      if (situacao === 'erro' || situacao === 'pausado' || naFila) tentarDeNovo();
    });
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.visibilityState !== 'visible') return;
      if (!temSessao()) return;
      if (situacao === 'erro' || situacao === 'pausado' || naFila) tentarDeNovo();
      else renovarSePreciso();
    });
  }

  global.IADSincronia = {
    ligar, agendar, enviar, tentarDeNovo, retomar, descartarERecarregar, estado, aoMudar,
    filaPendente, limparFila, marcarNaFila, temSessao
  };
})(window);
