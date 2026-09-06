/* Supabase Edge Function — assistente
   ------------------------------------------------------------------
   Por que esta função existe: o IAD é uma PWA de arquivos estáticos. Tudo que
   está em src/ é público. Uma chave de IA ali dentro estaria exposta no mesmo
   dia — a mesma armadilha que fez a service_role nunca entrar no navegador.

   Aqui a chave é segredo da função. O navegador manda o texto que o vendedor
   escreveu; a função conversa com a IA e devolve campos já validados.

   Regras que este arquivo cumpre e não pode deixar de cumprir:
   1. Só responde a quem está logado no Supabase.
   2. Só devolve campos conhecidos, com valores dentro das listas do sistema.
      O que a IA inventar fora disso é descartado, não repassado.
   3. Nunca devolve nota, IAD, valor, etapa ou data de fechamento. Esses são
      cálculo do engine ou julgamento do vendedor.
   4. Recebe apenas o texto da tela atual. Nunca a base, nunca outro tenant.
*/

const PROVEDOR = (Deno.env.get('IA_PROVEDOR') || 'groq').toLowerCase();
const CHAVE = Deno.env.get('IA_CHAVE') || '';
const MODELO = Deno.env.get('IA_MODELO') || '';
const URL_SUPABASE = Deno.env.get('SUPABASE_URL') || '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';

const LIMITE_TEXTO = 8000;
const LIMITE_REUNIAO = 40000;   /* transcrição de call cabe; base de dados não */
const LIMITE_LISTA = 120;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

/* ---------- vocabulário do IAD ----------
   Duplicado aqui de propósito: o prompt é montado no servidor, não pelo
   cliente. Assim ninguém injeta uma lista de opções própria pela requisição. */

const DIMENSOES = [
  ['problema',     'Problema',     'O cliente reconheceu, com palavras dele, que existe algo a resolver.'],
  ['prioridade',   'Prioridade',   'Resolver isso virou prioridade agora, com prazo e dono.'],
  ['impacto',      'Impacto',      'O ganho ou a perda foi quantificado e aceito pelo cliente.'],
  ['criterios',    'Critérios',    'O cliente definiu como vai comparar e decidir.'],
  ['stakeholders', 'Stakeholders', 'As pessoas certas entraram na conversa.'],
  ['consenso',     'Consenso',     'O grupo de compra está de acordo entre si.'],
  ['risco',        'Risco',        'Os receios e bloqueios do cliente estão na mesa.'],
  ['processo',     'Processo',     'O caminho formal até a assinatura está claro.']
];

const FORCAS = [
  ['relato',      'O cliente disse que vai acontecer.'],
  ['confirmado',  'O cliente fez, e nós presenciamos.'],
  ['documentado', 'Está por escrito: e-mail, ata, documento ou sistema.']
];

const CANAIS = ['Reunião', 'E-mail', 'WhatsApp', 'LinkedIn', 'Telefone', 'Documento'];
const DONOS = ['cliente', 'nos'];
const PAPEIS = ['Champion / Mobilizer', 'Usuário', 'Técnico', 'Operações', 'Financeiro',
                'Compras', 'Jurídico / Compliance', 'Decisor econômico'];
const PERFIS = ['nao_classificado', 'go_getter', 'professor', 'cetico', 'amigo', 'guia',
                'escalador', 'bloqueador'];
const SENTIMENTOS = ['nao_acessado', 'neutro', 'favoravel', 'resistente'];
const INFLUENCIAS = ['1', '2', '3'];
const TIPOS_OPORTUNIDADE = ['Novo negócio', 'Expansão', 'Renovação'];
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
             'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

/* ---------- o que cada tipo de extração pode devolver ----------
   Cada campo declara como é validado. Texto vira texto limpo e curto; lista
   fechada só passa se o valor estiver na lista; data só passa se for ISO. */

type Regra = { como: 'texto' | 'lista' | 'data'; opcoes?: string[]; max?: number };

