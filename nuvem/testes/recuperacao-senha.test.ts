/* Teste de regressão: link de convite/recuperação não pode virar #/hoje
   Executar: bun nuvem/testes/recuperacao-senha.test.ts
   Sem banco, sem chave, sem chamada de rede ou credencial real.
   Executa as duas funções reais extraídas de src/app.js com location simulado. */
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8');
function trecho(inicio: string, fim: string) {
  const a = app.indexOf(inicio), b = app.indexOf(fim, a + inicio.length);
  if (a < 0 || b < 0) throw new Error('Função não encontrada: ' + inicio);
  return app.slice(a, b);
}

const parser = trecho('  function credencialNoEndereco() {', '\n  /* Fora do endereço');
const navegador = trecho('  function abrirNoHoje() {', '\n  window.addEventListener');
function simular(hash: string) {
  const rotas: string[] = [];
  const location = {
    hash, pathname: '/', search: '',
    replace: (destino: string) => { rotas.push(destino); }
  };
  // As funções consultam somente a localização; jamais são usadas credenciais reais.
  const credencialNoEndereco = new Function('location', parser + '\nreturn credencialNoEndereco();')
    .bind(null, location) as () => Record<string,string> | null;
  const abrirNoHoje = new Function('location', 'credencialNoEndereco',
    navegador + '\nreturn abrirNoHoje();').bind(null, location, credencialNoEndereco);
  const credencial = credencialNoEndereco();
  abrirNoHoje();
  return { rotas, credencial, hash: location.hash };
}

let ok = 0;
function testar(rotulo: string, condicao: boolean) {
  if (!condicao) throw new Error('FALHA ' + rotulo);
  ok++;
  console.log('ok   ' + rotulo);
}

let r = simular('#access_token=token-de-teste&refresh_token=refresh-de-teste&type=recovery');
testar('Recuperação mantém fragmento até adoção', r.rotas.length === 0 && r.hash.includes('access_token='));
testar('Recuperação é reconhecida', r.credencial?.tipo === 'recovery');
r = simular('#access_token=token-de-teste&type=invite');
testar('Convite não perde credencial', r.rotas.length === 0 && r.credencial?.tipo === 'invite');
r = simular('#error=access_denied&error_code=otp_expired');
testar('Link expirado preserva erro para exibir causa', r.rotas.length === 0 && r.credencial?.erro === 'otp_expired');
r = simular('#/op/teste');
testar('Deep link comercial é preservado', r.rotas.length === 0);
r = simular('#/pipeline');
testar('Navegação comum continua abrindo Hoje', r.rotas[0] === '/#/hoje');
r = simular('');
testar('Primeiro acesso comum abre Hoje', r.rotas[0] === '/#/hoje');

testar('Troca de senha usa endpoint de atualização autenticada',
  app.includes('global.IADNuvem.trocarMinhaSenha(d.nova)'));
testar('Senha nova é comparada apenas à repetição digitada',
  app.includes('if (d.nova !== d.confere)'));

console.log('\n' + ok + ' verificações aprovadas');
