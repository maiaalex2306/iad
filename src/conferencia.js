/* A conferência do banco, feita pelo próprio aplicativo.
   ==================================================================
   POR QUE ESTA TELA EXISTE

   "Rodei o SQL — está tudo certo agora?" é a pergunta que voltou quatro vezes,
   e todas as vezes a resposta foi um palpite. Quem olhava o banco não tinha
   como ver o aplicativo; quem olhava o aplicativo não tinha como ver o banco.
   No meio disso, uma correção que o nome prometia cobrir tudo e não cobria.

   Existe `nuvem/conferir.sql`, que responde com exatidão — mas exige abrir o
   painel do Supabase, achar o SQL Editor, colar e ler uma tabela de 75 linhas.
   Quem usa o CRM não tem que fazer isso para saber se o CRM está inteiro.

   Então a mesma conferência mora aqui, atrás de um botão, falando com o
   servidor de verdade com a sessão de quem está logado. Ela NÃO MUDA NADA:
   pergunta ao PostgREST quais tabelas e colunas ele conhece, pergunta à função
   do assistente qual versão ela é, e compara com o que esta versão do app
   precisa.

   A LISTA ABAIXO É GERADA a partir dos próprios arquivos .sql do repositório,
   e `nuvem/testes/conferir.test.ts` quebra se ela ficar para trás. Lista
   escrita à mão envelhece calada — foi exatamente assim que a tabela `notas`
   passou meses faltando sem ninguém saber.

   Cada item é [grupo, tipo, alvo, coluna, arquivo que cria]. */