const FORMATOS: Record<string, Record<string, Regra>> = {
  evidencia: {
    titulo:           { como: 'texto', max: 160 },
    dimensao:         { como: 'lista', opcoes: DIMENSOES.map((d) => d[0]) },
    forca:            { como: 'lista', opcoes: FORCAS.map((f) => f[0]) },
    contato:          { como: 'texto', max: 80 },
    canal:            { como: 'lista', opcoes: CANAIS },
    data:             { como: 'data' },
    compromissoTexto: { como: 'texto', max: 160 },
    compromissoData:  { como: 'data' },
    compromissoDono:  { como: 'lista', opcoes: DONOS }
  },
  classificar: {
    dimensao: { como: 'lista', opcoes: DIMENSOES.map((d) => d[0]) },
    forca:    { como: 'lista', opcoes: FORCAS.map((f) => f[0]) }
  },
  conta: {
    nome:        { como: 'texto', max: 80 },
    razaoSocial: { como: 'texto', max: 120 },
    cnpj:        { como: 'texto', max: 20 },
    segmento:    { como: 'lista', opcoes: [] },   /* preenchido com os segmentos do tenant */
    telefone:    { como: 'texto', max: 24 },
    porte:       { como: 'texto', max: 60 },
    cidade:      { como: 'texto', max: 60 },
    uf:          { como: 'lista', opcoes: UFS },
    site:        { como: 'texto', max: 100 }
  },
  contato: {
    nome:       { como: 'texto', max: 80 },
    cargo:      { como: 'texto', max: 80 },
    papel:      { como: 'lista', opcoes: PAPEIS },
    perfil:     { como: 'lista', opcoes: PERFIS },
    sentimento: { como: 'lista', opcoes: SENTIMENTOS },
    influencia: { como: 'lista', opcoes: INFLUENCIAS },
    email:      { como: 'texto', max: 120 },
    telefone:   { como: 'texto', max: 24 },
    linkedin:   { como: 'texto', max: 160 }
  },
  oportunidade: {
    titulo:        { como: 'texto', max: 120 },
    empresaNova:   { como: 'texto', max: 80 },
    segmento:      { como: 'lista', opcoes: [] },
    tipo:          { como: 'lista', opcoes: TIPOS_OPORTUNIDADE },
    concorrentes:  { como: 'texto', max: 160 },
    contatoNome:   { como: 'texto', max: 80 },
    contatoCargo:  { como: 'texto', max: 80 },
    contatoPapel:  { como: 'lista', opcoes: PAPEIS },
    contatoPerfil: { como: 'lista', opcoes: PERFIS }
  },
  insight: {
    texto: { como: 'texto', max: 400 }
  },
  /* 'reuniao' é o único tipo que devolve uma lista. Validado à parte, em
     validarReuniao, porque cada item passa pelas mesmas regras da evidência. */
  reuniao: {}
};

const ITENS_MAXIMOS = 12;

/* ---------- prompts ---------- */

function listaDimensoes(): string {
  return DIMENSOES.map((d) => `- ${d[0]} (${d[1]}): ${d[2]}`).join('\n');
}

function listaForcas(): string {
  return FORCAS.map((f) => `- ${f[0]}: ${f[1]}`).join('\n');
}

const BASE = `Você ajuda um vendedor B2B a preencher o CRM chamado IAD.
O IAD mede a maturidade da decisão do comprador em oito dimensões:
${listaDimensoes()}

Regras absolutas:
- Responda SOMENTE com um objeto JSON. Sem texto antes ou depois, sem markdown.
- Use apenas informação que está no texto do vendedor. Nunca invente nome, número, empresa ou data.
- Se um campo não estiver no texto, omita a chave. Campo ausente é melhor que campo errado.
- Escreva em português do Brasil.
- Além dos campos pedidos, inclua "frases": um objeto que liga cada campo preenchido ao trecho literal do texto que justificou o valor. Trechos curtos.
- Nunca devolva nota, pontuação, valor financeiro, etapa do funil ou data de fechamento. Isso não é seu.`;

