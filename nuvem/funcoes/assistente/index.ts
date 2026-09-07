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
/* Formatos de chave novo e antigo, na mesma ordem do convite: o projeto pode
   estar em qualquer um dos dois, e IAD_CHAVE_PUBLICA é a única saída manual —
   o painel do Supabase recusa segredos com nome começando em SUPABASE_. */
const ANON = Deno.env.get('IAD_CHAVE_PUBLICA') ||
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_ANON_KEY') || '';

/* 8000 servia para "cole o que você sabe da empresa", que é um parágrafo.
   Desde que a caixa lê Word, Excel e PDF, o que chega é um relatório de
   reunião inteiro — e cortar em 8000 joga fora justamente o miolo, ficando
   com cabeçalho e sumário. 16000 caracteres são cerca de 4 mil tokens: cabe
   no modelo, e o pedido continua respondendo em segundos. */
const LIMITE_TEXTO = 16000;
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
    pais:        { como: 'texto', max: 40 },
    site:        { como: 'texto', max: 100 },
    linkedin:    { como: 'texto', max: 140 },
    /* Setor é o que o mercado chama a empresa; segmento é a gaveta comercial
       de quem usa o CRM, e vem de uma lista fechada. Separados de propósito:
       o modelo acerta muito o primeiro e erra o segundo quando inventa. */
    setor:       { como: 'texto', max: 60 },
    descricao:   { como: 'texto', max: 400 }
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
  /* 'plano' devolve uma lista de próximos passos amarrados a decisões. */
  plano: {},
  /* 'notas' propõe as oito notas a partir do que o cliente já disse. Propõe:
     quem grava é o vendedor, depois de conferir, e a regra de que 2 exige
     prova confirmada continua sendo aplicada pelo motor. */
  notas: {},
  /* 'segmentos' classifica um lote de empresas de uma vez: uma chamada para
     a importação inteira, em vez de uma por lead. Validado à parte. */
  segmentos: {},
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

Campos: nome, razaoSocial, cnpj, segmento, setor, descricao, telefone, porte,
cidade, uf, pais, site, linkedin.

