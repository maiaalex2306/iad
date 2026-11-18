/* IaD CRM — catálogo geográfico oficial do IBGE para o Pipeline.
   UFs locais; municípios carregados por UF no endpoint oficial, com cache.
   Não altera nem cria dados de conta; só fornece opções de filtro. */
(function (global) {
  'use strict';

  const UFS = [
    ['AC','Acre'],['AL','Alagoas'],['AP','Amapá'],['AM','Amazonas'],
    ['BA','Bahia'],['CE','Ceará'],['DF','Distrito Federal'],['ES','Espírito Santo'],
    ['GO','Goiás'],['MA','Maranhão'],['MT','Mato Grosso'],['MS','Mato Grosso do Sul'],
    ['MG','Minas Gerais'],['PA','Pará'],['PB','Paraíba'],['PR','Paraná'],
    ['PE','Pernambuco'],['PI','Piauí'],['RJ','Rio de Janeiro'],
    ['RN','Rio Grande do Norte'],['RS','Rio Grande do Sul'],['RO','Rondônia'],
    ['RR','Roraima'],['SC','Santa Catarina'],['SP','São Paulo'],
    ['SE','Sergipe'],['TO','Tocantins']
  ].map(function (u) { return { sigla: u[0], nome: u[1] }; })
    .sort(function (a,b) { return a.nome.localeCompare(b.nome,'pt-BR'); });

  const PREFIXO = 'iad-crm:ibge:municipios:v1:';
  const VALIDADE = 30 * 24 * 60 * 60 * 1000; /* 30 dias */
  const memoria = Object.create(null);
  const pedidos = Object.create(null);
  const API = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados/';

  function normalizar(valor) {
    return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
  }
  function sigla(uf) {
    const v = normalizar(uf).toUpperCase();
    const item = UFS.find(function (u) {
      return u.sigla === v || normalizar(u.nome).toUpperCase() === v;
    });
    return item ? item.sigla : '';
  }
  function nomeUF(uf) {
    const s = sigla(uf);
    const item = UFS.find(function (u) { return u.sigla === s; });
    return item ? item.nome + ' (' + item.sigla + ')' : '';
  }
  function ordenar(a,b) { return a.localeCompare(b,'pt-BR'); }

  function buscar(lista, termo, maximo) {
    const q = normalizar(termo);
    const all = lista.filter(function (item) { return !q || normalizar(item).includes(q); });
    all.sort(function (a,b) {
      const ap = normalizar(a).startsWith(q) ? 0 : 1;
      const bp = normalizar(b).startsWith(q) ? 0 : 1;
      return ap - bp || ordenar(a,b);
    });
    return all.slice(0, maximo || 14);
  }
  function estados() { return UFS.slice(); }
  function buscaEstados(texto) {
    const q = normalizar(texto);
    const items = UFS.filter(function (u) {
      return !q || normalizar(u.sigla).startsWith(q) || normalizar(u.nome).includes(q);
    });
    items.sort(function (a,b) {
      const ap = normalizar(a.nome).startsWith(q) || normalizar(a.sigla).startsWith(q) ? 0 : 1;
      const bp = normalizar(b.nome).startsWith(q) || normalizar(b.sigla).startsWith(q) ? 0 : 1;
      return ap - bp || ordenar(a.nome,b.nome);
    });
    return items.slice(0,14);
  }

  function doCache(uf) {
    try {
      const o = JSON.parse(localStorage.getItem(PREFIXO + uf) || 'null');
      if (o && Array.isArray(o.lista) && Date.now() - o.data < VALIDADE) return o.lista;
    } catch (e) { /* Navegador com armazenamento restrito */ }
    return null;
  }
  function salvar(uf, lista) {
    try {
      localStorage.setItem(PREFIXO + uf, JSON.stringify({ data: Date.now(), lista: lista }));
    } catch (e) { /* Cache é opcional, dados continuam em memória */ }
  }

  function lista(uf) {
    const codigo = sigla(uf);
    if (!codigo) return [];
    return memoria[codigo] || doCache(codigo) || [];
  }

  function municipios(uf) {
    const codigo = sigla(uf);
    if (!codigo) return Promise.resolve([]);
    const existentes = lista(codigo);
    if (existentes.length) {
      memoria[codigo] = existentes;
      return Promise.resolve(existentes.slice());
    }
    if (pedidos[codigo]) return pedidos[codigo];

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const limite = controller && setTimeout(function () { controller.abort(); }, 12000);
    const options = controller ? {signal:controller.signal} : {};
    pedidos[codigo] = fetch(API + encodeURIComponent(codigo) + '/municipios?orderBy=nome',options)
      .then(function (r) {
        if (!r.ok) throw new Error('IBGE respondeu HTTP ' + r.status);
        return r.json();
      }).then(function (itens) {
        if (!Array.isArray(itens) || !itens.length) throw new Error('UF sem municípios retornados');
        const nomes = [];
        const vistos = new Set();
        itens.forEach(function (m) {
          const n = String(m.nome || '').trim();
          const k = normalizar(n);
          if (n && !vistos.has(k)) { vistos.add(k); nomes.push(n); }
        });
        nomes.sort(ordenar);
        memoria[codigo] = nomes;
        salvar(codigo,nomes);
        return nomes.slice();
      }).finally(function () {
        if (limite) clearTimeout(limite);
        delete pedidos[codigo];
      });
    return pedidos[codigo];
  }

  /* Cidades cadastradas são usadas quando o IBGE estiver indisponível.
     Sempre restritas à UF escolhida e já visível na carteira do usuário. */
  function fallback(uf, contas) {
    const codigo = sigla(uf);
    const vistos = new Set();
    return (contas || []).filter(function (c) { return sigla(c.uf) === codigo; })
      .map(function (c) { return String(c.cidade || '').trim(); })
      .filter(function (n) {
        const k = normalizar(n);
        if (!k || vistos.has(k)) return false;
        vistos.add(k);
        return true;
      }).sort(ordenar);
  }
  global.IADLocalidades = {
    estados:estados, buscarEstados:buscaEstados, sigla:sigla, nomeUF:nomeUF,
    normalizar:normalizar, buscar:buscar, municipios:municipios, lista:lista,
    fallback:fallback
  };
})(window);
