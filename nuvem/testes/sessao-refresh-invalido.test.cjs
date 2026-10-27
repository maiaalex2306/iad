/* Testes da renovação de sessão — não usa Supabase nem credenciais reais.
   Execute: node --test nuvem/testes/sessao-refresh-invalido.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/nuvem.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const KEY = 'iad-crm:nuvem-sessao:v1';

function simular() {
  const keys = new Map();
  const eventos = [];
  const localStorage = {
    setItem(k, v) { keys.set(k, v); },
    getItem(k) { return keys.has(k) ? keys.get(k) : null; },
    removeItem(k) { keys.delete(k); }
  };
  const window = {
    IADStore:{},
    IADConfig:{supabase:{url:'https://teste.supabase.co',chave:'sb_publishable_TESTE'}},
    CustomEvent:class { constructor(type) {this.type=type;} },
    dispatchEvent(evt) {eventos.push(evt.type);}
  };
  vm.runInNewContext(source,{window,localStorage,Date,JSON,Promise,fetch:()=>Promise.reject(Error('mock only'))});
  const N = window.IADNuvem;
  const user={id:'conta-teste'};
  const setup=(refresh_token='refresh-antigo')=>{
    localStorage.setItem(KEY,JSON.stringify({
      user, refresh_token, access_token:'access-antigo',expires_at:12,
      perfil:{papel:'gestor',tenant_id:'empresa-test'}
    }));
  };
  return {N,keys,eventos,setup,localStorage};
}
const rejeicao = (mensagem,status)=>{
  const e=new Error(mensagem);e.status=status;return Promise.reject(e);
};

test('refresh token inexistente encerra só sessão e sinaliza login',async()=>{
  const {N,keys,eventos,setup,localStorage}=simular();
  setup();
  localStorage.setItem('iad-crm:pendencias:v1','arquivo-de-teste');
  localStorage.setItem('iad-crm:nuvem:v1','config-preservada');
  N.__trocarChamar((caminho)=>rejeicao('Invalid Refresh Token: Refresh Token Not Found',400));
  await assert.rejects(N.renovar(),e=>e.sessaoExpirada===true && /Entre novamente/.test(e.message));
  assert.equal(localStorage.getItem(KEY),null);
  assert.equal(localStorage.getItem('iad-crm:pendencias:v1'),'arquivo-de-teste');
  assert.equal(localStorage.getItem('iad-crm:nuvem:v1'),'config-preservada');
  assert.equal(N.conectado(),false);
  assert.equal(eventos.filter(x=>x==='iad-sessao-expirada').length,1);
});

test('chamadas paralelas compartilham um refresh e preservam o mesmo perfil',async()=>{
  const {N,setup,eventos}=simular();
  setup();
  let chamadas=0,responder;
  N.__trocarChamar(()=>{chamadas++;return new Promise(resolve=>{responder=resolve;});});
  const a=N.renovar(), b=N.renovar();
  assert.equal(chamadas,1);
  responder({access_token:'access-novo',refresh_token:'refresh-novo',user:{id:'conta-teste'},expires_in:3600});
  const [x,y]=await Promise.all([a,b]);
  assert.equal(x.refresh_token,'refresh-novo');
  assert.equal(y.refresh_token,'refresh-novo');
  assert.equal(N.sessao().perfil.papel,'gestor');
  assert.equal(eventos.length,0);
});

test('falha de outra aba não apaga sessão mais nova',async()=>{
  const {N,setup,localStorage,eventos}=simular();
  setup();
  N.__trocarChamar(()=>{
    localStorage.setItem(KEY,JSON.stringify({
      access_token:'access-mais-novo',refresh_token:'refresh-mais-novo',
      user:{id:'conta-teste'},expires_at:Math.floor(Date.now()/1000)+3600
    }));
    return rejeicao('Invalid Refresh Token: Refresh Token Not Found',400);
  });
  const novo=await N.renovar();
  assert.equal(novo.refresh_token,'refresh-mais-novo');
  assert.equal(N.sessao().access_token,'access-mais-novo');
  assert.equal(eventos.length,0);
});

test('instabilidade da rede mantém sessão local para nova tentativa',async()=>{
  const {N,setup,localStorage,eventos}=simular();
  setup();
  N.__trocarChamar(()=>rejeicao('Não foi possível falar com o servidor. Confira sua conexão.'));
  await assert.rejects(N.renovar(),/Não foi possível falar/);
  assert.ok(localStorage.getItem(KEY));
  assert.equal(eventos.length,0);
});

test('a interface trata refresh inválido separadamente de falta de internet',()=>{
  assert.ok(app.includes("window.addEventListener('iad-sessao-expirada'"));
  assert.ok(app.includes('if (tratarSessaoExpirada(e)) return;'));
  assert.ok(app.includes("V.definirTelaAcesso('login', null,"));
  assert.ok(app.includes("Sua sessão expirou. Entre novamente"));
});
