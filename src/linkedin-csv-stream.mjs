/* Importação progressiva de CSV até 100 MiB.
   Sem file.arrayBuffer() integral, sem construir um array gigante de perfis.
   Cada lote pode ser persistido em IndexedDB. Não faz requisições ao LinkedIn. */
import {columnsFromCsvHeader,csvLeadFromCells} from './linkedin-csv.mjs';

export const CSV_MAX_BYTES=100*1024*1024;
export const CSV_BATCH_SIZE=350;
const MAX_HEADER=64*1024;
const MAX_FIELD=20*1024;
function errAbort(){const e=new Error('Importação cancelada.');e.name='AbortError';return e;}
function separatorFor(header){
  const counts={',':0,';':0,'\t':0};
  let quoted=false;
  for(let i=0;i<header.length;i++){
    const c=header[i];
    if(c==='"'){
      if(quoted&&header[i+1]==='"'){i++;continue;}
      quoted=!quoted;
    }else if(!quoted&&Object.prototype.hasOwnProperty.call(counts,c))counts[c]++;
  }
  return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
}
function firstRecordEnd(text){
  let quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){i++;continue;}
      quoted=!quoted;
    }else if(!quoted&&(c==='\r'||c==='\n'))return i;
  }
  return -1;
}
function decoderFromFirstChunk(bytes,encoding){
  if(bytes[0]===0xff&&bytes[1]===0xfe)return {decoder:new TextDecoder('utf-16le',{fatal:true}),skip:2};
  if(bytes[0]===0xfe&&bytes[1]===0xff)return {decoder:new TextDecoder('utf-16be',{fatal:true}),skip:2};
  if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)
    return {decoder:new TextDecoder('utf-8',{fatal:true}),skip:3};
  return {decoder:new TextDecoder(encoding,{fatal:encoding==='utf-8'}),skip:0};
}
/* Detecta codificação ANTES de gravar quaisquer lotes. Evita CSV Windows-1252
   com cabeçalho ASCII e caracteres acentuados apenas no meio do arquivo.
   Realiza uma passagem sequencial leve, sem acumular bytes ou textos em RAM. */
