/* Leitura de e-mail cru (RFC 822 / MIME), sem biblioteca.
   ------------------------------------------------------------------
   Por que sem biblioteca: esta função é a única do sistema que segura senha de
   caixa de e-mail. Toda dependência que entra aqui passa a poder ler toda a
   correspondência de todos os clientes no dia em que for comprometida — e
   biblioteca de e-mail é alvo clássico exatamente por isso. O protocolo é
   antigo e chato, não difícil; o que ele exige é cuidado com os casos reais,
   que estão comentados um a um abaixo.

   Este arquivo NÃO usa nada do Deno de propósito: assim ele roda em qualquer
   lugar e dá para testar o parser fora da função, que é onde mora o risco. */

export type Cabecalhos = Record<string, string>;

/* ---------- cabeçalhos ----------

   Duas armadilhas conhecidas:

   1. Cabeçalho longo vem QUEBRADO em várias linhas, e a continuação começa com
      espaço ou tabulação. Ler linha a linha sem juntar parte o assunto no meio
      e perde metade do Message-ID.
   2. O mesmo nome pode aparecer mais de uma vez (Received, References). Aqui
      vale o primeiro para quase tudo, e References é tratado à parte. */
export function separarCabecalhos(bruto: string): { cabecalhos: Cabecalhos; corpo: string } {
  const texto = String(bruto || '').replace(/\r\n/g, '\n');
  const corte = texto.indexOf('\n\n');
  const zonaCabecalho = corte === -1 ? texto : texto.slice(0, corte);
  const corpo = corte === -1 ? '' : texto.slice(corte + 2);

  const juntas: string[] = [];
  zonaCabecalho.split('\n').forEach((linha) => {
    if (/^[ \t]/.test(linha) && juntas.length) {
      juntas[juntas.length - 1] += ' ' + linha.trim();
    } else {
      juntas.push(linha);
    }
  });

  const cabecalhos: Cabecalhos = {};
  juntas.forEach((linha) => {
    const i = linha.indexOf(':');
    if (i <= 0) return;
    const nome = linha.slice(0, i).trim().toLowerCase();
    const valor = linha.slice(i + 1).trim();
    if (nome === 'references') {
      cabecalhos[nome] = (cabecalhos[nome] ? cabecalhos[nome] + ' ' : '') + valor;
      return;
    }
    if (cabecalhos[nome] === undefined) cabecalhos[nome] = valor;
  });

  return { cabecalhos, corpo };
}

/* ---------- =?UTF-8?B?...?= ----------

   Assunto com acento chega codificado, e em pedaços: cada trecho tem o próprio
   charset e a própria codificação. Ignorar isto faz "Informações" virar
   "Informa=C3=A7=C3=B5es" na tela do vendedor — e ir assim para a IA, que
   então lê palavra quebrada.

   Entre dois trechos codificados colados, o espaço que os separa não é espaço
   de verdade: a norma manda descartá-lo. */
export function decodificarPalavras(valor: string): string {
  let t = String(valor || '');
  t = t.replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, '$1');
  return t.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_todo, charset, tipo, dado) => {
    try {
      const bytes = String(tipo).toUpperCase() === 'B'
        ? bytesDeBase64(dado)
        : bytesDeQuotedPrintable(String(dado).replace(/_/g, ' '));
      return decodificar(bytes, charset);
    } catch (_e) {
      return dado;
    }
  });
}

function bytesDeBase64(dado: string): Uint8Array {
  const limpo = String(dado || '').replace(/[^A-Za-z0-9+/=]/g, '');
  const bin = atob(limpo);
  const saida = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) saida[i] = bin.charCodeAt(i);
  return saida;
}

/* `=\n` no fim da linha é quebra de conveniência e não faz parte do texto.
   Deixá-la dentro cola duas palavras: "aten=\ncao" viraria "aten=cao". */
