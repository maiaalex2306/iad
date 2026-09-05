/* Importação por planilha: a diferença entre testar com dez oportunidades
   e testar com a carteira inteira. Sempre com conferência antes de gravar. */
(function (global) {
  'use strict';

  const Store = global.IADStore;

  /* Aceita vírgula ou ponto e vírgula, aspas e quebras dentro do campo. */
  function detectarSeparador(texto) {
    const primeira = texto.split(/\r?\n/)[0] || '';
    const virgulas = (primeira.match(/,/g) || []).length;
    const pontos = (primeira.match(/;/g) || []).length;
    return pontos > virgulas ? ';' : ',';
  }

  function parse(texto) {
    const sep = detectarSeparador(texto);
    const linhas = [];
    let campo = '';
    let linha = [];
    let aspas = false;

    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') aspas = false;
        else campo += c;
      } else if (c === '"') {
        aspas = true;
      } else if (c === sep) {
        linha.push(campo.trim()); campo = '';
      } else if (c === '\n') {
        linha.push(campo.trim()); campo = '';
        if (linha.some(function (v) { return v !== ''; })) linhas.push(linha);
        linha = [];
      } else if (c !== '\r') {
        campo += c;
      }
    }
    linha.push(campo.trim());
    if (linha.some(function (v) { return v !== ''; })) linhas.push(linha);

    if (!linhas.length) return { colunas: [], registros: [] };
    const colunas = linhas[0].map(function (c) { return c.toLowerCase(); });
    const registros = linhas.slice(1).map(function (l) {
      const obj = {};
      colunas.forEach(function (col, i) { obj[col] = l[i] || ''; });
      return obj;
    });
    return { colunas: colunas, registros: registros };
  }

  /* Cabeçalhos aceitos por entidade. O primeiro de cada lista é o preferido. */
  const MAPAS = {
    empresas: {
      nome: ['nome', 'empresa', 'razao social', 'conta', 'cliente'],
      segmento: ['segmento', 'setor', 'ramo'],
      porte: ['porte', 'tamanho', 'faturamento'],
      cidade: ['cidade', 'municipio'],
      uf: ['uf', 'estado'],
      site: ['site', 'website', 'url'],
      relacaoAtual: ['relacao', 'relacionamento', 'situacao', 'status']
    },
    contatos: {
      nome: ['nome', 'contato', 'pessoa'],
      empresa: ['empresa', 'conta', 'organizacao', 'cliente'],
      cargo: ['cargo', 'funcao', 'titulo'],
      papel: ['papel', 'papel na compra', 'funcao na compra'],
      email: ['email', 'e-mail'],
      telefone: ['telefone', 'celular', 'whatsapp', 'fone'],
      linkedin: ['linkedin', 'perfil']
    },
    oportunidades: {
      titulo: ['titulo', 'oportunidade', 'negocio', 'projeto', 'nome'],
      empresa: ['empresa', 'conta', 'cliente', 'organizacao'],
      valor: ['valor', 'ticket', 'receita', 'montante'],
      etapa: ['etapa', 'estagio', 'fase', 'stage'],
      fechamentoPrevisto: ['fechamento', 'fechamento previsto', 'previsao', 'data prevista'],
      tipo: ['tipo']
    }
  };

  function coluna(registro, alternativas) {
    for (let i = 0; i < alternativas.length; i++) {
      const chave = alternativas[i];
      if (registro[chave] != null && registro[chave] !== '') return registro[chave];
    }
    return '';
  }

  function numero(valor) {
    if (!valor) return 0;
    const limpo = String(valor).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    return Number(limpo) || 0;
  }

  function dataISO(valor) {
    if (!valor) return '';
    const br = String(valor).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return br[3] + '-' + br[2] + '-' + br[1];
    const iso = String(valor).match(/^\d{4}-\d{2}-\d{2}/);
    return iso ? iso[0] : '';
  }

  function acharConta(nome) {
    const alvo = String(nome || '').trim().toLowerCase();
    if (!alvo) return null;
    return Store.obter().contas.find(function (c) { return c.nome.trim().toLowerCase() === alvo; }) || null;
  }

  /* Prévia: o que entra, o que é duplicado e o que não dá para importar. */
  function analisar(tipo, registros) {
    const mapa = MAPAS[tipo];
    const novos = [];
    const duplicados = [];
    const invalidos = [];
    const estado = Store.obter();

    registros.forEach(function (r, indice) {
      const dados = {};
      Object.keys(mapa).forEach(function (campo) { dados[campo] = coluna(r, mapa[campo]); });
      const linha = indice + 2;

      if (tipo === 'empresas') {
        if (!dados.nome) return invalidos.push({ linha: linha, motivo: 'sem nome' });
        if (acharConta(dados.nome)) return duplicados.push({ linha: linha, nome: dados.nome });
        return novos.push(dados);
      }

      if (tipo === 'contatos') {
        if (!dados.nome) return invalidos.push({ linha: linha, motivo: 'sem nome' });
        const conta = acharConta(dados.empresa);
        if (!conta) return invalidos.push({ linha: linha, motivo: 'empresa "' + (dados.empresa || '—') + '" não cadastrada' });
        const existe = estado.contatos.some(function (c) {
          return c.contaId === conta.id && c.nome.trim().toLowerCase() === dados.nome.trim().toLowerCase();
        });
        if (existe) return duplicados.push({ linha: linha, nome: dados.nome });
        return novos.push(Object.assign({}, dados, { contaId: conta.id }));
      }

      if (!dados.titulo) return invalidos.push({ linha: linha, motivo: 'sem título' });
      const conta = acharConta(dados.empresa);
      if (!conta) return invalidos.push({ linha: linha, motivo: 'empresa "' + (dados.empresa || '—') + '" não cadastrada' });
      const existe = estado.oportunidades.some(function (o) {
        return o.contaId === conta.id && o.titulo.trim().toLowerCase() === dados.titulo.trim().toLowerCase();
      });
      if (existe) return duplicados.push({ linha: linha, nome: dados.titulo });
      novos.push(Object.assign({}, dados, { contaId: conta.id }));
    });

    return { novos: novos, duplicados: duplicados, invalidos: invalidos };
  }

  function importar(tipo, novos) {
    const P = global.IADPlaybook;
    novos.forEach(function (d) {
      if (tipo === 'empresas') {
        Store.criarConta({
          nome: d.nome, segmento: d.segmento, porte: d.porte,
          cidade: d.cidade, uf: d.uf, site: d.site,
          relacaoAtual: P.RELACOES_CONTA.indexOf(d.relacaoAtual) !== -1 ? d.relacaoAtual : 'Prospect'
        });
      } else if (tipo === 'contatos') {
        Store.criarContato({
          contaId: d.contaId, nome: d.nome, cargo: d.cargo,
          papel: P.PAPEIS.indexOf(d.papel) !== -1 ? d.papel : 'Usuário',
          email: d.email, telefone: d.telefone, linkedin: d.linkedin
        });
      } else {
        Store.criarOportunidade({
          contaId: d.contaId, titulo: d.titulo, valor: numero(d.valor),
          etapa: P.ETAPAS.indexOf(d.etapa) !== -1 ? d.etapa : 'Prospecção',
          fechamentoPrevisto: dataISO(d.fechamentoPrevisto),
          tipo: P.TIPOS_OPORTUNIDADE.indexOf(d.tipo) !== -1 ? d.tipo : 'Novo negócio'
        });
      }
    });
    return novos.length;
  }

  function modelo(tipo) {
    const cabecalhos = {
      empresas: 'nome;segmento;porte;cidade;uf;site;relacao',
      contatos: 'nome;empresa;cargo;papel;email;telefone;linkedin',
      oportunidades: 'titulo;empresa;valor;etapa;fechamento;tipo'
    };
    const exemplos = {
      empresas: 'ACME Agroindustrial;Agro;500-1000 funcionários;Uberlândia;MG;acme.com.br;Prospect',
      contatos: 'Carlos Menezes;ACME Agroindustrial;Gerente de Operações;Champion / Mobilizer;carlos@acme.com.br;34999990000;',
      oportunidades: 'Projeto X;ACME Agroindustrial;840000;Diagnóstico;31/12/2026;Novo negócio'
    };
    return cabecalhos[tipo] + '\n' + exemplos[tipo] + '\n';
  }

  global.IADCsv = { parse, analisar, importar, modelo, MAPAS };
})(window);