(function (global) {
  'use strict';

  /* GERADO A PARTIR DOS ARQUIVOS SQL — não edite à mão. */
  const ESPERADO = [
    ["e-mail", "tabela", "caixas_email", "", "nuvem/correcao-18-emails.sql"],
    ["carteira", "tabela", "contas", "", "nuvem/schema.sql"],
    ["carteira", "tabela", "contatos", "", "nuvem/schema.sql"],
    ["acesso", "tabela", "convites", "", "nuvem/correcao-03-convites.sql"],
    ["e-mail", "tabela", "emails", "", "nuvem/correcao-18-emails.sql"],
    ["carteira", "tabela", "fontes", "", "nuvem/schema.sql"],
    ["whatsapp", "tabela", "mensagens_whatsapp", "", "nuvem/whatsapp.sql"],
    ["carteira", "tabela", "notas", "", "nuvem/correcao-23-notas-rapidas.sql"],
    ["carteira", "tabela", "oportunidades", "", "nuvem/schema.sql"],
    ["acesso", "tabela", "perfis", "", "nuvem/schema.sql"],
    ["carteira", "tabela", "produtos", "", "nuvem/schema.sql"],
    ["carteira", "tabela", "segmentos", "", "nuvem/schema.sql"],
    ["e-mail", "tabela", "segredos_email", "", "nuvem/correcao-21-senha-da-caixa.sql"],
    ["carteira", "tabela", "sinais", "", "nuvem/correcao-17-sinais.sql"],
    ["carteira", "tabela", "tarefas", "", "nuvem/schema.sql"],
    ["acesso", "tabela", "tenants", "", "nuvem/schema.sql"],
    ["carteira", "tabela", "tipos_tarefa", "", "nuvem/schema.sql"],
    ["whatsapp", "tabela", "whatsapp_numeros", "", "nuvem/whatsapp.sql"],
    ["e-mail", "coluna", "caixas_email", "envia", "nuvem/correcao-20-caixa-que-envia.sql"],
    ["e-mail", "coluna", "caixas_email", "marcas", "nuvem/correcao-26-a-minha-resposta.sql"],
    ["e-mail", "coluna", "caixas_email", "pastas", "nuvem/correcao-19-analise-do-email.sql"],
    ["e-mail", "coluna", "caixas_email", "senha_em", "nuvem/correcao-21-senha-da-caixa.sql"],
    ["e-mail", "coluna", "caixas_email", "ultimo_uid", "nuvem/correcao-19-analise-do-email.sql"],
    ["carteira", "coluna", "contas", "descricao", "nuvem/correcao-11-conta-campos.sql"],
    ["carteira", "coluna", "contas", "dono_id", "nuvem/correcao-05-gestor.sql"],
    ["carteira", "coluna", "contas", "linkedin", "nuvem/correcao-11-conta-campos.sql"],
    ["carteira", "coluna", "contas", "necessidades", "nuvem/correcao-11-conta-campos.sql"],
    ["carteira", "coluna", "contas", "pais", "nuvem/correcao-11-conta-campos.sql"],
    ["carteira", "coluna", "contatos", "dono_id", "nuvem/correcao-05-gestor.sql"],
    ["carteira", "coluna", "contatos", "email_pessoal", "nuvem/correcao-13-contatos-dois-canais.sql"],
    ["carteira", "coluna", "contatos", "telefone_comercial", "nuvem/correcao-13-contatos-dois-canais.sql"],
    ["acesso", "coluna", "convites", "nome", "nuvem/correcao-08-nome-do-convite.sql"],
    ["e-mail", "coluna", "emails", "analisada_em", "nuvem/correcao-19-analise-do-email.sql"],
    ["e-mail", "coluna", "emails", "analise", "nuvem/correcao-19-analise-do-email.sql"],
    ["e-mail", "coluna", "emails", "analise_erro", "nuvem/correcao-19-analise-do-email.sql"],
    ["e-mail", "coluna", "emails", "analise_tentativas", "nuvem/correcao-19-analise-do-email.sql"],
    ["carteira", "coluna", "oportunidades", "campanha", "nuvem/correcao-06-origem.sql"],
    ["carteira", "coluna", "oportunidades", "dono", "nuvem/correcao-02-colunas.sql"],
    ["carteira", "coluna", "oportunidades", "fonte_id", "nuvem/correcao-14-fontes.sql"],
    ["carteira", "coluna", "oportunidades", "historico_nutricao", "nuvem/correcao-16-tudo-em-dia.sql"],
    ["carteira", "coluna", "oportunidades", "itens", "nuvem/correcao-16-tudo-em-dia.sql"],
    ["carteira", "coluna", "oportunidades", "nutricao", "nuvem/correcao-12-colunas-que-faltavam.sql"],
    ["carteira", "coluna", "oportunidades", "orientacao", "nuvem/correcao-16-tudo-em-dia.sql"],
    ["carteira", "coluna", "oportunidades", "origem", "nuvem/correcao-06-origem.sql"],
    ["carteira", "coluna", "oportunidades", "prazo_contrato_meses", "nuvem/correcao-15-itens-e-cobranca.sql"],
    ["carteira", "coluna", "oportunidades", "sdr", "nuvem/correcao-06-origem.sql"],
    ["carteira", "coluna", "oportunidades", "sdr_email", "nuvem/correcao-06-origem.sql"],
    ["carteira", "coluna", "oportunidades", "valor_mensal", "nuvem/correcao-15-itens-e-cobranca.sql"],
    ["carteira", "coluna", "produtos", "tipo_cobranca", "nuvem/correcao-15-itens-e-cobranca.sql"],
    ["carteira", "coluna", "segmentos", "atualizado_em", "nuvem/correcao-02-colunas.sql"],
    ["carteira", "coluna", "segmentos", "oportunidades", "nuvem/correcao-10-segmentos.sql"],
    ["carteira", "coluna", "segmentos", "personas", "nuvem/correcao-10-segmentos.sql"],
    ["carteira", "coluna", "segmentos", "subsegmentos", "nuvem/correcao-10-segmentos.sql"],
    ["carteira", "coluna", "tarefas", "adiamentos", "nuvem/correcao-12-colunas-que-faltavam.sql"],
    ["carteira", "coluna", "tarefas", "com_relato", "nuvem/correcao-12-colunas-que-faltavam.sql"],
    ["carteira", "coluna", "tarefas", "descricao", "nuvem/correcao-12-colunas-que-faltavam.sql"],
    ["carteira", "coluna", "tarefas", "hora", "nuvem/correcao-12-colunas-que-faltavam.sql"],
    ["carteira", "coluna", "tarefas", "origem", "nuvem/correcao-12-colunas-que-faltavam.sql"],
    ["carteira", "coluna", "tarefas", "sem_registro", "nuvem/correcao-12-colunas-que-faltavam.sql"],
    ["acesso", "coluna", "tenants", "ponte_chave", "nuvem/correcao-16-tudo-em-dia.sql"],
    ["acesso", "coluna", "tenants", "ponte_url", "nuvem/correcao-16-tudo-em-dia.sql"],
    ["carteira", "coluna", "tipos_tarefa", "atualizado_em", "nuvem/correcao-02-colunas.sql"],
    ["acesso", "funcao", "ao_criar_usuario", "", "nuvem/schema.sql"],
    ["acesso", "funcao", "criar_minha_empresa", "", "nuvem/schema.sql"],
    ["acesso", "funcao", "definir_bloqueio_da_empresa", "", "nuvem/correcao-09-bloqueio.sql"],
    ["acesso", "funcao", "definir_bloqueio_do_perfil", "", "nuvem/correcao-09-bloqueio.sql"],
    ["acesso", "funcao", "definir_dados_da_empresa", "", "nuvem/correcao-09-bloqueio.sql"],
    ["acesso", "funcao", "definir_dados_do_perfil", "", "nuvem/correcao-09-bloqueio.sql"],
    ["acesso", "funcao", "definir_empresa_do_perfil", "", "nuvem/correcao-04-permissoes.sql"],
    ["acesso", "funcao", "definir_nome_do_perfil", "", "nuvem/correcao-08-nome-do-convite.sql"],
    ["acesso", "funcao", "definir_papel_do_perfil", "", "nuvem/correcao-04-permissoes.sql"],
    ["acesso", "funcao", "definir_ponte_da_empresa", "", "nuvem/correcao-16-tudo-em-dia.sql"],
    ["acesso", "funcao", "meu_tenant", "", "nuvem/schema.sql"],
    ["acesso", "funcao", "minha_situacao", "", "nuvem/correcao-09-bloqueio.sql"],
    ["acesso", "funcao", "sou_admin", "", "nuvem/schema.sql"],
    ["acesso", "funcao", "sou_gestor", "", "nuvem/correcao-05-gestor.sql"]
  ];

  /* Resolvido na HORA de usar, não na carga.

     Este arquivo entra antes do nuvem.js na ordem do index.html, então
     `const N = global.IADNuvem` guardava `undefined` para sempre — e a
     conferência respondia "entre no servidor" para quem estava logado. O
     teste pegou; a ordem dos <script> é frágil demais para se confiar nela. */
  function nuvem() { return global.IADNuvem; }

  const GRUPOS = [
    { id: 'carteira', nome: 'A carteira', diz: 'Contas, contatos, negócios, tarefas, notas e sinais. É o que trava a sincronização quando falta.' },
    { id: 'acesso', nome: 'Acesso e permissões', diz: 'Empresas, perfis, convites e as funções que decidem quem vê o quê.' },
    { id: 'e-mail', nome: 'Caixa de e-mail', diz: 'Só importa se você usa o e-mail dentro do app.' },
    { id: 'whatsapp', nome: 'WhatsApp', diz: 'Só importa se você usa o WhatsApp dentro do app.' }
  ];

  /* ---------- o que o servidor conhece ----------

     Uma pergunta por tabela: "me devolva estas colunas, zero linhas". Três
     respostas possíveis, e as três são informação:

       · lista vazia       → a tabela existe e todas aquelas colunas também.
       · "não achei a tabela" → a tabela não existe.
       · "a coluna X não existe" → tira X da lista e pergunta de novo.

     A terceira é uma escada, como a do envio: cada recusa ensina um nome, e a
     volta seguinte vai sem ele. Na prática são zero ou uma voltas; o teto
     existe para que um servidor que responda sempre a mesma coisa não ponha a
     tela num laço.

     NENHUM registro é lido — `limit=0` garante isso. A pergunta é sobre o
     formato da tabela, nunca sobre o conteúdo dela. */

  const SEM_A_TABELA = /Could not find the table '(?:public\.)?([\w]+)'/i;
  /* "Permissão negada" é prova de que a tabela EXISTE: o Postgres só nega
     permissão sobre o que existe; o que não existe dá "relation does not
     exist". E numa tabela aqui isso não é defeito, é o desenho —
     `segredos_email` guarda senhas de caixa de e-mail e tem `revoke all ...
     from authenticated, anon` de propósito: a única coisa no sistema que lê ali
     é a Edge Function, com a chave secreta, do lado do servidor.

     Tratar isso como falha foi erro meu, e derrubava a conferência inteira
     por causa da tabela mais bem protegida do banco. */
  const SEM_PERMISSAO = /permission denied for (?:table|relation) ([\w]+)/i;
  const SEM_A_COLUNA = [
    /column (?:[\w"]+\.)?"?([\w]+)"? does not exist/i,
    /Could not find the '([\w]+)' column/i
  ];

  function colunaDoErro(msg) {
    for (let i = 0; i < SEM_A_COLUNA.length; i++) {
      const m = SEM_A_COLUNA[i].exec(msg || '');
      if (m) return m[1];
    }
    return null;
  }

  const VOLTAS_MAXIMAS = 12;

  function sondar(tabela, colunas) {
    const N = nuvem();
    function tentar(restantes, faltando, volta) {
      return N.sondarTabela(tabela, restantes).then(
        function () { return { existe: true, faltando: faltando }; },
        function (e) {
          const msg = (e && e.message) || '';
          const t = SEM_A_TABELA.exec(msg);
          if (t) return { existe: false, faltando: [] };
          if (SEM_PERMISSAO.test(msg)) return { existe: true, faltando: [], trancada: true };
          const col = colunaDoErro(msg);
          /* Só repete quando aprendeu um nome NOVO que estava na pergunta.
             Sem essa guarda, um erro que cite sempre a mesma coluna gira para
             sempre. */
          if (col && restantes.indexOf(col) !== -1 && volta < VOLTAS_MAXIMAS) {
            return tentar(restantes.filter(function (c) { return c !== col; }),
              faltando.concat([col]), volta + 1);
          }
          /* Qualquer outra recusa é do servidor, não do formato da tabela:
             permissão, rede, chave. Ela sobe, para a tela dizer o que foi em
             vez de inventar que falta alguma coisa. */
          throw e;
        });
    }
    return tentar((colunas || []).slice(), [], 0);
  }

  /* As tabelas e as colunas que cada uma precisa ter, tiradas da lista
     esperada. Funções não entram: ver `conferir()`. */
  function porTabela() {
    const mapa = {};
    ESPERADO.forEach(function (e) {
      const grupo = e[0], tipo = e[1], alvo = e[2], coluna = e[3], arquivo = e[4];
      if (tipo === 'funcao') return;
      const t = mapa[alvo] || (mapa[alvo] = { grupo: grupo, colunas: [], arquivos: {}, arquivo: '' });
      if (tipo === 'tabela') { t.arquivo = arquivo; t.grupo = grupo; }
      else { t.colunas.push(coluna); t.arquivos[coluna] = arquivo; }
    });
    return mapa;
  }

  /* ---------- a função do assistente ----------

     Texto vazio de propósito: a função devolve antes de falar com o modelo, e
     a conferência não gasta nem um centavo. O que interessa é só se ela
     RECONHECE o tipo — tipo desconhecido significa função antiga, publicada
     antes da varredura diária existir.

     Três respostas possíveis, e as três importam: reconheceu, não reconheceu,
     ou nem está no ar. Uma frase só para as três mandaria a pessoa mexer no
     lugar errado. */
  const TIPO_NOVO = 'orientacao';

  function conferirAssistente() {
    return nuvem().chamarFuncao('assistente', { tipo: TIPO_NOVO, texto: '' }).then(
      function (r) {
        if (r && r.erro && /tipo desconhecido/i.test(r.erro)) {
          return { situacao: 'velha' };
        }
        return { situacao: 'ok' };
      },
      function (e) {
        const msg = (e && e.message) || '';
        if (/tipo desconhecido/i.test(msg)) return { situacao: 'velha', recado: msg };
        return { situacao: 'fora', recado: msg };
      }
    );
  }

  /* ---------- a conferência inteira ----------

     AS FUNÇÕES NÃO SÃO CONFERIDAS, e isso é decisão, não esquecimento.

     A única forma de perguntar ao PostgREST se `sou_admin()` existe é CHAMAR a
     função. Chamar `sou_admin()` seria inofensivo; chamar
     `definir_papel_do_perfil()` não é — ela muda o papel de alguém. Uma
     conferência que escreve no banco deixa de ser conferência, e uma lista de
     "quais podem ser chamadas e quais não" é exatamente o tipo de lista que
     envelhece e um dia chama a errada.

     E não falta nada por isso: as políticas de linha do banco chamam
     `meu_tenant()` e `sou_admin()` em TODA leitura. Se elas não existissem,
     nada carregaria — a tela estaria vazia em vez de estar perguntando. Quem
     está logado e vendo a carteira já provou as duas.

     Quem quiser a lista completa, com funções, tem o `nuvem/conferir.sql`: lá
     a pergunta é feita pelo catálogo do Postgres, sem chamar nada. */
  function conferir() {
    const N = nuvem();
    if (!N || !N.conectado()) {
      return Promise.reject(new Error('Entre no servidor antes de conferir — a conferência fala com ele.'));
    }

    const mapa = porTabela();
    const nomes = Object.keys(mapa);

    /* Uma tabela que não dá para conferir não pode levar o relatório inteiro
       junto — foi o que aconteceu com `segredos_email`. Cada sonda resolve com
       o que conseguiu, inclusive com o motivo de não ter conseguido, e a tela
       mostra isso como "não deu para conferir" em vez de não mostrar nada. */
    return Promise.all(nomes.map(function (t) {
      return sondar(t, mapa[t].colunas).then(
        function (r) { return { tabela: t, resultado: r }; },
        function (e) {
          return { tabela: t, resultado: { indefinido: true, existe: true, faltando: [],
            erro: (e && e.message) || 'não deu para conferir' } };
        });
    })).then(function (saidas) {
      const achado = {};
      saidas.forEach(function (s) { achado[s.tabela] = s.resultado; });

      const trancadas = saidas.filter(function (s) { return s.resultado.trancada; })
        .map(function (s) { return s.tabela; });
      const indefinidas = saidas.filter(function (s) { return s.resultado.indefinido; })
        .map(function (s) { return { tabela: s.tabela, erro: s.resultado.erro }; });

      const itens = ESPERADO.filter(function (e) { return e[1] !== 'funcao'; }).map(function (e) {
        const grupo = e[0], tipo = e[1], alvo = e[2], coluna = e[3], arquivo = e[4];
        const a = achado[alvo] || { existe: false, faltando: [] };
        return {
          grupo: grupo, tipo: tipo, alvo: alvo, coluna: coluna, arquivo: arquivo,
          existe: tipo === 'tabela' ? a.existe : (a.existe && a.faltando.indexOf(coluna) === -1),
          /* Coluna de tabela que nem existe não é um segundo problema: é o
             mesmo. Marcada assim, a lista mostra "falta a tabela notas" em vez
             de despejar quinze linhas de colunas que ninguém vai consertar
             uma a uma. */
          daTabelaQueFalta: tipo === 'coluna' && !a.existe
        };
      });

      const faltam = itens.filter(function (i) { return !i.existe && !i.daTabelaQueFalta; });
      const arquivos = [];
      faltam.forEach(function (i) {
        if (arquivos.indexOf(i.arquivo) === -1) arquivos.push(i.arquivo);
      });

      return conferirAssistente().then(function (ia) {
        return {
          itens: itens, faltam: faltam, arquivos: arquivos, assistente: ia,
          conferidas: nomes.length, trancadas: trancadas, indefinidas: indefinidas,
          /* "Tudo em dia" é só sobre o que trava o trabalho. E-mail e WhatsApp
             que a pessoa não usa não podem pintar a tela de vermelho. */
          carteiraEmDia: !faltam.some(function (i) { return i.grupo === 'carteira'; }),
          /* "Tudo em dia" não pode ser dito quando alguma coisa não deu para
             conferir: silêncio apresentado como aprovação é o defeito que esta
             tela inteira existe para não cometer. */
          tudoEmDia: !faltam.length && !indefinidas.length && ia.situacao === 'ok'
        };
      });
    });
  }

  global.IADConferencia = {
    ESPERADO: ESPERADO, GRUPOS: GRUPOS, TIPO_NOVO: TIPO_NOVO,
    conferir: conferir, conferirAssistente: conferirAssistente,
    sondar: sondar, porTabela: porTabela, colunaDoErro: colunaDoErro
  };
})(window);
