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
if (branch && branch !== 'performance/iad-perf-01') {
  fail('Branch de publicação inesperada: ' + branch);
}
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
window.IADVersao = { numero: 'v268-HOMOLOG', data: '2026-10-29' };
`;
fs.writeFileSync(path.join(OUT,'src','config.js'),config,'utf8');
for (const f of ['index.html','recuperar.html']) {
  const p = path.join(OUT,f);
  let text = fs.readFileSync(p,'utf8');
  if (!text.includes('<body')) fail(f + ' não tem elemento body.');
  text = text.replace('<body>',`<body>
<div role="status" style="background:#8e260b;color:white;text-align:center;
font:600 13px system-ui;padding:7px;position:relative;z-index:9999;">
HOMOLOGAÇÃO v268 — use apenas contas e dados de teste
</div>`);
  text = text.replace('<head>','<head>\n<meta name="robots" content="noindex,nofollow">');
  fs.writeFileSync(p,text,'utf8');
}
fs.writeFileSync(path.join(OUT,'robots.txt'),'User-agent: *\nDisallow: /\n');
const generated = fs.readFileSync(path.join(OUT,'src','config.js'),'utf8');
if (generated.includes(liveProject)) fail('Arquivo de saída vinculado ao Supabase de produção.');
console.log('OK: dist/ com IaD CRM v268-HOMOLOG, banco separado e aviso visual.');
