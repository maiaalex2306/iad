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
     Aqui a honestidade importa mais que a esperteza. PDF não guarda texto:
     guarda instruções de desenho, com as letras dentro de fluxos comprimidos
     e mapeadas por fontes que podem reordenar o alfabeto. Ler tudo direito
     exige um interpretador de verdade — é por isso que existem bibliotecas
     grandes só para isso.

     O que fazemos é o caso comum e honesto: descomprimir os fluxos e recolher
     o que os operadores de texto mostram. Funciona na maioria dos PDFs gerados
     por Word, Google Docs e sistemas de proposta. Não funciona em PDF que é
     foto de papel — ali não existe texto nenhum, só imagem, e nenhum truque
     resolve sem reconhecimento óptico. Quando não sai nada, dizemos isso em
     vez de devolver um vazio silencioso. */
  function lerPdf(buffer) {
    const bytes = new Uint8Array(buffer);
    const fluxos = localizarFluxos(bytes);
    return Promise.all(fluxos.map(function (f) {
      if (!f.comprimido) return Promise.resolve(decodificarLatin(f.dado));
      /* Alguns geradores escrevem o fluxo cru mesmo dizendo FlateDecode.
         Tentamos zlib e, se recusar, deflate cru — custa uma tentativa e
         evita perder o documento inteiro por causa do cabeçalho. */
      return inflar(f.dado, 'deflate')
        .catch(function () { return inflar(f.dado, 'deflate-raw'); })
        .catch(function () { return ''; });
    })).then(function (partes) {
      const texto = partes.map(textoDoFluxo).filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!texto) {
        throw new Error('Este PDF não tem texto que eu consiga ler — provavelmente é digitalizado (foto do papel). ' +
          'Salve como Word, ou copie o conteúdo e cole na caixa.');
      }
      return texto;
    });
  }

  function decodificarLatin(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return s;
  }

  function localizarFluxos(bytes) {
    const bruto = decodificarLatin(bytes);
    const achados = [];
    const re = /stream\r?\n?/g;
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
     meio, que são números e não fazem parte do conteúdo. */
  function textoDoFluxo(fluxo) {
    if (!/\b(Tj|TJ)\b/.test(fluxo)) return '';
    const saida = [];
    const re = /\((?:\\.|[^\\()])*\)|\bTJ\b|\bTj\b|\bTD\b|\bTd\b|\bT\*\b|\bET\b/g;
    let m, linha = [];
    while ((m = re.exec(fluxo)) !== null) {
      const t = m[0];
      if (t.charAt(0) === '(') {
        linha.push(t.slice(1, -1)
          .replace(/\\([nrt])/g, function (_, c) { return c === 'n' ? '\n' : c === 'r' ? '' : '\t'; })
          .replace(/\\([()\\])/g, '$1')
          .replace(/\\([0-7]{1,3})/g, function (_, o) { return String.fromCharCode(parseInt(o, 8)); }));
      } else if (t === 'TD' || t === 'Td' || t === 'T*' || t === 'ET') {
        if (linha.length) { saida.push(linha.join('')); linha = []; }
      }
    }
    if (linha.length) saida.push(linha.join(''));
    return saida.join('\n');
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