setor é como o mercado chama a empresa (Farmacêutica, Saneamento, Alimentos).
segmento tem de sair da lista fechada acima — se nenhum servir, deixe vazio.
descricao é o que ela produz e para quem vende, em uma ou duas frases.

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

  if (tipo === 'notas') {
    return `${BASE}

Tarefa: você recebe o retrato de UMA oportunidade — as evidências que o cliente produziu, o grupo de compra, o insight e, quando houver, o texto de uma reunião que o vendedor acabou de colar. Proponha a nota de cada uma das oito decisões.

Devolva {"decisoes":[{"dimensao":"problema","nota":0,"porque":"...","trecho":"..."} , ...]} com as oito, na ordem acima.

Os três níveis, iguais para todas:
  0 — não sabemos: nada do lado do cliente sustenta esta decisão.
  1 — parcial: há sinal, mas vago, indireto ou dito por uma pessoa só.
  2 — comprovado pelo cliente: ele descreveu, mostrou, mandou ou fez.

Regras desta tarefa, e são o ponto todo:
- A nota vem SÓ do que o CLIENTE disse ou fez. O que nós mandamos, apresentamos ou propusemos não conta e nunca sobe nota. Uma proposta enviada não é impacto aceito; um material apresentado não é problema reconhecido.
- "trecho" tem de ser um pedaço LITERAL do retrato que sustenta a nota. Sem trecho literal, a nota é 0. Não parafraseie para justificar.
- Na dúvida entre dois níveis, use o menor. Uma nota inflada vira pipeline falso no painel do dono da empresa, e ninguém descobre a tempo.
- "porque" em uma linha, dizendo o que sustenta — ou, quando for 0, o que faltaria para subir.
- Nunca invente pessoa, número, prazo ou fala que não esteja no retrato.
- Português do Brasil.`;
  }

  if (tipo === 'plano') {
    const etapaNova = limparTexto(ctx.etapaNova, 40);
    return `${BASE}

Tarefa: você recebe o retrato de UMA oportunidade — as oito decisões com nota, as evidências que o cliente produziu, quem está no grupo de compra e o que ficou combinado. Diga o que fazer agora.
${etapaNova ? `\nO vendedor acabou de mover este negócio para a etapa "${etapaNova}". Priorize o que essa etapa exige e que ainda não está comprovado. Uma etapa adiantada com decisão imatura é o padrão que o IAD chama de "falso avançado" — se for o caso, diga.\n` : ''}
Devolva {"passos":[...], "atencao":[...]}.

Cada item de "passos" tem:
- dimensao: qual das oito decisões este passo pretende mover.
- acao: o que o vendedor faz, começando por um verbo. Concreto e executável esta semana. Nada de "alinhar expectativas" ou "fortalecer relacionamento".
- pergunta: uma pergunta para fazer ao cliente, escrita como se fala, que produza a evidência dessa decisão.
- porque: em uma linha, o que no retrato justifica este passo. Cite o que o cliente disse, quando houver.

"atencao" é uma lista de no máximo 3 frases curtas sobre risco de perder este negócio — silêncio do cliente, papel crítico ausente, resistência de quem assina, concorrente ganhando espaço. Só o que os dados sustentam.

Regras desta tarefa:
- No máximo 4 passos, na ordem em que devem ser feitos.
- Use as palavras do cliente quando elas estiverem no retrato. Um passo que poderia servir para qualquer negócio não serve para nenhum.
- Não sugira nota, não diga que uma decisão "deveria" valer 2. Quem pontua é o vendedor, com evidência.
- Não invente pessoa, número, prazo ou concorrente que não esteja no retrato.
- Português do Brasil.`;
  }

  if (tipo === 'segmentos') {
    return `Você classifica empresas nos segmentos usados por uma equipe de vendas B2B brasileira.

Segmentos disponíveis, e SÓ estes:
${(Array.isArray(ctx.segmentos) ? ctx.segmentos.map(String) : []).map((x) => '- ' + x).join('\n')}
- Outros

Regras absolutas:
- Responda SOMENTE com um objeto JSON: {"itens":[{"n":1,"segmento":"..."},...]}
- O valor de "segmento" tem de ser copiado EXATAMENTE de uma das linhas acima, incluindo acentos e maiúsculas.
- Se nenhum couber com clareza, use "Outros". É melhor "Outros" do que um segmento errado: o gráfico por segmento é lido pelo dono da empresa.
- Um item de saída para cada empresa da entrada, com o mesmo "n".
- Nada de texto fora do JSON.

A entrada traz, para cada empresa: nome, domínio, o que a pessoa faz lá e, quando disponível, a descrição da empresa e o texto do site.`;
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

/* "IA respondeu 404" é verdade e não serve para nada: manda procurar rede,
   chave e publicação, quando 404 no endpoint de chat quer dizer uma coisa só —
   o modelo pedido não existe. Provedores aposentam nomes de modelo sem aviso,
   e o nome fica escrito no código de quem publicou meses atrás.

   Como não dá para adivinhar quais nomes valem hoje, a função pergunta: ela
   tem a chave, e o provedor tem uma lista. Melhor do que eu chutar um nome que
   talvez também já tenha morrido. */
async function modelosDoGroq(): Promise<string[]> {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { authorization: 'Bearer ' + CHAVE }
    });
    if (!r.ok) return [];
    const j = await r.json();
    const todos = (j?.data || []).map((m: { id?: string }) => String(m.id || '')).filter(Boolean);
    /* A lista do provedor mistura tudo: whisper transcreve áudio, orpheus e
       playai geram voz, safeguard é classificador de segurança. Nenhum deles
       preenche formulário, e oferecê-los a quem está escolhendo é oferecer o
       erro. Sobra o que conversa. */
    const conversa = todos.filter((id: string) =>
      !/whisper|orpheus|playai|tts|guard|embed|rerank|moderation/i.test(id));
    return conversa.length ? conversa : todos;
  } catch {
    return [];
  }
}

async function explicarRecusa(r: Response, modelo: string): Promise<string> {
  const corpo = await r.text().catch(() => '');
  const curto = corpo.replace(/\s+/g, ' ').slice(0, 200);

  if (r.status === 404) {
    const nomes = PROVEDOR === 'anthropic' ? [] : await modelosDoGroq();
    return 'O modelo "' + modelo + '" não existe mais no provedor. ' +
      (nomes.length
        ? 'Os que conversam agora: ' + nomes.slice(0, 20).join(', ') + '. ' +
          'Ponha um deles no segredo IA_MODELO e publique a função de novo.'
        : 'Veja a lista no painel do provedor e ponha um nome válido no segredo IA_MODELO.');
  }
  if (r.status === 401 || r.status === 403) {
    return 'O provedor recusou a chave da IA (' + r.status + '). Confira o segredo IA_CHAVE.';
  }
  if (r.status === 429) {
    return 'Limite de uso do provedor atingido. Espere um pouco, ou troque de plano.';
  }
  if (r.status === 413 || /context|too large|maximum/i.test(curto)) {
    return 'Material grande demais para o modelo. Analise menos documentos de uma vez.';
  }
  return 'A IA respondeu ' + r.status + (curto ? ': ' + curto : '.');
}

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
    if (!r.ok) throw new Error(await explicarRecusa(r, MODELO || 'claude-haiku-4-5'));
    const j = await r.json();
    return (j?.content || []).map((b: { text?: string }) => b.text || '').join('');
  }

  /* Groq — API compatível com o formato OpenAI. */
  const modelo = MODELO || 'llama-3.3-70b-versatile';
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + CHAVE, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelo,
      temperature: 0.1,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: usuario }
      ]
    })
  });
  if (!r.ok) throw new Error(await explicarRecusa(r, modelo));
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

