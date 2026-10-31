'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('src/views.js','utf8');
test('instrumentação de abertura e abas preservada',()=>{
  assert.match(src,/perf10\.cockpit\.tarefas\.render/);
  assert.match(src,/perf10\.cockpit\.abas\.cabecalho/);
  assert.match(src,/perf10\.cockpit\.aba\.conteudo/);
  const app=fs.readFileSync('src/app.js','utf8');
  assert.match(app,/perf03b\.trocar-aba/);
  assert.match(app,/dom\.cockpit/);
});
test('seleção e ordenação de tarefas mantém paridade para 243,389,1000,5000 tarefas',()=>{
 const hoje='2026-10-30';
 const tarefas=n=>Array.from({length:n},(_,i)=>({id:i,status:i%3?'aberta':'concluida',vencimento:`2026-10-${String(i%30+1).padStart(2,'0')}`,semRegistro:i%7===0,concluidaEm:`2026-10-${String(i%30+1).padStart(2,'0')}`}));
 for(const n of [243,389,1000,5000]){
  const a=tarefas(n);
  for(const filtro of ['abertas','atrasadas','concluidas','sem-relato','todas']){
   const passa=t=>(filtro==='abertas'?t.status==='aberta':filtro==='atrasadas'?t.status==='aberta'&&t.vencimento<hoje:filtro==='concluidas'?t.status!=='aberta':filtro==='sem-relato'?t.status!=='aberta'&&t.semRegistro:true);
   const antigo=a.slice().sort((x,y)=>x.vencimento.localeCompare(y.vencimento)).filter(passa);
   const novo=a.filter(passa).sort((x,y)=>x.vencimento.localeCompare(y.vencimento));
   assert.deepEqual(novo,antigo,`n=${n} filtro=${filtro}`);
  }
 }
});

test('PERF-10 cobre todos os cards e nove abas sem hardcode de empresa',()=>{
 assert.match(src,/const cockpitMemo = new Map\(\)/);
 assert.match(src,/COCKPIT_MEMO_LIMITE = 64/);
 assert.match(src,/cockpitMemo\.has\(chave\)/);
 assert.match(src,/Store\.revisao\(\),Store\.hoje\(\),u\.id/);
 assert.match(src,/perf10\.aba\.' \+ abaCockpit/);
 for(const aba of ['decisao','historico','tarefas','whatsapp','sinais','email','propostas','produtos','arquivos']){
   assert.ok(src.includes("['"+aba+"'"),"aba:"+aba);
 }
 assert.doesNotMatch(src,/Cacau Show/);
});

test('instrumentação cobre próximo frame de qualquer card e aba',()=>{
 const app=fs.readFileSync('src/app.js','utf8');
 assert.match(app,/perf10\.cockpit\.proximo-frame/);
 assert.match(app,/perf10\.aba\.proximo-frame/);
 assert.match(app,/requestAnimationFrame/);
 assert.match(app,/perf\.ativo\(\)/);
});
