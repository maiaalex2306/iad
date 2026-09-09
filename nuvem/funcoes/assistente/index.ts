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

/* ---------- por que existem dois modelos ----------

   Os pedidos desta função não são do mesmo tipo de trabalho, e tratá-los como
   se fossem obriga a escolher errado num dos dois lados.

   Classificar segmento é volume: vinte leads, quatro chamadas, texto curto por
   lead, resposta em lista fechada. O que importa é caber no limite de tokens
   por minuto do provedor — foi exatamente isso que estourou com o lote de
   vinte. Um modelo pequeno e rápido faz bem e faz barato.

   Ler uma ata de reunião e propor as oito notas é o oposto: um pedido por vez,
   texto longo, e a resposta tem de apontar o trecho literal onde o cliente
   disse cada coisa. Modelo pequeno erra isso — e errar aqui não aparece como
   erro na tela, aparece como IAD baixo, que o vendedor lê como "o cliente não
   avançou". É o pior tipo de defeito que este sistema pode ter.

   Então: IA_MODELO é o modelo bom, usado para ler reunião, notas, plano e
   desenvolvimento. IA_MODELO_RAPIDO é opcional e serve só a classificação de
   segmentos. Sem o segundo, tudo usa o primeiro, que é o comportamento de
   sempre. */
const MODELO_RAPIDO = Deno.env.get('IA_MODELO_RAPIDO') || '';
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
    descricao:   { como: 'texto', max: 400 },
    /* O que a empresa precisa, nas palavras do material. É o campo que o
       vendedor lê antes de ligar — e o único aqui que não é cadastro. */
    necessidades: { como: 'texto', max: 600 }
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
  reuniao: {},
  /* 'desenvolvimento' lê a carteira inteira, não um negócio: a série das
     semanas e o rendimento por tipo de tarefa. Validado à parte. */
  desenvolvimento: {}
};

const ITENS_MAXIMOS = 12;

/* ---------- prompts ---------- */

/* O catálogo de segmentos chega de duas formas: só nomes (versões antigas do
   app) ou com o mapa que a equipe escreveu — subsegmentos, oportunidades,
   personas. As duas são aceitas; a segunda é a que faz o modelo acertar, e é
   por isso que ela existe. */
function segmentosDoTenant(ctx: Record<string, unknown>): Array<Record<string, string>> {
  const bruto = Array.isArray(ctx.segmentos) ? ctx.segmentos : [];
  const saida: Array<Record<string, string>> = [];
  for (const s of bruto.slice(0, LIMITE_LISTA)) {
    if (typeof s === 'string') {
      if (s.trim()) saida.push({ nome: s.trim() });
      continue;
    }
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const nome = limparTexto(o.nome, 80);
    if (!nome) continue;
    saida.push({
      nome: nome,
      subsegmentos: limparTexto(o.subsegmentos, 400),
      oportunidades: limparTexto(o.oportunidades, 400),
      personas: limparTexto(o.personas, 300)
    });
  }
  return saida;
}

/* O catálogo vai inteiro para quem lê reunião, e enxuto para quem classifica
   segmento em lote. A pergunta ali é uma só — o que esta empresa faz aparece
   nesta lista? — e quem responde isso é "inclui:". "O que se vende ali" e
   "com quem se fala" são sobre a NOSSA venda, não sobre a empresa do lead:
   ocupam o pedido e não decidem nada.

   Isso não é economia por economia. Com teto de oito mil tokens por minuto,
   cada linha que se repete a cada bloco é um lead a menos classificado. */
function descreverSegmentos(ctx: Record<string, unknown>, enxuto = false): string {
  const lista = segmentosDoTenant(ctx);
  if (!lista.length) return '- (nenhum segmento cadastrado)';
  return lista.map((s) => {
    const detalhe = enxuto
      ? (s.subsegmentos ? 'inclui: ' + s.subsegmentos : '')
      : [
        s.subsegmentos ? 'inclui: ' + s.subsegmentos : '',
        s.oportunidades ? 'o que se vende ali: ' + s.oportunidades : '',
        s.personas ? 'com quem se fala: ' + s.personas : ''
      ].filter(Boolean).join(' | ');
    return '- ' + s.nome + (detalhe ? '\n    ' + detalhe : '');
  }).join('\n');
}

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
- Para empresa, inclua também "contatos": lista das pessoas DA EMPRESA CLIENTE
  citadas no material, cada uma com nome, cargo, email, telefone e area. Só
  quem trabalha no cliente — quem assina o documento do nosso lado não entra.
  Não invente e-mail nem telefone: só o que estiver escrito. Sem ninguém
  identificável, devolva lista vazia.
- Além dos campos pedidos, inclua "frases": um objeto que liga cada campo preenchido ao trecho literal do texto que justificou o valor. Trechos curtos.
- Nunca devolva nota, pontuação, valor financeiro, etapa do funil ou data de fechamento. Isso não é seu.`;

/* Quem é quem, pelo nome.

   A regra central deste assistente — "a nota vem só do que o CLIENTE disse" —
   dependia de o modelo adivinhar qual dos lados é o cliente. Numa transcrição
   em terceira pessoa, do tipo que o Meet e o Gemini geram, as duas frases têm
   a mesma forma: "Rosa apresentou a solução de automação" e "Fábio mencionou
   que a prospecção manual não se sustenta". Sem saber que Rosa é nossa e Fábio
   é do cliente, o modelo faz o seguro e não pontua — e o vendedor lê "problema
   não reconhecido" depois de uma reunião em que o cliente descreveu o problema
   três vezes. */
/* A régua, escrita por decisão.

   O servidor conhecia as oito por uma linha de descrição cada, e a escada de
   cinco degraus só no genérico: "2 é o cliente disse, 3 é alguém conferiu".
   Só que o rigor não é igual nas oito, e é exatamente aí que está a diferença
   entre medir e iludir. Em Processo de compra, "o cliente descreveu as etapas
   de aprovação" é 2; o 3 exige saber quem assina cada uma e quanto tempo cada
   uma leva, confirmado com quem participa. Sem essa frase na frente, o modelo
   lia "ele explicou o fluxo" e dava 3 — progresso que ninguém verificou, que é
   o erro que esta régua inteira existe para impedir.

   O app manda a régua dele junto do pedido. Assim o modelo pontua pelo
   critério escrito, e a régua deixa de existir em duas cópias que envelhecem
   separadas. */
function reguaDetalhada(ctx: Record<string, unknown>): string {
  const e = ctx.escada as Record<string, unknown> | undefined;
  if (!e || !Array.isArray(e.decisoes)) return '';

  const linhas: string[] = [];
  const degraus = Array.isArray(e.degraus) ? e.degraus : [];
  linhas.push('A RÉGUA, DECISÃO POR DECISÃO — pontue por ESTES textos, não pelo degrau genérico.');
  linhas.push('Quando o material couber em dois degraus, use o MENOR. Nota inflada vira previsão falsa.');
  linhas.push('');
  for (const d of e.decisoes as Array<Record<string, unknown>>) {
    linhas.push(`${d.nome} (${d.id}) — ${d.pergunta}`);
    const niveis = Array.isArray(d.niveis) ? d.niveis : [];
    niveis.forEach((texto, n) => linhas.push(`  ${n}: ${texto}`));
    linhas.push('');
  }

  const min = (e.forcaMinimaDoDegrau || {}) as Record<string, number>;
  const forcas = Array.isArray(e.forcas) ? e.forcas as Array<Record<string, unknown>> : [];
  const nomeDoPeso = (peso: number) => (forcas.find((f) => Number(f.peso) >= peso) || {}).id || '';
  const exigencias = Object.keys(min).map((degrau) =>
    `degrau ${degrau} exige evidência com força ${nomeDoPeso(min[degrau])} ou mais forte`);
  if (exigencias.length) {
    linhas.push('PROVA EXIGIDA: ' + exigencias.join('; ') + '. ' +
      'Os degraus 1 e 2 não pedem prova, porque falam de ONDE a informação veio — nós achamos, ou o ' +
      'cliente disse — e não de quanto ela resistiu. Se você propuser 3 ou 4 sem uma evidência dessa ' +
      'força no material, o app desce a nota sozinho: proponha o degrau que a prova sustenta.');
  }
  if (Array.isArray(e.ordem)) {
    linhas.push('ORDEM DE TRABALHO das oito (decisão tem pré-requisito; ninguém prioriza o que não ' +
      'reconhece como problema): ' + (e.ordem as string[]).join(' → ') + '.');
  }
  if (degraus.length) {
    linhas.push('ESCALA: soma das oito de 0 a ' + (e.iadMaximo || 32) +
      '; a partir de ' + (e.iadMaduro || 24) + ' a decisão é madura.');
  }
  return linhas.join('\n');
}

function quemEQuem(ctx: Record<string, unknown>): string {
  const nos = String(ctx.nossaEmpresa || '').trim();
  const vendedor = String(ctx.nossoVendedor || '').trim();
  const cliente = String(ctx.clienteNome || '').trim();
  if (!nos && !cliente && !vendedor) return '';

  const linhas: string[] = ['QUEM É QUEM NESTE MATERIAL — leia isto antes de qualquer regra:'];
  if (nos) linhas.push(`- NÓS somos ${nos}. Somos quem vende. Nada que nós dissermos, apresentarmos ou propusermos vira nota.`);
  if (vendedor) linhas.push(`- Quem fala por nós é ${vendedor}. Tudo atribuído a essa pessoa é atividade nossa.`);
  if (cliente) linhas.push(`- O CLIENTE é ${cliente}. É o lado comprador. O que qualquer pessoa desse lado disser é evidência dele.`);
  linhas.push('- Quem não estiver nomeado acima: decida pelo papel na conversa. ' +
    'Quem descreve a própria operação, o próprio problema, o próprio orçamento e o próprio processo de compra é do lado do cliente. ' +
    'Quem apresenta solução, metodologia, ferramenta e preço é do nosso lado.');
  linhas.push('- ATA EM TERCEIRA PESSOA: material gerado por Meet, Teams ou Gemini narra a reunião de fora — ' +
    '"Fulano mencionou", "Fulano observou", "Fulano detalhou", "Fulano solicitou". ' +
    'Quando o Fulano é do lado do cliente, isso É declaração do cliente e vale degrau 2, ' +
    'com o trecho narrado servindo de trecho literal. Descartar essas frases por serem narração ' +
    'é o erro mais caro deste assistente: zera uma reunião inteira que estava cheia de sinal.');
  return linhas.join('\n');
}

function promptDe(tipo: string, ctx: Record<string, unknown>): string {
  const hoje = String(ctx.hoje || new Date().toISOString().slice(0, 10));
  const contatos = listaCurta(ctx.contatos);
  const segmentos = listaCurta(ctx.segmentos);
  const lados = quemEQuem(ctx);
  const regua = reguaDetalhada(ctx);

  if (tipo === 'evidencia') {
    return `${BASE}

${lados ? '\n' + lados + '\n' : ''}
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

Campos: nome, razaoSocial, cnpj, segmento, descricao, necessidades, telefone,
porte, cidade, uf, pais, site, linkedin.

segmento: escolha o MAIS PRÓXIMO da lista fechada acima, usando julgamento
sobre o que a empresa faz — não procure o nome exato no texto. Fábrica de
biscoitos é Alimentos. Abatedouro de aves é Proteína Animal. Concessionária de
água é Saneamento. Shopping é Real Estate e Facilities. Escreva o nome como
está na lista. Só deixe vazio quando a empresa não tiver nada a ver com
nenhum item — e nesse caso deixe vazio mesmo, não force o mais parecido.
descricao é o que ela produz e para quem vende, em uma ou duas frases.
necessidades é o que ESTA empresa precisa resolver, do ponto de vista de quem
vai vender para ela: a dor, o gargalo, a exigência, o prazo. Escreva em tópicos
curtos separados por ponto e vírgula, com os números que aparecerem no
material. Se o material não disser nada disso, deixe vazio — não deduza a
necessidade a partir do setor.

Quando o material trouxer blocos marcados [site ...] ou [Receita Federal ...],
eles são fonte oficial: prefira-os para razão social, CNPJ, endereço e
telefone. O resto do material é anotação comercial e vale para o que a empresa
precisa, não para o que ela é no papel.

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

