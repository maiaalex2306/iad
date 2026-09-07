/* Assistente de preenchimento.

   O que este arquivo NÃO faz, de propósito: não fala com nenhuma IA. Ele fala
   com a Edge Function do Supabase (nuvem/funcoes/assistente), onde a chave
   mora. Trocar Groq por outro provedor não toca em uma linha daqui.

   Regra de comportamento: nenhuma tela pode esperar por IA. Toda chamada tem
   prazo, toda falha é silenciosa, e o formulário continua funcionando
   exatamente como funcionava antes de existir assistente. */
(function (global) {
  'use strict';

  const Nuvem = global.IADNuvem;
  const PRAZO = 12000;
  const PRAZO_REUNIAO = 60000;

  /* Estar conectado ao servidor não quer dizer que a função do assistente foi
     publicada — são dois passos separados, e o segundo é manual. Sem esta
     distinção o app mostrava a caixa ✨ para todo mundo e só descobria a
     ausência quando a pessoa clicava: um botão morto, que é pior do que botão
     nenhum. Enquanto não houver resposta do servidor, o assistente não existe. */
  let situacao = 'desconhecido';   /* desconhecido | ok | ausente */
  let ultimaFalha = null;          /* {status, mensagem} da última recusa */

  function disponivel() {
    return !!(Nuvem && Nuvem.conectado()) && situacao === 'ok';
  }

  /* Bate na função uma vez para saber se ela está publicada. Não gasta chamada
     de IA: texto curto faz o servidor responder vazio antes de falar com o
     modelo. Resolve com true quando a resposta muda o que a tela deve mostrar. */
  function verificar() {
    if (!Nuvem || !Nuvem.conectado()) {
      const mudou = situacao === 'ok';
      situacao = 'desconhecido';
      return Promise.resolve(mudou);
    }
    const antes = situacao;
    return Nuvem.chamarFuncao('assistente', { tipo: 'classificar', texto: '' })
      .then(function () { situacao = 'ok'; ultimaFalha = null; })
      .catch(function (e) {
        /* 503 é "publicada, sem chave" — para o vendedor dá no mesmo. */
        situacao = (e && e.status === 401) ? 'desconhecido' : 'ausente';
        ultimaFalha = { status: (e && e.status) || 0, mensagem: (e && e.message) || '' };
      })
      .then(function () { return situacao !== antes; });
  }

  /* Para o vendedor, assistente ausente é ausente e pronto: nada aparece, e
     nada quebra. Mas quem publicou a função precisa saber por que ela não
     respondeu — sem isto a única saída é o console do navegador, e "não
     aparece nada" é o pior diagnóstico que se pode dar a alguém que acabou de
     seguir dez passos. Traduzimos os casos que de fato acontecem. */
  function diagnostico() {
    if (!Nuvem || !Nuvem.conectado()) {
      return { situacao: 'desconhecido', titulo: 'Sem servidor',
        texto: 'Entre com a sua conta do servidor para o assistente valer.' };
    }
    if (situacao === 'ok') {
      return { situacao: 'ok', titulo: 'No ar',
        texto: 'A função respondeu. As caixas ✨ e os botões de análise aparecem.' };
    }
    /* 401 vinha rotulado como "ainda não sei" e mandava sair e entrar de novo.
       Errado nos dois: a função respondeu — logo está publicada e alcançável —
       e o problema quase nunca é a sessão de quem está usando, e sim a função
       não conseguir conferir o token. Ela própria explica o motivo agora, e o
       melhor que esta tela faz é repetir o que ela disse. */
    if (situacao === 'desconhecido') {
      const f401 = ultimaFalha || {};
      /* Esta recusa não vem da função: vem do porteiro do Supabase, antes
         dela. Quem ele recusou foi a chave que o próprio app manda em toda
         chamada — e o resto do app continua funcionando porque o banco e o
         login ainda aceitam a chave antiga; só o portão das Edge Functions
         passou a exigir a nova. Por isso o sintoma é "tudo funciona menos a
         IA", que não parece problema de chave nenhuma. */
      if (/matched no key|auth mode/i.test(f401.mensagem || '')) {
        return { situacao: 'ausente', titulo: 'A chave do app é a antiga',
          texto: 'O Supabase recusou a chave que este app usa. O formato mudou: ' +
            'a antiga (eyJ...) ainda vale para o banco e o login, mas já não vale ' +
            'para as Edge Functions.\n\nCorreção: Settings → API Keys → copie a ' +
            'chave publishable (sb_publishable_...). Depois, aqui nesta tela, ' +
            'Nuvem (Supabase) → Alterar → cole no campo da chave.' };
      }
      if (f401.status === 401) {
        return { situacao: 'ausente', titulo: 'A função recusou a chamada',
          texto: f401.mensagem ||
            'O servidor respondeu 401 sem explicar. Confira o segredo ' +
            'IAD_CHAVE_PUBLICA em Edge Functions → assistente → Secrets.' };
      }
      return { situacao: 'desconhecido', titulo: 'Ainda não sei',
        texto: 'Entre com a sua conta do servidor para o assistente valer.' };
    }
    const f = ultimaFalha || {};
    if (f.status === 503) {
      return { situacao: 'ausente', titulo: 'Publicada, sem a chave da IA',
        texto: 'A função está no ar, mas falta o segredo IA_CHAVE. ' +
          'Edge Functions → assistente → Secrets. Ver nuvem/IA.md.' };
    }
    if (!f.status) {
      return { situacao: 'ausente', titulo: 'O navegador não chegou na função',
        texto: 'Ou ela não foi publicada com o nome "assistente", ou o ' +
          '"Verify JWT" dela está ligado — e aí o pedido nem sai. ' +
          'Edge Functions → assistente → Settings. Ver nuvem/IA.md.' };
    }
    return { situacao: 'ausente', titulo: 'O servidor respondeu ' + f.status,
      texto: f.mensagem || 'Sem detalhe. Veja os logs da função no painel do Supabase.' };
  }


  /* O que cabe num pedido. Quatro propostas em Word passam de duzentos mil
     caracteres, e nenhum modelo aceita isso num pedido só — o servidor recusa
     e o app dizia "não consegui falar com o assistente", que manda procurar
     rede e chave quando o problema é volume. Cortamos antes de mandar, e
     dizemos que cortamos: material demais some, e some justamente a parte que
     a pessoa carregou por último. */
  const LIMITE_PEDIDO = 24000;

  /* O corpo que voltou, legível e curto. `mensagem` é o campo que o nuvem.js
     usa quando a resposta não era JSON — ali está o texto cru, que é
     justamente o que interessa quando nada mais faz sentido. */
  function amostraDaResposta(r) {
    let t;
    if (r && typeof r.mensagem === 'string') t = r.mensagem;
    else { try { t = JSON.stringify(r); } catch (e) { t = String(r); } }
    t = String(t || '').replace(/\s+/g, ' ').trim();
    return t.length > 180 ? t.slice(0, 180) + '…' : (t || '(nada)');
  }

  /* Devolve {campos, frases} quando deu certo, {erro} quando não. Antes
     devolvia null para tudo — tempo esgotado, recusa do servidor, texto curto
     — e a tela tinha uma frase só para três causas diferentes. Frase única
     para causas diferentes é o que faz alguém mexer no lugar errado. */
  function extrair(tipo, texto, contexto) {
    if (!disponivel()) return Promise.resolve({ erro: 'O assistente não está no ar. Veja ⚙︎ Dados → Assistente de IA.' });
    let t = String(texto || '').trim();
    if (t.length < 12) return Promise.resolve({ erro: 'Texto curto demais para eu ler.' });

    let cortado = false;
    if (t.length > LIMITE_PEDIDO) { t = t.slice(0, LIMITE_PEDIDO); cortado = true; }

    /* Documento leva mais tempo que uma frase digitada, e o prazo curto existe
       para a sugestão que aparece enquanto se escreve. Um prazo só servia mal
       aos dois casos. */
    const prazoDaVez = t.length > 2000 ? PRAZO_REUNIAO : PRAZO;

    const pedido = Nuvem.chamarFuncao('assistente', {
      tipo: tipo, texto: t, contexto: contexto || {}
    }).then(
      function (r) { return { resposta: r }; },
      function (e) { return { falha: e }; }
    );

    const prazo = new Promise(function (resolve) {
      setTimeout(function () { resolve({ estourou: true }); }, prazoDaVez);
    });

    return Promise.race([pedido, prazo]).then(function (x) {
      if (x.estourou) {
        return { erro: 'O assistente demorou mais de ' + Math.round(prazoDaVez / 1000) +
          ' segundos. Tente com menos documentos de uma vez.' };
      }
      if (x.falha) {
        return { erro: x.falha.message || 'O servidor recusou a análise.' };
      }
      const r = x.resposta;
      if (!r) return { erro: 'O servidor respondeu vazio.' };
      if (r.erro) return { erro: r.erro };
      /* A função sempre devolve `campos`, nem que venha vazio. Chegar aqui sem
         ele quer dizer que o que respondeu não foi a função — corpo que não é
         JSON, página de erro do gateway, worker que caiu no meio. Dizer só
         "não devolveu campos" põe a culpa na função e esconde o que veio.
         Então mostramos o que veio, cortado, e a próxima pessoa não precisa
         abrir o console para descobrir. */
      if (!r.campos) {
        return { erro: 'O assistente respondeu, mas não no formato esperado. ' +
          'Voltou: ' + amostraDaResposta(r) };
      }
      return { campos: r.campos, frases: r.frases || {},
        contatos: Array.isArray(r.contatos) ? r.contatos : [],
        empresa: (r.empresa && typeof r.empresa === 'object') ? r.empresa : null,
        cortado: cortado };
    });
  }

  /* Uma reunião inteira. Devolve {evidencias:[], contatos:[]} ou null.
     Prazo maior porque aqui o modelo lê uma transcrição, não uma frase. */
  function analisarReuniao(texto, contexto) {
    if (!disponivel()) return Promise.resolve(null);
    const t = String(texto || '').trim();
    if (t.length < 60) return Promise.resolve(null);

    const pedido = Nuvem.chamarFuncao('assistente', {
      tipo: 'reuniao', texto: t, contexto: contexto || {}
    });
    const prazo = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, PRAZO_REUNIAO);
    });

    return Promise.race([pedido, prazo]).then(function (r) {
      if (!r || r.erro || !Array.isArray(r.evidencias)) return null;
      return { evidencias: apenasConhecidas(r.evidencias), contatos: r.contatos || [] };
    }).catch(function () { return null; });
  }

  /* A função no servidor já descarta dimensão fora das oito. Aqui é descartado
     de novo, de propósito: quem grava no banco é este lado. Uma dimensão
     desconhecida viraria uma chave nova em op.dims — um número no painel do
     gestor que o engine não sabe somar nem explicar. */
  function apenasConhecidas(lista) {
    const P = global.IADPlaybook;
    const dimensoes = P.DIMENSOES.map(function (d) { return d.id; });
    const forcas = P.FORCAS.map(function (f) { return f.id; });
    return lista.filter(function (ev) {
      return ev && ev.titulo && dimensoes.indexOf(ev.dimensao) !== -1;
    }).map(function (ev) {
      if (forcas.indexOf(ev.forca) === -1) ev.forca = 'relato';
      return ev;
    });
  }

  /* Classifica um lote de empresas nos segmentos já cadastrados. Uma chamada
     para a importação inteira, não uma por lead.

     O modelo não navega na internet — quem navega é a função no servidor, e
     só para alguns domínios. Na maioria dos casos nem precisa: a descrição da
     empresa já veio no payload do Linked Helper. Quando nada resolve, o
     resultado é "Outros", que é melhor que um segmento errado: o gráfico por
     segmento é lido pelo dono da empresa. */
  function classificarSegmentos(empresas) {
    if (!disponivel() || !empresas.length) return Promise.resolve({});

    const linhas = empresas.map(function (e, i) {
      return [
        (i + 1) + '. ' + (e.nome || 'sem nome'),
        e.dominio ? '   domínio: ' + e.dominio : '',
        e.setor ? '   setor informado: ' + e.setor : '',
        e.descricao ? '   sobre: ' + e.descricao : '',
        e.oQueFazLa ? '   o contato faz lá: ' + e.oQueFazLa : ''
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    const Store = global.IADStore;
    const pedido = Nuvem.chamarFuncao('assistente', {
      tipo: 'segmentos',
      texto: linhas,
      contexto: {
        segmentos: Store.nomesDoCatalogo('segmentos'),
        dominios: empresas.map(function (e) { return e.dominio; }).filter(Boolean)
      }
    });
    const prazo = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, PRAZO_REUNIAO);
    });

    return Promise.race([pedido, prazo]).then(function (r) {
      const mapa = {};
      if (!r || !Array.isArray(r.itens)) return mapa;
      r.itens.forEach(function (it) {
        const i = Number(it.n) - 1;
        if (empresas[i] && it.segmento) mapa[i] = it.segmento;
      });
      return mapa;
    }).catch(function () { return {}; });
  }

  /* ---------- o retrato de uma oportunidade ----------
     O motor já sabe o que está fraco: nextBestDecision, lacunas, gates e
     alertas são cálculo, não opinião, e continuam sendo a fonte da verdade.
     O que a IA acrescenta é ler o que o CLIENTE disse — as evidências em
     texto — e transformar isso em passo executável, na linguagem dele.

     Por isso o retrato leva as evidências, não só as notas. Sem elas o modelo
     devolveria o mesmo conselho genérico que o motor já dá melhor. */
  function retratoDaOportunidade(op, r) {
    const P = global.IADPlaybook;
    const E = global.IADEngine;
    const linhas = [];

    linhas.push('CONTA: ' + ((r.conta && r.conta.nome) || 'sem conta') +
      ((r.conta && r.conta.segmento) ? ' · segmento ' + r.conta.segmento : '') +
      ((r.conta && r.conta.porte) ? ' · porte ' + r.conta.porte : ''));
    linhas.push('OPORTUNIDADE: ' + op.titulo + ' · etapa ' + op.etapa +
      ' há ' + r.tempoNaEtapa + ' dias · tipo ' + (op.tipo || 'Novo negócio'));
    linhas.push('IAD: ' + r.iad + ' de 16 · classificação ' + r.classe.rotulo +
      ' · sem evidência nova do cliente há ' + r.evidenceAge + ' dias');
    if (op.concorrentes) linhas.push('CONCORRENTES DECLARADOS: ' + op.concorrentes);
    if (op.insight && op.insight.texto) {
      linhas.push('INSIGHT (' + op.insight.estado + '): ' + op.insight.texto.slice(0, 300));
    }

    linhas.push('');
    linhas.push('AS OITO DECISÕES:');
    P.DIMENSOES.forEach(function (d) {
      const nota = op.dims[d.id] || 0;
      const provas = E.evidenciasDaDimensao(op, d.id).slice(-2).map(function (ev) {
        return '     · ' + (ev.data || '') + ' [' + (ev.forca || 'relato') + '] ' + ev.titulo;
      });
      linhas.push('  ' + d.nome + ': ' + nota + '/2 — ' + d.niveis[nota]);
      if (provas.length) linhas.push(provas.join('\n'));
    });

    const pessoas = E.stakeholdersDaOp(op);
    linhas.push('');
    linhas.push('GRUPO DE COMPRA (' + pessoas.length + ' pessoas):');
    pessoas.forEach(function (p) {
      linhas.push('  ' + p.nome + ' — ' + (p.cargo || 'cargo não informado') +
        ' · papel ' + p.papel + ' · posição ' + p.sentimento);
    });
    if (!pessoas.length) linhas.push('  ninguém mapeado');

    if (r.compromisso) {
      linhas.push('');
      linhas.push('COMBINADO: ' + r.compromisso.texto + ' · para ' + r.compromisso.data +
        ' · a vez é ' + (r.compromisso.dono === 'cliente' ? 'do cliente' : 'nossa'));
    }
    /* Disciplina de método: o assistente precisa distinguir o vendedor que
       planeja e cumpre do que anota depois — e o canal por onde ele fala.
       Sem isto, "o que fazer agora" sai igual para os dois, e não é. */
    const tarefas = global.IADStore.tarefasDaOportunidade(op.id);
    if (tarefas.length) {
      const feitas = tarefas.filter(function (t) { return t.status !== 'aberta'; });
      const planejadas = feitas.filter(function (t) { return t.origem !== 'registrada'; });
      const comAta = feitas.filter(function (t) { return t.comRelato; });
      const abertas = tarefas.filter(function (t) { return t.status === 'aberta'; });
      const canais = {};
      feitas.forEach(function (t) { if (t.tipo) canais[t.tipo] = (canais[t.tipo] || 0) + 1; });
      linhas.push('');
      linhas.push('TAREFAS: ' + feitas.length + ' feita(s) — ' + planejadas.length +
        ' planejada(s) antes e ' + (feitas.length - planejadas.length) +
        ' anotada(s) depois de acontecer · ' + comAta.length + ' com ata lida · ' +
        abertas.length + ' em aberto');
      const porCanal = Object.keys(canais).map(function (c) { return c + ' ' + canais[c]; });
      if (porCanal.length) linhas.push('CANAIS USADOS: ' + porCanal.join(', '));
      abertas.slice(0, 4).forEach(function (t) {
        linhas.push('  em aberto: ' + (t.tipo ? '[' + t.tipo + '] ' : '') + t.titulo +
          ' · para ' + t.vencimento);
      });
    }

    const pendentes = (r.gates && r.gates.pendentes) || [];
    if (pendentes.length) {
      linhas.push('GATES DA PROPOSTA AINDA NÃO ATENDIDOS: ' +
        pendentes.map(function (g) {
          return g.nome + ' (tem ' + g.atual + ', precisa de ' + g.min + ')';
        }).join(', '));
    }
    const semPapel = (r.coverage && r.coverage.faltando) || [];
    if (semPapel.length) {
      linhas.push('PAPÉIS CRÍTICOS SEM NINGUÉM: ' + semPapel.join(', '));
    }
    if (r.alertas && r.alertas.length) {
      linhas.push('ALERTAS DO SISTEMA: ' + r.alertas.map(function (a) {
        return a.texto || a.titulo || String(a);
      }).join(' | '));
    }

    return linhas.join('\n');
  }

  /* Próximos passos amarrados a decisões. etapaNova, quando vem, faz a
     análise responder "o que esta etapa exige e ainda não está provado". */
  function planoDaOportunidade(op, r, etapaNova) {
    if (!disponivel()) return Promise.resolve(null);

    const pedido = Nuvem.chamarFuncao('assistente', {
      tipo: 'plano',
      texto: retratoDaOportunidade(op, r),
      contexto: { hoje: global.IADStore.hoje(), etapaNova: etapaNova || '' }
    });
    const prazo = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, PRAZO_REUNIAO);
    });

    return Promise.race([pedido, prazo]).then(function (resp) {
      if (!resp || resp.erro || !Array.isArray(resp.passos)) return null;
      const dimensoes = global.IADPlaybook.DIMENSOES.map(function (d) { return d.id; });
      return {
        passos: resp.passos.filter(function (x) {
          return x && x.acao && dimensoes.indexOf(x.dimensao) !== -1;
        }),
        atencao: resp.atencao || []
      };
    }).catch(function () { return null; });
  }

  /* As oito notas propostas a partir do que já está registrado, mais o texto
     de uma reunião quando o vendedor colar uma.

     Isto não fere a regra de que a IA não pontua: ela PROPÕE, o vendedor
     confere as oito de uma vez e confirma, e a trava do motor continua de pé —
     nota 2 sem evidência confirmada cai para 1, venha de onde vier. O que
     muda é o custo: oito formulários viram uma tela. */
  function sugerirNotas(op, r, textoExtra) {
    if (!disponivel()) return Promise.resolve(null);

    let retrato = retratoDaOportunidade(op, r);
    const extra = String(textoExtra || '').trim();
    if (extra) retrato += '\n\nREUNIÃO QUE O VENDEDOR ACABOU DE COLAR:\n' + extra;

    const pedido = Nuvem.chamarFuncao('assistente', {
      tipo: 'notas', texto: retrato, contexto: { hoje: global.IADStore.hoje() }
    });
    const prazo = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, PRAZO_REUNIAO);
    });

    return Promise.race([pedido, prazo]).then(function (resp) {
      if (!resp || resp.erro || !Array.isArray(resp.decisoes)) return null;
      const dimensoes = global.IADPlaybook.DIMENSOES.map(function (d) { return d.id; });
      return resp.decisoes.filter(function (d) {
        return d && dimensoes.indexOf(d.dimensao) !== -1 &&
          d.nota >= 0 && d.nota <= 2;
      });
    }).catch(function () { return null; });
  }

  /* Transcrição do Meet vem como .txt ou legenda (.vtt/.srt). Anotação vem
     como .md. Nada disso precisa de biblioteca: é texto. PDF e .docx são
     binários e ficam de fora — o app não carrega dependência para abri-los. */
  const EXTENSOES = ['.txt', '.md', '.vtt', '.srt', '.csv', '.json', '.log'];

  function ehTexto(arquivo) {
    if (!arquivo) return false;
    if (/^text\//.test(arquivo.type || '')) return true;
    const nome = String(arquivo.name || '').toLowerCase();
    return EXTENSOES.some(function (e) { return nome.slice(-e.length) === e; });
  }

  /* Legenda tem uma linha de tempo a cada fala. Sem limpar, metade do que a
     IA lê é "00:04:12.480 --> 00:04:15.120". */
  function limparLegenda(texto) {
    return texto
      .replace(/^WEBVTT.*$/gm, '')
      .replace(/^\d+\s*$/gm, '')
      .replace(/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->.*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function lerTexto(arquivo) {
    return new Promise(function (resolve, reject) {
      if (!ehTexto(arquivo)) {
        reject(new Error('Só consigo ler texto: .txt, .md, .vtt, .srt ou .csv. Para PDF ou Word, copie o conteúdo e cole na caixa.'));
        return;
      }
      const leitor = new FileReader();
      leitor.onload = function () { resolve(limparLegenda(String(leitor.result || ''))); };
      leitor.onerror = function () { reject(new Error('Não consegui ler este arquivo.')); };
      leitor.readAsText(arquivo);
    });
  }

  /* Sugestão enquanto se digita: só o último pedido vale. Sem isto, uma
     resposta lenta chega depois de uma rápida e sobrescreve o palpite novo
     com o antigo — o campo "muda sozinho" na frente da pessoa. */
  function fila() {
    let sequencia = 0;
    return {
      pedir: function (tipo, texto, contexto) {
        const meu = ++sequencia;
        return extrair(tipo, texto, contexto).then(function (r) {
          /* Aqui erro é silêncio de propósito: isto roda enquanto a pessoa
             digita, e um aviso a cada pausa seria pior que não sugerir nada. */
          if (!r || r.erro || meu !== sequencia) return null;
          return r;
        });
      }
    };
  }

  /* Espera a pessoa parar de digitar antes de gastar uma chamada. */
  function aoParar(elemento, ms, fn) {
    let t = null;
    elemento.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(fn, ms || 900);
    });
  }

  /* Contexto que o servidor precisa para escolher entre opções reais em vez
     de inventar. Só listas curtas, só do tenant de quem está usando. */
  function contextoDaConta(contaId) {
    const Store = global.IADStore;
    const ctx = { hoje: Store.hoje(), segmentos: Store.nomesDoCatalogo('segmentos') };
    if (contaId) {
      ctx.contatos = Store.contatosDaConta(contaId).map(function (c) { return c.nome; });
    }
    /* Nosso próprio domínio, para o servidor não propor a nossa equipe como
       contato do cliente. Todo dossiê é assinado por nós, e sem isto a lista
       viria cheia de colegas do próprio vendedor. */
    const eu = (global.IADNuvem.estado().email || '').toLowerCase();
    const arroba = eu.indexOf('@');
    if (arroba > 0) ctx.nossoDominio = eu.slice(arroba + 1);
    return ctx;
  }

  function contextoDaOportunidade(op) {
    return contextoDaConta(op ? op.contaId : null);
  }

  global.IADIA = {
    disponivel: disponivel,
    verificar: verificar,
    diagnostico: diagnostico,
    extrair: extrair,
    analisarReuniao: analisarReuniao,
    classificarSegmentos: classificarSegmentos,
    planoDaOportunidade: planoDaOportunidade,
    sugerirNotas: sugerirNotas,
    retratoDaOportunidade: retratoDaOportunidade,
    lerTexto: lerTexto,
    ehTexto: ehTexto,
    fila: fila,
    aoParar: aoParar,
    contextoDaConta: contextoDaConta,
    contextoDaOportunidade: contextoDaOportunidade
  };
})(window);
