/* PERF-36K1 — conteúdo do Método carregado somente ao abrir #/playbook.
 * Este módulo não contém credenciais ou dados comerciais, e é precacheado no PWA.
 * O escopo original de views.js é reconstruído só com dependências públicas.
 * Nunca importar no index.html: apenas via IADCarregarOpcional na rota Método.
 */
(function (global) {
  'use strict';
  const P = global.IADPlaybook, Store = global.IADStore, E = global.IADEngine, U = global.IADUI;
  const esc = U.esc;
  const FILTROS = global.IADViewsManualDados.FILTROS;

  /* ---------------- Playbook ---------------- */
  /* ---------------- O manual, dentro do app ----------------

     Existia um manual bom fora daqui, numa página na web. Fora daqui é o
     problema: este app funciona offline, é usado no carro depois da visita e
     no celular sem sinal, e o manual que só abre com internet é o manual que
     não está lá na hora da dúvida. Então ele mora aqui.

     A tela do Método já explicava o MÉTODO. O que faltava era o SISTEMA: o que
     cada tela faz, de onde sai cada número, e onde a IA entra e onde ela não
     entra. As duas coisas agora dividem a mesma tela, com um índice no alto —
     porque manual sem índice é manual que ninguém volta a abrir. */

  /* O índice do manual com resumo ao passar o mouse.

     Vinte e cinco títulos numa lista são vinte e cinco apostas: a pessoa lê
     "Como o IAD anda" e tem de adivinhar se aquilo é a teoria do índice ou o
     passo a passo de dar nota. Com o resumo no balão ela decide antes de
     clicar — que é a única coisa que um índice precisa fazer.

     O terceiro campo é o resumo, e ele tem uma regra: diz o que a pessoa vai
     ENCONTRAR ali, não o que a seção é. "Os quatro modos de registrar" serve;
     "fala sobre registro" não serve para nada. */
  const SECOES_DO_MANUAL = [
    ['m-regra', 'A regra',
     'A diferença entre etapa e decisão, e a frase que sustenta o método inteiro: só o cliente move o índice. Traz a lista do que NÃO conta como avanço — mandar proposta, marcar reunião, dar follow-up.'],
    ['m-oito', 'As oito decisões',
     'As oito decisões que acontecem dentro do cliente, com a pergunta que cada uma responde. Cada uma vale de 0 a 4; a soma é o IAD, de 0 a 32. Com 24 ou mais, a decisão está madura.'],
    ['m-regua', 'A régua: cinco degraus',
     'Como se dá nota de 0 a 4 numa decisão, degrau por degrau. O que separa um do outro é quem disse, se houve número próprio do cliente e se aquilo está por escrito num documento dele.'],
    ['m-caminho', 'O caminho do vendedor, passo a passo',
     'O ciclo de UM negócio, do primeiro contato ao desfecho: de onde a conta entra, como o índice anda enquanto você trabalha, e como se encerra — inclusive quando não fecha.'],
    ['m-dia', 'O dia do vendedor: o que alimentar, o que você recebe',
     'O outro corte: o DIA, com trinta negócios ao mesmo tempo. A rotina hora a hora — o que abrir de manhã, o que ler antes de cada conversa, o que registrar logo depois — e o que o sistema devolve em troca.'],
    ['m-fila', 'A Fila: o que fazer primeiro',
     'A ordem em que a tela Hoje coloca a carteira e o porquê de cada posição; os três blocos que cada cartão traz; o botão que analisa a carteira inteira e acha o que se repete; a leitura diária do assistente; as cores das faixas; e por que os leads que nunca produziram evidência ficam fora da fila.'],
    ['m-potencial', 'Potencial: vale a primeira hora?',
     'A pergunta que vem antes do IAD, para quando você tem cem leads e IAD 0 em todos. As quatro faixas, as duas contas que as formam (perfil e interesse), de onde sai cada ponto e por que nada disso mexe no índice.'],
    ['m-nutricao', 'O Processo de Nutrição: triar cem de uma vez',
     'A tela onde se decide em lote quem sai da previsão e quem volta: as duas abas, os filtros que valem para as duas, a ordem por Potencial, o motivo e a data pedidos uma vez para o lote todo, a seleção em lote direto do Pipeline, e como juntar duas negociações repetidas da mesma empresa numa só.'],
    ['m-notas', 'Notas rápidas: o caderninho',
     'Onde guardar a frase que você não pode esquecer, escrita ou ditada, sem preencher formulário nenhum. O que o app reconhece sozinho no texto, por que a anotação não conta como tarefa, e por que ninguém além de você lê esta tela.'],
    ['m-lh', 'A integração com o Linked Helper',
     'Como a prospecção do LinkedIn chega ao IAD. Por que existe uma ponte no meio, os dois endereços que quase todo mundo troca, as duas chaves e o balde separado por empresa. É a página para abrir quando os leads não aparecem.'],
    ['m-sinais', 'Sinais: o que o comprador faz sozinho',
     'O que o cliente faz sem você — abrir o documento, responder, voltar ao site — e de onde cada sinal vem. Por que isso é um relógio separado que nunca mexe na nota: sinal que pontuasse viraria contador de cliques.'],
    ['m-email', 'Ligar a sua caixa de e-mail',
     'O passo a passo para o IAD ler a sua caixa: o que é uma senha de aplicativo, onde gerar a sua, e o que o sistema faz com os e-mails depois de encontrá-los.'],
    ['m-avanco', 'Como o IAD anda',
     'A mecânica do índice: o caminho de um ponto do começo ao fim, os três níveis decisão por decisão, a força da evidência (relato, confirmado, documentado), a ordem em que as oito devem ser trabalhadas e o que não sobe o índice de jeito nenhum.'],
    ['m-faixas', 'O que o número diz',
     'Como ler um IAD: o que significa cada faixa. E a segunda régua, que não é a nota — há quanto tempo o cliente não se move, que é o que separa negócio vivo de negócio bonito e parado.'],
    ['m-etapas', 'O que cada etapa pede',
     'As seis condições do portão da proposta — o que precisa estar provado antes de ela sair — e as três coisas que fazem o app gritar depois que ela já saiu.'],
    ['m-tarefa', 'Tudo entra por tarefa',
     'Por que existe um botão só, e a diferença entre "a fazer" e "já foi feita": a primeira mostra planejamento, a segunda mostra corrida atrás do histórico. Mais a lista de canais que você pode editar.'],
    ['m-contar', 'Como contar o que aconteceu',
     'Os quatro modos de registrar uma tarefa que já aconteceu, do mais completo ao mais rápido: colar a ata, responder quatro perguntas fechadas, registrar uma evidência direta, ou marcar que nada aconteceu — que também é informação.'],
    ['m-telas', 'As telas, uma a uma',
     'Uma linha por tela do menu, com a pergunta que cada uma responde antes do que ela mostra. É a tabela para consultar quando você não sabe em qual entrar.'],
    ['m-pipeline', 'Os grupos do pipeline',
     'Os grupos que classificam a carteira pela decisão do comprador, não pela etapa: o que entra, o que sai e o que fazer em cada um. A classificação é regra fixa, não é a IA — mesmo dado, mesmo grupo, sempre.'],
    ['m-fila-envio', 'Quando o servidor não responde',
     'O que acontece com o que você acabou de fazer se a internet cair ou a sessão vencer: onde aquilo fica guardado, como volta sozinho, e o que a faixa laranja quer dizer.'],
    ['m-tarefas', 'A tela de Tarefas',
     'Como a tela organiza o que foi executado e o que aquilo rendeu: por que toda tarefa está presa a uma empresa E a uma negociação, como a lista abre, e a coluna que diz quantos pontos de decisão cada tarefa fez andar.'],
    ['m-conversas', 'As conversas do WhatsApp',
     'Como as conversas chegam ao app, por que ele não lê a sua caixa sozinho, que formato de telefone cadastrar para a conversa casar com o contato certo, e de quem é cada conversa.'],
    ['m-aprendizado', 'Aprendizado e plano',
     'Oito indicadores em série semanal, sempre contra a semana anterior — porque número sozinho não ensina nada. Por que só estes indicadores entram, e o plano de desenvolvimento que sai da leitura.'],
    ['m-config', 'Configuração',
     'A tela de Configuração bloco a bloco: nuvem, caixa de e-mail, Linked Helper, backup, importação de planilha, instalação no celular e diagnóstico.'],
    ['m-ia-vendedor', 'A IA no seu dia',
     'O que a IA tira das suas costas na prática, a caixa que abre quando você entra — e, no fim, o que continua sendo fundamental que VOCÊ faça, porque não dá para terceirizar.'],
    ['m-ia', 'As tarefas da IA',
     'A lista inteira: cada pedido que o app faz ao assistente, onde ele aparece na tela, o que faz e o que é proibido de fazer. Com o nome técnico de cada um — que é o que aparece no diagnóstico quando dá errado.'],
    ['m-limites', 'O que a IA não faz',
     'Os limites deliberados, e por que eles existem: é o que garante que duas pessoas vejam o mesmo número. A frase para levar: a IA lê e propõe, o motor calcula, você decide.'],
    ['m-perfis', 'Quem move por dentro',
     'Os perfis do Challenger Customer: três mobilizam, três só conversam, um bloqueia. Como reconhecer cada um e como trabalhar com ele — com a ressalva honesta sobre a força da pesquisa por trás.'],
    ['m-cadencia', 'As 8 decisões, canal a canal',
     'O que dizer em cada canal para mover cada uma das oito decisões: LinkedIn, Linked Helper, e-mail e WhatsApp, decisão por decisão. É a cola para montar a cadência de uma conta.']
  ];

  function indiceDoManual() {
    return '<div class="card indice-manual"><h2 style="margin-top:0">Neste manual</h2>' +
      '<p class="tiny muted" style="margin:-6px 0 10px">Passe o mouse sobre um item para ver o que você encontra nele.</p>' +
      '<ol>' + SECOES_DO_MANUAL.map(function (s) {
        return '<li><a href="#/playbook" onclick="App.irNoManual(\'' + s[0] + '\');return false;"' +
          ' data-ajuda-titulo="' + esc(s[1]) + '" data-ajuda="' + esc(s[2] || '') + '">' +
          esc(s[1]) + '</a></li>';
      }).join('') + '</ol></div>';
  }

  /* Uma linha por tela, na ordem do menu. O que ela responde vem antes do que
     ela mostra: quem abre o manual está com uma pergunta, não com vontade de
     ler a lista de campos. */
  const TELAS = [
    ['⚡', 'Hoje', 'O que fazer agora, com quem e por onde.',
     'A Fila: a carteira inteira ordenada, com o motivo de cada posição, a pessoa que prova a decisão que falta e o canal para falar com ela. Os leads que nunca produziram evidência ficam fora, contados numa linha de triagem. É a tela de abrir de manhã.'],
    ['📊', 'Painel', 'Como está a carteira, e o que ela está me ensinando.',
     'Pipeline por saúde da decisão, o que está travando a receita, tempo sem evidência, riscos críticos — e, no fim, o Aprendizado da carteira com a evolução semana a semana e o plano de desenvolvimento.'],
    ['🗂️', 'Pipeline', 'Quais negócios são reais.',
     'A carteira lida pela decisão do comprador, não pela etapa. Sete grupos, filtros no topo e a gaveta de filtros finos. Em lista ou em kanban — e, na lista, o botão do canto inferior direito marca vários negócios para mandar à nutrição de uma vez, ou para juntar numa só os que são a mesma venda repetida.'],
    ['✅', 'Tarefas', 'O que foi executado, e o que aquilo rendeu.',
     'Toda tarefa presa a uma empresa e a uma negociação. Filtros como os do pipeline, resumo da semana, e a coluna que diz qual decisão cada tarefa destrava.'],
    /* Faltava. A tela existe no menu desde que o WhatsApp entrou, tem seção
       própria no manual, e mesmo assim não tinha linha aqui — quem consultava
       a tabela para saber em qual tela entrar simplesmente não via Conversas. */
    ['💬', 'Conversas', 'Alguém me respondeu?',
     'As conversas de WhatsApp, por pessoa. Mensagem não é evidência: você lê, e o que valeu a pena vira tarefa concluída com um botão — e aí sim as oito decisões andam.'],
    ['🔄', 'Revisão', 'O que precisa da minha decisão, não do meu esforço.',
     'A fila do que está fora do lugar: negócio sem próximo passo, papel crítico ausente, evidência velha, etapa adiantada demais.'],
    ['📇', 'Cadastros', 'Onde ficam as empresas, as pessoas e as listas.',
     'Contas, contatos, oportunidades, e os catálogos: segmentos, tipos de tarefa, produtos, fontes e usuários. Produtos só o gestor cadastra.'],
    ['🌱', 'Nutrição', 'Quem eu tiro da previsão agora, e quem já pode voltar.',
     'Duas abas — Carteira Ativa e Leads em Nutrição — com os mesmos filtros e o trânsito em lote entre elas. A lista sai ordenada por Potencial, e dá para filtrar por faixa. Nutrição não encerra ninguém: tira da previsão e mantém na agenda, com data para voltar a olhar.'],
    ['📝', 'Notas rápidas', 'O que eu não posso esquecer.',
     'Uma caixa, um botão de ditar e uma lista. É o caderninho, não a agenda: anotação não tem prazo, não tem dono e não entra em relatório nenhum. Quando uma delas virar compromisso, o botão "Virar tarefa" a atravessa para o método, já com o negócio e a pessoa que o texto citava.'],
    ['⚙️', 'Configuração', 'Instalação, dados, nuvem, IA e diagnóstico.',
     'Nove blocos, detalhados adiante neste manual.'],
    ['❓', 'Método', 'Por que o sistema funciona assim.',
     'Esta tela.']
  ];

  function manualDasTelas() {
    const linhas = TELAS.map(function (t) {
      return '<tr><td class="rotulo-manual"><span class="icone-tipo">' + t[0] + '</span> <strong>' + esc(t[1]) + '</strong></td>' +
        '<td><strong>' + esc(t[2]) + '</strong><span class="tiny muted">' + esc(t[3]) + '</span></td></tr>';
    }).join('');
    return '<div class="card" id="m-telas"><h2>As telas, uma a uma</h2>' +
      '<p class="small">Cada tela responde uma pergunta. Se você não souber em qual entrar, escolha pela pergunta.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + linhas + '</tbody></table></div></div>';
  }

  function manualDoPipeline() {
    const linhas = FILTROS.map(function (f) {
      const d = f[2];
      return '<tr><td class="rotulo-manual"><strong>' + esc(f[1]) + '</strong></td>' +
        '<td>' + esc(d.oQue) +
        '<span class="tiny muted"><strong>Entra:</strong> ' + esc(d.entra) + '</span>' +
        '<span class="tiny muted"><strong>Sai:</strong> ' + esc(d.sai) + '</span>' +
        '<span class="tiny muted"><strong>O que fazer:</strong> ' + esc(d.faca) + '</span></td></tr>';
    }).join('');
    return '<div class="card" id="m-pipeline"><h2>Os grupos do pipeline</h2>' +
      '<p class="small">A classificação é <strong>regra fixa</strong>, não é a IA. Mesmo dado, mesmo grupo, sempre — ' +
      'se um modelo decidisse isso, o cartão poderia mudar de cor entre duas visitas sem nada ter acontecido.</p>' +
      '<p class="small"><strong>A ordem importa.</strong> O app testa de cima para baixo e o negócio fica no primeiro ' +
      'grupo que servir. Por isso Zumbi vence todos: um negócio com IAD alto e quarenta dias de silêncio é zumbi, ' +
      'não é real.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + linhas + '</tbody></table></div></div>';
  }

  function manualDasConversas() {
    return '<div class="card" id="m-conversas"><h2>As conversas do WhatsApp</h2>' +

      '<p class="small">O mesmo número que você já usa no celular passa a entregar as conversas aqui ' +
      'dentro, sem você mudar de hábito. O que o cliente escreve, o que <em>você</em> escreve do seu ' +
      'aparelho, e até seis meses de conversa antiga entram na mesma linha do tempo.</p>' +

      '<div class="aviso"><strong>Mensagem não é evidência.</strong> Evidência é o que o cliente ' +
      'decidiu, e quem diz que uma mensagem virou decisão é você, não o sistema.</div>' +

      '<h3>Por que ela não lê sozinha</h3>' +
      '<p class="small">"Bom dia, tudo bem?" não move decisão nenhuma. Se a IA lesse tudo, o histórico ' +
      'encheria de evidência inventada e o IAD subiria com conversa fiada — que é exatamente o que ' +
      'este CRM existe para não deixar acontecer. A leitura é barata quando alguém escolhe o que vale ' +
      'a pena ler.</p>' +

      '<h3>Que formato de telefone cadastrar</h3>' +
      '<p class="small">O que você quiser. Com o código do país ou sem, com o nono dígito ou sem, ' +
      'com parênteses e traço ou só números — <strong>todos casam com a mesma pessoa</strong>. ' +
      'O WhatsApp sempre entrega o número internacional completo, e é o app que faz a ponte ' +
      'entre o que chegou e o que você digitou.</p>' +
      '<p class="small">A comparação é em três camadas, da mais forte para a mais fraca:</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><thead><tr>' +
      '<th>Camada</th><th>Quando vale</th></tr></thead><tbody>' +
      '<tr><td><strong>O número inteiro</strong></td><td>Bate tudo, país incluído. Não há dúvida.</td></tr>' +
      '<tr><td><strong>Mesmo DDD, mesmos 8 finais</strong></td>' +
      '<td>É o caso do nono dígito: <em>(19) 99123-4567</em> e <em>(19) 9123-4567</em> são a mesma pessoa, ' +
      'e o app sabe disso.</td></tr>' +
      '<tr><td><strong>Só os 8 finais</strong></td>' +
      '<td>Palpite, e só vale se for o único. Dois números de <strong>áreas diferentes</strong> podem ' +
      'terminar nos mesmos 8 dígitos — numa carteira de trinta contatos isso não acontece, numa de três ' +
      'mil acontece. Quando acontece, o app <strong>não escolhe</strong>: mostra as pessoas que empataram ' +
      'e pergunta.</td></tr>' +
      '</tbody></table></div>' +
      '<p class="small">Por isso o conselho prático é um só: <strong>cadastre com DDD</strong>. ' +
      'Com DDD a conversa nunca cai na camada fraca, e você nunca precisa desempatar. O código do país ' +
      'e o nono dígito o app resolve sozinho.</p>' +

      '<h3>De quem é a conversa</h3>' +
      '<p class="small">Descoberto o telefone, o app procura o dono em três degraus:</p>' +
      '<div class="escada-manual">' +
      '<div><span class="nota-manual n2">1</span><div><strong>O telefone bate com um contato</strong>' +
      '<span class="tiny muted">A conversa é daquela pessoa e, por ela, daquela empresa. A comparação ' +
      'usa os últimos oito dígitos, então o mesmo número escrito com 55, sem 55, com o nono dígito ou ' +
      'com zero de operadora casa do mesmo jeito.</span></div></div>' +
      '<div><span class="nota-manual n3">2</span><div><strong>A pessoa está no grupo comprador de uma ' +
      'única negociação aberta</strong><span class="tiny muted">A conversa também é daquela negociação. ' +
      'Se ela estiver em duas, o app <em>pergunta</em>: pendurar evidência no negócio errado é pior do ' +
      'que não pendurar.</span></div></div>' +
      '<div><span class="nota-manual n0">3</span><div><strong>Nada bate: "Sem dono"</strong>' +
      '<span class="tiny muted">Duas saídas, e as duas são suas: escolher um contato que já existe, ou ' +
      'cadastrar um novo — o telefone já vem preenchido.</span></div></div>' +
      '</div>' +

      '<h3>O que a conversa vira</h3>' +
      '<p class="small">Você abre, lê, e clica em <strong>Registrar o que aconteceu</strong>. Isso cria ' +
      'uma tarefa <strong>já concluída</strong>, canal WhatsApp, com o texto da conversa como relato e ' +
      'na data da última mensagem. Daí em diante é o caminho que você já conhece: a IA separa o que o ' +
      'CLIENTE fez, propõe as evidências com a força de cada uma e relê as oito decisões. Nada de novo ' +
      'no motor — a conversa entra pela porta que já estava aberta.</p>' +
      '<p class="small">O relato já vem escrito, com quem falou cada coisa, e é editável: corte o que ' +
      'não interessa antes de mandar ler.</p>' +

      '<h3>O que acontece sozinho, e o que não acontece</h3>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><thead><tr>' +
      '<th>Acontece sozinho</th><th>Não acontece sozinho</th></tr></thead><tbody>' +
      '<tr><td>A contagem de mensagens novas, no cartão do pipeline e no topo de Hoje.</td>' +
      '<td><strong>O tempo sem evidência não zera.</strong> Só evidência zera. Conversa não lida não é ' +
      'avanço, e fingir que é seria apagar o sinal que este CRM existe para dar.</td></tr>' +
      '<tr><td>O que você manda do celular entra na mesma linha do tempo, junto com o que o cliente ' +
      'respondeu.</td><td><strong>A nota das oito não muda.</strong> Muda quando a IA lê, e ela só lê ' +
      'quando você mandar.</td></tr>' +
      '<tr><td>A conversa antiga aparece marcada como histórico, separada por uma linha do que veio ' +
      'depois da conexão.</td><td><strong>O histórico não cria tarefa nenhuma</strong> e fica fora da ' +
      'contagem de não lidas. Ele também não entra no relato: evidência de abril entrando como avanço ' +
      'de hoje é o erro que o tempo sem evidência existe para denunciar.</td></tr>' +
      '</tbody></table></div>' +

      '<h3>O que vem junto, e que vale saber</h3>' +
      '<p class="small">Conversa de grupo não sincroniza, fica só no aplicativo. O WhatsApp Business ' +
      'precisa ser aberto ao menos uma vez a cada treze dias. Receber é grátis, e responder dentro de ' +
      'vinte e quatro horas também — o que custa é disparo de marketing, que não é o que o IAD faz.</p>' +
      '</div>';
  }

  /* A seção que não existia — e a falta dela era parte do estrago: quem via
     a faixa laranja não sabia se o trabalho estava seguro ou não, e no
     silêncio a suposição foi a pior possível. */
  function manualDaFilaDeEnvio() {
    return '<div class="card" id="m-fila-envio"><h2>Quando o servidor não responde</h2>' +
      '<p class="small">A carteira mora no <strong>servidor</strong>, e é isso que faz ela ser a mesma em ' +
      'qualquer aparelho em que você entrar. Cada coisa que você faz sobe na hora, sozinha — não existe ' +
      'botão de salvar, e isso é de propósito.</p>' +
      '<p class="small">Mas a internet cai, e a sessão vence quando o app fica parado. Quando isso ' +
      'acontece <em>no meio</em> do que você estava fazendo, o app agora faz três coisas:</p>' +
      '<div class="passos-manual">' +
      '<div class="passo-manual"><div class="numero">1</div><div><strong>Guarda neste aparelho, antes de tentar</strong>' +
      '<span class="tiny muted">O que você fez é gravado no próprio aparelho ANTES de cada tentativa de ' +
      'envio, e só é apagado quando o servidor confirma. Pode fechar o app, recarregar a página, o ' +
      'celular matar a aba — na próxima vez que você entrar, aquilo sobe.</span></div></div>' +
      '<div class="passo-manual"><div class="numero">2</div><div><strong>Insiste sozinho</strong>' +
      '<span class="tiny muted">Tenta de novo em 2 segundos, 5, 15, 30, e daí de minuto em minuto. E ' +
      'tenta na hora em que a internet volta ou em que você volta para a aba — que é exatamente quando ' +
      'o app ficou parado e a sessão venceu. Nunca desiste.</span></div></div>' +
      '<div class="passo-manual"><div class="numero">3</div><div><strong>Renova a sessão antes, não depois</strong>' +
      '<span class="tiny muted">A credencial do servidor dura cerca de uma hora. Quando ela está perto ' +
      'de vencer, o app pede uma nova antes de tentar gravar — em vez de descobrir que venceu só ' +
      'quando a gravação falha na sua frente.</span></div></div>' +
      '</div>' +
      '<h3>Quando ele interrompe você</h3>' +
      '<p class="small">Se a gravação falhar e <strong>continuar falhando</strong>, o app abre uma caixa no ' +
      'meio da tela — não só a faixa no alto. Isso é de propósito, e é a correção do erro que custou ' +
      'dezessete oportunidades: quem está trabalhando olha para o formulário, não para o topo da página. ' +
      'Um app que aceita meia hora de trabalho em silêncio, sabendo que não está gravando, é um app que ' +
      '<em>fabrica</em> a perda.</p>' +
      '<p class="small">A caixa diz há quanto tempo não grava, o motivo que o servidor deu, e se o ' +
      'trabalho está ou não guardado aqui. <strong>Ela não trava você</strong> — “Continuar assim mesmo” ' +
      'existe, porque travar um vendedor no meio de uma ligação seria trocar um problema por outro. Mas ' +
      'a escolha de seguir passa a ser sua, e informada. Ela volta de cinco em cinco minutos enquanto ' +
      'não gravar.</p>' +

      '<h3>Sair sozinho depois de 20 minutos parado</h3>' +
      '<p class="small">Sem nenhuma ação por <strong>20 minutos</strong>, o app encerra a sessão e volta ' +
      'para a tela de login. É segurança, não economia: a carteira da empresa não pode ficar aberta numa ' +
      'máquina de sala de reunião que ninguém está olhando.</p>' +
      '<p class="small">Um minuto antes aparece a pergunta <em>“Ainda está aí?”</em> — qualquer clique, ' +
      'tecla ou rolagem continua a sessão e zera o relógio. <strong>Mexer o mouse não conta</strong>, e é ' +
      'de propósito: um mouse encostado numa mesa que treme manteria a sessão viva para sempre.</p>' +
      '<p class="small">Antes de sair, o app tenta gravar o que estiver pendente. Se não conseguir, sai ' +
      'assim mesmo e a tela de login avisa — o que não subiu fica guardado neste aparelho e volta quando ' +
      'você entrar de novo, como em qualquer outra falha de envio.</p>' +

      '<h3>A faixa laranja, e o que ela quer dizer</h3>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      '<tr><td class="rotulo-manual"><strong>“Ainda não chegou ao servidor”</strong></td><td>' +
      '<strong>Está guardado aqui, e subindo sozinho</strong><span class="tiny muted">Pode continuar ' +
      'trabalhando e pode fechar. O que isso quer dizer, e é só isso: os OUTROS aparelhos ainda não ' +
      'veem. Quando a faixa sumir, viram.</span></td></tr>' +
      '<tr><td class="rotulo-manual"><strong>⬇ Baixar cópia</strong></td><td>' +
      '<strong>A ação que nunca dá errado</strong><span class="tiny muted">Grava num arquivo tudo o que ' +
      'está neste navegador agora, inclusive o que ainda não subiu. Vem primeiro na faixa por isso.' +
      '</span></td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Descartar e recarregar</strong></td><td>' +
      '<strong>A única coisa aqui que perde de verdade</strong><span class="tiny muted">Joga fora o que ' +
      'não subiu — inclusive o que estava guardado no aparelho — e recomeça do que o servidor tem. Não ' +
      'tem volta. Baixe a cópia antes.</span></td></tr>' +
      '</tbody></table></div>' +
      '<p class="tiny muted">Ao entrar, se tiver ficado coisa de uma sessão anterior, ela é enviada ' +
      '<strong>antes</strong> de o app baixar a carteira do servidor — e o app diz o que recuperou. A ' +
      'ordem importa: baixar primeiro sobrescreveria com a versão antiga justamente o que ficou ' +
      'faltando, e aí a perda seria definitiva.</p>' +
      '</div>';
  }

  function manualDasTarefas() {
    return '<div class="card" id="m-tarefas"><h2>A tela de Tarefas</h2>' +
      '<p class="small">Toda tarefa está presa a uma <strong>empresa</strong> e a uma <strong>negociação</strong> — ' +
      'uma empresa tem várias negociações, e "as tarefas da Marilan" e "as tarefas da proposta de reúso da Marilan" ' +
      'são perguntas diferentes.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      '<tr><td class="rotulo-manual"><strong>Status: A fazer</strong></td><td>Como a tela abre: atrasado e por vencer juntos, ' +
      'com o atrasado no topo, porque a ordem é a data. Abrir só em "Atrasadas" fazia quem tinha tudo em dia ver ' +
      '"nenhuma tarefa neste filtro", que se lê como dado perdido.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Pontos de decisão que andaram</strong></td><td>O número que fecha o ciclo, no resumo ' +
      'da semana. Tarefa fechada é esforço; ponto de IAD é resultado. É ele que diz se a semana valeu.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Fechadas sem relato</strong></td><td>Dívida visível, hoje só do passado e das tarefas ' +
      'que não estão ligadas a nenhuma negociação. Toda conclusão passa pela tela de contar o que aconteceu: é ela que ' +
      'move as oito decisões. Sem contar o que o cliente fez, não há o que reler.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>O que ela destrava</strong></td><td>Se a tarefa tem decisão-alvo, mostra a dimensão e a ' +
      'nota atual. Se não tem, mostra a primeira lacuna do negócio. É o que impede a lista de virar lista de afazeres solta.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Adiar</strong></td><td>Adiar é um fato, não correção de data: fica contado na tarefa ' +
      '("adiada 4x") e escrito no histórico. Mudar a data pela edição é correção e não conta.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Vinda do Linked Helper</strong></td><td>Toda empresa importada do LH abre uma tarefa de ' +
      'Apresentação vencendo no dia da importação, com campanha, SDR e a conversa inteira do LinkedIn na descrição.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Carteira: pipeline ou nutrição</strong></td><td>Mover cem leads para nutrição tira os ' +
      'cem da previsão, mas as tarefas deles continuam vencendo — era assim que “93 atrasadas” virava um número que ninguém ' +
      'olhava. O filtro separa <em>Só o pipeline</em> de <em>Só nutrição</em>. Abre em “Pipeline e nutrição”: nada some sem ' +
      'você mandar.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Visualizar</strong></td><td>A tarefa inteira só para ler, ao lado de Concluir. A ' +
      'conversa do LinkedIn aparece sem recorte — é onde está o e-mail e o celular que o cliente mandou — e o telefone e o ' +
      'e-mail de quem é vêm junto. Nada ali altera nada: para mexer existe Editar.</td></tr>' +
      '</tbody></table></div>' +

      '<h3>O e-mail e o celular presos na conversa</h3>' +
      '<p class="small">A mensagem que vem do Linked Helper costuma trazer o contato no meio do texto: ' +
      '<em>“Ana Bom dia Sim helcio.moraes@peri.com.br Abraço”</em>. Era dado que chegava e morria ali — a ficha do ' +
      'contato seguia vazia e alguém copiava à mão, quando lembrava de abrir a tarefa.</p>' +
      '<p class="small">Na edição da tarefa, o botão <strong>✨ Varrer contatos do texto</strong> lê o que está escrito e ' +
      'o que foi anexado, e propõe:</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      '<tr><td class="rotulo-manual"><strong>E-mail e telefone</strong></td><td>' +
      '<strong>Por regra, sem IA e sem custo</strong><span class="tiny muted">Eles têm forma, e forma se reconhece sem ' +
      'gastar uma chamada. Funciona com o assistente desligado — antes o botão nem aparecia, e o celular ficava preso na ' +
      'descrição para sempre. Data, CNPJ e DDD que não existe são recusados: telefone inventado na ficha é pior que campo ' +
      'vazio, porque ninguém desconfia de campo preenchido.</span></td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Nome de gente</strong></td><td>' +
      '<strong>Aí sim é o assistente</strong><span class="tiny muted">Reconhecer que “Helcio Moraes” é uma pessoa e ' +
      '“Managing Director” é o cargo dele é o que só a IA faz. Se ela falhar, a varredura por regra vale do mesmo jeito.' +
      '</span></td></tr>' +
      '<tr><td class="rotulo-manual"><strong>De quem é</strong></td><td>' +
      '<strong>O endereço costuma dizer</strong><span class="tiny muted">“helcio.moraes@” é o Helcio Moraes que já está ' +
      'cadastrado. Quando não dá para saber — “ana@” com duas Anas na empresa, ou “contato@” — o dado fica <em>sem dono</em> ' +
      'e você escolhe na hora. Colar o e-mail na Ana errada é um erro que ninguém descobre depois.</span></td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Onde entra</strong></td><td>' +
      '<strong>Só em campo vazio</strong><span class="tiny muted">A ficha tem <strong>dois e-mails</strong> (profissional e ' +
      'pessoal) e <strong>dois telefones</strong> (WhatsApp e comercial). O primeiro vazio recebe; se os dois estiverem ' +
      'ocupados, nada entra. O que você digitou vence o que o robô leu, sempre — e varrer a mesma tarefa de novo não ' +
      'duplica nada: ele diz “já estava na ficha” e para.</span></td></tr>' +
      '</tbody></table></div>' +
      '<p class="tiny muted">O mesmo número escrito de três jeitos — <em>+55 24 99931-6448</em>, <em>(24) 99931-6448</em>, ' +
      '<em>24999316448</em> — é reconhecido como um só: a comparação é pelos últimos oito dígitos, a mesma regra que faz a ' +
      'conversa de WhatsApp casar com a pessoa certa.</p>' +
      '</div>';
  }

  function manualDoAprendizado() {
    return '<div class="card" id="m-aprendizado"><h2>Aprendizado da carteira e plano de desenvolvimento</h2>' +
      '<p class="small">No fim do Painel. Oito indicadores em série <strong>semanal</strong>, sempre contra a semana ' +
      'anterior — porque um número sozinho não ensina: "ticket médio de R$ 42 mil" só quer dizer alguma coisa ao lado ' +
      'dos R$ 51 mil da semana passada.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      '<tr><td class="rotulo-manual"><strong>Por que só estes indicadores</strong></td><td>Só entra o que aconteceu <em>dentro</em> ' +
      'da semana e ficou datado. Por isso a série é exata também para trás. O valor de um negócio é sobrescrito quando ' +
      'muda — devolver o valor de hoje com data de julho seria pior do que não responder, então ele fica de fora.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>A seta</strong></td><td>O glifo diz para onde o número foi; a cor diz se isso é bom. ' +
      'Ciclo de vendas caindo é seta para baixo <strong>em verde</strong>.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>A semana em curso</strong></td><td>Fica marcada e fora da comparação. Comparar ' +
      'quarta-feira com uma semana inteira é o erro clássico deste tipo de tela: meia semana sempre parece queda.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>O que cada tipo de tarefa rendeu</strong></td><td>A tabela que fecha o ciclo do sistema. ' +
      'Dez e-mails com zero ponto ao lado de três visitas com sete pontos é a informação que muda a semana seguinte. ' +
      'A atribuição é exata para o que foi pontuado a partir desta versão; o que veio antes casa pela data e vai ' +
      'marcado como estimativa.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Plano de desenvolvimento</strong></td><td>A IA lê exatamente os números da tabela — ' +
      'nada além deles — e devolve o que melhorou, o que piorou, e no máximo três mudanças, cada uma com o número ' +
      'que a justifica e o indicador que vai dizer se deu certo.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Ganhos contra perdas</strong></td><td>O aprendizado lento, logo abaixo: compara a foto ' +
      'das oito decisões no dia do fechamento entre ganhos e perdas. Precisa de uns cinco de cada lado para significar ' +
      'algo, e o app avisa enquanto não tem.</td></tr>' +
      '</tbody></table></div></div>';
  }

  function manualDaConfiguracao() {
    const blocos = [
      ['Instalar', 'O IAD é um PWA: instala como aplicativo e funciona offline com a última cópia baixada.'],
      ['Importar planilha', 'CSV, e a ordem importa: empresas, depois contatos, depois oportunidades. Leitura literal de colunas — nada é adivinhado.'],
      ['Assistente de IA', 'O interruptor de tudo. Fora do ar, as caixas ✨ somem e o sistema inteiro continua funcionando: você digita à mão. A chave do modelo fica no servidor, nunca no navegador.'],
      ['Nuvem (Supabase)', 'Sincronizar sobe e desce. Só baixar traz do servidor por cima do que está aqui — é o botão de "esta máquina está com dados de outra conta". A frase "Sincronizando para [empresa]" é literal: o que subir passa a pertencer a ela.'],
      ['Minha conta', 'Troca de senha, válida em todos os aparelhos. Senha que circulou por e-mail ou mensagem deixou de ser secreta no momento em que circulou.'],
      ['Linked Helper', 'A ponte recebe o webhook do LH e o app busca de lá. Cada lead vira empresa, contato, oportunidade e tarefa. Aqui também aparece o aviso de importações antigas que ficaram sem tarefa.'],
      ['Diagnóstico dos dados', 'A resposta para "a tela está vazia". Guardados é o que existe neste aparelho; visíveis é o que as permissões deixam ver — a diferença entre as duas colunas é o diagnóstico inteiro. "Perguntar ao servidor por quê" vai além e escreve o veredito.'],
      ['Backup', 'Exporta em JSON. Anexos não entram — a contagem aparece embaixo para você não achar que levou tudo.'],
      ['Demonstração', 'Carteira fictícia com os cinco grupos, para treinar a leitura sem tocar em dado real. "Apagar tudo" limpa este aparelho, não o servidor.']
    ];
    const linhas = blocos.map(function (b) {
      return '<tr><td class="rotulo-manual"><strong>' + esc(b[0]) + '</strong></td><td>' + esc(b[1]) + '</td></tr>';
    }).join('');
    return '<div class="card" id="m-config"><h2>Configuração, bloco a bloco</h2>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + linhas + '</tbody></table></div></div>';
  }

  /* Os dez pedidos que o app faz ao assistente. A coluna do meio é o nome
     técnico de verdade — o mesmo que viaja na chamada — porque quando alguma
     coisa der errado é esse nome que vai aparecer no diagnóstico. */
  const TAREFAS_DA_IA = [
    ['conta', '✨ no formulário de empresa',
     'Extrai a ficha de um texto colado e depois vai ao site da empresa e à Receita Federal completar o que faltou. O segmento sai da sua lista fechada, escolhido por julgamento do que a empresa faz — não por achar a palavra no texto.'],
    ['contato', '✨ no formulário de contato',
     'Deduz o papel na compra a partir do cargo (Suprimentos → Compras; CFO → Decisor econômico). Perfil Challenger só se o texto mostrar como a pessoa age.'],
    ['oportunidade', '✨ no formulário de negócio',
     'Título, segmento, tipo e concorrentes — incluindo "não fazer nada" —, a ficha inteira da empresa cliente e as pessoas citadas. Num gesto só: a empresa nova nasce com a ficha preenchida, e a pessoa que você escolher no campo Contato é cadastrada e entra no grupo comprador deste negócio. Não devolve valor, etapa nem data de fechamento: isso é seu.'],
    ['evidencia', '✨ no registro de evidência',
     'Extrai UMA evidência do que o cliente fez, começando pelo lado dele. Dimensão, força, pessoa, canal, data e o próximo passo combinado. Não devolve a nota.'],
    ['classificar', 'enquanto você digita a evidência',
     'Só dimensão e força do que você acabou de escrever. Nada mais.'],
    ['reuniao', 'ata ou transcrição colada',
     'Separa TUDO em várias evidências, uma por dimensão — um documento rende de duas a seis. Num documento nosso, o que o cliente forneceu é evidência dele; nossa recomendação e nosso preço não são.'],
    ['notas', 'ao concluir uma tarefa com relato',
     'Propõe a nota das oito. Três travas: só o que o cliente fez conta; cada nota precisa de trecho literal, e sem trecho é 0; na dúvida entre dois níveis, usa o menor.'],
    ['plano', 'cartão Próximos passos',
     'Até 4 passos na ordem de execução, cada um com dimensão-alvo, ação, uma pergunta pronta e o porquê citando o cliente. Proibida de sugerir nota e de passo genérico.'],
    ['segmentos', 'importação do Linked Helper',
     'Todos os leads de uma vez: segmento da lista da equipe, papel provável na compra, o insight comercial e A PRÓXIMA MENSAGEM — uma pergunta pronta, que pede um número em vez de uma reunião. O lead que chega sem site e sem descrição — que é a maioria — tem o site procurado pelo nome da empresa antes de a classificação acontecer: "Outros" é para quem não tem relação com nenhum segmento, não para quem ninguém foi conferir.'],
    ['desenvolvimento', 'Plano de desenvolvimento, no Painel',
     'Lê a série semanal e o rendimento por tipo de tarefa e escreve o que melhorou, o que piorou e até três mudanças. Proibida de estimar, projetar ou comparar com "mercado".'],
    ['insight', 'campo de insight do negócio',
     'Rascunho do reenquadramento Challenger em duas ou três frases, para você editar.']
  ];

  function manualDaIA() {
    const linhas = TAREFAS_DA_IA.map(function (t) {
      return '<tr><td class="rotulo-manual"><code>' + esc(t[0]) + '</code></td>' +
        '<td class="onde-manual tiny muted">' + esc(t[1]) + '</td>' +
        '<td>' + esc(t[2]) + '</td></tr>';
    }).join('');
    return '<div class="card" id="m-ia"><h2>As tarefas da IA</h2>' +
      '<p class="small">Não existe "a IA do sistema" em geral. Existem pedidos de escopo fechado, cada um com regras ' +
      'próprias e um lugar onde aparece. Esta é a lista inteira.</p>' +
      '<p class="small">Dois deles — a ficha de empresa e a de negócio — não param no que você colou: ' +
      'eles leem o site da empresa (inclusive as páginas brasileiras de multinacional, que é onde está ' +
      'a fábrica daqui) e consultam o CNPJ na Receita Federal. O bloco da Receita manda em razão social, ' +
      'CNPJ, cidade e UF, porque é cadastro oficial. Quando o CNPJ não está em lugar nenhum, ele é ' +
      'procurado — e o número achado só vale depois de a Receita confirmar que a razão social é mesmo ' +
      'a daquela empresa. Achar não é conferir.</p>' +
      '<p class="small">Enquanto um deles roda, um balão no rodapé diz em que passo está, há quantos segundos, ' +
      'até quando o app espera antes de desistir e quem responde primeiro. Sem barra de porcentagem: ' +
      'uma chamada ao modelo é opaca, ninguém sabe se ela está em 20% ou em 80%, e número inventado ' +
      'é pior do que número nenhum. Os que rodam em laço ou em segundo plano — a varredura dos negócios, ' +
      'a importação do Linked Helper — contam o progresso na própria tela, e não abrem balão.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><thead><tr><th>Pedido</th><th>Onde aparece</th>' +
      '<th>O que faz — e o que é proibida de fazer</th></tr></thead><tbody>' + linhas + '</tbody></table></div></div>';
  }

  function manualDosLimites() {
    const itens = [
      ['Não classifica o pipeline', 'Zumbi, Falso avançado, Oculto promissor e os outros saem de regra fixa com os números do negócio. Mesmo dado, mesmo grupo, sempre.'],
      ['Não pontua sozinha', 'Ela propõe; quem confirma é você. Toda mudança de nota grava um retrato com data e dimensão — o histórico responde por que o negócio valia 8 e vale 12.'],
      ['Não inventa pessoa, número ou prazo', 'Está escrito em cada pedido, e a resposta é validada antes de chegar na tela: segmento fora da lista é recusado, pessoa que não existe na conta é descartada.'],
      ['Não é obrigatória', 'Com o assistente fora do ar, o sistema inteiro continua de pé — só some o atalho. O que sustenta o IAD é a evidência do cliente, não o modelo.'],
      ['Não sai do navegador com a sua chave', 'A chave do modelo fica no servidor. O app manda o texto, recebe os campos, e nada mais.']
    ];
    const linhas = itens.map(function (i) {
      return '<tr><td class="rotulo-manual"><strong>' + esc(i[0]) + '</strong></td><td>' + esc(i[1]) + '</td></tr>';
    }).join('');
    return '<div class="card" id="m-limites"><h2>O que a IA não faz</h2>' +
      '<p class="small">Tão importante quanto a lista anterior: é o que garante que duas pessoas vejam o mesmo ' +
      'número, e que o painel do dono da empresa signifique alguma coisa.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + linhas + '</tbody></table></div>' +
      '<div class="aviso" style="margin-top:12px">Se for para lembrar de uma frase: a IA <strong>lê e propõe</strong>, ' +
      'o motor <strong>calcula</strong>, você <strong>decide</strong> — e só o que o <strong>cliente</strong> fez ' +
      'move a nota.</div></div>';
  }

  /* A escada, gerada dos degraus. Aparece em dois lugares do manual e não pode
     divergir entre eles — nem do que a tela do negócio mostra. */
  function escadaEmCards() {
    return '<div class="escada-manual">' + P.NIVEIS_DA_ESCADA.map(function (n) {
      return '<div><span class="nota-manual n' + n.n + '">' + n.n + '</span>' +
        '<div><strong>' + esc(n.rotulo) + '</strong>' +
        '<span class="tiny muted">' + esc(n.desc) + '</span></div></div>';
    }).join('') + '</div>';
  }

  function manualDasOito() {
    const linhas = P.DIMENSOES.map(function (d, i) {
      return '<tr><td class="rotulo-manual"><span class="tiny muted">' + (i + 1) + '</span> <strong>' + esc(d.nome) + '</strong></td>' +
        '<td>' + esc(d.pergunta) + '</td></tr>';
    }).join('');
    return '<div class="card" id="m-oito"><h2>As oito decisões, e a régua</h2>' +
      '<p class="small">Uma venda B2B não avança porque você mandou proposta. Avança quando oito decisões acontecem ' +
      '<strong>dentro do cliente</strong>. Cada uma vale de 0 a ' + P.NOTA_MAXIMA + ', e a soma é o <strong>IAD</strong>, de 0 a ' + P.IAD_MAXIMO + '. ' +
      'Com ' + P.IAD_MADURO + ' ou mais, decisão madura.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + linhas + '</tbody></table></div>' +
      escadaEmCards() +
      '<p class="small" style="margin-top:10px">Dois números derivam daí. <strong>Evidence Age</strong> é há quantos ' +
      'dias o cliente não produz evidência — o relógio não para por atividade sua. <strong>Cobertura</strong> é quanto ' +
      'dos papéis críticos da compra você tem mapeado.</p></div>';
  }

  /* ---------------- A régua ----------------

     A seção mais importante do manual, e a que precisa existir por escrito:
     mudamos a escala e ninguém aprende régua nova por osmose. Ela é gerada
     dos degraus e das dimensões, então descreve o que o app realmente faz. */
  /* O caminho inteiro, do primeiro contato ao desfecho.

     O manual explicava cada peça — a régua, os grupos, as tarefas — e nenhuma
     página dizia a ORDEM. Vendedor novo lia tudo e continuava sem saber por
     onde começar na segunda-feira. Isto é a sequência, e ela termina nas
     quatro saídas, porque negócio que não termina em lugar nenhum é o que
     entope o funil. */
  /* A integração com o Linked Helper, do começo ao fim.

     É a parte do sistema com mais peças móveis fora do app — uma ponte no
     Cloudflare, dois endereços que não se parecem, duas chaves com propósitos
     opostos, um balde por empresa — e era a única sem página no manual. Cada
     defeito que apareceu nela custou uma tarde a alguém que não tinha como
     saber onde olhar. */
  function manualDoLinkedHelper() {
    const passo = function (n, titulo, texto) {
      return '<div class="passo-manual"><div class="numero">' + n + '</div>' +
        '<div><strong>' + esc(titulo) + '</strong>' +
        '<p class="small" style="margin:4px 0 0">' + texto + '</p></div></div>';
    };
    const caso = function (titulo, oQueAcontece) {
      return '<tr><td class="rotulo-manual"><strong>' + esc(titulo) + '</strong></td>' +
        '<td class="small">' + oQueAcontece + '</td></tr>';
    };

    return '<div class="card" id="m-lh"><h2>A integração com o Linked Helper</h2>' +
      '<p class="small muted">O Linked Helper prospecta no LinkedIn e o IAD mede decisão. ' +
      'Entre os dois existe uma ponte, e quase todo problema que aparece aqui é de endereço, ' +
      'não de dado. Esta página existe para você saber onde olhar.</p>' +

      '<h3>Por que existe uma ponte no meio</h3>' +
      '<p class="small">O Linked Helper entrega o que o prospect respondeu por <strong>webhook</strong>, e ' +
      'webhook precisa de um endereço público para onde postar. O IAD roda dentro do seu navegador e não ' +
      'tem endereço nenhum — ninguém consegue postar num navegador. A ponte fica no meio: ela recebe o ' +
      'POST do Linked Helper, guarda por trinta dias, e entrega ao app quando ele vai buscar.</p>' +
      '<p class="small">Ela é um Worker no Cloudflare, de graça na conta gratuita, e o código dela está no ' +
      'repositório em <code>ponte/worker.js</code>.</p>' +

      '<h3>Dois endereços, e eles não se parecem</h3>' +
      '<p class="small">É aqui que mais gente erra, e o erro não avisa: tudo parece funcionar e os leads ' +
      'simplesmente não aparecem.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      caso('No Linked Helper', 'Endereço <strong>longo</strong>, no campo Webhook URL da campanha: ' +
        '<code>https://sua-ponte.workers.dev/?k=CHAVE_ESCRITA&amp;e=IDENTIFICADOR_DA_EMPRESA</code>. ' +
        'É longo porque o Linked Helper não sabe nada sobre você: tudo o que ele precisa dizer tem de estar na URL.') +
      caso('No IAD', 'Endereço <strong>curto</strong>, em Configuração → Linked Helper, sem nada depois da barra: ' +
        '<code>https://sua-ponte.workers.dev/</code>, mais a chave de leitura num campo separado. ' +
        'É curto porque o app já sabe quem está logado — ele acrescenta o identificador da empresa sozinho.') +
      '</tbody></table></div>' +

      '<h3>Duas chaves, de propósito</h3>' +
      '<p class="small">A <strong>chave de escrita</strong> vive dentro do Linked Helper, num endereço que ' +
      'passa por várias mãos. A <strong>chave de leitura</strong> vive no app. São diferentes porque vazar ' +
      'uma não pode expor a outra: quem descobrir a de escrita consegue mandar lixo para a ponte, mas não ' +
      'consegue ler o que já chegou. As duas ficam no Cloudflare, e o app nunca guarda a de escrita — ' +
      'por isso a janela do webhook pede que você a digite toda vez.</p>' +

      '<h3>Um balde por empresa</h3>' +
      '<p class="small">O IAD atende várias empresas e nenhuma pode ver a prospecção da outra. O ' +
      'identificador no fim do endereço — o <code>e=</code> — decide em qual balde a entrega cai, e o app ' +
      'só pede o balde da empresa de quem está logado.</p>' +
      '<p class="small">Dois erros levam prospecção para o balde errado, e os dois acontecem no Linked ' +
      'Helper: endereço <strong>sem</strong> o <code>e=</code>, que cai no balde antigo; e endereço com o ' +
      '<code>e=</code> de <strong>outra empresa</strong>, que é o pior porque nada reclama. Nos dois casos ' +
      'o remédio é o mesmo: <strong>Configuração → Resgatar de outro balde</strong>, que lê o balde que você ' +
      'escolher e traz o conteúdo para a empresa escolhida agora.</p>' +
      '<p class="tiny muted">Isto é isolamento operacional, não criptográfico: quem tiver a chave de leitura ' +
      'e souber o identificador de outra empresa consegue ler o balde dela. O que ele elimina é o erro que ' +
      'acontece sozinho — importar por engano a prospecção do vizinho.</p>' +

      '<h3>O que acontece quando você clica em Buscar respostas</h3>' +
      passo(1, 'O app pede o balde da empresa logada',
        'Com o recorte em "Todas as empresas" ele recusa em vez de chutar — ler o balde errado devolveria ' +
        'a prospecção de outra pessoa.') +
      passo(2, 'Os descartados saem antes de tudo',
        'Quem você excluiu antes naquela campanha nem chega à tela, e nem é lido pela IA. Com centenas de ' +
        'leads isso é dinheiro e minutos que não se gastam.') +
      passo(3, 'A IA lê o lote inteiro numa chamada só',
        'Ela classifica o segmento de cada empresa, sugere o papel na compra de cada pessoa, tenta casar a ' +
        'empresa com uma conta que já existe, e marca quem respondeu <strong>não</strong> — a recusa educada, ' +
        'a que vem enrolada em elogio, a que não usa nenhuma palavra-chave.') +
      passo(4, 'A tela de revisão mostra tudo, e você decide',
        'Cada lead vem com o segmento sugerido e o motivo, a conta candidata a fundir, a conversa e o ' +
        'histórico. Quem a IA leu como recusa vem <strong>desmarcado</strong>. Você marca, desmarca, corrige ' +
        'o segmento, ou exclui de vez.') +
      passo(5, 'O que você marcou vira empresa, contato e negociação',
        'E o que você excluiu some da ponte e não volta mais naquela campanha — nem quando o Linked Helper ' +
        'reentregar a mesma pessoa com identificação nova.') +

      '<h3>Como o app evita duplicar</h3>' +
      '<p class="small">Três perguntas, nesta ordem, e cada uma independente da anterior. ' +
      'Toda fusão de empresa aparece na tela de revisão com o motivo escrito — "mesmo site", "mesmo nome", ' +
      '"esta mesma pessoa já está nesta conta" — e a caixa ao lado desmarca. Desmarcar vale sempre: ' +
      'o import respeita a sua decisão mesmo quando o site bate.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      caso('A empresa já existe?', 'Domínio do site igual · nome igual depois de ignorar acento, pontuação e ' +
        'maiúscula · se o lead veio sem empresa, o perfil do LinkedIn da pessoa contra os contatos que já ' +
        'existem · e por último a sugestão da IA, que você viu na tela e pôde desmarcar. A primeira que bater vence.') +
      caso('O contato já existe nessa empresa?', 'Perfil do LinkedIn, depois e-mail, depois nome. No nome ' +
        'vale prefixo: "Marcos" e "Marcos Silva" na mesma conta são a mesma pessoa.') +
      caso('Já existe negociação aberta dessa empresa vinda do LH?', 'Se sim e a campanha for a mesma, a ' +
        'interação entra nela. <strong>Campanha diferente abre negociação nova</strong> — campanha é ' +
        'abordagem diferente, com outra promessa e outro ciclo, e misturar duas na mesma negociação ' +
        'destruiria a comparação entre elas. Se não houver nenhuma de LH mas houver <strong>uma só</strong> ' +
        'negociação aberta na conta, é nela que a resposta entra: quem cadastrou a empresa à mão e depois ' +
        'recebe a resposta do LinkedIn não pode acabar com o índice partido em dois cartões.') +
      '</tbody></table></div>' +

      '<h3>O que acontece em cada situação</h3>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      caso('Empresa e contato novos', 'Cria os dois, mais a negociação em Conexão e a tarefa ' +
        '"Empresa Importada do LH - Fazer Contato".') +
      caso('Mesma empresa, contato diferente, mesma campanha', 'A empresa é reaproveitada. O contato novo ' +
        'nasce e entra no grupo comprador da negociação que já existe. Nenhuma negociação nova. A tarefa é ' +
        '"Nova interação no LH - Responder".') +
      caso('Campanha diferente, empresa já existe', 'Empresa e contato reaproveitados. Negociação nova, ' +
        'porque a abordagem é outra.') +
      caso('Dois contatos da mesma empresa nova, no mesmo lote', 'O segundo já encontra a empresa que o ' +
        'primeiro acabou de criar.') +
      caso('Lead sem empresa nenhuma', 'A conta nasce com o nome da pessoa. Se ela voltar depois, é ' +
        'reconhecida pelo perfil do LinkedIn e não vira uma segunda conta homônima.') +
      caso('Lead sem campanha', 'Entra na negociação de LH que já estiver aberta, em vez de abrir uma ' +
        'paralela rotulada com nada.') +
      caso('A mesma conversa reenviada', 'O Linked Helper reenvia o histórico inteiro a cada interação. ' +
        'Só as mensagens novas viram evidência — senão a mesma frase do cliente subiria o índice três vezes.') +
      caso('Negociação da empresa já encerrada', 'Não recebe interação nova: abre uma nova. O desfecho ' +
        'congelou a foto da decisão, e mexer nele reescreveria um resultado já apurado.') +
      caso('Empresa cadastrada à mão, resposta chega pelo LH depois', 'A resposta entra na negociação que ' +
        'já existe, desde que ela seja a única aberta na conta.') +
      '</tbody></table></div>' +

      '<h3>Os negativos não somem, viram auditoria</h3>' +
      '<p class="small">Toda resposta lida como recusa fica registrada em ' +
      '<strong>Configuração → Não conformidades das campanhas</strong>, agrupada por campanha e fora do ' +
      'pipeline. Não é para perseguir aquelas pessoas: é para consertar a campanha, que é o que de fato ' +
      'muda o resultado da próxima. E os que você excluiu à mão ficam em ' +
      '<strong>Leads descartados</strong>, com um botão para voltar a mostrar.</p>' +

      '<h3>O caminho de volta: a lista que SAI para uma campanha</h3>' +
      '<p class="small">Tudo acima é o que o Linked Helper <em>responde</em>. O painel ' +
      '<strong>Lista para uma campanha</strong>, no fim de Configuração → Linked Helper, é o contrário: ' +
      'escolher, dentro da carteira que já existe, <strong>para quem a próxima campanha vai falar</strong> — ' +
      'e baixar o arquivo pronto para subir lá.</p>' +
      '<p class="small">Por que montar a lista aqui e não numa busca do LinkedIn: a carteira já sabe o ' +
      'segmento, a cidade e, principalmente, <strong>quem já está em conversa</strong>. Lista montada por ' +
      'busca repete convite com quem respondeu na semana passada; montada daqui, ela sai recortada por ' +
      'onde o negócio está.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      caso('De onde', 'O recorte que mais muda a campanha. <strong>Pipeline</strong> é conta com negócio ' +
        'aberto e fora da nutrição — ali a campanha serve para ampliar o grupo comprador, não para se ' +
        'apresentar. <strong>Nutrição</strong> é conta que esfriou, e ali a campanha é de reaquecimento. ' +
        'São duas conversas que não têm nada a ver uma com a outra.') +
      caso('Segmento e cidade', 'Saem das empresas que existem na carteira, não de uma lista fixa: ' +
        'segmento que ninguém usa não aparece, cidade nova aparece sozinha.') +
      caso('Quem não tem negócio aberto', 'Fica de fora sempre, inclusive em “Os dois”. Para esses a tela ' +
        'é Cadastros, não campanha.') +
      caso('Uma pessoa, uma linha', 'Quem está cadastrado em duas empresas entra uma vez só. Perfil ' +
        'repetido faz o Linked Helper convidar duas vezes, e <strong>convite repetido queima a conta de ' +
        'quem envia</strong> — é o erro mais caro que uma lista mal montada causa.') +
      caso('Quem fica de fora aparece', 'Com o motivo, embaixo da lista: sem LinkedIn no cadastro, link ' +
        'do Sales Navigator, link da empresa em vez da pessoa. Cada linha dessas é um cadastro a ' +
        'preencher — preenchido, entra na próxima lista sozinho. Um número como “47 de 112” sem dizer o ' +
        'que houve com os outros 65 é o tipo de número que faz a pessoa desconfiar do app inteiro.') +
      '</tbody></table></div>' +
      '<p class="small">O endereço de cada perfil é <strong>normalizado</strong> antes de entrar no ' +
      'arquivo. O que está gravado na carteira veio de planilha, de digitação e da própria ponte, então ' +
      'aparece de quatro jeitos — <code>linkedin.com/in/fulano</code>, com <code>https://</code>, com ' +
      'subdomínio de país, ou só o apelido. Todos viram ' +
      '<code>https://www.linkedin.com/in/fulano</code>: mandar o endereço cru é mandar linha que o ' +
      'importador descarta em silêncio.</p>' +

      '<h3>Os dois arquivos, e por que são dois</h3>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      caso('CSV', 'A URL do perfil na <strong>primeira coluna</strong>, chamada <code>profileUrl</code> — ' +
        'é a primeira porque é onde todo importador procura primeiro. Depois dela vêm ' +
        '<code>firstName</code>, <code>fullName</code>, <code>position</code>, ' +
        '<code>companyName</code>, <code>segment</code>, <code>city</code> e <code>state</code>. ' +
        'Cabeçalho em inglês porque é o que as telas de mapeamento de coluna esperam ver. Vírgula, aspas ' +
        'em tudo e UTF-8 sem BOM — o CSV internacional. O importador <em>deste</em> app usa ponto e ' +
        'vírgula, mas ele é brasileiro e o Linked Helper não é.') +
      caso('TXT', 'Uma URL por linha e mais nada. Não tem cabeçalho para errar, e é o que funciona em toda ' +
        'versão de toda ferramenta. <strong>Use este se o CSV for recusado.</strong>') +
      '</tbody></table></div>' +
      '<p class="small muted">O nome do arquivo carrega o recorte e a data — ' +
      '<code>lh-pipeline-bebidas-jacarei-sp-2026-10-09.csv</code>. Baixar três listas numa manhã e ficar ' +
      'com “lista.csv”, “lista (1).csv” e “lista (2).csv” é perder as três: na hora de subir, ninguém ' +
      'sabe qual é qual.</p>' +

      '<h3>O que esta integração ainda não faz</h3>' +
      '<ul class="small">' +
      '<li><strong>Nome parecido demais continua não casando.</strong> "Alfa" não encontra "Alfa Seguros", ' +
      'porque "Seguros" diz o que a empresa faz e pode ser outra. Já "Envu" encontra "Envu Brasil Ltda", ' +
      'porque o que sobra é só invólucro jurídico e geográfico.</li>' +
      '<li><strong>Ambiguidade não vira palpite.</strong> Se duas contas casarem com o mesmo nome, nenhuma ' +
      'é escolhida e nasce uma conta nova. Juntar duas contas depois é um clique; separar uma conta que ' +
      'fundiu errado é reescrever histórico.</li>' +
      '<li><strong>Duas negociações abertas na mesma conta.</strong> Aí o app não sabe qual delas a ' +
      'resposta continua, e abre uma nova em vez de anexar à errada.</li>' +
      '<li><strong>O formato exato que o importador do Linked Helper prefere.</strong> O arquivo é feito ' +
      'do jeito que o importador de qualquer ferramenta aceita — URL na primeira coluna, cabeçalho em ' +
      'inglês, CSV internacional — e não do jeito que uma versão específica talvez prefira. Se a tela de ' +
      'importação pedir outros nomes de coluna, o TXT resolve na hora, e os nomes das colunas do CSV são ' +
      'uma linha de código para mudar.</li>' +
      '</ul>' +
      '<p class="small">A ponte guarda cada entrega por <strong>trinta dias</strong>. O que ninguém importar ' +
      'nesse prazo se apaga sozinho.</p>' +
      '</div>';
  }

  /* ---------------- Manual: o dia do vendedor ----------------

     O manual já tinha "O caminho do vendedor", que é o ciclo de UM negócio,
     do primeiro contato ao desfecho. Faltava o outro corte, que é o que a
     pessoa realmente vive: o DIA, com trinta negócios ao mesmo tempo.

     E faltava, principalmente, a tabela do fim. A pergunta que um vendedor
     faz sobre qualquer CRM é "o que eu ganho por alimentar isto?", e um
     sistema que não responde isso em uma tela é um sistema que vai ser
     preenchido pela metade. */
  /* A Fila, explicada. Precisa estar no manual por um motivo específico: ela
     ORDENA, e toda ordenação que a pessoa não entende ela desobedece. */
  function manualDaFila() {
    const degrau = function (posicao, quando, porque) {
      return '<tr><td style="white-space:nowrap"><strong>' + esc(posicao) + '</strong></td>' +
        '<td class="small">' + quando + '</td><td class="small muted">' + porque + '</td></tr>';
    };

    return '<div class="card" id="m-fila"><h2>A Fila: o que fazer primeiro, e com quem</h2>' +

      '<p class="small">A tela <strong>Hoje</strong> não lista a carteira — ela ordena. Cada linha ' +
      'responde três perguntas que, separadas, não viram ação: <strong>o que fazer</strong>, ' +
      '<strong>com quem</strong> e <strong>por qual canal</strong>. Mais o motivo de estar naquela ' +
      'posição, porque ordem sem motivo é ordem que ninguém obedece.</p>' +

      '<h3>A ordem, e por quê</h3>' +
      '<div class="tabela-rolagem"><table><tbody>' +
      degrau('1º', 'Compromisso vencido',
        'Você combinou uma data com o cliente e ela passou. Nada custa mais caro à confiança.') +
      degrau('2º', 'O cliente se mexeu e o registro não',
        'Ele abriu o documento, respondeu, voltou ao site — e a última evidência é bem mais velha ' +
        'que isso. É o melhor instante que este sistema sabe calcular.') +
      degrau('3º', 'Tarefa sua vencida', 'Você marcou e não fez.') +
      degrau('4º', 'Proposta emitida sem o decisor econômico, ou com lacuna de decisão',
        'Proposta que anda sem quem assina é proposta que volta.') +
      degrau('5º', 'Parado: já houve evidência, e sumiu',
        'Aqui é resgate de verdade — o negócio existiu e esfriou.') +
      degrau('6º', 'Sem microdecisão no mês, ou dependendo de uma pessoa só',
        'Não está atrasado; está frágil.') +
      degrau('7º', 'Em dia', 'Segue a próxima decisão da escada.') +
      '</tbody></table></div>' +

      '<h3>Cada cartão explica o que vê, e não só o primeiro motivo</h3>' +
      '<p class="small">A ordem da tabela acima é uma <strong>escada</strong>: a primeira condição que ' +
      'casa decide a posição, e as outras param de ser consultadas. Isso ordena certo e explica mal — ' +
      'o cartão dizia “Compromisso vencido há 3 dias” e você não ficava sabendo que, no mesmo negócio, ' +
      'a evidência tinha quarenta dias, havia uma pessoa só mapeada e a proposta saiu com metade da ' +
      'prontidão. Uma causa de quatro. Você agia na que viu e o negócio continuava doente.</p>' +
      '<p class="small">Agora cada cartão traz três blocos, nesta ordem, que são as três perguntas de ' +
      'quem abre o app de manhã:</p>' +
      '<div class="tabela-rolagem"><table><tbody>' +
      '<tr><td class="rotulo-manual"><strong>Por que está aqui</strong></td><td class="small">' +
      '<strong>Todas</strong> as causas verdadeiras, da mais pesada para a mais leve, com a principal ' +
      'na frente — e, embaixo de cada uma, o que ela cobra se ficar como está. O que passa de três ' +
      'fica num “+N outras causas”: nada é escondido, só dobrado.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Atrasado</strong></td><td class="small">A dívida com data: ' +
      'combinado vencido, tarefa sua vencida, revisão de nutrição, previsão de fechamento que já passou, ' +
      'evidência além dos quatorze dias, etapa parada. Cada linha com <strong>quantos dias</strong> e o ' +
      'que fazer com ela.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Para acelerar</strong></td><td class="small">A ordem de ' +
      'execução: o que fazer primeiro, com quem, e por qual canal. Sai da próxima decisão da escada, dos ' +
      'papéis críticos que faltam, dos gates da proposta e das notas altas sem prova.</td></tr>' +
      '</tbody></table></div>' +
      '<p class="small"><strong>Nada disso depende de internet nem do assistente.</strong> É cálculo ' +
      'sobre os dados que já estão aqui: instantâneo, de graça, e você pode conferir cada linha.</p>' +

      '<h3>O botão “Análise das pendências e ações”</h3>' +
      '<p class="small">Fica no alto da tela Hoje, à esquerda de <strong>+ Tarefa</strong>. Ele responde a ' +
      'pergunta que os cartões, sozinhos, não respondem: <em>o que está acontecendo com a minha ' +
      'carteira, e por onde eu começo</em>. Sessenta e nove cartões urgentes lidos um a um continuam ' +
      'sendo sessenta e nove problemas — e ninguém começa o dia com sessenta e nove problemas.</p>' +
      '<p class="small">Ao clicar, ele faz duas coisas nesta ordem: <strong>relê com o assistente todos ' +
      'os negócios urgentes</strong> (forçando, porque quem pede a análise quer a de agora, não a de ' +
      'hoje de manhã) e depois <strong>conta o padrão da carteira inteira</strong> e manda essa ' +
      'contagem para o assistente escrever o que ela significa.</p>' +
      '<p class="small">O que ele procura é o que se <strong>repete</strong>. Quarenta negócios travados ' +
      'no mesmo degrau não pedem quarenta conversas: pedem uma mudança no que você faz na primeira. ' +
      'Oito combinados que venceram todos no mesmo dia não são oito cobranças: são um lote que entrou ' +
      'junto e que ninguém negociou um a um — e tratar o lote é uma ação só.</p>' +
      '<p class="small">A contagem é <strong>cálculo</strong>, e aparece mesmo sem assistente. O que o ' +
      'assistente acrescenta é a leitura. O resultado fica guardado <strong>neste aparelho</strong>, ' +
      'por um dia: é um retrato que se refaz num clique, e não vale uma coluna nova no banco.</p>' +
      '<p class="small muted">Ele é um botão, e não algo que acontece sozinho a cada tela, por um motivo ' +
      'só: cada negócio relido é uma chamada paga. Acima de vinte e cinco urgentes, o app pergunta antes.</p>' +

      '<h3>A leitura do assistente, uma vez por dia</h3>' +
      '<p class="small">Quando o assistente de IA está publicado, ele passa pela fila <strong>uma vez ' +
      'por dia</strong>, na ordem dela, e acrescenta o que a conta não sabe fazer: ler o texto. As atas, ' +
      'as notas, o que o cliente escreveu com as palavras dele. Dali sai um parágrafo e as próximas ' +
      'jogadas.</p>' +
      '<p class="small">Três coisas que vale saber: ele <strong>não repete</strong> o que os três blocos ' +
      'já dizem — recebe o cálculo junto e é instruído a acrescentar, não a reescrever; a leitura vem ' +
      '<strong>sempre datada</strong>, e se for de ontem o cartão avisa, porque leitura velha apresentada ' +
      'como de hoje é pior do que leitura nenhuma; e se ele não estiver no ar, <strong>a tela não fica ' +
      'vazia</strong> — fica sem o parágrafo dele.</p>' +

      '<h3>Quando você já agiu: a faixa <em>Aguardando</em></h3>' +
      '<p class="small">Você ligou, combinou o próximo passo e marcou a tarefa para o dia 15. A ação ' +
      'está tomada; o que falta é o cliente voltar. Até a v235 a conta continuava na faixa ' +
      '<strong>Urgente</strong> com o combinado vencido na frente — e o app cobrava de manhã um ' +
      'trabalho que você tinha feito na véspera. <strong>Cobrança de serviço já prestado é o jeito ' +
      'mais rápido de uma lista perder a autoridade.</strong></p>' +
      '<p class="small">Agora, quando existe uma tarefa sua <strong>marcada e ainda no prazo</strong>, ' +
      'o negócio sai da fila do dia e vai para uma quinta faixa, <strong>Aguardando</strong>: a única ' +
      'que não é um estado de alerta. O cartão diz a data e o título do próximo passo, e o restante — ' +
      'o combinado vencido, os dias sem evidência, a pessoa só — continua escrito, mas como ' +
      '<strong>retrato da conta</strong>, não como o que fazer hoje. Nada é escondido; é reclassificado.</p>' +
      '<p class="small">Se o cliente não voltar até a data, a tarefa vence e <strong>tudo isto sobe de ' +
      'novo</strong> — agora como tarefa sua vencida, que é mais pesada do que era antes.</p>' +
      '<p class="small">Três coisas <strong>furam a espera</strong> e vêm antes dela, porque marcar uma ' +
      'tarefa não pode comprar silêncio:</p>' +
      '<div class="tabela-rolagem"><table><tbody>' +
      '<tr><td class="rotulo-manual"><strong>Revisão de nutrição vencida</strong></td><td class="small">' +
      'É outra conversa, com outra data, e não foi ela que você marcou.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Tarefa sua vencida</strong></td><td class="small">' +
      'Marcar o próximo passo e não cumprir é o contrário de agir. É o que impede alguém de esconder a ' +
      'carteira inteira marcando tarefas para o mês que vem.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>O cliente se mexeu agora</strong></td><td class="small">' +
      'Sinal novo dele vale mais que qualquer coisa que você tenha agendado antes — inclusive a espera.' +
      '</td></tr>' +
      '</tbody></table></div>' +
      '<p class="small muted">Vale a tarefa <strong>mais próxima</strong> que ainda não venceu. Marcar ' +
      'dez tarefas para a mesma conta não compra dez esperas: compra uma, até a primeira data.</p>' +

      '<h3>As cores, e a lista inteira</h3>' +
      '<p class="small">Urgente é laranja claro, prioridade azul claro, em dia verde claro, ' +
      '<em>Aguardando</em> cinza-azulado, e o botão “Todos” lilás. A palavra continua escrita em cada ' +
      'cartão de propósito: quem não distingue os matizes lê <em>Urgente</em> do mesmo jeito.</p>' +
      '<p class="small">E a lista é a carteira <strong>inteira</strong>, paginada: dez por tela no ' +
      'padrão, com opção de vinte e cinco, cinquenta ou cem. Antes ela parava no décimo quinto negócio ' +
      'sem avisar que havia mais.</p>' +

      '<h3>Os leads que nunca começaram ficam fora — de propósito</h3>' +
      '<p class="small">Um lead importado de campanha que nunca produziu evidência do cliente ' +
      '<strong>não é um negócio atrasado: é um negócio que nunca começou.</strong> Antes eles ' +
      'entravam como urgência, porque o contador de “dias sem evidência” conta desde a criação — e ' +
      'uma carteira com noventa e oito leads assim abria com noventa e oito linhas vermelhas.</p>' +
      '<p class="small">Lista em que tudo é urgente não diz nada, e a primeira coisa que a pessoa ' +
      'faz é parar de olhar. Por isso eles saem da fila e viram <strong>uma linha só</strong>, no ' +
      'alto: quantos são, e o botão que leva à triagem em lote no ' +
      '<a href="#/nutricao">Processo de Nutrição</a>. Qualquer evidência nova do cliente tira o ' +
      'negócio da triagem e o coloca na fila, sozinho.</p>' +

      '<h3>Com quem falar — e por que é sempre essa pessoa</h3>' +
      '<p class="small">Saber que falta provar o <em>Impacto</em> não faz ninguém agir. Saber que ' +
      'quem prova o Impacto é o <strong>Financeiro</strong>, e que o Financeiro desta conta é a ' +
      'Ana, faz. Cada decisão tem o papel do grupo comprador que melhor a prova:</p>' +
      '<div class="tabela-rolagem"><table><thead><tr><th>Decisão</th><th>Quem prova</th></tr></thead><tbody>' +
      P.DIMENSOES.map(function (d) {
        const papeis = P.PAPEL_QUE_PROVA[d.id] || [];
        return '<tr><td style="white-space:nowrap"><strong>' + esc(d.nome) + '</strong></td>' +
          '<td class="small">' + esc(papeis.join(' · ')) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<p class="small muted" style="margin-top:8px">Número que o Financeiro aceita sobrevive à ' +
      'reunião de orçamento; número que só o usuário aceita, não necessariamente. É por isso que a ' +
      'ordem dentro de cada linha importa.</p>' +
      '<p class="small"><strong>E quando ninguém da conta tem o papel?</strong> Isso não é um beco — ' +
      'é a própria recomendação. A Fila passa a dizer “falta o Financeiro aqui: peça ao Davi ' +
      '(Champion) a apresentação”, porque quem abre porta dentro do cliente é o champion.</p>' +

      '<h3>Por qual canal</h3>' +
      '<p class="small">A ordem é esta, e cada degrau tem razão: <strong>o canal que a pessoa ' +
      'prefere</strong> (canal que ela não responde é canal onde a decisão não anda), depois ' +
      '<strong>o que o método pede</strong> para aquela decisão — decisão ainda não admitida se ' +
      'abre por conversa, decisão de número se sustenta por material — e por último ' +
      '<strong>o que temos para alcançá-la</strong>. Se faltar o contato no cadastro, a linha avisa ' +
      'em vez de mandar você tentar.</p>' +

      '<p class="small muted" style="margin-top:10px">A Fila não usa IA e não custa nada: é ' +
      'aritmética sobre o que já está registrado. Ela não inventa prioridade — ela mostra a que ' +
      'os seus próprios dados já indicavam, e que ninguém tinha tempo de calcular todo dia.</p>' +
      '</div>';
  }

  /* ---------- o caderninho, no manual ----------
     A seção existe menos para ensinar a usar (não há o que ensinar: é uma
     caixa de texto) e mais para dizer o que ela NÃO é. Sem isso, em um mês a
     tela vira uma segunda lista de tarefas paralela à de verdade — e aí
     existem dois lugares para procurar a mesma coisa, que é o mesmo que não
     ter lugar nenhum. */
  /* ---------- o Potencial, no manual ----------
     A seção é longa porque a conta é pública de propósito. Qualificação
     fechada é qualificação que ninguém contesta, e qualificação que ninguém
     contesta nunca melhora — foi o que matou o campo do RD Station para o
     Alexandre. Quem lê aqui consegue dizer “este peso está errado”, e isso é
     a funcionalidade. */
  function manualDoPotencial() {
    const faixa = function (f) {
      return '<tr><td style="white-space:nowrap"><span class="pill ' + f.classe + ' mini">' +
        esc(f.rotulo) + '</span></td><td class="small" style="white-space:nowrap">' +
        (f.minimo === -Infinity ? 'abaixo de 18' : f.minimo + ' ou mais') +
        '</td><td class="small muted">' + esc(f.acao) + '</td></tr>';
    };
    const ponto = function (quanto, oQue, porque) {
      return '<tr><td style="white-space:nowrap"><strong>' + esc(quanto) + '</strong></td>' +
        '<td class="small">' + oQue + '</td><td class="small muted">' + porque + '</td></tr>';
    };

    return '<div class="card" id="m-potencial"><h2>Potencial: vale a primeira hora?</h2>' +

      '<p class="small">O IAD responde <em>“a decisão está madura?”</em>. A pergunta pressupõe ' +
      'que exista decisão para medir — e cem leads recém-importados do LinkedIn não têm nenhuma: ' +
      '<strong>todos marcam IAD 0</strong>. IAD 0 não distingue o diretor de operações de uma ' +
      'indústria do segmento onde já ganhamos do estagiário de uma empresa sem site.</p>' +

      '<p class="small">Potencial responde a pergunta <strong>anterior</strong>: vale a primeira ' +
      'hora? É a única coisa que o vendedor precisa saber diante de uma lista de cem nomes.</p>' +

      '<h3>As quatro faixas</h3>' +
      '<p class="small">Os nomes são de ação, não de temperatura. “Morno” não diz o que fazer na ' +
      'segunda de manhã; “A conferir” diz.</p>' +
      '<div class="tabela-rolagem"><table><thead><tr><th>Faixa</th><th>Pontos</th><th>O que fazer</th>' +
      '</tr></thead><tbody>' + P.FAIXAS_POTENCIAL.map(faixa).join('') + '</tbody></table></div>' +

      '<h3>Duas contas, somadas só no fim</h3>' +
      '<p class="small">São mantidas separadas de propósito, porque pedem ações opostas. ' +
      '<strong>Perfil 45 com interesse 0</strong> é um lead para trabalhar: a empresa certa, a ' +
      'pessoa certa, e ninguém falou com ela ainda. <strong>Interesse 40 com perfil 8</strong> é ' +
      'curiosidade que consome tempo. A soma sozinha confundiria os dois em “45”.</p>' +

      '<h4>Perfil — até 50 pontos: parece com quem compra da gente?</h4>' +
      '<div class="tabela-rolagem"><table><tbody>' +
      ponto('até 18', 'O papel do grupo comprador mais alto que você tem na conta',
        'Decisor econômico 18 · Champion 14 · Financeiro e Operações 12 · Técnico 10 · Compras 8 · Jurídico 6 · Usuário 4. ' +
        'O mais alto, e não a média: falar com o decisor vale o que vale mesmo com três usuários no cadastro.') +
      ponto('até 8', 'A senioridade escrita no cargo',
        'Decide 8 · manda em alguém 5 · faz e opina 3 · aprendiz 1. Correlacionada com o papel e não igual: ' +
        '“Gerente de Compras” é sênior e é Compras; “Analista Ambiental” é júnior e é Operações.') +
      ponto('até 10', 'A empresa existe de verdade',
        'Nome real 4 · site 3 · cidade 2 · CNPJ 1. Lead importado sem empresa vira conta ' +
        '“Fulano (empresa não informada)”, que não é uma empresa — é alguém que ninguém terminou de cadastrar.') +
      ponto('até 14', 'O segmento, aprendido da sua própria carteira',
        'Já ganhamos ali 14 · a decisão já andou ali (IAD 8+) 9 · nunca produziu nada 2 · sem segmento 0. ' +
        '<strong>Nada disso é digitado por ninguém:</strong> sai dos seus desfechos. Lista de ICP digitada ' +
        'envelhece calada, e ninguém volta para corrigi-la.') +
      '</tbody></table></div>' +
      '<p class="tiny muted">Enquanto a carteira não tiver nenhum ganho e nenhum negócio que andou, ' +
      'o segmento entra <strong>neutro</strong> (7) para todo mundo, e a pílula diz isso. Zerar ' +
      'todos por uma falta que é nossa, e não dos leads, seria mentir com número.</p>' +

      '<h4>Interesse — até 50 pontos: ele já se mexeu?</h4>' +
      '<div class="tabela-rolagem"><table><tbody>' +
      ponto('18', 'O cliente produziu alguma evidência', 'Respondeu, perguntou, mandou um número. É o degrau que separa lead de conversa.') +
      ponto('+8', 'Foram duas ou mais', 'Uma resposta é educação; duas é interesse.') +
      ponto('até +10', 'Há quanto tempo foi a última', 'Até 14 dias 10 · até 30 dias 5 · até 60 dias 2 · mais que isso, zero.') +
      ponto('até +10', 'Sinal do comprador nos últimos 30 dias', 'Sinal forte 10 · qualquer sinal 5. Abrir a proposta de novo é ele se mexendo sem você.') +
      ponto('+8', 'Existe próximo passo combinado com data', 'Compromisso com data é a prova mais barata de que a conversa continua.') +
      ponto('+6', 'Dá para falar fora do LinkedIn', 'Telefone ou e-mail. Não é interesse dele, é viabilidade sua — mas a pergunta da tela é “vale a primeira hora?”.') +
      '</tbody></table></div>' +
      '<p class="tiny muted">O que você fez <strong>não</strong> entra: tarefa cumprida, e-mail enviado, ' +
      'conexão aceita. É a mesma regra do IAD — esforço do vendedor não é evidência do comprador.</p>' +

      '<h3>A trava</h3>' +
      '<p class="small">Se a pessoa já <strong>respondeu não</strong> numa campanha, o Potencial fica ' +
      'travado em <span class="pill dead mini">Fora do alvo</span> — e a pílula diz em qual campanha e ' +
      'com que motivo. “Não” não se compensa com cargo bom.</p>' +

      '<h3>O que isto NÃO faz</h3>' +
      '<div class="passos-manual">' +
      '<div class="passo-manual"><div class="numero">1</div><div><strong>Não mexe no IAD</strong>' +
      '<span class="tiny muted">Nenhum ponto daqui entra no índice, na saúde nem na classificação do ' +
      'pipeline. Potencial é sobre o <em>lead</em>; IAD é sobre a <em>decisão</em>. No dia em que um lead ' +
      '“promissor” subir o índice sozinho, o índice deixa de medir o comprador e passa a medir a nossa ' +
      'esperança.</span></div></div>' +
      '<div class="passo-manual"><div class="numero">2</div><div><strong>Não usa IA e não custa nada</strong>' +
      '<span class="tiny muted">É aritmética sobre o que já está cadastrado. Funciona com o assistente ' +
      'fora do ar, e continua funcionando para sempre.</span></div></div>' +
      '<div class="passo-manual"><div class="numero">3</div><div><strong>Não é previsão de venda</strong>' +
      '<span class="tiny muted">Potencial alto não quer dizer que fecha. Quer dizer que vale a hora. ' +
      'Quem diz se fecha são as oito decisões, e elas só andam com evidência do cliente.</span></div></div>' +
      '<div class="passo-manual"><div class="numero">4</div><div><strong>Não fica guardado</strong>' +
      '<span class="tiny muted">É recalculado toda vez que a tela abre. Preencher o segmento de uma ' +
      'conta, ou cadastrar o telefone de um contato, muda a faixa na hora — e é por isso que a pílula ' +
      'mostra o motivo: ela está te dizendo o que falta.</span></div></div>' +
      '</div>' +

      '<h3>Onde ele aparece</h3>' +
      '<p class="small"><strong>No cabeçalho de cada negócio</strong>, ao lado do título — passe o mouse ' +
      'para ver a conta inteira. <strong>Na Nutrição</strong>, como coluna, como filtro e como ' +
      '<strong>ordem da lista</strong>: sem isso os cem leads saem na ordem em que a ponte os entregou, ' +
      'que não é ordem nenhuma. E <strong>no Hoje</strong>, na linha de triagem, dizendo quantos daquele ' +
      'monte valem a primeira hora — “noventa e oito coisas para triar” é tarefa que ninguém começa; ' +
      '“seis valem a pena” é tarefa de hoje.</p>' +
      '</div>';
  }

  /* ---------- o Processo de Nutrição, no manual ----------
     O manual explicava nutrição como ESTADO de um negócio (em “O caminho do
     vendedor”), e isso continua certo. O que faltava era a TELA: o lugar onde
     se decide cem de uma vez. São duas coisas diferentes — uma é o que
     acontece com a conta, a outra é o trabalho de segunda-feira — e quem
     procurava a segunda achava a primeira e ia embora. */
  function manualDaNutricao() {
    return '<div class="card" id="m-nutricao"><h2>O Processo de Nutrição: triar cem de uma vez</h2>' +

      '<p class="small muted">O que a nutrição é — o estado, o que acontece com o negócio, ' +
      'como ele volta — está em <a href="#/playbook" onclick="App.irNoManual(\'m-caminho\');return false;">' +
      'O caminho do vendedor</a>. Esta seção é sobre a <strong>tela</strong>: o trabalho de decidir ' +
      'em lote quem sai da previsão e quem volta.</p>' +

      '<p class="small">Ele saiu de dentro de Cadastros e virou item próprio do menu, logo abaixo. ' +
      'Aba de cadastro é lugar de lista que quase não muda; isto aqui é trabalho de todo mês — e ' +
      'trabalho que mora dentro de um cadastro é trabalho que ninguém faz.</p>' +

      '<h3>Duas abas, os mesmos filtros</h3>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      '<tr><td class="rotulo-manual"><strong>Carteira Ativa</strong></td><td>' +
      '<strong>Os negócios abertos que contam na previsão</strong>' +
      '<span class="tiny muted">É daqui que sai quem ainda não está pronto. O número na aba é ' +
      'quantos você tem fora da nutrição.</span></td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Leads em Nutrição</strong></td><td>' +
      '<strong>Os que saíram da previsão e continuam abertos</strong>' +
      '<span class="tiny muted">Com motivo e data para voltar a olhar. Aqui você vê quem tem revisão ' +
      'vencida e devolve à carteira quem já ficou pronto.</span></td></tr>' +
      '</tbody></table></div>' +
      '<p class="tiny muted">Os filtros valem para as duas abas de propósito: filtrar a carteira, ' +
      'trocar de aba e ver outra régua faria você comparar duas listas que não são comparáveis.</p>' +

      '<h3>A lista sai ordenada por Potencial</h3>' +
      '<p class="small">Sem isso, cem leads importados saem na ordem em que a ponte os entregou — que ' +
      'não é ordem nenhuma — e todos marcam IAD 0, então o índice também não separa. Com o ' +
      '<a href="#/playbook" onclick="App.irNoManual(\'m-potencial\');return false;">Potencial</a> ' +
      'em coluna, em filtro e na ordem, a primeira tela já mostra quem vale a primeira hora. ' +
      'Empate no Potencial desempata pelo IAD.</p>' +
      '<p class="tiny muted">Quem já respondeu <strong>não</strong> vai para o fim mesmo tendo cargo alto: ' +
      'a trava vence os pontos. Ordenar pelos pontos poria um “não” de diretor no alto da lista.</p>' +

      '<h3>O trânsito em lote</h3>' +
      '<div class="passos-manual">' +
      '<div class="passo-manual"><div class="numero">1</div><div><strong>Filtre</strong>' +
      '<span class="tiny muted">Por campanha (na busca), responsável, segmento, Potencial e saúde da ' +
      'decisão. “Marcar todos” marca <strong>os que passam no filtro</strong>, nunca os cento e um — ' +
      'marcar o que não está na tela é a forma mais fácil de mover um negócio sem querer.</span></div></div>' +
      '<div class="passo-manual"><div class="numero">2</div><div><strong>Marque e mova</strong>' +
      '<span class="tiny muted">O motivo e a data de revisão são pedidos uma vez e valem para o lote ' +
      'inteiro. Nutrição sem data é esquecimento com nome bonito.</span></div></div>' +
      '<div class="passo-manual"><div class="numero">3</div><div><strong>Nada disso encerra ninguém</strong>' +
      '<span class="tiny muted">Mover para nutrição tira da previsão e <strong>mantém na agenda</strong>. ' +
      'Encerrar é a forma mais cara de esquecer de uma conta — ela sai da previsão E da cabeça de todo ' +
      'mundo. A passagem fica no histórico.</span></div></div>' +
      '<div class="passo-manual"><div class="numero">4</div><div><strong>Volta sozinho</strong>' +
      '<span class="tiny muted">Qualquer evidência nova do cliente devolve o negócio à carteira sem ' +
      'ninguém apertar nada — é esse o sinal que a nutrição estava esperando. O botão de devolver ' +
      'existe para quando o motivo deixou de valer: o orçamento saiu, o contrato do concorrente venceu, ' +
      'a obra acabou.</span></div></div>' +
      '</div>' +

      '<h3>A outra porta: selecionar direto no Pipeline</h3>' +
      '<p class="small">Você nem sempre descobre que um negócio não vai a lugar nenhum aqui — ' +
      'descobre olhando o Pipeline. Por isso o mesmo trabalho tem uma segunda porta: no ' +
      '<strong>Pipeline em lista</strong>, o botão <strong>☑ Selecionar várias</strong> no canto ' +
      'inferior direito liga o modo seleção. Aí o clique no cartão <em>marca</em> em vez de abrir, ' +
      'e a mesma barra aparece com “Mover N para nutrição”.</p>' +
      '<ul class="small">' +
      '<li>O <strong>cartão inteiro</strong> é o alvo do clique, e não uma caixinha no canto — no ' +
      'celular acertar a caixinha é o que faz ninguém triar.</li>' +
      '<li>“Marcar as N” marca <strong>as que estão na tela</strong>, respeitando os filtros e a busca.</li>' +
      '<li>Quem já está em nutrição ou já foi encerrado aparece apagado, com um traço no lugar da ' +
      'marca, e diz por que não dá.</li>' +
      '<li>Abrir um negócio para conferir <strong>não perde</strong> o que você já marcou. Sair para ' +
      'outra tela, sim: seleção é de uma sessão de triagem, não um estado da carteira.</li>' +
      '<li>Só na lista. No kanban o cartão já carrega o arrasto, e um clique que às vezes abre, às ' +
      'vezes marca e às vezes arrasta é um clique em que ninguém confia.</li>' +
      '</ul>' +

      '<h3>E depois: a tela de Tarefas separa os dois</h3>' +
      '<p class="small">Mover cem leads para nutrição tira os cem da previsão, mas as <strong>tarefas ' +
      'deles continuam existindo</strong> — e continuam vencendo. Era assim que “93 atrasadas” virava ' +
      'um número que ninguém olhava: quase todas de negócios que o próprio vendedor tinha adiado de ' +
      'propósito.</p>' +
      '<p class="small">Em <strong>Tarefas</strong>, o filtro <strong>Carteira</strong> separa:</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      '<tr><td class="rotulo-manual"><strong>Pipeline e nutrição</strong></td><td>' +
      '<strong>Tudo, e é como a tela abre</strong><span class="tiny muted">Nada é escondido por ' +
      'padrão. Quando há atrasadas de negócio nutrido, o resumo da semana diz quantas são e oferece ' +
      'o recorte em um clique.</span></td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Só o pipeline</strong></td><td>' +
      '<strong>O que está de pé hoje</strong><span class="tiny muted">É a pergunta da manhã. Tarefa ' +
      'sem negócio entra aqui: ninguém a adiou.</span></td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Só nutrição</strong></td><td>' +
      '<strong>O que você adiou, para quando for a hora</strong><span class="tiny muted">Útil no dia ' +
      'de revisar a nutrição — e para conferir que o lote foi mesmo para onde você mandou.</span>' +
      '</td></tr>' +
      '</tbody></table></div>' +
      '<p class="tiny muted">O recorte vira etiqueta na barra de filtros, como todos os outros, e sai ' +
      'no ✕. Nenhuma tarefa é apagada nem adiada por causa dele: ela só deixa de disputar espaço ' +
      'com o que é para agora. E retomar o negócio da nutrição devolve as tarefas dele ao ' +
      'pipeline sozinho.</p>' +

      '<h3>⇄ Juntar numa só</h3>' +
      '<p class="small">A mesma venda entra duas vezes com frequência: uma pelo Linked Helper, outra à ' +
      'mão. As duas ficam na carteira competindo pela mesma receita, e a previsão conta o negócio em ' +
      'dobro. Marque as duas e clique em <strong>⇄ Juntar</strong> — o botão só acende com ' +
      '<strong>duas ou mais da MESMA empresa</strong>.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      '<tr><td class="rotulo-manual"><strong>Quem fica</strong></td><td>' +
      '<strong>Você escolhe</strong><span class="tiny muted">O título, o valor, a previsão e a etapa de ' +
      'quem fica são os que sobrevivem. O padrão sugerido é a de <em>mais evidência do cliente</em>, e ' +
      'não a de maior IAD — nota alta sem evidência é justamente o que este app existe para ' +
      'desconfiar. Mas o título bom raramente é o que a importação gerou, então confira.</span></td></tr>' +
      '<tr><td class="rotulo-manual"><strong>O que passa</strong></td><td>' +
      '<strong>Tudo o que é histórico</strong><span class="tiny muted">Eventos, pessoas do grupo ' +
      'comprador, tarefas, sinais, anexos, itens de produto e as notas. Os eventos entram em ordem de ' +
      'data — a evidência de ontem não vai parar no meio da de três meses atrás.</span></td></tr>' +
      '<tr><td class="rotulo-manual"><strong>As oito decisões</strong></td><td>' +
      '<strong>Fica a MAIOR nota de cada uma</strong><span class="tiny muted">E a evidência que a ' +
      'sustenta vem junto, senão a nota ficaria de pé sozinha — que é o defeito que a régua ' +
      'existe para pegar. A confirmação lista quais sobem, antes de você decidir.</span></td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Empresas diferentes</strong></td><td>' +
      '<strong>Não junta, e diz por quê</strong><span class="tiny muted">Duas negociações de empresas ' +
      'diferentes não são uma duplicata — são dois negócios, e juntar apagaria um. Se a EMPRESA é que ' +
      'está duplicada, junte as empresas primeiro em Configuração → Juntar empresas.</span></td></tr>' +
      '</tbody></table></div>' +
      '<p class="tiny muted">Três marcadas viram <strong>uma confirmação só</strong>, com a conta ' +
      'inteira do que vai mudar. Quem clica em três confirmações seguidas para de ler na segunda. ' +
      'Não tem como desfazer — mas o histórico registra cada junção, para a pergunta “onde foi parar ' +
      'aquele negócio” ter resposta daqui a seis meses. O mesmo botão existe dentro de cada negócio, ' +
      'em <strong>Juntar</strong>, para quando você já está com ele aberto.</p>' +
      '<p class="tiny muted">O formulário de motivo e data é o mesmo das duas portas, de propósito: ' +
      'duas cópias divergiriam, e aí o mesmo botão pediria coisas diferentes em lugares diferentes.</p>' +

      '<h3>Por que a triagem não entra na Fila do dia</h3>' +
      '<p class="small">Lead que nunca produziu evidência do cliente não é negócio atrasado: é negócio ' +
      'que <strong>nunca começou</strong>. Se entrasse como urgência, a tela Hoje teria noventa e oito ' +
      'linhas vermelhas e nenhuma prioridade real. Ele fica contado numa linha à parte, que diz quantos ' +
      'daquele monte têm Potencial de sobra, e leva para cá.</p>' +
      '</div>';
  }

  function manualDasNotas() {
    return '<div class="card" id="m-notas"><h2>Notas rápidas: o caderninho</h2>' +

      '<p class="small">Você desliga o telefone com uma frase na cabeça: <em>“ligar para o ' +
      'Carlos da Heineken”</em>. Ela não é uma tarefa ainda — não tem prazo, não tem canal e ' +
      'talvez nem seja daquele negócio. Se o único lugar para guardá-la fosse um formulário com ' +
      'empresa, negociação, canal, decisão alvo e vencimento, ela acabaria num papel. E papel é ' +
      'onde as coisas somem.</p>' +

      '<p class="small">Por isso esta tela não pergunta nada. Tem uma caixa, um botão ' +
      '<strong>🎤 Ditar</strong> e uma lista. <strong>Enter</strong> anota, ' +
      '<strong>Shift+Enter</strong> pula linha, e o cursor volta para a caixa — quem anotou uma ' +
      'coisa quase sempre tem a segunda na ponta da língua.</p>' +

      '<h3>Só você lê</h3>' +
      '<p class="small">Nem gestor nem administrador enxergam as suas notas. Não é detalhe de ' +
      'tela: está escrito na permissão do banco, que devolve apenas as do próprio dono. Um ' +
      'rascunho que o chefe lê é um rascunho onde ninguém escreve o que precisa mesmo lembrar — ' +
      'e aí a tela vira mais um lugar vazio.</p>' +

      '<h3>Virar tarefa: o que o app reconhece sozinho</h3>' +
      '<p class="small">Anotação não move decisão nenhuma. Quem move as oito é tarefa concluída, ' +
      'e é para isso que serve o botão <strong>Virar tarefa</strong>: a nota atravessa para o ' +
      'método e sai da lista. O que ela leva junto sai do próprio texto:</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      '<tr><td class="rotulo-manual"><strong>A empresa</strong></td><td><strong>Nome que bate com ' +
      'uma conta do cadastro</strong><span class="tiny muted">“Heineken” acha a conta. Palavras ' +
      'que aparecem em metade das razões sociais — indústria, comércio, Ltda, Brasil — não ' +
      'valem como pista.</span></td></tr>' +
      '<tr><td class="rotulo-manual"><strong>A pessoa</strong></td><td><strong>Nome que bate com um ' +
      'contato</strong><span class="tiny muted">“Carlos” acha o contato, e o contato manda mais do ' +
      'que a empresa: quem escreve o nome da pessoa quer falar com ela.</span></td></tr>' +
      '<tr><td class="rotulo-manual"><strong>O canal</strong></td><td><strong>O verbo</strong>' +
      '<span class="tiny muted">“ligar” vira Telefonema, “mandar e-mail” vira E-mail, “visitar” ' +
      'vira Visita. Só usa canais que existem no seu catálogo de tipos de tarefa.</span></td></tr>' +
      '</tbody></table></div>' +

      '<p class="small"><strong>Na dúvida, ele não escolhe.</strong> Se o nome bate com duas ' +
      'contas, ou se a empresa tem duas negociações abertas, a tarefa abre em branco e você ' +
      'escolhe. Preencher o negócio errado é pior do que deixar vazio: o errado passa ' +
      'despercebido, o vazio não. E isto aqui não é IA — é comparação de texto, sem chamada ' +
      'nenhuma, sem custo e sem depender de o assistente estar no ar.</p>' +

      '<p class="small muted">A anotação só sai da lista depois que a tarefa existe de verdade. ' +
      'Cancelar o formulário não apaga nada — seria perder o único lugar onde ela estava.</p>' +

      '<h3>O que ela não é</h3>' +
      '<p class="small">Não é uma segunda lista de tarefas. Nota não tem prazo, não aparece na ' +
      'Fila do Hoje como urgência, não entra em relatório, não conta para o IAD e não avisa ' +
      'ninguém. O único lugar onde ela aparece fora daqui é uma linha discreta no alto do ' +
      '<strong>Hoje</strong>, dizendo quantas estão em aberto — porque caderninho que ninguém ' +
      'vê no começo do dia é caderninho perdido.</p>' +
      '</div>';
  }

  function manualDoDia() {
    const bloco = function (hora, titulo, corpo) {
      return '<div class="passo-manual"><div class="numero quando">' +
        esc(hora) + '</div><div><strong>' + esc(titulo) + '</strong>' + corpo + '</div></div>';
    };

    const troca = function (alimenta, volta, onde) {
      return '<tr><td><strong>' + alimenta + '</strong></td><td class="small">' + volta +
        '</td><td class="small muted" style="white-space:nowrap">' + esc(onde) + '</td></tr>';
    };

    return '<div class="card" id="m-dia"><h2>O dia do vendedor: o que alimentar, o que você recebe</h2>' +

      '<p class="small muted">O caminho do vendedor, mais adiante, conta o ciclo de <em>um</em> ' +
      'negócio. Esta seção conta o <em>dia</em> — com trinta negócios ao mesmo tempo, que é a ' +
      'situação real.</p>' +

      '<h3>A rotina</h3>' +

      bloco('de manhã', 'Abra em Hoje e trabalhe A Fila de cima para baixo',
        '<p class="small" style="margin:4px 0 0">A Fila ordena a carteira inteira e diz, em cada ' +
        'linha, <strong>o que fazer, com quem e por qual canal</strong> — e o motivo de aquilo ' +
        'estar naquela posição. Compromisso vencido vem primeiro; logo atrás vem o negócio em que ' +
        'o cliente se mexeu e o registro ficou para trás. Os leads que nunca produziram evidência ' +
        'nenhuma não entram: ficam contados numa linha à parte, como triagem — e essa linha ' +
        'já diz quantos deles têm <strong>Potencial</strong> de sobra.</p>' +
        '<p class="tiny muted" style="margin:4px 0 0">Onde: <strong>⚡ Hoje</strong> · detalhada em ' +
        '<a href="#/playbook" onclick="App.irNoManual(\'m-fila\');return false;">A Fila</a></p>') +

      bloco('antes da conversa', 'Antes de falar com alguém, abra a negociação e leia duas coisas',
        '<p class="small" style="margin:4px 0 0"><strong>Próximos passos</strong>, no alto da aba ' +
        'Decisão, diz qual das oito decisões precisa acontecer agora e sugere o que dizer em cada ' +
        'canal. <strong>Sinais</strong> diz o que essa pessoa andou fazendo sem você — e se aparecer ' +
        '<span class="pill risk">É a hora</span>, é porque ela se mexeu e o registro ficou para trás.</p>' +
        '<p class="tiny muted" style="margin:4px 0 0">Onde: cockpit da negociação → abas ' +
        '<strong>Decisão</strong> e <strong>Sinais</strong></p>') +

      bloco('durante', 'A conversa acontece fora daqui',
        '<p class="small" style="margin:4px 0 0">E vale a regra que não tem exceção: o que ' +
        '<strong>nós</strong> fazemos não move nada. Mandar proposta, cobrar retorno, mover etapa — ' +
        'é trabalho, e trabalho não é avanço. Só o cliente move o índice.</p>') +

      bloco('logo depois', 'Conclua a tarefa contando o que aconteceu — este é o momento que sustenta tudo',
        '<p class="small" style="margin:4px 0 0">Quatro modos, do mais completo ao mais rápido: ' +
        'colar a ata (ou anexar o Word, o PDF, a transcrição), responder quatro perguntas fechadas, ' +
        'registrar uma evidência direta, ou marcar que nada aconteceu — o que também é informação. ' +
        'Se você fechar a janela sem contar, a tarefa continua aberta: é mais honesto do que fechada ' +
        'e vazia.</p>' +
        '<p class="small" style="margin:6px 0 0"><strong>É aqui que o índice anda.</strong> Uma ' +
        'reunião bem contada costuma mover três ou quatro das oito decisões de uma vez.</p>' +
        '<p class="tiny muted" style="margin:4px 0 0">Onde: <strong>Concluir</strong>, na tarefa</p>') +

      bloco('sempre', 'Marque a próxima tarefa antes de fechar a negociação',
        '<p class="small" style="margin:4px 0 0">E diga qual decisão ela pretende provocar. Esse campo ' +
        'é o que transforma agenda em método: sem ele você marca reuniões, com ele você marca reuniões ' +
        '<em>para alguma coisa</em>. Negociação sem próximo passo com data vira alerta no dia seguinte.</p>' +
        '<p class="tiny muted" style="margin:4px 0 0">Onde: <strong>+ Tarefa</strong>, em qualquer tela</p>') +

      bloco('ao enviar algo', 'Documento que você enviar, mande por link rastreado',
        '<p class="small" style="margin:4px 0 0">Proposta, apresentação, estudo de caso. Um link por ' +
        'pessoa. Custa quinze segundos e devolve a única informação que ninguém consegue perguntar: ' +
        'se ele abriu, quando, e se voltou.</p>' +
        '<p class="tiny muted" style="margin:4px 0 0">Onde: cockpit → <strong>Sinais</strong> → ' +
        '<strong>Link rastreado</strong></p>') +

      bloco('ao perceber algo', 'Sinal que você percebeu, anote na hora',
        '<p class="small" style="margin:4px 0 0">Ele visitou seu perfil, curtiu a publicação, mudou ' +
        'de cargo, apareceu numa notícia. Dez segundos. Daqui a três semanas é isso que vai dizer se ' +
        'a conta estava esquentando ou esfriando.</p>' +
        '<p class="tiny muted" style="margin:4px 0 0">Onde: cockpit → <strong>Sinais</strong> → ' +
        '<strong>Registrar sinal</strong></p>') +

      bloco('ao lembrar de algo', 'Anote antes de esquecer — escrito ou ditado',
        '<p class="small" style="margin:4px 0 0">Você desliga o telefone com uma frase na cabeça: ' +
        '<em>“ligar para o Carlos da Heineken”</em>. Não é tarefa ainda, e exigir empresa, canal e ' +
        'vencimento para guardar uma frase é o que faz a frase acabar no papel. Uma caixa, ' +
        '<strong>Enter</strong>, e pronto. Quando virar compromisso, <strong>Virar tarefa</strong> a ' +
        'atravessa para o método já com o negócio e a pessoa que o texto citava. Só você lê.</p>' +
        '<p class="tiny muted" style="margin:4px 0 0">Onde: <strong>📝 Notas rápidas</strong> · detalhada em ' +
        '<a href="#/playbook" onclick="App.irNoManual(\'m-notas\');return false;">Notas rápidas</a></p>') +

      bloco('quando a fila acabar', 'Sobrou tempo? Trie a lista de leads pelo Potencial',
        '<p class="small" style="margin:4px 0 0">É o outro trabalho do dia, e o único que rende quando ' +
        'ninguém tem compromisso vencido. Cem leads importados marcam <strong>IAD 0 todos</strong>, então ' +
        'o índice não separa nada ali — quem separa é o <strong>Potencial</strong>, e a lista já vem ' +
        'ordenada por ele. Trabalhe os <em>Prioritários</em> e os <em>Promissores</em>; mande o resto para ' +
        'nutrição em lote, com motivo e data.</p>' +
        '<p class="tiny muted" style="margin:4px 0 0">Onde: <strong>🌱 Nutrição</strong> · detalhada em ' +
        '<a href="#/playbook" onclick="App.irNoManual(\'m-nutricao\');return false;">O Processo de Nutrição</a></p>') +

      bloco('uma vez na semana', 'Uma vez por semana, passe na Revisão e no Painel',
        '<p class="small" style="margin:4px 0 0"><strong>Revisão</strong> junta o que precisa de ' +
        'decisão sua: negócio parado, nutrição vencida, negociação sem tarefa. <strong>Painel</strong> ' +
        'mostra a carteira lida pela decisão e, no fim, o Aprendizado — o que está funcionando na sua ' +
        'mão e o que não está.</p>' +
        '<p class="tiny muted" style="margin:4px 0 0">Onde: <strong>🔄 Revisão</strong> e ' +
        '<strong>📊 Painel</strong></p>') +

      '<h3>O que você alimenta, e o que volta</h3>' +
      '<p class="small muted">A pergunta justa sobre qualquer CRM é "o que eu ganho por preencher ' +
      'isto?". Esta é a resposta, linha por linha.</p>' +
      '<div class="tabela-rolagem"><table><thead><tr>' +
      '<th style="width:26%">Você alimenta</th><th>Você recebe de volta</th><th>Onde aparece</th>' +
      '</tr></thead><tbody>' +

      troca('Conclusão da tarefa, com o que aconteceu',
        'As oito decisões relidas, o IAD atualizado, a Idade da Evidência zerada e o negócio ' +
        'reclassificado — de <em>Em construção</em> para <em>Negócio real</em>, ou o contrário. ' +
        'É a única coisa que faz o índice andar.',
        'Cockpit → Decisão · Pipeline') +

      troca('A decisão que a tarefa pretende provocar',
        'O Aprendizado passa a dizer qual canal rende qual decisão <em>na sua mão</em> — e não em ' +
        'média. É o que separa "WhatsApp funciona" de "WhatsApp fecha Prioridade e não fecha Impacto".',
        'Painel → Aprendizado') +

      troca('Quem é quem na empresa, com papel e posição',
        'Cobertura do grupo comprador, alerta de venda dependente de uma pessoa só, aviso de proposta ' +
        'sem acesso ao decisor econômico, e a lista de quem está contra.',
        'Cockpit → Decisão · Contatos') +

      troca('Valor e previsão de fechamento',
        'Previsão por mês, o que está travando a receita, e o contador de adiamentos — que a partir ' +
        'do segundo vira sinal, não detalhe.',
        'Painel · Pipeline') +

      troca('Links rastreados nos documentos que envia',
        'Quem abriu, quando, e quem <em>voltou</em>. E, de brinde, gente da empresa que você nem ' +
        'sabia que estava envolvida — porque o documento foi encaminhado.',
        'Cockpit → Sinais') +

      troca('Sinais que você percebeu',
        'O aviso <span class="pill risk">É a hora</span> quando o comportamento dele passa na frente ' +
        'do seu registro. Sobe para os riscos críticos do Painel com ⏱.',
        'Cockpit → Sinais · Painel') +

      troca('Nada — cai sozinho',
        'Respostas de WhatsApp viram sinal; respostas de campanha do Linked Helper viram empresa, ' +
        'contato e negociação com um clique; aberturas de documento viram sinal.',
        'Conversas · Configuração → Buscar respostas') +

      /* As três linhas novas. A tabela existe para responder “o que eu ganho
         por preencher isto?”, e o Potencial criou duas respostas que antes não
         existiam: campo de cadastro que parecia burocracia agora muda a ordem
         da lista de amanhã. */
      troca('O segmento da empresa',
        'Entra direto no <strong>Potencial</strong> daquele lead — e, quando um negócio daquele ' +
        'segmento fechar, ele passa a valer o dobro para todos os outros leads do mesmo ramo. ' +
        'Conta sem segmento perde a nota inteira dessa parte.',
        'Nutrição · cockpit') +

      troca('O telefone e o e-mail do contato',
        'Além de poder ligar: o <strong>Potencial</strong> sobe, porque lead que só se alcança por ' +
        'InMail rende menos hora. E A Fila passa a poder sugerir o canal certo em vez de avisar que ' +
        'falta contato.',
        'Cockpit → Contatos') +

      troca('Um desfecho registrado — ganho ou perda',
        'O <strong>Potencial</strong> deixa de tratar todos os segmentos como iguais e passa a ' +
        'aprender o seu ICP dos seus próprios ganhos. Enquanto não houver desfecho nenhum, ele diz ' +
        'isso na cara, em vez de fingir que sabe.',
        'Encerrar · Painel → Aprendizado') +

      '</tbody></table></div>' +

      '<h3>O mínimo, se o dia apertar</h3>' +
      '<p class="small">Se der para fazer só três coisas: <strong>conclua as tarefas contando o que ' +
      'aconteceu</strong>, <strong>marque a próxima com data</strong> e <strong>mande documento por ' +
      'link rastreado</strong>. As três primeiras linhas da tabela acima saem daí, e elas são as que ' +
      'sustentam o resto.</p>' +
      '<p class="small">E se sobrar tempo, o quarto: <strong>trie a lista de leads pelo Potencial</strong> ' +
      'e mande em lote para nutrição quem não vale a primeira hora. É o único trabalho que rende num ' +
      'dia sem compromisso vencido.</p>' +
      '<p class="small muted">O que nunca vale a pena: concluir tarefa em lote sem contar nada. O ' +
      'funil anda, nenhuma das oito decisões anda, e o sistema marca essa diferença — ela aparece ' +
      'depois no Aprendizado como trabalho que não virou avanço.</p>' +
      '</div>';
  }

  /* ---------------- Manual: sinais e link rastreado ----------------

     A seção existe por uma razão específica: sinal é a primeira coisa deste
     app que NÃO mexe no índice, e quem não entender isso vai promover tudo a
     evidência no primeiro dia e estragar a régua. Então a regra vem antes da
     funcionalidade, e o "por que" vem antes do "como". */
  function manualDosSinais() {
    const linha = function (o, quem, peso, obs) {
      return '<tr><td><strong>' + esc(o) + '</strong></td><td>' + esc(quem) + '</td>' +
        '<td style="white-space:nowrap">' + esc(peso) + '</td>' +
        '<td class="small">' + obs + '</td></tr>';
    };

    const passo = function (n, titulo, texto) {
      return '<div class="passo-manual"><div class="numero">' + n + '</div>' +
        '<div><strong>' + esc(titulo) + '</strong>' +
        '<p class="small" style="margin:4px 0 0">' + texto + '</p></div></div>';
    };

    return '<div class="card" id="m-sinais"><h2>Sinais: o que o comprador faz sozinho</h2>' +

      '<p>As oito decisões medem o que <strong>você registrou</strong>. Sinal mede o que ' +
      '<strong>ele fez</strong>. São dois relógios diferentes, e é a distância entre eles que ' +
      'interessa.</p>' +

      '<p class="small">Evidência é o cliente decidindo alguma coisa, com palavras dele, e alguém ' +
      'de cá anotando. Sinal é comportamento: respondeu, abriu, voltou, mudou de cargo. ' +
      'Não é a mesma coisa e o app não trata como se fosse.</p>' +

      '<div class="aviso" style="margin:14px 0"><strong>A regra que não tem exceção:</strong> ' +
      'sinal não mexe no IAD, não zera a Idade da Evidência, não muda a saúde nem o grupo do ' +
      'negócio. Um clique não é um problema reconhecido. Se sinal contasse como decisão, o IAD ' +
      'viraria um contador de cliques — que é o que todo CRM já é, e o motivo de nenhum deles ' +
      'saber dizer se o negócio existe de verdade.</div>' +

      '<h3>O que o sinal faz, então</h3>' +
      '<p class="small">Uma coisa só, e é a que faltava: dizer <strong>quando</strong> a conversa ' +
      'tem hora. Quando aparece um sinal forte e a sua última evidência está velha, o app mostra ' +
      'a faixa <span class="pill risk">É a hora</span> com a frase <em>"o comportamento está N dias ' +
      'à frente do registro"</em>.</p>' +
      '<p class="small">Duas condições, as duas necessárias: sinal de peso 2 ou 3 nos últimos 21 dias ' +
      '<strong>e</strong> evidência parada há mais de 14 dias, com o sinal mais novo que ela. Sem a ' +
      'segunda, o aviso tocaria em toda conta ativa — e aviso que toca sempre é aviso que se desliga ' +
      'na primeira semana.</p>' +
      '<p class="small muted">Esse alerta também sobe para o Painel, nos riscos críticos, com ⏱ em vez ' +
      'de ⚠. É o único aviso deste app que é boa notícia.</p>' +

      '<h3>De onde vêm os sinais</h3>' +
      '<div class="tabela-rolagem"><table><thead><tr>' +
      '<th>Origem</th><th>Quem alimenta</th><th>Peso</th><th>Como funciona</th>' +
      '</tr></thead><tbody>' +
      linha('WhatsApp', 'sozinho', '2 a 3',
        'Toda vez que o app busca as conversas, quem respondeu vira sinal. Um por conversa por ' +
        '<em>dia</em>, não por mensagem. Quem escreveu sem você ter falado antes conta como ' +
        '<em>procurou sozinho</em>, que vale mais. Conversa que não casou com nenhum contato não ' +
        'vira sinal — sinal sem pessoa é um telefone com uma data.') +
      linha('Link rastreado', 'sozinho', '3',
        'Abrir um documento que você mandou é o sinal mais forte da lista, e <em>voltar</em> a ele ' +
        'é mais forte ainda. Explicado abaixo.') +
      linha('Anotado à mão', 'você', '1 a 3',
        'Tudo o mais: visitou seu perfil, curtiu, respondeu e-mail, entrou no site, participou de ' +
        'evento, mudou de cargo, indicou você para alguém. <strong>Sinais</strong> → ' +
        '<strong>Registrar sinal</strong>. Vinte e três tipos, agrupados por canal.') +
      '</tbody></table></div>' +
      '<p class="tiny muted">Peso 1 é atenção (passou perto), 2 é interesse (gastou tempo), ' +
      '3 é intenção (fez o que só faz quem está considerando). Três degraus e não dez porque ' +
      'ninguém sabe dizer se abrir um e-mail vale 2 ou 3 numa escala até dez.</p>' +

      '<h3>O link rastreado, em detalhe</h3>' +
      '<p class="small">O IAD não guarda a sua proposta, e não deve: ela já está no Drive, no ' +
      'SharePoint, no anexo. O que faltava não era um lugar para o arquivo — era saber ' +
      '<strong>quando o cliente abriu</strong>.</p>' +
      '<p class="small">Então o app pede à ponte um <strong>desvio</strong>: um endereço curto que ' +
      'passa por ela e segue para o seu documento. Quem recebe clica e vê o arquivo de sempre, sem ' +
      'perceber nada. Você fica sabendo que ele viu.</p>' +

      passo(1, 'Você abre a negociação e vai em Sinais → Link rastreado',
        'Cola o endereço do documento — o mesmo que você mandaria —, dá um nome ' +
        '(<em>"Proposta v2"</em>) e escolhe <strong>para quem</strong> é este link.') +
      passo(2, 'O app devolve um endereço curto',
        'Algo como <code>…/r/Kd8fPqR2mXnTvB3yHs7wLc</code>. Copie e mande no lugar do link ' +
        'original, por onde você já mandaria: e-mail, WhatsApp, LinkedIn.') +
      passo(3, 'O cliente clica e vê o documento',
        'A ponte anota a passagem e o encaminha na mesma hora. Ele não vê tela intermediária, não ' +
        'faz login, não percebe diferença nenhuma.') +
      passo(4, 'A abertura aparece aqui como sinal',
        'Na próxima vez que você abrir o app. Na primeira vez sai como <em>"Abriu o documento"</em>; ' +
        'da segunda em diante, <em>"Voltou ao documento"</em> — e ninguém volta a uma proposta por acaso.') +

      '<div class="aviso" style="margin:14px 0"><strong>Um link por pessoa, e é o ponto todo.</strong> ' +
      'Com um link só para a empresa inteira, "alguém abriu" não diz quem, e Stakeholders e Consenso ' +
      'continuam sendo palpite. Com um link por pessoa, a proposta aberta por alguém que nunca esteve ' +
      'numa reunião é o grupo comprador aparecendo sozinho — a descoberta mais cara que este app ' +
      'consegue entregar de graça. Emita um para cada pessoa que vai receber o documento.</div>' +

      '<h3>O que a abertura te conta</h3>' +
      '<div class="tabela-rolagem"><table><tbody>' +
      '<tr><td class="rotulo-manual"><strong>Quem</strong></td><td class="small">A pessoa para quem ' +
      'você emitiu aquele link. Por isso o link é individual.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>O quê</strong></td><td class="small">O nome que você ' +
      'deu ao documento. Aparece no sinal: <em>"Abriu o documento: Proposta v2"</em>.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Quando</strong></td><td class="small">Data e hora, no ' +
      'seu fuso.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>De novo?</strong></td><td class="small">A segunda ' +
      'abertura do mesmo link vira <em>"Voltou ao documento"</em>. É o sinal de maior peso que ' +
      'existe aqui.</td></tr>' +
      '<tr><td class="rotulo-manual"><strong>Era robô?</strong></td><td class="small">O verificador ' +
      'de links da caixa corporativa abre tudo antes da pessoa ver. Esses são reconhecidos e ' +
      'descartados — senão o app anunciaria "é a hora" por causa de um antivírus.</td></tr>' +
      '</tbody></table></div>' +

      '<p class="small muted" style="margin-top:10px"><strong>O que não é guardado:</strong> IP, ' +
      'navegador, cidade, nada que identifique a máquina. Você já sabe quem abriu, porque foi você ' +
      'que emitiu o link para aquela pessoa; o resto seria dado pessoal a mais, sem utilidade e com ' +
      'obrigação legal junto. O link também não carrega o identificador da sua empresa — ele vai ' +
      'para fora, e o que vai para fora não leva nada de dentro.</p>' +
      '<p class="small muted">O link vale 90 dias. Depois disso ele para de funcionar e quem clicar ' +
      'vê "link não encontrado" — vale reemitir se a negociação se arrastar.</p>' +

      '<h3>Promover a evidência</h3>' +
      '<p class="small">Debaixo de cada sinal há um botão <strong>Promover a evidência</strong>. Ele ' +
      'é a única porta entre o que se observa e a régua, e ele é humano de propósito: quem diz que ' +
      'abrir a proposta três vezes comprova <em>Prioridade</em> é uma pessoa que conhece a conta, não ' +
      'uma tabela de pesos.</p>' +
      '<p class="small">Ao promover, você escolhe qual das oito aquilo comprova. A evidência entra no ' +
      'histórico, zera a Idade da Evidência e o "É a hora" some — porque o registro alcançou o ' +
      'comportamento. A força entra como <em>relato</em>, que é o que ela é: comportamento observado ' +
      'não é o cliente dizendo com palavras dele.</p>' +
      '<p class="small muted">Promova quando o comportamento realmente comprovar alguma coisa — não ' +
      'por ele ter acontecido. Promover tudo é a maneira mais rápida de fazer o IAD mentir.</p>' +

      '<h3>Testando que está funcionando</h3>' +
      '<p class="small">Emita um link para você mesmo — escolha qualquer contato, cole o endereço de ' +
      'um documento seu —, abra o link no celular e depois recarregue o IAD. O sinal tem de aparecer ' +
      'na aba <strong>Sinais</strong> daquela negociação. Abra de novo e recarregue: a segunda ' +
      'passagem vira <em>"Voltou ao documento"</em>. Se aparecer, está tudo de pé: ponte, desvio, ' +
      'colheita e sincronização.</p>' +
      '<p class="tiny muted">Se o botão disser que a ponte não conhece links rastreados, o worker do ' +
      'Cloudflare está desatualizado. Se o sinal não aparecer, confira em Configuração → Linked Helper ' +
      'se a ponte está configurada para esta empresa.</p>' +
      '</div>';
  }


  /* ------------------------------------------------------------------
     Ligar a caixa de e-mail

     Escrito para QUALQUER pessoa da equipe, não para quem administra o
     Supabase. A diferença importa: até a correção 21, a senha de aplicativo
     de cada um tinha de ser digitada no painel por quem o administra — ou
     seja, a Rosa teria de MANDAR a senha dela para alguém, e senha que viaja
     por mensagem já está queimada. Agora cada um guarda a sua, sozinho, e
     este é o texto que ensina como.
     ------------------------------------------------------------------ */
  function manualDoEmail() {
    const passo = function (n, titulo, texto) {
      return '<div class="passo-manual"><div class="numero">' + n + '</div>' +
        '<div><strong>' + esc(titulo) + '</strong>' +
        '<p class="small" style="margin:4px 0 0">' + texto + '</p></div></div>';
    };

    return '<div class="card" id="m-email"><h2>Ligar a sua caixa de e-mail</h2>' +

      '<p>Ligada a caixa, o que os clientes escrevem para você passa a cair dentro da ' +
      'negociação certa, o assistente lê e transforma em evidência e tarefa, e você responde de ' +
      'dentro do IAD — do seu endereço, com o seu nome.</p>' +

      '<p class="small"><strong>Cada pessoa liga a sua.</strong> Você pode ligar quantos ' +
      'endereços quiser para <em>receber</em>, e escolher <strong>um</strong> para <em>enviar</em>. ' +
      'Ninguém vê a caixa de ninguém: a regra do banco é por dono, e nem o gestor enxerga a ' +
      'configuração de e-mail da equipe.</p>' +

      '<h3>Antes de começar: o que é uma senha de aplicativo</h3>' +
      '<p class="small">Não é a senha da sua conta, e não abre a sua conta. É uma senha ' +
      'separada, de 16 letras, que serve <strong>só para programa de e-mail</strong> e que você ' +
      'apaga quando quiser, sem mexer em mais nada. É por isso que o IAD pede essa e não a sua: ' +
      'se um dia você quiser cortar o acesso, é um clique na sua conta, e não um pedido para ' +
      'ninguém.</p>' +

      '<div class="aviso" style="margin:14px 0"><strong>Não mande essas 16 letras para ninguém</strong> ' +
      '— nem para o seu gestor, nem para quem cuida do sistema, nem por WhatsApp. Você mesmo as ' +
      'cola na tela do IAD, elas vão cifradas para o servidor e não ficam guardadas neste ' +
      'computador. Quem pede a sua senha por mensagem está errado, sempre.</div>' +

      '<h3>O passo a passo</h3>' +
      '<div class="passos-manual">' +
      passo(1, 'Descubra quem hospeda o seu e-mail',
        'Quase sempre é Google (Gmail/Workspace) ou Microsoft (Outlook/365) — mesmo que o ' +
        'endereço seja da empresa, como <em>@acp.tec.br</em> ou <em>@biosolvit.com</em>. Se você ' +
        'entra no seu e-mail por <em>mail.google.com</em>, é Google. Por ' +
        '<em>outlook.office.com</em>, é Microsoft. Se for outro, peça ao TI da sua empresa ' +
        '"o servidor de IMAP e o de SMTP" — são dois nomes, e é tudo o que ele precisa dizer.') +
      passo(2, 'Ligue a verificação em duas etapas',
        'No Google: <em>myaccount.google.com/security</em>. Sem ela o Google nem mostra a opção ' +
        'de senha de aplicativo. É chato uma vez e protege a sua conta para sempre.') +
      passo(3, 'Gere a senha de aplicativo',
        'No Google: <em>myaccount.google.com/apppasswords</em>. Dê o nome <strong>IAD CRM</strong> ' +
        'e ele mostra 16 letras em quatro grupos. <strong>Copie agora</strong> — ele não mostra ' +
        'de novo. Se sumir, não tem problema: você apaga aquela e gera outra.') +
      passo(4, 'Abra Minha caixa, na Configuração',
        'Menu <strong>Configuração</strong> → aba <strong>Minha caixa de e-mail</strong> → ' +
        '<strong>+ Ligar um endereço</strong>. Ela fica ali, e não dentro de uma negociação, porque a ' +
        'caixa é <em>sua</em> e vale para a carteira inteira. Preencha o seu endereço, o nome que o ' +
        'cliente vê, e o provedor. No último campo, cole as 16 letras — com ou sem os espaços, ' +
        'tanto faz. Os campos de servidor ficam <strong>vazios</strong>: eles só valem para ' +
        '"Outro (servidor próprio)".') +
      passo(5, 'Marque quais caixas ENVIAM',
        'Pode ser mais de uma. Ao <strong>responder</strong>, o IAD manda pela caixa em que o ' +
        'cliente escreveu — responder por outro endereço parte a conversa em duas na caixa dele e ' +
        'faz você parecer outra pessoa. Em mensagem <strong>nova</strong>, com mais de uma caixa ' +
        'marcada, ele pergunta de qual sai. Marque <strong>Não</strong> só no endereço que você ' +
        'não quer que assine nada.') +
      passo(6, 'Confira',
        'Na mesma tela, cada endereço aparece com o estado dele. <em>Funcionando</em> está pronto; ' +
        '<strong>falta a senha</strong> quer dizer cadastrado e sem funcionar — clique em Editar e ' +
        'cole as 16 letras.') +
      passo(7, 'O dia a dia é dentro da negociação',
        'Configurar é uma vez; <strong>trabalhar é no negócio</strong>. Na aba <strong>E-mail</strong> ' +
        'de cada oportunidade há três botões: <strong>Buscar e-mails</strong> traz o que chegou e ' +
        'mostra o que é desta empresa; <strong>Analisar com a IA</strong> lê o que o cliente escreveu, ' +
        'registra a evidência e abre a tarefa (<em>"Enviar a apresentação para Ana da Suzano"</em>, com ' +
        'data); <strong>Escrever</strong> responde do seu endereço. Se a aba estiver vazia, ela diz ' +
        '<em>por quê</em> — quase sempre é contato sem e-mail cadastrado, e não defeito.') +
      '</div>' +

      '<h3>Dois exemplos de verdade</h3>' +
      '<div class="tabela-rolagem"><table><tbody>' +
      '<tr><td style="vertical-align:top"><strong>Alexandre</strong><br>' +
      '<span class="small muted">Bio Water Care</span></td>' +
      '<td class="small">Recebe cliente em <strong>@biosolvit.com</strong> e em ' +
      '<strong>@biopartners.com.br</strong>. Ele liga <strong>as duas</strong> caixas — uma senha ' +
      'de aplicativo para cada, gerada em cada conta — e marca <em>Envia: Sim</em> nas duas. Quem ' +
      'escreveu para o biosolvit recebe a resposta <strong>do biosolvit</strong>, e quem escreveu ' +
      'para o biopartners, do biopartners: o IAD responde pela caixa que recebeu, sem ele ter de ' +
      'lembrar.</td></tr>' +
      '<tr><td style="vertical-align:top"><strong>Rosa</strong><br>' +
      '<span class="small muted">AcP</span></td>' +
      '<td class="small">Recebe tudo em <strong>rosa.oliveira@acp.tec.br</strong>. Ela liga ' +
      '<strong>uma</strong> caixa, com uma senha de aplicativo gerada na conta dela, e pronto — ' +
      'essa mesma envia. Ela não precisa falar com ninguém nem esperar ninguém: quem digita a ' +
      'senha dela é ela, na tela dela.</td></tr>' +
      '</tbody></table></div>' +

      '<h3>As duas pastas: a entrada <em>e</em> os enviados</h3>' +
      '<p class="small">Até a v236 o IAD lia só a caixa de <strong>entrada</strong>. Parece o óbvio, e ' +
      'é meia conversa — a metade errada. A resposta que você escreve pelo Gmail, do celular, antes de ' +
      'abrir o app, <strong>nunca passa pela entrada</strong>: ela nasce direto na pasta de enviados. ' +
      'Então a conversa aparecia com o cliente falando sozinho.</p>' +
      '<p class="small">O estrago não era de aparência. Quem lê depois — você, o histórico da conta e ' +
      'o assistente que avalia a negociação — via um pedido do cliente <strong>sem resposta</strong>. ' +
      'Era mentira, e era mentira que <strong>piorava a nota de um negócio bem tocado</strong>: você ' +
      'tinha proposto uma visita presencial e o sistema registrava silêncio.</p>' +
      '<p class="small">Agora o IAD lê as duas. E não pede que você configure nada: a pasta de ' +
      'enviados <strong>não tem nome fixo</strong> — é “[Gmail]/E-mails enviados” numa conta em ' +
      'português, “[Gmail]/Sent Mail” em inglês, “Sent Items” no Outlook, “INBOX.Sent” em servidor ' +
      'próprio. Adivinhar pelo nome erra em metade das caixas do mundo, então o IAD ' +
      '<strong>pergunta ao servidor</strong> qual é, grava o nome e não pergunta mais. Ele fica à ' +
      'vista em Configuração → Minha caixa, e você pode corrigi-lo em Editar.</p>' +
      '<p class="small">A sua fala também entra no que o assistente lê, mas <strong>marcada como ' +
      'nossa</strong>: serve para ele saber o que já foi perguntado, proposto e combinado — e ' +
      '<strong>nunca sobe nota</strong>. A régua não mudou: quem pontua é só o cliente. O que mudou é ' +
      'que o assistente parou de abrir tarefa para marcar uma reunião que você já tinha proposto na ' +
      'mensagem anterior.</p>' +
      '<p class="small muted">Nada é duplicado: a chave de cada mensagem é o Message-ID, então a ' +
      'resposta que você mandou <em>de dentro do IAD</em> e que volta pela pasta de enviados é a mesma ' +
      'linha, não duas.</p>' +

      '<h3>Quando dá errado</h3>' +
      '<div class="tabela-rolagem"><table><tbody>' +
      '<tr><td><strong>A caixa recusou a senha</strong></td>' +
      '<td class="small">O mais comum é ter colado a senha da <em>conta</em> em vez da de ' +
      '<em>aplicativo</em>. O segundo mais comum é a verificação em duas etapas estar ' +
      'desligada.</td></tr>' +
      '<tr><td><strong>Não acho "senha de aplicativo" no Google</strong></td>' +
      '<td class="small">Falta ligar a verificação em duas etapas (passo 2). Em algumas empresas o ' +
      'administrador do Workspace desliga essa opção para todo mundo — aí é com ele.</td></tr>' +
      '<tr><td><strong>Não sei o servidor</strong></td>' +
      '<td class="small">Só acontece em "Outro (servidor próprio)". Peça ao TI o endereço de ' +
      '<em>IMAP</em> (entrada) e o de <em>SMTP</em> (saída).</td></tr>' +
      '<tr><td><strong>Liguei e não chega nada</strong></td>' +
      '<td class="small">Clique em <strong>Buscar agora</strong>, em Configuração → Minha caixa ' +
      'de e-mail. Ele diz na hora quantos vieram — ou o que a caixa respondeu.</td></tr>' +
      '<tr><td><strong>Minhas respostas não aparecem</strong></td>' +
      '<td class="small">Veja em Configuração → Minha caixa se a linha do seu endereço mostra uma ' +
      'pasta de enviados. Se disser <em>sem os enviados</em>, o seu servidor não respondeu qual é: ' +
      'clique em Editar e escreva o nome dela à mão em <strong>Pastas que o IAD lê</strong>, depois ' +
      'da vírgula.</td></tr>' +
      '<tr><td><strong>Quero desligar</strong></td>' +
      '<td class="small">Apague a senha de aplicativo na sua conta de e-mail. O acesso morre na ' +
      'hora, sem depender de ninguém aqui.</td></tr>' +
      '</tbody></table></div>' +

      '<p class="small muted" style="margin-top:14px">O IAD lê a sua caixa sem mexer nela: ' +
      'não marca como lido, não apaga e não move nada. E guarda só o texto das mensagens — ' +
      'anexo e imagem ficam onde estão.</p>' +
      '</div>';
  }

  function manualDoCaminho() {
    const passo = function (n, titulo, texto, onde) {
      return '<div class="passo-manual"><div class="numero">' + n + '</div>' +
        '<div><strong>' + esc(titulo) + '</strong>' +
        '<p class="small" style="margin:4px 0 0">' + texto + '</p>' +
        (onde ? '<p class="tiny muted" style="margin:4px 0 0">Onde: ' + esc(onde) + '</p>' : '') +
        '</div></div>';
    };

    const saida = function (rotulo, classe, quando, oQueFazer, motivos) {
      return '<tr><td class="rotulo-manual"><span class="pill ' + classe + '">' + esc(rotulo) + '</span></td>' +
        '<td><strong>' + esc(quando) + '</strong><p class="small" style="margin:4px 0 0">' + oQueFazer + '</p>' +
        (motivos ? '<p class="tiny muted" style="margin:6px 0 0">' + motivos + '</p>' : '') + '</td></tr>';
    };

    const listar = function (lista) {
      return lista.filter(function (m) { return m.id !== 'outro'; })
        .map(function (m) { return esc(m.rotulo); }).join(' · ');
    };

    return '<div class="card" id="m-caminho"><h2>O caminho do vendedor, do primeiro contato ao desfecho</h2>' +
      '<p class="small muted">A ordem em que as coisas acontecem no sistema. Cada passo tem uma tela, e ' +
      'nenhum deles é opcional — pular um faz o seguinte trabalhar com informação que não existe.</p>' +

      '<h3>Entrando: de onde vem a conta</h3>' +
      passo(1, 'A conta entra, por uma de três portas',
        'Do <strong>Linked Helper</strong>, em Configuração → Buscar respostas: quem respondeu no LinkedIn vira ' +
        'empresa, contato e negociação com um clique, e o app não deixa duplicar quem já está aqui. ' +
        'Do <strong>cadastro à mão</strong>, em Cadastros → Empresas, quando o contato veio por indicação, evento ou telefone. ' +
        'De uma <strong>planilha</strong>, em Configuração → Importar, para trazer carteira que já existia.',
        'Configuração → Buscar respostas · Cadastros → Empresas') +
      passo(2, 'A negociação nasce com nome e valor',
        'Nome curto que diga o que está sendo vendido, não o nome da empresa. Valor é o que o cliente pagaria ' +
        'em doze meses — na dúvida, uma estimativa sua, que se corrige depois. Toda negociação nasce com data ' +
        'prevista de fechamento: é o relógio começando a andar.',
        'Pipeline → + Oportunidade') +
      passo(3, 'As oito começam todas em zero',
        'Zero não é ruim: é honesto. Ninguém sabe nada sobre a decisão de um cliente com quem nunca se falou. ' +
        'O cartão <em>Próximos passos</em> já aponta a primeira lacuna, na ordem em que o método trabalha.',
        'Cockpit da oportunidade') +

      '<h3>Trabalhando: como o índice anda</h3>' +
      passo(4, 'Você marca uma tarefa e diz qual decisão quer provocar',
        'Reunião, visita, telefonema, WhatsApp ou e-mail. O campo <em>decisão que pretende provocar</em> é o que ' +
        'transforma agenda em método: sem ele você marca reuniões, com ele você marca reuniões <em>para alguma coisa</em>.',
        '+ Tarefa, em qualquer tela') +
      passo(5, 'A tarefa acontece',
        'E é aqui que mora a única regra que não tem exceção: o que <strong>nós</strong> fazemos não move nada. ' +
        'Apresentar, propor, cobrar retorno, mover etapa — é trabalho, e trabalho não é avanço.',
        'Fora do sistema') +
      passo(6, 'Você conclui a tarefa contando o que aconteceu',
        'Toda tarefa concluída passa por aqui — pelo quadradinho da lista, pelo Concluir do rodapé, pela Situação da ' +
        'própria tarefa ou pela conclusão em lote, o caminho é o mesmo. Quatro modos, do mais completo ao mais rápido: ' +
        'colar a ata ou anexar os documentos, responder as quatro perguntas fechadas, registrar uma evidência direta, ' +
        'ou marcar que nada aconteceu. Se você fechar a janela sem contar, a tarefa continua aberta: é mais honesto do ' +
        'que fechada e vazia.',
        'Tarefas → Concluir, ou a Situação dentro da própria tarefa') +
      passo(7, 'A IA separa o que o CLIENTE fez e relê as oito',
        'Ela propõe uma evidência por decisão afetada, com a força de cada uma, e reavalia os oito degraus com ' +
        'tudo o que já estava registrado mais o material novo. Ela nunca rebaixa nota: corrigir para baixo é sempre humano.',
        'Automático ao concluir') +
      passo(8, 'Você confere e ajusta',
        'A tela do resumo mostra o que entrou e o que subiu. Se discordar, ajuste — as oito ficam abertas para edição. ' +
        'Os degraus 3 e 4 continuam exigindo prova: sem evidência confirmada ou documentada, o motor desce a nota e diz por quê.',
        'Cockpit → as oito decisões') +

      '<h3>Avançando: quando mover a etapa</h3>' +
      passo(9, 'Mova a etapa quando o cliente andar, não quando você trabalhar',
        'Etapa é onde você anotou; decisão é onde o cliente está. O app deixa arrastar para qualquer lugar, e é de ' +
        'propósito — a única trava do sistema é a da Proposta, e mesmo ela não bloqueia: ela denuncia, marcando o ' +
        'negócio como <strong>Falso avançado</strong>.',
        'Pipeline, em lista ou kanban') +
      passo(10, 'Antes da proposta, confira o portão',
        'Seis condições: Problema em 3, e Prioridade, Impacto, Critérios, Stakeholders e Processo de compra em 2 ou mais. ' +
        'A proposta é consequência da qualificação, não ferramenta de descoberta.',
        'Cockpit → Prontidão') +
      passo(11, 'Depois da proposta, três coisas fazem o app gritar',
        'IAD abaixo de ' + P.IAD_MADURO + ', portão não liberado, ou nenhum decisor econômico mapeado. Qualquer uma ' +
        'marca o negócio como Falso avançado, que é o maior destruidor de previsão de vendas.',
        'Pipeline → Falso avançado') +
      passo(12, 'Toda semana, a Revisão',
        'Uma pergunta por negócio: o que mudou na decisão do cliente nos últimos sete dias? Respostas que começam ' +
        'com “nós” não valem. É onde aparece o que está sem próximo passo, sem papel crítico e com evidência velha.',
        'Revisão') +

      '<h3>Terminando: as quatro saídas</h3>' +
      '<p class="small">Negócio que não termina em lugar nenhum é o que entope o funil e envenena a previsão. ' +
      'São quatro saídas, e escolher a certa é o que faz o Aprendizado do painel valer alguma coisa depois.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      saida('Ganho', 'ok', 'O cliente comprou.',
        'Registre o valor final. A etapa vai para Venda e o retrato das oito congela — é ele que vai dizer, ' +
        'daqui a um ano, quais decisões estavam maduras nos negócios que você ganhou.') +
      saida('Perda', 'dead', 'O cliente DECIDIU, e a escolha não foi a nossa.',
        'Houve disputa e existe um vencedor. Registre quem ganhou e o motivo, da lista fechada. ' +
        'A pergunta que este desfecho responde é: por que perdemos a comparação?',
        '<strong>Motivos:</strong> ' + listar(P.MOTIVOS_PERDA)) +
      saida('Desistência', 'dead', 'Ninguém decidiu. O projeto parou de existir dentro do cliente.',
        'Não houve comparação nenhuma, e é por isso que não pode ser guardado junto com a perda: analisar ' +
        '“por que perdemos” aqui é analisar uma disputa que não aconteceu.',
        '<strong>Motivos:</strong> ' + listar(P.MOTIVOS_DESISTENCIA)) +
      saida('Em nutrição', 'warn', 'O processo parou porque a conta ainda não está pronta.',
        '<strong>Esta não encerra nada.</strong> O negócio continua aberto, sai da previsão e fica na agenda com ' +
        'data para voltar. Encerrar uma conta que só chegou cedo demais é a forma mais cara de esquecer dela.',
        '<strong>Motivos:</strong> ' + listar(P.MOTIVOS_NUTRICAO)) +
      '</tbody></table></div>' +

      '<h3>Como funciona a nutrição</h3>' +
      '<p class="small">É um estado, não um desfecho. Três coisas acontecem quando você coloca um negócio nela:</p>' +
      '<ul class="small">' +
      '<li><strong>Sai do total do pipeline.</strong> O contador e a soma em reais deixam de incluí-lo, porque ' +
      'ninguém está perseguindo aquela receita. Ele tem chip próprio, <em>Em nutrição</em>, e é lá que se olha.</li>' +
      '<li><strong>Para de envelhecer.</strong> Não vira Zumbi por silêncio — o silêncio foi combinado. Seria o ' +
      'app cobrando por uma pausa que ele mesmo autorizou.</li>' +
      '<li><strong>Volta sozinho.</strong> Qualquer evidência nova do cliente tira o negócio da nutrição na hora, ' +
      'porque é exatamente esse o sinal que ela estava esperando. Você não precisa lembrar de nada.</li>' +
      '</ul>' +
      '<p class="small">E a data não é decoração: quando ela chega, o negócio aparece no alto da <strong>Revisão</strong>, ' +
      'com três saídas — retomar com uma tentativa clara, adiar de novo com data nova, ou encerrar por desistência. ' +
      'Nutrição sem cobrança é esquecimento com nome bonito.</p>' +
      '</div>';
  }

  function manualDaRegua() {
    /* A régua por decisão, com o rigor de cada uma. O que é estrito e o que é
       flexível não é opinião solta: sai do texto do degrau 3 e 4 de cada
       dimensão, que é o que o app usa para julgar. */
    const porDecisao = P.DIMENSOES.map(function (d) {
      return '<tr>' +
        '<td class="rotulo-manual"><strong>' + esc(d.nome) + '</strong></td>' +
        '<td><span class="nivel-linha"><b class="nota-manual n3">3</b> ' + esc(d.niveis[3]) + '</span>' +
        '<span class="nivel-linha"><b class="nota-manual n4">4</b> ' + esc(d.niveis[4]) + '</span></td>' +
        '</tr>';
    }).join('');

    return '<div class="card" id="m-regua"><h2>A régua: cinco degraus, e o que decide cada um</h2>' +

      '<p class="small">Até agora cada decisão valia 0, 1 ou 2. Agora vale de 0 a ' + P.NOTA_MAXIMA + '. ' +
      'A mudança não é de tamanho, é de critério — e é a parte que importa entender.</p>' +

      '<p class="small"><strong>O que decide o degrau não é o quanto você sabe. É de onde a informação veio.</strong> ' +
      'Duas pessoas podem saber exatamente a mesma coisa sobre um cliente e estar em degraus diferentes: ' +
      'uma porque deduziu, outra porque ouviu do cliente e conferiu.</p>' +

      escadaEmCards() +

      '<h3 style="margin-top:18px">Por que isto é melhor do que a régua antiga</h3>' +

      '<p class="small">A régua de três degraus tinha <strong>dois eixos brigando</strong>. A nota dizia quanto se ' +
      'sabia; a força da evidência (relato, confirmado, documentado) dizia de onde tinha vindo. Como os dois não ' +
      'conversavam, foi preciso uma regra à parte: "a nota 2 exige uma evidência confirmada". Remendo.</p>' +

      '<p class="small">Nos cinco degraus a origem <strong>é</strong> a escada. Um eixo só, sem remendo. E dois ' +
      'degraus resolvem problemas que a régua antiga não enxergava:</p>' +

      '<div class="escada-manual" style="margin-top:10px">' +
      '<div><span class="nota-manual n1">1</span><div><strong>O degrau que nomeia o otimismo</strong>' +
      '<span class="tiny muted">"Suposto" quer dizer: quem afirma isso somos nós, o cliente não disse. ' +
      'Na régua antiga quem achava marcava 1, e 1 de 2 é metade do caminho — o painel mostrava progresso que não ' +
      'existia. Agora é 1 de 4, e o rótulo diz na cara que a fonte é você.</span></div></div>' +
      '<div><span class="nota-manual n3">3</span><div><strong>O degrau que separa falar de verificar</strong>' +
      '<span class="tiny muted">Entre 2 e 3 está a fronteira mais importante da régua. "O cliente disse que tem ' +
      'prazo até dezembro" é 2. Vira 3 quando alguém conferiu que o prazo se mantém, ou quando uma segunda pessoa ' +
      'do cliente confirmou.</span></div></div>' +
      '</div>' +

      '<div class="aviso" style="margin-top:14px"><strong>O caso que motivou a mudança.</strong> ' +
      'Um diagnóstico prometido e ainda não entregue mantém a decisão em <strong>2</strong>. Ele pode voltar ' +
      'mostrando que a solução não serve àquele caso. Antecipar para 3 é registrar um progresso que ninguém ' +
      'verificou — e na régua antiga isso era 2 de 2, ou seja, parecia pronto.</div>' +

      '<h3 style="margin-top:18px">Os degraus 3 e 4 exigem prova, não opinião</h3>' +

      '<p class="small">Marcar 3 ou 4 não depende só da sua leitura: o app confere se existe evidência do cliente ' +
      'com a força correspondente. Sem ela, o botão fica bloqueado.</p>' +

      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      '<tr><td class="rotulo-manual"><b class="nota-manual n3">3</b> <strong>Testado</strong></td>' +
      '<td>Exige ao menos uma evidência <strong>confirmada</strong> ou documentada. Confirmado quer dizer: ' +
      'o cliente fez, e nós presenciamos.</td></tr>' +
      '<tr><td class="rotulo-manual"><b class="nota-manual n4">4</b> <strong>Documentado</strong></td>' +
      '<td>Exige uma evidência <strong>documentada</strong>. E documento do cliente: ata dele, indicador dele, ' +
      'meta dele, e-mail dele. Um material que nós escrevemos sobre o que ele falou não é documento dele.</td></tr>' +
      '</tbody></table></div>' +

      '<h3 style="margin-top:18px">O rigor muda conforme a decisão</h3>' +

      '<p class="small">Nem toda decisão pede a mesma prova. Duas são propositalmente mais duras — ' +
      '<strong>Processo de compra</strong> e <strong>Impacto</strong> — porque são as que mais destroem previsão ' +
      'quando ficam frouxas. Descobrir tarde que a diretoria do cliente decide devagar já custou o trimestre de ' +
      'muita gente; e economia que nós calculamos nunca foi impacto aceito.</p>' +

      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + porDecisao + '</tbody></table></div>' +

      '<h3 style="margin-top:18px">O que mudou nos números</h3>' +

      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      '<tr><td class="rotulo-manual">IAD</td><td>Era de 0 a 16. Agora é de <strong>0 a ' + P.IAD_MAXIMO + '</strong>.</td></tr>' +
      '<tr><td class="rotulo-manual">Limiar de maduro</td><td>Era 11. Agora é <strong>' + P.IAD_MADURO + '</strong> — média ' +
      (P.IAD_MADURO / P.DIMENSOES.length) + ' por decisão, ou seja, a maioria das oito testada com o cliente e não apenas declarada.</td></tr>' +
      '<tr><td class="rotulo-manual">Portão da proposta</td><td>Os mínimos subiram junto com a escada: ' +
      P.GATES_PROPOSTA.map(function (g) {
        const d = P.DIMENSOES.filter(function (x) { return x.id === g.dim; })[0];
        return esc(d ? d.nome : g.dim) + ' ' + g.min;
      }).join(' · ') + '.</td></tr>' +
      '</tbody></table></div>' +

      '<h3 style="margin-top:18px">O que aconteceu com o que já estava pontuado</h3>' +

      '<p class="small">Nada precisou ser repontuado, porque a informação necessária já estava gravada: a força da ' +
      'evidência mais forte de cada decisão. A conversão foi automática, uma única vez:</p>' +

      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' +
      '<tr><td class="rotulo-manual">0 antigo</td><td>continua <b class="nota-manual n0">0</b>.</td></tr>' +
      '<tr><td class="rotulo-manual">1 antigo</td><td>virou <b class="nota-manual n2">2</b>. O antigo 1 era ' +
      '"reconhece, mas de forma vaga" — que na régua nova é exatamente <em>declarado pelo cliente</em>.</td></tr>' +
      '<tr><td class="rotulo-manual">2 antigo</td><td>virou <b class="nota-manual n4">4</b> se havia evidência ' +
      'documentada, <b class="nota-manual n3">3</b> se havia confirmada, e <b class="nota-manual n2">2</b> se não ' +
      'havia nenhuma das duas — que era justamente o caso que a régua antiga chamava de "comprovado sem prova".</td></tr>' +
      '</tbody></table></div>' +

      '<p class="small" style="margin-top:10px">A curva do IAD no histórico mudou de escala junto. Sem isso o ' +
      'gráfico mostraria uma queda no dia da migração que nunca aconteceu na vida real.</p>' +

      '<div class="aviso" style="margin-top:14px"><strong>O efeito prático a esperar.</strong> ' +
      'Alguns negócios vão sair de "Negócio real" e voltar para "Em construção". Não é o app ficando pessimista: ' +
      'é a régua deixando de aceitar como comprovado o que só tinha sido dito numa reunião. O trabalho que aparece ' +
      'agora — conferir o que o cliente afirmou — sempre existiu; ele é que era invisível.</div>' +

      '</div>';
  }

  /* ---------------- Como o IAD anda ----------------

     A seção que faltava, e ela precisa ser gerada do playbook — não escrita à
     mão. Um manual que descreve o gate da proposta em texto fixo fica errado
     no dia em que alguém mudar GATES_PROPOSTA, e ninguém vai lembrar de vir
     aqui. Tudo o que é regra sai da constante que a regra usa. */

  function manualDoAvanco() {
    const niveis = P.DIMENSOES.map(function (d, i) {
      return '<tr><td class="rotulo-manual"><span class="tiny muted">' + (i + 1) + '</span> <strong>' +
        esc(d.nome) + '</strong><span class="tiny muted">' + esc(d.pergunta) + '</span></td>' +
        '<td>' + d.niveis.map(function (n, k) {
          return '<span class="nivel-linha"><b class="nota-manual n' + k + '">' + k + '</b> ' + esc(n) + '</span>';
        }).join('') + '</td></tr>';
    }).join('');

    /* A ordem de trabalho não é a ordem em que as oito aparecem na tela. É a
       do motor, e ela existe porque decisão tem pré-requisito. */
    const ordem = ['problema', 'prioridade', 'impacto', 'stakeholders', 'criterios', 'processo', 'consenso', 'risco']
      .map(function (id, i) {
        const d = P.DIMENSOES.filter(function (x) { return x.id === id; })[0];
        return '<span class="passo-ordem"><b>' + (i + 1) + '</b>' + esc(d ? d.nome : id) + '</span>';
      }).join('<span class="seta-ordem">→</span>');

    const gate = P.GATES_PROPOSTA.map(function (g) {
      const d = P.DIMENSOES.filter(function (x) { return x.id === g.dim; })[0];
      return '<tr><td class="rotulo-manual"><strong>' + esc(d ? d.nome : g.dim) + '</strong></td>' +
        '<td class="nowrap">precisa de <strong>' + g.min + '</strong> ou mais</td>' +
        '<td>' + esc(d ? d.niveis[g.min] : '') + '</td></tr>';
    }).join('');

    const foraDoGate = P.DIMENSOES.filter(function (d) {
      return !P.GATES_PROPOSTA.some(function (g) { return g.dim === d.id; });
    }).map(function (d) { return d.nome; });

    /* O teto de cada força sai da mesma tabela que o motor usa para travar.
       Escrever "sustenta nota 2" à mão foi o que deixou o manual ensinando a
       régua de três degraus meses depois de ela ter virado cinco. */
    const tetoDaForca = function (peso) {
      let teto = P.NOTA_MAXIMA;
      while (teto > 0 && (P.FORCA_MINIMA_DO_DEGRAU[teto] || 0) > peso) teto--;
      return teto;
    };
    const forcas = P.FORCAS.map(function (f) {
      const teto = tetoDaForca(f.peso);
      return '<tr><td class="rotulo-manual"><strong>' + esc(f.rotulo) + '</strong></td>' +
        '<td>' + esc(f.desc) + '</td>' +
        '<td class="nowrap"><span class="pill' + (teto >= P.NOTA_MAXIMA ? ' ok' : '') +
        '">sustenta até o degrau ' + teto + '</span></td></tr>';
    }).join('');

    const evid = P.FAIXAS_EVIDENCIA.map(function (f, i) {
      const de = i === 0 ? 0 : P.FAIXAS_EVIDENCIA[i - 1].max + 1;
      const ate = f.max === Infinity ? 'ou mais' : 'a ' + f.max + ' dias';
      return '<tr><td class="rotulo-manual"><span class="pill ' + f.classe + '">' + esc(f.rotulo) + '</span></td>' +
        '<td class="nowrap">' + de + ' ' + ate + '</td>' +
        '<td>' + esc([
          'O cliente se moveu esta semana. É o ritmo que fecha negócio.',
          'Passou uma semana sem sinal dele. Ainda não é problema; é o momento de provocar.',
          'Duas semanas ou mais em silêncio. O negócio está saindo da mão sem ninguém perceber.',
          'Mais de um mês. O app chama de Zumbi: requalifique com uma tentativa clara, ou encerre por inação.'
        ][i]) + '</td></tr>';
    }).join('');

    const naoContam = P.ATIVIDADES_QUE_NAO_CONTAM.map(function (a) {
      return '<span class="pill dead">' + esc(a) + '</span>';
    }).join(' ');

    return '<div class="card" id="m-avanco"><h2>Como o IAD anda</h2>' +

      '<p class="small">O IAD é a soma das oito notas: de <strong>0 a ' + P.IAD_MAXIMO + '</strong>. Ele não sobe porque ' +
      'você trabalhou. Sobe quando uma das oito decisões amadurece <strong>dentro do cliente</strong>, ' +
      'e isso acontece de um jeito só: uma evidência nova do cliente entra, e a nota daquela decisão sobe.</p>' +

      '<h3>O caminho de um ponto, do começo ao fim</h3>' +
      '<ol class="caminho-iad">' +
      '<li><strong>Você marca uma tarefa</strong> — e diz qual das oito ela pretende provocar.</li>' +
      '<li><strong>A tarefa acontece</strong> — reunião, visita, telefonema, e-mail.</li>' +
      '<li><strong>Você conclui contando o que aconteceu</strong> — colando a ata, respondendo as quatro ' +
      'perguntas, ou escrevendo em duas linhas.</li>' +
      '<li><strong>O que o CLIENTE fez vira evidência</strong>, com uma força: relato, confirmado ou documentado.</li>' +
      '<li><strong>A nota sobe</strong> — e com ela o IAD, o grupo do negócio no pipeline e o painel do gestor.</li>' +
      '</ol>' +
      '<div class="aviso">Fechar a tarefa sem contar o que aconteceu fecha a tarefa e <strong>não move nada</strong>. ' +
      'Não é punição do app: sem o relato não existe evidência para reler, e sem evidência não há o que subir.</div>' +

      '<h3>Os três níveis, decisão por decisão</h3>' +
      '<p class="small">Esta é a régua inteira. A coluna da direita é o que precisa ser verdade para a nota valer.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + niveis + '</tbody></table></div>' +

      '<h3>A força da evidência — e a única trava que o app não deixa você furar</h3>' +
      '<p class="small">Toda evidência entra com uma força. Ela decide até onde a nota pode ir: ' +
      '<strong>o degrau 3 exige evidência confirmada e o degrau 4 exige evidência documentada</strong>. ' +
      'Os degraus 1 e 2 não pedem prova, porque falam de onde a informação veio — nós achamos, ou o ' +
      'cliente disse —, e não de quanto ela resistiu. Se você marcar 3 com só relatos, o motor desce ' +
      'para o degrau que a prova sustenta e diz por quê — vale para você e vale para a IA, sem exceção.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + forcas + '</tbody></table></div>' +

      '<h3>A ordem em que as oito devem ser trabalhadas</h3>' +
      '<p class="small">Não é a ordem em que elas aparecem na tela. É a do motor, e ela existe porque ' +
      'decisão tem pré-requisito: ninguém prioriza o que não reconhece como problema, e ninguém aprova ' +
      'orçamento sem impacto. O cartão <strong>Próximos passos</strong> aponta sempre a primeira lacuna ' +
      'nesta ordem.</p>' +
      '<div class="ordem-decisao">' + ordem + '</div>' +

      '<h3>O que NÃO sobe o índice</h3>' +
      '<p class="small">Trabalho nosso é trabalho, e trabalho não é avanço. Nada disto move uma nota:</p>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap">' + naoContam + '</div>' +
      '</div>';
  }

  function manualDasEtapas() {
    const etapas = [
      ['Prospecção', 'Você achou a conta. O cliente ainda não se moveu.',
       'Nada é exigido para entrar aqui — é onde todo negócio nasce.',
       'Uma resposta dele. Qualquer sinal de vida do comprador tira o negócio daqui.'],
      ['Conexão', 'Há conversa com alguém do lado do cliente.',
       'Uma pessoa mapeada e uma troca registrada.',
       'Problema reconhecido com as palavras dele — a primeira das oito.'],
      ['Diagnóstico', 'Você está entendendo a operação dele, com dados dele.',
       'Problema em 1 ou 2. É aqui que Impacto costuma nascer.',
       'Impacto e Prioridade saindo do zero, e uma segunda pessoa na conversa.'],
      ['Benefícios', 'O cliente já enxerga o que ganha, e começa a comparar.',
       'Problema, Prioridade e Impacto com sinal; Critérios começando.',
       'Critérios definidos por ele e o caminho de compra (Processo) aparecendo.'],
      ['Proposta', 'O preço está na mesa.',
       'ESTA É A ÚNICA ETAPA COM PORTÃO NO SISTEMA — as seis condições abaixo.',
       'Consenso do grupo e os riscos dele endereçados.'],
      ['Validação', 'O cliente está checando internamente — jurídico, compras, alçada.',
       'Decisor econômico mapeado. Sem ele, o app marca falso avançado.',
       'Processo comprovado: você sabe o caminho exato até a assinatura.'],
      ['Fechamento', 'Falta a assinatura.',
       'Consenso e Risco resolvidos, ou o negócio volta.',
       'O desfecho registrado — é ele que congela a foto das oito e alimenta o Aprendizado.']
    ].map(function (e) {
      return '<tr><td class="rotulo-manual"><strong>' + esc(e[0]) + '</strong>' +
        '<span class="tiny muted">' + esc(e[1]) + '</span></td>' +
        '<td><span class="tiny muted"><strong>Para estar aqui de verdade:</strong> ' + esc(e[2]) + '</span>' +
        '<span class="tiny muted"><strong>Para sair daqui:</strong> ' + esc(e[3]) + '</span></td></tr>';
    }).join('');

    const gate = P.GATES_PROPOSTA.map(function (g) {
      const d = P.DIMENSOES.filter(function (x) { return x.id === g.dim; })[0];
      return '<tr><td class="rotulo-manual"><strong>' + esc(d ? d.nome : g.dim) + '</strong></td>' +
        '<td class="nowrap"><strong>' + g.min + '</strong> ou mais</td>' +
        '<td>' + esc(d ? d.niveis[g.min] : '') + '</td></tr>';
    }).join('');
    const fora = P.DIMENSOES.filter(function (d) {
      return !P.GATES_PROPOSTA.some(function (g) { return g.dim === d.id; });
    }).map(function (d) { return d.nome; }).join(' e ');

    return '<div class="card" id="m-etapas"><h2>O que cada etapa pede</h2>' +

      '<div class="aviso">Uma verdade que o manual precisa dizer antes da tabela: <strong>o app não impede ' +
      'você de arrastar um cartão para onde quiser</strong>. Etapa é onde você anotou; decisão é onde o ' +
      'cliente está. Só existe uma trava no sistema inteiro, e é a da Proposta — e mesmo ela não bloqueia: ' +
      'ela denuncia, marcando o negócio como <strong>Falso avançado</strong>. A tabela abaixo é o que ' +
      'costuma ser verdade em cada etapa quando o negócio é real.</div>' +

      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + etapas + '</tbody></table></div>' +

      '<h3>O portão da proposta — as seis condições</h3>' +
      '<p class="small">A proposta é consequência da qualificação, não ferramenta de descoberta. O app ' +
      'chama de <strong>Prontidão</strong> o percentual destas seis condições cumpridas, e ela aparece no ' +
      'painel e no cockpit.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + gate + '</tbody></table></div>' +
      '<p class="small" style="margin-top:10px">Repare em quem <strong>não</strong> está no portão: ' +
      esc(fora) + '. Não é esquecimento — essas duas amadurecem <em>durante</em> a proposta, e exigi-las ' +
      'antes travaria negócio bom. Mas elas são o que decide na Validação: negócio que chega ali sem ' +
      'consenso e com risco em aberto é o que some do forecast na última semana.</p>' +

      '<h3>Depois da proposta, três coisas fazem o app gritar</h3>' +
      '<p class="small">Estando em Proposta ou adiante, qualquer uma destas marca o negócio como ' +
      '<strong>Falso avançado</strong> — que é o maior destruidor de previsão de vendas:</p>' +
      '<ul class="limpa-manual">' +
      '<li>IAD abaixo de <strong>' + P.IAD_MADURO + '</strong>;</li>' +
      '<li>o portão acima <strong>não liberado</strong>;</li>' +
      '<li>nenhum <strong>decisor econômico</strong> mapeado no grupo comprador.</li>' +
      '</ul>' +
      '</div>';
  }

  function manualDasFaixas() {
    const evid = P.FAIXAS_EVIDENCIA.map(function (f, i) {
      const de = i === 0 ? 0 : P.FAIXAS_EVIDENCIA[i - 1].max + 1;
      const ate = f.max === Infinity ? ' dias ou mais' : ' a ' + f.max + ' dias';
      return '<tr><td class="rotulo-manual"><span class="pill ' + f.classe + '">' + esc(f.rotulo) + '</span></td>' +
        '<td class="nowrap">' + de + ate + '</td>' +
        '<td>' + esc([
          'O cliente se moveu esta semana. É o ritmo de quem fecha.',
          'Passou uma semana sem sinal dele. Ainda não é problema — é a hora de provocar.',
          'Duas semanas ou mais em silêncio. O negócio está saindo da mão sem ninguém perceber.',
          'Mais de um mês. O app chama de Zumbi. Requalifique com uma tentativa clara, ou encerre por inação — negócio parado no funil é previsão falsa.'
        ][i]) + '</td></tr>';
    }).join('');

    return '<div class="card" id="m-faixas"><h2>O que o número do IAD diz</h2>' +

      '<p class="small">De 0 a ' + P.IAD_MAXIMO + '. E o sistema tem <strong>um único limiar</strong>, não uma escala de ' +
      'cores: <strong>' + P.IAD_MADURO + '</strong>. Abaixo dele a decisão está sendo formada; a partir dele ela está ' +
      'madura. Tudo o mais que o app classifica cruza esse número com outras duas coisas — há quanto tempo ' +
      'o cliente não se move, e quanto do grupo comprador você tem mapeado.</p>' +

      '<div class="escada-manual escada-iad">' +
      '<div><span class="faixa-iad f0">0–11</span><div><strong>Você ainda não sabe se existe negócio</strong>' +
      '<span class="tiny muted">Média abaixo de 1,5 por decisão: o que existe é suposição nossa e alguma coisa ' +
      'declarada. Aqui o trabalho é diagnóstico. Um valor grande com IAD 6 não é pipeline, é esperança.</span></div></div>' +
      '<div><span class="faixa-iad f1">12–19</span><div><strong>O cliente falou, ninguém conferiu</strong>' +
      '<span class="tiny muted">É a faixa do que o cliente DISSE. A mais comum e a mais traiçoeira, porque parece ' +
      'pronta: cada frase daquelas ainda pode cair quando alguém for verificar. O trabalho aqui não é descobrir ' +
      'mais, é testar o que já se sabe.</span></div></div>' +
      '<div><span class="faixa-iad f2">' + P.IAD_MADURO + '–27</span><div><strong>Decisão madura — dá para contar no forecast</strong>' +
      '<span class="tiny muted">É o limiar do sistema: média 3, ou seja, a maioria das oito foi testada com o ' +
      'cliente e resistiu. A partir daqui, se o cliente se moveu nos últimos 14 dias e metade dos papéis críticos ' +
      'está mapeada, o app chama de <strong>Negócio real</strong>. Antes da proposta, chama de ' +
      '<strong>Oculto promissor</strong> — o achado mais valioso do pipeline.</span></div></div>' +
      '<div><span class="faixa-iad f3">28–' + P.IAD_MAXIMO + '</span><div><strong>Documentado quase por inteiro</strong>' +
      '<span class="tiny muted">Raro, e quando acontece o que falta costuma não ser decisão: é prazo, alçada ou ' +
      'assinatura. Se um negócio está em 30 há semanas, o problema não está nas oito — está no Processo, ' +
      'ou em alguém que ninguém mapeou.</span></div></div>' +
      '</div>' +

      '<div class="aviso" style="margin-top:14px"><strong>O número sozinho não classifica nada.</strong> ' +
      'Um negócio com IAD 28 e quarenta dias de silêncio é <strong>Zumbi</strong>, não é real — a regra do ' +
      'tempo vence todas as outras. É por isso que a tela mostra sempre os três juntos: o índice, os dias ' +
      'sem evidência e a cobertura do grupo.</div>' +

      '<h3>A segunda régua: há quanto tempo o cliente não se move</h3>' +
      '<p class="small">O relógio conta desde a <strong>última evidência do cliente</strong> — e não para ' +
      'porque você mandou e-mail. Atividade nossa não zera contador, por definição.</p>' +
      '<div class="tabela-rolagem"><table class="tabela-manual"><tbody>' + evid + '</tbody></table></div>' +

      '<h3>A terceira: cobertura do grupo comprador</h3>' +
      '<p class="small">Percentual dos papéis críticos que você tem mapeado e com relacionamento. ' +
      '<strong>50% ou mais</strong> é uma das três condições de Negócio real. E há um alerta que vale por ' +
      'si: venda que depende de <strong>uma pessoa só</strong> é o maior risco silencioso do funil — se ' +
      'ela sair da empresa, o negócio sai junto.</p>' +
      '</div>';
  }

  /* ---------------- A IA vista de quem vende ----------------

     Já existe a seção técnica com os onze pedidos e o que cada um é proibido
     de fazer. Esta é outra pergunta: em que MOMENTO do dia a IA aparece, o
     que ela tira das costas de quem vende, e o que continua sendo dele.

     A ordem aqui é a do dia de trabalho, não a da arquitetura. */

  function manualDaIAParaOVendedor() {
    const momento = function (quando, gatilho, faz, seu, ganho) {
      return '<tr><td class="rotulo-manual"><strong>' + esc(quando) + '</strong>' +
        '<span class="tiny muted">' + esc(gatilho) + '</span></td>' +
        '<td><span class="faz-ia">' + faz + '</span>' +
        '<span class="tiny muted seu-lado"><strong>Seu:</strong> ' + esc(seu) + '</span></td>' +
        '<td class="nowrap tiny muted">' + esc(ganho) + '</td></tr>';
    };

    const linhas = [
      momento('Chega um lead do LinkedIn',
        'Configuração → Buscar respostas',
        'Cria a <strong>empresa</strong>, o <strong>contato</strong> com papel na compra, a ' +
        '<strong>oportunidade</strong> e a <strong>tarefa</strong> de fazer contato. Classifica o segmento, ' +
        'guarda a conversa com a SDR no histórico e escreve um rascunho de reenquadramento.',
        'conferir o segmento e o papel na tela de importação, e marcar quem entra.',
        '4 cadastros por lead'),

      momento('Você vai criar um negócio',
        'Pipeline → + Oportunidade, colando o que tem',
        'Lê a ata, a proposta ou o e-mail e <strong>monta o negócio, a ficha da empresa e as pessoas</strong>. ' +
        'Se o material for grande, ainda separa as evidências e propõe as oito notas — o negócio nasce com ' +
        'histórico em vez de zerado.',
        'valor, etapa e data de fechamento. A IA não mexe nesses três.',
        'a digitação inteira'),

      momento('Você está preenchendo qualquer ficha',
        'a caixa ✨ no alto do formulário',
        'Preenche os campos a partir de um texto colado, de um documento carregado ou do que você ditar. ' +
        'Deduz o <strong>papel na compra pelo cargo</strong> e marca cada campo que sugeriu.',
        'conferir e clicar em Salvar. Nada é gravado antes disso.',
        'o preenchimento'),

      momento('Você acabou uma reunião',
        'Tarefas → Concluir, colando a ata',
        'Este é o momento que mais rende. Ela <strong>separa o que o CLIENTE fez do que você fez</strong>, ' +
        'transforma a parte dele em evidências com dimensão, força, pessoa, canal e data, relê as oito ' +
        'decisões, completa a ficha da empresa e das pessoas com o que apareceu, e atualiza valor, etapa, ' +
        'previsão e concorrentes quando o material comprova.',
        'contar o que aconteceu. Uma ata colada, quatro perguntas respondidas ou duas linhas escritas.',
        'a leitura e o lançamento'),

      momento('Você está com pressa, no carro',
        'Tarefas → Concluir → as quatro perguntas',
        'Cada "sim" nas quatro perguntas vira evidência sem você digitar, e as oito são relidas em seguida.',
        'quatro toques.',
        'o relato escrito'),

      momento('Você abriu um negócio e não sabe o que fazer',
        'cockpit → Próximos passos',
        'Lê o retrato inteiro e devolve <strong>até 4 passos na ordem</strong>, cada um com a decisão que ' +
        'pretende mover, a ação começando por verbo, <strong>uma pergunta pronta para fazer ao cliente</strong> ' +
        'e o porquê citando o que ele disse. Mais até 3 alertas de risco de perder.',
        'escolher o passo e fazer. Virar tarefa é um clique.',
        'o planejamento da conta'),

      momento('Você precisa de um ângulo para a conversa',
        'campo de insight do negócio',
        'Escreve um rascunho do reenquadramento — a verdade sobre o negócio dele que ele não enxerga ' +
        'sozinho, na linguagem do setor.',
        'editar. É rascunho, e o cliente vai ouvir na sua voz.',
        'a página em branco'),

      momento('Fim de semana, olhando a carteira',
        'Painel → Gerar o plano da semana',
        'Lê a série das últimas semanas e o rendimento por tipo de tarefa, e diz o que melhorou, o que ' +
        'piorou e <strong>até três mudanças</strong> no jeito de trabalhar — cada uma com o número que a ' +
        'justifica e o indicador que vai dizer se deu certo.',
        'decidir se muda.',
        'a análise')
    ].join('');

    return '<div class="card" id="m-ia-vendedor"><h2>A IA no seu dia — o que ela tira das suas costas</h2>' +

      '<p class="small">A seção seguinte lista os onze pedidos por dentro. Esta responde outra pergunta: ' +
      '<strong>em que momento do dia ela aparece, o que ela faz por você, e o que continua sendo seu</strong>.</p>' +

      '<div class="tabela-rolagem"><table class="tabela-manual"><thead><tr>' +
      '<th>Quando</th><th>O que ela faz — e o que fica com você</th><th>Poupa</th>' +
      '</tr></thead><tbody>' + linhas + '</tbody></table></div>' +

      '<h3>A IaD, a caixa que abre quando você entra</h3>' +
      '<p class="small">Uma vez por dia, na primeira tela depois do login, ela pergunta o que você quer ' +
      'saber. Você responde com suas palavras — <em>quais minhas tarefas do dia</em>, <em>qual conta está ' +
      'melhor</em>, <em>quem sumiu</em> — e ela mostra a resposta com as linhas clicáveis, que levam direto ' +
      'ao negócio. Os botões ao lado da pergunta são as perguntas que ela sabe responder; o texto livre é ' +
      'só um atalho para eles. Para chamá-la de volta depois de fechada, o rosto no alto da tela.</p>' +

      '<p class="small">A pergunta também pode ter <strong>nome próprio</strong>: <em>como está a Pif ' +
      'Paf</em>, <em>o que falta na Marilan</em>, <em>tarefas da Bio Water</em>, <em>quem eu conheço na ' +
      'Hortência</em>. Quem resolve o nome é o aplicativo, contra as empresas que existem na sua carteira. ' +
      'Se a empresa tiver duas negociações abertas, ela pergunta qual — chutar aqui seria responder sobre ' +
      'o negócio errado. E se o nome não estiver na carteira, ela diz isso, em vez de escolher alguém.</p>' +

      '<p class="small">E ela <strong>lembra da resposta anterior</strong>. Depois de perguntar qual conta ' +
      'está melhor, <em>e o que falta nela?</em> funciona sem repetir o nome. É uma negociação de memória, ' +
      'não um histórico: se você citar outra empresa, a conversa muda de assunto na hora.</p>' +
      '<div class="aviso"><strong>Aqui a IA não responde: ela só entende.</strong> Quem calcula quantas ' +
      'tarefas existem, qual negócio está melhor e há quantos dias o cliente sumiu é o motor, com os seus ' +
      'dados. A IA serve para descobrir qual das perguntas você fez. É por isso que o número que sai daqui ' +
      'é o mesmo que está na tela — e é por isso que, com o assistente fora do ar, os botões continuam ' +
      'funcionando.</div>' +

      '<h3>A regra que resume as oito linhas acima</h3>' +
      '<div class="aviso"><strong>Ela lê e propõe. Você conta o que aconteceu. O motor calcula. ' +
      'E só o que o CLIENTE fez move a nota.</strong></div>' +

      '<h3>Então o que é fundamental que VOCÊ faça</h3>' +
      '<p class="small">Se for para guardar quatro coisas deste manual inteiro, são estas — e as quatro ' +
      'são justamente o que a IA <em>não</em> pode fazer no seu lugar:</p>' +

      '<div class="escada-manual">' +
      '<div><span class="nota-manual n2">1</span><div><strong>Contar o que aconteceu, sempre</strong>' +
      '<span class="tiny muted">É o combustível de tudo. Sem relato não há evidência, sem evidência não há ' +
      'nota, sem nota o índice não anda e a conta parece parada mesmo tendo andado. Tarefa fechada sem ' +
      'relato move o funil e não move nenhuma das oito — e o app marca isso.</span></div></div>' +

      '<div><span class="nota-manual n2">2</span><div><strong>Fazer o cliente produzir prova</strong>' +
      '<span class="tiny muted">Nota 2 exige evidência confirmada ou documentada. Isso não se consegue ' +
      'falando: consegue-se pedindo. "Você me manda esse número por e-mail?" vale mais para o índice do ' +
      'que uma hora de conversa boa. A IA lê o que existe; quem faz existir é você.</span></div></div>' +

      '<div><span class="nota-manual n2">3</span><div><strong>Trazer gente nova para a conversa</strong>' +
      '<span class="tiny muted">A IA reconhece quem aparece no material, mas não faz ninguém aparecer. ' +
      'Venda que depende de uma pessoa só é o maior risco silencioso do funil, e cobertura do grupo é uma ' +
      'das três condições de Negócio real.</span></div></div>' +

      '<div><span class="nota-manual n2">4</span><div><strong>Discordar quando ela errar</strong>' +
      '<span class="tiny muted">A IA propõe nota; quem esteve na reunião é você. O relatório da leitura ' +
      'tem o botão <strong>Ajustar as oito</strong>, e cada mudança fica gravada com data no histórico. ' +
      'Nota inflada vira previsão falsa no painel do dono da empresa, e ninguém descobre a tempo.</span></div></div>' +
      '</div>' +

      '<h3>Uma pasta inteira de uma vez: o ZIP</h3>' +
      '<p class="small">Onde dá para anexar documento, dá para anexar um <strong>.zip</strong>. Ele não ' +
      'vira “um documento”: o app abre e cada arquivo de dentro entra na lista com o próprio nome, ' +
      'como se você tivesse arrastado os seis em vez da pasta. Isso importa — a IA sabe qual número ' +
      'saiu de qual arquivo, e <em>“a planilha diz 4%”</em> é diferente de <em>“o dossiê diz 4%”</em>. ' +
      'Dá para tirar da lista o que não serve antes de mandar ler.</p>' +
      '<ul class="small">' +
      '<li><strong>Um arquivo ruim não derruba os outros.</strong> PDF digitalizado dentro do ZIP volta ' +
      'com o motivo ao lado do nome dele; o resto é lido normalmente.</li>' +
      '<li><strong>Pasta, <code>__MACOSX</code> e <code>.DS_Store</code></strong> são ignorados sozinhos. ' +
      'O que o app não sabe ler — imagem, executável — fica de fora, e a primeira linha da lista diz ' +
      'o quê, em vez de deixar você achar que leu tudo.</li>' +
      '<li><strong>Até 20 arquivos por ZIP.</strong> Acima disso a cota da IA se reparte em pedaços ' +
      'pequenos demais para servirem a alguém — e o app avisa quantos ficaram de fora.</li>' +
      '<li><strong>ZIP dentro de ZIP não é aberto</strong>, de propósito.</li>' +
      '</ul>' +
      '<p class="tiny muted"><strong>RAR e 7z não dão, e não é esquecimento.</strong> O navegador ' +
      'descomprime ZIP de graça — é o mesmo motor que abre Word e Excel, que por dentro são ZIP. ' +
      'RAR exigiria carregar uma biblioteca de centenas de kilobytes num app que não tem nenhuma ' +
      'dependência, para um formato que o próprio Windows e o próprio Mac substituem por ZIP com dois ' +
      'cliques (botão direito → Compactar). Se você anexar um, a mensagem diz isso em vez de falhar ' +
      'sem explicação.</p>' +

      '<h3>E o que ela não faz, por mais que pareça</h3>' +
      '<p class="small">Ela não classifica o pipeline — Zumbi, Falso avançado e os outros saem de regra ' +
      'fixa. Ela não pontua sozinha em definitivo: propõe, e os degraus 3 e 4 continuam exigindo prova. Ela nunca ' +
      '<strong>rebaixa</strong> uma nota — corrigir para baixo é sempre humano. E, com o assistente fora ' +
      'do ar, o sistema inteiro continua de pé: some o atalho, não o método.</p>' +
      '</div>';
  }

  function playbook() {
    const dims = P.DIMENSOES.map(function (d) {
      const canais = P.CANAIS.map(function (c) {
        return '<tr><td style="white-space:nowrap"><strong>' + esc(c.nome) + '</strong></td><td>' + esc(d.canais[c.id]) + '</td></tr>';
      }).join('');
      return '<div class="card"><h3>' + esc(d.nome) + '</h3>' +
        '<p class="small"><strong>' + esc(d.pergunta) + '</strong></p>' +
        '<p class="tiny muted">Evidências que contam: ' + esc(d.evidencias.join(' · ')) + '</p>' +
        '<div class="tabela-rolagem"><table><tbody>' + canais + '</tbody></table></div>' +
        '<p class="tiny muted" style="margin-top:8px">Material: ' + esc(d.conteudo) + '</p></div>';
    }).join('');

    const naoContam = P.ATIVIDADES_QUE_NAO_CONTAM.map(function (a) { return '<span class="pill dead">' + esc(a) + '</span>'; }).join(' ');
    const forcas = P.FORCAS.map(function (f) {
      return '<tr><td><strong>' + esc(f.rotulo) + '</strong></td><td>' + esc(f.desc) + '</td></tr>';
    }).join('');

    /* A teoria toda numa tela só, e começando pela parte que o vendedor usa
       todo dia: como uma tarefa vira avanço. Antes esta tela abria pelas oito
       decisões, que é o fim da história — quem chega aqui quer saber o que
       fazer amanhã de manhã, não a taxonomia. */
    const tiposDeTarefa = Store.nomesDoCatalogo('tiposTarefa').map(function (t) {
      return '<span class="pill">' + esc(t) + '</span>';
    }).join(' ');

    /* A versão fica aqui, no alto da tela que todo mundo abre, e não escondida
       na Configuração. Quando alguém diz "o app está estranho", a primeira
       pergunta é qual versão ele está vendo — e a resposta tem de estar à
       mão, não a três cliques. */
    const v = global.IADVersao || {};

    return '<div class="row" style="align-items:flex-start">' +
      '<div><h1 style="margin:0">Manual do IAD CRM</h1>' +
      /* Dizia "funciona offline: está tudo guardado no aparelho" — verdade até a
         v180 e mentira desde então. O aparelho não guarda mais carteira: o
         servidor é a única fonte, e sem conexão o app nem abre. Frase errada no
         alto do manual é pior do que frase nenhuma, porque ela é acreditada. */
      '<p class="small muted" style="margin:4px 0 14px">O método e o sistema, na mesma tela. ' +
      'A carteira mora no servidor: ela é a mesma em qualquer aparelho em que você entrar.</p></div>' +
      '<span class="espaco"></span>' +
      (v.numero ? '<div class="carimbo-versao"><strong>' + esc(v.numero) + '</strong>' +
        (v.data ? '<span>' + esc(U.data(v.data)) + '</span>' : '') + '</div>' : '') +
      '</div>' +
      indiceDoManual() +
      '<div class="card" id="m-regra"><h2>A regra</h2>' +
      '<p>O estágio mostra onde a oportunidade está. As decisões mostram se ela realmente avançou.</p>' +
      '<p class="small">Só o cliente move o índice. O que <strong>nós</strong> fazemos — apresentar, ' +
      'propor, cobrar, dar follow-up — é trabalho, e trabalho não é avanço.</p>' +
      '<p class="small muted">Não conta como avanço:</p><div class="row">' + naoContam + '</div></div>' +

      manualDasOito() +
      manualDoCaminho() +
      manualDoDia() +
      manualDaFila() +
      manualDoPotencial() +
      manualDaNutricao() +
      manualDasNotas() +
      manualDoLinkedHelper() +
      manualDosSinais() +
      manualDoEmail() +
      manualDaRegua() +
      manualDoAvanco() +
      manualDasFaixas() +
      manualDasEtapas() +
      '<div class="card" id="m-tarefa"><h2>Tudo entra por tarefa</h2>' +
      '<p class="small">Uma evidência nunca aparece do nada: ela vem de uma conversa, uma visita, ' +
      'um e-mail. Por isso há um botão só — <strong>+ Tarefa</strong> — e a tarefa é o lugar onde ' +
      'a decisão anda. Sem isso, o sistema registra o efeito e perde a causa: ninguém sabe depois ' +
      'por qual canal aquele negócio andou, nem qual canal funciona nesta conta.</p>' +
      '<p class="small"><strong>A fazer</strong> é o que você marcou para fazer. ' +
      '<strong>Já foi feita</strong> é o que aconteceu e você está anotando. As duas contam no ' +
      'funil e não contam igual no método: a primeira mostra planejamento, a segunda mostra ' +
      'corrida atrás do histórico. O sistema guarda a diferença e o assistente a lê.</p>' +
      '<p class="small muted" style="margin-top:10px">Canais disponíveis (você edita a lista em Cadastros):</p>' +
      '<div class="row">' + tiposDeTarefa + '</div></div>' +

      '<div class="card" id="m-contar"><h2>Quando a tarefa já aconteceu, há quatro modos de contar</h2>' +
      '<div class="tabela-rolagem"><table><tbody>' +
      '<tr><td style="white-space:nowrap"><strong>Colar a ata</strong></td>' +
      '<td>Cole a transcrição ou anexe os documentos (Word, PDF, Excel, vários de uma vez). ' +
      'O assistente separa o que o <em>cliente</em> fez, propõe uma evidência por decisão e depois ' +
      'relê as oito com as evidências novas. É o caminho mais completo: uma reunião costuma mover ' +
      'três ou quatro decisões de uma vez.</td></tr>' +
      '<tr><td style="white-space:nowrap"><strong>Quatro perguntas</strong></td>' +
      '<td>Entrou alguém novo? Ficou número acordado? Ficou próximo passo com data? Apareceu ' +
      'bloqueio novo? Cada “sim” vira evidência sem você digitar — é o caminho de quem está no ' +
      'carro depois da visita. As oito são relidas em seguida, do mesmo jeito.</td></tr>' +
      '<tr><td style="white-space:nowrap"><strong>Evidência direta</strong></td>' +
      '<td>Uma coisa só aconteceu e você sabe qual decisão ela move. Abre a tela de evidência já ' +
      'com o canal e a data da tarefa.</td></tr>' +
      '<tr><td style="white-space:nowrap"><strong>Nada a registrar</strong></td>' +
      '<td>A tarefa aconteceu e o cliente não se moveu. Isso também é informação: o negócio ' +
      'consumiu trabalho e não andou.</td></tr>' +
      '</tbody></table></div></div>' +

      '<div class="card"><h2>O que faz uma reunião valer</h2>' +
      '<p class="small">Quanto mais reuniões <em>com evidência</em> uma conta acumula, melhor ela fica — ' +
      'e reunião sem evidência é reunião que não aconteceu, para o índice. Três perguntas antes de ' +
      'marcar a próxima:</p>' +
      '<p class="small">1. <strong>Qual das oito eu vou provocar?</strong> A tarefa pede isso no ' +
      'campo “decisão que pretende provocar”, e o painel ali mostra o que conta como evidência dela ' +
      'e o que fazer no canal escolhido.</p>' +
      '<p class="small">2. <strong>Quem precisa estar?</strong> Venda que depende de uma pessoa só é ' +
      'o maior risco silencioso — o alerta do cockpit avisa.</p>' +
      '<p class="small">3. <strong>O que vai ficar combinado, com data e com dono?</strong> Negócio ' +
      'sem próximo passo combinado não dá para saber se atrasou.</p></div>' +
      '<div class="card"><h2>Força da evidência</h2>' +
      '<p class="small">Uma decisão só chega a 2 com evidência confirmada ou documentada.</p>' +
      '<div class="tabela-rolagem"><table><tbody>' + forcas + '</tbody></table></div></div>' +
      manualDasTelas() +
      manualDoPipeline() +
      manualDaFilaDeEnvio() +
      manualDasTarefas() +
      manualDasConversas() +
      manualDoAprendizado() +
      manualDaConfiguracao() +
      manualDaIAParaOVendedor() +
      manualDaIA() +
      manualDosLimites() +
      '<div class="card" id="m-perfis"><h2>Quem move a decisão por dentro</h2>' +
      '<p class="small">Do <em>Challenger Customer</em>: nem todo contato acessível move a compra. Três perfis mobilizam, três apenas conversam, um bloqueia.</p>' +
      '<div class="tabela-rolagem"><table><thead><tr><th>Perfil</th><th>Grupo</th><th>Como trabalhar</th></tr></thead><tbody>' +
      P.PERFIS.filter(function (x) { return x.grupo !== 'indefinido'; }).map(function (x) {
        const classe = { mobilizador: 'ok', falador: 'warn', bloqueador: 'dead' }[x.grupo];
        return '<tr><td><strong>' + esc(x.rotulo) + '</strong></td>' +
          '<td><span class="pill ' + classe + '">' + esc(x.grupo) + '</span></td>' +
          '<td>' + esc(x.dica) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="tiny muted" style="margin-top:8px">A pesquisa por trás desses perfis vem da CEB/Gartner e é defendida sobretudo por quem a produziu. Use como hipótese de trabalho, não como lei.</p></div>' +
      '<div class="sec-titulo" id="m-cadencia"><h2>As 8 decisões e a cadência multicanal</h2></div>' + dims;
  }

  global.IADViewsManual = Object.freeze({ playbook: playbook });
})(window);
