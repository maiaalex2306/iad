'use strict';
/* A/B no MESMO runner, mesmos dados e algoritmo, mudando apenas a memoização. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const root=path.resolve(__dirname,'..');
const baseline='eaf46b932a5a6224651cff57597d3079de51e99f';
const before=execFileSync('git',['show',baseline+':src/ri/internal-cues.mjs'],
  {cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
const after=fs.readFileSync(path.join(root,'src/ri/internal-cues.mjs'),'utf8');
assert(before!==after,'versões idênticas: benchmark diferencial inválido');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'iad-perf41-'));
function load(which,source) {
 const dir=path.join(temp,which);fs.mkdirSync(dir);
 for(const name of ['opportunity-radar.mjs','conversation-intent.mjs']){
  fs.copyFileSync(path.join(root,'src/ri',name),path.join(dir,name));
 }
 fs.writeFileSync(path.join(dir,'internal-cues.mjs'),source);
 return import(pathToFileURL(path.join(dir,'opportunity-radar.mjs')).href);
}
const [oldModule,newModule]=await Promise.all([load('before',before),load('after',after)]);
function fixture(unique){
 const N=5000,accounts=[],ops=[];
 for(let i=0;i<N;i++){
  accounts.push({id:'a'+i,tenantId:'ta',donoId:'gestor',nome:'Conta '+i,segmento:'Industrial'});
  ops.push({id:'o'+i,tenantId:'ta',donoId:'gestor',contaId:'a'+i,
    notas:i%13===0?'Cliente pediu proposta de automação.':'Registro de acompanhamento comercial',
    eventos:Array.from({length:6},(_,j)=>({
      id:'e'+i+'-'+j,tipo:'activity',data:'2026-10-02',
      titulo:j===0&&i%31===0?'Estamos ampliando a fábrica.':
         'Registro de reunião operacional'+(unique?' '+i+'-'+j:'')
    }))
  });
 }
 return {contas:accounts,oportunidades:ops,contatos:[],tarefas:[],sinais:[],produtos:[]};
}
const scope={role:'gestor',userId:'gestor',tenantId:'ta'};
const median=a=>{const b=[...a].sort((x,y)=>x-y);return (b[1]+b[2])/2;};
test('PERF41: comparar motor antes/depois no mesmo runner, sem alterar resultado',()=>{
 const report=[];
 for(const unique of [false,true]){
  const snapshot=fixture(unique);
  const args={snapshot,scope,asOf:'2026-11-06'};
  const old=oldModule.buildCommercialOpportunityRadar,
        current=newModule.buildCommercialOpportunityRadar;
  const expected=old(args),actual=current(args);
  assert.equal(JSON.stringify(actual),JSON.stringify(expected),
    'A memoização alterou os resultados comerciais');
  old(args);current(args); // aquecimento simétrico
  const earlier=[],later=[];
  for(let i=0;i<4;i++){
    for(const [fn,sink] of (i%2?[[current,later],[old,earlier]]:[[old,earlier],[current,later]])){
      const start=performance.now();fn(args);sink.push(performance.now()-start);
    }
  }
  const oldMs=median(earlier),newMs=median(later);
  const saving=100*(oldMs-newMs)/oldMs;
  report.push({scenario:unique?'mostly-unique':'highly-repeated',opportunities:5000,
    events:30000,baselineMs:+oldMs.toFixed(2),candidateMs:+newMs.toFixed(2),
    deltaPercent:+saving.toFixed(1),parity:'PASS',
    methodology:'same runner/same data, four alternating iterations per version'});
  /* Cenário de textos únicos não pode degradar mais de 30% sob ruído de runner.
     O caso repetido deve aproveitar materialmente o cache. */
  assert(newMs<oldMs*(unique?1.30:0.93),
    'Regressão PERF41: '+(unique?'texto único':'texto repetido')+
    ' antes='+oldMs.toFixed(2)+' depois='+newMs.toFixed(2));
 }
 console.log('PERF41_AB_BENCH '+JSON.stringify(report));
});
test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