function promptDe(tipo: string, ctx: Record<string, unknown>): string {
  const hoje = String(ctx.hoje || new Date().toISOString().slice(0, 10));
  const contatos = listaCurta(ctx.contatos);
  const segmentos = listaCurta(ctx.segmentos);

  if (tipo === 'evidencia') {
    return `${BASE}

Tarefa: o vendedor colou a ata ou contou o que aconteceu com o cliente. Extraia UMA evidência — algo que o CLIENTE fez ou disse. Atividade nossa (enviamos proposta, fizemos follow-up) não é evidência.

Campos: titulo, dimensao, forca, contato, canal, data, compromissoTexto, compromissoData, compromissoDono.

- titulo: uma linha começando pelo sujeito do lado do cliente. Ex.: "CFO exigiu payback antes de aprovar".
- dimensao: uma das oito acima.
- forca:
${listaForcas()}
- contato: o nome da pessoa do cliente citada, exatamente como aparece.${contatos ? ` Pessoas já cadastradas nesta conta: ${contatos}.` : ''}
- canal: um de ${CANAIS.join(', ')}.
- data: data em que aconteceu, formato AAAA-MM-DD. Hoje é ${hoje}; converta "ontem", "na terça", "dia 12" a partir daí. Nunca no futuro.
- compromissoTexto / compromissoData: o próximo passo combinado, se houver. Se não houver, omita as duas.
- compromissoDono: "cliente" se quem ficou de fazer foi o cliente, "nos" se fomos nós.

Não devolva a nota da decisão. Quem decide se a decisão amadureceu é o vendedor.`;
  }

  if (tipo === 'classificar') {
    return `${BASE}

Tarefa: o vendedor está escrevendo uma evidência. Classifique o que ele escreveu.

Campos: dimensao, forca.
Forças:
${listaForcas()}

Nada mais.`;
  }

  if (tipo === 'conta') {
    return `${BASE}

Tarefa: extraia os dados cadastrais da empresa cliente do texto.

Campos: nome, razaoSocial, cnpj, segmento, telefone, porte, cidade, uf, site.

- nome: nome fantasia, curto. razaoSocial: a razão social completa, se o texto trouxer.
- cnpj e telefone: formatados no padrão brasileiro, só se estiverem no texto.
- segmento: escolha ${segmentos ? `um destes, exatamente: ${segmentos}` : 'nada — não há segmentos cadastrados, omita'}. Nunca crie um segmento novo.
- cidade e uf: se o texto citar a cidade, devolva também a sigla da UF correspondente.
- porte: faturamento ou número de funcionários, como o texto disser.

Não devolva a relação atual (prospect, cliente, ex-cliente): isso é fato comercial, não leitura de texto.`;
  }

  if (tipo === 'contato') {
    return `${BASE}

Tarefa: extraia os dados de UMA pessoa do lado do cliente.

Campos: nome, cargo, papel, perfil, sentimento, influencia, email, telefone, linkedin.

- papel na compra, um de: ${PAPEIS.join(' | ')}. Deduza do cargo (Suprimentos → Compras; CFO/Diretor Financeiro → Decisor econômico; quem defende o projeto internamente → Champion / Mobilizer).
- perfil (classificação Challenger), um de: ${PERFIS.join(' | ')}. Só classifique se o texto mostrar como a pessoa age. Na dúvida use nao_classificado.
- sentimento, um de: ${SENTIMENTOS.join(' | ')}.
- influencia: "1" opina, "2" influencia, "3" decide.`;
  }

  if (tipo === 'oportunidade') {
    return `${BASE}

Tarefa: o vendedor descreveu uma oportunidade nova. Extraia o que dá para cadastrar.

Campos: titulo, empresaNova, segmento, tipo, concorrentes, contatoNome, contatoCargo, contatoPapel, contatoPerfil.

- titulo: nome curto da oportunidade, combinando a empresa e o que está sendo vendido.
- empresaNova: nome da empresa cliente.
- segmento: ${segmentos ? `um destes, exatamente: ${segmentos}` : 'omita — não há segmentos cadastrados'}. Nunca invente.
- tipo: um de ${TIPOS_OPORTUNIDADE.join(' | ')}.
- concorrentes: nomes citados, separados por vírgula. Inclua "não fazer nada" se o texto indicar que o cliente pode simplesmente não decidir.
- contatoPapel: um de ${PAPEIS.join(' | ')}. contatoPerfil: um de ${PERFIS.join(' | ')}.

Não devolva valor, etapa nem data de fechamento.`;
  }

  if (tipo === 'reuniao') {
    return `${BASE}

Tarefa: o vendedor enviou a transcrição de uma reunião, a ata ou as anotações dele. Separe TUDO que o cliente fez ou disse em evidências, uma para cada dimensão afetada. Um documento costuma render de duas a seis.

Devolva {"evidencias": [ ... ], "contatos": [ ... ]}.

Cada item de "evidencias" tem:
- dimensao: uma das oito. Um receio, uma objeção ou um impedimento vai para "risco". Uma exigência de comparação ou de especificação vai para "criterios". Alguém novo entrando na conversa vai para "stakeholders". O caminho formal até a assinatura vai para "processo".
- titulo: uma linha começando pelo lado do cliente. Ex.: "Jurídico exigiu cláusula de rescisão em 30 dias".
- forca:
${listaForcas()}
- data: AAAA-MM-DD. Hoje é ${hoje}. Se o documento não trouxer a data, use ${hoje}. Nunca no futuro.
- contato: nome de quem falou, se identificável.${contatos ? ` Já cadastrados: ${contatos}.` : ''}
- canal: um de ${CANAIS.join(', ')}.
- compromissoTexto / compromissoData / compromissoDono: só no item onde o próximo passo foi combinado.
- frase: o trecho literal do documento que sustenta esta evidência.

Cada item de "contatos" é uma pessoa do lado do cliente que apareceu no documento: {nome, cargo, papel, frase}. papel é um de ${PAPEIS.join(' | ')}.

Regras desta tarefa:
- Uma evidência por fato. Não junte dois assuntos na mesma linha.
- O que NÓS fizemos (mandamos proposta, fizemos follow-up) não é evidência. Descarte.
- No máximo ${ITENS_MAXIMOS} evidências. Se houver mais, fique com as mais relevantes para a decisão.
- Nunca devolva nota ou pontuação. O vendedor escolhe item por item.`;
  }

  if (tipo === 'insight') {
    return `${BASE}

Tarefa: escreva um RASCUNHO de insight comercial — o reenquadramento que o cliente não enxerga sozinho, no estilo Challenger. O vendedor vai editar antes de usar.

Campo: texto. Duas a três frases, concretas, em português do Brasil. Parta do problema e do setor descritos. Não prometa número que o texto não trouxe.

Devolva {"texto": "..."} e nada mais.`;
  }

  return '';
}

