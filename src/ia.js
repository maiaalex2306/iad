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
  /* 90s: a resposta de reunião passou a caber até 8000 tokens — as oito
     decisões vinham sendo cortadas fora por falta de espaço —, e escrever
     mais leva mais tempo. Desistir aos 60 agora seria desistir de respostas
     que estão chegando. */
  const PRAZO_REUNIAO = 90000;

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
  /* 38000 e não 24000: a função no servidor aceita 40000 para reunião, e
     cortar mais cedo aqui era jogar fora material que caberia. Os 2000 de
     folga são o cabeçalho que a função acrescenta. */
  const LIMITE_PEDIDO = 38000;

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
    if (!disponivel()) return Promise.resolve({ erro: 'O assistente não está no ar. Veja Configuração → Assistente de IA.' });
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
  function analisarReuniao(texto, contexto, op, resumoOp) {
    if (!disponivel()) {
      return Promise.resolve({ erro: 'O assistente não está no ar. Veja Configuração → Assistente de IA.' });
    }
    let t = String(texto || '').trim();
    if (t.length < 60) return Promise.resolve({ erro: 'Texto curto demais para eu separar evidências.' });

    /* O retrato vai junto do material novo, numa chamada só.

       Antes eram duas: uma para separar as evidências e outra, depois, para
       reler as oito. Duas chamadas por tarefa é o dobro do consumo no
       provedor, e foi assim que o limite de uso estourou no meio do gesto —
       a leitura passava e a releitura falhava, deixando o vendedor com
       evidência gravada e índice parado. Com o retrato aqui, o modelo tem o
       que precisa para as duas coisas de uma vez, e sem perder o histórico:
       ele lê as evidências antigas e o material novo lado a lado. */
    /* A tarefa que originou o relato entra ANTES do material, com rótulo. Sem
       ela o modelo lê uma ata solta; com ela sabe o canal, com quem foi e qual
       decisão a pessoa estava tentando provocar — e é aí que ele para de
       devolver "problema" para tudo. */
    const daTarefa = (contexto && contexto.tarefa) || null;
    if (daTarefa) {
      t = [
        'A TAREFA QUE PRODUZIU ESTE MATERIAL:',
        '- o que era: ' + (daTarefa.titulo || 'sem título'),
        daTarefa.descricao ? '- descrição: ' + daTarefa.descricao : '',
        '- canal: ' + (daTarefa.tipoTarefa || 'não informado'),
        daTarefa.contato ? '- com quem: ' + daTarefa.contato : '',
        daTarefa.decisaoAlvo ? '- decisão que o vendedor pretendia provocar: ' + daTarefa.decisaoAlvo : '',
        daTarefa.quando ? '- quando aconteceu: ' + daTarefa.quando : ''
      ].filter(Boolean).join('\n') + '\n\n' + t;
    }

    if (op && resumoOp) {
      /* O retrato entra com orçamento próprio e o material fica inteiro.

         Antes os dois eram concatenados e a tesoura caía no fim — ou seja,
         sempre no material NOVO, que é justamente o que o modelo precisa ler.
         Numa conta com histórico grande, o retrato comia metade da cota e a
         ata chegava pela metade; a decisão que estava na segunda metade
         voltava como "não sabemos". O retrato é resumo que o app regenera a
         qualquer momento; a ata o vendedor colou uma vez. */
      const retrato = retratoDaOportunidade(op, resumoOp);
      const cotaDoRetrato = Math.min(retrato.length, Math.floor(LIMITE_PEDIDO * 0.25));
      t = 'RETRATO ATUAL DA OPORTUNIDADE (o que já estava registrado):\n' +
        retrato.slice(0, cotaDoRetrato) +
        (retrato.length > cotaDoRetrato ? '\n[…retrato resumido…]' : '') +
        '\n\n=== MATERIAL NOVO QUE O VENDEDOR ACABOU DE MANDAR ===\n' +
        t.slice(0, LIMITE_PEDIDO - cotaDoRetrato - 200);
    }
    if (t.length > LIMITE_PEDIDO) t = t.slice(0, LIMITE_PEDIDO);

    const pedido = Nuvem.chamarFuncao('assistente', {
      tipo: 'reuniao', texto: t, contexto: contexto || {}
    });
    const prazo = new Promise(function (resolve) {
      setTimeout(function () { resolve({ estourou: true }); }, PRAZO_REUNIAO);
    });

    return Promise.race([pedido, prazo]).then(function (r) {
      if (r && r.estourou) {
        return { erro: 'O assistente demorou mais de ' + Math.round(PRAZO_REUNIAO / 1000) +
          ' segundos e eu parei de esperar. Material muito grande costuma ser a causa: ' +
          'tire um documento e tente de novo.' };
      }
      if (!r) return { erro: 'O servidor respondeu vazio.' };
      /* A explicação vem do servidor e é mostrada como veio. Jogá-la fora e
         dizer "não consegui falar com o assistente" — que era o que esta
         função fazia — manda procurar rede e chave quando o problema é chave
         da IA vencida, modelo que saiu do ar ou limite de uso estourado. */
      if (r.erro) return { erro: r.erro };
      if (!Array.isArray(r.evidencias)) {
        return { erro: 'O assistente respondeu, mas não no formato esperado. ' +
          'Voltou: ' + amostraDaResposta(r) };
      }
      const dimensoes = global.IADPlaybook.DIMENSOES.map(function (d) { return d.id; });
      return {
        evidencias: apenasConhecidas(r.evidencias),
        contatos: r.contatos || [],
        empresa: (r.empresa && typeof r.empresa === 'object') ? r.empresa : {},
        negocio: (r.negocio && typeof r.negocio === 'object') ? r.negocio : {},
        decisoes: (Array.isArray(r.decisoes) ? r.decisoes : []).filter(function (d) {
          return d && dimensoes.indexOf(d.dimensao) !== -1 && d.nota >= 0 && d.nota <= global.IADPlaybook.NOTA_MAXIMA;
        })
      };
    }).catch(function (e) {
      return { erro: (e && e.message) || 'O servidor recusou a análise.' };
    });
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
  /* Candidata é a conta que compartilha alguma palavra com o nome que chegou,
     ou o domínio do site. Palavra de três letras ou menos não conta: "do",
     "de" e "sa" fariam qualquer conta ser candidata de qualquer lead, que é o
     mesmo que não filtrar nada. Teto de 40 porque o objetivo é caber no
     pedido, e uma lista maior que isso já não é uma lista de candidatas. */
  function contasCandidatas(empresas) {
    const Store = global.IADStore;
    const achatar = function (x) {
      return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    };
    const dominio = function (x) {
      return String(x || '').replace(/^https?:\/\//, '').replace(/^www\./, '')
        .replace(/\/.*$/, '').trim().toLowerCase();
    };

    const palavrasDosLeads = {};
    const dominiosDosLeads = {};
    empresas.forEach(function (e) {
      achatar(e.nome).split(' ').forEach(function (w) {
        if (w.length > 3) palavrasDosLeads[w] = true;
      });
      const d = dominio(e.dominio || e.site);
      if (d) dominiosDosLeads[d] = true;
    });

    return Store.dados().contas.filter(function (c) {
      if (dominio(c.site) && dominiosDosLeads[dominio(c.site)]) return true;
      return achatar(c.nome).split(' ').some(function (w) {
        return w.length > 3 && palavrasDosLeads[w];
      });
    }).slice(0, 40).map(function (c) {
      return {
        id: c.id, nome: c.nome, site: c.site || '',
        cidade: c.cidade || '', segmento: c.segmento || ''
      };
    });
  }

  function classificarSegmentos(empresas, avisar) {
    const Store = global.IADStore;
    const P = global.IADPlaybook;
    /* O catálogo vai com o mapa que cada segmento carrega — subsegmentos,
       oportunidades, personas. Mandar só o nome era pedir para o modelo
       adivinhar o que "Químicos" quer dizer nesta empresa: quem escreveu
       "defensivos; saneantes; tratamento de água" já respondeu isso, e era
       essa resposta que estava sendo jogada fora antes da chamada. */
    const catalogo = Store.catalogoAtivos('segmentos').map(function (s) {
      return {
        nome: s.nome,
        subsegmentos: s.subsegmentos || '',
        oportunidades: s.oportunidades || '',
        personas: s.personas || ''
      };
    });

    /* Devolver um mapa vazio e nada mais foi o que fez toda empresa importada
       sair carimbada como "Outros" sem ninguém saber por quê. Agora sai junto
       o motivo, e ele vai para a tela da importação: um campo em branco que
       não se explica manda o vendedor procurar no lugar errado. */
    if (!empresas.length) return Promise.resolve({ mapa: {}, motivo: '' });
    if (!catalogo.length) {
      return Promise.resolve({ mapa: {}, motivo:
        'Sua empresa ainda não tem segmentos cadastrados — por isso tudo veio como "Outros". ' +
        'Cadastre em Cadastros → Segmentos e importe de novo.' });
    }
    if (!disponivel()) {
      return Promise.resolve({ mapa: {}, motivo:
        'O assistente está desligado ou não respondeu ao teste — o segmento não foi classificado. ' +
        'Escolha à mão abaixo.' });
    }

    /* A conversa vai junto. Sem ela o modelo tinha só o nome da empresa para
       trabalhar — dava para escolher o segmento e mais nada. O reenquadramento
       nasce do que a pessoa respondeu à SDR; era isso que estava faltando. */
    const linhaDoLead = function (e, n) {
      const conversa = (e.conversa || []).map(function (m) {
        return '     ' + (m.nosso ? 'SDR' : (e.contato || 'ele')) + ': ' + m.texto;
      }).join('\n');
      return [
        n + '. ' + (e.contato || 'sem nome') + (e.cargo ? ' — ' + e.cargo : ''),
        (e.headline && e.headline !== e.cargo) ? '   perfil dele: ' + e.headline : '',
        '   empresa: ' + (e.nome || 'sem nome'),
        (e.dominio || e.site) ? '   site: ' + (e.dominio || e.site) : '',
        e.cidade ? '   onde fica: ' + e.cidade : '',
        e.setor ? '   setor informado: ' + e.setor : '',
        e.descricao ? '   sobre a empresa: ' + e.descricao : '',
        e.oQueFazLa ? '   o contato faz lá: ' + e.oQueFazLa : '',
        conversa ? '   conversa:\n' + conversa : '   sem conversa registrada'
      ].filter(Boolean).join('\n');
    };

    /* ---------- por que o lote vai partido ----------

       A primeira versão mandava a importação inteira numa chamada só, e isso
       era o certo enquanto o lote era pequeno. Com vinte leads deixou de ser:
       cada lead leva a conversa toda, o catálogo de segmentos vai junto, as
       contas candidatas vão junto e o servidor ainda cola o texto do site de
       até doze domínios. O pedido passou do teto de tokens por minuto do
       provedor e a resposta foi "Rate limit reached" — nenhum lead
       classificado, os vinte em branco.

       Uma chamada por lead seria o outro extremo: vinte chamadas para uma
       importação, cada uma repetindo o catálogo inteiro. Em blocos, o
       catálogo se repete poucas vezes e cada pedido cabe no limite.

       E blocos separados falham separado, que é o ganho maior: antes, um
       tropeço no décimo lead levava os outros dezenove junto. */
    /* Quatro, não cinco: com teto de oito mil tokens por minuto, um bloco de
       cinco leads chegou a 7425 tokens — cabia por pouco e não deixava nada
       para o bloco seguinte no mesmo minuto. */
    const POR_BLOCO = 4;
    const ESPERA_ENTRE_BLOCOS = 1200;
    const TENTATIVAS = 3;

    const blocos = [];
    for (let inicio = 0; inicio < empresas.length; inicio += POR_BLOCO) {
      blocos.push({ inicio: inicio, itens: empresas.slice(inicio, inicio + POR_BLOCO) });
    }

    const esperar = function (ms) {
      return new Promise(function (r) { setTimeout(r, ms); });
    };

    /* "Rate limit" quase sempre é por minuto e passa sozinho — desde que a
       espera seja a certa. Vinte segundos fixos erravam dos dois lados: espera
       demais quando falta pouco, e volta cedo demais quando falta um minuto,
       gastando a tentativa à toa. O provedor diz quantos segundos faltam, e o
       servidor passa esse número adiante entre colchetes. */
    const limiteDeUso = function (erro) {
      return /rate limit|limite de uso|429|tokens per minute|too many requests/i.test(String(erro || ''));
    };

    const quantoEsperar = function (erro, tentativa) {
      const m = /\[esperar:(\d+)\]/.exec(String(erro || ''));
      const pedido = m ? Number(m[1]) : 0;

      /* Na primeira vez vale o número do provedor. Na segunda, não: se o
         pedido dele não bastou, é porque a janela é móvel — os tokens do
         bloco anterior só saem da conta sessenta segundos depois de entrarem,
         e voltar antes disso é gastar tentativa. Aí espera-se a janela toda. */
      const segundos = tentativa >= 2 ? 65 : Math.max(pedido + 2, 15);
      return Math.min(segundos, 70) * 1000;
    };

    /* Quatro chamadas em série, e uma delas podendo esperar 20 segundos pelo
       limite do provedor: sem dizer nada, a janela fica parada tempo demais
       na mesma frase e a pessoa acha que travou. */
    const dizer = function (t) { if (typeof avisar === 'function') avisar(t); };

    const pedirBloco = function (bloco, tentativa) {
      const texto = bloco.itens.map(function (e, k) {
        return linhaDoLead(e, k + 1);          /* numeração local do bloco */
      }).join('\n\n');

      const pedido = Nuvem.chamarFuncao('assistente', {
        tipo: 'segmentos',
        texto: texto,
        contexto: {
          segmentos: catalogo,
          papeis: P.PAPEIS,
          /* As contas que já existem e que PODEM ser a mesma empresa. Só as
             candidatas: mandar a carteira inteira estoura o pedido em quem
             tem trezentas contas, e as outras 290 não ajudam a decidir nada.
             "Envu" contra "Envu Brasil Ltda" é o caso que nenhuma regra de
             texto resolve sem também juntar "Alpha Engenharia" com "Alpha
             Alimentos" — decidir qual das duas é o mesmo negócio depende de
             saber o que cada empresa faz, e isso quem sabe é o modelo. */
          contas: contasCandidatas(bloco.itens),
          /* Alinhado por posição com os leads DESTE bloco, e com o site como
             reserva: o Linked Helper entrega organization_website_1 muito
             mais vezes do que organization_domain_1. */
          dominios: bloco.itens.map(function (e) { return e.dominio || e.site || ''; }),
          /* Quem já veio com descrição do LinkedIn não precisa que o servidor
             vá ao site: é a parte mais cara da entrada e diria o mesmo. */
          semDescricao: bloco.itens.map(function (e) { return !e.descricao; })
        }
      });
      const prazo = new Promise(function (resolve) {
        setTimeout(function () { resolve({ estourou: true }); }, PRAZO_REUNIAO);
      });

      return Promise.race([pedido, prazo]).then(function (r) {
        if (r && r.erro && limiteDeUso(r.erro) && tentativa < TENTATIVAS) {
          const ms = quantoEsperar(r.erro, tentativa);
          dizer('O provedor pediu para esperar ' + Math.round(ms / 1000) + 's. ' +
            'Tentativa ' + (tentativa + 1) + ' de ' + TENTATIVAS + '…');
          return esperar(ms).then(function () { return pedirBloco(bloco, tentativa + 1); });
        }
        return r;
      }).catch(function (e) {
        return { erro: e && e.message ? e.message : String(e) };
      });
    };

    /* Em série, não em paralelo. Paralelo seria mais rápido e é exatamente o
       que estoura o limite por minuto: cinco pedidos no mesmo segundo somam
       tokens no mesmo minuto do provedor. */
    const mapa = {};
    const problemas = [];
    let corrente = Promise.resolve();

    blocos.forEach(function (bloco, ordem) {
      corrente = corrente.then(function () {
        return (ordem ? esperar(ESPERA_ENTRE_BLOCOS) : Promise.resolve())
          .then(function () {
            dizer('Lendo ' + (bloco.inicio + 1) + '–' + (bloco.inicio + bloco.itens.length) +
              ' de ' + empresas.length + '…');
            return pedirBloco(bloco, 1);
          })
          .then(function (r) {
            if (!r || r.estourou) {
              problemas.push('bloco ' + (ordem + 1) + ': o assistente não respondeu a tempo');
              return;
            }
            if (r.erro) { problemas.push(r.erro); return; }
            if (!Array.isArray(r.itens)) {
              problemas.push('bloco ' + (ordem + 1) + ': resposta em formato ilegível');
              return;
            }
            r.itens.forEach(function (it) {
              /* O "n" que volta é local do bloco; o índice do lead é global. */
              const i = bloco.inicio + Number(it.n) - 1;
              if (!empresas[i]) return;
              mapa[i] = {
                segmento: it.segmento || '', confianca: it.confianca || '', porque: it.porque || '',
                maisProximo: it.maisProximo || '', papel: it.papel || '', insight: it.insight || '',
                contaExistente: it.contaExistente || '', porqueConta: it.porqueConta || '',
                resposta: it.resposta || '', porqueRecusa: it.porqueRecusa || ''
              };
            });
          });
      });
    });

    return corrente.then(function () {
      const lidos = Object.keys(mapa).length;
      const classificadas = Object.keys(mapa).filter(function (k) {
        return mapa[k].segmento && mapa[k].segmento !== 'Outros';
      }).length;

      /* Falha parcial é o caso novo e precisa de aviso próprio: dizer "o
         assistente recusou" quando quinze dos vinte foram lidos manda o
         vendedor conferir vinte linhas em vez das cinco que ficaram vazias. */
      if (problemas.length && lidos) {
        return { mapa: mapa, motivo: 'Li ' + lidos + ' dos ' + empresas.length +
          ' leads. Os outros ficaram sem segmento: ' + problemas[0] +
          ' Escolha à mão nos que estiverem em branco.' };
      }
      if (problemas.length) {
        return { mapa: {}, motivo: 'O assistente não classificou nenhum lead: ' + problemas[0] };
      }
      if (classificadas) return { mapa: mapa, motivo: '' };

      const descritos = catalogo.filter(function (s) {
        return s.subsegmentos || s.oportunidades || s.personas;
      }).length;
      const comum = 'O assistente leu as ' + empresas.length + ' empresas e nenhuma coube nos seus ' +
        catalogo.length + ' segmentos. Em cada lead abaixo está o que ele considerou mais próximo.';
      return { mapa: mapa, motivo: descritos
        ? comum + ' Escolha ou deixe em Outros.'
        : comum + ' Os seus segmentos estão cadastrados só com o nome — em Cadastros → Segmentos, ' +
          'preencher subsegmentos ("defensivos; saneantes; tratamento de água") é o que mais melhora ' +
          'este acerto, porque é ali que o assistente descobre o que cada nome quer dizer na sua operação.' };
    }).catch(function (e) {
      return { mapa: {}, motivo: 'Não consegui falar com o assistente: ' + (e && e.message ? e.message : 'erro desconhecido') };
    });
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
    linhas.push('IAD: ' + r.iad + ' de ' + P.IAD_MAXIMO + ' · classificação ' + r.classe.rotulo +
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
      linhas.push('  ' + d.nome + ': ' + nota + '/' + P.NOTA_MAXIMA + ' — ' + d.niveis[nota]);
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

  /* O retrato da CARTEIRA — não de um negócio. É o que vai para a IA no plano
     de desenvolvimento: a série das semanas e o rendimento por tipo de tarefa,
     em texto, exatamente os números que estão na tela. Nada além deles: se a
     IA receber mais do que o usuário vê, o plano cita coisas que ele não tem
     como conferir. */
  function retratoDaCarteira(ev) {
    const linhas = [];
    linhas.push('SÉRIE SEMANAL (da mais antiga para a mais nova; a última está em curso):');
    linhas.push('semanas: ' + ev.semanas.map(function (s) { return s.rotulo; }).join(' | '));
    ev.indicadores.forEach(function (i) {
      const valores = i.serie.map(function (v) {
        if (v == null) return '—';
        if (i.unidade === '%') return Math.round(v * 100) + '%';
        if (i.unidade === 'R$') return 'R$ ' + Math.round(v);
        if (i.unidade === 'd') return Math.round(v) + 'd';
        return String(Math.round(v * 100) / 100);
      });
      linhas.push('- ' + i.nome + ' (' + (i.maiorEMelhor ? 'maior é melhor' : 'menor é melhor') + '): ' +
        valores.join(' | ') + ' → ' + i.variacao.direcao);
    });

    linhas.push('');
    linhas.push('RENDIMENTO POR TIPO DE TAREFA no período (tarefas concluídas → pontos de decisão que subiram):');
    if (!ev.rendimento.linhas.length) {
      linhas.push('- nenhuma tarefa concluída no período.');
    } else {
      ev.rendimento.linhas.forEach(function (l) {
        linhas.push('- ' + l.tipo + ': ' + l.feitas + ' feitas, ' +
          (l.feitas ? Math.round((l.comRelato / l.feitas) * 100) : 0) + '% com relato, ' +
          '+' + l.pontos + ' pontos (' + (Math.round(l.porTarefa * 100) / 100) + ' por tarefa)');
      });
    }
    return linhas.join('\n');
  }

  /* O plano de desenvolvimento da semana. Diferente de tudo o mais aqui: os
     outros pedidos olham um negócio, este olha o hábito de quem vende. */
  function planoDeDesenvolvimento(ev) {
    if (!disponivel()) {
      return Promise.resolve({ erro: 'O assistente não está no ar. Veja Configuração → Assistente de IA.' });
    }
    const pedido = Nuvem.chamarFuncao('assistente', {
      tipo: 'desenvolvimento',
      texto: retratoDaCarteira(ev),
      contexto: { hoje: global.IADStore.hoje(), semanas: ev.semanas.length }
    });
    const prazo = new Promise(function (resolve) {
      setTimeout(function () { resolve({ estourou: true }); }, PRAZO_REUNIAO);
    });

    return Promise.race([pedido, prazo]).then(function (resp) {
      if (resp && resp.estourou) return { erro: 'O assistente demorou demais e eu parei de esperar.' };
      if (!resp) return { erro: 'O servidor respondeu vazio.' };
      if (resp.erro) return { erro: resp.erro };
      if (!Array.isArray(resp.mudancas)) {
        return { erro: 'O assistente respondeu, mas não no formato esperado. Voltou: ' + amostraDaResposta(resp) };
      }
      return {
        leitura: String(resp.leitura || ''),
        indoBem: (resp.indoBem || []).slice(0, 4).map(String),
        indoMal: (resp.indoMal || []).slice(0, 4).map(String),
        mudancas: resp.mudancas.slice(0, 3).filter(function (m) { return m && m.acao; })
      };
    }).catch(function (e) {
      return { erro: (e && e.message) || 'O servidor recusou o plano.' };
    });
  }

  /* As oito notas propostas a partir do que já está registrado, mais o texto
     de uma reunião quando o vendedor colar uma.

     Isto não fere a regra de que a IA não pontua: ela PROPÕE, o vendedor
     confere as oito de uma vez e confirma, e a trava do motor continua de pé —
     degrau 3 ou 4 sem evidência com a força correspondente cai, venha de onde vier. O que
     muda é o custo: oito formulários viram uma tela. */
  function sugerirNotas(op, r, textoExtra) {
    if (!disponivel()) {
      return Promise.resolve({ erro: 'O assistente não está no ar. Veja Configuração → Assistente de IA.' });
    }

    let retrato = retratoDaOportunidade(op, r);
    const extra = String(textoExtra || '').trim();
    if (extra) retrato += '\n\nREUNIÃO QUE O VENDEDOR ACABOU DE COLAR:\n' + extra;

    /* A releitura das oito precisa da mesma régua da leitura. Sem ela, os dois
       caminhos pontuavam com critérios diferentes — e o vendedor via a nota
       mudar sozinha conforme por onde a IA tinha passado. */
    const pedido = Nuvem.chamarFuncao('assistente', {
      tipo: 'notas', texto: retrato,
      contexto: { hoje: global.IADStore.hoje(), escada: esbocoDaEscada() }
    });
    const prazo = new Promise(function (resolve) {
      setTimeout(function () { resolve({ estourou: true }); }, PRAZO_REUNIAO);
    });

    return Promise.race([pedido, prazo]).then(function (resp) {
      if (resp && resp.estourou) {
        return { erro: 'O assistente demorou mais de ' + Math.round(PRAZO_REUNIAO / 1000) +
          ' segundos para reler as oito e eu parei de esperar.' };
      }
      if (!resp) return { erro: 'O servidor respondeu vazio.' };
      if (resp.erro) return { erro: resp.erro };
      if (!Array.isArray(resp.decisoes)) {
        return { erro: 'O assistente respondeu, mas não no formato esperado. ' +
          'Voltou: ' + amostraDaResposta(resp) };
      }
      const dimensoes = global.IADPlaybook.DIMENSOES.map(function (d) { return d.id; });
      return { decisoes: resp.decisoes.filter(function (d) {
        return d && dimensoes.indexOf(d.dimensao) !== -1 && d.nota >= 0 && d.nota <= global.IADPlaybook.NOTA_MAXIMA;
      }) };
    }).catch(function (e) {
      return { erro: (e && e.message) || 'O servidor recusou a releitura.' };
    });
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
      const conta = Store.conta(contaId);
      /* Quem é o cliente, pelo nome.

         Sem isto o servidor recebia a regra "a nota vem só do que o CLIENTE
         disse" sem ter como saber quem é o cliente. Numa ata em terceira
         pessoa — "Rosa apresentou a solução", "Fábio mencionou que a
         prospecção manual não se sustenta" — as duas frases têm a mesma
         forma, e adivinhar qual lado é o nosso é cara ou coroa. O modelo
         então fazia o seguro: não pontuava. O vendedor via "problema não
         reconhecido" depois de uma reunião em que o cliente descreveu o
         problema três vezes. */
      if (conta && conta.nome) ctx.clienteNome = conta.nome;
      ctx.contatos = Store.contatosDaConta(contaId).map(function (c) { return c.nome; });
    }
    /* E quem somos nós, pelo nome da empresa de quem está logado. */
    const meu = Store.tenantDeTrabalho && Store.tenantDeTrabalho();
    const minha = meu && (Store.dados().tenants || []).filter(function (t) { return t.id === meu; })[0];
    if (minha && minha.nome) ctx.nossaEmpresa = minha.nome;
    const usuario = Store.contexto && Store.contexto().usuario;
    if (usuario && usuario.nome) ctx.nossoVendedor = usuario.nome;
    /* Nosso próprio domínio, para o servidor não propor a nossa equipe como
       contato do cliente. Todo dossiê é assinado por nós, e sem isto a lista
       viria cheia de colegas do próprio vendedor. */
    const eu = (global.IADNuvem.estado().email || '').toLowerCase();
    const arroba = eu.indexOf('@');
    if (arroba > 0) ctx.nossoDominio = eu.slice(arroba + 1);
    return ctx;
  }

  /* A régua inteira vai junto do pedido.

     O servidor tinha a própria cópia das oito decisões, com uma linha de
     descrição em cada. A escada de cinco degraus ele conhecia genericamente —
     "2 é o cliente disse, 3 é alguém conferiu" — e era só isso. Mas o rigor
     não é igual nas oito, e é justamente aí que mora a diferença entre medir e
     iludir: em Processo de compra, "o cliente descreveu as etapas" é 2, e o 3
     exige saber quem assina cada uma e QUANTO TEMPO cada uma leva. Sem essa
     frase, o modelo lia "ele explicou o processo de aprovação" e dava 3.

     Mandar a régua do app resolve os dois problemas de uma vez: o modelo passa
     a pontuar pelo critério escrito, e a régua deixa de existir em duas
     cópias que envelhecem separadas. Quem manda é sempre o playbook. */
  function esbocoDaEscada() {
    const P = global.IADPlaybook;
    return {
      notaMaxima: P.NOTA_MAXIMA,
      iadMaximo: P.IAD_MAXIMO,
      iadMaduro: P.IAD_MADURO,
      forcaMinimaDoDegrau: P.FORCA_MINIMA_DO_DEGRAU,
      ordem: global.IADEngine.ORDEM_DECISAO,
      degraus: P.NIVEIS_DA_ESCADA.map(function (n) {
        return { n: n.n, rotulo: n.rotulo, desc: n.desc };
      }),
      forcas: P.FORCAS.map(function (f) { return { id: f.id, peso: f.peso, desc: f.desc }; }),
      decisoes: P.DIMENSOES.map(function (d) {
        return { id: d.id, nome: d.nome, pergunta: d.pergunta, niveis: d.niveis };
      })
    };
  }

  function contextoDaOportunidade(op) {
    const ctx = contextoDaConta(op ? op.contaId : null);
    ctx.escada = esbocoDaEscada();
    /* As etapas do funil vão junto para o servidor poder dizer qual delas o
       material comprova — e para nunca inventar uma coluna que não existe. */
    ctx.etapas = global.IADPlaybook.ETAPAS;
    if (op) {
      ctx.etapaAtual = op.etapa;
      ctx.valorAtual = op.valor || 0;
    }
    return ctx;
  }

  /* ================= A VARREDURA DIÁRIA DA TELA HOJE =================

     O pedido foi "use a IA para isso uma vez ao dia". Esta é a parte da IA, e
     ela é a MENOR das duas de propósito.

     A divisão do trabalho, que vale escrever porque é a decisão inteira:

       · O CÁLCULO (src/orientacao.js) diz por que a conta está urgente, o que
         está atrasado e o que fazer. É instantâneo, de graça, auditável,
         funciona offline e nunca erra — sai dos mesmos dados que a tela mostra.
         Isso é 90% do que o vendedor precisa de manhã, e ele tem sempre.

       · A IA acrescenta o que SÓ ela pode: ler o texto. As atas, as notas, o
         que o cliente escreveu com as palavras dele. Dali sai uma leitura e as
         próximas jogadas na língua do cliente — coisa que nenhuma conta
         produz. Uma vez por dia basta: o texto de um negócio não muda de hora
         em hora, e refazer a cada abertura de tela seria queimar dinheiro para
         reescrever o mesmo parágrafo.

     Se a IA não estiver no ar, a tela não fica vazia: fica sem o parágrafo.

     UMA DE CADA VEZ, na ordem da fila. Trinta chamadas em paralelo derrubariam
     o limite da função e devolveriam erro em quase todas; em série, o negócio
     mais urgente é o primeiro a ter leitura, que é a ordem que importa se a
     pessoa fechar o app no meio. */
  const LIMITE_DA_VARREDURA = 60;
  const PAUSA_ENTRE_LEITURAS = 1200;

  let varrendo = false;

  /* O retrato que vai para a leitura: o mesmo da oportunidade MAIS o que a
     conta já concluiu. Mandar o cálculo junto é o que impede o modelo de
     repetir, em prosa pior, o que a tela já diz em cima com números exatos. */
  function retratoComOrientacao(op, r, x) {
    const linhas = [retratoDaOportunidade(op, r)];
    const lista = function (titulo, itens, campo) {
      if (!itens || !itens.length) return;
      linhas.push('');
      linhas.push(titulo);
      itens.forEach(function (i) { linhas.push('  - ' + (campo ? i[campo] : i)); });
    };
    linhas.push('');
    linhas.push('O QUE O APLICATIVO JÁ CALCULOU E JÁ MOSTRA NA TELA (não repita isto):');
    lista('CAUSAS:', x.causas, 'texto');
    lista('ATRASOS:', x.atrasos.map(function (a) { return a.dias + ' dia(s): ' + a.texto; }));
    lista('PASSOS JÁ RECOMENDADOS:', x.acelerar, 'texto');
    return linhas.join('\n');
  }

  /* A leitura de UM negócio. Devolve null quando não deu — e null aqui é
     normal: assistente desligado, rede fora, resposta fora de formato. Nada
     disso é motivo para avisar ninguém, porque nada na tela depende dela. */
  function leituraDaOportunidade(op, r, x) {
    if (!disponivel()) return Promise.resolve(null);

    const pedido = Nuvem.chamarFuncao('assistente', {
      tipo: 'orientacao',
      texto: retratoComOrientacao(op, r, x),
      contexto: Object.assign(contextoDaOportunidade(op), {
        hoje: global.IADStore.hoje(),
        urgencia: x.nivel || '',
        tituloDoNegocio: op.titulo
      })
    });
    const prazo = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, PRAZO_REUNIAO);
    });

    return Promise.race([pedido, prazo]).then(function (resp) {
      if (!resp || resp.erro) return null;
      const leitura = typeof resp.leitura === 'string' ? resp.leitura.trim() : '';
      const texto = function (lista) {
        return (Array.isArray(lista) ? lista : []).slice(0, 3)
          .map(function (t) { return String(t || '').trim(); }).filter(Boolean);
      };
      const acelerar = texto(resp.acelerar);
      const risco = texto(resp.risco);
      if (!leitura && !acelerar.length && !risco.length) return null;
      return { leitura: leitura, acelerar: acelerar, risco: risco };
    }).catch(function () { return null; });
  }

  /* A varredura. `itens` é a fila do dia, já na ordem; `aoAndar` é chamado
     depois de cada leitura gravada, para a tela se repintar sozinha e a pessoa
     ver o parágrafo aparecer em vez de descobrir amanhã que ele existia.

     O teto de 60 é dinheiro, e está aqui escrito para que a próxima pessoa
     saiba que é escolha e não limite técnico: uma carteira de trezentos
     negócios custaria trezentas chamadas por dia, todos os dias. Sessenta na
     ordem da fila cobre com folga o que alguém consegue trabalhar num dia, e
     os de baixo entram quando subirem — o que é o comportamento certo, porque
     negócio que nunca chega perto do topo da fila não precisa de leitura
     diária. */
  function varrerOrientacoes(itens, aoAndar, opcoes) {
    if (varrendo || !disponivel()) return Promise.resolve(0);
    const O = global.IADOrientacao;
    const Store = global.IADStore;
    if (!O) return Promise.resolve(0);

    /* `forcar` é o botão da tela: quando a pessoa PEDE a análise, ela quer a
       de agora, não a de hoje de manhã. A varredura automática continua
       pulando quem já tem leitura do dia — ela roda sozinha e não pode gastar
       o que já foi gasto. */
    const o = opcoes || {};
    const alvo = o.forcar ? (itens || []).slice() : O.semLeituraDeHoje(itens);
    const pendentes = alvo.slice(0, o.teto || LIMITE_DA_VARREDURA);
    if (!pendentes.length) return Promise.resolve(0);

    varrendo = true;
    let feitas = 0;

    const proximo = function (n) {
      if (n >= pendentes.length) return Promise.resolve(feitas);
      const item = pendentes[n];
      const op = item.resumo.op;
      return leituraDaOportunidade(op, item.resumo, O.explicar(item))
        .then(function (leitura) {
          /* Grava TAMBÉM quando não veio nada. Sem isso, um negócio cujo
             retrato o modelo se recusa a ler voltaria para a fila de varredura
             a cada abertura de tela, para sempre, uma chamada por vez. A data
             carimbada é o que diz "este foi tentado hoje". */
          /* Silenciado de propósito. Cada `salvar` do Store dispara um envio,
             e o envio manda a carteira INTEIRA — sessenta leituras seguidas
             seriam sessenta uploads completos em um minuto, por um campo que
             ninguém está esperando. A varredura grava calada e pede UM envio
             no fim. */
          Store.semSincronizar(function () {
            Store.guardarOrientacao(op.id, leitura || { leitura: '', acelerar: [], risco: [] });
          });
          if (leitura) feitas++;
          if (aoAndar) { try { aoAndar(n + 1, pendentes.length); } catch (e) { /* a tela não derruba a varredura */ } }
          return new Promise(function (resolve) { setTimeout(resolve, PAUSA_ENTRE_LEITURAS); });
        })
        .then(function () { return proximo(n + 1); });
    };

    /* O envio único do fim. `agendar` e não `tentarDeNovo`: ele agrupa com o
       que mais estiver pendente e não atropela uma repetição em curso. */
    const mandar = function () {
      const S = global.IADSincronia;
      if (S && S.agendar) S.agendar();
    };

    return proximo(0).then(function (n) {
      varrendo = false;
      mandar();
      return n;
    }, function () {
      varrendo = false;
      mandar();
      return feitas;
    });
  }

  /* ---------- A LEITURA DA CARTEIRA INTEIRA ----------

     Diferente da leitura de um negócio, e a diferença é o ponto. Lá o modelo
     lê o texto de um cliente; aqui ele lê o PADRÃO — o que se repete entre
     sessenta e nove urgências, e portanto o que o vendedor deve mudar no modo
     de trabalhar, não no modo de falar com um cliente.

     O panorama já vem contado. O trabalho do modelo é dizer o que esses
     números significam e qual é a ordem da manhã. Mandar os números prontos é
     o que impede a resposta genérica: sem eles, qualquer modelo escreve
     "priorize os clientes mais quentes" e ninguém fica sabendo de nada. */
  function retratoDaCarteiraDoDia(pan, itens) {
    const n = function (v) { return global.IADUI.numero(v, 0); };
    const linhas = [];
    linhas.push('DATA: ' + pan.data);
    linhas.push('CARTEIRA: ' + pan.total + ' negócios na fila — ' +
      pan.porNivel.urgente + ' urgentes, ' + pan.porNivel.prioridade + ' em prioridade, ' +
      pan.porNivel.emDia + ' em dia' +
      (pan.triagem ? ' · mais ' + pan.triagem + ' leads em triagem, fora da fila' : ''));
    linhas.push('VALOR PARADO EM URGÊNCIA: ' + global.IADUI.moeda(pan.valorUrgente));

    linhas.push('');
    linhas.push('A CAUSA PRINCIPAL DE CADA NEGÓCIO, CONTADA (é o número mais importante daqui):');
    pan.causas.slice(0, 8).forEach(function (c) {
      linhas.push('  ' + c.quantos + ' negócio(s): ' + c.texto +
        (c.exemplos.length ? ' — ex.: ' + c.exemplos.join(', ') : ''));
    });

    linhas.push('');
    linhas.push('TRAVAS QUE ATRAVESSAM A CARTEIRA:');
    linhas.push('  ' + pan.semFalaDoCliente + ' de ' + pan.total +
      ' não têm NENHUMA decisão provada (IAD 0) — o cliente nunca disse nada registrado.');
    linhas.push('  ' + pan.semMobilizador + ' têm gente mapeada mas ninguém que mova a decisão por dentro.');
    linhas.push('  ' + pan.semNinguem + ' dependem de uma pessoa só, ou de nenhuma.');
    linhas.push('  ' + pan.semValor + ' estão sem valor preenchido.');
    linhas.push('  ' + pan.tarefasVencidas + ' tarefa(s) do próprio vendedor vencidas.');
    linhas.push('  ' + pan.previsoesVencidas + ' com data de fechamento já passada.');

    if (pan.vencidos.length) {
      linhas.push('');
      linhas.push('COMBINADOS COM O CLIENTE VENCIDOS (' + pan.vencidos.length + '), os mais antigos:');
      pan.vencidos.slice(0, 8).forEach(function (v) {
        linhas.push('  ' + v.dias + 'd — ' + v.titulo + ': ' + (v.texto || 'sem texto'));
      });
      if (pan.loteDeCombinados) {
        linhas.push('  ATENÇÃO: ' + pan.loteDeCombinados.quantos +
          ' combinados venceram todos no MESMO dia (' + pan.loteDeCombinados.data +
          '), o que costuma indicar um lote importado em vez de compromissos negociados um a um.');
      }
    }

    if (pan.primeiros.length) {
      linhas.push('');
      linhas.push('OS URGENTES DE MAIOR VALOR:');
      pan.primeiros.forEach(function (p) {
        linhas.push('  ' + p.titulo + ' — ' + global.IADUI.moeda(p.valor) +
          ' · IAD ' + p.iad + ' · ' + p.motivo);
      });
    }

    return linhas.join('\n');
  }

  function leituraDaCarteira(pan, itens) {
    if (!disponivel()) return Promise.resolve(null);

    const pedido = Nuvem.chamarFuncao('assistente', {
      tipo: 'panorama',
      texto: retratoDaCarteiraDoDia(pan, itens),
      contexto: { hoje: global.IADStore.hoje() }
    });
    const prazo = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, PRAZO_REUNIAO);
    });

    return Promise.race([pedido, prazo]).then(function (r) {
      if (!r || r.erro) return null;
      const lista = function (x, teto) {
        return (Array.isArray(x) ? x : []).slice(0, teto)
          .map(function (t) { return String(t || '').trim(); }).filter(Boolean);
      };
      const leitura = typeof r.leitura === 'string' ? r.leitura.trim() : '';
      const agora = lista(r.agora, 3);
      const padroes = lista(r.padroes, 3);
      const riscos = lista(r.riscos, 3);
      if (!leitura && !agora.length && !padroes.length) return null;
      return { leitura: leitura, agora: agora, padroes: padroes, riscos: riscos };
    }).catch(function () { return null; });
  }

  function varrendoAgora() { return varrendo; }

  global.IADIA = {
    disponivel: disponivel,
    verificar: verificar,
    diagnostico: diagnostico,
    extrair: extrair,
    analisarReuniao: analisarReuniao,
    classificarSegmentos: classificarSegmentos,
    planoDaOportunidade: planoDaOportunidade,
    sugerirNotas: sugerirNotas,
    planoDeDesenvolvimento: planoDeDesenvolvimento,
    retratoDaCarteira: retratoDaCarteira,
    retratoDaOportunidade: retratoDaOportunidade,
    leituraDaOportunidade: leituraDaOportunidade,
    varrerOrientacoes: varrerOrientacoes,
    varrendoAgora: varrendoAgora,
    leituraDaCarteira: leituraDaCarteira,
    retratoDaCarteiraDoDia: retratoDaCarteiraDoDia,
    lerTexto: lerTexto,
    ehTexto: ehTexto,
    fila: fila,
    aoParar: aoParar,
    contextoDaConta: contextoDaConta,
    contextoDaOportunidade: contextoDaOportunidade
  };
})(window);