async function detectCsvEncoding(file,signal){
  const reader=file.stream().getReader();
  const probe=new TextDecoder('utf-8',{fatal:true});
  let first=true;
  try{
    while(true){
      if(signal?.aborted)throw errAbort();
      const {done,value}=await reader.read();
      if(done)break;
      const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
      if(first){
        first=false;
        if(bytes[0]===0xff&&bytes[1]===0xfe)return 'utf-16le';
        if(bytes[0]===0xfe&&bytes[1]===0xff)return 'utf-16be';
      }
      try{probe.decode(bytes,{stream:true});}
      catch{return 'windows-1252';}
    }
    try{probe.decode();}catch{return 'windows-1252';}
    return 'utf-8';
  }finally{
    try{await reader.cancel();}catch{}
    reader.releaseLock();
  }
}
export async function importLinkedInCsvStream(file,{
  onBatch,onProgress=()=>{},signal,batchSize=CSV_BATCH_SIZE
}={}){
  if(!file||typeof file.stream!=='function'||typeof onBatch!=='function')
    throw new Error('Arquivo CSV e persistência por lotes obrigatórios.');
  if(!/\.csv$/i.test(file.name||''))throw new Error('Selecione um arquivo .csv.');
  if(file.size>CSV_MAX_BYTES)throw new Error('Arquivo maior que 100 MB. O limite é 100 MiB.');
  if(file.size===0)throw new Error('Arquivo CSV vazio.');
  const maxBatch=Math.max(50,Math.min(1000,Math.trunc(batchSize)||CSV_BATCH_SIZE));
  const encoding=await detectCsvEncoding(file,signal);
  if(signal?.aborted)throw errAbort();
  const reader=file.stream().getReader();
  let decoder,first=true,bytesRead=0,separator=null,headerProbe='';
  let quoted=false,afterQuote=false,skipLF=false,field='',record=[];
  let fields=null,recordIndex=0,invalid=0,duplicates=0,valid=0;
  let batch=[],problems=[],lastPercent=-1;
  function append(c){
    if(field.length>=MAX_FIELD)throw new Error('Campo CSV maior que 20 mil caracteres. Revise o formato.');
    field+=c;
  }
  function endField(){record.push(field);field='';}
  function endRecord(){
    endField();
    const cells=record;record=[];
    if(!cells.some(x=>x.trim()!==''))return;
    recordIndex++;
    if(recordIndex===1){
      fields=columnsFromCsvHeader(cells);
      return;
    }
    const lead=csvLeadFromCells(cells,fields,recordIndex);
    if(!lead){
      invalid++;
      if(problems.length<30)problems.push({line:recordIndex,reason:'URL de perfil LinkedIn inválida'});
      return;
    }
    batch.push(lead);
  }
  function consumeChar(ch){
    if(skipLF){skipLF=false;if(ch==='\n')return;}
    if(quoted){
      if(afterQuote){
        if(ch==='"'){append('"');afterQuote=false;return;}
        quoted=false;afterQuote=false;
      }else{
        if(ch==='"'){afterQuote=true;return;}
        append(ch);return;
      }
    }
    if(ch==='"'){
      if(field.trim())throw new Error('Aspas inválidas no CSV próximo ao registro '+(recordIndex+1)+'.');
      quoted=true;return;
    }
    if(ch===separator){endField();return;}
    if(ch==='\n'){endRecord();return;}
    if(ch==='\r'){endRecord();skipLF=true;return;}
    append(ch);
  }
  async function flush(){
    if(!batch.length)return;
    if(signal?.aborted)throw errAbort();
    const pending=batch;batch=[];
    const result=await onBatch(pending);
    valid+=Number(result?.inserted??pending.length);
    duplicates+=Number(result?.duplicates??0);
  }
  async function parse(text){
    if(!text)return;
    if(separator===null){
      headerProbe+=text;
      const end=firstRecordEnd(headerProbe);
      if(end<0){
        if(headerProbe.length>MAX_HEADER)throw new Error('Cabeçalho CSV ultrapassa 64 KB.');
        return;
      }
      separator=separatorFor(headerProbe.slice(0,end));
      text=headerProbe;headerProbe='';
    }
    for(let i=0;i<text.length;i++){
      if(signal?.aborted)throw errAbort();
      consumeChar(text[i]);
      if(batch.length>=maxBatch)await flush();
    }
  }
  try{
    while(true){
      if(signal?.aborted)throw errAbort();
      const {done,value}=await reader.read();
      if(done)break;
      const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
      bytesRead+=bytes.byteLength;
      let piece;
      if(first){
        first=false;
        const selected=decoderFromFirstChunk(bytes,encoding);
        decoder=selected.decoder;
        piece=decoder.decode(bytes.subarray(selected.skip),{stream:true});
      }else piece=decoder.decode(bytes,{stream:true});
      await parse(piece);
      const percent=Math.min(100,Math.floor(bytesRead/file.size*100));
      if(percent!==lastPercent){
        lastPercent=percent;
        onProgress({percent,bytesRead,totalBytes:file.size,valid,invalid,duplicates});
      }
    }
    if(!decoder)throw new Error('CSV não contém dados.');
    await parse(decoder.decode());
    if(separator===null){
      separator=separatorFor(headerProbe);
      await parse(headerProbe+'\n');
      headerProbe='';
    }
    if(quoted&&!afterQuote)throw new Error('CSV termina dentro de aspas abertas.');
    if(afterQuote){quoted=false;afterQuote=false;}
    if(field.length||record.length)endRecord();
    await flush();
    if(!fields)throw new Error('Cabeçalho do CSV ausente.');
    if(recordIndex<2)throw new Error('CSV sem linhas de leads.');
    onProgress({percent:100,bytesRead,totalBytes:file.size,valid,invalid,duplicates});
    return {summary:{total:recordIndex-1,valid,invalid,duplicates,separator,problems}};
  }catch(e){
    try{await reader.cancel();}catch{}
    throw e;
  }finally{reader.releaseLock();}
}
