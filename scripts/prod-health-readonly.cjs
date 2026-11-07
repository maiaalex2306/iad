'use strict';
/**
 * IaD CRM production readiness — strictly read-only, no credentials or PII.
 * Verifies deployed origin asset coherence and the AI authentication boundary.
 * This is NOT an authenticated RLS, LLM or performance-P95 end-to-end test.
 */
const ORIGIN = 'https://www.iadcrm.com.br';
const AI_URL = 'https://drhonmdffhnwamwzynrs.supabase.co/functions/v1/assistente';
function versionConfig(source) {
  return source.match(/window\.IADVersao\s*=\s*\{[^}]*numero\s*:\s*['"]v(\d+\.\d+)['"]/s)?.[1] || null;
}
function versionSW(source) {
  return source.match(/const\s+CACHE\s*=\s*['"]iad-crm-v(\d+\.\d+)['"]/)?.[1] || null;
}
function assertCompatible({config,worker,index,intents,radar,authStatus}) {
  const version = versionConfig(config);
  const workerVersion = versionSW(worker);
  if (!version || !workerVersion || version !== workerVersion)
    throw Error('PWA_VERSION_MISMATCH');
  const [major,minor] = version.split('.').map(Number);
  if (major < 286 || (major === 286 && minor < 83))
    throw Error('PRODUCTION_VERSION_BELOW_RELEASE_FLOOR');
  if (!/IAD CRM/i.test(index) || !/<form\b/i.test(index))
    throw Error('PUBLIC_LOGIN_SHELL_INVALID');
  if (!intents.includes('detector local de intencoes comerciais'))
    throw Error('RI08_ASSET_INVALID');
  if (!radar.includes('buildCommercialOpportunityRadar'))
    throw Error('RI04_ASSET_INVALID');
  if (authStatus !== 401)
    throw Error('AI_AUTH_GATE_UNAVAILABLE_HTTP_' + authStatus);
  return {version:'v'+version,assets:'PASS',aiAuthGate:'PASS',authenticatedLLM:'NOT_TESTED'};
}
async function run({fetchImpl=fetch,origin=ORIGIN,aiUrl=AI_URL,requestId=String(Date.now())}={}) {
  const get=async(path)=>{
    const separator=path.includes('?')?'&':'?';
    const response=await fetchImpl(origin+path+separator+'healthcheck='+encodeURIComponent(requestId),{
      method:'GET',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)
    });
    if(response.status!==200)throw Error('ASSET_HTTP_'+response.status);
    return response.text();
  };
  const post=async()=>{
    const response=await fetchImpl(aiUrl,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({tipo:'diagnostico'}),signal:AbortSignal.timeout(20000)
    });
    // Do not read error bodies: they can contain internal diagnostics.
    return response.status;
  };
  const [config,worker,index,intents,radar,authStatus]=await Promise.all([
    get('/src/config.js'),get('/sw.js'),get('/index.html'),
    get('/src/ri/conversation-intent.mjs'),get('/src/ri/opportunity-radar.mjs'),
    post()
  ]);
  return assertCompatible({config,worker,index,intents,radar,authStatus});
}
if(require.main===module)run().then(v=>console.log('IAD_PRODUCTION_HEALTH_PASS '+JSON.stringify(v)))
  .catch(e=>{console.error('IAD_PRODUCTION_HEALTH_FAIL '+String(e?.message||e));process.exitCode=1;});
module.exports={versionConfig,versionSW,assertCompatible,run};
