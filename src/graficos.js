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

  global.IADGraficos = { colunasPorMes, barrasHorizontais, composicao, matriz, CORES_SAUDE, ROTULOS_SAUDE, legendaSaude };
})(window);
