import {pathToFileURL} from 'node:url';

/** CNPJ alfanumérico brasileiro; mesma regra do motor e da RPC de importação. */
function validCnpj(value) {
 const v=String(value||'').toUpperCase();
 if(!/^[0-9A-Z]{12}[0-9]{2}$/.test(v))return false;
 if(v.slice(0,12)===v[0].repeat(12))return false;
 const digit=(part,weights)=>{
  const mod=[...part].reduce((sum,ch,i)=>sum+(ch.charCodeAt(0)-48)*weights[i],0)%11;
  return mod<2?'0':String(11-mod);
 };
 return v[12]===digit(v.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2])
  &&v[13]===digit(v.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2]);
}

/**
 * Authenticated RI-M01 staging smoke. The configured staging Edge Function
 * performs the paid searches; no provider secret is ever handled here.
 * Inputs are injected for deterministic contract tests.
 */
export async function runMarketResearchE2E({
  fetchImpl = fetch,
  env = process.env,
  log = console.log,
} = {}) {
  const email = env.RI_M01_STAGING_EMAIL;
  const password = env.RI_M01_STAGING_PASSWORD;
  const anonKey = env.RI_M01_STAGING_ANON_KEY;
  if (![email, password, anonKey].every(x => typeof x === 'string' && x.trim())) {
    throw Error('Staging credentials are required; no HTTP calls were made.');
  }
  const host = 'https://bvlfzeblpewlqhssprpv.supabase.co';
  const origin = 'https://www.iadcrm.com.br';
  const abort = AbortSignal.timeout(95000);
  const auth = await fetchImpl(host + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {'apikey': anonKey, 'Content-Type': 'application/json'},
    body: JSON.stringify({email, password}),
    signal: abort,
  });
  if (!auth.ok) throw Error('Staging authentication failed (HTTP ' + auth.status + ')');
  const session = await auth.json();
  const token = session?.access_token;
  if (typeof token !== 'string' || !token) throw Error('Staging auth response has no access token');
  const start = performance.now();
  const res = await fetchImpl(host + '/functions/v1/market-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': origin,
      'Authorization': 'Bearer ' + token,
      'apikey': anonKey,
    },
    body: JSON.stringify({
      action: 'search',
      filters: {uf: 'SP', cidade: 'Jacarei', segmento: 'Quimico', limit: 5},
    }),
    signal: abort,
  });
  const elapsedMs = Math.round(performance.now() - start);
  if (!res.ok) throw Error('Staging market-search failed (HTTP ' + res.status + ')');
  const payload = await res.json();
  const providers = payload?.providers;
  if (!Array.isArray(providers) || !providers.includes('OpenAI') ||
      !providers.includes('Anthropic') || payload.partial !== false ||
      (Array.isArray(payload.failedProviders) && payload.failedProviders.length)) {
    throw Error('Both providers must complete a real web search before certification');
  }
  if (payload.coverageStatus !== 'unknown' || payload.coverage !== 'exploratoria' ||
      payload.total !== null || payload.hasMore !== null) {
    throw Error('Coverage cannot be certified as complete in exploratory search');
  }
  if (!Array.isArray(payload.data)) throw Error('Invalid company list from staging');
  let companiesWithSources = 0;
  const known = new Set();
  for (const company of payload.data) {
    if (!validCnpj(company?.cnpj)) {
      throw Error('Company missing a legally valid CNPJ');
    }
    if (known.has(company.cnpj)) throw Error('Duplicate CNPJ returned');
    known.add(company.cnpj);
    if (!Array.isArray(company.fontes) || !company.fontes.length ||
        !company.fontes.every(f => {
          try {const url = new URL(f.url); return url.protocol === 'https:' && !!url.hostname;} catch {return false;}
        })) throw Error('Company without HTTPS-cited sources');
    companiesWithSources++;
  }
  if (companiesWithSources < 1) throw Error('No source-cited companies found for pilot research');
  const usage = Array.isArray(payload.usage) ? payload.usage : [];
  const metrics = {
    providers: ['OpenAI', 'Anthropic'],
    companiesWithSources,
    coverageStatus: 'unknown',
    elapsedMs,
    usage: usage.filter(x => providers.includes(x.provider)).map(x => ({
      provider: x.provider,
      inputTokens: Number.isSafeInteger(x.inputTokens) ? x.inputTokens : null,
      outputTokens: Number.isSafeInteger(x.outputTokens) ? x.outputTokens : null,
      webSearchRequests: Number.isSafeInteger(x.webSearchRequests) ? x.webSearchRequests : null,
    })),
  };
  log(JSON.stringify(metrics));
  return metrics;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMarketResearchE2E().catch(e => {
    console.error('RI-M01 E2E gate failed:', String(e?.message || 'unknown error'));
    process.exitCode = 1;
  });
}
