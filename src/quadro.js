/* O quadro financeiro da proposta.
   ================================================================
   Este arquivo é só a CONTA. Nenhum HTML, nenhum pedido de rede, nenhuma
   leitura de arquivo — porque a conta é a parte que não pode errar, e o que
   não pode errar tem de poder ser testado sem navegador.

   O QUE ELE EXISTE PARA IMPEDIR

   Um número só. A planilha que o vendedor usa hoje tem sete abas, e o app
   tinha um campo `valor` digitado à mão. Entre as duas coisas havia um
   vendedor somando equipamento com mensalidade na cabeça, na frente do
   cliente.

   A REGRA QUE ORGANIZA TUDO AQUI

     Valor único e valor recorrente NUNCA somam.

   Implantação de 30 mil mais 8 mil por mês não é 38 mil, não é nada: são
   dois números que vivem em dimensões diferentes. O único lugar onde eles se
   encontram é o TOTAL DO CONTRATO, e lá o prazo está escrito na conta, à
   vista, para ser conferido — entrada + mensal × meses.

   AS TRÊS COISAS QUE O VENDEDOR MEXE

     linhas ....... o que vai ser cobrado, uma vez ou por mês
     premissas .... o que multiplica — segmento, região, prazo, raio
     cenários ..... as formas de negócio, lado a lado

   O cenário é a peça que esta tela tem e um orçamento comum não tem. Na
   planilha dele as formas de negócio são três colunas com ✓ e x: a mesma
   linha entra numa modalidade e não entra na outra. É isso, e não um
   desconto, que faz WaaS e Venda darem números tão diferentes. */
