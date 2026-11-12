'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../../src/app.js'),'utf8');
function build(){
 const a=src.indexOf('  let ultimaAssinaturaSync = null;');
 const b=src.indexOf('  function render() {',a);
 const c=src.indexOf('    let renderSyncPendente = false;');
 const d=src.indexOf('    global.IADAjuda.ligar();',c);
 assert.ok(a>=0&&b>a&&c>=0&&d>c);
 const parts=src.slice(a,b)+'\n'+src.slice(c,d);
 let user={id:'u1',papel:'admin',tenantId:'a'},
  filters={tenant:'todas',usuario:'todos'},
  revision=12,session=true,banner='',route='#/pipeline',
  downloading=false,disconnected=false;
 const raf=[];let observer=null,notices=0,renders=0;
 const ctx=vm.createContext({
  global:{IADNuvem:{mandaNoAcesso:()=>true,sessao:()=>session},
   IADSincronia:{aoMudar:fn=>observer=fn}},
  A:{atual:()=>user,filtros:()=>filters},Store:{revisao:()=>revision},
  location:{get hash(){return route}},faixaDeAviso:()=>banner,
  vigiarGravacao:()=>{notices++;},requestAnimationFrame:fn=>{raf.push(fn);},
  setTimeout:fn=>{raf.push(fn);},JSON
 });
 // State normally lives elsewhere in app.js; emulate it explicitly here.
 vm.runInContext("let baixando=false,semServidor='';\n"+parts,ctx);
 vm.runInContext('ultimaAssinaturaSync = assinaturaDaTelaParaSync();',ctx);
 ctx.render=()=>{renders++;vm.runInContext('ultimaAssinaturaSync = assinaturaDaTelaParaSync();',ctx);};
 return {emit:()=>observer({situacao:'ocioso'}),
  flush:()=>{while(raf.length)raf.shift()();},
  setters:{revision:v=>revision=v,route:v=>route=v,banner:v=>banner=v,
   filters:v=>filters=v,user:v=>user=v,session:v=>session=v,
   downloading:v=>vm.runInContext('baixando = '+Boolean(v)+';',ctx),
   disconnected:v=>vm.runInContext('semServidor = '+JSON.stringify(v?'sem servidor':'')+';',ctx)},
  get renders(){return renders},get notices(){return notices},get queued(){return raf.length}};
}
test('sincronizacao de status nao reconstrui Pipeline com dados iguais',()=>{
 const h=build();
 for(let i=0;i<25;i++){h.emit();h.flush();}
 assert.equal(h.renders,0,'nenhum redraw de oportunidade sem alteracao de dados');
 assert.equal(h.notices,25,'avisos CAS continuam imediatos');
});
test('nova revisao, filtro, rota, tenant e aviso visivel exigem renderizacao',()=>{
 const h=build();
 const checks=[
  ()=>h.setters.revision(13),
  ()=>h.setters.filters({tenant:'a',usuario:'todos'}),
  ()=>h.setters.route('#/op/heineken'),
  ()=>h.setters.banner('<div>CAS falhou</div>'),
  ()=>h.setters.user({id:'u2',papel:'gestor',tenantId:'b'})
 ];
 checks.forEach((change,i)=>{change();h.emit();h.flush();assert.equal(h.renders,i+1);});
 h.emit();h.flush();assert.equal(h.renders,5,'nao renderiza duas vezes estado identico');
 h.setters.session(false);h.emit();h.flush();assert.equal(h.renders,6,'sem sessao nao pula tela de login');
});
test('download e ausencia de servidor preservam renderizacao integral',()=>{
 const h=build();
 h.setters.downloading(true);h.emit();h.flush();assert.equal(h.renders,1);
 h.setters.downloading(false);h.setters.disconnected(true);
 h.emit();h.flush();assert.equal(h.renders,2);
});
test('render completo atualiza assinatura apos renderizar a rota',()=>{
 assert.match(src,/rolagemAnterior = hash;\s*ultimaAssinaturaSync = assinaturaDaTelaParaSync\(\)/);
 assert.match(src,/if \(assinatura && assinatura === ultimaAssinaturaSync\) return;/);
 assert.match(src,/vigiarGravacao\(sinc\);/);
});
