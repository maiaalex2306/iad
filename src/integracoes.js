/* Ponte com o Linked Helper.

   Um PWA não recebe webhook: webhook precisa de um endereço público que fique
   de pé o tempo todo, e este app roda dentro do navegador. Então o Linked Helper
   publica num coletor (ponte/worker.js, um Cloudflare Worker de 60 linhas) e o
   app busca de lá quando você manda buscar.

   Os nomes dos campos variam conforme a ação e as opções de exportação do
   Linked Helper, então a normalização aceita várias grafias em vez de exigir uma. */
(function (global) {
  'use strict';

  const CHAVE = 'iad-crm:ponte:v1';

  function config() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE)) || { url: '', token: '' };
    } catch (e) {
      return { url: '', token: '' };
    }
  }

  function salvarConfig(nova) {
    localStorage.setItem(CHAVE, JSON.stringify({ url: nova.url || '', token: nova.token || '' }));
  }

  function configurada() {
    const c = config();
    return !!c.url;
  }

  /* "Head line", "head_line" e "headline" são o mesmo campo: comparamos sem
     separadores para não depender da grafia que o Linked Helper usar. */
  function chave(nome) { return String(nome).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function primeiro(objeto, nomes) {
    for (let i = 0; i < nomes.length; i++) {
      const valor = objeto[chave(nomes[i])];
      if (valor != null && String(valor).trim() !== '') return String(valor).trim();
    }
    return '';
  }

  /* Aceita o objeto achatado (opção "flat objects", igual ao CSV) e o aninhado. */
  function normalizar(bruto) {
    const d = bruto && bruto.dados ? bruto.dados : (bruto || {});
    const plano = {};
    Object.keys(d).forEach(function (k) { plano[chave(k)] = d[k]; });

    const nome = primeiro(plano, ['full_name', 'fullname', 'name', 'profile_name']) ||
      [primeiro(plano, ['first_name', 'firstname', 'given_name']),
       primeiro(plano, ['last_name', 'lastname', 'family_name'])].filter(Boolean).join(' ');

    return {
      id: bruto && bruto.id ? bruto.id : primeiro(plano, ['id', 'member_id', 'profile_id', 'public_identifier']),
      recebidoEm: (bruto && bruto.recebidoEm) || '',
      nome: nome,
      cargo: primeiro(plano, ['position', 'title', 'headline', 'current_position', 'job_title']),
      empresa: primeiro(plano, ['company_name', 'company', 'organization', 'organization_name', 'current_company']),
      linkedin: primeiro(plano, ['profile_url', 'linkedin_url', 'url', 'profile_link', 'public_profile_url']),
      email: primeiro(plano, ['email', 'email_address', 'work_email']),
      telefone: primeiro(plano, ['phone', 'phone_number', 'mobile']),
      local: primeiro(plano, ['location', 'city', 'country', 'region']),
      resposta: primeiro(plano, ['reply', 'reply_text', 'last_reply', 'message', 'answer', 'reply_message', 'last_message']),
      campanha: primeiro(plano, ['campaign', 'campaign_name', 'list', 'list_name']),
      bruto: d
    };
  }

  function requisitar(metodo, corpo) {
    const c = config();
    if (!c.url) return Promise.reject(new Error('Configure o endereço da ponte em ⚙︎ Dados.'));
    const separador = c.url.indexOf('?') === -1 ? '?' : '&';
    const endereco = c.url + (c.token ? separador + 'token=' + encodeURIComponent(c.token) : '');

    return fetch(endereco, {
      method: metodo,
      headers: corpo ? { 'content-type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined
    }).then(function (resposta) {
      if (resposta.status === 401) throw new Error('A ponte recusou a chave de leitura.');
      if (!resposta.ok) throw new Error('A ponte respondeu ' + resposta.status + '.');
      return resposta.json();
    });
  }

  function buscar() {
    return requisitar('GET').then(function (corpo) {
      const lista = Array.isArray(corpo) ? corpo : (corpo.itens || corpo.items || corpo.data || []);
      return lista.map(normalizar).filter(function (i) { return i.nome || i.empresa || i.linkedin; });
    });
  }

  function marcarProcessados(ids) {
    if (!ids || !ids.length) return Promise.resolve();
    return requisitar('POST', { marcar: ids }).catch(function (e) {
      console.warn('Não foi possível marcar como processado na ponte:', e);
    });
  }

  global.IADIntegracoes = { config, salvarConfig, configurada, buscar, marcarProcessados, normalizar };
})(window);