(function (global) {
  'use strict';

  /* Onde uma premissa incide. Separado porque no negócio dele o acréscimo de
     segmento vale só para o SERVIÇO — está escrito na planilha, "*Incide
     apenas no Serviço" — e uma premissa que incidisse nos dois estaria
     inventando dinheiro que ninguém cobrou. */
  const ONDE = [
    ['mensal', 'só no mensal'],
    ['entrada', 'só na entrada'],
    ['ambos', 'nos dois']
  ];

  const TIPOS_DE_LINHA = [
    ['unico', 'uma vez'],
    ['mensal', 'por mês']
  ];

  function id(prefixo) {
    return prefixo + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const t = String(v == null ? '' : v).trim();
    if (!t) return 0;
    /* "R$ 29.106,28" e "29106.28" têm de dar o mesmo número. A regra é a
       posição do último separador: o que vier depois dele é decimal. */
    const limpo = t.replace(/[^\d,.\-]/g, '');
    const ultimaVirgula = limpo.lastIndexOf(',');
    const ultimoPonto = limpo.lastIndexOf('.');
    let normal = limpo;
    if (ultimaVirgula > ultimoPonto) normal = limpo.replace(/\./g, '').replace(',', '.');
    else if (ultimoPonto > ultimaVirgula) normal = limpo.replace(/,/g, '');
    else normal = limpo.replace(/,/g, '.');
    const n = parseFloat(normal);
    return isFinite(n) ? n : 0;
  }

  function texto(v, max) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200);
  }

  /* ---------- o quadro vazio ----------
     Dois cenários de saída, e não zero: um quadro com cenário nenhum não tem
     onde pôr as linhas, e a primeira coisa que o vendedor faria seria criar
     um à mão para poder começar. O nome é genérico de propósito — a IA
     renomeia com as modalidades que achar nos arquivos dele. */
  function vazio() {
    return {
      versao: 1,
      arquivos: [],
      escopo: [],
      linhas: [],
      premissas: [],
      cenarios: [
        { id: 'c1', nome: 'Proposta', nota: '' },
        { id: 'c2', nome: 'Alternativa', nota: '' }
      ],
      cenarioAtivo: 'c1',
      prazoMeses: 12,
      validadeDias: 30,
      reajuste: '',
      pagamento: '',
      duvidas: [],
      lidoEm: ''
    };
  }

  /* ---------- a conta ----------

     `cenarios` na linha é um objeto {idDoCenario: true}. Linha sem nenhum
     cenário marcado entra em TODOS — porque o caso comum é a linha valer para
     a proposta inteira, e obrigar a marcar três caixas para o caso comum é
     como se desiste de usar uma tela. */
  function naCena(linha, cenarioId) {
    const c = linha && linha.cenarios;
    if (!c) return true;
    const marcados = Object.keys(c).filter(function (k) { return c[k]; });
    if (!marcados.length) return true;
    return !!c[cenarioId];
  }

  /* O multiplicador das premissas ligadas que incidem aqui. Elas se somam
     antes de multiplicar — 20% de segmento e 6% de prazo dão 1,26 e não
     1,2 × 1,06 = 1,272.

     Não é detalhe: é como a planilha dele faz, e um app que devolve um número
     diferente da planilha que o vendedor confere perde a discussão na hora,
     esteja certo ou errado. */
  function multiplicador(premissas, onde) {
    let soma = 0;
    (premissas || []).forEach(function (p) {
      if (!p || !p.ligada) return;
      if (String(p.tipo || 'percentual') !== 'percentual') return;
      const incide = String(p.incideEm || 'mensal');
      if (incide !== 'ambos' && incide !== onde) return;
      soma += num(p.percentual);
    });
    /* O piso em −100% existe para a conta nunca virar negativa por acúmulo de
       desconto. Preço negativo não é desconto, é erro de digitação, e mostrar
       um na tela destrói a confiança no quadro inteiro. */
    return Math.max(0, 1 + Math.max(-1, soma / 100));
  }

  function totalDaLinha(l) {
    const q = num(l && l.quantidade);
    return (q === 0 ? 1 : q) * num(l && l.valor);
  }

  /* Os três números do cenário. `bruto` é antes das premissas e viaja junto
     porque a tela mostra os dois: ver o acréscimo de segmento separado do
     preço de tabela é a diferença entre conferir e acreditar. */
  function totais(quadro, cenarioId) {
    const q = quadro || vazio();
    const cena = cenarioId || q.cenarioAtivo || (q.cenarios[0] || {}).id || 'c1';
    const meses = Math.max(0, Math.round(num(q.prazoMeses)));

    let brutoEntrada = 0, brutoMensal = 0;
    (q.linhas || []).forEach(function (l) {
      if (!naCena(l, cena)) return;
      const t = totalDaLinha(l);
      if (String(l.tipo) === 'mensal') brutoMensal += t;
      else brutoEntrada += t;
    });

    const mEntrada = multiplicador(q.premissas, 'entrada');
    const mMensal = multiplicador(q.premissas, 'mensal');
    const entrada = brutoEntrada * mEntrada;
    const mensal = brutoMensal * mMensal;

    return {
      cenario: cena,
      meses: meses,
      brutoEntrada: brutoEntrada,
      brutoMensal: brutoMensal,
      multEntrada: mEntrada,
      multMensal: mMensal,
      entrada: entrada,
      mensal: mensal,
      /* O ÚNICO lugar onde os dois se encontram, e só porque o prazo está na
         conta. Sem prazo não existe total de contrato: existe entrada e
         existe mensalidade, e dizer outra coisa seria inventar. */
      contrato: entrada + mensal * meses,
      /* Quanto do contrato é recorrente. É o número que diz que tipo de
         negócio este é — 90% recorrente e 10% recorrente são empresas
         diferentes vendendo a mesma coisa. */
      parteRecorrente: (entrada + mensal * meses) > 0
        ? (mensal * meses) / (entrada + mensal * meses) : 0
    };
  }

  /* Todos os cenários de uma vez, para a tabela de comparação. É a tela que
     ele pediu — "as possibilidades de forma de negócio" — e ela só existe
     porque a mesma linha pode entrar numa modalidade e não na outra. */
  function comparar(quadro) {
    const q = quadro || vazio();
    return (q.cenarios || []).map(function (c) {
      const t = totais(q, c.id);
      t.nome = c.nome;
      t.nota = c.nota || '';
      t.ativo = c.id === q.cenarioAtivo;
      return t;
    });
  }

  /* ---------- o que vem da IA ----------

     Normalizar é obrigação e não zelo: o que chega é texto de um modelo lendo
     um .docx e um .xlsx, e vai direto para uma conta que o vendedor mostra ao
     cliente. Campo faltando vira padrão, número sujo vira número, lixo vira
     linha ignorada — nunca NaN na tela. */
  function normalizar(bruto, base) {
    const q = Object.assign(vazio(), base || {});
    const b = bruto || {};

    if (Array.isArray(b.cenarios) && b.cenarios.length) {
      q.cenarios = b.cenarios.slice(0, 6).map(function (c, i) {
        return { id: 'c' + (i + 1), nome: texto(c && c.nome, 40) || ('Cenário ' + (i + 1)),
          nota: texto(c && c.nota, 200) };
      });
      q.cenarioAtivo = q.cenarios[0].id;
    }

    const nomesDeCenario = {};
    q.cenarios.forEach(function (c) { nomesDeCenario[c.nome.toLowerCase()] = c.id; });

    /* A IA devolve o cenário pelo NOME, porque é o que ela leu no documento.
       Aqui vira id — e nome que não casa com cenário nenhum é descartado, não
       inventa cenário: cenário fantasma com uma linha dentro é pior do que
       linha em todos os cenários. */
    const paraCenarios = function (lista) {
      const saida = {};
      (Array.isArray(lista) ? lista : []).forEach(function (n) {
        const alvo = nomesDeCenario[texto(n, 40).toLowerCase()];
        if (alvo) saida[alvo] = true;
      });
      return saida;
    };

    const linhas = [];
    const juntarLinhas = function (lista, tipo) {
      (Array.isArray(lista) ? lista : []).forEach(function (l) {
        const rotulo = texto(l && l.rotulo, 120);
        if (!rotulo) return;
        linhas.push({
          id: id('l'),
          rotulo: rotulo,
          quantidade: num(l && l.quantidade) || 1,
          valor: num(l && l.valor),
          tipo: tipo,
          cenarios: paraCenarios(l && l.cenarios),
          origem: texto(l && l.origem, 240),
          daIa: true
        });
      });
    };
    juntarLinhas(b.unicos, 'unico');
    juntarLinhas(b.mensais, 'mensal');
    if (linhas.length) q.linhas = (q.linhas || []).concat(linhas);

    if (Array.isArray(b.premissas)) {
      const novas = b.premissas.slice(0, 20).map(function (p) {
        let pct = num(p && p.percentual);
        /* ---------- 0,2 QUER DIZER 20% ----------

           A planilha dele escreve o acréscimo de segmento como 0,2 e o
           desconto de região como 0,06: é fração, não ponto percentual. Lido
           cru, um acréscimo de 20% vira 0,2% — a proposta sai cem vezes
           errada, parecendo certa, com o número bem formatado.

           A regra: abaixo de 1 em módulo é fração e vira percentual. O custo
           é um acréscimo real de meio por cento virar 50%, e esse acréscimo
           não existe em tabela comercial nenhuma — enquanto o 0,2 existe em
           todas.

           Isto vale SÓ para o que foi lido de documento. O que o vendedor
           digita no campo da tela é o que ele quis dizer, e converter ali
           seria corrigir quem não errou. */
        if (pct !== 0 && Math.abs(pct) < 1) pct = pct * 100;
        return {
          id: id('p'),
          rotulo: texto(p && p.rotulo, 80),
          /* Premissa sem percentual não é cálculo, é contexto — "faturamento
             30/60/90", "prazo indeterminado". Ela continua na lista porque é
             exatamente o que entra na proposta como condição comercial, mas
             não entra em conta nenhuma e a tela diz isso. */
          tipo: pct ? 'percentual' : 'texto',
          percentual: pct,
          observacao: texto(p && p.observacao, 200),
          incideEm: ONDE.map(function (o) { return o[0]; })
            .indexOf(String(p && p.incideEm)) !== -1 ? String(p.incideEm) : 'mensal',
          ligada: p && p.ligada === false ? false : true,
          origem: texto(p && p.origem, 240),
          daIa: true
        };
      }).filter(function (p) { return p.rotulo; });
      if (novas.length) q.premissas = (q.premissas || []).concat(novas);
    }

    if (Array.isArray(b.escopo)) {
      const esc = b.escopo.slice(0, 200).map(function (e) {
        return {
          id: id('e'),
          grupo: texto(e && e.grupo, 80),
          item: texto(e && e.item, 160),
          quantidade: num(e && e.quantidade) || 1,
          observacao: texto(e && e.observacao, 200),
          origem: texto(e && e.origem, 240)
        };
      }).filter(function (e) { return e.item; });
      if (esc.length) q.escopo = (q.escopo || []).concat(esc);
    }

    if (num(b.prazoMeses)) q.prazoMeses = Math.max(0, Math.round(num(b.prazoMeses)));
    if (num(b.validadeDias)) q.validadeDias = Math.max(0, Math.round(num(b.validadeDias)));
    if (texto(b.reajuste, 120)) q.reajuste = texto(b.reajuste, 120);
    if (texto(b.pagamento, 120)) q.pagamento = texto(b.pagamento, 120);

    if (Array.isArray(b.duvidas)) {
      q.duvidas = b.duvidas.slice(0, 12).map(function (d) { return texto(d, 240); })
        .filter(Boolean);
    }

    q.lidoEm = new Date().toISOString();
    return q;
  }

  /* ---------- as contas que a tela mostra do lado ----------

     Preço por mês equivalente: o contrato inteiro dividido pelos meses. É a
     única forma honesta de comparar uma proposta de venda com uma de WaaS,
     porque ela põe a entrada diluída no mesmo eixo da mensalidade. O vendedor
     faz essa conta no papel hoje. */
  function mensalEquivalente(t) {
    return t && t.meses ? t.contrato / t.meses : 0;
  }

  /* ---------- COMO VÁRIOS DOCUMENTOS CABEM NUM PEDIDO SÓ ----------

     O caso que obrigou a escrever isto: a planilha de precificação dele tem
     sete abas e rende 60 mil letras de conteúdo — não de espaço em branco,
     conteúdo. Com o escopo em Word junto, 60.764.

     O corte simples seria `texto.slice(0, teto)`. E ele é PIOR do que parece,
     porque não corta um pedaço qualquer: corta o FIM. Naquela planilha o fim
     é a aba Premissas — justamente os acréscimos de segmento, os descontos de
     região e os de prazo. O quadro sairia completo e sem premissa nenhuma, e
     nada na tela diria por quê.

     Então o corte é por documento e por aba, proporcional, e quem é pequeno
     passa inteiro. Um escopo de 750 letras nunca é cortado para dar lugar a
     uma planilha de 60 mil; e dentro da planilha, cada aba perde um pouco em
     vez de as últimas sumirem.

     O que foi cortado é DITO. Documento cortado em silêncio é a pior das três
     saídas: o quadro parece completo, e quem lê não tem como saber. */
  const MARCA_DE_ABA = /(^|\n)--- planilha \d+[^\n]*---\n/g;
  const AVISO_ABA = '\n[…esta aba continua]\n';
  const AVISO_FIM = '\n[…cortado aqui: o arquivo é maior do que cabe num pedido]';

  function pedacosDoDocumento(texto) {
    const t = String(texto || '');
    const marcas = [];
    let m;
    MARCA_DE_ABA.lastIndex = 0;
    while ((m = MARCA_DE_ABA.exec(t)) !== null) marcas.push({ em: m.index, tamanho: m[0].length });
    if (!marcas.length) return [t];
    const partes = [];
    if (marcas[0].em > 0) partes.push(t.slice(0, marcas[0].em));
    marcas.forEach(function (x, i) {
      const fim = (i + 1 < marcas.length) ? marcas[i + 1].em : t.length;
      partes.push(t.slice(x.em, fim));
    });
    return partes;
  }

  /* Reparte um teto entre pedaços de tamanhos diferentes. Quem cabe na fatia
     média leva o que precisa e devolve a sobra; o que sobra é redividido
     entre os grandes. É a mesma ideia do maior resto, e serve ao caso comum
     desta tela: um documento enorme ao lado de dois pequenos. */
  function repartir(tamanhos, teto) {
    const cotas = tamanhos.slice();
    let sobra = teto;
    let vivos = tamanhos.map(function (_, i) { return i; });
    for (let volta = 0; volta < 8 && vivos.length; volta++) {
      const fatia = Math.floor(sobra / vivos.length);
      const cabem = vivos.filter(function (i) { return tamanhos[i] <= fatia; });
      if (!cabem.length) {
        vivos.forEach(function (i) { cotas[i] = fatia; });
        return cotas;
      }
      cabem.forEach(function (i) { cotas[i] = tamanhos[i]; sobra -= tamanhos[i]; });
      vivos = vivos.filter(function (i) { return cabem.indexOf(i) === -1; });
    }
    return cotas;
  }

  /* `docs` é [{nome, texto}]. Devolve {texto, cortados:[nome]}. */
  function juntarDocumentos(docs, teto) {
    const lista = (docs || []).filter(function (d) { return d && d.texto; });
    if (!lista.length) return { texto: '', cortados: [] };

    const cabecalho = function (d) {
      return '===== ARQUIVO: ' + d.nome + (d.deZip ? ' (de ' + d.deZip + ')' : '') + ' =====\n';
    };
    const custoFixo = lista.reduce(function (s, d) { return s + cabecalho(d).length + 2; }, 0);
    const espaco = Math.max(0, teto - custoFixo);
    const inteiro = lista.reduce(function (s, d) { return s + d.texto.length; }, 0);

    if (inteiro <= espaco) {
      return {
        texto: lista.map(function (d) { return cabecalho(d) + d.texto; }).join('\n\n'),
        cortados: []
      };
    }

    const cotas = repartir(lista.map(function (d) { return d.texto.length; }), espaco);
    const cortados = [];
    const partes = lista.map(function (d, i) {
      if (cotas[i] >= d.texto.length) return cabecalho(d) + d.texto;
      cortados.push(d.nome);
      /* Dentro do documento, cada aba perde um pouco em vez de as últimas
         sumirem. Num arquivo sem abas é um corte só, no fim, que é o melhor
         que dá para fazer com texto corrido. */
      const pedacos = pedacosDoDocumento(d.texto);
      /* O aviso de corte ocupa lugar e tem de sair da cota, não somar a ela:
         teto que o próprio repartidor estoura deixa de ser teto. São sete
         abas numa planilha de precificação — sete avisos passam de cento e
         cinquenta letras, e é assim que um limite vira uma sugestão. */
      if (pedacos.length < 2) {
        return cabecalho(d) + d.texto.slice(0, Math.max(0, cotas[i] - AVISO_FIM.length)) + AVISO_FIM;
      }
      const dentro = repartir(pedacos.map(function (x) { return x.length; }), cotas[i]);
      return cabecalho(d) + pedacos.map(function (x, j) {
        return x.length <= dentro[j] ? x
          : x.slice(0, Math.max(0, dentro[j] - AVISO_ABA.length)) + AVISO_ABA;
      }).join('');
    });

    return { texto: partes.join('\n\n'), cortados: cortados };
  }

  global.IADQuadro = {
    juntarDocumentos: juntarDocumentos,
    repartir: repartir,
    vazio: vazio,
    totais: totais,
    comparar: comparar,
    normalizar: normalizar,
    totalDaLinha: totalDaLinha,
    multiplicador: multiplicador,
    mensalEquivalente: mensalEquivalente,
    naCena: naCena,
    numero: num,
    ONDE: ONDE,
    TIPOS_DE_LINHA: TIPOS_DE_LINHA,
    novoId: id
  };
})(window);
