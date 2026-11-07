import test from 'node:test';
import assert from 'node:assert/strict';
import {importLinkedInCsv,normalizeProfile,columnsFromCsvHeader,csvLeadFromCells} from '../src/linkedin-csv.mjs';
import {importLinkedInCsvStream,CSV_MAX_BYTES,CSV_BATCH_SIZE} from '../src/linkedin-csv-stream.mjs';

function fakeFile(bytes,name='leads.csv'){
  const data=typeof bytes==='string'?Buffer.from(bytes,'utf8'):Buffer.from(bytes);
  return {name,size:data.length,stream:()=>new Blob([data]).stream()};
}
async function collect(file,options={}){
  const rows=[],seen=new Set();
  const result=await importLinkedInCsvStream(file,{onBatch:async batch=>{
    let inserted=0,duplicates=0;
    for(const row of batch){
      if(seen.has(row.perfil))duplicates++;
      else{seen.add(row.perfil);rows.push(row);inserted++;}
    }
    return {inserted,duplicates};
  },...options});
  return {...result,rows};
}
test('Cabeçalhos UTF-8 e linhas multipartidas são processadas',async()=>{
  const input='Nome;LinkedIn;Empresa;Resumo Perfil\r\n'+
   '"Maria; da Silva";"https://www.linkedin.com/in/maria-silva/";"Bio";"Texto com quebra\r\nde linha"\r\n'+
   'João;https://linkedin.com/in/joao-santos/;Química;Laboratório\r\n';
  const expected=importLinkedInCsv(input);
  const f={name:'sample.csv',size:Buffer.byteLength(input),stream:()=>{
    const bytes=Buffer.from(input);let i=0;
    return new ReadableStream({pull(ctrl){
      if(i>=bytes.length){ctrl.close();return;}
      ctrl.enqueue(bytes.subarray(i,Math.min(i+3,bytes.length)));i+=3;
    }});
  }};
  const actual=await collect(f,{batchSize:50});
  assert.equal(actual.summary.valid,2);
  assert.deepEqual(actual.rows.map(r=>r.perfil),expected.leads.map(r=>r.perfil));
  assert.match(actual.rows[0].resumoPerfil,/quebra\r\nde linha/);
  assert.equal(actual.summary.separator,';');
});
test('Duplicidade e URLs falsas não entram na fila',async()=>{
  const csv='Name,profile_url,Company\n'+
   'Maria,https://linkedin.com/in/valid-profile/,Fábrica\n'+
   'Maria novamente,https://www.linkedin.com/in/valid-profile/?a=1,Fábrica\n'+
   'Invasor,https://linkedin.com.evil.net/in/falso/,Fraude\n';
  const imported=await collect(fakeFile(csv),{batchSize:50});
  assert.equal(imported.summary.total,3);
  assert.equal(imported.summary.valid,1);
  assert.equal(imported.summary.duplicates,1);
  assert.equal(imported.summary.invalid,1);
});
test('UTF-16 LE e BOM são suportados em streaming',async()=>{
  const input='Nome;LinkedIn\nÂngela;https://www.linkedin.com/in/angela-souza/\n';
  const utf16=Buffer.from(input,'utf16le');
  const imported=await collect(fakeFile(Buffer.concat([Buffer.from([0xff,0xfe]),utf16])));
  assert.equal(imported.summary.valid,1);
  assert.equal(imported.rows[0].lead,'Ângela');
});
test('Windows-1252 é suportado quando primeiro lote é inválido em UTF-8',async()=>{
  const input=Buffer.from('Nome;LinkedIn\nAndr\xe9;https://www.linkedin.com/in/andre-valid/\n','latin1');
  const result=await collect(fakeFile(input));
  assert.equal(result.summary.valid,1);
  assert.equal(result.rows[0].lead,'André');
});
test('Arquivo acima de 100 MiB, cabeçalhos inválidos e CSV sem dados são recusados',async()=>{
  const tooBig={name:'huge.csv',size:CSV_MAX_BYTES+1,stream:()=>{throw Error('Não deveria ler')}};
  await assert.rejects(()=>importLinkedInCsvStream(tooBig,{onBatch:async()=>({})}),/100/);
  await assert.rejects(()=>collect(fakeFile('a;b\n1;2\n')),/coluna de perfil/i);
  await assert.rejects(()=>collect(fakeFile('Nome;LinkedIn\n')),/sem linhas/i);
});
test('Cancelamento via AbortSignal não deixa importação em andamento',async()=>{
  const abort=new AbortController();abort.abort();
  await assert.rejects(()=>collect(fakeFile('Nome;LinkedIn\nLead;https://linkedin.com/in/lead-valid/\n'),{signal:abort.signal}),/cancelada/i);
});
test('Arquivos grandes usam batches, sem materializar toda lista no parser',async()=>{
  const header=Buffer.from('Nome;LinkedIn;Extra\n');
  const prefix='Lead Teste;https://www.linkedin.com/in/lead-valid-large/;';
  const repeated=Buffer.from(prefix+'x'.repeat(8100)+'\n');
  const repeatedCount=Math.floor((CSV_MAX_BYTES-header.length-prefix.length-1)/repeated.length);
  const tailBytes=CSV_MAX_BYTES-header.length-repeatedCount*repeated.length;
  const tail=Buffer.from(prefix+'y'.repeat(tailBytes-Buffer.byteLength(prefix)-1)+'\n');
  assert.equal(header.length+repeatedCount*repeated.length+tail.length,CSV_MAX_BYTES);
  let position=0;
  const file={name:'100m.csv',size:CSV_MAX_BYTES,stream:()=>new ReadableStream({
    pull(controller){
      if(position===0)controller.enqueue(header);
      else if(position<=repeatedCount)controller.enqueue(repeated);
      else if(position===repeatedCount+1)controller.enqueue(tail);
      else {controller.close();return;}
      position++;
    }
  })};
  let maxBatch=0,total=0,progress=0;
  const started=performance.now();
  const data=await importLinkedInCsvStream(file,{onBatch:async rows=>{
    maxBatch=Math.max(maxBatch,rows.length);total+=rows.length;return {inserted:rows.length,duplicates:0};
  },onProgress:s=>{progress=s.percent;}});
  const elapsed=Math.round(performance.now()-started);
  assert.equal(data.summary.total,repeatedCount+1);
  assert.equal(data.summary.valid,total);
  assert.equal(data.summary.invalid,0);
  assert.ok(maxBatch<=CSV_BATCH_SIZE);
  assert.equal(progress,100);
  console.log('CSV100M_STREAM_BENCH',JSON.stringify({bytes:CSV_MAX_BYTES,rows:total,seconds:elapsed/1000,maxBatch,peakHeapMiB:Math.round(process.memoryUsage().heapUsed/1048576)}));
});