/* Um lote de empresas classificadas. Segmento fora da lista do tenant vira
   "Outros" — nunca um nome novo, que quebraria o agrupamento do painel. */
function validarSegmentos(bruto: Record<string, unknown>, ctx: Record<string, unknown>) {
  const validos = (Array.isArray(ctx.segmentos) ? ctx.segmentos.map(String) : []).concat(['Outros']);
  const brutos = Array.isArray(bruto.itens) ? bruto.itens : [];
  const itens: Array<{ n: number; segmento: string }> = [];

  for (const item of brutos.slice(0, 100)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const n = Number(o.n);
    if (!isFinite(n) || n < 1) continue;
    const bruta = limparTexto(o.segmento, 80);
    const achado = validos.find((v) => v.toLowerCase() === bruta.toLowerCase());
    itens.push({ n: n, segmento: achado || 'Outros' });
  }
  return { itens: itens };
}

/* As oito notas propostas. Duas travas aqui, além da que o app aplica depois:
   nota fora de 0..2 é descartada, e nota maior que zero sem trecho literal
   cai para zero — se o modelo não consegue apontar onde o cliente disse, ele
   está inferindo, e inferência não pontua decisão. */
function validarNotas(bruto: Record<string, unknown>, textoOriginal: string) {
  const dimensoes = DIMENSOES.map((d) => d[0]);
  const brutas = Array.isArray(bruto.decisoes) ? bruto.decisoes : [];
  const decisoes = [];
  const vistas = new Set<string>();

  for (const item of brutas.slice(0, 16)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const dimensao = dimensoes.find((d) => d === limparTexto(o.dimensao, 20).toLowerCase());
    if (!dimensao || vistas.has(dimensao)) continue;

    let nota = Number(o.nota);
    if (!isFinite(nota) || nota < 0 || nota > 2) continue;
    nota = Math.floor(nota);

    const trecho = limparTexto(o.trecho, 240);
    /* O trecho tem de existir mesmo no retrato. Comparação frouxa, por um
       pedaço do começo, porque o modelo costuma cortar a citação. */
    const chave = trecho.slice(0, 40).toLowerCase();
    const citaDeVerdade = chave.length >= 12 &&
      textoOriginal.replace(/\s+/g, ' ').toLowerCase().indexOf(chave) !== -1;
    if (nota > 0 && !citaDeVerdade) nota = 0;

    vistas.add(dimensao);
    decisoes.push({
      dimensao: dimensao,
      nota: nota,
      porque: limparTexto(o.porque, 240),
      trecho: citaDeVerdade ? trecho : ''
    });
  }
  return { decisoes: decisoes };
}

/* Passos e alertas. Passo sem dimensão válida é descartado: ele existiria
   solto, sem dizer qual decisão pretende mover — que é o ponto do método. */
function validarPlano(bruto: Record<string, unknown>) {
  const dimensoes = DIMENSOES.map((d) => d[0]);
  const brutos = Array.isArray(bruto.passos) ? bruto.passos : [];
  const passos = [];

  for (const item of brutos.slice(0, 4)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const dimensao = dimensoes.find((d) => d === limparTexto(o.dimensao, 20).toLowerCase());
    const acao = limparTexto(o.acao, 220);
    if (!dimensao || !acao) continue;
    passos.push({
      dimensao: dimensao,
      acao: acao,
      pergunta: limparTexto(o.pergunta, 220),
      porque: limparTexto(o.porque, 220)
    });
  }

  const atencao = (Array.isArray(bruto.atencao) ? bruto.atencao : [])
    .slice(0, 3)
    .map((a) => limparTexto(a, 200))
    .filter(Boolean);

  return { passos: passos, atencao: atencao };
}

/* ---------- o site da empresa ----------
   O modelo não navega. A função navega — ela roda num servidor. Para empresa
   conhecida a descrição do próprio LinkedIn basta; o site resolve a empresa
   pequena, de que ninguém nunca ouviu falar. Falha de rede não derruba a
   classificação: segue sem o site. */