Devolva também, quando o material permitir:
- "empresa": objeto com a ficha da empresa cliente — nome, razaoSocial, cnpj,
  segmento, descricao, necessidades, telefone, porte, cidade, uf, pais, site,
  linkedin. Mesmas regras da ficha de empresa: nada inventado, segmento só da
  lista fechada.
- "contatos": lista das pessoas DA EMPRESA CLIENTE citadas, com nome, cargo,
  email, telefone e area. Quem assina o documento do nosso lado não entra.

- titulo: nome curto da oportunidade, combinando a empresa e o que está sendo vendido.
- empresaNova: nome da empresa cliente.
- segmento: ${segmentos ? `um destes, exatamente: ${segmentos}` : 'omita — não há segmentos cadastrados'}. Nunca invente.
- tipo: um de ${TIPOS_OPORTUNIDADE.join(' | ')}.
- concorrentes: nomes citados, separados por vírgula. Inclua "não fazer nada" se o texto indicar que o cliente pode simplesmente não decidir.
- contatoPapel: um de ${PAPEIS.join(' | ')}. contatoPerfil: um de ${PERFIS.join(' | ')}.

Não devolva valor, etapa nem data de fechamento.`;
  }

  if (tipo === 'reuniao') {
    const etapas = Array.isArray(ctx.etapas) ? ctx.etapas.map(String).join(' | ') : '';
    return `${BASE}
${lados ? '\n' + lados + '\n' : ''}

Tarefa: o vendedor enviou a transcrição de uma reunião, a ata ou as anotações dele. Separe TUDO que o cliente fez ou disse em evidências, uma para cada dimensão afetada. Um documento costuma render de duas a seis.

Devolva {"decisoes": [ ... ], "evidencias": [ ... ], "contatos": [ ... ], "empresa": { ... }, "negocio": { ... }}.

ESCREVA "decisoes" PRIMEIRO, antes de tudo. É o campo que mais importa: sem ele o vendedor fica com o índice zerado, que é o mesmo que não ter lido o documento.

Cada item de "evidencias" tem:
- dimensao: uma das oito. Vale a mesma observação das notas: num documento nosso, os dados que o cliente forneceu ou confirmou — a operação atual dele, os números da unidade, a rotina que ele descreveu — são evidência dele, com força "documentado". Nossa recomendação e nosso preço não são. Um receio, uma objeção ou um impedimento vai para "risco". Uma exigência de comparação ou de especificação vai para "criterios". Alguém novo entrando na conversa vai para "stakeholders". O caminho formal até a assinatura vai para "processo".
- titulo: uma linha começando pelo lado do cliente. Ex.: "Jurídico exigiu cláusula de rescisão em 30 dias".
- forca:
${listaForcas()}
- data: AAAA-MM-DD. Hoje é ${hoje}. Se o documento não trouxer a data, use ${hoje}. Nunca no futuro.
- contato: nome de quem falou, se identificável.${contatos ? ` Já cadastrados: ${contatos}.` : ''}
- canal: um de ${CANAIS.join(', ')}.
- compromissoTexto / compromissoData / compromissoDono: só no item onde o próximo passo foi combinado.
- frase: o trecho literal do documento que sustenta esta evidência.

Cada item de "contatos" é uma pessoa do lado do cliente que apareceu no documento: {nome, cargo, papel, email, telefone, sentimento, influencia, frase}. papel é um de ${PAPEIS.join(' | ')}. sentimento é um de ${SENTIMENTOS.join(' | ')} e só quando o documento mostrar como a pessoa reagiu. influencia é "1" opina, "2" influencia, "3" decide. Devolva email e telefone só se aparecerem no material. Inclua também quem JÁ está cadastrado, quando o documento disser algo novo sobre a pessoa — cargo, papel, contato: o app usa isso para completar o que está em branco na ficha dela.

"empresa" é o que o material diz sobre a EMPRESA CLIENTE, e só o que ele diz: {descricao, necessidades, porte, cidade, uf, site, telefone, cnpj}. Omita todo campo que o material não informar. "necessidades" é o que o cliente precisa resolver, com as palavras dele. Nada de suposição: o app usa isto para completar campos vazios da ficha, e um palpite gravado ali vira fato para quem abrir a conta amanhã.

"negocio" é o que o material diz sobre o NEGÓCIO em si. Devolva apenas os campos que o material realmente informa; omita o resto. Nunca invente número, data nem etapa.
- valor: o valor deste negócio para nós, em reais, só o número (ex.: 91379.04). É o que o cliente pagaria em doze meses. Quando o material é uma proposta com implantação e mensalidade, valor é a implantação mais DOZE mensalidades — sempre doze, mesmo que o documento mostre um cálculo com menos (é comum a tabela de ROI usar seis por causa de carência; esse número é do cálculo de retorno, não do contrato). Economia estimada, benefício, ROI e payback NÃO são o valor do negócio — são argumento de venda; não os devolva aqui.
- valorFrase: o trecho literal de onde tirou o valor.
- etapa: a etapa do funil que o material comprova ter sido atingida${etapas ? `, uma de ${etapas}` : ''}. Só devolva se o material for prova disso — uma proposta formal com preço comprova "Proposta"; um contrato assinado comprova "Fechamento". Conversa sobre preço não comprova nada. Se o material for só ata de reunião, omita.
- etapaFrase: o trecho literal que comprova a etapa.
- previsao: data prevista de fechamento, AAAA-MM-DD, só se o material declarar prazo.
- concorrentes: nomes de concorrentes citados, separados por vírgula.

"decisoes" são as OITO decisões relidas: [{"dimensao":"problema","nota":0,"porque":"...","trecho":"..."}, ...], as oito, sempre. Leia-as considerando TUDO — o retrato da oportunidade que veio no início do texto (as evidências já registradas antes) MAIS o material novo que o vendedor acabou de mandar.

${regua ? regua + '\n' : ''}
Os CINCO degraus, iguais para todas. O que decide o degrau NÃO é o quanto se sabe: é DE ONDE a informação veio.
  0 — desconhecido: nada no material toca esta decisão.
  1 — suposto: quem afirma isso somos nós. O cliente não disse. Dedução a partir do setor, do porte, do cargo ou do bom senso.
  2 — declarado: o cliente disse, com palavras dele. Ainda não foi conferido por ninguém.
  3 — testado: alguém verificou o que ele disse — com dado, com outra pessoa, com um segundo encontro — e continuou de pé.
  4 — documentado: está por escrito num documento DO CLIENTE. Ata, indicador, meta, política, e-mail dele.

A fronteira que mais importa é entre 2 e 3, e é a razão desta escada existir. "O cliente disse que tem prazo até dezembro" é 2. Vira 3 quando alguém conferiu que o prazo se mantém, ou quando uma segunda pessoa do cliente confirmou. Um diagnóstico prometido e ainda não entregue MANTÉM a decisão em 2 — ele pode voltar mostrando que nem servimos ao caso. Antecipar para 3 é inventar progresso que ninguém verificou.

Regras das notas, e são o ponto todo:
- A nota vem SÓ do que o CLIENTE disse ou fez. O que nós mandamos, apresentamos ou propusemos não conta e nunca sobe nota. Uma proposta enviada não é impacto aceito; um material apresentado não é problema reconhecido.
- Mas atenção a um caso que não é exceção à regra, é aplicação dela: um documento NOSSO — proposta, diagnóstico, levantamento — costuma conter dados que o CLIENTE forneceu ou confirmou. Trechos marcados como "dados confirmados", "informado pelo cliente", "levantamento na unidade", ou números da operação dele (consumo, volumes, quantidade de pontos, equipamentos, rotina atual) são evidência DELE, com força "documentado", ainda que apareçam num material que nós escrevemos. Quem produziu o dado é o cliente; nós só o organizamos. O que não conta é a nossa recomendação, a nossa solução e o nosso preço.
- "trecho" tem de ser um pedaço LITERAL do que você recebeu — copiado, não parafraseado. Nota 2 ou mais sem trecho literal cai para 1 automaticamente: sem a frase do cliente o que existe é suposição nossa, e suposição é o degrau 1.
- Nota 0 é para quando NÃO HÁ SINAL NENHUM daquela decisão no material. Não use 0 para "o cliente falou disso mas não provou" — isso é 2. Zerar uma decisão sobre a qual o cliente falou é o erro mais caro que você pode cometer aqui: o vendedor abre a tela e vê "Não sabemos" sobre o assunto que ocupou vinte minutos da reunião dele.
- 4 é raro numa ata: só use quando o próprio material FOR o documento do cliente, ou citar um documento dele com nome. Ata que nós escrevemos sobre o que ele falou não é documento dele.
- Na dúvida entre dois degraus, use o menor. E aqui a dúvida tem um lado certo: entre 2 e 3, é 2, a menos que o material diga explicitamente que alguém conferiu. Nota inflada vira pipeline falso no painel do dono da empresa.
- "porque" em uma linha, dizendo o que sustenta — ou, quando for 0, o que faltaria para subir.


O QUE A SUA LEITURA PROVOCA NO SISTEMA. Você não classifica o negócio — isso é regra fixa do app, e é assim de propósito: se um modelo decidisse a cor do cartão, ela mudaria entre duas visitas sem nada ter acontecido. Mas as notas que você propõe ALIMENTAM essa regra, e saber disso muda o cuidado que cada nota merece. As regras são testadas nesta ordem, e o negócio fica na PRIMEIRA que servir:

1. ZUMBI — mais de 30 dias sem nenhuma evidência do cliente. Esta regra vence todas as outras: um negócio com índice alto e quarenta dias de silêncio é zumbi, não é real. Por isso a DATA que você põe em cada evidência importa tanto quanto a nota: datar errado ressuscita ou mata um negócio.
2. FALSO AVANÇADO — etapa em Proposta ou adiante e pelo menos um destes: soma abaixo de 24 (de 32), o portão da proposta não liberado, ou nenhum decisor econômico mapeado. É o maior destruidor de previsão de vendas. Uma nota inflada aqui esconde exatamente o negócio que ia estourar no fim do mês.
3. OCULTO PROMISSOR — soma 24 ou mais (de 32) com a etapa ainda antes de Proposta. É o achado mais valioso do funil: o cliente decidiu mais do que a etapa mostra. Uma nota que você deixou baixa demais por excesso de zelo esconde este caso.
4. NEGÓCIO REAL — soma 24 ou mais (de 32), até 14 dias sem evidência, e metade ou mais dos papéis críticos mapeados. É o que a previsão pode contar.
5. EM CONSTRUÇÃO — o que sobra.

Três consequências disso para o seu trabalho, e elas puxam em direções opostas de propósito:
- Inflar nota cria falso avançado e previsão falsa. Na dúvida entre dois níveis, o menor.
- Zerar decisão sobre a qual o cliente falou esconde oculto promissor. Nota 0 é só para quando NÃO HÁ SINAL NENHUM.
- Errar a data da evidência é o erro mais barato de cometer e o mais caro de descobrir: ela move o relógio dos 14 e dos 30 dias.

Quem você identifica como pessoa nova também entra na conta: é a cobertura dos papéis críticos, e "decisor econômico" é condição de duas das cinco regras acima.

COMO RECONHECER CADA UMA NUM DOCUMENTO DE REUNIÃO. Esta parte existe porque as três primeiras vinham voltando em branco de atas onde estavam escritas com todas as letras:

- problema: o cliente DESCREVENDO a operação dele e o que nela não funciona. "não temos medição nos consumos internos", "hoje é feito por estimativa", "a planta não sabe onde a água é usada", "o processo atual é manual". Não precisa da palavra "problema": descrição de deficiência operacional feita por quem opera É o problema reconhecido. Se ele detalhou como funciona hoje e por que isso não serve, é 2.

- prioridade: sinal de que aquilo entrou na fila DELE. Meta corporativa com número ou prazo ("reduzir 15% até 2030", "compromisso oficial"), alguém designado para tocar o assunto, a palavra urgente/mandatório/crítico dita pelo cliente, ou um projeto já aberto internamente. Meta publicada da empresa vale: ela custou aprovação interna.

- impacto: a CONSEQUÊNCIA que o cliente assumiu como dele. Raramente vem em reais, e não precisa vir: litígio ou disputa com fornecedor ou órgão, multa, autuação, tarifa penalizada, impossibilidade de continuar como está ("não podemos mais destinar", "o fornecedor não aceita mais"), risco regulatório, perda de produto, parada de linha. Tudo isso é impacto declarado pelo cliente. O que NÃO é impacto: economia que NÓS projetamos, ROI que NÓS calculamos, caso de outro cliente que NÓS contamos. Se o cliente citou uma consequência concreta que recai sobre ele, dê 2; se ele dimensionou com número próprio e alguém conferiu, dê 3; se está num documento dele, 4.

