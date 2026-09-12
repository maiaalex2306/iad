/* Leitura de documentos no navegador, sem biblioteca nenhuma.
   ------------------------------------------------------------------
   O vendedor tem a proposta em Word, a planilha de consumo em Excel e o
   edital em PDF. Pedir que ele copie e cole o conteúdo é pedir que ele não
   use — e "cole aqui" era exatamente o que este app fazia.

   Por que sem biblioteca: o projeto não tem build nem dependências, e uma
   página que baixa um interpretador de PDF de 400 kB para ler um arquivo
   deixa de abrir no celular do vendedor em campo. O que precisamos é o
   texto, não o layout.

   Word, Excel e PowerPoint são arquivos ZIP com XML dentro — o navegador já
   sabe descomprimir (DecompressionStream), então basta abrir o ZIP e ler o
   XML certo. PDF é outra história, e está honestamente comentada lá embaixo. */
(function (global) {
  'use strict';

  const LIMITE_BYTES = 20 * 1024 * 1024;   /* 20 MB por arquivo */
  const LIMITE_TEXTO = 60000;              /* o que vai para a IA, por arquivo */

  function extensao(nome) {
    const m = String(nome || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function aceito(arquivo) {
    return ['docx', 'xlsx', 'pptx', 'pdf', 'txt', 'md', 'csv', 'tsv', 'vtt', 'srt', 'json', 'rtf']
      .indexOf(extensao(arquivo && arquivo.name)) !== -1;
  }

  /* ---------- ZIP ----------
     Lemos pelo diretório central, no fim do arquivo, e não varrendo cabeçalhos
     locais: quando o ZIP foi escrito em fluxo, o tamanho do dado não está no
     cabeçalho local, e sim num descritor depois dele. O diretório central
     sempre tem os tamanhos certos. */
  function abrirZip(buffer) {
    const dv = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    let fim = -1;
    const minimo = Math.max(0, bytes.length - 66000);
    for (let i = bytes.length - 22; i >= minimo; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    }
    if (fim < 0) throw new Error('Arquivo não parece um documento válido.');

    const total = dv.getUint16(fim + 10, true);
    let p = dv.getUint32(fim + 16, true);
    const entradas = [];

    for (let i = 0; i < total; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true);
      const comprimido = dv.getUint32(p + 20, true);
      const tamNome = dv.getUint16(p + 28, true);
      const tamExtra = dv.getUint16(p + 30, true);
      const tamComentario = dv.getUint16(p + 32, true);
      const inicioLocal = dv.getUint32(p + 42, true);
      const nome = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + tamNome));
      entradas.push({ nome: nome, metodo: metodo, comprimido: comprimido, inicioLocal: inicioLocal });
      p += 46 + tamNome + tamExtra + tamComentario;
    }

    return {
      nomes: function () { return entradas.map(function (e) { return e.nome; }); },
      texto: function (nome) {
        const e = entradas.filter(function (x) { return x.nome === nome; })[0];
        if (!e) return Promise.resolve('');
        /* O cabeçalho local repete nome e extra com tamanhos próprios: é ele
           que diz onde o dado começa de verdade. */
        const tamNome = dv.getUint16(e.inicioLocal + 26, true);
        const tamExtra = dv.getUint16(e.inicioLocal + 28, true);
        const inicio = e.inicioLocal + 30 + tamNome + tamExtra;
        const dado = bytes.subarray(inicio, inicio + e.comprimido);
        if (e.metodo === 0) return Promise.resolve(new TextDecoder().decode(dado));
        return inflar(dado);
      }
    };
  }

  /* Os dois são "deflate" e não são a mesma coisa: dentro de um ZIP o dado é
     cru, e dentro de um PDF vem com o cabeçalho do zlib. Descomprimir um com o
     descompressor do outro falha em silêncio — foi o que fez o PDF voltar
     vazio e ser confundido com PDF digitalizado. */
  function inflar(dado, formato) {
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error('Este navegador não descomprime arquivos. Use um Chrome, Edge, Firefox ou Safari atual.'));
    }
    const ds = new DecompressionStream(formato || 'deflate-raw');
    const fluxo = new Blob([dado]).stream().pipeThrough(ds);
    return new Response(fluxo).arrayBuffer().then(function (b) {
      return new TextDecoder().decode(new Uint8Array(b));
    });
  }

  function semTags(xml) {
    return xml.replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }

  /* ---------- Word ---------- */
  function lerDocx(zip) {
    return zip.texto('word/document.xml').then(function (xml) {
      if (!xml) return '';
      return semTags(xml
        .replace(/<w:tab\b[^>]*\/?>/g, '\t')
        .replace(/<w:br\b[^>]*\/?>/g, '\n')
        .replace(/<\/w:p>/g, '\n'));
    });
  }

  /* ---------- PowerPoint ---------- */
  function lerPptx(zip) {
    const slides = zip.nomes().filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); })
      .sort(function (a, b) {
        const na = parseInt(a.replace(/\D+/g, ''), 10), nb = parseInt(b.replace(/\D+/g, ''), 10);
        return na - nb;
      });
    return Promise.all(slides.map(function (n, i) {
      return zip.texto(n).then(function (xml) {
        const t = semTags(xml.replace(/<\/a:p>/g, '\n')).trim();
        return t ? '--- slide ' + (i + 1) + ' ---\n' + t : '';
      });
    })).then(function (partes) { return partes.filter(Boolean).join('\n\n'); });
  }

  /* ---------- Excel ----------
     O texto das células não fica na planilha: fica numa tabela de strings
     compartilhadas, e a célula guarda só o índice. Ler a planilha sem ela
     devolve uma grade de números sem nenhuma palavra. */
  function lerXlsx(zip) {
    return zip.texto('xl/sharedStrings.xml').then(function (xml) {
      const compartilhadas = [];
      if (xml) {
        const itens = xml.match(/<si\b[\s\S]*?<\/si>/g) || [];
        itens.forEach(function (si) { compartilhadas.push(semTags(si)); });
      }
      const abas = zip.nomes().filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort();
      return Promise.all(abas.map(function (n, i) {
        return zip.texto(n).then(function (folha) {
          return '--- planilha ' + (i + 1) + ' ---\n' + linhasDaFolha(folha, compartilhadas);
        });
      }));
    }).then(function (partes) { return partes.filter(Boolean).join('\n\n'); });
  }

  function linhasDaFolha(xml, compartilhadas) {
    const linhas = xml.match(/<row\b[\s\S]*?<\/row>/g) || [];
    return linhas.map(function (linha) {
      const celulas = linha.match(/<c\b[\s\S]*?(?:\/>|<\/c>)/g) || [];
      return celulas.map(function (c) {
        const tipo = (c.match(/\st="([^"]+)"/) || [])[1] || '';
        const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (tipo === 's') return compartilhadas[parseInt(v, 10)] || '';
        if (tipo === 'inlineStr') return semTags((c.match(/<is>[\s\S]*?<\/is>/) || [''])[0]);
        return v == null ? '' : v;
      }).join('\t');
    }).filter(function (l) { return l.replace(/\t/g, '').trim(); }).join('\n');
  }

  /* ---------- PDF ----------
     PDF não guarda texto: guarda instruções de desenho, com as letras dentro
     de fluxos comprimidos. E há dois mundos aí dentro.

     No mundo fácil, a letra aparece literal — `(Proposta) Tj` — e basta
     recolher. No mundo comum de hoje (Google Docs, Figma, Canva, qualquer
     gerador que embute a fonte só com os glifos usados), o que aparece é
     `<0012> Tj`: um índice de glifo dentro da fonte, que não é a letra nem o
     código dela. Ler isso sem tradução devolve nada, e o app dizia "este PDF
     é digitalizado" — uma resposta errada, e cara: o documento com a proposta
     e o preço passava batido, e o vendedor não tinha como saber por quê.

     A tradução existe dentro do próprio arquivo: cada fonte carrega um
     `/ToUnicode`, um CMap que diz qual letra cada glifo representa. Aqui ele é
     lido, e o texto sai. Continua não funcionando em PDF que é foto de papel —
     ali não existe texto nenhum, e nenhum truque resolve sem OCR. */
  function lerPdf(buffer) {
    const bytes = new Uint8Array(buffer);
    const bruto = decodificarLatin(bytes);
    return mapasDeFonte(bytes, bruto).then(function (mapas) {
      const fluxos = localizarFluxos(bytes, bruto);
      return Promise.all(fluxos.map(function (f) {
        if (!f.comprimido) return Promise.resolve(decodificarLatin(f.dado));
        /* Alguns geradores escrevem o fluxo cru mesmo dizendo FlateDecode.
           Tentamos zlib e, se recusar, deflate cru — custa uma tentativa e
           evita perder o documento inteiro por causa do cabeçalho. */
        return inflar(f.dado, 'deflate')
          .catch(function () { return inflar(f.dado, 'deflate-raw'); })
          .catch(function () { return ''; });
      })).then(function (partes) {
        const texto = partes.map(function (t) { return textoDoFluxo(t, mapas); })
          .filter(Boolean).join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        if (!texto) {
          throw new Error('Este PDF não tem texto que eu consiga ler — provavelmente é digitalizado (foto do papel). ' +
            'Salve como Word, ou copie o conteúdo e cole na caixa.');
        }
        return texto;
      });
    });
  }

  function decodificarLatin(u8) {
    let s = '';
    /* Em pedaços: String.fromCharCode.apply com um arquivo inteiro estoura a
       pilha de argumentos do navegador em PDFs grandes. */
    for (let i = 0; i < u8.length; i += 8192) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
    }
    return s;
  }

  /* Os CMaps /ToUnicode do arquivo, por nome de recurso (/F5, /F6…).

     Não montamos um interpretador de PDF: varremos os objetos `N 0 obj`,
     achamos quais são fontes com /ToUnicode, inflamos esses CMaps e ligamos
     cada nome de recurso ao mapa pelo /Font << /F5 12 0 R >> das páginas.
     É pouco código e cobre o arquivo gerado por editor, que é o caso real. */
  function mapasDeFonte(bytes, bruto) {
    const objetos = {};
    const reObj = /(\d+)\s+0\s+obj\b/g;
    let m;
    while ((m = reObj.exec(bruto)) !== null) {
      const fim = bruto.indexOf('endobj', m.index);
      objetos[m[1]] = { ini: m.index + m[0].length, fim: fim < 0 ? bruto.length : fim };
    }

    /* recurso (/F5) → número do objeto do /ToUnicode */
    const doRecurso = {};
    const reFonte = /\/Font\s*<<([^>]*)>>/g;
    while ((m = reFonte.exec(bruto)) !== null) {
      const dentro = m[1];
      const reRef = /\/(\w+)\s+(\d+)\s+0\s+R/g;
      let r;
      while ((r = reRef.exec(dentro)) !== null) {
        const obj = objetos[r[2]];
        if (!obj) continue;
        const corpo = bruto.slice(obj.ini, obj.fim);
        const uni = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(corpo);
        /* Fonte tipo 0 aponta para a descendente; o /ToUnicode fica na pai,
           então basta procurar aqui e, se faltar, seguir o /DescendantFonts. */
        if (uni) { doRecurso[r[1]] = uni[1]; continue; }
        const desc = /\/DescendantFonts\s*\[\s*(\d+)\s+0\s+R/.exec(corpo);
        if (!desc) continue;
        const filho = objetos[desc[1]];
        if (!filho) continue;
        const u2 = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(bruto.slice(filho.ini, filho.fim));
        if (u2) doRecurso[r[1]] = u2[1];
      }
    }

    const numeros = {};
    Object.keys(doRecurso).forEach(function (nome) { numeros[doRecurso[nome]] = true; });

    const leituras = Object.keys(numeros).map(function (num) {
      const obj = objetos[num];
      if (!obj) return Promise.resolve(null);
      const corpo = bruto.slice(obj.ini, obj.fim);
      const marca = /stream\r?\n?/.exec(corpo);
      if (!marca) return Promise.resolve(null);
      const ini = obj.ini + marca.index + marca[0].length;
      let ate = bruto.indexOf('endstream', ini);
      if (ate < 0) return Promise.resolve(null);
      while (ate > ini && (bytes[ate - 1] === 10 || bytes[ate - 1] === 13)) ate--;
      return inflar(bytes.subarray(ini, ate), 'deflate')
        .catch(function () { return inflar(bytes.subarray(ini, ate), 'deflate-raw'); })
        .then(function (t) { return { num: num, mapa: lerCMap(t) }; })
        .catch(function () { return null; });
    });

    return Promise.all(leituras).then(function (lidos) {
      const porNumero = {};
      lidos.forEach(function (x) { if (x) porNumero[x.num] = x.mapa; });
      const saida = {};
      Object.keys(doRecurso).forEach(function (nome) {
        const mapa = porNumero[doRecurso[nome]];
        if (mapa) saida[nome] = mapa;
      });
      return saida;
    });
  }

  /* bfchar lista pares avulsos; bfrange lista faixas — e a faixa pode vir com
     um destino inicial (<0041> = A, A+1, A+2…) ou com uma lista explícita. */
  function lerCMap(texto) {
    const mapa = {};
    const hexParaTexto = function (h) {
      let s = '';
      for (let i = 0; i + 3 < h.length + 1; i += 4) {
        const c = parseInt(h.substr(i, 4), 16);
        if (!isNaN(c)) s += String.fromCharCode(c);
      }
      return s;
    };

    let bloco = /beginbfchar([\s\S]*?)endbfchar/g, m;
    while ((m = bloco.exec(texto)) !== null) {
      const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      let p;
      while ((p = re.exec(m[1])) !== null) mapa[p[1].toUpperCase()] = hexParaTexto(p[2]);
    }

    bloco = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = bloco.exec(texto)) !== null) {
      const corpo = m[1];
      const reLista = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g;
      let p;
      while ((p = reLista.exec(corpo)) !== null) {
        const de = parseInt(p[1], 16);
        const itens = p[3].match(/<([0-9A-Fa-f]+)>/g) || [];
        itens.forEach(function (item, i) {
          mapa[(de + i).toString(16).toUpperCase().padStart(p[1].length, '0')] =
            hexParaTexto(item.slice(1, -1));
        });
      }
      const reFaixa = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      while ((p = reFaixa.exec(corpo)) !== null) {
        const de = parseInt(p[1], 16), ate = parseInt(p[2], 16), alvo = parseInt(p[3], 16);
        if (ate - de > 65535) continue;
        for (let c = de; c <= ate; c++) {
          mapa[c.toString(16).toUpperCase().padStart(p[1].length, '0')] =
            String.fromCharCode(alvo + (c - de));
        }
      }
    }
    return mapa;
  }

  function localizarFluxos(bytes, bruto) {
    const achados = [];
    /* \b antes de "stream" é o que impede casar dentro de "endstream" — sem
       isso cada fluxo era encontrado duas vezes, a segunda com o início no
       lugar errado, e o descompressor recusava tudo. O PDF voltava vazio e o
       app dizia "provavelmente é digitalizado", que é a resposta errada mais
       cara que este leitor podia dar. */
    const re = /\bstream\r?\n?/g;
    let m;
    while ((m = re.exec(bruto)) !== null) {
      const inicio = m.index + m[0].length;
      const fim = bruto.indexOf('endstream', inicio);
      if (fim < 0) continue;
      const cabecalho = bruto.slice(Math.max(0, m.index - 400), m.index);
      /* O "endstream" vem depois de uma quebra de linha que não faz parte do
         dado. Deixá-la dentro faz o descompressor recusar o fluxo inteiro. */
      let ate = fim;
      while (ate > inicio && (bytes[ate - 1] === 10 || bytes[ate - 1] === 13)) ate--;
      achados.push({
        dado: bytes.subarray(inicio, ate),
        comprimido: /FlateDecode/.test(cabecalho)
      });
      re.lastIndex = fim;
      if (achados.length > 400) break;   /* PDF gigante não trava o navegador */
    }
    return achados;
  }

  /* Tj mostra um texto; TJ mostra uma lista com ajustes de espaçamento no
     meio, que são números e não fazem parte do conteúdo.

     A quebra de linha sai de Tm, T* e ET, e NÃO de Td: o gerador que escreve
     glifo a glifo emite um Td entre cada letra, e quebrar ali põe cada letra
     numa linha — foi o que aconteceu no primeiro teste com um PDF de verdade. */
  function textoDoFluxo(fluxo, mapas) {
    if (!/\b(Tj|TJ)\b/.test(fluxo)) return '';
    const saida = [];
    const re = /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]*)>|\((?:\\.|[^\\()])*\)|\bTJ\b|\bTj\b|\bTD\b|\bTm\b|\bT\*\b|\bET\b/g;
    let m, linha = [], fonte = null;

    const quebrar = function () {
      if (!linha.length) return;
      const t = linha.join('').replace(/[ \t]+$/, '');
      if (t.trim()) saida.push(t);
      linha = [];
    };

    while ((m = re.exec(fluxo)) !== null) {
      const t = m[0];
      if (m[1]) { fonte = m[1]; continue; }                 /* /F5 9 Tf */
      if (m[2] != null) {                                   /* <hex> */
        const mapa = (mapas && fonte) ? mapas[fonte] : null;
        linha.push(decodificarHex(m[2], mapa));
        continue;
      }
      if (t.charAt(0) === '(') {
        const cru = t.slice(1, -1)
          .replace(/\\([nrt])/g, function (_, c) { return c === 'n' ? '\n' : c === 'r' ? '' : '\t'; })
          .replace(/\\([()\\])/g, '$1')
          .replace(/\\([0-7]{1,3})/g, function (_, o) { return String.fromCharCode(parseInt(o, 8)); });
        /* Fonte de subconjunto — a que os editores geram — numera os glifos do
           zero e escreve a cadeia com esses números. Lida como bytes, "Água"
           vira "3'#)". O /ToUnicode existe justamente para desfazer isso, e
           antes ele só era consultado nas cadeias <hex>: o texto saía cifrado
           e ia cifrado para a IA, sem ninguém perceber. */
        const mapa = (mapas && fonte) ? mapas[fonte] : null;
        const codigos = [];
        if (larguraDaChave(mapa) === 4) {
          for (let i = 0; i + 1 < cru.length; i += 2) {
            codigos.push((cru.charCodeAt(i) << 8) | cru.charCodeAt(i + 1));
          }
        } else {
          for (let i = 0; i < cru.length; i++) codigos.push(cru.charCodeAt(i));
        }
        const traduzido = pelaFonte(codigos, mapa);
        linha.push(traduzido != null ? traduzido : cru);
        continue;
      }
      if (t === 'TD' || t === 'Tm' || t === 'T*' || t === 'ET') quebrar();
    }
    quebrar();
    return saida.join('\n');
  }

  /* Sem mapa, o hexadecimal é lido como bytes: serve para o PDF simples que
     escreve <48656C6C6F>. Com mapa, cada código de dois bytes vira a letra
     que a fonte diz que ele é. */
  /* A largura da chave do /ToUnicode diz se o código do caractere ocupa um
     byte (fonte simples) ou dois (fonte composta). O CMap guarda o código na
     largura original, então basta olhar a primeira chave. */
  function larguraDaChave(mapa) {
    if (!mapa) return 0;
    for (const k in mapa) { if (Object.prototype.hasOwnProperty.call(mapa, k)) return k.length; }
    return 0;
  }

  /* Traduz códigos pelo /ToUnicode da fonte. Só vale se a maioria dos códigos
     estiver no mapa: fonte com ToUnicode parcial traduziria meia frase e
     comeria a outra metade, o que é pior do que não traduzir. */
  function pelaFonte(codigos, mapa) {
    const largura = larguraDaChave(mapa);
    if (!largura || !codigos.length) return null;
    let saida = '', achados = 0;
    for (let i = 0; i < codigos.length; i++) {
      const chave = codigos[i].toString(16).toUpperCase().padStart(largura, '0');
      if (mapa[chave] != null) { saida += mapa[chave]; achados++; }
    }
    return (achados / codigos.length) >= 0.6 ? saida : null;
  }

  function decodificarHex(hex, mapa) {
    const h = hex.replace(/\s+/g, '').toUpperCase();
    if (!h) return '';
    const largura = larguraDaChave(mapa) || 4;
    if (mapa) {
      const codigos = [];
      for (let i = 0; i + largura <= h.length; i += largura) {
        codigos.push(parseInt(h.substr(i, largura), 16));
      }
      const traduzido = pelaFonte(codigos, mapa);
      if (traduzido) return traduzido;
    }
    let s = '';
    for (let i = 0; i + 2 <= h.length; i += 2) {
      const c = parseInt(h.substr(i, 2), 16);
      if (c >= 32 && c < 127) s += String.fromCharCode(c);
    }
    return s;
  }

  /* ---------- entrada ---------- */
  function ler(arquivo) {
    if (!arquivo) return Promise.reject(new Error('Nenhum arquivo.'));
    if (arquivo.size > LIMITE_BYTES) {
      return Promise.reject(new Error('Arquivo grande demais (' + Math.round(arquivo.size / 1048576) + ' MB). O limite é 20 MB.'));
    }
    const ext = extensao(arquivo.name);

    if (['txt', 'md', 'csv', 'tsv', 'vtt', 'srt', 'json', 'rtf'].indexOf(ext) !== -1) {
      return arquivo.text().then(function (t) {
        return cortar(ext === 'vtt' || ext === 'srt' ? limparLegenda(t) : t);
      });
    }
    return arquivo.arrayBuffer().then(function (buffer) {
      if (ext === 'pdf') return lerPdf(buffer);
      const zip = abrirZip(buffer);
      if (ext === 'docx') return lerDocx(zip);
      if (ext === 'xlsx') return lerXlsx(zip);
      if (ext === 'pptx') return lerPptx(zip);
      throw new Error('Não sei ler arquivos .' + ext + '.');
    }).then(cortar);
  }

  /* Legenda tem uma linha de tempo a cada fala. Sem limpar, metade do que a
     IA lê é "00:04:12.480 --> 00:04:15.120" — e a cota do documento se gasta
     em carimbo de relógio, não no que o cliente disse. */
  function limparLegenda(texto) {
    return String(texto || '')
      .replace(/^WEBVTT.*$/gm, '')
      .replace(/^\d+\s*$/gm, '')
      .replace(/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->.*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function cortar(t) {
    const limpo = String(t || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return limpo.length > LIMITE_TEXTO ? limpo.slice(0, LIMITE_TEXTO) + '\n[…cortado…]' : limpo;
  }

  /* Vários de uma vez. Um arquivo ilegível não derruba os outros: volta com o
     motivo, para a tela mostrar ao lado do nome dele. */
  function lerVarios(arquivos) {
    return Promise.all(Array.prototype.map.call(arquivos || [], function (a) {
      return ler(a).then(
        function (texto) { return { nome: a.name, tamanho: a.size, texto: texto, erro: '' }; },
        function (e) { return { nome: a.name, tamanho: a.size, texto: '', erro: e.message }; }
      );
    }));
  }

  global.IADDocumentos = { ler: ler, lerVarios: lerVarios, aceito: aceito, extensao: extensao };
})(window);
