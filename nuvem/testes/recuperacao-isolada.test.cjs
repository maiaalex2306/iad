/* Testes do fluxo REAL da página de senha isolada, sem credenciais reais. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'src/recuperacao.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function elementos() {
  const data = new Map();
  for (const id of ['status','form-nova','form-solicitar','nova','confirmacao','gravar','enviar','email']) {
    data.set(id, {id, hidden: true, textContent: '', className: '', value:'', disabled:false,
      handlers:{}, addEventListener(event,fn) { this.handlers[event] = fn; },
      focus() { this.focused = true; }});
  }
  return data;
}

function montar({ hash='', search='', responder } = {}) {
  const dom = elementos();
  const chamadas = [];
  const endereco = { hash, search, pathname:'/recuperar.html',
    origin:'https://www.iadcrm.com.br' };
  const history = { cleaned:false, replaceState(a,b,d){this.cleaned=true;this.path=d;} };
  const fetch = async (url, opts) => {
    chamadas.push({url,opts});
    const result = responder ? await responder(url, opts) : {};
    const status = result?.status || 200;
    return {ok: status >= 200 && status < 300, status,
      text: async ()=>JSON.stringify(result?.body ?? result ?? {})};
  };
  vm.runInNewContext(script, {
    window: {IADConfig:{supabase:{url:'https://example.supabase.co',chave:'sb_publishable_TEST'}}},
    location:endereco, history, URLSearchParams, fetch,
    document:{getElementById:id=>dom.get(id),querySelectorAll:()=>[]}
  });
  return {
    dom, chamadas, history,
    async settle() { await new Promise(resolve=>setImmediate(resolve)); },
    async submit(id) {
      const e={preventDefault(){}};
      await dom.get(id).handlers.submit(e);
    }
  };
}

test('callback de recuperação no index redireciona ANTES do app CRM', ()=>{
  const code = index.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(code,'script bootstrap em index');
  const destinos=[];
  const location={hash:'#access_token=token_teste&type=recovery',search:'',
    replace: s=>destinos.push(s)};
  vm.runInNewContext(code,{location,URLSearchParams});
  assert.deepEqual(destinos,['/recuperar.html#access_token=token_teste&type=recovery']);
  destinos.length=0;
  location.hash='#/pipeline';
  vm.runInNewContext(code,{location,URLSearchParams});
  assert.equal(destinos.length,0);
});

test('primeiro acesso à pagina permite solicitar outro link',async ()=>{
  const page=montar();
  await page.settle();
  assert.equal(page.dom.get('form-solicitar').hidden,false);
  page.dom.get('email').value='TESTE@EMPRESA.COM.BR';
  await page.submit('form-solicitar');
  const pedido=page.chamadas.find(x=>x.url.includes('/auth/v1/recover'));
  assert.ok(pedido);
  assert.ok(pedido.url.includes(encodeURIComponent('https://www.iadcrm.com.br/')));
  assert.equal(JSON.parse(pedido.opts.body).email,'teste@empresa.com.br');
  assert.match(page.dom.get('status').textContent,/Se a conta estiver cadastrada/i);
});

test('recovery valido apresenta NOVA senha, compara duas entradas e grava via Auth', async ()=>{
  const page=montar({hash:'#access_token=token_test&type=recovery',
    responder:async (url,opts)=>{
      if(url.endsWith('/auth/v1/user')&&opts.method==='GET')return {body:{id:'user-test'}};
      if(url.endsWith('/auth/v1/user')&&opts.method==='PUT')return {body:{id:'user-test'}};
      return {status:500,body:{message:'unexpected'}};
    }});
  await page.settle();
  assert.equal(page.dom.get('form-nova').hidden,false);
  assert.equal(page.history.cleaned,true);
  page.dom.get('nova').value='Nova-senha-testes-124';
  page.dom.get('confirmacao').value='DIFERENTE';
  await page.submit('form-nova');
  assert.equal(page.chamadas.filter(x=>x.opts.method==='PUT').length,0);
  assert.match(page.dom.get('status').textContent,/não estão iguais/);
  page.dom.get('confirmacao').value='Nova-senha-testes-124';
  await page.submit('form-nova');
  const puts=page.chamadas.filter(x=>x.opts.method==='PUT');
  assert.equal(puts.length,1);
  assert.equal(puts[0].opts.headers.Authorization,'Bearer token_test');
  assert.equal(JSON.parse(puts[0].opts.body).password,'Nova-senha-testes-124');
  assert.match(page.dom.get('status').textContent,/atualizada com sucesso/);
  assert.equal(page.dom.get('form-nova').hidden,true);
});

test('token_hash é verificado via Supabase antes da alteração de senha',async ()=>{
  const page=montar({search:'?token_hash=hash_de_teste&type=recovery',
    responder:async (url,opts)=>{
      if(url.endsWith('/auth/v1/verify'))return {body:{access_token:'token_verificado'}};
      if(url.endsWith('/auth/v1/user'))return {body:{id:'id-confirmado'}};
      return {status:400,body:{message:'unknown'}};
    }});
  await page.settle();
  assert.equal(page.chamadas[0].url,'https://example.supabase.co/auth/v1/verify');
  assert.equal(JSON.parse(page.chamadas[0].opts.body).type,'recovery');
  assert.equal(page.chamadas[1].opts.headers.Authorization,'Bearer token_verificado');
  assert.equal(page.dom.get('form-nova').hidden,false);
});

test('link expirado não tenta gravar e mostra solicitação de outro link',async ()=>{
  const page=montar({hash:'#error=access_denied&error_code=otp_expired'});
  await page.settle();
  assert.equal(page.dom.get('form-nova').hidden,true);
  assert.equal(page.dom.get('form-solicitar').hidden,false);
  assert.equal(page.chamadas.length,0);
  assert.match(page.dom.get('status').textContent,/expirou/i);
});

test('Auth rejeita token: não permite criar senha até novo link', async ()=>{
  const page=montar({hash:'#access_token=invalido&type=recovery',
    responder:async()=>({status:401,body:{message:'JWT expired'}})});
  await page.settle();
  assert.equal(page.dom.get('form-solicitar').hidden,false);
  assert.equal(page.dom.get('form-nova').hidden,true);
  assert.equal(page.chamadas.length,1);
});


test('convite administrativo passa pelo fluxo isolado de duas senhas',async ()=>{
  const code = index.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  const paths = [];
  vm.runInNewContext(code,{
    location:{hash:'#access_token=convite_teste&type=invite',search:'',replace:x=>paths.push(x)},
    URLSearchParams
  });
  assert.equal(paths[0],'/recuperar.html#access_token=convite_teste&type=invite');

  const page=montar({hash:'#access_token=convite_teste&type=invite',
    responder:async(url,opts)=>{
      if(url.endsWith('/auth/v1/user') && opts.method==='GET')return {body:{id:'id_convite'}};
      if(url.endsWith('/auth/v1/user') && opts.method==='PUT')return {body:{id:'id_convite'}};
      return {status:400,body:{message:'unexpected'}};
    }});
  await page.settle();
  assert.equal(page.dom.get('form-nova').hidden,false);
  page.dom.get('nova').value='SenhaForte-2026-Exemplo!';
  page.dom.get('confirmacao').value='SenhaForte-2026-Exemplo!';
  await page.submit('form-nova');
  assert.equal(page.chamadas.filter(x=>x.opts.method==='PUT').length,1);
  assert.match(page.dom.get('status').textContent,/sucesso/);
});

test('nenhum botão de signup para contas conectadas, cadastro só pelo administrador',()=>{
  const views=fs.readFileSync(path.join(root,'src/views.js'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
  const server=fs.readFileSync(path.join(root,'nuvem/funcoes/convite/index.ts'),'utf8');
  const migration=fs.readFileSync(path.join(root,'nuvem/correcao-28-cadastro-administrativo.sql'),'utf8');
  assert.match(views,/Primeiro acesso\? Peça ao administrador/);
  assert.match(app,/Cadastro exclusivo do administrador/);
  assert.match(app,/chamarFuncao\('convite', \{/);
  assert.match(server,/Só o administrador convida pessoas/);
  assert.match(server,/papel, criado_por: id/);
  assert.match(server,/data: dadosEmail/);
  assert.match(migration,/convite_encontrado/);
  assert.match(migration,/Cadastro permitido apenas por convite do administrador/);
});