function bytesDeQuotedPrintable(dado: string): Uint8Array {
  const semQuebras = String(dado || '').replace(/=\r?\n/g, '');
  const saida: number[] = [];
  for (let i = 0; i < semQuebras.length; i++) {
    if (semQuebras[i] === '=' && i + 2 < semQuebras.length) {
      const hex = semQuebras.substr(i + 1, 2);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) { saida.push(parseInt(hex, 16)); i += 2; continue; }
    }
    saida.push(semQuebras.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(saida);
}

/* O charset vem escrito de vários jeitos e alguns não existem mais em lugar
   nenhum. Cair para latin-1 é melhor do que devolver vazio: e-mail antigo de
   cliente brasileiro é quase sempre ISO-8859-1, e ler errado alguns acentos é
   incomparavelmente melhor do que perder a mensagem inteira. */
function decodificar(bytes: Uint8Array, charset?: string): string {
  const nome = String(charset || 'utf-8').toLowerCase().replace(/^["']|["']$/g, '');
  const tentativas = [nome, 'utf-8', 'iso-8859-1'];
  for (const c of tentativas) {
    try { return new TextDecoder(c === 'ascii' ? 'utf-8' : c).decode(bytes); } catch (_e) { /* próxima */ }
  }
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/* ---------- parâmetros de um cabeçalho ----------
   `Content-Type: text/plain; charset="UTF-8"` → parametro(v, 'charset') */
export function parametro(valor: string, nome: string): string {
  const re = new RegExp(nome + '\\s*=\\s*("([^"]*)"|([^;\\s]+))', 'i');
  const m = re.exec(String(valor || ''));
  return m ? (m[2] !== undefined ? m[2] : m[3]) : '';
}

export function tipoDoConteudo(cabecalhos: Cabecalhos): string {
  return String(cabecalhos['content-type'] || 'text/plain')
    .split(';')[0].trim().toLowerCase();
}

/* ---------- o corpo em texto ----------

   Uma mensagem real quase nunca é texto puro. É `multipart/alternative` com
   text/plain e text/html dentro, ou `multipart/mixed` com anexos, e os dois se
   aninham. Preferimos SEMPRE o text/plain: o HTML de e-mail vem com folha de
   estilo, rastreador de terceiro e assinatura em tabela, e nada disso ajuda a
   IA a entender o que o cliente decidiu.

   Quando só existe HTML, ele é reduzido a texto aqui mesmo. */
export function corpoEmTexto(bruto: string, profundidade = 0): string {
  if (profundidade > 6) return '';
  const { cabecalhos, corpo } = separarCabecalhos(bruto);
  const tipo = tipoDoConteudo(cabecalhos);
  const contentType = String(cabecalhos['content-type'] || '');

  if (tipo.startsWith('multipart/')) {
    const limite = parametro(contentType, 'boundary');
    if (!limite) return '';
    const partes = separarPartes(corpo, limite);

    /* text/plain primeiro, em qualquer nível. Só depois html. */
    for (const p of partes) {
      const achado = corpoEmTexto(p, profundidade + 1);
      const t = tipoDoConteudo(separarCabecalhos(p).cabecalhos);
      if (achado && (t === 'text/plain' || t.startsWith('multipart/'))) return achado;
    }
    for (const p of partes) {
      const achado = corpoEmTexto(p, profundidade + 1);
      if (achado) return achado;
    }
    return '';
  }

  /* Anexo não é corpo. Sem esta linha, um PDF anexado viraria um muro de
     base64 dentro do texto da conversa — e iria assim para a IA. */
  if (/attachment/i.test(String(cabecalhos['content-disposition'] || ''))) return '';
  if (tipo !== 'text/plain' && tipo !== 'text/html') return '';

  const codificacao = String(cabecalhos['content-transfer-encoding'] || '').toLowerCase().trim();
  const charset = parametro(contentType, 'charset') || 'utf-8';
  let texto: string;
  if (codificacao === 'base64') texto = decodificar(bytesDeBase64(corpo), charset);
  else if (codificacao === 'quoted-printable') texto = decodificar(bytesDeQuotedPrintable(corpo), charset);
  else texto = corpo;

  return tipo === 'text/html' ? textoDeHtml(texto) : texto.trim();
}

function separarPartes(corpo: string, limite: string): string[] {
  const marca = '--' + limite;
  const bruto = String(corpo || '');
  const pedacos = bruto.split(new RegExp('^' + marca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(--)?[ \\t]*$', 'm'));
  return pedacos.slice(1).filter((p) => p && p.trim() && p.trim() !== '--')
    .map((p) => p.replace(/^\n/, ''));
}

export function textoDeHtml(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    /* Fim de bloco vira linha EM BRANCO, não uma quebra só. Parágrafo colado
       no seguinte é o que faz um e-mail de três assuntos parecer um parágrafo
       só — para quem lê e para a IA, que então mistura o que era separado. */
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- endereço ---------- */
export function enderecoDe(valor: string): string {
  const t = decodificarPalavras(String(valor || ''));
  const m = /<([^>]+)>/.exec(t);
  return (m ? m[1] : t).trim().toLowerCase();
}

export function nomeDe(valor: string): string {
  const t = decodificarPalavras(String(valor || '')).trim();
  const m = /^(.*?)\s*<[^>]+>\s*$/.exec(t);
  const nome = m ? m[1] : '';
  return nome.replace(/^["']|["']$/g, '').trim();
}

/* ---------- a conversa ----------

   A thread é a raiz da árvore de respostas. `References` guarda a cadeia
   inteira e o PRIMEIRO da lista é a mensagem original — é ele que amarra a
   conversa, e não o último, que é só a mensagem anterior.

   Sem References, `In-Reply-To` serve. Sem os dois, a mensagem começa uma
   conversa nela mesma, o que é melhor do que empilhar todas as órfãs numa
   conversa falsa. */
export function conversaDe(cabecalhos: Cabecalhos, id: string): { thread: string; respondeA: string } {
  const refs = String(cabecalhos['references'] || '').match(/<[^>]+>/g) || [];
  const respondeA = (String(cabecalhos['in-reply-to'] || '').match(/<[^>]+>/) || [''])[0] || '';
  const thread = (refs.length ? refs[0] : (respondeA || id)) || id;
  return { thread, respondeA };
}

/* ---------- a mensagem inteira ---------- */
export interface Mensagem {
  id: string; de: string; deNome: string; para: string; copia: string;
  assunto: string; corpo: string; thread: string; respondeA: string; quando: string;
}

export function lerMensagem(bruto: string, quandoServidor?: string): Mensagem {
  const { cabecalhos } = separarCabecalhos(bruto);
  const id = (String(cabecalhos['message-id'] || '').match(/<[^>]+>/) || [''])[0] || '';
  const conversa = conversaDe(cabecalhos, id);
  /* A data do cabeçalho é escrita pelo cliente de quem mandou e vem errada com
     alguma frequência — relógio do computador, fuso mal configurado. Quando o
     servidor informa a hora de chegada, ela vale mais. */
  const doCabecalho = dataISO(cabecalhos['date']);
  return {
    id: id,
    de: enderecoDe(cabecalhos['from']),
    deNome: nomeDe(cabecalhos['from']),
    para: String(cabecalhos['to'] || '').split(',').map(enderecoDe).filter(Boolean).join(', '),
    copia: String(cabecalhos['cc'] || '').split(',').map(enderecoDe).filter(Boolean).join(', '),
    assunto: decodificarPalavras(cabecalhos['subject'] || ''),
    corpo: limpar(corpoEmTexto(bruto)),
    thread: conversa.thread,
    respondeA: conversa.respondeA,
    quando: quandoServidor || doCabecalho || new Date().toISOString()
  };
}

export function dataISO(valor?: string): string {
  if (!valor) return '';
  const d = new Date(String(valor).replace(/\s*\([^)]*\)\s*$/, ''));
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

/* O que o cliente escreveu AGORA, não a cadeia inteira de respostas.

   E-mail de conversa longa carrega tudo o que veio antes, citado com ">" ou
   depois de "Em 12/09, fulano escreveu:". Mandar isso inteiro para a IA a cada
   mensagem é pagar dez vezes pelo mesmo texto e ainda piorar a leitura: ela
   passa a ver a resposta de três semanas atrás como se fosse de hoje. */
export function limpar(texto: string): string {
  const t = String(texto || '').replace(/\r\n/g, '\n');
  const marcas = [
    /\n\s*Em\s+.{0,80}?\s+escreveu:\s*\n/i,
    /\n\s*On\s+.{0,80}?\s+wrote:\s*\n/i,
    /\n-{2,}\s*(Mensagem original|Original Message|Forwarded message)\s*-{2,}/i,
    /\n\s*De:\s.{0,120}\n\s*Enviada?(\s+em)?:\s/i,
    /\n\s*From:\s.{0,120}\n\s*Sent:\s/i
  ];
  let corte = t.length;
  marcas.forEach((re) => {
    const m = re.exec(t);
    if (m && m.index < corte) corte = m.index;
  });
  const util = t.slice(0, corte);
  const semCitacao = util.split('\n').filter((l) => !/^\s*>/.test(l)).join('\n');
  return semCitacao.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
