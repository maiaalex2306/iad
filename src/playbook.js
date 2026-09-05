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
        'Cliente admitiu consequência operacional ou financeira'
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
        'Outra área declarou apoio explícito'
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
        'Cliente aceitou plano de implantação em fases'
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

  const FAIXAS_EVIDENCIA = [
    { max: 7, rotulo: 'Ativo', classe: 'ok' },
    { max: 14, rotulo: 'Atenção', classe: 'warn' },
    { max: 30, rotulo: 'Risco', classe: 'risk' },
    { max: Infinity, rotulo: 'Requalificar', classe: 'dead' }
  ];

  global.IADPlaybook = {
    DIMENSOES, ETAPAS, GATES_PROPOSTA, PAPEIS, PAPEIS_CRITICOS,
    CANAIS, FAIXAS_EVIDENCIA, ATIVIDADES_QUE_NAO_CONTAM
  };
})(window);