- processo: a régua mais dura das oito, por um motivo prático — descobrir tarde que a diretoria do cliente decide devagar já custou o trimestre de muita gente. Etapas descritas pelo cliente é 2. Só vale 3 quando o material trouxer as TRÊS coisas juntas: quais são as etapas, QUEM assina cada uma, e QUANTO TEMPO cada uma leva, vindo de quem participa delas. Faltando o prazo, é 2, por mais completo que esteja o resto.

- criterios: exigência de comparação, especificação, teste ou prova pedida por ele.
- stakeholders: gente nova entrando, área nova citada, alçada mencionada.
- consenso: duas ou mais pessoas do cliente convergindo, ou uma decisão conjunta registrada.
- risco: receio, objeção, impedimento ou restrição que ELE levantou.
- processo: o caminho formal até a assinatura — compras, jurídico, alçada, orçamento, prazo de contratação.

Regras desta tarefa:
- Uma evidência por fato. Não junte dois assuntos na mesma linha.
- O que NÓS fizemos (mandamos proposta, fizemos follow-up) não é evidência. Descarte.
- No máximo ${ITENS_MAXIMOS} evidências. Se houver mais, fique com as mais relevantes para a decisão.
- Nunca invente pessoa, número, prazo ou fala que não esteja no material.
- Português do Brasil.`;
  }

  if (tipo === 'notas') {
    return `${BASE}

Tarefa: você recebe o retrato de UMA oportunidade — as evidências que o cliente produziu, o grupo de compra, o insight e, quando houver, o texto de uma reunião que o vendedor acabou de colar. Proponha a nota de cada uma das oito decisões.

Devolva {"decisoes":[{"dimensao":"problema","nota":0,"porque":"...","trecho":"..."} , ...]} com as oito, na ordem acima.

${regua ? regua + '\n' : ''}
Os CINCO degraus, iguais para todas. O que decide o degrau NÃO é o quanto se sabe: é DE ONDE a informação veio.
  0 — desconhecido: nada no material toca esta decisão.
  1 — suposto: quem afirma isso somos nós. O cliente não disse. Dedução a partir do setor, do porte, do cargo ou do bom senso.
  2 — declarado: o cliente disse, com palavras dele. Ainda não foi conferido por ninguém.
  3 — testado: alguém verificou o que ele disse — com dado, com outra pessoa, com um segundo encontro — e continuou de pé.
  4 — documentado: está por escrito num documento DO CLIENTE. Ata, indicador, meta, política, e-mail dele.

A fronteira que mais importa é entre 2 e 3, e é a razão desta escada existir. "O cliente disse que tem prazo até dezembro" é 2. Vira 3 quando alguém conferiu que o prazo se mantém, ou quando uma segunda pessoa do cliente confirmou. Um diagnóstico prometido e ainda não entregue MANTÉM a decisão em 2 — ele pode voltar mostrando que nem servimos ao caso. Antecipar para 3 é inventar progresso que ninguém verificou.

Regras desta tarefa, e são o ponto todo:
- A nota vem SÓ do que o CLIENTE disse ou fez. O que nós mandamos, apresentamos ou propusemos não conta e nunca sobe nota. Uma proposta enviada não é impacto aceito; um material apresentado não é problema reconhecido.
- "trecho" tem de ser um pedaço LITERAL do que você recebeu — copiado, não parafraseado. Nota 2 ou mais sem trecho literal cai para 1 automaticamente: sem a frase do cliente o que existe é suposição nossa, e suposição é o degrau 1.
- Nota 0 é para quando NÃO HÁ SINAL NENHUM daquela decisão no material. Não use 0 para "o cliente falou disso mas não provou" — isso é 2. Zerar uma decisão sobre a qual o cliente falou é o erro mais caro que você pode cometer aqui: o vendedor abre a tela e vê "Não sabemos" sobre o assunto que ocupou vinte minutos da reunião dele.
- Na dúvida entre dois níveis, use o menor. Uma nota inflada vira pipeline falso no painel do dono da empresa, e ninguém descobre a tempo.
- "porque" em uma linha, dizendo o que sustenta — ou, quando for 0, o que faltaria para subir.


O QUE A SUA LEITURA PROVOCA NO SISTEMA. Você não classifica o negócio — isso é regra fixa do app, e é assim de propósito: se um modelo decidisse a cor do cartão, ela mudaria entre duas visitas sem nada ter acontecido. Mas as notas que você propõe ALIMENTAM essa regra, e saber disso muda o cuidado que cada nota merece. As regras são testadas nesta ordem, e o negócio fica na PRIMEIRA que servir:

1. ZUMBI — mais de 30 dias sem nenhuma evidência do cliente. Esta regra vence todas as outras: um negócio com índice alto e quarenta dias de silêncio é zumbi, não é real. Por isso a DATA que você põe em cada evidência importa tanto quanto a nota: datar errado ressuscita ou mata um negócio.
2. FALSO AVANÇADO — etapa em Proposta ou adiante e pelo menos um destes: soma abaixo de 24 (de 32), o portão da proposta não liberado, ou nenhum decisor econômico mapeado. É o maior destruidor de previsão de vendas. Uma nota inflada aqui esconde exatamente o negócio que ia estourar no fim do mês.
3. OCULTO PROMISSOR — soma 24 ou mais (de 32) com a etapa ainda antes de Proposta. É o achado mais valioso do funil: o cliente decidiu mais do que a etapa mostra. Uma nota que você deixou baixa demais por excesso de zelo esconde este caso.
4. NEGÓCIO REAL — soma 24 ou mais (de 32), até 14 dias sem evidência, e metade ou mais dos papéis críticos mapeados. É o que a previsão pode contar.
5. EM CONSTRUÇÃO — o que sobra.

Três consequências disso para o seu trabalho, e elas puxam em direções opostas de propósito:
- Inflar nota cria falso avançado e previsão falsa. Na dúvida entre dois níveis, o menor.
- Zerar decisão sobre a qual o cliente falou esconde oculto promissor. Nota 0 é só para quando NÃO HÁ SINAL NENHUM.
- Errar a data da evidência é o erro mais barato de cometer e o mais caro de descobrir: ela move o relógio dos 14 e dos 30 dias.

Quem você identifica como pessoa nova também entra na conta: é a cobertura dos papéis críticos, e "decisor econômico" é condição de duas das cinco regras acima.

COMO RECONHECER CADA UMA NUM DOCUMENTO DE REUNIÃO. Esta parte existe porque as três primeiras vinham voltando em branco de atas onde estavam escritas com todas as letras:

- problema: o cliente DESCREVENDO a operação dele e o que nela não funciona. "não temos medição nos consumos internos", "hoje é feito por estimativa", "a planta não sabe onde a água é usada", "o processo atual é manual". Não precisa da palavra "problema": descrição de deficiência operacional feita por quem opera É o problema reconhecido. Se ele detalhou como funciona hoje e por que isso não serve, é 2.

- prioridade: sinal de que aquilo entrou na fila DELE. Meta corporativa com número ou prazo ("reduzir 15% até 2030", "compromisso oficial"), alguém designado para tocar o assunto, a palavra urgente/mandatório/crítico dita pelo cliente, ou um projeto já aberto internamente. Meta publicada da empresa vale: ela custou aprovação interna.

- impacto: a CONSEQUÊNCIA que o cliente assumiu como dele. Raramente vem em reais, e não precisa vir: litígio ou disputa com fornecedor ou órgão, multa, autuação, tarifa penalizada, impossibilidade de continuar como está ("não podemos mais destinar", "o fornecedor não aceita mais"), risco regulatório, perda de produto, parada de linha. Tudo isso é impacto declarado pelo cliente. O que NÃO é impacto: economia que NÓS projetamos, ROI que NÓS calculamos, caso de outro cliente que NÓS contamos. Se o cliente citou uma consequência concreta que recai sobre ele, dê 2; se ele dimensionou com número próprio e alguém conferiu, dê 3; se está num documento dele, 4.

- processo: a régua mais dura das oito, por um motivo prático — descobrir tarde que a diretoria do cliente decide devagar já custou o trimestre de muita gente. Etapas descritas pelo cliente é 2. Só vale 3 quando o material trouxer as TRÊS coisas juntas: quais são as etapas, QUEM assina cada uma, e QUANTO TEMPO cada uma leva, vindo de quem participa delas. Faltando o prazo, é 2, por mais completo que esteja o resto.

