const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'../..');

const script = fs.readFileSync(path.join(root,'src/localidades.js'),'utf8');
const views = fs.readFileSync(path.join(root,'src/views.js'),'utf8');
const app = fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw = fs.readFileSync(path.join(root,'sw.js'),'utf8');

function criarAmbiente() {
  const armazenamento = {};
  const calls=[];
  let responder = async (url)=>({ok:true, json: async()=>[
    {id:3550308,nome:'São Paulo'}, {id:3549904,nome:'São José dos Campos'},
    {id:3509502,nome:'Campinas'}, {id:3551009,nome:'São Vicente'}
  ]});
  const ambiente = {
    window:{},
    localStorage:{getItem:(k)=>armazenamento[k]||null,setItem:(k,v)=>{armazenamento[k]=v;}},
    fetch: async (url)=>{calls.push(url);return responder(url);},
    AbortController, setTimeout, clearTimeout, URLSearchParams, Date
  };
  vm.runInNewContext(script,ambiente);
  return {api:ambiente.window.IADLocalidades,calls,
    alterarResposta(fn){responder=fn;}};
}

test('27 UFs (26 estados e DF) com nomes e siglas corretos',()=>{
 const {api} = criarAmbiente();
 const ufs=api.estados();
 assert.equal(ufs.length,27);
 assert.equal(new Set(ufs.map(x=>x.sigla)).size,27);
 assert.equal(ufs.find(x=>x.sigla==='DF').nome,'Distrito Federal');
 assert.equal(api.sigla('São Paulo'),'SP');
 assert.equal(api.sigla('sao paulo'),'SP');
 assert.equal(api.sigla('sp'),'SP');
 assert.equal(api.sigla('Maranhão'),'MA');
 assert.equal(api.sigla('Estado inventado'),'');
});
test('pesquisa por letras, acentos, siglas e início da expressão',()=>{
 const {api}=criarAmbiente();
 assert.equal(api.buscarEstados('sao')[0].sigla,'SP');
 assert.equal(api.buscarEstados('ma').some(x=>x.sigla==='MA'),true);
 assert.equal(api.buscarEstados('DF')[0].nome,'Distrito Federal');
 assert.equal(api.normalizar('São José  dos Campos'),'sao jose dos campos');
 assert.equal(api.buscar(['São Paulo','Santo André','São José dos Campos','João Pessoa'],
   'sao',10)[0],'São José dos Campos');
});
test('municípios obtidos do IBGE somente para a UF escolhida, com cache',async ()=>{
 const {api,calls}=criarAmbiente();
 const cities=await api.municipios('SP');
 assert.ok(cities.includes('São José dos Campos'));
 assert.ok(cities.includes('Campinas'));
 assert.equal(calls.length,1);
 assert.ok(calls[0].includes('/estados/SP/municipios?orderBy=nome'));
 const again=await api.municipios('São Paulo');
 assert.equal(calls.length,1);
 assert.equal(again.length,cities.length);
 assert.equal(api.buscar(cities,'sao jose',10)[0],'São José dos Campos');
});
test('não agrega município de outras UFs no fallback; tolera siglas',()=>{
 const {api}=criarAmbiente();
 const data=[
  {cidade:'São José dos Campos',uf:'SP'},
  {cidade:'Campinas',uf:'São Paulo'},
  {cidade:'Niterói',uf:'RJ'},
  {cidade:'',uf:'SP'},
  {cidade:'Campinas',uf:'sp'}
 ];
 assert.deepEqual(Array.from(api.fallback('SP',data)),['Campinas','São José dos Campos']);
});
test('oportunidades filtradas pela UF e cidade da CONTA, sem vazamento de outras empresas',()=>{
 const {api}=criarAmbiente();
 const begin=views.search(/  function passaNoFiltroPipeline\\(r, f(?:, usuarioAtual)?\\) \\{/);
 const end=views.indexOf('\n  function ordenarPipeline(',begin);
 assert.ok(begin>=0&&end>begin);
 const code=views.slice(begin,end)+'\nreturn passaNoFiltroPipeline;';
 const global={IADAuth:{atual:()=>({id:'user1'})},IADLocalidades:api};
 const filtro=new Function('global','Store','E','P',code)(
   global,{tarefasDaOportunidade:()=>[]},{},{IAD_MAXIMO:32});
 const f={responsavel:'todos',status:'todas',conta:'',segmento:'',etapa:'',origem:'',
   produto:'',sdr:'',busca:'',uf:'SP',municipio:'São José dos Campos',
   semTarefa:false,semCompromisso:false,esfriando:false,gateAberto:false,
   iadMin:'',iadMax:'',valorMin:'',valorMax:'',semEvidenciaDias:'',
   previsaoDe:'',previsaoAte:''};
 const r=(cidade,uf)=>({op:{valor:0,itens:[]},conta:{cidade,uf},
   iad:20,evidenceAge:0,faixa:{classe:'ok'}});
 assert.equal(filtro(r('Sao Jose dos Campos','São Paulo'),f),true);
 assert.equal(filtro(r('São Paulo','SP'),f),false);
 assert.equal(filtro(r('São José dos Campos','RJ'),f),false);
 assert.equal(filtro({...r('São José dos Campos','SP'),conta:null},f),false);
});
test('limpar UF também limpa município; controles no local correto e PWA atualizada',()=>{
 assert.ok(app.includes("V.pipelineFiltrar({uf:uf,municipio:''})"));
 assert.ok(app.includes("V.pipelineFiltrar({uf:'',municipio:''})"));
 assert.ok(views.includes("campoGeografico('uf', 'Estado / UF'"));
 assert.ok(views.includes("campoGeografico('municipio', 'Município'"));
 assert.ok(views.includes("if (f.uf &&"));
 assert.ok(views.includes("if (f.municipio &&"));
 assert.ok(html.includes('<script src="src/localidades.js"></script>'));
 assert.ok(sw.includes("'./src/localidades.js'"));
});
