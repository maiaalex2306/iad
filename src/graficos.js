/* Gráficos em SVG puro, sem biblioteca. Todas as cores saem dos tokens do tema,
   então funcionam igual no claro e no escuro. Cada marca tem <title> para o toque. */
(function (global) {
  'use strict';

  const U = global.IADUI;
  const esc = U.esc;

  /* Saúde é estado, não categoria: verde, laranja e vermelho têm significado fixo. */
  const CORES_SAUDE = { saudavel: 'var(--ok)', risco: 'var(--risk)', zumbi: 'var(--dead)' };
  const ROTULOS_SAUDE = { saudavel: 'Saudável', risco: 'Em risco', zumbi: 'Zumbi' };

  function legendaSaude(chaves) {
    return '<div class="legenda">' + (chaves || ['saudavel', 'risco', 'zumbi']).map(function (k) {
      return '<span class="item-legenda"><i style="background:' + CORES_SAUDE[k] + '"></i>' + ROTULOS_SAUDE[k] + '</span>';
    }).join('') + '</div>';
  }

  function svg(largura, altura, conteudo, rotulo) {
    return '<div class="grafico"><svg viewBox="0 0 ' + largura + ' ' + altura + '" width="100%" height="' + altura +
      '" role="img" aria-label="' + esc(rotulo || '') + '" preserveAspectRatio="xMidYMid meet">' + conteudo + '</svg></div>';
  }

  function escala(maximo) {
    if (maximo <= 0) return 1;
    const ordem = Math.pow(10, Math.floor(Math.log10(maximo)));
    return Math.ceil(maximo / ordem) * ordem;
  }

  /* ---------- Colunas empilhadas por mês ----------
     Responde: como estão os negócios de cada mês, e quanto daquilo é confiável. */
  function colunasPorMes(dados, aoClicar) {
    if (!dados.length) return '<div class="vazio small">Sem oportunidades com data prevista.</div>';

    const larg = 640, alt = 230, esq = 52, dir = 12, topo = 14, base = 46;
    const x0 = esq, x1 = larg - dir, y0 = topo, y1 = alt - base;
    const maximo = escala(Math.max.apply(null, dados.map(function (d) { return d.valor; })));
    const passo = (x1 - x0) / dados.length;
    const largBarra = Math.min(46, passo * 0.62);
    const alturaDe = function (v) { return (v / maximo) * (y1 - y0); };

    const grade = [0, 0.5, 1].map(function (f) {
      const y = y1 - f * (y1 - y0);
      return '<line x1="' + x0 + '" y1="' + y.toFixed(1) + '" x2="' + x1 + '" y2="' + y.toFixed(1) +
        '" stroke="var(--line)" stroke-width="1" fill="none"/>' +
        '<text x="' + (x0 - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--muted)">' +
        U.compacto(maximo * f) + '</text>';
    }).join('');

    const colunas = dados.map(function (d, i) {
      const cx = x0 + passo * i + (passo - largBarra) / 2;
      let y = y1;
      const partes = ['zumbi', 'risco', 'saudavel'].map(function (k) {
        const h = alturaDe(d[k]);
        if (h <= 0) return '';
        y -= h;
        const r = '<rect x="' + cx.toFixed(1) + '" y="' + (y + 1).toFixed(1) + '" width="' + largBarra.toFixed(1) +
          '" height="' + Math.max(0, h - 2).toFixed(1) + '" rx="3" fill="' + CORES_SAUDE[k] + '">' +
          '<title>' + esc(d.rotulo + ' · ' + ROTULOS_SAUDE[k] + ': ' + U.moeda(d[k])) + '</title></rect>';
        return r;
      }).join('');

      const clique = aoClicar ? ' style="cursor:pointer" onclick="' + aoClicar + '(\'' + d.mes + '\')"' : '';
      return '<g' + clique + '>' + partes +
        '<text x="' + (cx + largBarra / 2).toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" text-anchor="middle" font-size="10" font-weight="700" fill="var(--text)">' +
        U.compacto(d.valor) + '</text>' +
        '<text x="' + (cx + largBarra / 2).toFixed(1) + '" y="' + (y1 + 16) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' + esc(d.rotulo) + '</text>' +
        '<text x="' + (cx + largBarra / 2).toFixed(1) + '" y="' + (y1 + 30) + '" text-anchor="middle" font-size="9" fill="var(--muted)">' + d.qtd + ' neg.</text>' +
        '</g>';
    }).join('');

    return legendaSaude() + svg(larg, alt,
      grade + '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" stroke="var(--line)" stroke-width="1"/>' + colunas,
      'Valor por mês de fechamento previsto, separado por saúde da decisão');
  }

  /* ---------- Barras horizontais empilhadas ----------
     Serve para etapa e segmento: o comprimento é o dinheiro, a cor é a confiança. */
  function barrasHorizontais(itens, opcoes) {
    const o = opcoes || {};
    if (!itens.length) return '<div class="vazio small">Sem dados neste filtro.</div>';

    const larg = 640, alturaLinha = 34, esq = o.larguraRotulo || 128, dir = 74;
    const alt = itens.length * alturaLinha + 10;
    const x0 = esq, x1 = larg - dir;
    const maximo = Math.max.apply(null, itens.map(function (i) { return i.valor; })) || 1;

    const linhas = itens.map(function (i, idx) {
      const y = idx * alturaLinha + 6;
      const largura = Math.max(2, (i.valor / maximo) * (x1 - x0));
      let x = x0;

      const partes = i.saudavel != null
        ? ['saudavel', 'risco', 'zumbi'].map(function (k) {
            const w = (i[k] / maximo) * (x1 - x0);
            if (w <= 0) return '';
            const r = '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + Math.max(0, w - 2).toFixed(1) +
              '" height="18" rx="3" fill="' + CORES_SAUDE[k] + '">' +
              '<title>' + esc(i.rotulo + ' · ' + ROTULOS_SAUDE[k] + ': ' + U.moeda(i[k])) + '</title></rect>';
            x += w;
            return r;
          }).join('')
        : '<rect x="' + x0 + '" y="' + y + '" width="' + largura.toFixed(1) + '" height="18" rx="3" fill="var(--navy-2)">' +
          '<title>' + esc(i.rotulo + ': ' + U.moeda(i.valor)) + '</title></rect>';

      return '<g>' +
        '<text x="' + (esq - 10) + '" y="' + (y + 13) + '" text-anchor="end" font-size="11" fill="var(--text)">' + esc(i.rotulo) + '</text>' +
        partes +
        '<text x="' + (larg - 6) + '" y="' + (y + 13) + '" text-anchor="end" font-size="11" font-weight="700" fill="var(--text)">' + U.compacto(i.valor) + '</text>' +
        (i.nota ? '<text x="' + (esq - 10) + '" y="' + (y + 25) + '" text-anchor="end" font-size="9" fill="var(--muted)">' + esc(i.nota) + '</text>' : '') +
        '</g>';
    }).join('');

    return (o.semLegenda ? '' : legendaSaude()) + svg(larg, alt, linhas, o.descricao || 'Valor por categoria');
  }

  /* ---------- Barra única de composição ---------- */
  function composicao(partes) {
    const total = partes.reduce(function (s, p) { return s + p.valor; }, 0);
    if (!total) return '<div class="vazio small">Sem valor em aberto.</div>';

    const larg = 640, alt = 30;
    let x = 0;
    const blocos = partes.map(function (p) {
      const w = (p.valor / total) * larg;
      const r = '<rect x="' + x.toFixed(1) + '" y="0" width="' + Math.max(0, w - 2).toFixed(1) + '" height="18" rx="3" fill="' + p.cor + '">' +
        '<title>' + esc(p.rotulo + ': ' + U.moeda(p.valor) + ' (' + Math.round((p.valor / total) * 100) + '%)') + '</title></rect>' +
        (w > 46 ? '<text x="' + (x + w / 2).toFixed(1) + '" y="' + 29 + '" text-anchor="middle" font-size="10" fill="var(--muted)">' +
          Math.round((p.valor / total) * 100) + '%</text>' : '');
      x += w;
      return r;
    }).join('');

    const legenda = '<div class="legenda">' + partes.filter(function (p) { return p.valor > 0; }).map(function (p) {
      return '<span class="item-legenda"><i style="background:' + p.cor + '"></i>' + esc(p.rotulo) + ' · ' + U.compacto(p.valor) + '</span>';
    }).join('') + '</div>';

    return svg(larg, alt, blocos, 'Composição do pipeline') + legenda;
  }

  /* ---------- Matriz oportunidade × decisão ----------
     O quadro que responde de relance: quem está pronto e o que falta em cada um. */
  function matriz(linhas, dimensoes) {
    if (!linhas.length) return '<div class="vazio small">Sem oportunidades neste filtro.</div>';

    const cabecalho = '<div class="matriz-linha cabecalho"><span class="rotulo"></span>' +
      dimensoes.map(function (d) {
        return '<span class="col" title="' + esc(d.nome) + '">' + esc(d.nome.slice(0, 4)) + '</span>';
      }).join('') + '<span class="fim">IAD</span></div>';

    const corpo = linhas.map(function (l) {
      const celulas = l.celulas.map(function (c) {
        const classe = 'm' + c.nota + (c.semProva ? ' sem-prova' : '');
        const rotulos = (global.IADPlaybook.NIVEIS_DA_ESCADA || []).map(function (n) {
          return n.rotulo.toLowerCase();
        });
        const estado = c.semProva
          ? rotulos[c.nota] + ' sem evidência com essa força'
          : rotulos[c.nota];
        return '<span class="cel ' + classe + '" title="' + esc(c.dimensao + ': ' + estado) + '"></span>';
      }).join('');
      return '<button class="matriz-linha" onclick="App.abrir(\'' + l.resumo.op.id + '\')">' +
        '<span class="rotulo"><strong>' + esc(l.titulo) + '</strong><em>' + esc(l.conta) + ' · ' + U.compacto(l.valor) + '</em></span>' +
        celulas + '<span class="fim">' + l.iad + '</span></button>';
    }).join('');

    const legenda = '<div class="legenda">' +
      '<span class="item-legenda"><i class="cel m2"></i>Comprovado</span>' +
      '<span class="item-legenda"><i class="cel m2 sem-prova"></i>Sem prova</span>' +
      '<span class="item-legenda"><i class="cel m1"></i>Parcial</span>' +
      '<span class="item-legenda"><i class="cel m0"></i>Não sabemos</span></div>';

    return legenda + '<div class="matriz">' + cabecalho + corpo + '</div>';
  }


  /* ================= QUATRO FORMAS PARA O MESMO DADO =================

     Funil, barras, linhas e pizza. A escolha não é enfeite: cada forma
     responde uma pergunta diferente sobre a MESMA lista, e deixar o gestor
     trocar é deixá-lo fazer a pergunta que ele tem.

       funil    — quanto se perde de um passo para o outro. Só faz sentido em
                  série que afunila de verdade; num dado que sobe e desce ele
                  mente, e por isso nem sempre é oferecido.
       barras   — comparar tamanhos. É a forma que menos erra, e é o padrão
                  quando há dúvida.
       linhas   — a forma de SEQUÊNCIA: dia da semana, mês. Usar linha em
                  categoria solta (campanhas) sugere continuidade onde não
                  existe — ligar "PAPEL" a "CONSTRUTORAS" com uma reta não
                  quer dizer nada.
       pizza    — parte do todo, e SÓ isso. Com mais de seis fatias vira
                  arco-íris ilegível: da sétima em diante tudo dobra em
                  "Outros", de propósito.

     As cores saem de --cat-1..6, em ordem fixa, nunca cicladas, e foram
     validadas por script contra as duas superfícies do app. Toda marca tem
     rótulo direto e <title> para o toque: é a codificação secundária que
     torna legal o único par com separação no limite para daltonismo. */

  const CAT = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)',
               'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)'];
  const OUTROS = 'var(--cat-outros)';
  const MAX_FATIAS = 6;

  function corDe(i) { return i < CAT.length ? CAT[i] : OUTROS; }

  /* Da sétima categoria em diante, tudo vira uma fatia só. Não é preguiça: é
     o que impede o gráfico de virar arco-íris e o que mantém a paleta
     validada valendo. */
  function dobrarEmOutros(dados, limite) {
    const lim = limite || MAX_FATIAS;
    const lista = dados.slice().sort(function (a, b) { return (b.valor || 0) - (a.valor || 0); });
    if (lista.length <= lim) return lista;
    const ficam = lista.slice(0, lim - 1);
    const resto = lista.slice(lim - 1);
    return ficam.concat([{
      rotulo: 'Outros (' + resto.length + ')',
      valor: resto.reduce(function (s, x) { return s + (x.valor || 0); }, 0),
      outros: true
    }]);
  }

  function legenda(dados) {
    if (dados.length < 2) return '';
    return '<div class="legenda">' + dados.map(function (d, i) {
      return '<span class="item-legenda"><i style="background:' +
        (d.outros ? OUTROS : corDe(i)) + '"></i>' + esc(d.rotulo) + '</span>';
    }).join('') + '</div>';
  }

  function totalDe(dados) {
    return dados.reduce(function (s, d) { return s + (d.valor || 0); }, 0);
  }

  function fmt(v, comoMoeda) {
    return comoMoeda ? U.moeda(v) : U.numero(v, 0);
  }

  /* ---------- FUNIL ---------- */
  function funilSvg(dados, o) {
    const op = o || {};
    const L = 560, alturaDeg = 42, G = 2;
    const H = dados.length * alturaDeg + 8;
    const base = Math.max.apply(null, dados.map(function (d) { return d.valor || 0; }).concat([1]));
    const corpo = dados.map(function (d, i) {
      const prop = (d.valor || 0) / base;
      const larg = Math.max(6, prop * (L - 190));
      const y = i * alturaDeg + 4;
      const x = 186;
      const antes = i ? (dados[i - 1].valor || 0) : null;
      const queda = antes ? Math.round((1 - (d.valor || 0) / antes) * 100) : null;
      return '<g>' +
        '<title>' + esc(d.rotulo) + ': ' + fmt(d.valor, op.moeda) +
        (queda != null ? ' — caiu ' + queda + '% do passo anterior' : '') + '</title>' +
        '<text x="180" y="' + (y + alturaDeg / 2 - G) + '" text-anchor="end" class="g-rot">' +
        esc(cortar(d.rotulo, 24)) + '</text>' +
        '<rect x="' + x + '" y="' + y + '" width="' + larg + '" height="' + (alturaDeg - G * 2) +
        '" rx="4" fill="' + (d.outros ? OUTROS : corDe(i)) + '"></rect>' +
        '<text x="' + (x + larg + 8) + '" y="' + (y + alturaDeg / 2 - G) + '" class="g-val">' +
        fmt(d.valor, op.moeda) + '</text>' +
        '</g>';
    }).join('');
    return svg(L, H, corpo, op.titulo || 'Funil');
  }

  function cortar(t, n) {
    const s = String(t || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /* ---------- BARRAS ---------- */
  function barrasSvg(dados, o) {
    const op = o || {};
    const L = 560, alturaLin = 30, G = 2;
    const H = dados.length * alturaLin + 8;
    const base = Math.max.apply(null, dados.map(function (d) { return d.valor || 0; }).concat([1]));
    const x0 = 186;
    const corpo = dados.map(function (d, i) {
      const larg = Math.max(2, ((d.valor || 0) / base) * (L - x0 - 86));
      const y = i * alturaLin + 4;
      return '<g>' +
        '<title>' + esc(d.rotulo) + ': ' + fmt(d.valor, op.moeda) + '</title>' +
        '<text x="180" y="' + (y + alturaLin / 2 + 4) + '" text-anchor="end" class="g-rot">' +
        esc(cortar(d.rotulo, 24)) + '</text>' +
        '<rect x="' + x0 + '" y="' + (y + G) + '" width="' + larg + '" height="' + (alturaLin - G * 4) +
        '" rx="4" fill="' + (d.outros ? OUTROS : corDe(i)) + '"></rect>' +
        '<text x="' + (x0 + larg + 8) + '" y="' + (y + alturaLin / 2 + 4) + '" class="g-val">' +
        fmt(d.valor, op.moeda) + '</text>' +
        '</g>';
    }).join('');
    return svg(L, H, corpo, op.titulo || 'Barras');
  }

  /* ---------- LINHAS ----------
     Só para sequência. A linha tem 2px e os pontos 8px de alvo, e cada ponto
     carrega o próprio <title>: no celular não existe passar o mouse. */
  function linhasSvg(dados, o) {
    const op = o || {};
    const L = 560, H = 220, m = { e: 54, d: 16, t: 16, b: 34 };
    const base = Math.max.apply(null, dados.map(function (d) { return d.valor || 0; }).concat([1]));
    const larguraUtil = L - m.e - m.d, alturaUtil = H - m.t - m.b;
    const px = function (i) {
      return m.e + (dados.length === 1 ? larguraUtil / 2 : (i / (dados.length - 1)) * larguraUtil);
    };
    const py = function (v) { return m.t + alturaUtil - ((v || 0) / base) * alturaUtil; };

    /* Grade recessiva: três linhas, nada mais. Grade forte compete com o dado. */
    const grade = [0, 0.5, 1].map(function (f) {
      const y = m.t + alturaUtil * (1 - f);
      return '<line x1="' + m.e + '" y1="' + y + '" x2="' + (L - m.d) + '" y2="' + y + '" class="g-grade"></line>' +
        '<text x="' + (m.e - 8) + '" y="' + (y + 4) + '" text-anchor="end" class="g-eixo">' +
        fmt(base * f, op.moeda) + '</text>';
    }).join('');

    const caminho = dados.map(function (d, i) {
      return (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(d.valor).toFixed(1);
    }).join(' ');

    const pontos = dados.map(function (d, i) {
      return '<g><title>' + esc(d.rotulo) + ': ' + fmt(d.valor, op.moeda) + '</title>' +
        '<circle cx="' + px(i).toFixed(1) + '" cy="' + py(d.valor).toFixed(1) +
        '" r="4.5" fill="var(--cat-1)" stroke="var(--surface)" stroke-width="2"></circle>' +
        '<circle cx="' + px(i).toFixed(1) + '" cy="' + py(d.valor).toFixed(1) +
        '" r="11" fill="transparent"></circle></g>';
    }).join('');

    const eixoX = dados.map(function (d, i) {
      return '<text x="' + px(i).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" class="g-eixo">' +
        esc(cortar(d.rotulo, 10)) + '</text>';
    }).join('');

    return svg(L, H, grade +
      '<path d="' + caminho + '" fill="none" stroke="var(--cat-1)" stroke-width="2" ' +
      'stroke-linejoin="round" stroke-linecap="round"></path>' + pontos + eixoX,
      op.titulo || 'Linhas');
  }

  /* ---------- PIZZA (rosca) ----------
     Rosca e não pizza cheia: o buraco do meio carrega o total, que é o número
     que falta em toda pizza. Fatia abaixo de 4% não ganha rótulo na borda —
     rótulos sobrepostos escondem justamente as fatias pequenas. */
  function pizzaSvg(dados, o) {
    const op = o || {};
    const L = 560, H = 240, cx = 120, cy = 120, R = 92, r = 54;
    const total = totalDe(dados);
    if (!total) return svg(L, 60, '<text x="10" y="34" class="g-rot">Sem valor para repartir.</text>', 'Pizza');

    let ang = -Math.PI / 2;
    const fatias = dados.map(function (d, i) {
      const frac = (d.valor || 0) / total;
      const a0 = ang, a1 = ang + frac * Math.PI * 2;
      ang = a1;
      /* Respiro de 2px entre fatias: sem ele, duas cores vizinhas encostam e
         a fronteira some para quem tem baixa visão de contraste. */
      const folga = frac > 0.02 ? 0.012 : 0;
      const b0 = a0 + folga, b1 = a1 - folga;
      const p = function (raio, a) {
        return [(cx + raio * Math.cos(a)).toFixed(2), (cy + raio * Math.sin(a)).toFixed(2)];
      };
      const grande = (b1 - b0) > Math.PI ? 1 : 0;
      const A = p(R, b0), B = p(R, b1), C = p(r, b1), D = p(r, b0);
      const d1 = 'M' + A + 'A' + R + ' ' + R + ' 0 ' + grande + ' 1 ' + B +
        'L' + C + 'A' + r + ' ' + r + ' 0 ' + grande + ' 0 ' + D + 'Z';
      const meio = (a0 + a1) / 2;
      const rot = frac >= 0.04
        ? '<text x="' + (cx + (R + 12) * Math.cos(meio)).toFixed(1) + '" y="' +
          (cy + (R + 12) * Math.sin(meio) + 4).toFixed(1) + '" class="g-val" text-anchor="' +
          (Math.cos(meio) < -0.1 ? 'end' : (Math.cos(meio) > 0.1 ? 'start' : 'middle')) + '">' +
          Math.round(frac * 100) + '%</text>'
        : '';
      return '<g><title>' + esc(d.rotulo) + ': ' + fmt(d.valor, op.moeda) + ' (' +
        U.numero(frac * 100, 1) + '%)</title>' +
        '<path d="' + d1 + '" fill="' + (d.outros ? OUTROS : corDe(i)) + '"></path>' + rot + '</g>';
    }).join('');

    /* A tabela ao lado não é enfeite: é o "table view" que torna o gráfico
       legível para quem não distingue as cores, e o lugar onde o número exato
       aparece sem depender de passar o dedo em cima. */
    const linhas = dados.map(function (d, i) {
      const frac = (d.valor || 0) / total;
      return '<g><rect x="258" y="' + (18 + i * 26) + '" width="10" height="10" rx="2" fill="' +
        (d.outros ? OUTROS : corDe(i)) + '"></rect>' +
        '<text x="276" y="' + (27 + i * 26) + '" class="g-rot">' + esc(cortar(d.rotulo, 26)) + '</text>' +
        '<text x="548" y="' + (27 + i * 26) + '" text-anchor="end" class="g-val">' +
        fmt(d.valor, op.moeda) + ' · ' + Math.round(frac * 100) + '%</text></g>';
    }).join('');

    return svg(L, H, fatias +
      '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" class="g-centro">' +
      fmt(total, op.moeda) + '</text>' +
      '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" class="g-eixo">total</text>' +
      linhas, op.titulo || 'Pizza');
  }


  /* ---------- O FUNIL DESENHADO ----------

     O funil que todo mundo reconhece: uma silhueta que estreita de cima para
     baixo. Ele existe porque a FORMA diz a coisa de um golpe — onde a carteira
     estrangula aparece antes de qualquer número ser lido.

     Três decisões que fazem ele funcionar, e que faltam nos funis que se veem
     por aí:

     1. A LARGURA é proporcional à quantidade, sempre. Funil decorativo desenha
        faixas de largura igual e escreve o número dentro — aí a figura não diz
        nada e o número teria ficado melhor numa tabela.
     2. Nenhum texto DENTRO da faixa. Rótulo à esquerda, número à direita, em
        tinta de texto. Texto dentro de faixa colorida muda de legibilidade a
        cada degrau da rampa, e no modo escuro vira loteria.
     3. A QUEDA de um degrau para o outro é escrita por extenso, na coluna da
        direita. É o número que o gestor procura — "perdi 40% aqui" — e que
        nenhum funil desenhado costuma mostrar.

     A cor vem das quatro ZONAS DE CALOR (--calor-1..4): frio no topo, fervendo
     no fundo. Ver o comentário no CSS para a medição e para por que são quatro
     zonas e não oito cores. */
  /* As quatro zonas de calor, e o que cada uma quer dizer. A ordem é a do
     caminho da decisão: frio onde o cliente mal sabe que tem um problema,
     fervendo onde só falta assinar. Ver o comentário no CSS para a medição e
     para por que são quatro, e não oito. */
  const ZONAS = [
    { cor: 'var(--calor-1)', nome: 'Frio', diz: 'o cliente mal sabe que tem um problema' },
    { cor: 'var(--calor-2)', nome: 'Morno', diz: 'reconheceu, e está medindo quanto vale' },
    { cor: 'var(--calor-3)', nome: 'Quente', diz: 'já discute como e com quem decidir' },
    { cor: 'var(--calor-4)', nome: 'Fervendo', diz: 'falta fechar' }
  ];

  /* Em que zona cai o degrau `i` de `total`. Divide em quatro partes iguais,
     então serve tanto para as oito decisões (duas por zona) quanto para as
     nove etapas do CRM, sem tabela de-para que alguém teria de manter. */
  function zonaDeCalor(i, total) {
    if (total <= 1) return 0;
    return Math.min(3, Math.floor((i * 4) / total));
  }

  function legendaDoCalor() {
    return '<div class="legenda legenda-calor">' + ZONAS.map(function (z) {
      return '<span class="item-legenda" title="' + esc(z.diz) + '">' +
        '<i style="background:' + z.cor + '"></i>' + z.nome + '</span>';
    }).join('') + '</div>';
  }

  /* Cada funil precisa de ids próprios: dois na mesma tela — o real e o
     declarado — compartilhariam o recorte e o brilho, e o segundo herdaria a
     silhueta do primeiro. */
  let serieDoFunil = 0;

  /* A borda de uma faixa, de (x0,y0) a (x1,y1), como curva.

     Era reta, e é daí que vinha o aspecto quadrado: dois degraus de mesmo
     valor viravam um retângulo, e uma queda grande virava uma seta. A cúbica
     abaixo põe os pontos de controle na vertical, a meia altura — então a
     curva CHEGA e SAI na vertical, e a borda da faixa seguinte continua a
     desta sem cotovelo. Empilhadas, as oito faixas formam uma silhueta só,
     contínua, em vez de uma pilha de blocos. */
  function bordaCurva(x0, y0, x1, y1) {
    const k = (y1 - y0) / 2;
    return 'C' + x0 + ' ' + (y0 + k) + ' ' + x1 + ' ' + (y1 - k) + ' ' + x1 + ' ' + y1;
  }

  /* O caminho de uma faixa. `r` arredonda os ombros de cima (só a primeira) e
     o pé de baixo (só a última) — no meio não há canto para arredondar, porque
     a faixa seguinte continua a curva. */
  function faixaDoFunil(eixo, y0, y1, a, b, primeira, ultima) {
    const rc = primeira ? Math.min(18, a) : 0;
    const rb = ultima ? Math.min(20, b) : 0;
    const p = [];

    if (rc) {
      /* A boca do funil é levemente abaulada, não uma régua. São 5px de
         barriga: o bastante para a figura parecer um recipiente visto de lado
         e não uma bigorna, e pouco o bastante para ninguém medir nada por ali
         — o número daquele degrau está escrito ao lado, em algarismo. */
      const domo = y0 - 5;
      p.push('M' + (eixo - a) + ' ' + (y0 + rc));
      p.push('Q' + (eixo - a) + ' ' + y0 + ' ' + (eixo - a + rc) + ' ' + (y0 - 1));
      p.push('Q' + eixo + ' ' + domo + ' ' + (eixo + a - rc) + ' ' + (y0 - 1));
      p.push('Q' + (eixo + a) + ' ' + y0 + ' ' + (eixo + a) + ' ' + (y0 + rc));
    } else {
      p.push('M' + (eixo - a) + ' ' + y0);
      p.push('L' + (eixo + a) + ' ' + y0);
    }

    p.push(bordaCurva(eixo + a, y0 + rc, eixo + b, y1 - rb));

    if (rb) {
      p.push('Q' + (eixo + b) + ' ' + y1 + ' ' + (eixo + b - rb) + ' ' + y1);
      p.push('L' + (eixo - b + rb) + ' ' + y1);
      p.push('Q' + (eixo - b) + ' ' + y1 + ' ' + (eixo - b) + ' ' + (y1 - rb));
    } else {
      p.push('L' + (eixo - b) + ' ' + y1);
    }

    p.push(bordaCurva(eixo - b, y1 - rb, eixo - a, y0 + rc));
    p.push('Z');
    return p.join(' ');
  }

  /* ---------- O FUNIL DESENHADO ----------

     O que mudou e por quê, porque a versão anterior estava feia e o motivo era
     geométrico, não de gosto:

     · As faixas eram TRAPÉZIOS de lados retos, separadas por 16px de vão. Oito
       blocos soltos, cada um com quatro cantos vivos. Pior: quando dois
       degraus têm o mesmo valor — que é o caso normal no topo de um funil de
       decisão — o trapézio vira um RETÂNGULO, e a tela inteira fica quadrada.
       E quando a queda é grande (107 → 6), o trapézio vira uma seta apontando
       para baixo, que ninguém lê como funil.

     · Agora os lados são curvas com tangente vertical nas duas pontas, as
       faixas se tocam sem vão, e o conjunto forma UMA silhueta contínua. Dois
       degraus iguais viram um trecho reto de um corpo curvo, não um tijolo.

     · O vão sumiu, e com ele o lugar onde morava o "↓ N%". Ele foi para a
       coluna de números, à direita, como terceira linha. Ganhou-se o centro do
       desenho limpo — era ali que a seta cruzava a própria faixa.

     As cores não mudaram: são as mesmas quatro zonas de calor, validadas. O
     que entra é um brilho de cima para baixo, branco e translúcido, recortado
     na silhueta — ele não altera matiz nenhum, só dá volume. */
  function funilDesenhado(dados, o) {
    const op = o || {};
    const id = 'fnl' + (++serieDoFunil);
    const n = dados.length;
    const L = 620, topo = 20, alturaFaixa = 50;
    const H = topo + n * alturaFaixa + 20;
    const eixo = L / 2;
    const larguraMax = 264;           /* meia-largura máxima = 132 de cada lado */
    const base = Math.max.apply(null, dados.map(function (d) { return d.valor || 0; }).concat([1]));

    /* ---------- a largura de cada degrau ----------
       A largura é PROPORCIONAL ao valor, e é assim que tem de ser: é ela que
       diz onde a carteira estrangula.

       O piso não é decoração. Sem ele, degrau de valor zero vira uma linha e
       SOME — some justamente onde a notícia é pior. E um piso fixo tinha um
       efeito feio e também errado: seis degraus zerados viravam seis tijolos
       exatamente iguais, um palito reto pendurado no funil. Palito reto diz
       "daqui para baixo tanto faz", e não é o que acontece: o sexto zero está
       mais longe do fechamento que o terceiro.

       Então o piso DESCE ao longo do funil, de 17px a 8px. Ele só age onde a
       proporção já encostou no mínimo — acima disso, quem manda é o valor —, e
       ali ele devolve o afunilamento que a figura precisa ter. O número de cada
       degrau fica escrito ao lado, em algarismo, e é ele que se lê. */
    const piso = function (i) {
      return n > 1 ? 17 - (i / (n - 1)) * 9 : 17;
    };
    const meiaLargura = function (v, i) {
      return Math.max(piso(i), ((v || 0) / base) * (larguraMax / 2));
    };

    const larguras = dados.map(function (d, i) { return meiaLargura(d.valor, i); });

    /* O pé do funil fecha. A última faixa estreita um pouco e termina
       arredondada — é o que faz a figura ser um funil e não um tubo cortado.
       Não carrega informação: o valor do último degrau está na largura de CIMA
       dela, que é onde a faixa começa, e escrito ao lado.

       Setenta por cento e não metade: com metade, uma carteira em que o último
       degrau não caiu ganhava um pedestal no pé, e pedestal parece queda. A
       esta altura é só o arredondamento de quem acaba. */
    const peDoFunil = Math.max(7, larguras[n - 1] * 0.7);

    /* O corpo primeiro, os textos por cima: assim o brilho e as divisórias
       passam por baixo de qualquer rótulo. */
    const caminhos = dados.map(function (d, i) {
      const y0 = topo + i * alturaFaixa;
      const a = larguras[i];
      const b = i + 1 < n ? larguras[i + 1] : peDoFunil;
      return faixaDoFunil(eixo, y0, y0 + alturaFaixa, a, b, i === 0, i === n - 1);
    });

    const corpo = caminhos.map(function (caminho, i) {
      const d = dados[i];
      const prop = base ? Math.round(((d.valor || 0) / base) * 100) : 0;
      const antes = i ? (dados[i - 1].valor || 0) : null;
      const queda = antes != null && antes > 0
        ? Math.round((1 - (d.valor || 0) / antes) * 100) : null;
      /* A classe nomeia a faixa. Sem ela, qualquer busca por `path` dentro do
         grupo pega também os caminhos do recorte, que são cópias — e contar
         cópia como faixa é erro que só aparece num teste. */
      return '<path class="g-faixa-funil" d="' + caminho + '" fill="' +
        ZONAS[zonaDeCalor(i, dados.length)].cor + '">' +
        '<title>' + esc(d.rotulo) + ': ' + fmt(d.valor, op.moeda) + ' (' + prop + '% da entrada)' +
        (queda != null ? ' — caiu ' + queda + '% do passo anterior' : '') + '</title></path>';
    }).join('');

    /* As divisórias. Um fio da cor da superfície no limite entre duas faixas,
       só da largura daquele ponto: separa sem recortar a silhueta, que é o que
       uma linha de contorno faria. */
    const divisorias = dados.slice(1).map(function (d, k) {
      const i = k + 1;
      const y = topo + i * alturaFaixa;
      const b = larguras[i];
      return '<line x1="' + (eixo - b) + '" y1="' + y + '" x2="' + (eixo + b) + '" y2="' + y +
        '" class="g-corte-funil"></line>';
    }).join('');

    const brilho = '<defs>' +
      '<clipPath id="' + id + '-c">' + caminhos.map(function (c) {
        return '<path d="' + c + '"></path>';
      }).join('') + '</clipPath>' +
      '<linearGradient id="' + id + '-b" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity="0.22"></stop>' +
      '<stop offset="0.45" stop-color="#ffffff" stop-opacity="0.05"></stop>' +
      '<stop offset="1" stop-color="#ffffff" stop-opacity="0"></stop>' +
      '</linearGradient></defs>' +
      '<rect x="0" y="0" width="' + L + '" height="' + H + '" fill="url(#' + id + '-b)"' +
      ' clip-path="url(#' + id + '-c)" pointer-events="none"></rect>';

    const textos = dados.map(function (d, i) {
      const y0 = topo + i * alturaFaixa;
      const meio = y0 + alturaFaixa / 2;
      const prop = base ? Math.round(((d.valor || 0) / base) * 100) : 0;
      const antes = i ? (dados[i - 1].valor || 0) : null;
      const queda = antes != null && antes > 0
        ? Math.round((1 - (d.valor || 0) / antes) * 100) : null;
      const temQueda = queda != null && queda > 0;
      /* Três linhas quando há queda, duas quando não há — e o bloco inteiro
         centrado na faixa nos dois casos, senão o texto dança de linha para
         linha ao descer o funil. */
      const base1 = temQueda ? meio - 6 : meio - 1;
      return '<text x="' + (eixo - larguraMax / 2 - 16) + '" y="' + (meio + 4) +
        '" text-anchor="end" class="g-rot">' + esc(cortar(d.rotulo, 26)) + '</text>' +
        '<text x="' + (eixo + larguraMax / 2 + 16) + '" y="' + base1 + '" class="g-num-funil">' +
        fmt(d.valor, op.moeda) + '</text>' +
        '<text x="' + (eixo + larguraMax / 2 + 16) + '" y="' + (base1 + 15) + '" class="g-eixo">' +
        prop + '% da entrada</text>' +
        (temQueda
          ? '<text x="' + (eixo + larguraMax / 2 + 16) + '" y="' + (base1 + 29) +
            '" class="g-queda">↓ ' + queda + '% do anterior</text>'
          : '');
    }).join('');

    /* A legenda nomeia as zonas: cor sozinha nunca é a única pista. */
    return legendaDoCalor() +
      svg(L, H, '<g class="funil-corpo">' + corpo + brilho + divisorias + '</g>' + textos,
        op.titulo || 'Funil');
  }

  /* O despachante. `tipo` que não existe cai em barras, que é a forma que
     menos erra — e nunca devolve tela em branco. */
  function desenhar(tipo, dados, opcoes) {
    const o = opcoes || {};
    const limpos = (dados || []).filter(function (d) { return d && d.rotulo != null; });
    if (!limpos.length) return '<div class="vazio small">Sem dados neste recorte.</div>';

    if (tipo === 'pizza') {
      const dobrados = dobrarEmOutros(limpos);
      return pizzaSvg(dobrados, o);
    }
    if (tipo === 'linhas') return linhasSvg(limpos, o) + legenda([]);
    if (tipo === 'funil') return funilDesenhado(limpos, o);
    if (tipo === 'barraFunil') return funilSvg(limpos, o);
    return barrasSvg(dobrarEmOutros(limpos, o.semDobrar ? 999 : MAX_FATIAS), o);
  }

  /* Os botões de forma. `atual` fica fora daqui: quem guarda o estado é a
     tela, porque cada cartão lembra a sua própria escolha. */
  function seletorDeForma(id, atual, formas) {
    const nomes = { funil: 'Funil', lista: 'Lista', barras: 'Barras', linhas: 'Linhas', pizza: 'Pizza' };
    const ajuda = {
      funil: 'O desenho clássico: uma silhueta contínua que estreita. A forma mostra onde estrangula antes de você ler um número.',
      lista: 'O mesmo funil em linhas, com o valor, a porcentagem do passo anterior e a marca do gargalo. Cabe mais texto que no desenho.',
      barras: 'Comparar tamanhos. É a forma que menos erra.',
      linhas: 'Para sequência — dia, mês. Em categoria solta, uma reta ligando duas campanhas não quer dizer nada.',
      pizza: 'Parte do todo, e só isso. Da sétima fatia em diante tudo dobra em "Outros".'
    };
    return '<div class="formas">' + (formas || ['barras', 'pizza']).map(function (f) {
      return '<button class="btn ghost mini' + (atual === f ? ' ativa' : '') +
        '" onclick="App.formaDoGrafico(\'' + id + '\',\'' + f + '\')"' +
        ' data-ajuda-titulo="' + nomes[f] + '" data-ajuda="' + esc(ajuda[f]) + '">' +
        nomes[f] + '</button>';
    }).join('') + '</div>';
  }

  global.IADGraficos = { colunasPorMes, barrasHorizontais, composicao, matriz, CORES_SAUDE, ROTULOS_SAUDE, legendaSaude,
    desenhar, seletorDeForma, legenda, dobrarEmOutros, funilDesenhado,
    zonaDeCalor, legendaDoCalor, ZONAS, CAT, MAX_FATIAS };
})(window);