- criterios: exigência de comparação, especificação, teste ou prova pedida por ele.
- stakeholders: gente nova entrando, área nova citada, alçada mencionada.
- consenso: duas ou mais pessoas do cliente convergindo, ou uma decisão conjunta registrada.
- risco: receio, objeção, impedimento ou restrição que ELE levantou.
- processo: o caminho formal até a assinatura — compras, jurídico, alçada, orçamento, prazo de contratação.
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
    const papeis = (Array.isArray(ctx.papeis) ? ctx.papeis.map(String) : []);
    const nomes = segmentosDoTenant(ctx);
    /* Catálogo só com nomes é outro jogo: sem subsegmentos, "Químicos" é uma
       palavra e não uma definição, e a régua de correspondência tem de ser
       outra. O modelo precisa saber em qual dos dois casos está. */
    const detalhados = nomes.some((s) => s.subsegmentos || s.oportunidades || s.personas);
    const contas = contasDoTenant(ctx);
    const blocoContas = contas.length
      ? `

EMPRESAS QUE A EQUIPE JÁ TEM CADASTRADAS — e que podem ser a mesma do lead:
${descreverContas(ctx)}

Para cada lead, diga em "contaExistente" se a empresa dele É UMA DESTAS, copiando o nome EXATAMENTE como está na lista. Se for empresa nova, devolva "".

Esta pergunta existe porque nenhuma regra de texto a responde. "Envu" e "Envu Brasil Ltda" são a mesma empresa; "Alpha Engenharia" e "Alpha Alimentos" não são, e a diferença não está no nome — está no que cada uma faz. Você sabe o que elas fazem; a regra de texto não sabe.

Como decidir:
- Mesma empresa: variação de razão social e nome fantasia ("Envu", "Envu Brasil", "ENVU do Brasil Ltda"), sigla contra nome por extenso, com e sem a unidade ("Suzano" e "Suzano Papel e Celulose"), grafia diferente do mesmo nome.
- Empresas diferentes: mesma palavra inicial e ramos diferentes; matriz e uma controlada que vende outra coisa; duas empresas de um mesmo grupo com CNPJ e operação separados. Na dúvida entre duas da lista, devolva "".
- Domínio bate: é a mesma, sem discussão.
- "porqueConta": até 10 palavras dizendo o que fez você juntar as duas. Só quando "contaExistente" não for vazio.

Errar para o lado de "" é barato: nasce uma conta a mais, que se funde depois. Errar para o lado de juntar é caro: o contato de uma empresa entra no grupo comprador da outra, e ninguém confere um grupo comprador que já veio preenchido. Na dúvida, "".`
      : '';
    return `Você prepara, para uma equipe de vendas B2B brasileira, os leads que acabaram de chegar do LinkedIn. Para cada um: classifica a empresa no segmento mais próximo, diz que papel a pessoa tende a ter na compra, escreve o reenquadramento comercial${contas.length ? ', e diz se a empresa já está cadastrada' : ''}.

SEGMENTOS DESTA EQUIPE — o que cada um cobre:
${descreverSegmentos(ctx, true)}

Como escolher o segmento — faça nesta ordem, para cada lead:
1. Leia o que a empresa faz. E comece pelo NOME DELA: em português o nome quase sempre entrega o setor — "Vita Ambiental Engenharia" é meio ambiente, "Laticínios São Jorge" é alimentos, "Metalúrgica Pilar" é metalurgia, "Transportadora Aliança" é logística. Só depois vão a descrição, o site, o cargo da pessoa e a conversa. Muito lead do LinkedIn vem sem descrição nenhuma, e desistir por causa disso é jogar fora o sinal mais forte que existe na linha.
2. Percorra os segmentos acima UM A UM e pergunte: o que esta empresa faz aparece nos subsegmentos ou nas oportunidades deste segmento?
3. Se aparecer em mais de um, fique com aquele onde a empresa é CLIENTE do que a lista descreve, não fornecedor dela.
4. Se nenhum bater exatamente, pegue o MAIS PRÓXIMO por cadeia produtiva, por processo industrial ou pelo tipo de cliente que atende. Uma fábrica de embalagem plástica para alimento está mais perto de "Alimentos" do que de "Outros". Um laticínio pequeno é "Alimentos" mesmo que a lista só cite frigoríficos.
5. Só use "Outros" quando a empresa não tiver relação nenhuma com nenhum dos segmentos — e mesmo assim diga em "maisProximo" qual chegou mais perto.

"Outros" é o último recurso, não o padrão. Vendedor com a carteira inteira em "Outros" não tem painel por segmento; segmento aproximado e conferido por ele vale mais do que uma pilha de "Outros". Por isso você também devolve "confianca": ela é o que avisa o vendedor onde olhar.

Papéis na compra, e SÓ estes:
${papeis.map((x) => '- ' + x).join('\n')}

Regras absolutas:
- Responda SOMENTE com um objeto JSON: {"itens":[{"n":1,"segmento":"...","confianca":"alta|media|baixa","porque":"...","maisProximo":"...","papel":"...","resposta":"positiva|negativa|neutra","porqueRecusa":"...","insight":"..."${contas.length ? ',"contaExistente":"...","porqueConta":"..."' : ''}},...]}
- "segmento" tem de ser copiado EXATAMENTE de uma das linhas de SEGMENTOS acima, ou ser "Outros". Nada fora disso — nem um nome parecido, nem um subsegmento.
- "confianca": "alta" quando o que a empresa faz está escrito na lista; "media" quando você chegou por proximidade; "baixa" quando é palpite.
- "porque": no máximo 12 palavras, dizendo o que na empresa levou a esse segmento.
- "maisProximo": preencha SEMPRE que "segmento" for "Outros", com o nome do segmento que chegou mais perto; nos outros casos devolva "".
- "papel" tem de ser copiado EXATAMENTE de uma das linhas de papéis. Ele sai do CARGO da pessoa, não do que ela escreveu. Quem não dá para dizer pelo cargo fica em "Usuário", que é o padrão neutro. Não promova ninguém a "Decisor econômico" por gentileza.
- "resposta" diz o que a pessoa respondeu à SDR, e só pode ser: "positiva", "negativa" ou "neutra".
  - "negativa" quando ela recusa, se exclui do público ou pede para parar: "não tenho relação com isso", "me retire da lista", "não moro em condomínio", "não trabalho mais com isso", "não temos interesse", "por favor não me envie". Também quando ela responde algo que só faz sentido se ela NÃO for o público da campanha.
  - "positiva" quando ela aceita, confirma que é o público, pede material, sugere conversa ou indica alguém.
  - "neutra" quando é cumprimento, agradecimento ou pergunta sem se comprometer: "bom dia", "obrigado pelo contato", "pode ir direto ao ponto?".
  - Cuidado com a educação brasileira: "Obrigado pelo contato" sozinho é neutra, não positiva. E "Que legal, mas não é para mim" é negativa apesar do elogio.
- "porqueRecusa": SÓ quando "resposta" for "negativa". Até 12 palavras, dizendo o que ela recusou, na terceira pessoa: "disse que não mora em condomínio", "pediu para sair da lista". Nos outros casos devolva "".
- "insight" é o reenquadramento: a verdade sobre o negócio DELE que ele não enxerga sozinho, tirada do que a empresa faz e do que a pessoa respondeu. Uma ou duas frases, na linguagem do setor dele, sem citar a nossa solução e sem elogio. Se a conversa e a descrição não derem base para nada além de genérico, devolva "" — insight genérico é pior que nenhum, porque o vendedor o repete achando que tem um.
- O insight é hipótese NOSSA, não é o cliente falando. Nunca escreva que o cliente disse, admitiu ou confirmou o que quer que seja.
- Um item de saída para cada lead da entrada, com o mesmo "n".
- Nada de texto fora do JSON.

Por que "resposta" importa mais do que parece: quem responde NÃO vira, do outro lado, empresa, contato, oportunidade e tarefa se ninguém marcar que era um não. É a pior coisa que este sistema pode fazer — pipeline construído em cima de uma recusa, e um vendedor gastando a semana nele. Na dúvida entre "negativa" e "neutra", prefira "negativa": ela apenas desmarca o lead na tela, e quem vende decide.

Um aviso sobre a pessoa física: quando o lead for alguém abordado como PESSOA e não como empresa — morador de condomínio, consultor autônomo, mentor, coach, investidor —, "Outros" é a resposta certa e não é derrota. Diga isso no "porque". O que não pode é uma empresa industrial com nome autoexplicativo cair em "Outros" por falta de descrição.

A entrada traz, para cada lead: nome, cargo e perfil da pessoa, nome da empresa, site, cidade, o que a pessoa faz lá, a descrição da empresa quando disponível, o texto do site quando disponível, e a troca de mensagens entre a SDR e a pessoa.${blocoContas}${nomes.length ? '' : '\n\nAtenção: a lista de segmentos veio vazia. Devolva "Outros" para todos.'}${detalhados ? '' : '\n\nOs segmentos desta equipe vieram SÓ COM O NOME, sem subsegmentos nem exemplos. Então trabalhe pelo significado do nome de cada um no mercado brasileiro, e seja mais generoso na aproximação: com a lista assim, exigir correspondência exata é o mesmo que mandar tudo para "Outros".'}`;
  }

  if (tipo === 'desenvolvimento') {
    return `${BASE}

Tarefa: você recebe a série semanal dos indicadores de UMA carteira de vendas e quanto cada tipo de tarefa rendeu em pontos de decisão. Escreva o plano de desenvolvimento da semana para quem vende nesta carteira.

Devolva {"leitura":"...", "indoBem":[...], "indoMal":[...], "mudancas":[{"acao":"...","porque":"...","medir":"..."}]}.

- leitura: DUAS frases dizendo o que a série mostra no conjunto. Comece pelo que mais mudou. Cite número.
- indoBem: até 4 frases curtas, uma por indicador que melhorou. Cada uma cita o número e a variação. Se nada melhorou, devolva lista vazia — não force.
- indoMal: até 4 frases curtas, uma por indicador que piorou. Mesma regra.
- mudancas: no MÁXIMO 3, e são o ponto da tarefa. Cada uma tem:
  - acao: o que mudar no jeito de trabalhar na semana que vem, começando por um verbo. Concreta e executável. Nada de "melhorar o acompanhamento" ou "focar mais".
  - porque: o número da série que justifica, citado.
  - medir: qual indicador desta mesma lista vai mostrar se deu certo, e em quantas semanas.

Regras desta tarefa, e são o ponto todo:
- Use SÓ os números recebidos. Não estime, não projete, não compare com "mercado" nem com "benchmark" — você não tem esse dado.
- Tarefa concluída é esforço; ponto de decisão é resultado. Quando muita tarefa rendeu pouco ponto, diga isso com todas as letras e vá atrás de qual tipo está seco.
- Um tipo de tarefa com muitas execuções e zero ponto é o achado mais valioso da tabela. Não passe por cima dele.
- Semana com pouco dado é semana com pouco dado: diga que a amostra é curta em vez de inventar tendência. Duas semanas não fazem tendência.
- Não elogie por elogiar e não invente causa que os números não mostram. "Caiu porque a equipe estava desmotivada" é ficção.
- Português do Brasil, direto, sem jargão de coach.`;
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

/* ---------- quando o nome do modelo morre ----------

   Provedores aposentam nomes de modelo sem aviso, e o nome fica escrito num
   segredo que alguém definiu meses atrás. Aconteceu duas vezes em uma semana
   aqui: o app inteiro parou de classificar por causa de uma string.

   A função já perguntava a lista viva ao provedor — só que para escrever a
   mensagem de erro. Agora ela usa: escolhe um substituto e refaz o pedido.
   O vendedor não fica sem resposta esperando alguém mexer num segredo.

   A ordem é por capacidade, não por preferência de marca. Para o trabalho
   pesado — ler ata, propor as oito notas — vai o maior que estiver de pé;
   para a classificação em lote vai o menor, que é o que cabe no limite por
   minuto. Quem não estiver na lista entra depois, por ordem do provedor:
   um modelo desconhecido responde melhor do que modelo nenhum. */
const PREFERIDOS_BONS = [
  'openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'qwen/qwen3.6-27b',
  'groq/compound', 'openai/gpt-oss-20b', 'groq/compound-mini'
];
const PREFERIDOS_RAPIDOS = [
  'openai/gpt-oss-20b', 'groq/compound-mini', 'qwen/qwen3.6-27b',
  'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'
];

async function modeloSubstituto(rapido: boolean, recusado: string): Promise<string> {
  if (PROVEDOR === 'anthropic') return '';
  const vivos = await modelosDoGroq();
  if (!vivos.length) return '';
  const ordem = rapido ? PREFERIDOS_RAPIDOS : PREFERIDOS_BONS;
  const achado = ordem.find((m) => vivos.includes(m) && m !== recusado);
  if (achado) return achado;
  return vivos.find((m) => m !== recusado) || '';
}

async function explicarRecusa(r: Response, modelo: string): Promise<string> {
  const corpo = await r.text().catch(() => '');
  const curto = corpo.replace(/\s+/g, ' ').slice(0, 200);

  if (r.status === 404) {
    if (PROVEDOR === 'anthropic') {
      return 'O modelo "' + modelo + '" não existe na Anthropic. ' +
        'Use claude-opus-5, claude-sonnet-5 ou claude-haiku-4-5 no segredo IA_MODELO ' +
        'e publique a função de novo.';
    }
    const nomes = await modelosDoGroq();
    return 'O modelo "' + modelo + '" não existe mais no provedor. ' +
      (nomes.length
        ? 'Os que conversam agora: ' + nomes.slice(0, 20).join(', ') + '. ' +
          'Ponha um deles no segredo IA_MODELO e publique a função de novo.'
        : 'Veja a lista no painel do provedor e ponha um nome válido no segredo IA_MODELO.');
  }
  if (r.status === 401 || r.status === 403) {
    return 'O provedor recusou a chave da IA (' + r.status + '). Confira o segredo IA_CHAVE.' +
      (PROVEDOR === 'anthropic'
        ? ' Chave da Anthropic começa com "sk-ant-".'
        : ' Chave da Groq começa com "gsk_".');
  }

  /* 529 é "sobrecarregado" na Anthropic: não é limite da sua conta, é o
     provedor pedindo para voltar depois. Do ponto de vista de quem espera, é
     a mesma coisa que o 429 — e o app já sabe esperar e tentar de novo, desde
     que a mensagem venha no formato que ele lê. */
  if (r.status === 529) {
    return 'O provedor está sobrecarregado no momento. [esperar:20]' +
      (curto ? '\n\n' + curto : '');
  }
  if (r.status === 429) {
    /* O provedor diz QUAL limite estourou — tokens por minuto, requisições
       por dia — e quanto falta para liberar. Essa frase é a diferença entre
       "espere um minuto" e "só amanhã", e era jogada fora aqui. */
    const detalhe = (curto.match(/"message"\s*:\s*"([^"]+)"/) || [])[1] || curto;

    /* E quanto esperar vem escrito, em duas formas: o cabeçalho retry-after e
       o "Please try again in 42.5s" da mensagem. O app esperava 20 segundos
       fixos e tentava uma vez — chute que erra dos dois lados: espera demais
       quando falta pouco, e volta cedo demais quando falta um minuto, o que
       gasta a tentativa à toa. Agora o número atravessa até o cliente. */
    const doCabecalho = Number(r.headers.get('retry-after') || 0);
    const daMensagem = Number((curto.match(/try again in ([\d.]+)s/i) || [])[1] || 0);
    const segundos = Math.ceil(Math.max(doCabecalho, daMensagem)) || 0;

    return 'Limite de uso do provedor atingido no modelo "' + modelo + '".' +
      (segundos ? ' [esperar:' + segundos + ']' : '') +
      (detalhe ? '\n\n' + detalhe : '') +
      '\n\nSe o limite for por minuto, espere e tente de novo. Se for por dia, ' +
      'troque o modelo no segredo IA_MODELO ou mude de plano no provedor.';
  }
  if (r.status === 413 || /context|too large|maximum/i.test(curto)) {
    return 'Material grande demais para o modelo. Analise menos documentos de uma vez.';
  }
  return 'A IA respondeu ' + r.status + (curto ? ': ' + curto : '.');
}

/* A fronteira que o app escreve entre o retrato da oportunidade e o material
   novo. Serve para cortar o lado certo quando o modelo recusa por tamanho: o
   retrato é pequeno e é o que dá contexto às oito notas; o material é o que
   cresce sem limite quando alguém anexa cinco documentos. */
const MARCA_MATERIAL = '=== MATERIAL NOVO QUE O VENDEDOR ACABOU DE MANDAR ===';

function encurtar(usuario: string, fator: number): string {
  const i = usuario.indexOf(MARCA_MATERIAL);
  if (i < 0) return usuario.slice(0, Math.max(2000, Math.floor(usuario.length * fator)));
  const cabeca = usuario.slice(0, i + MARCA_MATERIAL.length);
  const material = usuario.slice(i + MARCA_MATERIAL.length);
  const cabe = Math.max(2000, Math.floor(material.length * fator));
  if (material.length <= cabe) return usuario;
  return cabeca + material.slice(0, cabe) + '\n[…material cortado para caber no modelo…]';
}

function recusouPorTamanho(status: number, corpo: string): boolean {
  return status === 413 ||
    /context|too large|maximum context|reduce the length|tokens per minute|rate_limit_exceeded/i.test(corpo);
}

/* Quanto o modelo pode ESCREVER, por tipo de pedido.

   2500 para todos era o defeito mais caro do sistema, e o mais silencioso. A
   resposta de uma reunião carrega até doze evidências com citação literal
   cada, a lista de pessoas, a ficha da empresa, o negócio E as oito decisões
   com o porquê e o trecho de cada uma. Isso passa de 2500 tokens sem esforço.
   Quando passava, a resposta vinha cortada — e o corte cai sempre no fim, que
   era justamente onde ficavam as oito. O vendedor via as evidências entrarem e
   o índice continuar 0/16, sem erro nenhum na tela: o modelo tinha respondido,
   só não tinha chegado até lá.

   Extração de ficha continua barata e curta; quem lê documento inteiro
   precisa de espaço para responder. */
/* ---------- por que o teto de saída derrubava o lote ----------

   max_tokens não é só o tamanho máximo da resposta: o provedor RESERVA esse
   número do orçamento do minuto no instante do pedido, antes de saber o quanto
   o modelo vai escrever de fato.

   Com teto fixo de 8000 e limite de 8000 tokens por minuto nesta conta, um
   único pedido de quatro leads reservava o minuto inteiro. O bloco seguinte
   era recusado sem ter mandado nada, e o erro parecia falar do tamanho da
   entrada — que era pequena. Quatro dos vinte lidos, dezesseis em branco.

   Agora o teto acompanha o tamanho do bloco: quatro leads escrevem quatro
   itens, não vinte. O piso de 700 existe porque JSON truncado é pior do que
   JSON nenhum — o lote inteiro cai em "Outros" sem explicação —, e o topo de
   4000 cobre o lote grande de quem não usa blocos. */
function tetoDeSaida(tipo: string, quantos = 0): number {
  if (tipo === 'reuniao' || tipo === 'notas') return 8000;
  if (tipo === 'segmentos') {
    /* 260 por lead era a conta do texto de saída, e estava certa para um
       modelo que só escreve. Os gpt-oss não são: eles gastam tokens
       raciocinando ANTES de escrever, e esse gasto sai do mesmo teto. Com
       1040 para quatro leads, o modelo esgotava o orçamento pensando e
       devolvia geração vazia — o provedor respondia json_validate_failed, que
       parece erro de prompt e não é.

       500 por lead com piso de 2000 cobre o raciocínio e ainda fica muito
       abaixo dos 8000 fixos que reservavam o minuto inteiro. */
    if (!quantos) return 4000;
    return Math.min(Math.max(quantos * 500, 2000), 5000);
  }
  if (tipo === 'plano' || tipo === 'desenvolvimento') return 4000;
  return 2500;
}

async function chamarIA(sistema: string, usuario: string, teto: number, rapido = false): Promise<string> {
  const escolhido = (rapido && MODELO_RAPIDO) ? MODELO_RAPIDO : MODELO;

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
        model: escolhido || 'claude-haiku-4-5',
        max_tokens: teto,
        system: sistema,
        messages: [{ role: 'user', content: usuario }]
      })
    });
    if (!r.ok) throw new Error(await explicarRecusa(r, escolhido || 'claude-haiku-4-5'));
    const j = await r.json();
    return (j?.content || []).map((b: { text?: string }) => b.text || '').join('');
  }

  /* Groq — API compatível com o formato OpenAI. */
  /* Sem segredo definido, o padrão do código. Ele também envelhece — este
     mesmo lugar já teve um nome que morreu —, e é por isso que a troca
     automática abaixo existe: o padrão é um palpite, não uma garantia. */
  let modelo = escolhido || 'openai/gpt-oss-120b';

  const pedir = (comJson: boolean) => {
    const corpo: Record<string, unknown> = {
      model: modelo,
      temperature: 0.1,
      max_tokens: teto,
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: usuario }
      ]
    };
    if (comJson) corpo.response_format = { type: 'json_object' };
    return fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + CHAVE, 'content-type': 'application/json' },
      body: JSON.stringify(corpo)
    });
  };

  let r = await pedir(true);
  /* Nem todo modelo aceita o modo JSON — os agênticos da Groq (compound) e
     alguns outros recusam o parâmetro com 400. Recusar por causa disso seria
     tirar do usuário justamente os modelos com limite de tokens mais folgado,
     que são a saída de quem estoura o limite. Sem o parâmetro o modelo ainda
     responde JSON, porque a instrução pede — e o que vem torto já era
     descartado antes deste commit. */
  let comJson = true;
  if (r.status === 400) {
    const aviso = await r.clone().text().catch(() => '');

    /* Dois 400 diferentes chegam pelo mesmo caminho e pedem a mesma saída.
       Um é o modelo que não aceita o parâmetro de modo JSON. O outro é
       json_validate_failed com failed_generation vazio: o modelo aceitou o
       modo, gastou o teto raciocinando e não escreveu nada — e o provedor
       chama isso de "ajuste o seu prompt", que manda procurar no lugar
       errado. Nos dois casos, refazer sem o modo JSON resolve: a instrução
       já pede JSON, e o que vem torto o validador descarta. */
    const modoRecusado = /response_format|json_object|json mode/i.test(aviso);
    const geracaoVazia = /json_validate_failed/i.test(aviso);
    if (modoRecusado || geracaoVazia) {
      comJson = false;
      r = await pedir(false);
    }
  }

  /* 404 no endpoint de chat quer dizer uma coisa só: o modelo pedido não
     existe. Em vez de devolver isso ao vendedor, troca por um que exista e
     refaz. Uma vez só — se o substituto também falhar, o problema não é o
     nome do modelo e insistir esconderia a causa de verdade. */
  if (r.status === 404) {
    const outro = await modeloSubstituto(rapido, modelo);
    if (outro) {
      modelo = outro;
      r = await pedir(comJson);
      if (r.status === 400) {
        const aviso = await r.clone().text().catch(() => '');
        if (/response_format|json_object|json mode/i.test(aviso)) { comJson = false; r = await pedir(false); }
      }
    }
  }

  /* Material grande demais deixou de ser problema do vendedor. Ele anexou o
     que tinha da reunião; pedir que "analise menos documentos de uma vez" é
     transferir para ele uma conta de tokens que ele não tem como fazer. O
     material é cortado pela metade e o pedido refeito, duas vezes — e o corte
     cai no material, nunca no retrato, que é pequeno e é o que sustenta as
     oito notas. */
  for (const fator of [0.5, 0.25]) {
    if (r.ok) break;
    const aviso = await r.clone().text().catch(() => '');
    if (!recusouPorTamanho(r.status, aviso)) break;
    const menor = encurtar(usuario, fator);
    if (menor === usuario) break;
    usuario = menor;
    r = await pedir(comJson);
  }

  if (!r.ok) throw new Error(await explicarRecusa(r, modelo));
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || '';
}

