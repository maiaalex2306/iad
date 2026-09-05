/* Carteira fictícia: os grupos que aparecem quando se separa etapa de decisão. */
(function (global) {
  'use strict';
  const Store = global.IADStore;

  function dias(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  function carregar() {
    const est = Store.estadoVazio();
    const uid = Store.uid;

    function conta(nome, dados) {
      const c = Object.assign({
        id: uid('acc'), nome: nome, segmento: '', porte: '', cidade: '', uf: '',
        site: '', relacaoAtual: 'Prospect', criadoEm: dias(120)
      }, dados);
      est.contas.push(c);
      return c;
    }

    function pessoa(c, nome, cargo, papel, sentimento, extras) {
      const p = Object.assign({
        id: uid('ctt'), contaId: c.id, nome: nome, cargo: cargo, papel: papel,
        sentimento: sentimento, influencia: 2, reportaA: null, email: '', telefone: '',
        linkedin: '', canalPreferido: '', criadoEm: dias(90)
      }, extras);
      est.contatos.push(p);
      return p;
    }

    function op(dados, dims, pessoas, eventos) {
      const o = Object.assign({
        id: uid('opp'), dono: 'Alexandre', criadoEm: dias(75), etapaDesde: dias(20),
        fechamentoPrevisto: '', tipo: 'Novo negócio', concorrentes: '', produto: '',
        adiamentos: 0, proximoCompromisso: null,
        stakeholders: pessoas.map(function (p) { return p.id; }),
        eventos: eventos.map(function (e) {
          return Object.assign({ id: uid('evt'), tipo: 'decision', forca: 'confirmado' }, e);
        }),
        snapshots: [], gateLiberadoPor: null, desfecho: null, notas: ''
      }, dados, { dims: dims });

      /* Alguns snapshots para a curva ter o que mostrar. */
      const total = Object.keys(dims).reduce(function (s, k) { return s + dims[k]; }, 0);
      o.snapshots.push({ data: dias(60), iad: Math.max(0, total - 5), dims: Object.assign({}, dims) });
      o.snapshots.push({ data: dias(30), iad: Math.max(0, total - 2), dims: Object.assign({}, dims), dimensaoAlterada: 'impacto', de: 0, para: 1 });
      o.snapshots.push({ data: dias(6), iad: total, dims: Object.assign({}, dims), dimensaoAlterada: 'prioridade', de: 1, para: 2 });
      est.oportunidades.push(o);
      return o;
    }

    function tarefa(o, titulo, decisao, vencimento, tipo) {
      est.tarefas.push({
        id: uid('tsk'), titulo: titulo, tipo: tipo || 'Ligar', oportunidadeId: o.id,
        contatoId: null, decisaoAlvo: decisao, vencimento: vencimento,
        status: 'aberta', concluidaEm: null, criadoEm: dias(10)
      });
    }

    /* 1. Falso avançado: etapa adiantada, decisão imatura, sem decisor econômico. */
    const acme = conta('ACME Agroindustrial', { segmento: 'Agro / Indústria', porte: '500 a 1000 funcionários', cidade: 'Uberlândia', uf: 'MG' });
    const acme1 = pessoa(acme, 'Carlos Menezes', 'Gerente de Operações', 'Champion / Mobilizer', 'favoravel', { influencia: 2, perfil: 'amigo' });
    const acme2 = pessoa(acme, 'Rita Souza', 'Coordenadora de Qualidade', 'Técnico', 'neutro', { influencia: 1, reportaA: acme1.id, perfil: 'guia' });
    pessoa(acme, 'Paulo Andrade', 'CFO', 'Decisor econômico', 'nao_acessado', { influencia: 3 });
    const opAcme = op({ contaId: acme.id, titulo: 'Projeto X — redução de perdas', valor: 840000, etapa: 'Proposta', etapaDesde: dias(34), adiamentos: 2, fechamentoPrevisto: dias(-20) },
      { problema: 2, prioridade: 2, impacto: 1, criterios: 0, stakeholders: 1, consenso: 0, risco: 1, processo: 2 },
      [acme1, acme2],
      [
        { data: dias(13), dimensao: 'prioridade', canal: 'Reunião', forca: 'confirmado', contatoId: acme1.id, titulo: 'Cliente informou que o projeto precisa iniciar em outubro' },
        { data: dias(28), dimensao: 'problema', canal: 'E-mail', forca: 'documentado', contatoId: acme1.id, titulo: 'Cliente enviou dados de perda dos últimos 6 meses' }
      ]);
    opAcme.insight = { texto: 'A perda não está na colheita: está no intervalo entre lotes, e ela cresce com o volume.', estado: 'apresentado', atualizadoEm: dias(20) };
    opAcme.proximoCompromisso = { texto: 'Cliente levaria a proposta ao CFO', data: dias(9), dono: 'cliente', registradoEm: dias(20) };
    tarefa(opAcme, 'Pedir a Carlos a agenda com o CFO', 'stakeholders', dias(3), 'Cobrar retorno');

    /* 2. Oculto promissor: etapa inicial, decisão madura. */
    const nordeste = conta('Grupo Nordeste Alimentos', { segmento: 'Alimentos', porte: 'Acima de 1000 funcionários', cidade: 'Recife', uf: 'PE', relacaoAtual: 'Cliente ativo' });
    const n1 = pessoa(nordeste, 'Fernanda Lima', 'Diretora Industrial', 'Champion / Mobilizer', 'favoravel', { influencia: 3, perfil: 'go_getter' });
    const n2 = pessoa(nordeste, 'Marcos Reis', 'Controller', 'Financeiro', 'neutro', { influencia: 2, perfil: 'cetico' });
    const n3 = pessoa(nordeste, 'Júlia Pontes', 'CEO', 'Decisor econômico', 'favoravel', { influencia: 3 });
    const n4 = pessoa(nordeste, 'André Tavares', 'Suprimentos', 'Compras', 'neutro', { influencia: 2, reportaA: n2.id });
    const opNordeste = op({ contaId: nordeste.id, titulo: 'Reestruturação da linha 3', valor: 520000, etapa: 'Diagnóstico', etapaDesde: dias(12), fechamentoPrevisto: dias(-70), tipo: 'Expansão' },
      { problema: 2, prioridade: 2, impacto: 2, criterios: 2, stakeholders: 2, consenso: 1, risco: 1, processo: 1 },
      [n1, n2, n3, n4],
      [
        { data: dias(1), dimensao: 'impacto', canal: 'Reunião', forca: 'confirmado', contatoId: n2.id, titulo: 'Controller validou a estimativa de R$ 1,2M/ano em perdas' },
        { data: dias(6), dimensao: 'stakeholders', canal: 'E-mail', forca: 'documentado', contatoId: n3.id, titulo: 'CEO entrou na conversa e pediu o business case' },
        { data: dias(12), dimensao: 'criterios', canal: 'WhatsApp', forca: 'confirmado', contatoId: n1.id, titulo: 'Cliente compartilhou os 4 critérios de avaliação' }
      ]);
    opNordeste.insight = { texto: 'O gargalo não é a linha 3: é a troca de formato, que consome duas horas por turno.', estado: 'aceito', atualizadoEm: dias(25) };
    opNordeste.proximoCompromisso = { texto: 'Apresentar business case à diretoria', data: dias(-5), dono: 'nos', registradoEm: dias(6) };

    /* 3. Zumbi: parece ativo no CRM, morto na decisão. */
    const litoral = conta('Litoral Papel e Celulose', { segmento: 'Papel e celulose', cidade: 'Joinville', uf: 'SC' });
    const l1 = pessoa(litoral, 'Sérgio Barros', 'Supervisor de Manutenção', 'Usuário', 'neutro', { influencia: 1, perfil: 'amigo' });
    op({ contaId: litoral.id, titulo: 'Contrato anual de suprimento', valor: 310000, etapa: 'Validação', etapaDesde: dias(52), adiamentos: 3, fechamentoPrevisto: dias(-15) },
      { problema: 1, prioridade: 1, impacto: 0, criterios: 1, stakeholders: 0, consenso: 0, risco: 1, processo: 0 },
      [l1],
      [
        { data: dias(47), dimensao: 'problema', canal: 'Reunião', forca: 'relato', contatoId: l1.id, titulo: 'Cliente reconheceu o retrabalho na manutenção' },
        { data: dias(9), tipo: 'activity', canal: 'E-mail', titulo: 'Fazer follow-up' },
        { data: dias(21), tipo: 'activity', canal: 'E-mail', titulo: 'Enviar proposta' }
      ]);

    /* 4. Negócio real: decisão madura, movimento recente, consenso em construção. */
    const vale = conta('Vale Verde Cooperativa', { segmento: 'Cooperativa agrícola', porte: 'Acima de 1000 funcionários', cidade: 'Cascavel', uf: 'PR', relacaoAtual: 'Cliente ativo' });
    const v1 = pessoa(vale, 'Helena Duarte', 'Gerente Técnica', 'Champion / Mobilizer', 'favoravel', { influencia: 2, perfil: 'professor' });
    const v2 = pessoa(vale, 'Rogério Alves', 'Diretor Financeiro', 'Decisor econômico', 'favoravel', { influencia: 3 });
    const v3 = pessoa(vale, 'Camila Nunes', 'Compras', 'Compras', 'neutro', { influencia: 2, reportaA: v2.id });
    const v4 = pessoa(vale, 'Eduardo Bastos', 'Jurídico', 'Jurídico / Compliance', 'neutro', { influencia: 1, perfil: 'bloqueador' });
    const v5 = pessoa(vale, 'Tiago Moura', 'Financeiro', 'Financeiro', 'favoravel', { influencia: 2, reportaA: v2.id });
    const opVale = op({ contaId: vale.id, titulo: 'Programa safra 26/27', valor: 1450000, etapa: 'Validação', etapaDesde: dias(9), fechamentoPrevisto: dias(-40), tipo: 'Renovação' },
      { problema: 2, prioridade: 2, impacto: 2, criterios: 2, stakeholders: 2, consenso: 2, risco: 1, processo: 2 },
      [v1, v2, v3, v4, v5],
      [
        { data: dias(2), dimensao: 'processo', canal: 'E-mail', forca: 'documentado', contatoId: v4.id, titulo: 'Jurídico iniciou análise contratual' },
        { data: dias(5), dimensao: 'consenso', canal: 'Reunião', forca: 'confirmado', contatoId: v2.id, titulo: 'Cliente realizou reunião interna e alinhou diretoria e financeiro' },
        { data: dias(11), dimensao: 'risco', canal: 'Reunião', forca: 'confirmado', contatoId: v1.id, titulo: 'Cliente aprovou piloto em duas unidades' }
      ]);
    opVale.insight = { texto: 'O custo do programa safra não é o preço do insumo: é a janela de aplicação perdida por atraso logístico.', estado: 'aceito', atualizadoEm: dias(30) };
    opVale.proximoCompromisso = { texto: 'Jurídico devolve o contrato revisado', data: dias(-4), dono: 'cliente', registradoEm: dias(2) };
    tarefa(opVale, 'Preparar referência técnica para reduzir o risco percebido', 'risco', dias(-2), 'Enviar material');

    /* 5. Em construção: cedo, mas com movimento. */
    const serra = conta('Serra Log Transportes', { segmento: 'Logística', cidade: 'Caxias do Sul', uf: 'RS' });
    const s1 = pessoa(serra, 'Bruno Castro', 'Gerente de Frota', 'Usuário', 'neutro', { influencia: 2 });
    op({ contaId: serra.id, titulo: 'Piloto de eficiência da frota', valor: 180000, etapa: 'Conexão', etapaDesde: dias(5), fechamentoPrevisto: dias(-90) },
      { problema: 2, prioridade: 1, impacto: 0, criterios: 0, stakeholders: 1, consenso: 0, risco: 0, processo: 0 },
      [s1],
      [{ data: dias(4), dimensao: 'problema', canal: 'LinkedIn', forca: 'relato', contatoId: s1.id, titulo: 'Cliente respondeu ao post e descreveu o custo de parada de frota' }]);

    /* Encerrados: sem eles o app não aprende nada. */
    function fechar(o, tipo, diasAtras, motivo, extras) {
      const iad = Object.keys(o.dims).reduce(function (s, k) { return s + o.dims[k]; }, 0);
      o.desfecho = Object.assign({
        tipo: tipo, data: dias(diasAtras), motivo: motivo, concorrente: '',
        valorFinal: o.valor, iadFinal: iad, dimsFinal: Object.assign({}, o.dims),
        coverageFinal: 0, evidenceAgeFinal: 0, diasEmAberto: 90
      }, extras || {});
      o.proximoCompromisso = null;
      return o;
    }

    const campo = conta('Campo Alto Sementes', { segmento: 'Sementes', cidade: 'Rio Verde', uf: 'GO', relacaoAtual: 'Cliente ativo' });
    const c1 = pessoa(campo, 'Renata Vilela', 'Diretora de Operações', 'Champion / Mobilizer', 'favoravel', { influencia: 3 });
    const c2 = pessoa(campo, 'Otávio Prado', 'CFO', 'Decisor econômico', 'favoravel', { influencia: 3 });
    const c3 = pessoa(campo, 'Lia Ferraz', 'Compras', 'Compras', 'neutro', { influencia: 2 });
    fechar(op({ contaId: campo.id, titulo: 'Modernização do beneficiamento', valor: 690000, etapa: 'Venda', criadoEm: dias(140) },
      { problema: 2, prioridade: 2, impacto: 2, criterios: 2, stakeholders: 2, consenso: 2, risco: 2, processo: 2 },
      [c1, c2, c3],
      [{ data: dias(66), dimensao: 'processo', canal: 'E-mail', forca: 'documentado', contatoId: c2.id, titulo: 'Cliente enviou o contrato assinado' }]),
      'ganho', 64, 'Business case validado pelo CFO antes da proposta.', { coverageFinal: 75, diasEmAberto: 74 });

    const metal = conta('MetalSul Componentes', { segmento: 'Metalurgia', cidade: 'Sorocaba', uf: 'SP' });
    const m1 = pessoa(metal, 'Jonas Ribeiro', 'Gerente de Produção', 'Usuário', 'favoravel', { influencia: 1 });
    fechar(op({ contaId: metal.id, titulo: 'Substituição da linha de corte', valor: 400000, etapa: 'Proposta', criadoEm: dias(160) },
      { problema: 2, prioridade: 1, impacto: 0, criterios: 1, stakeholders: 0, consenso: 0, risco: 1, processo: 0 },
      [m1],
      [{ data: dias(120), dimensao: 'problema', canal: 'Reunião', forca: 'relato', contatoId: m1.id, titulo: 'Cliente reconheceu o gargalo no corte' }]),
      'perdido_inacao', 58, 'Nunca chegou ao financeiro. O projeto simplesmente parou de ser mencionado.', { coverageFinal: 0, diasEmAberto: 102 });

    const agro = conta('Agroluz Insumos', { segmento: 'Distribuição agrícola', cidade: 'Londrina', uf: 'PR' });
    const a1 = pessoa(agro, 'Patrícia Gomes', 'Coordenadora Técnica', 'Técnico', 'favoravel', { influencia: 2 });
    const a2 = pessoa(agro, 'Wagner Lopes', 'Financeiro', 'Financeiro', 'neutro', { influencia: 2 });
    fechar(op({ contaId: agro.id, titulo: 'Contrato de assistência técnica', valor: 250000, etapa: 'Validação', criadoEm: dias(150) },
      { problema: 2, prioridade: 2, impacto: 1, criterios: 1, stakeholders: 1, consenso: 1, risco: 0, processo: 1 },
      [a1, a2],
      [{ data: dias(95), dimensao: 'criterios', canal: 'E-mail', forca: 'confirmado', contatoId: a1.id, titulo: 'Cliente compartilhou o comparativo entre fornecedores' }]),
      'perdido_concorrente', 88, 'Perdemos em risco percebido: o concorrente ofereceu piloto e nós não.', { concorrente: 'Fornecedor incumbente', coverageFinal: 25, diasEmAberto: 62 });

    Store.substituir(est);
  }

  global.IADSeed = { carregar: carregar };
})(window);
