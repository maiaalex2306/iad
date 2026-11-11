'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('ATA-P0: sintaxe de todos os módulos envolvidos',()=>{
 for(const file of ['src/app.js','src/ui.js','src/views.js','src/arquivos.js',
   'src/documentos.js','src/ia.js','src/config.js','sw.js']){
  new vm.Script(read(file),{filename:file});
 }
});
test('ATA-P0: o upload aguarda a extração, inclusive Enter/submit',()=>{
 const u=read('src/ui.js');
 assert.match(u,/dlg\.addEventListener\('submit'/);
 assert.match(u,/if \(dlg\.documentosPendentes\)/);
 assert.match(u,/ev\.preventDefault\(\)/);
 assert.match(u,/if \(salvar\) salvar\.disabled = true/);
 assert.match(u,/if \(salvar\) salvar\.disabled = false/);
 assert.match(u,/dlg\.documentosIA = docs/);
});
test('ATA-P0: editar tarefa concluída envia novo anexo para análise',()=>{
 const a=read('src/app.js');
 assert.match(a,/const materialNovo = textoDosDocumentos\(docs\)/);
 assert.match(a,/if \(!quer \|\| !docs \|\| !docs\.length/);
 assert.match(a,/App\.processarReuniao\(alvo\.id,materialNovo,true,\[\]/);
 assert.match(a,/tarefaId: tarefaEmCurso \? tarefaEmCurso\.tarefaId : null/);
 assert.match(a,/reanal(i|is)arAtaTarefa:\s*function/);
});
test('ATA-P0: nova ação lê a ata local pelo vínculo da tarefa e autoriza a negociação',()=>{
 const a=read('src/app.js'),db=read('src/arquivos.js'),view=read('src/views.js');
 assert.match(db,/function obter\(id\)/);
 assert.match(db,/Promise\.all\(\[/);
 assert.match(a,/Arq\.listar\(\{ oportunidadeId:op\.id \}\)/);
 assert.match(a,/r\.meta\.oportunidadeId!==op\.id/);
 assert.match(a,/r\.meta\.tarefaId && r\.meta\.tarefaId!==id/);
 assert.match(a,/D\.lerVarios\(arquivos\)/);
 assert.match(a,/Nenhum conteúdo parcial foi enviado à IA/);
 assert.match(view,/Analisar ata/);
 assert.doesNotMatch(a.slice(a.indexOf('reanalisarAtaTarefa: function'),a.indexOf('novaTarefaLivre: function')),/Store\.concluirTarefa\(/);
});
test('ATA-P0: status de relato não finge análise bem-sucedida',()=>{
 const v=read('src/views.js');
 assert.doesNotMatch(v,/Teve ata lida pelo assistente/);
 assert.match(v,/não comprova que a IA analisou a ata/);
});
test('ATA-P0: versão do shell e do cache idênticas',()=>{
 const config=read('src/config.js'),sw=read('sw.js');
 const versao=config.match(/numero:\s*'(v286\.\d+)'/);
 assert.ok(versao,'Versão ausente');
 assert.ok(sw.includes("const CACHE = 'iad-crm-"+versao[1]+"'"));
 assert.equal(versao[1],'v286.100');
});

test('ATA-P0: recupera anexo legado Outro quando único; recusa vários não vinculados',()=>{
 const a=read('src/app.js');
 assert.match(a,/x\.categoria==='Outro'/);
 assert.match(a,/semVinculo\.length>1/);
 assert.match(a,/Não posso escolher a ata correta automaticamente/);
 assert.match(a,/Origem da tarefa não comprovada/);
 assert.match(a,/tarefaId:null, tipoTarefa:'Documento antigo'/);
});