async function textoDoSite(dominio: string): Promise<string> {
  const limpo = String(dominio || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(limpo)) return '';
  const controle = new AbortController();
  const corta = setTimeout(() => controle.abort(), 4000);
  try {
    const r = await fetch('https://' + limpo + '/', {
      signal: controle.signal,
      headers: { 'user-agent': 'IAD-CRM/1.0 (classificacao de segmento)' }
    });
    if (!r.ok) return '';
    const html = (await r.text()).slice(0, 120000);
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);
  } catch {
    return '';
  } finally {
    clearTimeout(corta);
  }
}

/* ---------- quem pode chamar ---------- */

/* O formato da chave, nunca a chave. É o que transforma um 401 mudo numa
   instrução do que fazer no painel. */
function formatoDaChave(k: string): string {
  if (!k) return 'ausente';
  if (/^sb_publishable_/.test(k)) return 'nova (publicável)';
  if (/^sb_secret_/.test(k)) return 'nova (secreta) — esta é a errada aqui';
  if (/^ey[A-Za-z0-9_-]*\./.test(k)) return 'antiga (JWT)';
  return 'formato desconhecido';
}

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
  /* 401 aqui quase nunca é sessão vencida — quem chega até esta linha já
     mandou um Bearer válido, senão o app nem teria deixado. O caso comum é a
     função não conseguir CONFERIR esse token: ela pergunta ao GoTrue usando a
     chave pública, e o Supabase trocou o formato das chaves. A antiga (JWT) é
     recusada, e a função fica sem como saber quem está falando.

     Então a recusa diz qual formato ela tem na mão. Formato, nunca a chave. */
  if (!(await autenticado(req))) {
    return responder({
      erro: 'Não consegui confirmar quem está chamando. A chave pública desta ' +
        'função é do formato ' + formatoDaChave(ANON) + '.\n\n' +
        'Se não for "nova (publicável)": Settings → API Keys → copie a chave ' +
        'publishable. Depois Edge Functions → assistente → Secrets → crie ' +
        'IAD_CHAVE_PUBLICA com esse valor e publique a função de novo.'
    }, 401);
  }

  let pedido: Record<string, unknown>;
  try {
    pedido = await req.json();
  } catch {
    return responder({ erro: 'pedido inválido' }, 400);
  }

  const tipo = String(pedido.tipo || '');
  if (!FORMATOS[tipo]) return responder({ erro: 'tipo desconhecido' }, 400);

  /* Transcrição de reunião é longa por natureza; um lote de empresas também. */
  const limite = (tipo === 'reuniao' || tipo === 'segmentos' || tipo === 'plano' || tipo === 'notas')
    ? LIMITE_REUNIAO : LIMITE_TEXTO;
  const texto = String(pedido.texto || '').slice(0, limite).trim();
  if (texto.length < 10) return responder({ campos: {}, frases: {} });

  const ctx = (pedido.contexto && typeof pedido.contexto === 'object')
    ? pedido.contexto as Record<string, unknown>
    : {};

  try {
    let entrada = texto;

    /* Empresa conhecida se resolve pela descrição que já veio do LinkedIn.
       O site entra para a empresa pequena, que ninguém conhece — e só para
       algumas, porque cada busca custa tempo de resposta. */
    if (tipo === 'segmentos') {
      const dominios = (Array.isArray(ctx.dominios) ? ctx.dominios : []).slice(0, 6);
      const sites = await Promise.all(dominios.map(async (d) => {
        const t = await textoDoSite(String(d));
        return t ? `\n[site de ${d}] ${t}` : '';
      }));
      entrada = texto + sites.join('');
    }

    const bruto = await chamarIA(promptDe(tipo, ctx), entrada);
    const json = lerJSON(bruto);
    /* JSON torto devolve vazio. Nunca dado inventado no formulário do vendedor. */
    if (!json) {
      if (tipo === 'reuniao') return responder({ evidencias: [], contatos: [] });
      if (tipo === 'segmentos') return responder({ itens: [] });
      if (tipo === 'plano') return responder({ passos: [], atencao: [] });
      if (tipo === 'notas') return responder({ decisoes: [] });
      return responder({ campos: {}, frases: {} });
    }
    if (tipo === 'reuniao') return responder(validarReuniao(json, ctx));
    if (tipo === 'segmentos') return responder(validarSegmentos(json, ctx));
    if (tipo === 'plano') return responder(validarPlano(json));
    if (tipo === 'notas') return responder(validarNotas(json, entrada));
    return responder(validar(tipo, json, ctx));
  } catch (e) {
    return responder({ erro: String((e as Error).message || e) }, 502);
  }
});
