/* As pastas da caixa, e por que isto é um arquivo.

   Ler só a INBOX é ler metade da conversa, e a metade errada.

   O vendedor responde o cliente pelo Gmail — do celular, no meio da rua,
   antes de abrir o IAD. Essa resposta nunca passa pela caixa de entrada: ela
   nasce direto na pasta de enviados. Enquanto só a INBOX era lida, o IAD
   guardava a pergunta do cliente e não guardava a resposta.

   O estrago não era visual. A conversa aparecia com o cliente falando
   sozinho, e quem lê depois — a pessoa, o histórico da conta e o assistente
   que avalia a negociação — via um pedido sem resposta. Era mentira, e era
   mentira que piorava a nota de um negócio bem tocado.

   A pasta de enviados NÃO tem nome fixo: é "[Gmail]/E-mails enviados" numa
   conta em português, "[Gmail]/Sent Mail" em inglês, "Sent Items" no Outlook,
   "INBOX.Sent" em servidor próprio. Adivinhar pelo nome erra em metade das
   caixas do mundo. Por isso se PERGUNTA ao servidor: o RFC 6154 manda marcar
   essa pasta com o atributo \Sent, e a lista de nomes aqui embaixo só entra
   quando o servidor não marca nada.

   Está separado do index porque é a única parte disto que dá para provar sem
   um servidor de IMAP do outro lado — e provar o recorte de uma resposta de
   LIST é exatamente o que impede o bug silencioso de ler a pasta errada. */

export interface Marca { uid: number; validade: number }

export interface CaixaComPastas {
  pastas?: string | null;
  ultimo_uid?: number | null;
  marcas?: Record<string, { uid?: number; validade?: number }> | null;
}

export const NOMES_DE_ENVIADOS = [
  '[gmail]/e-mails enviados', '[gmail]/sent mail', '[gmail]/enviados',
  'sent', 'sent mail', 'sent items', 'sent messages',
  'enviados', 'e-mails enviados', 'itens enviados', 'elementos enviados',
  'inbox.sent', 'inbox.enviados', 'inbox.sent items'
];

/* As pastas que a caixa manda ler: sem vazio, sem repetição, nunca vazia. */
export function pastasDaCaixa(caixa: CaixaComPastas): string[] {
  const vistas: Record<string, boolean> = {};
  const lista = String(caixa.pastas || 'INBOX').split(',')
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false;
      const k = p.toLowerCase();
      if (vistas[k]) return false;
      vistas[k] = true;
      return true;
    });
  return lista.length ? lista : ['INBOX'];
}

/* `\bsent\b` e não `sent`: uma pasta chamada "Representante" tem "sent" no
   meio e viraria pasta de enviados sem a borda de palavra. */
export function ehDeEnviados(nome: string): boolean {
  const n = String(nome || '').toLowerCase();
  return NOMES_DE_ENVIADOS.indexOf(n) !== -1 || /\bsent\b|enviad/.test(n);
}

/* Uma linha de LIST é
     * LIST (\HasNoChildren \Sent) "/" "[Gmail]/E-mails enviados"
   O nome vem entre aspas quando tem espaço — e em português sempre tem. Ele
   sai daqui VERBATIM, do jeito que o servidor escreveu, porque é assim que
   volta no SELECT: decodificar o UTF-7 modificado do IMAP só para recodificar
   depois seriam duas chances de errar sem nenhum ganho. */
export function pastasDaResposta(texto: string): { nome: string; atributos: string }[] {
  const re = /^\* (?:LIST|XLIST) \(([^)]*)\) (?:"(?:[^"\\]|\\.)*"|NIL) (?:"((?:[^"\\]|\\.)*)"|(\S+))\s*$/gm;
  const achadas: { nome: string; atributos: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const nome = (m[2] !== undefined ? m[2].replace(/\\(.)/g, '$1') : (m[3] || '')).trim();
    if (nome) achadas.push({ nome, atributos: (m[1] || '').toLowerCase() });
  }
  return achadas;
}

/* Qual delas é a de enviados: primeiro o atributo, que é a resposta do
   servidor; só depois o nome, que é chute educado. */
export function enviadosEntre(pastas: { nome: string; atributos: string }[]): string {
  const marcada = pastas.filter((p) => /(^|\s)\\sent(\s|$)/.test(p.atributos))[0];
  if (marcada) return marcada.nome;
  for (const nome of NOMES_DE_ENVIADOS) {
    const igual = pastas.filter((p) => p.nome.toLowerCase() === nome)[0];
    if (igual) return igual.nome;
  }
  return '';
}

/* O marcador é POR PASTA, e tem de ser.

   UID vale dentro de uma pasta só: o UID 900 da INBOX e o UID 900 dos
   enviados são mensagens diferentes, sem nenhuma relação. Com o marcador
   único que existia aqui, a segunda pasta começaria no número da primeira — e
   tudo o que estivesse abaixo dele jamais seria lido, sem erro nenhum na
   tela, que é a pior forma de uma leitura falhar. */
export function marcasDaCaixa(caixa: CaixaComPastas): Record<string, Marca> {
  const cru = (caixa.marcas && typeof caixa.marcas === 'object') ? caixa.marcas : {};
  const saida: Record<string, Marca> = {};
  for (const nome of Object.keys(cru)) {
    const v = cru[nome] || {};
    saida[nome] = { uid: Number(v.uid) || 0, validade: Number(v.validade) || 0 };
  }

  /* A caixa que já vinha lendo não recomeça do zero: o `ultimo_uid` antigo
     vira a marca da primeira pasta. Sem isto, a primeira rodada depois desta
     mudança traria de novo as 25 últimas da INBOX e a pessoa veria tudo
     repetido — o sintoma clássico de migração mal feita. */
  const primeira = pastasDaCaixa(caixa)[0];
  if (!saida[primeira] && (Number(caixa.ultimo_uid) || 0)) {
    saida[primeira] = { uid: Number(caixa.ultimo_uid) || 0, validade: 0 };
  }
  return saida;
}

/* De onde a leitura de uma pasta recomeça.

   UIDVALIDITY é o servidor dizendo "renumerei esta pasta". Continuar do
   número guardado leria mensagem errada ou pularia tudo em silêncio — que é o
   pior dos dois. Quando muda, a pasta recomeça como primeira leitura: as mais
   recentes, e o arquivo antigo fica no servidor, onde sempre esteve.

   Validade zero é "ainda não sei" — caixa migrada do marcador único — e não
   pode ser lida como mudança, senão a migração reapresentaria tudo. */
export function recomecarDe(marca: Marca, validade: number): number {
  if (marca.validade && validade && marca.validade !== validade) return 0;
  return marca.uid || 0;
}
