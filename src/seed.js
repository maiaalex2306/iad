/* Carteira fictícia: os quatro grupos que aparecem quando se separa etapa de decisão. */
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

    function conta(nome, segmento) {
      const c = { id: uid('acc'), nome: nome, segmento: segmento, criadoEm: dias(120) };
      est.contas.push(c);
      return c;
    }
    function pessoa(c, nome, cargo, papel, sentimento) {
      const p = { id: uid('ctt'), contaId: c.id, nome: nome, cargo: cargo, papel: papel, sentimento: sentimento, influencia: 2, email: '', telefone: '', linkedin: '', criadoEm: dias(90) };
      est.contatos.push(p);
      return p;
    }
    function op(dados, dims, pessoas, eventos) {
      const o = Object.assign({
        id: uid('opp'), dono: 'Alexandre', criadoEm: dias(75), fechamentoPrevisto: '',
        stakeholders: pessoas.map(function (p) { return p.id; }),
        eventos: eventos.map(function (e) { return Object.assign({ id: uid('evt'), tipo: 'decision' }, e); }),
        snapshots: [], gateLiberadoPor: null, notas: ''
      }, dados, { dims: dims });
      o.snapshots.push({ data: dias(1), iad: Object.keys(dims).reduce(function (s, k) { return s + dims[k]; }, 0), dims: Object.assign({}, dims) });
      est.oportunidades.push(o);
      return o;
    }

    /* 1. Falso avançado: etapa adiantada, decisão imatura, sem decisor econômico. */
    const acme = conta('ACME Agroindustrial', 'Agro / Indústria');
    const acme1 = pessoa(acme, 'Carlos Menezes', 'Gerente de Operações', 'Champion / Mobilizer', 'favoravel');
    const acme2 = pessoa(acme, 'Rita Souza', 'Coordenadora de Qualidade', 'Técnico', 'neutro');
    pessoa(acme, 'Paulo Andrade', 'CFO', 'Decisor econômico', 'nao_acessado');
    op({ contaId: acme.id, titulo: 'Projeto X — redução de perdas', valor: 840000, etapa: 'Proposta' },
      { problema: 2, prioridade: 2, impacto: 1, criterios: 0, stakeholders: 1, consenso: 0, risco: 1, processo: 2 },
      [acme1, acme2],
      [
        { data: dias(13), dimensao: 'prioridade', canal: 'Reunião', titulo: 'Cliente informou que o projeto precisa iniciar em outubro' },
        { data: dias(28), dimensao: 'problema', canal: 'E-mail', titulo: 'Cliente enviou dados de perda dos últimos 6 meses' }
      ]);

    /* 2. Oculto promissor: etapa inicial, decisão madura. */
    const nordeste = conta('Grupo Nordeste Alimentos', 'Alimentos');
    const n1 = pessoa(nordeste, 'Fernanda Lima', 'Diretora Industrial', 'Champion / Mobilizer', 'favoravel');
    const n2 = pessoa(nordeste, 'Marcos Reis', 'Controller', 'Financeiro', 'neutro');
    const n3 = pessoa(nordeste, 'Júlia Pontes', 'CEO', 'Decisor econômico', 'favoravel');
    const n4 = pessoa(nordeste, 'André Tavares', 'Suprimentos', 'Compras', 'neutro');
    op({ contaId: nordeste.id, titulo: 'Reestruturação da linha 3', valor: 520000, etapa: 'Diagnóstico' },
      { problema: 2, prioridade: 2, impacto: 2, criterios: 2, stakeholders: 2, consenso: 1, risco: 1, processo: 1 },
      [n1, n2, n3, n4],
      [
        { data: dias(1), dimensao: 'impacto', canal: 'Reunião', titulo: 'Controller validou a estimativa de R$ 1,2M/ano em perdas' },
        { data: dias(6), dimensao: 'stakeholders', canal: 'E-mail', titulo: 'CEO entrou na conversa e pediu o business case' },
        { data: dias(12), dimensao: 'criterios', canal: 'WhatsApp', titulo: 'Cliente compartilhou os 4 critérios de avaliação' }
      ]);

    /* 3. Zumbi: parece ativo no CRM, morto na decisão. */
    const litoral = conta('Litoral Papel e Celulose', 'Papel e celulose');
    const l1 = pessoa(litoral, 'Sérgio Barros', 'Supervisor de Manutenção', 'Usuário', 'neutro');
    op({ contaId: litoral.id, titulo: 'Contrato anual de suprimento', valor: 310000, etapa: 'Validação' },
      { problema: 1, prioridade: 1, impacto: 0, criterios: 1, stakeholders: 0, consenso: 0, risco: 1, processo: 0 },
      [l1],
      [
        { data: dias(47), dimensao: 'problema', canal: 'Reunião', titulo: 'Cliente reconheceu o retrabalho na manutenção' },
        { data: dias(9), tipo: 'activity', canal: 'E-mail', titulo: 'Fazer follow-up' },
        { data: dias(21), tipo: 'activity', canal: 'E-mail', titulo: 'Enviar proposta' }
      ]);

    /* 4. Negócio real: decisão madura, movimento recente, consenso em construção. */
    const vale = conta('Vale Verde Cooperativa', 'Cooperativa agrícola');
    const v1 = pessoa(vale, 'Helena Duarte', 'Gerente Técnica', 'Champion / Mobilizer', 'favoravel');
    const v2 = pessoa(vale, 'Rogério Alves', 'Diretor Financeiro', 'Decisor econômico', 'favoravel');
    const v3 = pessoa(vale, 'Camila Nunes', 'Compras', 'Compras', 'neutro');
    const v4 = pessoa(vale, 'Eduardo Bastos', 'Jurídico', 'Jurídico / Compliance', 'neutro');
    const v5 = pessoa(vale, 'Tiago Moura', 'Financeiro', 'Financeiro', 'favoravel');
    op({ contaId: vale.id, titulo: 'Programa safra 26/27', valor: 1450000, etapa: 'Validação' },
      { problema: 2, prioridade: 2, impacto: 2, criterios: 2, stakeholders: 2, consenso: 2, risco: 1, processo: 2 },
      [v1, v2, v3, v4, v5],
      [
        { data: dias(2), dimensao: 'processo', canal: 'E-mail', titulo: 'Jurídico iniciou análise contratual' },
        { data: dias(5), dimensao: 'consenso', canal: 'Reunião', titulo: 'Cliente realizou reunião interna e alinhou diretoria e financeiro' },
        { data: dias(11), dimensao: 'risco', canal: 'Reunião', titulo: 'Cliente aprovou piloto em duas unidades' }
      ]);

    /* 5. Em construção: cedo, mas com movimento. */
    const serra = conta('Serra Log Transportes', 'Logística');
    const s1 = pessoa(serra, 'Bruno Castro', 'Gerente de Frota', 'Usuário', 'neutro');
    op({ contaId: serra.id, titulo: 'Piloto de eficiência da frota', valor: 180000, etapa: 'Conexão' },
      { problema: 2, prioridade: 1, impacto: 0, criterios: 0, stakeholders: 1, consenso: 0, risco: 0, processo: 0 },
      [s1],
      [{ data: dias(4), dimensao: 'problema', canal: 'LinkedIn', titulo: 'Cliente respondeu ao post e descreveu o custo de parada de frota' }]);

    Store.substituir(est);
  }

  global.IADSeed = { carregar: carregar };
})(window);