function listaCurta(v: unknown): string {
  if (!Array.isArray(v)) return '';
  return v.slice(0, 40)
    .map((x) => String(x || '').replace(/[\r\n"]/g, ' ').trim().slice(0, LIMITE_LISTA))
    .filter(Boolean)
    .join(', ');
}

/* ---------- o provedor, isolado numa função só ----------
   Trocar Groq por Claude é mudar as variáveis de ambiente. Nada mais no
   sistema sabe qual IA está atrás daqui. */

async function chamarIA(sistema: string, usuario: string): Promise<string> {
  if (PROVEDOR === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CHAVE,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        /* Haiku porque a tarefa é extração curta e o custo por preenchimento
           fica na casa de um centavo. Trocável por IA_MODELO. */
        model: MODELO || 'claude-haiku-4-5',
        max_tokens: 2500,
        system: sistema,
        messages: [{ role: 'user', content: usuario }]
      })
    });
    if (!r.ok) throw new Error('IA respondeu ' + r.status);
    const j = await r.json();
    return (j?.content || []).map((b: { text?: string }) => b.text || '').join('');
  }

  /* Groq — API compatível com o formato OpenAI. */
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + CHAVE, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELO || 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: usuario }
      ]
    })
  });
  if (!r.ok) throw new Error('IA respondeu ' + r.status);
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || '';
}