/* Comparação exata derrubava respostas certas. A lista tem "Alimentos"; o
   modelo responde "Alimentos e Bebidas", "Indústria de alimentos", "ALIMENTOS"
   — e nada disso batia, então o segmento ficava vazio com o catálogo cheio na
   tela ao lado. O modelo estava acertando e a validação recusando.

   Três tentativas, da mais estrita para a mais frouxa, e todas continuam
   presas ao catálogo: o valor que sai daqui é sempre um item da lista, nunca
   o que o modelo escreveu. Afrouxar a comparação não é afrouxar a regra.

   O que não fazemos é adivinhar por semelhança vaga: "Bebidas" não vira
   "Alimentos" só porque são parecidos. Sem correspondência, fica vazio — que
   é a resposta honesta quando nenhuma gaveta serve. */
function melhorOpcao(valor: string, opcoes: string[]): string {
  const t = semAcento(valor).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || !opcoes.length) return '';

  const normal = opcoes.map((o) => ({
    o,
    n: semAcento(o).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  }));

  const igual = normal.find((x) => x.n === t);
  if (igual) return igual.o;

  /* Um contém o outro por inteiro: "alimentos" dentro de "industria de
     alimentos", ou "acucar etanol e bioenergia" quando o modelo devolveu
     "acucar e etanol". Palavra inteira, para "cor" não casar com "corrosao". */
  const dentro = normal.find((x) => {
    const re = (p: string) => new RegExp('(^| )' + p.replace(/ /g, ' ') + '( |$)');
    return re(x.n).test(t) || re(t).test(x.n);
  });
  if (dentro) return dentro.o;

  /* Última tentativa: a primeira palavra significativa em comum. Pega
     "Alimentos e Bebidas" → "Alimentos", e recusa quando nada coincide.

     Quatro letras e não cinco por causa de "Óleo e Gás": com cinco, nenhuma
     palavra dele passava e um segmento óbvio caía fora. Quatro exige a lista
     de palavras vazias — sem ela, "para" e "pela" casariam com qualquer
     coisa. */
  const VAZIAS = ['para', 'pela', 'pelo', 'como', 'onde', 'esta', 'este', 'isso',
                  'mais', 'menos', 'todo', 'toda', 'seus', 'suas', 'entre'];
  const palavras = t.split(' ')
    .filter((p) => p.length >= 4 && VAZIAS.indexOf(p) === -1);
  for (const p of palavras) {
    const acha = normal.find((x) => new RegExp('(^| )' + p + '( |$)').test(x.n));
    if (acha) return acha.o;
  }
  return '';
}

/* A segunda passada viu tudo o que a primeira viu, mais o site e a Receita.
   Então ela manda no que preencheu; onde ficou vazia, fica o que a primeira
   tinha achado — o dossiê às vezes traz o telefone do contato que o site não
   publica. */
function juntarPassadas(
  primeira: Record<string, unknown>,
  segunda: Record<string, unknown>
): Record<string, unknown> {
  const saida: Record<string, unknown> = { ...primeira };
  for (const [k, v] of Object.entries(segunda)) {
    if (v == null || v === '') continue;
    if (k === 'frases' && saida.frases && typeof saida.frases === 'object') {
      saida.frases = { ...(saida.frases as Record<string, unknown>), ...(v as Record<string, unknown>) };
      continue;
    }
    saida[k] = v;
  }
  return saida;
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
      const achado = melhorOpcao(limparTexto(v, 160), regra.opcoes || []);
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

  const saidaFinal: Record<string, unknown> = { campos: saida, frases: frases };
  if (tipo === 'conta' || tipo === 'oportunidade') {
    saidaFinal.contatos = validarContatos(bruto.contatos, ctx);
  }
  /* A oportunidade traz junto a ficha da empresa. Quem descreve um negócio
     descreve o cliente no mesmo fôlego — e obrigar a cadastrar a empresa numa
     tela, os contatos noutra e o negócio numa terceira é transformar um gesto
     em três. Validada com as regras da conta: mesmos limites, mesma lista
     fechada de segmento, mesma recusa de invenção. */
  if (tipo === 'oportunidade' && bruto.empresa && typeof bruto.empresa === 'object') {
    const daEmpresa = validar('conta', bruto.empresa as Record<string, unknown>, ctx);
    const campos = (daEmpresa as { campos: Record<string, string> }).campos;
    if (campos && campos.nome) saidaFinal.empresa = campos;
  }
  return saidaFinal;
}

