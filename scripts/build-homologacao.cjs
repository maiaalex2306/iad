/*
  IaD CRM — Build isolado para HOMOLOGAÇÃO no Cloudflare Pages.
  Cloudflare build: node scripts/build-homologacao.cjs
  Output: dist
  Environment: IAD_STAGING_URL, IAD_STAGING_PUBLISHABLE_KEY

  FALHA FECHADA: nunca usa o Supabase de produção como fallback.
  O output inclui SOMENTE os arquivos estáticos usados pelo CRM.
*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname,'..');
const OUT = path.join(ROOT,'dist');
const liveProject = 'drhonmdffhnwamwzynrs';
const url = String(process.env.IAD_STAGING_URL || '').trim().replace(/\/+$/, '');
const publishable = String(process.env.IAD_STAGING_PUBLISHABLE_KEY || '').trim();
const branch = String(process.env.CF_PAGES_BRANCH || '').trim();

function fail(message) { console.error('HOMOLOGAÇÃO NÃO PUBLICADA: ' + message); process.exit(1); }
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
  fail('Configure IAD_STAGING_URL com https://<projeto-de-teste>.supabase.co');
}
if (url.includes(liveProject)) fail('Supabase de PRODUÇÃO detectado. Use um projeto separado.');
if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishable)) {
  fail('Configure IAD_STAGING_PUBLISHABLE_KEY com a chave pública do projeto de testes.');
}
if (branch && ['performance/iad-perf-01','performance/iad-perf-02','performance/iad-perf-03a','performance/iad-perf-03b','performance/iad-perf-03c'].indexOf(branch) === -1) {
  fail('Branch de publicação inesperada: ' + branch);
}
const versaoHomologacao = branch === 'performance/iad-perf-03c' ? 'v272-HOMOLOG' : (branch === 'performance/iad-perf-03b' ? 'v271-HOMOLOG' : (branch === 'performance/iad-perf-03a' ? 'v270-HOMOLOG' : (branch === 'performance/iad-perf-02' ? 'v269-HOMOLOG' : 'v268-HOMOLOG')));
const files = ['index.html','recuperar.html','manifest.webmanifest','sw.js'];
const folders = ['src','assets','icons'];
fs.rmSync(OUT,{recursive:true,force:true});
fs.mkdirSync(OUT,{recursive:true});
files.forEach(function (f) { fs.copyFileSync(path.join(ROOT,f),path.join(OUT,f)); });
folders.forEach(function (f) { fs.cpSync(path.join(ROOT,f),path.join(OUT,f),{recursive:true}); });

const config = `/* Gerado SOMENTE para homologação. Sem chave secreta. */
window.IADConfig = {
  supabase: { url: ${JSON.stringify(url)}, chave: ${JSON.stringify(publishable)} }
};
window.IADVersao = { numero: '${versaoHomologacao}', data: '2026-10-29' };
window.IADHomologacao = true;
`;
fs.writeFileSync(path.join(OUT,'src','config.js'),config,'utf8');

/* O CRM de produção permite configurar outro Supabase via localStorage.
   A edição de HOMOLOGAÇÃO não pode mudar de projeto, nem pelo menu nem
   por configuração salva anteriormente no navegador. Essa alteração
   afeta SOMENTE a cópia de saída dist/, nunca o código de produção. */
const nuvemPath = path.join(OUT,'src','nuvem.js');
let nuvem = fs.readFileSync(nuvemPath,'utf8');
const chaveConfig = '  function config() {\n    const base = padrao();';
const inicioConfig = '  function config() {\n    const base = padrao();\n    if (global.IADHomologacao) return base;';
const salvarConfig = '  function salvarConfig(nova) {';
const bloquearConfig = '  function salvarConfig(nova) {\n    if (global.IADHomologacao) throw new Error("Na homologação, a conexão Supabase é fixa e isolada.");';
if (nuvem.split(chaveConfig).length !== 2 || nuvem.split(salvarConfig).length !== 2) {
  fail('Marcadores de configuração do Supabase mudaram: revise o build antes de publicar.');
}
nuvem = nuvem.replace(chaveConfig,inicioConfig).replace(salvarConfig,bloquearConfig);
fs.writeFileSync(nuvemPath,nuvem,'utf8');
for (const f of ['index.html','recuperar.html']) {
  const p = path.join(OUT,f);
  let text = fs.readFileSync(p,'utf8');
  if (!text.includes('<body')) fail(f + ' não tem elemento body.');
  text = text.replace('<body>',`<body>
<div role="status" style="background:#8e260b;color:white;text-align:center;
font:600 13px system-ui;padding:7px;position:relative;z-index:9999;">
HOMOLOGAÇÃO ${versaoHomologacao} — use apenas contas e dados de teste
</div>`);
  text = text.replace('<head>','<head>\n<meta name="robots" content="noindex,nofollow">');
  fs.writeFileSync(p,text,'utf8');
}
/* GitHub Pages usa a subpasta /iadcrm-homolog/. Links absolutos
   para '/' sairiam dessa subpasta, quebrando recuperação e autenticação.
   Ajustes somente na cópia dist/, preservando produção. */
const indexPath = path.join(OUT,'index.html');
let indexText = fs.readFileSync(indexPath,'utf8');
const redirectSource = "location.replace('/recuperar.html' + location.search + location.hash)";
if (!indexText.includes(redirectSource)) fail('Redirecionamento inicial de recuperação mudou.');
indexText = indexText.replace(redirectSource,
  "location.replace('recuperar.html' + location.search + location.hash)");
fs.writeFileSync(indexPath,indexText,'utf8');

const recuperarPath = path.join(OUT,'recuperar.html');
let recuperarText = fs.readFileSync(recuperarPath,'utf8');
if (!recuperarText.includes('href="/">')) fail('Link de retorno da recuperação mudou.');
recuperarText = recuperarText.replace('href="/">','href="index.html">');
fs.writeFileSync(recuperarPath,recuperarText,'utf8');

const recuperarJsPath = path.join(OUT,'src','recuperacao.js');
let recuperarJs = fs.readFileSync(recuperarJsPath,'utf8');
const antigoDestino = "location.origin + '/'";
if (!recuperarJs.includes(antigoDestino)) fail('Destino de recuperação mudou.');
recuperarJs = recuperarJs.replace(antigoDestino,
  "new URL('./', location.href).href");
fs.writeFileSync(recuperarJsPath,recuperarJs,'utf8');

fs.writeFileSync(path.join(OUT,'robots.txt'),'User-agent: *\nDisallow: /\n');
const generated = fs.readFileSync(path.join(OUT,'src','config.js'),'utf8');
if (generated.includes(liveProject)) fail('Arquivo de saída vinculado ao Supabase de produção.');
console.log('OK: dist/ com IaD CRM ' + versaoHomologacao + ', banco separado e aviso visual.');