/* ---------- validação ----------
   Nada do que a IA devolve chega ao formulário sem passar por aqui. */

function lerJSON(bruto: string): Record<string, unknown> | null {
  const t = String(bruto || '').trim();
  const inicio = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  if (inicio === -1 || fim <= inicio) return null;
  try {
    const o = JSON.parse(t.slice(inicio, fim + 1));
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function limparTexto(v: unknown, max: number): string {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function dataValida(v: unknown, hoje: string): string {
  const t = limparTexto(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return '';
  const d = new Date(t + 'T00:00:00Z');
  if (isNaN(d.getTime())) return '';
  const ano = Number(t.slice(0, 4));
  if (ano < 2000 || ano > Number(hoje.slice(0, 4)) + 5) return '';
  return t;
}

function validar(tipo: string, bruto: Record<string, unknown>, ctx: Record<string, unknown>) {
  const formato = FORMATOS[tipo];
  const hoje = String(ctx.hoje || new Date().toISOString().slice(0, 10));
  const segmentos = Array.isArray(ctx.segmentos) ? ctx.segmentos.map(String) : [];

  const saida: Record<string, string> = {};
  for (const [campo, regraBase] of Object.entries(formato)) {
    const regra: Regra = (campo === 'segmento')
      ? { como: 'lista', opcoes: segmentos }
      : regraBase;

    const v = bruto[campo];
    if (v == null || v === '') continue;

    if (regra.como === 'texto') {
      const t = limparTexto(v, regra.max || 120);
      if (t) saida[campo] = t;
    } else if (regra.como === 'data') {
      const t = dataValida(v, hoje);
      if (t) saida[campo] = t;
    } else {
      const t = limparTexto(v, 160);
      const achado = (regra.opcoes || []).find(
        (o) => o.toLowerCase() === t.toLowerCase()
      );
      if (achado) saida[campo] = achado;
    }
  }

  /* Data de evidência no futuro quase sempre é conversão errada de "terça". */
  if (saida.data && saida.data > hoje) saida.data = hoje;

  const frases: Record<string, string> = {};
  const brutasFrases = bruto.frases;
  if (brutasFrases && typeof brutasFrases === 'object' && !Array.isArray(brutasFrases)) {
    for (const [campo, frase] of Object.entries(brutasFrases as Record<string, unknown>)) {
      if (saida[campo] == null) continue;
      const t = limparTexto(frase, 140);
      if (t) frases[campo] = t;
    }
  }

  return { campos: saida, frases: frases };
}

/* Uma reunião vira uma lista. Cada item passa pelas mesmas regras da
   evidência avulsa: dimensão fora das oito, força fora das três ou data
   inventada são descartadas, não repassadas ao vendedor. */
function validarReuniao(bruto: Record<string, unknown>, ctx: Record<string, unknown>) {
  const hoje = String(ctx.hoje || new Date().toISOString().slice(0, 10));
  const dimensoes = DIMENSOES.map((d) => d[0]);
  const forcas = FORCAS.map((f) => f[0]);

  const brutas = Array.isArray(bruto.evidencias) ? bruto.evidencias : [];
  const evidencias = [];
  for (const item of brutas.slice(0, ITENS_MAXIMOS)) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    const dimensao = dimensoes.find((d) => d === limparTexto(e.dimensao, 20).toLowerCase());
    const titulo = limparTexto(e.titulo, 160);
    if (!dimensao || !titulo) continue;      /* sem dimensão válida não há onde gravar */

    const forca = forcas.find((f) => f === limparTexto(e.forca, 20).toLowerCase()) || 'relato';
    let data = dataValida(e.data, hoje) || hoje;
    if (data > hoje) data = hoje;
    const canal = CANAIS.find((c) => c.toLowerCase() === limparTexto(e.canal, 20).toLowerCase()) || 'Reunião';

    const registro: Record<string, string> = {
      dimensao, titulo, forca, data, canal,
      contato: limparTexto(e.contato, 80),
      frase: limparTexto(e.frase, 200),
      compromissoTexto: limparTexto(e.compromissoTexto, 160),
      compromissoData: dataValida(e.compromissoData, hoje),
      compromissoDono: DONOS.find((d) => d === limparTexto(e.compromissoDono, 12).toLowerCase()) || ''
    };
    for (const k of Object.keys(registro)) if (!registro[k]) delete registro[k];
    evidencias.push(registro);
  }

  const brutosContatos = Array.isArray(bruto.contatos) ? bruto.contatos : [];
  const contatos = [];
  for (const item of brutosContatos.slice(0, ITENS_MAXIMOS)) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const nome = limparTexto(c.nome, 80);
    if (!nome) continue;
    const papel = PAPEIS.find((p) => p.toLowerCase() === limparTexto(c.papel, 40).toLowerCase());
    const registro: Record<string, string> = { nome: nome, cargo: limparTexto(c.cargo, 80) };
    if (papel) registro.papel = papel;
    const frase = limparTexto(c.frase, 200);
    if (frase) registro.frase = frase;
    contatos.push(registro);
  }

  return { evidencias: evidencias, contatos: contatos };
}

/* ---------- quem pode chamar ---------- */

async function autenticado(req: Request): Promise<boolean> {
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+/i.test(auth)) return false;
  if (!URL_SUPABASE || !ANON) return false;
  try {
    const r = await fetch(URL_SUPABASE + '/auth/v1/user', {
      headers: { apikey: ANON, authorization: auth }
    });
    if (!r.ok) return false;
    const u = await r.json();
    return !!(u && u.id);
  } catch {
    return false;
  }
}

/* ---------- porta de entrada ---------- */

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status: status,
    headers: Object.assign({ 'content-type': 'application/json' }, CORS)
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ erro: 'metodo' }, 405);

  if (!CHAVE) return responder({ erro: 'A função está no ar, mas sem chave de IA configurada.' }, 503);
  if (!(await autenticado(req))) return responder({ erro: 'Entre no sistema para usar o assistente.' }, 401);

  let pedido: Record<string, unknown>;
  try {
    pedido = await req.json();
  } catch {
    return responder({ erro: 'pedido inválido' }, 400);
  }

  const tipo = String(pedido.tipo || '');
  if (!FORMATOS[tipo]) return responder({ erro: 'tipo desconhecido' }, 400);

  /* Transcrição de reunião é longa por natureza; os outros tipos, não. */
  const limite = tipo === 'reuniao' ? LIMITE_REUNIAO : LIMITE_TEXTO;
  const texto = String(pedido.texto || '').slice(0, limite).trim();
  if (texto.length < 10) return responder({ campos: {}, frases: {} });

  const ctx = (pedido.contexto && typeof pedido.contexto === 'object')
    ? pedido.contexto as Record<string, unknown>
    : {};

  try {
    const bruto = await chamarIA(promptDe(tipo, ctx), texto);
    const json = lerJSON(bruto);
    /* JSON torto devolve vazio. Nunca dado inventado no formulário do vendedor. */
    if (!json) return responder(tipo === 'reuniao' ? { evidencias: [], contatos: [] } : { campos: {}, frases: {} });
    if (tipo === 'reuniao') return responder(validarReuniao(json, ctx));
    return responder(validar(tipo, json, ctx));
  } catch (e) {
    return responder({ erro: String((e as Error).message || e) }, 502);
  }
});
