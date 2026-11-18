import test from 'node:test';
import assert from 'node:assert/strict';
import {importLinkedInCsv,normalizeProfile,columnsFromCsvHeader,csvLeadFromCells,profileFailureReason,extractLinkedInProfilesFromText} from '../src/linkedin-csv.mjs';
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
test('Aceita perfis convencionais, IDs opacos, Sales Navigator, Recruiter e legado',()=>{
 const cases=[
  ['https://www.linkedin.com/in/joao-silva-1234/?trk=abc','https://www.linkedin.com/in/joao-silva-1234/'],
  ['https://www.linkedin.com/in/ACoAAA8BYqEBCGLg_vT_ca6mMEqkpp9nVffJ3hc/','https://www.linkedin.com/in/ACoAAA8BYqEBCGLg_vT_ca6mMEqkpp9nVffJ3hc/'],
  ['https://www.linkedin.com/sales/profile/251749025,sSHS,name','https://www.linkedin.com/sales/profile/251749025,sSHS,name'],
  ['https://www.linkedin.com/sales/people/ACwAAA8BYqEBlKc364xhzvygIeuJJ3rATiwe2NE,name,sSHS','https://www.linkedin.com/sales/people/ACwAAA8BYqEBlKc364xhzvygIeuJJ3rATiwe2NE,name,sSHS'],
  ['https://www.linkedin.com/recruiter/profile/251749025,sSHS,name','https://www.linkedin.com/recruiter/profile/251749025,sSHS,name'],
  ['https://www.linkedin.com/profile/view?id=williamhgates','https://www.linkedin.com/profile/view?id=williamhgates'],
  ['https://www.linkedin.com/in/joao-silva-1234/details/experience/','https://www.linkedin.com/in/joao-silva-1234/']
 ];
 for(const [actual,expected] of cases)assert.equal(normalizeProfile(actual),expected,actual);
});
test('Rejeita domínios maliciosos, empresas e links sem identidade de perfil',()=>{
 for(const bad of [
 'https://linkedin.com.evil.com/in/test','https://www.linkedin.com/company/exemplo/',
 'https://www.linkedin.com/jobs/view/123','javascript:alert(1)',
 'https://user:password@www.linkedin.com/in/johnsmith','https://www.linkedin.com:8443/in/johnsmith',
 'https://www.linkedin.com/in/%2Fadmin'
 ])assert.equal(normalizeProfile(bad),'',bad);
});
test('A coluna LinkedIn prevalece sobre URL genérica e o fallback funciona',async()=>{
 const csv='Nome;URL;LinkedIn;Cargo\n'+
 'Helena;https://empresa.com.br;https://www.linkedin.com/in/helena-baptista/;Diretora\n'+
 'Janaina;https://www.linkedin.com/company/empresa/;https://www.linkedin.com/sales/people/ACwAAA8BYqEBlKc364xhzvygIeuJJ3rATiwe2NE,name,sSHS;Gestora\n';
 const out=await collect(fakeFile(csv));
 assert.equal(out.summary.valid,2);
 assert.equal(out.summary.invalid,0);
 assert.match(out.rows[0].perfil,/helena-baptista/);
 assert.match(out.rows[1].perfil,/sales\/people/);
});
test('Motivos de rejeição identificam linha, valor e identidade',async()=>{
 const csv='Nome;LinkedIn\n'+
 'Sem perfil;\nEmpresa;https://www.linkedin.com/company/exemplo/\n'+
 'Site externo;https://example.org\nTexto;procurar depois\n'+
 'Valido;https://www.linkedin.com/in/pessoa-valida/\n';
 const out=await collect(fakeFile(csv));
 assert.equal(out.summary.valid,1);
 assert.equal(out.summary.invalid,4);
 assert.deepEqual({...out.summary.invalidReasons},
 {sem_link:1,formato_linkedin_nao_suportado:1,link_externo:1,campo_sem_url:1});
 assert.deepEqual(out.summary.problems.map(p=>p.line),[2,3,4,5]);
 assert.equal(out.summary.problems[1].name,'Empresa');
 assert.match(out.summary.problems[1].url,/company/);
});
test('Importa 821 leads mesmo com cabeçalho LinkedIn desconhecido e URLs em coluna alternativa',async()=>{
  const rows=['Nome;Website oficial;Rede social do decisor;Observação'];
  for(let i=1;i<=821;i++){
    const id='pessoa-industrial-'+i;
    const profile=i%3===0?'https://www.linkedin.com/sales/profile/'+i+',sSHS,name':
      'https://www.linkedin.com/in/'+id+'/';
    rows.push('Lead '+i+';https://empresa'+i+'.com.br;'+profile+';contato de teste');
  }
  const out=await collect(fakeFile(rows.join('\n')+'\n'),{batchSize:350});
  assert.equal(out.summary.total,821);
  assert.equal(out.summary.valid,821);
  assert.equal(out.summary.invalid,0);
  assert.equal(out.summary.duplicates,0);
  assert.equal(out.rows.length,821);
});
test('Perfil em segunda coluna não identificada também é encontrado',async()=>{
 const s='Contato;Link da carreira;Observações\n'+
 'Diretor;https://www.linkedin.com/in/diretor-teste/;Ativo\n';
 const out=await collect(fakeFile(s));
 assert.equal(out.summary.valid,1);
 assert.equal(out.rows[0].lead,'Diretor');
});
test('Mais de um perfil distinto sem coluna específica não importa pessoa ambígua',async()=>{
 const s='Contato;Pessoa A;Pessoa B\n'+
 'Ambiguo;https://www.linkedin.com/in/primeiro/;https://www.linkedin.com/in/segundo/\n';
 const out=await collect(fakeFile(s));
 assert.equal(out.summary.valid,0);
 assert.equal(out.summary.invalid,1);
 assert.equal(out.summary.invalidReasons.perfil_ambiguo,1);
});
test('IDs Sales Navigator/Recruiter truncados são rejeitados, nunca transformados em outro perfil',()=>{
  assert.equal(normalizeProfile('https://www.linkedin.com/sales/people/ACwAAA8BYqEBlKc364xhzvygIeuJJ3rATiwe2NE'),'');
  assert.equal(normalizeProfile('https://www.linkedin.com/recruiter/profile/251749025,sSHS'),'');
  assert.match(normalizeProfile('https://www.linkedin.com/sales/people/ACwAAA8BYqEBlKc364xhzvygIeuJJ3rATiwe2NE,name,sSHS'),/name,sSHS$/);
});
test('TXT importa URLs separadas por vírgulas sem partir identificador do Sales Navigator',async()=>{
 const txt='https://www.linkedin.com/in/diretor-comercial/,https://www.linkedin.com/sales/profile/251749025,sSHS,name\n';
 const out=await collect(fakeFile(txt,'perfils-lista.txt'));
 assert.equal(out.summary.valid,2);
 assert.equal(out.summary.invalid,0);
 assert.match(out.rows[1].perfil,/sales\/profile\/251749025,sSHS,name/);
});
test('CSV somente com URLs, sem cabeçalho, importa inclusive a primeira linha',async()=>{
 const input='https://www.linkedin.com/in/primeiro-lead/\r\n'+
   'https://www.linkedin.com/in/segundo-lead/\r\n';
 const out=await collect(fakeFile(input,'urls.csv'));
 assert.equal(out.summary.total,2);
 assert.equal(out.summary.valid,2);
 assert.equal(out.rows[0].perfil,'https://www.linkedin.com/in/primeiro-lead/');
});
test('CSV sem cabeçalho e apenas uma URL é válido',async()=>{
 const out=await collect(fakeFile('https://www.linkedin.com/in/unico-lead/\n','urls.csv'));
 assert.equal(out.summary.total,1);
 assert.equal(out.summary.valid,1);
});
test('TXT simples sem cabeçalho aceita perfis convencionais, Sales Navigator e Recruiter',async()=>{
 const input=[
  'https://www.linkedin.com/in/diretora-industrial/',
  'linkedin.com/in/ACoAAA8BYqEBCGLg_vT_ca6mMEqkpp9nVffJ3hc/',
  'https://www.linkedin.com/sales/profile/251749025,sSHS,name',
  'www.linkedin.com/recruiter/profile/300086559,jf3i,CAP'
 ].join('\n')+'\n';
 const out=await collect(fakeFile(input,'perfis.txt'));
 assert.equal(out.summary.total,4);
 assert.equal(out.summary.valid,4);
 assert.equal(out.summary.invalid,0);
 assert.deepEqual(out.rows.map(x=>x.sourceLine),[1,2,3,4]);
 assert.ok(out.rows[1].perfil.includes('ACoAAA'));
});
test('TXT com links misturados em texto reconhece múltiplos perfis na mesma linha',async()=>{
 const input='Diretora: https://www.linkedin.com/in/diretora-exemplo/; gerente: https://www.linkedin.com/in/gerente-exemplo/.\n'+
  'https://www.linkedin.com/in/diretora-exemplo/?trk=profile\n'+
  'Páginas de empresas https://www.linkedin.com/company/acme/\n'+
  'https://linkedin.com.evil.org/in/atacante\n';
 const out=await collect(fakeFile(input,'perfis.txt'));
 assert.equal(out.summary.total,5);
 assert.equal(out.summary.valid,2);
 assert.equal(out.summary.duplicates,1);
 assert.equal(out.summary.invalid,2);
 assert.equal(out.rows.length,2);
 assert.equal(out.summary.problems[0].line,3);
});
test('Lista TXT com 821 perfis válidos e sem cabeçalho mantém fila sequencial',async()=>{
 const list=Array.from({length:821},(_,i)=>'https://www.linkedin.com/in/lead-industrial-'+(i+1)+'/').join('\r\n')+'\r\n';
 const out=await collect(fakeFile(list,'821-perfis.txt'),{batchSize:350});
 assert.equal(out.summary.total,821);
 assert.equal(out.summary.valid,821);
 assert.equal(out.rows.length,821);
 assert.equal(out.rows.at(-1).linha,821);
 assert.equal(out.rows.at(-1).sourceLine,821);
});
test('TXT UTF-16 e Windows-1252 mantém leitura de URLs e números de linha',async()=>{
 const text='Diretor José: https://www.linkedin.com/in/diretor-industrial/\r\n';
 const utf16=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(text,'utf16le')]);
 const a=await collect(fakeFile(utf16,'lista.txt'));
 assert.equal(a.summary.valid,1);
 const latin1=Buffer.from(text,'latin1');
 const b=await collect(fakeFile(latin1,'lista.txt'));
 assert.equal(b.summary.valid,1);
 assert.equal(b.rows[0].perfil,a.rows[0].perfil);
});
test('Extrator de TXT não interpreta páginas de empresa e publicações como pessoas',()=>{
 assert.deepEqual(extractLinkedInProfilesFromText('https://linkedin.com/company/abc/ https://linkedin.com/posts/abc/'),[]);
 assert.deepEqual(extractLinkedInProfilesFromText('Perfil: https://linkedin.com/in/pessoa-alvo/'),['https://www.linkedin.com/in/pessoa-alvo/']);
});
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
test('Windows-1252 com cabeçalho ASCII e acento após 64 KiB não corrompe a importação',async()=>{
  const header='Nome;LinkedIn\n';
  const leadLine=i=>'Lead '+i+';https://www.linkedin.com/in/lead-valid-'+i+'/\n';
  const prefix=Array.from({length:1700},(_,i)=>leadLine(i)).join('');
  assert.ok(Buffer.byteLength(prefix)>65536);
  const ending=Buffer.from('Jos\xe9 Silva;https://www.linkedin.com/in/jose-silva/\n','latin1');
  const bytes=Buffer.concat([Buffer.from(header+prefix,'ascii'),ending]);
  const out=await collect(fakeFile(bytes),{batchSize:200});
  assert.equal(out.summary.valid,1701);
  assert.equal(out.rows.at(-1).lead,'José Silva');
});
test('Arquivo acima de 100 MiB, cabeçalhos inválidos e CSV sem dados são recusados',async()=>{
  const tooBig={name:'huge.csv',size:CSV_MAX_BYTES+1,stream:()=>{throw Error('Não deveria ler')}};
  await assert.rejects(()=>importLinkedInCsvStream(tooBig,{onBatch:async()=>({})}),/100/);
  const unspecified=await collect(fakeFile('a;b\n1;2\n'));
  assert.equal(unspecified.summary.valid,0);
  assert.equal(unspecified.summary.invalidReasons.campo_sem_url,1);
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
  // File.stream() do navegador oferece um fluxo novo a cada abertura.
  // O fixture deve reproduzir essa característica para a detecção de charset
  // e a importação (duas passagens sem carregar o arquivo todo na memória).
  const file={name:'100m.csv',size:CSV_MAX_BYTES,stream:()=>{
    let position=0;
    return new ReadableStream({
      pull(controller){
        if(position===0)controller.enqueue(header);
        else if(position<=repeatedCount)controller.enqueue(repeated);
        else if(position===repeatedCount+1)controller.enqueue(tail);
        else {controller.close();return;}
        position++;
      }
    });
  }};
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
