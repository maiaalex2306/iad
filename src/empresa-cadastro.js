/* RI-47 — Cadastro empresarial verificável.
 * Consultas exclusivamente após clique explícito: CNPJ (BrasilAPI) e CEP (ViaCEP).
 * Nenhum dado sugerido substitui campo já preenchido; o operador confirma e edita.
 * Sem credenciais, armazenamento paralelo, ou mistura com telefones de contatos.
 */
(function(global){
 'use strict';
 const digits=v=>String(v??'').replace(/\D/g,'');
 const lettersAndDigits=v=>String(v??'').toUpperCase().replace(/[^0-9A-Z]/g,'');
 const short=(v,max=160)=>String(v??'').trim().slice(0,max);
 const supported=['cnpj','nome','razaoSocial','cep','logradouro','numero','complemento','bairro','cidade','uf','codigoIbge','telefone'];
 function validarCnpj(v){
  const x=lettersAndDigits(v);
  if(!/^[A-Z0-9]{12}[0-9]{2}$/.test(x)||/^([0-9A-Z])\1{12}/.test(x))return '';
  const dig=(base,pesos)=>{const resto=[...base].reduce((s,c,i)=>s+(c.charCodeAt(0)-48)*pesos[i],0)%11;return resto<2?'0':String(11-resto)};
  return x[12]===dig(x.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]) &&
   x[13]===dig(x.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2])?x:'';
 }
 function validarCep(v){const x=digits(v);return x.length===8?x:'';}
 function telefoneBrasil(v){
  const x=digits(v);
  if(x.length===12||x.length===13){return x.startsWith('55')?x.slice(2):'';}
  return x.length===10||x.length===11?x:'';
 }
 function cnpjParaCampos(d){
  if(!d||typeof d!=='object'||d.cnpj===undefined)throw Error('Resposta cadastral inválida.');
  return {
   cnpj:validarCnpj(d.cnpj),nome:short(d.nome_fantasia||d.fantasia),
   razaoSocial:short(d.razao_social,250),
   cep:validarCep(d.cep),logradouro:short(d.logradouro,200),
   numero:short(d.numero,40),complemento:short(d.complemento,140),
   bairro:short(d.bairro,140),cidade:short(d.municipio,120),
   uf:short(d.uf,2).toUpperCase(),
   telefone:telefoneBrasil(d.ddd_telefone_1)||telefoneBrasil(d.ddd_telefone_2)
  };
 }
 function cepParaCampos(d){
  if(!d||typeof d!=='object'||d.erro)throw Error('CEP não encontrado.');
  return {
   cep:validarCep(d.cep),logradouro:short(d.logradouro,200),
   bairro:short(d.bairro,140),cidade:short(d.localidade,120),
   uf:short(d.uf,2).toUpperCase(),codigoIbge:digits(d.ibge).slice(0,7)
  };
 }
 function normalizeForCompare(key,v){
  if(key==='cnpj')return lettersAndDigits(v);
  if(key==='cep'||key==='telefone')return digits(v);
  return short(v,250).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 }
 function compararCampos(current,proposta){
  const preencher=[],conflitos=[];
  for(const key of supported){
   const incoming=short(proposta[key]);
   if(!incoming)continue;
   const existing=short(current[key]);
   if(!existing)preencher.push({key,value:incoming});
   else if(normalizeForCompare(key,existing)!==normalizeForCompare(key,incoming))
    conflitos.push({key,local:existing,proposto:incoming});
  }
  return {preencher,conflitos};
 }
 function camposDialogo(dlg){
  const d={};
  for(const key of supported){
   const input=dlg.querySelector('[name="'+key+'"]');
   if(input)d[key]=input.value;
  }
  return d;
 }
 function aplicarProposta(dlg,proposta,fonte){
  if(!dlg||!dlg.isConnected)return {aplicados:0,conflitos:[]};
  const diff=compararCampos(camposDialogo(dlg),proposta);
  const resumo=diff.preencher.length?diff.preencher.map(x=>x.key+': '+x.value).join('\n'):'Nenhum campo vazio a preencher.';
  const confl=diff.conflitos.length?'\n\nCampos divergentes (NÃO serão substituídos):\n'+
   diff.conflitos.map(x=>x.key+': CRM "'+x.local+'" / fonte "'+x.proposto+'"').join('\n'):'';
  if(!diff.preencher.length){global.alert('Consulta concluída. '+resumo+confl);return {aplicados:0,conflitos:diff.conflitos};}
  if(!global.confirm('Dados sugeridos por '+fonte.nome+' (fonte externa):\n\n'+resumo+confl+
   '\n\nPreencher SOMENTE os campos vazios? Confira antes de salvar.'))
   return {aplicados:0,conflitos:diff.conflitos};
  const origem=Object.assign({},dlg.empresaFontes||{});
  let escritos=0;
  for(const x of diff.preencher){
   const el=dlg.querySelector('[name="'+x.key+'"]');
   if(!el||el.value.trim())continue;
   el.value=x.value;
   el.dispatchEvent(new Event('input',{bubbles:true}));
   origem[x.key]={provedor:fonte.nome,consultadoEm:new Date().toISOString(),
    url:fonte.url,status:'confirmado_pelo_operador'};
   escritos++;
  }
  dlg.empresaFontes=origem;
  return {aplicados:escritos,conflitos:diff.conflitos};
 }
 async function consultar(url){
  const ac=new AbortController(),t=setTimeout(()=>ac.abort(),12000);
  try{
   const r=await global.fetch(url,{method:'GET',signal:ac.signal,headers:{Accept:'application/json'}});
   if(!r.ok)throw Error('Provedor indisponível (HTTP '+r.status+').');
   return await r.json();
  }finally{clearTimeout(t);}
 }
 function extras(){
  return [
   {rotulo:'Consultar CNPJ',classe:'ghost',acao:dlg=>{
     const valor=dlg.querySelector('[name="cnpj"]')?.value||'';
     const cnpj=validarCnpj(valor);
     if(!cnpj){global.alert('Informe um CNPJ válido para consultar. Nunca atribuímos CNPJ por semelhança do nome.');return false;}
     consultar('https://brasilapi.com.br/api/cnpj/v1/'+encodeURIComponent(cnpj))
      .then(d=>{const dados=cnpjParaCampos(d);if(dados.cnpj!==cnpj)throw Error('CNPJ devolvido não corresponde ao solicitado.');return aplicarProposta(dlg,dados,{nome:'BrasilAPI',url:'https://brasilapi.com.br/api/cnpj/v1/'+cnpj});})
      .catch(e=>{if(dlg.isConnected)global.alert('Consulta CNPJ: '+e.message);});
     return false;
   }},
   {rotulo:'Consultar CEP',classe:'ghost',acao:dlg=>{
     const cep=validarCep(dlg.querySelector('[name="cep"]')?.value||'');
     if(!cep){global.alert('Informe CEP de 8 dígitos.');return false;}
     consultar('https://viacep.com.br/ws/'+cep+'/json/')
      .then(d=>aplicarProposta(dlg,cepParaCampos(d),{nome:'ViaCEP',url:'https://viacep.com.br/ws/'+cep+'/json/'}))
      .catch(e=>{if(dlg.isConnected)global.alert('Consulta CEP: '+e.message);});
     return false;
   }},
   {rotulo:'Origens dos dados',classe:'ghost',acao:dlg=>{
     const registro=dlg.empresaFontes||{};
     const linhas=Object.entries(registro).filter(([campo,v])=>v&&typeof v==='object')
       .map(([campo,v])=>campo+': '+short(v.provedor||'Fonte não identificada',80)+
        ' · '+short(v.status||'a conferir',60)+
        (v.consultadoEm?' · '+String(v.consultadoEm).slice(0,10):''));
     global.alert(linhas.length?linhas.join('\\n'):'Esta conta ainda não possui fontes rastreadas nos campos cadastrais.');
     return false;
   }}
  ];
 }
 function validarDialogo(dlg,contas,idAtual=''){
  const cnpj=dlg.querySelector('[name="cnpj"]'),cep=dlg.querySelector('[name="cep"]');
  const uf=dlg.querySelector('[name="uf"]');
  const telefone=dlg.querySelector('[name="telefone"]');
  if(cnpj&&cnpj.value.trim()){
   const v=validarCnpj(cnpj.value);
   if(!v)throw Error('CNPJ inválido. Revise antes de salvar.');
   const duplicate=(contas||[]).find(c=>c&&c.id!==idAtual&&validarCnpj(c.cnpj)===v);
   if(duplicate)throw Error('Este CNPJ já está associado à conta '+short(duplicate.nome)+'. Revise a duplicidade antes de salvar.');
   cnpj.value=v;
  }
  if(cep&&cep.value.trim()){
   const v=validarCep(cep.value);
   if(!v)throw Error('CEP deve ter 8 dígitos.');cep.value=v;
  }
  if(uf&&uf.value.trim()){
   const v=uf.value.trim().toUpperCase();
   if(!/^[A-Z]{2}$/.test(v))throw Error('UF deve ter duas letras.');
   uf.value=v;
  }
  if(telefone&&telefone.value.trim()){
   /* Não inventar DDD; números internacionais ficam disponíveis para edição. */
   telefone.value=short(telefone.value,50);
  }
  return true;
 }
 function ligarAoFormulario(dlg,contas,idAtual=''){
  const anterior=(contas||[]).find(c=>c&&c.id===idAtual);
  if(anterior?.fontesCadastro&&typeof anterior.fontesCadastro==='object')
    dlg.empresaFontes=Object.assign({},anterior.fontesCadastro);
  dlg.addEventListener('submit',e=>{
   if(e.submitter?.value!=='ok')return;
   try{validarDialogo(dlg,contas,idAtual);}
   catch(err){e.preventDefault();global.alert(err.message);}
  },true);
 }
 global.IADEmpresaCadastro={
  validarCnpj,validarCep,telefoneBrasil,cnpjParaCampos,cepParaCampos,
  compararCampos,aplicarProposta,consultar,extras,ligarAoFormulario
 };
})(window);
