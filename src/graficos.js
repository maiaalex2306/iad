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
    if (tipo === 'funil') return funilSvg(limpos, o);
    return barrasSvg(dobrarEmOutros(limpos, o.semDobrar ? 999 : MAX_FATIAS), o);
  }

  /* Os botões de forma. `atual` fica fora daqui: quem guarda o estado é a
     tela, porque cada cartão lembra a sua própria escolha. */
  function seletorDeForma(id, atual, formas) {
    const nomes = { funil: 'Funil', barras: 'Barras', linhas: 'Linhas', pizza: 'Pizza' };
    const ajuda = {
      funil: 'Quanto se perde de um passo para o outro.',
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
    desenhar, seletorDeForma, legenda, dobrarEmOutros, CAT, MAX_FATIAS };
})(window);