/* As pessoas da empresa cliente citadas no material. Vêm junto da conta porque
   é junto que elas aparecem: um dossiê de reunião traz o nome, o cargo e o
   e-mail de quem respondeu, e obrigar o vendedor a redigitar isso depois é a
   maneira mais certa de nunca ter grupo comprador cadastrado.

   Duas recusas importam mais que a extração. A primeira: gente da nossa
   equipe. Todo material nosso é assinado por nós, e sem esta linha a lista
   viria cheia de colegas do próprio vendedor. A segunda: e-mail inventado —
   só entra o que estiver escrito, porque e-mail errado num CRM é pior que
   e-mail nenhum: alguém escreve para o vazio e acha que falou. */
function validarContatos(bruto: unknown, ctx: Record<string, unknown>): Record<string, string>[] {
  if (!Array.isArray(bruto)) return [];
  const nosso = String(ctx.nossoDominio || '').toLowerCase();
  const jaTem = (Array.isArray(ctx.contatos) ? ctx.contatos : []).map((n) => semAcento(String(n)));

  const saida: Record<string, string>[] = [];
  for (const item of bruto.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const nome = limparTexto(c.nome, 80);
    if (!nome || nome.split(/\s+/).length < 2) continue;   /* "Aline" sozinho não é contato */

    const email = limparTexto(c.email, 120).toLowerCase();
    const valido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '';
    if (valido && nosso && valido.endsWith('@' + nosso)) continue;   /* somos nós */
    if (jaTem.indexOf(semAcento(nome)) !== -1) continue;   /* já cadastrado nesta conta */

    saida.push({
      nome: nome,
      cargo: limparTexto(c.cargo, 80),
      email: valido,
      telefone: limparTexto(c.telefone, 24),
      area: limparTexto(c.area, 60)
    });
    if (saida.length >= 8) break;
  }
  return saida;
}

/* Uma reunião vira uma lista. Cada item passa pelas mesmas regras da
   evidência avulsa: dimensão fora das oito, força fora das três ou data
   inventada são descartadas, não repassadas ao vendedor. */
function validarReuniao(bruto: Record<string, unknown>, ctx: Record<string, unknown>, entrada: string) {
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
    /* Os campos de ficha. Passam pelas mesmas listas fechadas de sempre —
       sentimento inventado mudaria a cor do grupo comprador, e influência
       fora de 1..3 quebraria a conta da cobertura. */
    const email = limparTexto(c.email, 120);
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) registro.email = email;
    const telefone = limparTexto(c.telefone, 40);
    if (telefone) registro.telefone = telefone;
    const sentimento = SENTIMENTOS.find((x) => x === limparTexto(c.sentimento, 20).toLowerCase());
    if (sentimento) registro.sentimento = sentimento;
    const influencia = String(Math.floor(Number(c.influencia)));
    if (['1', '2', '3'].indexOf(influencia) !== -1) registro.influencia = influencia;
    contatos.push(registro);
  }

  /* As oito vêm na mesma resposta desde que o limite de uso do provedor
     mostrou que duas chamadas por tarefa é uma a mais do que cabe. Passam
     pela mesma validação de sempre, inclusive a exigência do trecho literal:
     a economia é de chamada, não de rigor. */
  const notas = validarNotas(bruto, entrada || '');

  return {
    evidencias: evidencias,
    contatos: contatos,
    empresa: validarFichaDaEmpresa(bruto.empresa),
    negocio: validarNegocio(bruto.negocio, ctx, hoje),
    decisoes: notas.decisoes || []
  };
}

/* A ficha da empresa que o material revelou. Vai completar campos VAZIOS da
   conta — o app nunca sobrescreve o que alguém digitou —, e por isso o rigor
   aqui é de tamanho e de existência, não de lista fechada: descrição e
   necessidades são texto livre por natureza. O segmento fica de fora de
   propósito: ele agrupa o painel inteiro e tem validação própria. */
function validarFichaDaEmpresa(bruto: unknown) {
  if (!bruto || typeof bruto !== 'object') return {};
  const e = bruto as Record<string, unknown>;
  const saida: Record<string, string> = {};
  const por = [
    ['descricao', 600], ['necessidades', 600], ['porte', 40], ['cidade', 80],
    ['uf', 4], ['site', 160], ['telefone', 40], ['cnpj', 20]
  ] as [string, number][];
  for (const [campo, max] of por) {
    const v = limparTexto(e[campo], max);
    if (v) saida[campo] = v;
  }
  return saida;
}

/* O que o material diz sobre o negócio: valor, etapa, previsão, concorrentes.

   Tudo aqui muda o que o dono da empresa vê no painel — o valor entra no
   pipeline, a etapa muda a coluna do funil. Então nada passa sem conferência:
   valor tem de ser número positivo e plausível, etapa tem de existir na lista
   do app (o modelo não inventa coluna nova), previsão tem de ser data futura.
   E cada um só é aceito com o trecho literal que o sustenta: sem citação, o
   modelo está deduzindo, e dedução não move pipeline. */
