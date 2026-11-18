'use strict';
/* PERF-32 — parity against the exact productive base, no Supabase or customer data.
 * Run with full Git history: git show d9d14ac:src/views.js.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const BASE='d9d14ac206e210b4b4d74a508c3320fe268c2c84';
const antigo=cp.execFileSync('git',['show',BASE+':src/views.js'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const novo=fs.readFileSync(path.join(root,'src/views.js'),'utf8');
function trecho(code,begin,end) {
 const a=code.indexOf(begin);
 const b=code.indexOf(end,a+begin.length);
 assert.ok(a>=0&&b>a,'funcao nao encontrada: '+begin+' / '+end);
 return code.slice(a,b);
}
function exercitarCatalogo(code,nome,est,itens){
 const start='  function listaCatalogo(est, nome) {';
 const end='  /* As fontes com o que cada uma produziu';
 const segment=trecho(code,start,end);
 return vm.runInNewContext(segment+'\nlistaCatalogo(est,nome);',{
   est,nome,Store:{catalogo:()=>itens},esc:x=>String(x??''),combina:()=>true,
   etiquetas:x=>String(x||''),
   tabela:(cols,rows,empty)=>'<table>'+cols.join('|')+rows+empty+'</table>',
   Object,String,Math
 });
}
function exercitarFontes(code,est,items) {
 const segment=trecho(code,'  function listaFontes(est) {','  function listaProdutos(est) {');
 return vm.runInNewContext(segment+'\nlistaFontes(est);',{
  est,Store:{catalogo:()=>items},P:{CATEGORIAS_FONTE:[{id:'web',rotulo:'Web'}]},
  U:{compacto:n=>String(n)},esc:x=>String(x??''),combina:()=>true,
  tabela:(cols,rows,empty)=>cols.join('|')+rows+empty,Object,String,Set
 });
}
function exercitarProdutos(code,est,items) {
 const segment=trecho(code,'  function listaProdutos(est) {','  function listaUsuarios() {');
 return vm.runInNewContext(segment+'\nlistaProdutos(est);',{
  est,Store:{catalogo:()=>items},global:{IADAuth:{ehGestor:()=>true}},
  U:{moeda:n=>String(n)},esc:x=>String(x??''),combina:()=>true,
  tabela:(cols,rows,empty)=>cols.join('|')+rows+empty,Object,String,Set
 });
}
function fixture(n) {
 const contas=Array.from({length:50},(_,i)=>({id:'c'+i,nome:'Conta '+i,segmento:'SEG-'+i%10}));
 const oportunidades=Array.from({length:n},(_,i)=>({
  id:'op'+i,contaId:'c'+i%50,titulo:'Oportunidade '+i,valor:1000+i,
  fonteId:'f'+i%110,itens:i%7===0?[{produtoId:'p'+i%80},{produtoId:'p'+i%80}]:[{produtoId:'p'+i%80}],
  dims:{problema:1},desfecho:i%3===0?{tipo:'ganho'}:i%9===0?{tipo:'perdido'}:null
 }));
 const tarefas=Array.from({length:n},(_,i)=>({
  id:'t'+i,oportunidadeId:'op'+i%Math.min(n,50),donoId:'u'+i%5,
  titulo:'Tarefa '+i,tipo:i%2?'Reunião':'Visita',
  status:i%7?'aberta':'concluida',vencimento:'2026-11-'+String(1+i%28).padStart(2,'0'),
  concluidaEm:'2026-11-01',hora:'10:00',decisaoAlvo:i%3?'problema':null
 }));
 return {contas,oportunidades,tarefas};
}
test('PERF-32: catalogo, segmentos, fontes e produtos tem HTML exatamente igual ao baseline',()=>{
 for(const n of [1,389,1133,5000]){
  const st=fixture(n);
  const seg=Array.from({length:25},(_,i)=>({id:'s'+i,nome:'SEG-'+i,ativo:i%2===0}));
  const tipos=Array.from({length:1133},(_,i)=>({id:'tt'+i,nome:i%2?'Reunião':'Visita',ativo:i%3>0}));
  const fontes=Array.from({length:110},(_,i)=>({id:'f'+i,nome:'Fonte '+i,categoria:'web'}));
  const produtos=Array.from({length:80},(_,i)=>({id:'p'+i,nome:'Produto '+i,sku:'sku'+i,precoReferencia:100,unidade:'un'}));
  for(const [nome,lista] of [['segmentos',seg],['tiposTarefa',tipos]]){
   assert.equal(exercitarCatalogo(novo,nome,st,lista),exercitarCatalogo(antigo,nome,st,lista),
     nome+' n='+n);
  }
  assert.equal(exercitarFontes(novo,st,fontes),exercitarFontes(antigo,st,fontes),'fontes n='+n);
  assert.equal(exercitarProdutos(novo,st,produtos),exercitarProdutos(antigo,st,produtos),'produtos n='+n);
 }
});
function renderTarefas(code,n,alvo){
 const start='  const ICONE_TIPO = {';
 const end='  /* ---------------- Revisão semanal';
 const segment=trecho(code,start,end);
 const st=fixture(n);
 st.tarefas.forEach(t=>{t.decisaoAlvo=alvo?t.decisaoAlvo:null;});
 const user={id:'u0',nome:'Usuário Zero'};
 let contextCalls=0,lacunaCalls=0;
 const filtro={responsavel:'todos',status:'todos',empresa:'',negocio:'',carteira:'todas',
  tipos:[],de:'',ate:'',busca:'',ordem:'data',crescente:true,pagina:1,porPagina:50};
 const output=vm.runInNewContext(segment+'\ntarefas();',{
  Store:{
   dados:()=>{contextCalls++;return st;},
   hoje:()=> '2026-11-03',
   conta:id=>st.contas.find(c=>c.id===id),
   oportunidade:id=>st.oportunidades.find(o=>o.id===id),
   nomesDoCatalogo:()=>['Reunião','Visita']},
  global:{IADAuth:{atual:()=>user,usuarios:()=>Array.from({length:5},(_,i)=>({id:'u'+i,nome:'Usuario '+i}))}},
  E:{lacunas:()=>{lacunaCalls++;return [{tipo:'problema'}]},
   deltaSemana:()=>({iadDelta:0})},
  P:{DIMENSOES:[{id:'problema',nome:'Problema'}]},
  U:{data:x=>String(x||''),moeda:x=>String(x||0)},
  CARTEIRA_TAREFA:[['todas','Todas',''],['pipeline','Pipeline',''],['nutricao','Nutrição','']],
  STATUS_TAREFA:[['todos','Todos',''],['abertas','Abertas',''],['atrasadas','Atrasadas','']],
  tarefasFiltro:filtro,tarefasMarcadas:{},esc:x=>String(x??''),
  Math,Date,Object,String,Set
 });
 return {output,contextCalls,lacunaCalls};
}
test('PERF-32: HTML de tarefas permanece igual em 1,389,1000 e 5000 tarefas',()=>{
 for(const n of [1,389,1000,5000]){
  for(const alvo of [true,false]){
   const a=renderTarefas(antigo,n,alvo),b=renderTarefas(novo,n,alvo);
   /* ATA-P0 adiciona um único controle deliberado de releitura em tarefas
      concluídas. Removemos SOMENTE esse botão para preservar a comparação
      exata do restante do HTML do PERF-32 contra o baseline histórico. */
   const htmlSemBotao = b.output.replace(
     /<button[^>]+onclick="App\.reanalisarAtaTarefa\('[^']+'\)"[^>]*>Analisar ata<\/button>/g,
     '');
   assert.equal(htmlSemBotao,a.output,'paridade tarefas '+n+' alvo='+alvo);
   if(n>0)assert.ok(b.output.includes('App.reanalisarAtaTarefa('),'botão da ata presente em tarefa concluída');
   assert.equal(b.contextCalls,1,'contexto so uma vez');
   assert.ok(a.contextCalls>=3,'baseline devia recalcular contexto');
   assert.ok(b.lacunaCalls<=a.lacunaCalls,'lacunas nao podem aumentar');
   if(alvo&&n>=389) assert.ok(b.lacunaCalls<a.lacunaCalls,'calculo de lacunas dispensado');
  }
 }
});
test('PERF-32: pares de versao e de cache PWA consistentes',()=>{
 const config=fs.readFileSync(path.join(root,'src/config.js'),'utf8');
 const worker=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 const version=config.match(/numero:\s*'(v[0-9.]+)'/);
 assert.ok(version,'numero de versao');
 assert.match(version[1],/^v286\.\d+$/);
 assert.ok(worker.includes("const CACHE = 'iad-crm-"+version[1]+"'"));
});
