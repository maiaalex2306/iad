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
        'Um contato reconhece o problema, mas de forma vaga.',
        'O cliente descreveu o problema e as consequências dele.'
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
        'Há intenção de tratar, sem prazo firme.',
        'Existe prazo, evento crítico ou meta ligada à solução.'
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
        'Estimativa nossa, ainda não validada pelo cliente.',
        'Cliente validou os números do business case.'
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
        'Conhecemos parte dos critérios, sem pesos.',
        'Critérios e pesos conhecidos, e influenciamos ao menos um deles.'
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
        'Mapa parcial do grupo comprador.',
        'Grupo mapeado e com relacionamento em mais de uma área.'
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
        'Champion apoia, outras áreas ainda não se posicionaram.',
        'Houve alinhamento interno registrado entre as áreas.'
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
        'Riscos citados, tratados parcialmente.',
        'Riscos endereçados com prova: piloto, referência, SLA ou garantia.'
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
        'Sabemos parte do caminho de aprovação.',
        'Caminho completo mapeado, com prazos e responsáveis.'
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

  /* Gates: a proposta é consequência da qualificação, não ferramenta de descoberta. */
  const GATES_PROPOSTA = [
    { dim: 'problema', min: 2 },
    { dim: 'prioridade', min: 1 },
    { dim: 'impacto', min: 1 },
    { dim: 'criterios', min: 1 },
    { dim: 'stakeholders', min: 1 },
    { dim: 'processo', min: 1 }
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
  const FORCA_MINIMA_PARA_COMPROVAR = 2;

  /* Tipo de tarefa é, antes de tudo, o canal por onde se falou com o cliente:
     é isso que permite comparar o que funciona — reunião presencial move mais
     decisão do que WhatsApp? — e é isso que a metodologia lê depois. Reunião
     não é um botão separado: é um destes tipos. */
  const TIPOS_TAREFA = ['Reunião', 'Visita', 'Telefonema', 'WhatsApp', 'E-mail',
    'Apresentação', 'Proposta', 'Preparação', 'Cobrar retorno'];

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
  const DESFECHOS = [
    { id: 'ganho', rotulo: 'Ganho', classe: 'ok', pergunta: 'O cliente comprou.' },
    { id: 'perdido_concorrente', rotulo: 'Perdido para concorrente', classe: 'dead', pergunta: 'O cliente decidiu, e escolheu outro.' },
    { id: 'perdido_inacao', rotulo: 'Perdido por inação', classe: 'dead', pergunta: 'O cliente não decidiu nada e o projeto morreu.' },
    { id: 'adiado', rotulo: 'Adiado', classe: 'warn', pergunta: 'Ficou para outro ciclo, com data conhecida ou não.' }
  ];

  const FAIXAS_EVIDENCIA = [
    { max: 7, rotulo: 'Ativo', classe: 'ok' },
    { max: 14, rotulo: 'Atenção', classe: 'warn' },
    { max: 30, rotulo: 'Risco', classe: 'risk' },
    { max: Infinity, rotulo: 'Requalificar', classe: 'dead' }
  ];

  global.IADPlaybook = {
    DIMENSOES, ETAPAS, GATES_PROPOSTA, PAPEIS, PAPEIS_CRITICOS, DESFECHOS,
    FORCAS, FORCA_MINIMA_PARA_COMPROVAR, TIPOS_TAREFA, TIPOS_TAREFA_RENOMEADOS, CATEGORIAS_ARQUIVO,
    PERFIS, PERFIS_MOBILIZADORES, ESTADOS_INSIGHT,
    RELACOES_CONTA, TIPOS_OPORTUNIDADE, FECHAMENTO_REUNIAO,
    CANAIS, FAIXAS_EVIDENCIA, ATIVIDADES_QUE_NAO_CONTAM
  };
})(window);
