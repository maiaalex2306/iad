/* IAD — Núcleo conceitual: as 8 decisões, evidências, gates e cadência multicanal. */
(function (global) {
  'use strict';

  const DIMENSOES = [
    {
      id: 'problema',
      nome: 'Problema',
      pergunta: 'O cliente reconheceu, com palavras dele, que existe algo que precisa ser resolvido?',
      niveis: [
        'Ninguém do lado do cliente admitiu o problema.',
        'Nós supomos que existe o problema — o cliente ainda não disse.',
        'O cliente disse, com palavras dele, que o problema existe.',
        'O cliente descreveu a consequência com número próprio, e o número resistiu quando conferimos.',
        'A consequência está por escrito num documento do cliente: relatório, indicador, ata ou e-mail dele.'
      ],
      evidencias: [
        'Cliente descreveu o problema com dados próprios',
        'Cliente compartilhou indicadores internos',
        'Cliente admitiu consequência operacional ou financeira',
        'Cliente repetiu nosso reenquadramento como se fosse dele',
        'Cliente mudou de opinião depois de ser desafiado'
      ],
      canais: {
        linkedin: 'Publique o custo invisível do problema, com número e contexto do setor.',
        linkedhelper: 'Conecte com operação e área técnica da conta usando o mesmo ângulo de problema.',
        email: 'Envie um benchmark curto: "3 sinais de que isso já está acontecendo aí".',
        whatsapp: 'Pergunte: "isso que descrevi acontece aí hoje? em que frequência?"'
      },
      conteudo: 'Diagnóstico / benchmark de setor'
    },
    {
      id: 'prioridade',
      nome: 'Prioridade',
      pergunta: 'Resolver isso virou prioridade agora, com prazo e dono?',
      niveis: [
        'Problema existe, mas sem urgência declarada.',
        'Achamos que é urgente — o cliente não disse isso.',
        'O cliente declarou intenção de tratar, sem prazo firme.',
        'Existe prazo ou evento crítico com data, e conferimos que a data se mantém.',
        'O prazo está num plano, meta ou orçamento escrito do cliente, com dono nomeado.'
      ],
      evidencias: [
        'Prioridade ganhou prazo declarado pelo cliente',
        'Cliente citou meta, auditoria ou evento crítico',
        'Cliente alocou pessoa responsável pelo tema'
      ],
      canais: {
        linkedin: 'Conteúdo sobre "por que agora": mudança regulatória, custo da demora, janela de safra/orçamento.',
        linkedhelper: 'Sequência para diretoria com ângulo de meta anual e ciclo orçamentário.',
        email: 'Envie o custo da demora quantificado por mês de adiamento.',
        whatsapp: 'Pergunte: "isso continua no plano deste trimestre ou escorregou?"'
      },
      conteudo: 'Custo da inação / calendário de decisão'
    },
    {
      id: 'impacto',
      nome: 'Impacto',
      pergunta: 'O ganho ou a perda foi quantificado e aceito pelo cliente?',
      niveis: [
        'Nenhum número na mesa.',
        'Estimativa nossa, ainda não mostrada ao cliente.',
        'Mostramos o cálculo e o cliente disse que faz sentido.',
        'O cliente corrigiu as premissas com dados dele e o número refeito ficou de pé.',
        'O business case está escrito e circulou internamente do lado do cliente.'
      ],
      evidencias: [
        'Cliente enviou dados para o cálculo',
        'Cliente validou a estimativa de ganho ou perda',
        'Cliente pediu o business case por escrito'
      ],
      canais: {
        linkedin: 'Case com resultado medido, sem promessa genérica.',
        linkedhelper: 'Aproxime financeiro e controladoria com o ângulo de retorno.',
        email: 'Envie a memória de cálculo do ROI, com premissas explícitas e editáveis.',
        whatsapp: 'Pergunte: "essas premissas representam bem a realidade de vocês?"'
      },
      conteudo: 'Calculadora de ROI / business case de 1 página'
    },
    {
      id: 'criterios',
      nome: 'Critérios',
      pergunta: 'Sabemos como a solução será julgada e quem definiu esses critérios?',
      niveis: [
        'Não sabemos como vão comparar.',
        'Deduzimos os critérios pelo que costuma pesar no setor.',
        'O cliente disse quais critérios importam.',
        'Conhecemos os pesos, sabemos quem definiu, e influenciamos ao menos um deles.',
        'Os critérios estão num documento de avaliação, RFP ou matriz que o cliente compartilhou.'
      ],
      evidencias: [
        'Critérios de avaliação foram compartilhados',
        'Cliente enviou checklist, RFP ou matriz de comparação',
        'Cliente aceitou incluir um critério que propusemos'
      ],
      canais: {
        linkedin: 'Post "como avaliar fornecedores desta categoria sem se enganar".',
        linkedhelper: 'Alcance a área técnica que costuma redigir os requisitos.',
        email: 'Envie um checklist de avaliação neutro, que o cliente possa usar com qualquer fornecedor.',
        whatsapp: 'Pergunte: "quais são os 3 pontos que mais pesam na escolha?"'
      },
      conteudo: 'Checklist de avaliação / matriz de critérios'
    },
    {
      id: 'stakeholders',
      nome: 'Stakeholders',
      pergunta: 'Quem decide, quem influencia, quem paga e quem pode bloquear?',
      niveis: [
        'Um único contato conhecido.',
        'Sabemos os nomes pelo organograma, sem falar com eles.',
        'Mapa do grupo comprador declarado pelo próprio cliente.',
        'Falamos diretamente com mais de uma área, incluindo quem decide o dinheiro.',
        'O grupo está confirmado por escrito: convite de reunião, lista de aprovadores ou organograma do projeto.'
      ],
      evidencias: [
        'Novo decisor entrou na conversa',
        'Cliente apresentou outra área internamente',
        'Financeiro, compras ou jurídico participou de uma reunião'
      ],
      canais: {
        linkedin: 'Conteúdo por persona: operação, financeiro, diretoria, compliance.',
        linkedhelper: 'Multithreading por conta: uma sequência por persona, dentro das regras da plataforma.',
        email: 'Peça a apresentação a quem mais será impactado, oferecendo material pronto.',
        whatsapp: 'Pergunte: "quem mais precisa participar antes de avançarmos?"'
      },
      conteudo: 'Mapa do buying group / material por persona'
    },
    {
      id: 'consenso',
      nome: 'Consenso',
      pergunta: 'As pessoas envolvidas concordam entre si sobre mudar?',
      niveis: [
        'Não há alinhamento visível.',
        'O champion apoia; supomos que as outras áreas acompanham.',
        'O champion diz que as outras áreas concordam.',
        'Vimos as áreas concordarem entre si, numa reunião com todas presentes.',
        'O alinhamento está registrado: ata, aprovação interna ou e-mail entre as áreas do cliente.'
      ],
      evidencias: [
        'Cliente realizou reunião interna sobre o tema',
        'Champion encaminhou nosso material internamente',
        'Outra área declarou apoio explícito',
        'Mobilizador levou o tema a quem discordava',
        'Duas áreas com interesses diferentes chegaram ao mesmo diagnóstico'
      ],
      canais: {
        linkedin: 'Conteúdo que o champion possa citar sem precisar traduzir.',
        linkedhelper: 'Familiaridade distribuída: o grupo inteiro precisa conhecer a marca, não só o técnico.',
        email: 'Envie um resumo executivo de uma página feito para ser encaminhado.',
        whatsapp: 'Pergunte: "falta alguém concordar para isso andar?"'
      },
      conteudo: 'Resumo executivo encaminhável'
    },
    {
      id: 'risco',
      nome: 'Risco',
      pergunta: 'O medo de avançar diminuiu — inclusive o risco pessoal de quem assina?',
      niveis: [
        'Riscos percebidos não tratados.',
        'Sabemos quais riscos existem, mas ninguém falou deles em voz alta.',
        'O cliente citou os riscos que o preocupam.',
        'Tratamos os riscos e o cliente disse que estão resolvidos — inclusive o risco pessoal de quem assina.',
        'A resposta ao risco está escrita: piloto aprovado, referência formal, SLA ou garantia aceita.'
      ],
      evidencias: [
        'Cliente pediu referência ou visita técnica',
        'Piloto ou prova de conceito foi aprovado',
        'Cliente aceitou plano de implantação em fases',
        'Cliente aceitou nossa recomendação em vez de seguir comparando',
        'Cliente aceitou garantia ou cláusula que reduz o risco dele'
      ],
      canais: {
        linkedin: 'Prova social específica: mesmo setor, mesmo porte, mesmo problema.',
        linkedhelper: 'Aproxime quem já foi cliente para gerar referência natural.',
        email: 'Envie case, SLA e plano de implantação faseado.',
        whatsapp: 'Pergunte: "o que ainda te preocuparia se começássemos em 30 dias?"'
      },
      conteudo: 'Cases, piloto, SLA, plano de implantação'
    },
    {
      id: 'processo',
      nome: 'Processo de compra',
      pergunta: 'Sabemos como esta compra é aprovada, assinada e paga?',
      niveis: [
        'Processo desconhecido.',
        'Supomos o caminho pelo que costuma acontecer em empresa desse porte.',
        'O cliente descreveu as etapas de aprovação.',
        'Sabemos as etapas, quem assina cada uma e QUANTO TEMPO cada uma leva, confirmado com quem participa delas.',
        'O caminho está por escrito: política de alçada, fluxo de compras ou calendário de comitê do cliente.'
      ],
      evidencias: [
        'Cliente explicou o fluxo de aprovação',
        'Compras ou jurídico iniciou análise',
        'Cliente informou orçamento, alçada ou data de assinatura'
      ],
      canais: {
        linkedin: 'Menos relevante aqui: use os outros canais.',
        linkedhelper: 'Identifique compras e jurídico antes de precisar deles.',
        email: 'Proponha um Mutual Action Plan com datas e responsáveis dos dois lados.',
        whatsapp: 'Pergunte: "depois do seu aval, quem mais assina e em quanto tempo?"'
      },
      conteudo: 'Mutual Action Plan / mapa de aprovação'
    }
  ];

  /* Só o que o CLIENTE fez conta como avanço. Atividade do vendedor não pontua. */
  const ATIVIDADES_QUE_NAO_CONTAM = [
    'Enviar proposta',
    'Fazer follow-up',
    'Marcar reunião',
    'Mover etapa no CRM',
    'Enviar apresentação'
  ];

  const ETAPAS = [
    'Prospecção',
    'Conexão',
    'Diagnóstico',
    'Benefícios',
    'Proposta',
    'Validação',
    'Fechamento',
    'Venda'
  ];

  /* ---------- a escada de cinco degraus ----------

     A escala tinha três degraus e dois eixos: a nota (0 a 2) dizia quanto se
     sabia, e a força da evidência (relato, confirmado, documentado) dizia de
     onde aquilo tinha vindo. Os dois brigavam, e a briga foi remendada com uma
     regra à parte — "nota 2 exige uma evidência confirmada".

     Em cinco degraus a origem É a escada, e o remendo some. É a régua para que
     o mercado convergiu em MEDDPICC, e ela é melhor por um motivo específico:
     o degrau 1 nomeia a suposição do vendedor e a pontua quase em zero. Antes,
     quem "achava" marcava 1 e o painel mostrava progresso que não existia.

     E o degrau 3 é o que separa "o cliente disse" de "conferimos e continua de
     pé". É onde mora o caso do diagnóstico que ainda não foi entregue: pode
     revelar que não atendemos, e até revelar, a decisão para no 2. */
  const NIVEIS_DA_ESCADA = [
    { n: 0, rotulo: 'Desconhecido', desc: 'Ninguém falou sobre isso.' },
    { n: 1, rotulo: 'Suposto', desc: 'Nós achamos. O cliente não disse.' },
    { n: 2, rotulo: 'Declarado', desc: 'O cliente disse, com palavras dele.' },
    { n: 3, rotulo: 'Testado', desc: 'Conferimos com o cliente e resistiu.' },
    { n: 4, rotulo: 'Documentado', desc: 'Está por escrito, em documento do cliente.' }
  ];
  const NOTA_MAXIMA = 4;
  const IAD_MAXIMO = 32;

  /* Média 3 nas oito: tudo testado com o cliente, nada apenas declarado.
     É mais duro do que os 11 de 16 anteriores, e de propósito: a régua antiga
     deixava passar negócio inteiro construído em cima do que o cliente disse
     numa reunião e ninguém nunca conferiu. */
  const IAD_MADURO = 24;

  /* Gates: a proposta é consequência da qualificação, não ferramenta de
     descoberta. Os mínimos subiram junto com a escada — o "1" de antes era
     "reconhece de forma vaga", que na régua nova é 2, declarado. */
  const GATES_PROPOSTA = [
    { dim: 'problema', min: 3 },
    { dim: 'prioridade', min: 2 },
    { dim: 'impacto', min: 2 },
    { dim: 'criterios', min: 2 },
    { dim: 'stakeholders', min: 2 },
    { dim: 'processo', min: 2 }
  ];

  const PAPEIS = [
    'Champion / Mobilizer',
    'Usuário',
    'Técnico',
    'Operações',
    'Financeiro',
    'Compras',
    'Jurídico / Compliance',
    'Decisor econômico'
  ];

  /* Cobertura mínima do buying group para um negócio ser considerado real. */
  const PAPEIS_CRITICOS = ['Champion / Mobilizer', 'Financeiro', 'Decisor econômico', 'Compras'];

  const CANAIS = [
    { id: 'linkedin', nome: 'LinkedIn', papel: 'Educa o mercado e ativa problema, prioridade e risco.' },
    { id: 'linkedhelper', nome: 'LinkedHelper', papel: 'Expande relacionamento com múltiplos stakeholders da conta.' },
    { id: 'email', nome: 'E-mail', papel: 'Entrega ROI, business case, benchmark e provas.' },
    { id: 'whatsapp', nome: 'WhatsApp', papel: 'Remove barreiras e fecha microcompromissos.' }
  ];

  /* Challenger Customer: quem move a compra por dentro não é quem atende melhor
     o telefone. Mobilizadores geram consenso; faladores geram conversa. */
  const PERFIS = [
    { id: 'nao_classificado', rotulo: 'Não classificado', grupo: 'indefinido', dica: 'Classifique depois de duas conversas: dá para ouvir a diferença.' },
    { id: 'go_getter', rotulo: 'Go-Getter', grupo: 'mobilizador', dica: 'Quer ideia nova e resultado. Traga o insight e um primeiro passo concreto.' },
    { id: 'professor', rotulo: 'Professor', grupo: 'mobilizador', dica: 'Ensina os colegas. Dê material que ele possa apresentar como dele.' },
    { id: 'cetico', rotulo: 'Cético', grupo: 'mobilizador', dica: 'Aceita mudar, mas por partes. Ofereça piloto, prova e ganhos pequenos primeiro.' },
    { id: 'amigo', rotulo: 'Amigo', grupo: 'falador', dica: 'Acessível e simpático — e sem tração interna. Use para chegar a um mobilizador.' },
    { id: 'guia', rotulo: 'Guia', grupo: 'falador', dica: 'Dá informação que ninguém dá. Ótima fonte, péssimo motor de mudança.' },
    { id: 'escalador', rotulo: 'Escalador', grupo: 'falador', dica: 'Busca ganho pessoal. Ajuda enquanto o projeto o favorece.' },
    { id: 'bloqueador', rotulo: 'Bloqueador', grupo: 'bloqueador', dica: 'Prefere o status quo. Não converta: neutralize com quem tem mais poder.' }
  ];
  const PERFIS_MOBILIZADORES = ['go_getter', 'professor', 'cetico'];

  /* Teach: o insight que reenquadra o problema antes de falar de solução. */
  const ESTADOS_INSIGHT = [
    { id: 'nenhum', rotulo: 'Nenhum insight formulado' },
    { id: 'formulado', rotulo: 'Formulado por nós' },
    { id: 'apresentado', rotulo: 'Apresentado ao cliente' },
    { id: 'aceito', rotulo: 'O cliente adotou o reenquadramento' }
  ];

  /* Força da evidência: "ele disse que vai levar ao CFO" não é a mesma coisa
     que "o CFO participou". Sem essa distinção o IAD de um otimista vale o
     mesmo que o de um cético, e o índice perde sentido comparativo. */
  const FORCAS = [
    { id: 'relato', rotulo: 'Relato', peso: 1, desc: 'O cliente disse que vai acontecer.' },
    { id: 'confirmado', rotulo: 'Confirmado', peso: 2, desc: 'O cliente fez, e nós presenciamos.' },
    { id: 'documentado', rotulo: 'Documentado', peso: 3, desc: 'Está por escrito: e-mail, ata, documento ou sistema.' }
  ];
  /* Que força cada degrau exige. Degraus 0, 1 e 2 não aparecem aqui de
     propósito: eles falam da ORIGEM da informação — ninguém disse, nós
     achamos, o cliente disse — e origem não se prova com força de evidência.
     Do 3 para cima é que a prova entra: testado pede algo que o cliente
     confirmou, documentado pede papel dele.

     Isto morava no motor. Trouxe para cá porque o manual também precisa
     dizer isto ao vendedor, e duas cópias da mesma regra é como a tela
     acabou explicando a régua velha depois que o motor já usava a nova. */
  const FORCA_MINIMA_DO_DEGRAU = { 3: 2, 4: 3 };

  /* Tipo de tarefa é, antes de tudo, o canal por onde se falou com o cliente:
     é isso que permite comparar o que funciona — reunião presencial move mais
     decisão do que WhatsApp? — e é isso que a metodologia lê depois. Reunião
     não é um botão separado: é um destes tipos. */
  /* LinkedIn faltava, e a falta era esquisita: a evidência já podia ter
     canal LinkedIn, a cadência do método já tratava "LinkedIn" como tipo de
     tarefa, e a prospecção inteira entra por ali — só a lista de canais da
     tarefa não conhecia o nome. */
  const TIPOS_TAREFA = ['Reunião', 'Visita', 'Telefonema', 'WhatsApp', 'E-mail',
    'LinkedIn', 'Apresentação', 'Proposta', 'Preparação', 'Cobrar retorno'];

  /* Os nomes antigos, que existiam antes de a lista virar canal. Renomeados
     no lugar, e não acrescentados: acrescentar deixaria "Ligar" e "Telefonema"
     na mesma lista, e ninguém saberia qual escolher. */
  const TIPOS_TAREFA_RENOMEADOS = {
    'Ligar': 'Telefonema', 'Visitar': 'Visita',
    'Enviar material': 'E-mail', 'Preparar': 'Preparação'
  };

  const CATEGORIAS_ARQUIVO = [
    'Business case', 'Critérios de avaliação', 'Proposta', 'Contrato',
    'Referência / case', 'Dados do cliente', 'Ata de reunião', 'Outro'
  ];

  const RELACOES_CONTA = ['Prospect', 'Cliente ativo', 'Ex-cliente'];
  const TIPOS_OPORTUNIDADE = ['Novo negócio', 'Expansão', 'Renovação'];

  /* Perguntas fechadas do fim de reunião: cada "sim" vira evidência sem digitação. */
  const FECHAMENTO_REUNIAO = [
    { id: 'stakeholders', pergunta: 'Entrou alguém novo na conversa?', evidencia: 'Novo participante entrou na decisão', forca: 'confirmado' },
    { id: 'impacto', pergunta: 'Ficou algum número acordado?', evidencia: 'Cliente acordou os números do impacto', forca: 'confirmado' },
    { id: 'processo', pergunta: 'Ficou marcado um próximo passo com data?', evidencia: 'Cliente assumiu um próximo passo com data', forca: 'confirmado' },
    { id: 'risco', pergunta: 'Apareceu algum bloqueio ou receio novo?', evidencia: 'Cliente expôs um bloqueio ou receio', forca: 'relato' }
  ];

  /* O desfecho que mais importa não é a perda para o concorrente: é o cliente
     que não decidiu nada. Sem separar os dois, o modelo nunca aprende. */
  /* Três formas de um negócio acabar, e uma quarta que não é acabar.

     A diferença entre perda e desistência não é de humor, é de fato: na perda
     o cliente DECIDIU e a decisão não foi nossa — houve escolha, e existe um
     vencedor. Na desistência ninguém decidiu nada; o projeto parou de existir
     dentro do cliente. Guardar as duas com o mesmo rótulo apaga a única
     pergunta que importa depois: perdemos a disputa, ou nem houve disputa?

     Parada não entra aqui de propósito. Conta que ainda não está pronta não é
     negócio encerrado — é negócio cedo demais, e encerrar é a forma mais cara
     de esquecer dela. Ela vai para nutrição, que é um estado, não um desfecho. */
  const DESFECHOS = [
    { id: 'ganho', rotulo: 'Ganho', classe: 'ok', pergunta: 'O cliente comprou.' },
    { id: 'perda', rotulo: 'Perda', classe: 'dead',
      pergunta: 'O cliente decidiu e a escolha não foi a nossa.' },
    { id: 'desistencia', rotulo: 'Desistência', classe: 'dead',
      pergunta: 'Ninguém decidiu. O projeto parou de existir dentro do cliente.' }
  ];

  /* Desfechos antigos, para o que já está gravado continuar legível. */
  const DESFECHOS_RENOMEADOS = {
    perdido_concorrente: 'perda',
    perdido_inacao: 'desistencia',
    adiado: 'desistencia'
  };

  /* Os motivos.

     São listas fechadas porque motivo digitado à mão não vira aprendizado:
     "preço" e "achou caro" e "valor alto" viram três linhas diferentes no
     relatório e nenhuma conclusão. Cada lista tem "Outro", com espaço para
     escrever — o que não cabe na lista é justamente o que vale investigar. */
  const MOTIVOS_PERDA = [
    { id: 'preco', rotulo: 'Preço acima do orçamento do cliente' },
    { id: 'concorrente_melhor', rotulo: 'Concorrente ofereceu solução melhor avaliada' },
    { id: 'concorrente_relacionamento', rotulo: 'Concorrente tinha relacionamento com quem decide' },
    { id: 'incumbente', rotulo: 'Manteve o fornecedor atual' },
    { id: 'tecnico', rotulo: 'Nossa solução não atendia a um requisito técnico' },
    { id: 'prazo', rotulo: 'Prazo de entrega ou implantação incompatível' },
    { id: 'comercial', rotulo: 'Condições comerciais: pagamento, contrato ou garantias' },
    { id: 'referencias', rotulo: 'Falta de referências ou de confiança na nossa entrega' },
    { id: 'compliance', rotulo: 'Barrado por jurídico, compras ou compliance' },
    { id: 'politica', rotulo: 'Decisão política interna, alheia à comparação técnica' },
    { id: 'escopo', rotulo: 'Compraram só parte do escopo, com outro fornecedor' },
    { id: 'outro', rotulo: 'Outro motivo (descreva abaixo)' }
  ];

  const MOTIVOS_DESISTENCIA = [
    { id: 'prioridade', rotulo: 'Mudou a prioridade dentro da empresa' },
    { id: 'orcamento', rotulo: 'Orçamento cortado ou congelado' },
    { id: 'patrocinador', rotulo: 'Quem defendia o projeto saiu ou mudou de área' },
    { id: 'interno', rotulo: 'Resolveram internamente, sem fornecedor' },
    { id: 'nao_fazer', rotulo: 'Decidiram não fazer nada' },
    { id: 'sem_consenso', rotulo: 'Não houve consenso entre as áreas' },
    { id: 'reestruturacao', rotulo: 'Fusão, aquisição ou reestruturação' },
    { id: 'crise', rotulo: 'Crise no setor ou na empresa do cliente' },
    { id: 'sem_resposta', rotulo: 'Parou de responder e não retomou' },
    { id: 'outro', rotulo: 'Outro motivo (descreva abaixo)' }
  ];

  /* Nutrição. O motivo aqui não é por que perdemos: é o que precisa acontecer
     no mundo para a conta ficar pronta. Por isso quase todos têm data. */
  const MOTIVOS_NUTRICAO = [
    { id: 'ciclo_orcamentario', rotulo: 'Sem orçamento neste ciclo; volta no próximo' },
    { id: 'contrato_vigente', rotulo: 'Contrato vigente com outro fornecedor até a data abaixo' },
    { id: 'outro_projeto', rotulo: 'Esperando outro projeto interno terminar' },
    { id: 'sazonalidade', rotulo: 'Momento errado do ano para esta operação' },
    { id: 'obra', rotulo: 'Obra, expansão ou mudança de planta ainda em curso' },
    { id: 'problema_pequeno', rotulo: 'O problema existe, mas ainda não no tamanho que justifica' },
    { id: 'sem_decisor', rotulo: 'Falta nomear quem decide' },
    { id: 'reorganizacao', rotulo: 'Empresa em reorganização; retomar depois' },
    { id: 'outro', rotulo: 'Outro motivo (descreva abaixo)' }
  ];

  /* Quando voltar a olhar. Nutrição sem data é esquecimento com nome bonito. */
  const PRAZOS_NUTRICAO = [
    { dias: 30, rotulo: 'Em 30 dias' },
    { dias: 60, rotulo: 'Em 60 dias' },
    { dias: 90, rotulo: 'Em 90 dias' },
    { dias: 180, rotulo: 'Em 6 meses' },
    { dias: 365, rotulo: 'Em 1 ano' }
  ];

  const FAIXAS_EVIDENCIA = [
    { max: 7, rotulo: 'Ativo', classe: 'ok' },
    { max: 14, rotulo: 'Atenção', classe: 'warn' },
    { max: 30, rotulo: 'Risco', classe: 'risk' },
    { max: Infinity, rotulo: 'Requalificar', classe: 'dead' }
  ];

  global.IADPlaybook = {
    DIMENSOES, ETAPAS, GATES_PROPOSTA, PAPEIS, PAPEIS_CRITICOS, DESFECHOS,
    DESFECHOS_RENOMEADOS, MOTIVOS_PERDA, MOTIVOS_DESISTENCIA, MOTIVOS_NUTRICAO, PRAZOS_NUTRICAO,
    NIVEIS_DA_ESCADA, NOTA_MAXIMA, IAD_MAXIMO, IAD_MADURO,
    FORCAS, FORCA_MINIMA_DO_DEGRAU, TIPOS_TAREFA, TIPOS_TAREFA_RENOMEADOS, CATEGORIAS_ARQUIVO,
    PERFIS, PERFIS_MOBILIZADORES, ESTADOS_INSIGHT,
    RELACOES_CONTA, TIPOS_OPORTUNIDADE, FECHAMENTO_REUNIAO,
    CANAIS, FAIXAS_EVIDENCIA, ATIVIDADES_QUE_NAO_CONTAM
  };
})(window);