function validarNegocio(bruto: unknown, ctx: Record<string, unknown>, hoje: string) {
  if (!bruto || typeof bruto !== 'object') return {};
  const n = bruto as Record<string, unknown>;
  const saida: Record<string, unknown> = {};

  const valor = Number(String(n.valor ?? '').replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  const valorFrase = limparTexto(n.valorFrase, 200);
  if (isFinite(valor) && valor > 0 && valor < 1e12 && valorFrase) {
    saida.valor = valor;
    saida.valorFrase = valorFrase;
  }

  const etapas = Array.isArray(ctx.etapas) ? ctx.etapas.map(String) : [];
  const etapa = etapas.find((e) => e.toLowerCase() === limparTexto(n.etapa, 40).toLowerCase());
  const etapaFrase = limparTexto(n.etapaFrase, 200);
  if (etapa && etapaFrase) {
    saida.etapa = etapa;
    saida.etapaFrase = etapaFrase;
  }

  /* Previsão é a única data que pode — e deve — estar no futuro. */
  const previsao = limparTexto(n.previsao, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(previsao) && previsao >= hoje) saida.previsao = previsao;

  const concorrentes = limparTexto(n.concorrentes, 200);
  if (concorrentes) saida.concorrentes = concorrentes;

  return saida;
}

/* Um lote de empresas classificadas. Segmento fora da lista do tenant vira
   "Outros" — nunca um nome novo, que quebraria o agrupamento do painel. */
/* As contas que o app já tem e que podem ser a mesma empresa do lead. Vêm
   filtradas de lá: só as que compartilham palavra ou domínio com algum lead
   do lote, no máximo 40. Aqui a lista só é limpa e limitada de novo, porque
   quem chama a função não é necessariamente o app. */
function contasDoTenant(ctx: Record<string, unknown>): Array<Record<string, string>> {
  const bruto = Array.isArray(ctx.contas) ? ctx.contas : [];
  return bruto.slice(0, 40).map((x) => {
    const o = (x && typeof x === 'object') ? x as Record<string, unknown> : {};
    return {
      id: limparTexto(o.id, 40),
      nome: limparTexto(o.nome, 120),
      site: limparTexto(o.site, 120),
      cidade: limparTexto(o.cidade, 80),
      segmento: limparTexto(o.segmento, 80)
    };
  }).filter((c) => c.id && c.nome);
}

function descreverContas(ctx: Record<string, unknown>): string {
  return contasDoTenant(ctx).map((c) => {
    const detalhe = [
      c.site ? 'site: ' + c.site : '',
      c.cidade,
      c.segmento
    ].filter(Boolean).join(' · ');
    return '- ' + c.nome + (detalhe ? ' (' + detalhe + ')' : '');
  }).join('\n');
}

function validarSegmentos(bruto: Record<string, unknown>, ctx: Record<string, unknown>) {
  const nomes = segmentosDoTenant(ctx).map((s) => s.nome);
  const contas = contasDoTenant(ctx);
  const validos = nomes.concat(['Outros']);
  const papeis = (Array.isArray(ctx.papeis) ? ctx.papeis.map(String) : []);
  const confiancas = ['alta', 'media', 'baixa'];
  const brutos = Array.isArray(bruto.itens) ? bruto.itens : [];
  const itens: Array<Record<string, string | number>> = [];

  /* Casar o nome que o modelo devolveu com o nome que está no catálogo.

     Três níveis, do mais seguro ao mais frouxo, e cada um existe por um erro
     que aconteceu:

     1. Igual depois de achatar. "Químicos" contra "Quimicos" é a mesma coisa
        para qualquer pessoa e eram duas coisas diferentes para este código:
        ele comparava só com toLowerCase, e acento em português está em
        Químicos, Serviços, Construção, Saneamento — quase metade de um
        catálogo típico. Uma classificação certa virava "Outros" por causa de
        um til.

     2. Um contém o outro. "Alimentos e Bebidas" quando a lista diz
        "Alimentos": o modelo acertou o segmento e errou a cópia.

     3. Palavra em comum, comparada pela raiz. "Indústria Química" contra
        "Químicos" não passa por substring nenhuma — nenhuma das duas contém a
        outra — e é o mesmo segmento; o que separa as duas é o gênero da
        palavra. A raiz corta um "s" final e uma vogal final, o que junta
        química/químicos e metalúrgica/metalurgia sem juntar petróleo com
        petroquímico. Cinco letras no mínimo, para não casar por "de" e "da". */
  const casar = (valor: unknown, lista: string[]): string => {
    const t = achatar(limparTexto(valor, 80));
    if (!t) return '';
    const achatados = lista.map((v) => ({ original: v, chave: achatar(v) }));

    const exato = achatados.find((v) => v.chave === t);
    if (exato) return exato.original;

    const contido = achatados.find((v) =>
      v.chave.length >= 4 && t.length >= 4 && (t.indexOf(v.chave) !== -1 || v.chave.indexOf(t) !== -1));
    if (contido) return contido.original;

    const raiz = (w: string): string => {
      let r = w;
      if (r.length > 5 && r.slice(-1) === 's') r = r.slice(0, -1);
      if (r.length > 4 && 'aeiou'.indexOf(r.slice(-1)) !== -1) r = r.slice(0, -1);
      return r;
    };
    const palavras = t.split(' ').filter((w) => w.length >= 5).map(raiz);
    const porPalavra = achatados.find((v) => {
      const dele = v.chave.split(' ').filter((w) => w.length >= 5).map(raiz);
      return dele.some((w) => palavras.some((x) => x === w ||
        (x.length >= 5 && w.length >= 5 && (x.indexOf(w) === 0 || w.indexOf(x) === 0))));
    });
    return porPalavra ? porPalavra.original : '';
  };

  for (const item of brutos.slice(0, 100)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const n = Number(o.n);
    if (!isFinite(n) || n < 1) continue;

    const segmento = casar(o.segmento, validos) || 'Outros';
    const maisProximo = casar(o.maisProximo, nomes);
    const confianca = confiancas.find((c) => c === limparTexto(o.confianca, 10).toLowerCase()) || '';

    /* Papel fora da lista do sistema não entra: viraria um papel novo no
       grupo comprador, e a cobertura de papéis críticos é contada por
       igualdade exata. Sem correspondência, o padrão neutro. */
    const papel = papeis.find((v) => v.toLowerCase() === limparTexto(o.papel, 60).toLowerCase()) || '';

    /* Aqui a régua é a mais dura das três desta função, e de propósito: o
       nome tem de bater EXATAMENTE depois de achatar. Nada de "um contém o
       outro" nem de raiz de palavra — foi justamente o casamento frouxo que
       juntou "Vale" com "Valentina Alimentos" do lado do app.

       Juntar duas empresas erradas põe o contato de uma no grupo comprador da
       outra, em silêncio. Não juntar cria uma conta a mais, que se funde
       depois. Diante de dúvida, a resposta certa é não juntar. */
    const contaCasada = contas.find((c) => achatar(c.nome) === achatar(limparTexto(o.contaExistente, 120)));

    /* Três valores e nada mais. Vazio quando o modelo inventar um quarto: o
       app tem a própria regra de recusa e ela continua valendo sozinha. */
    const resposta = ['positiva', 'negativa', 'neutra']
      .find((v) => v === achatar(limparTexto(o.resposta, 20))) || '';

    itens.push({
      n: n,
      segmento: segmento,
      confianca: confianca,
      porque: limparTexto(o.porque, 120),
      /* Só faz sentido junto de "Outros": é o que o vendedor aceita num
         clique em vez de abrir a lista inteira e comparar de novo. */
      maisProximo: segmento === 'Outros' ? maisProximo : '',
      papel: papel,
      /* O insight é rascunho nosso, e curto de propósito: o que não cabe em
         três linhas o vendedor não fala numa ligação. */
      insight: limparTexto(o.insight, 400),
      /* Devolve o id, não o nome: é o id que o app usa para achar a conta, e
         mandar o nome de volta obrigaria o app a casar por texto outra vez —
         exatamente o problema que esta pergunta existe para resolver. */
      contaExistente: contaCasada ? contaCasada.id : '',
      porqueConta: contaCasada ? limparTexto(o.porqueConta, 100) : '',
      resposta: resposta,
      porqueRecusa: resposta === 'negativa' ? limparTexto(o.porqueRecusa, 120) : ''
    });
  }
  return { itens: itens };
}

/* As oito notas propostas. Duas travas aqui, além da que o app aplica depois:
   nota fora de 0..2 é descartada, e nota maior que zero sem trecho literal
   cai para zero — se o modelo não consegue apontar onde o cliente disse, ele
   está inferindo, e inferência não pontua decisão. */
/* O plano de desenvolvimento. A validação aqui é de forma, não de conteúdo:
   texto livre não dá para conferir contra uma lista fechada. O que dá para
   impor é o tamanho — três mudanças, não dez — e que cada mudança traga o
   porquê e o como medir, que é o que separa plano de conselho solto. */
function validarDesenvolvimento(bruto: Record<string, unknown>) {
  const frases = (v: unknown, quantas: number) =>
    (Array.isArray(v) ? v : []).map((x) => limparTexto(x, 240)).filter(Boolean).slice(0, quantas);

  const brutas = Array.isArray(bruto.mudancas) ? bruto.mudancas : [];
  const mudancas = [];
  for (const item of brutas.slice(0, 6)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const acao = limparTexto(o.acao, 220);
    if (!acao) continue;
    mudancas.push({
      acao,
      porque: limparTexto(o.porque, 240),
      medir: limparTexto(o.medir, 200)
    });
    if (mudancas.length === 3) break;
  }

  return {
    leitura: limparTexto(bruto.leitura, 400),
    indoBem: frases(bruto.indoBem, 4),
    indoMal: frases(bruto.indoMal, 4),
    mudancas
  };
}

/* Casar a citação com o texto que a gerou.

   A versão anterior normalizava só o palheiro e comparava com a agulha crua.
   Aspas curvas, reticências unicode, travessão e acento passavam batido, e
   qualquer um deles nos primeiros 40 caracteres derrubava a nota. Agora as
   duas pontas passam pela mesma peneira — e a busca tenta dois pedaços da
   citação, porque o modelo às vezes acerta o miolo e erra o começo. */
function achatar(t: string): string {
  return String(t || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().toLowerCase();
}

function citacaoExiste(trecho: string, textoOriginal: string): boolean {
  const alvo = achatar(trecho);
  if (alvo.length < 12) return false;
  const fonte = achatar(textoOriginal);
  if (fonte.indexOf(alvo.slice(0, 40)) !== -1) return true;
  /* o miolo, para quando o modelo enfeitou o começo da citação */
  if (alvo.length >= 60 && fonte.indexOf(alvo.slice(20, 60)) !== -1) return true;
  return false;
}

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
    if (!isFinite(nota) || nota < 0 || nota > 4) continue;
    nota = Math.floor(nota);

    const trecho = limparTexto(o.trecho, 240);
    const citaDeVerdade = citacaoExiste(trecho, textoOriginal);
    /* Sem citação literal, o teto é 1 — não 0.

       Era 0, e essa era a trava que zerava carteira inteira. Ela tratava
       "não consegui casar a citação" como "o cliente não disse nada", e as
       duas coisas não são a mesma. O modelo cita com aspa curva, com
       reticências, com um acento a menos, ou de um pedaço que o corte de
       tamanho comeu — e a decisão inteira caía para "Não sabemos" num
       documento onde o problema estava escrito com todas as letras.

       Um sinal que o modelo leu e não consegue apontar com o dedo é
       exatamente a definição do degrau 1 da escada: quem afirma somos nós,
       não o cliente. Então vira 1. Do degrau 2 para cima continua exigindo
       citação literal
       AQUI e, no app, evidência confirmada ou documentada — duas travas
       independentes, que é onde o rigor tem de estar. */
    if (nota > 1 && !citaDeVerdade) nota = 1;

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
async function textoDoSite(dominio: string, caminho = '/', limite = 1200): Promise<string> {
  const limpo = String(dominio || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(limpo)) return '';
  const controle = new AbortController();
  const corta = setTimeout(() => controle.abort(), 4000);
  try {
    const r = await fetch('https://' + limpo + caminho, {
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
      .slice(0, limite);
  } catch {
    return '';
  } finally {
    clearTimeout(corta);
  }
}

/* ---------- buscar o que o documento não tem ----------
   Dossiê interno fala de dor, projeto e concorrente; não fala do CNPJ nem do
   endereço da empresa. Antes o formulário ficava com três campos preenchidos e
   o vendedor ia catar o resto à mão — que é o trabalho que este app existe
   para evitar.

   A regra que sustenta tudo aqui: só entra o que veio de uma fonte de verdade.
   O site oficial e a Receita Federal são fontes; o modelo não é. Ele nunca
   inventa CNPJ — quando o número aparece, veio do rodapé do site da empresa ou
   da consulta pública, e o endereço vem da Receita, não de um palpite. */

/* Dígitos verificadores. Sem isto, qualquer sequência de 14 números no texto
   — número de nota, protocolo, código de barras — vira CNPJ. */
function cnpjValido(bruto: string): boolean {
  const n = String(bruto || '').replace(/\D/g, '');
  if (n.length !== 14 || /^(\d)\1{13}$/.test(n)) return false;
  const digito = (ate: number) => {
    let soma = 0, peso = ate - 7;
    for (let i = 0; i < ate; i++) {
      soma += Number(n[i]) * peso;
      peso = peso - 1 < 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digito(12) === Number(n[12]) && digito(13) === Number(n[13]);
}

function acharCnpj(texto: string): string {
  const achados = String(texto || '').match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g) || [];
  for (const a of achados) {
    if (cnpjValido(a)) return a.replace(/\D/g, '');
  }
  return '';
}

/* Domínios citados no próprio material. Vêm do documento, não do modelo — é o
   que garante que não estamos lendo o site de outra empresa de nome parecido.
   Fora os que não são da empresa: rede social, buscador, encurtador, e o nosso
   próprio, que aparece em toda proposta que nós mesmos escrevemos. */
const DOMINIO_ALHEIO = /(linkedin|facebook|instagram|twitter|x\.com|youtube|google|gmail|hotmail|outlook|yahoo|uol|terra|bol|bit\.ly|whatsapp|wa\.me|sharepoint|onedrive|zoom|teams|biowatercare|biopartners)/i;

function semAcento(t: string): string {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/* Onde o domínio de fato aparece num dossiê comercial: na assinatura de e-mail.
   Ninguém escreve "o site deles é tal" num documento interno, mas todo mundo
   copia o endereço de quem respondeu — e o e-mail corporativo carrega o
   domínio da empresa. Procurar só por URL escrita era procurar no lugar errado,
   e foi por isso que a busca não saía do lugar com material real.

   Ordenar importa tanto quanto achar: um dossiê cita também o e-mail do
   fornecedor e o do parceiro. Ganha o domínio que se parece com o nome da
   empresa — de todos os e-mails de um documento da Marilan, marilan.com é o
   único que é dela. */
function dominiosNoTexto(texto: string, nomeEmpresa = ''): string[] {
  const bruto = String(texto || '');
  const deEmail = (bruto.match(/[\w.+-]+@([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi) || [])
    .map((e) => e.split('@')[1]);
  const deUrl = (bruto
    .match(/\b(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]{1,60}\.(?:com\.br|ind\.br|net\.br|agr\.br|com|net|org|io|co)(?:\.[a-z]{2})?)\b/gi) || [])
    .map((d) => d.replace(/^https?:\/\//i, '').replace(/^www\./i, ''));

  const limpos = Array.from(new Set(
    deEmail.concat(deUrl).map((d) => d.toLowerCase()).filter((d) => !DOMINIO_ALHEIO.test(d))
  ));

  /* Nome da empresa reduzido à primeira palavra com letra: "Marilan Alimentos
     S.A." vira "marilan", que é o que se procura dentro do domínio. */
  const chave = semAcento(nomeEmpresa).replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/)[0] || '';

  const pontuado = limpos.map((d) => {
    const rotulo = d.split('.')[0];
    let nota = 0;
    if (chave.length >= 4 && (rotulo.indexOf(chave) !== -1 || chave.indexOf(rotulo) !== -1)) nota += 10;
    if (/\.com\.br$|\.ind\.br$/.test(d)) nota += 2;   /* empresa brasileira publica CNPJ no .br */
    return { d, nota };
  }).sort((a, b) => b.nota - a.nota);

  const escolhidos = pontuado.map((x) => x.d).slice(0, 2);

  /* Muita empresa brasileira tem os dois, e o .com.br costuma ser o site
     institucional com o rodapé completo. Custa uma tentativa. */
  const primeiro = escolhidos[0];
  if (primeiro && /\.com$/.test(primeiro)) {
    const irmao = primeiro.replace(/\.com$/, '.com.br');
    if (escolhidos.indexOf(irmao) === -1) escolhidos.push(irmao);
  }

  /* E quando o material não traz e-mail nem site — acontece com ata de
     reunião — o nome sozinho já dá para tentar. Empresa brasileira quase
     sempre está em <nome>.com.br. Isto é chute, e por isso não vale nada
     sozinho: o que o torna seguro é a conferência lá na frente, que só aceita
     a página se ela falar o nome da empresa. Chutar e conferir é diferente de
     inventar. */
  if (chave.length >= 4) {
    for (const palpite of [chave + '.com.br', chave + '.com', chave + '.ind.br']) {
      if (escolhidos.indexOf(palpite) === -1) escolhidos.push(palpite);
    }
  }
  return escolhidos.slice(0, 5);
}

/* Busca de verdade, quando o palpite não achou. Sem chave de API: o DuckDuckGo
   tem uma página HTML que responde a qualquer um. É frágil por natureza — pode
   mudar de formato, pode bloquear — e por isso vem por último e falha calada.
   O que sai daqui é candidato, não resposta: passa pela mesma conferência que
   tudo o mais, e só entra se a página falar o nome da empresa. */
async function dominiosPelaBusca(nome: string): Promise<string[]> {
  const termo = String(nome || '').trim();
  if (termo.length < 3) return [];
  const controle = new AbortController();
  const corta = setTimeout(() => controle.abort(), 5000);
  try {
    const r = await fetch('https://html.duckduckgo.com/html/?q=' +
      encodeURIComponent(termo + ' empresa site oficial'), {
      signal: controle.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; IAD-CRM/1.0)',
        'accept-language': 'pt-BR,pt;q=0.9'
      }
    });
    if (!r.ok) return [];
    const html = await r.text();

    /* Os resultados vêm embrulhados: /l/?uddg=<url codificada>. Também
       aceitamos href direto, porque o formato já mudou antes. */
    const brutos: string[] = [];
    for (const m of html.matchAll(/uddg=([^&"']+)/g)) {
      try { brutos.push(decodeURIComponent(m[1])); } catch { /* ignora */ }
    }
    for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) brutos.push(m[1]);

    const dominios = brutos
      .map((u) => u.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase())
      .filter((d) => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d))
      .filter((d) => !DOMINIO_ALHEIO.test(d) && !/duckduckgo|wikipedia|reclameaqui|glassdoor|indeed|jusbrasil|econodata|cnpj|empresas|gov\.br/i.test(d));

    return Array.from(new Set(dominios)).slice(0, 4);
  } catch {
    return [];
  } finally {
    clearTimeout(corta);
  }
}

/* Consulta pública da Receita. Devolve texto pronto para o modelo ler, com a
   origem escrita: sem isso ele mistura o que veio da Receita com o que leu no
   dossiê, e some a diferença entre dado oficial e anotação de vendedor. */
async function dadosDaReceita(cnpj: string): Promise<string> {
  const controle = new AbortController();
  const corta = setTimeout(() => controle.abort(), 5000);
  try {
    const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + cnpj, { signal: controle.signal });
    if (!r.ok) return '';
    const j = await r.json();
    const partes = [
      j.razao_social ? 'Razão social: ' + j.razao_social : '',
      j.nome_fantasia ? 'Nome fantasia: ' + j.nome_fantasia : '',
      'CNPJ: ' + cnpj,
      j.cnae_fiscal_descricao ? 'Atividade principal: ' + j.cnae_fiscal_descricao : '',
      [j.descricao_tipo_de_logradouro, j.logradouro, j.numero, j.complemento]
        .filter(Boolean).join(' ').trim(),
      j.bairro || '',
      [j.municipio, j.uf].filter(Boolean).join(' / '),
      j.cep ? 'CEP ' + j.cep : '',
      j.ddd_telefone_1 ? 'Telefone: ' + j.ddd_telefone_1 : '',
      j.descricao_situacao_cadastral ? 'Situação: ' + j.descricao_situacao_cadastral : ''
    ].filter(Boolean);
    return partes.length ? '[Receita Federal, consulta pública]\n' + partes.join('\n') : '';
  } catch {
    return '';
  } finally {
    clearTimeout(corta);
  }
}

/* Junta ao material o que dá para buscar. Nunca substitui o documento: soma,
   com a origem escrita em cada bloco. */
async function enriquecerConta(texto: string, siteConhecido: string, nome: string): Promise<string> {
  const dominios = dominiosNoTexto(siteConhecido + ' ' + texto, nome);
  const paginas: string[] = [];
  const chave = semAcento(nome).replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/)[0] || '';

  for (const d of dominios) {
    if (paginas.length >= 2) break;
    /* Rodapé é onde mora o CNPJ, e ele está no fim do HTML: por isso o limite
       aqui é grande, e as páginas institucionais entram junto. */
    const [inicio, contato, sobre] = await Promise.all([
      textoDoSite(d, '/', 6000),
      textoDoSite(d, '/contato', 6000),
      textoDoSite(d, '/institucional', 4000)
    ]);
    const junto = (inicio + ' ' + contato + ' ' + sobre).trim();
    if (!junto) continue;

    /* A prova de que é o site certo: a página fala o nome da empresa. É ela
       que sustenta o palpite — sem esta linha, tentar <nome>.com.br viraria
       ler o site de quem por acaso tem aquele domínio, e o CNPJ de outra
       empresa é pior do que CNPJ nenhum. Sem nome para conferir, só entram
       domínios que vieram escritos no material. */
    if (chave.length >= 4) {
      if (semAcento(junto).indexOf(chave) === -1) continue;
    } else if (!(siteConhecido + ' ' + texto).toLowerCase().includes(d)) {
      continue;
    }

    paginas.push('[site ' + d + ']\n' + junto.slice(0, 5000));
  }

  /* Nada aceito até aqui quer dizer que o material não trouxe o domínio e o
     palpite não colou. Aí sim vale sair para a internet. Deixar isso por
     último não é timidez: buscar custa segundos e traz ruído, e na maioria
     dos casos o e-mail no rodapé do documento já resolveu. */
  if (!paginas.length && chave.length >= 3) {
    for (const d of await dominiosPelaBusca(nome)) {
      if (paginas.length >= 2) break;
      const [inicio, contato] = await Promise.all([
        textoDoSite(d, '/', 6000),
        textoDoSite(d, '/contato', 6000)
      ]);
      const junto = (inicio + ' ' + contato).trim();
      if (!junto || semAcento(junto).indexOf(chave) === -1) continue;
      paginas.push('[site ' + d + ', encontrado por busca]\n' + junto.slice(0, 5000));
    }
  }

  const cnpj = acharCnpj(texto + ' ' + paginas.join(' '));
  const receita = cnpj ? await dadosDaReceita(cnpj) : '';

  const extras = paginas.concat(receita ? [receita] : []);
  return extras.length ? texto + '\n\n' + extras.join('\n\n') : texto;
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

/* A recusa tem de dizer QUAL das quatro coisas falhou. Enquanto era um
   booleano, sessão vencida e chave de outro projeto davam a mesma frase — e a
   frase falava da chave pública, que na maioria das vezes estava certa. Quem
   lê "o formato é nova (publicável)" seguido de "se não for nova (publicável),
   faça X" fica sem nada para fazer. */
type Chamador = { ok: boolean; erro?: string; renove?: boolean };

async function conferirChamador(req: Request): Promise<Chamador> {
  if (!URL_SUPABASE) {
    return { ok: false, erro: 'A função não recebeu o endereço do projeto (SUPABASE_URL). ' +
      'Republique a função pelo painel do Supabase ou pela CLI.' };
  }
  if (!ANON) {
    return { ok: false, erro: 'Esta função não tem chave pública para conferir quem chama.\n\n' +
      'Settings → API Keys → copie a chave publishable. Depois Edge Functions → assistente → ' +
      'Secrets → crie IAD_CHAVE_PUBLICA com esse valor e publique a função de novo.' };
  }
  const formato = formatoDaChave(ANON);
  if (formato !== 'nova (publicável)') {
    return { ok: false, erro: 'A chave pública desta função é do formato ' + formato + '.\n\n' +
      'Settings → API Keys → copie a chave publishable (sb_publishable_...). Depois Edge ' +
      'Functions → assistente → Secrets → ponha esse valor em IAD_CHAVE_PUBLICA e publique ' +
      'a função de novo. Segredo trocado só vale no deploy seguinte.' };
  }

  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+/i.test(auth)) {
    return { ok: false, erro: 'O pedido chegou sem sessão. Saia e entre de novo no app.' };
  }

  let r: Response;
  try {
    r = await fetch(URL_SUPABASE + '/auth/v1/user', {
      headers: { apikey: ANON, authorization: auth }
    });
  } catch {
    return { ok: false, erro: 'A função não conseguiu falar com o serviço de login do próprio projeto.' };
  }

  if (r.ok) {
    const u = await r.json().catch(() => null);
    if (u && u.id) return { ok: true };
    return { ok: false, erro: 'O serviço de login respondeu sem identificar a pessoa.' };
  }

  /* Duas recusas muito diferentes chegam as duas como 401: a chave pública que
     esta função tem não vale neste projeto, ou o token de quem está usando
     venceu. A primeira é um segredo errado, a segunda passa com um F5. */
  const corpo = await r.text().catch(() => '');
  if (/api key|apikey|no key|matched no key/i.test(corpo)) {
    return { ok: false, erro: 'O IAD_CHAVE_PUBLICA desta função não vale neste projeto — ' +
      'o login recusou a chave, não a pessoa.\n\nConfira se ela foi copiada de Settings → ' +
      'API Keys DESTE projeto, e publique a função de novo depois de trocar o segredo.' };
  }
  return { ok: false, renove: true,
    erro: 'Sua sessão expirou. Saia e entre de novo — a chave da função está certa.' };
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
  /* Um 401 daqui tem quatro causas que não se parecem: falta o endereço do
     projeto, falta a chave pública, a chave é de formato ou de projeto errado,
     ou a sessão de quem está usando venceu. Dizer sempre a mesma coisa manda
     três dos quatro para o lugar errado. Formato, nunca a chave. */
  const quem = await conferirChamador(req);
  if (!quem.ok) {
    /* "token" no texto é o que faz o app tentar renovar a sessão sozinho antes
       de mostrar a recusa — e é justamente o caso em que renovar resolve. */
    return responder({ erro: quem.erro, token: !!quem.renove }, 401);
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
  const limite = (tipo === 'reuniao' || tipo === 'segmentos' || tipo === 'plano' || tipo === 'notas' ||
                  tipo === 'desenvolvimento')
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
      /* Alinhado por posição com os leads, e dito assim ao modelo: antes o
         texto do site entrava marcado só pelo domínio, e ele tinha de casar
         domínio com empresa sozinho — trabalho que dá errado justamente no
         lote grande, que é quando isto importa. Doze porque as buscas correm
         em paralelo com 4s de teto cada; o que passar disso o modelo resolve
         com a descrição do LinkedIn, que já vem na entrada. */
      /* O texto do site é a parte mais cara da entrada e a menos necessária:
         mil e duzentos caracteres por lead, num pedido cujo teto é oito mil
         tokens por minuto nesta conta. E na maioria das vezes ele repete o
         que a descrição do LinkedIn já disse.

         Então só busca o site de quem NÃO trouxe descrição — é para esse lead
         que a busca foi feita, o que ninguém conhece e cuja linha só tem o
         nome. Quem já veio descrito não paga por uma segunda fonte. */
      const semDescricao = Array.isArray(ctx.semDescricao) ? ctx.semDescricao : [];
      const dominios = (Array.isArray(ctx.dominios) ? ctx.dominios : []).slice(0, 12);
      const sites = await Promise.all(dominios.map(async (d, i) => {
        if (!d) return '';
        if (semDescricao.length && !semDescricao[i]) return '';
        const t = await textoDoSite(String(d), '/', 700);
        return t ? `\n[site do lead ${i + 1} — ${d}] ${t}` : '';
      }));
      entrada = texto + sites.join('');
    }

    /* Só a classificação de segmentos vai no modelo rápido. Reunião, notas,
       plano e desenvolvimento continuam no modelo bom, sempre. */
    const usaRapido = tipo === 'segmentos';

    /* Quantos leads vieram neste bloco. Sai da própria entrada — cada lead
       começa numa linha "1. ", "2. " —, e não de um campo que o app manda:
       assim o teto acompanha o que realmente foi pedido. */
    const quantosLeads = tipo === 'segmentos'
      ? (entrada.match(/^\d+\. /gm) || []).length
      : 0;

    let bruto = await chamarIA(promptDe(tipo, ctx), entrada, tetoDeSaida(tipo, quantosLeads), usaRapido);
    let json = lerJSON(bruto);

    /* Segunda passada para empresa, e só quando a primeira achou de quem se
       trata. Ordem importa: primeiro leio o documento e descubro o nome e o
       site; depois vou ao site e à Receita; depois releio tudo junto. Buscar
       antes seria buscar sem saber o quê.

       Custa uma chamada a mais e uns segundos. Vale: é a diferença entre três
       campos preenchidos e a ficha inteira — e o que entra na segunda vem do
       site oficial e da consulta pública, não do palpite do modelo. */
    if (tipo === 'conta' && json && !pedido.semBusca) {
      const nome = String((json as Record<string, unknown>).nome || '');
      const site = String((json as Record<string, unknown>).site || '');
      if (nome) {
        const comBusca = await enriquecerConta(entrada, site, nome);
        if (comBusca !== entrada) {
          const brutoDois = await chamarIA(promptDe(tipo, ctx), comBusca, tetoDeSaida(tipo, quantosLeads), usaRapido);
          const jsonDois = lerJSON(brutoDois);
          /* O que a segunda achou vence onde a primeira estava vazia, e vence
             também no que é dado oficial — razão social, CNPJ e endereço saem
             melhor da Receita do que de um dossiê comercial. */
          if (jsonDois) {
            bruto = brutoDois;
            json = juntarPassadas(json as Record<string, unknown>, jsonDois);
          }
        }
      }
    }
    /* JSON torto devolve vazio. Nunca dado inventado no formulário do vendedor. */
    if (!json) {
      if (tipo === 'reuniao') return responder({ evidencias: [], contatos: [], negocio: {}, decisoes: [] });
      if (tipo === 'segmentos') return responder({ itens: [] });
      if (tipo === 'plano') return responder({ passos: [], atencao: [] });
      if (tipo === 'notas') return responder({ decisoes: [] });
      if (tipo === 'desenvolvimento') return responder({ leitura: '', indoBem: [], indoMal: [], mudancas: [] });
      return responder({ campos: {}, frases: {} });
    }
    if (tipo === 'reuniao') return responder(validarReuniao(json, ctx, entrada));
    if (tipo === 'segmentos') return responder(validarSegmentos(json, ctx));
    if (tipo === 'plano') return responder(validarPlano(json));
    if (tipo === 'notas') return responder(validarNotas(json, entrada));
    if (tipo === 'desenvolvimento') return responder(validarDesenvolvimento(json));
    return responder(validar(tipo, json, ctx));
  } catch (e) {
    return responder({ erro: String((e as Error).message || e) }, 502);
  }
});
