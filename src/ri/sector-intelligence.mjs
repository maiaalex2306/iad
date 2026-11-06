/* RI-M14: taxonomia BWC versionada, sem side effects e sem acesso ao banco.
 * 19 categorias legadas preservadas e 31 especializações candidatas.
 * A proximidade semântica nunca autoriza segmento, altera registros ou importa leads.
 * Tier é hipótese comercial (1 alto, 2 médio, 3 exploratório), não ranking estatístico.
 */
export const BWC_SECTOR_TAXONOMY = Object.freeze([
  {
    "name": "Açúcar, Etanol e Bioenergia",
    "parent": null,
    "tier": 1,
    "aliases": [
      "setor sucroenergetico",
      "usinas de acucar e alcool"
    ]
  },
  {
    "name": "Agronegócio",
    "parent": null,
    "tier": 2,
    "aliases": [
      "agro",
      "agricultura empresarial"
    ]
  },
  {
    "name": "Alimentos",
    "parent": null,
    "tier": 1,
    "aliases": [
      "industria alimenticia",
      "fabricacao de alimentos"
    ]
  },
  {
    "name": "Automotivo e Mobilidade",
    "parent": null,
    "tier": 2,
    "aliases": [
      "industria automobilistica",
      "montadoras"
    ]
  },
  {
    "name": "Bebidas",
    "parent": null,
    "tier": 1,
    "aliases": [
      "industria de bebidas"
    ]
  },
  {
    "name": "Celulose, Papel e Florestal",
    "parent": null,
    "tier": 1,
    "aliases": [
      "papel e celulose",
      "industria papeleira"
    ]
  },
  {
    "name": "Farmacêutica e Cosméticos",
    "parent": null,
    "tier": 1,
    "aliases": [
      "farmaceutica",
      "industria farmaceutica"
    ]
  },
  {
    "name": "Fertilizantes e Agroquímicos",
    "parent": null,
    "tier": 1,
    "aliases": [
      "adubos e fertilizantes",
      "industria de fertilizantes"
    ]
  },
  {
    "name": "Infraestrutura e Logística",
    "parent": null,
    "tier": 2,
    "aliases": [
      "infraestrutura logistica"
    ]
  },
  {
    "name": "Mineração",
    "parent": null,
    "tier": 1,
    "aliases": [
      "industria extrativa mineral"
    ]
  },
  {
    "name": "Óleo, Gás e Energia",
    "parent": null,
    "tier": 1,
    "aliases": [
      "petroleo gas e energia"
    ]
  },
  {
    "name": "Outros",
    "parent": null,
    "tier": 3,
    "aliases": []
  },
  {
    "name": "Proteína Animal",
    "parent": null,
    "tier": 1,
    "aliases": [
      "industria frigorifica",
      "processamento de carne"
    ]
  },
  {
    "name": "Química e Petroquímica",
    "parent": null,
    "tier": 1,
    "aliases": [
      "industria quimica",
      "fabricacao de produtos quimicos"
    ]
  },
  {
    "name": "Real Estate e Facilities",
    "parent": null,
    "tier": 2,
    "aliases": [
      "gestao predial",
      "facilities"
    ]
  },
  {
    "name": "Saneamento",
    "parent": null,
    "tier": 1,
    "aliases": [
      "servicos de saneamento",
      "agua e esgoto"
    ]
  },
  {
    "name": "Saúde e Educação",
    "parent": null,
    "tier": 2,
    "aliases": [
      "servicos de saude e educacao"
    ]
  },
  {
    "name": "Siderurgia e Metalurgia",
    "parent": null,
    "tier": 1,
    "aliases": [
      "industria siderurgica",
      "metalurgia"
    ]
  },
  {
    "name": "Varejo e Grandes Redes",
    "parent": null,
    "tier": 3,
    "aliases": [
      "grandes redes varejistas"
    ]
  },
  {
    "name": "Indústria de Laticínios",
    "parent": "Alimentos",
    "tier": 1,
    "aliases": [
      "laticinios",
      "industria leiteira"
    ]
  },
  {
    "name": "Frigoríficos e Abatedouros",
    "parent": "Proteína Animal",
    "tier": 1,
    "aliases": [
      "abatedouro",
      "frigorifico de bovinos",
      "frigorifico de aves"
    ]
  },
  {
    "name": "Processamento de Grãos e Óleos Vegetais",
    "parent": "Alimentos",
    "tier": 1,
    "aliases": [
      "esmagamento de soja",
      "oleos vegetais",
      "processamento de graos"
    ]
  },
  {
    "name": "Indústria de Panificação e Massas",
    "parent": "Alimentos",
    "tier": 2,
    "aliases": [
      "industria de massas",
      "panificacao industrial"
    ]
  },
  {
    "name": "Indústria de Bebidas Não Alcoólicas",
    "parent": "Bebidas",
    "tier": 1,
    "aliases": [
      "refrigerantes",
      "fabricacao de sucos"
    ]
  },
  {
    "name": "Cervejarias e Destilarias",
    "parent": "Bebidas",
    "tier": 1,
    "aliases": [
      "cervejaria industrial",
      "destilaria"
    ]
  },
  {
    "name": "Usinas de Açúcar e Etanol",
    "parent": "Açúcar, Etanol e Bioenergia",
    "tier": 1,
    "aliases": [
      "usina sucroalcooleira",
      "usina de etanol"
    ]
  },
  {
    "name": "Indústria de Papel e Embalagens",
    "parent": "Celulose, Papel e Florestal",
    "tier": 1,
    "aliases": [
      "papel e papelao",
      "fabricacao de embalagens de papel"
    ]
  },
  {
    "name": "Indústria de Celulose",
    "parent": "Celulose, Papel e Florestal",
    "tier": 1,
    "aliases": [
      "fabricacao de celulose",
      "fabrica de pasta celulosica"
    ]
  },
  {
    "name": "Indústria Têxtil",
    "parent": "Outros",
    "tier": 2,
    "aliases": [
      "industria textil",
      "beneficiamento textil"
    ]
  },
  {
    "name": "Lavanderias Industriais",
    "parent": "Outros",
    "tier": 1,
    "aliases": [
      "lavanderia industrial",
      "lavagem industrial de uniformes"
    ]
  },
  {
    "name": "Curtumes e Artefatos de Couro",
    "parent": "Outros",
    "tier": 1,
    "aliases": [
      "curtume",
      "curtimento de couro"
    ]
  },
  {
    "name": "Indústria de Plásticos e Resinas",
    "parent": "Química e Petroquímica",
    "tier": 1,
    "aliases": [
      "fabricacao de resinas",
      "industria de plasticos"
    ]
  },
  {
    "name": "Indústria de Borracha e Pneus",
    "parent": "Automotivo e Mobilidade",
    "tier": 2,
    "aliases": [
      "fabricacao de pneus",
      "industria de borracha"
    ]
  },
  {
    "name": "Indústria de Tintas e Revestimentos",
    "parent": "Química e Petroquímica",
    "tier": 1,
    "aliases": [
      "fabricacao de tintas",
      "industria de revestimentos"
    ]
  },
  {
    "name": "Indústria de Produtos de Limpeza e Saneantes",
    "parent": "Química e Petroquímica",
    "tier": 1,
    "aliases": [
      "saneantes",
      "fabricacao de detergentes"
    ]
  },
  {
    "name": "Indústria de Vidro e Cerâmica",
    "parent": "Outros",
    "tier": 2,
    "aliases": [
      "fabricacao de vidro",
      "industria ceramica"
    ]
  },
  {
    "name": "Indústria de Cimento e Concreto",
    "parent": "Outros",
    "tier": 2,
    "aliases": [
      "industria cimenteira",
      "fabricacao de concreto"
    ]
  },
  {
    "name": "Indústria de Máquinas e Equipamentos",
    "parent": "Infraestrutura e Logística",
    "tier": 2,
    "aliases": [
      "fabricacao de maquinas",
      "equipamentos industriais"
    ]
  },
  {
    "name": "Indústria Eletroeletrônica",
    "parent": "Outros",
    "tier": 2,
    "aliases": [
      "fabricacao de eletronicos",
      "industria eletroeletronica"
    ]
  },
  {
    "name": "Indústria Metal-Mecânica",
    "parent": "Siderurgia e Metalurgia",
    "tier": 2,
    "aliases": [
      "metal mecanica",
      "usinagem industrial"
    ]
  },
  {
    "name": "Tratamento de Água para Abastecimento",
    "parent": "Saneamento",
    "tier": 1,
    "aliases": [
      "estacao de tratamento de agua",
      "operadora de eta"
    ]
  },
  {
    "name": "Tratamento de Esgotos e Efluentes",
    "parent": "Saneamento",
    "tier": 1,
    "aliases": [
      "estacao de tratamento de esgoto",
      "operadora de ete"
    ]
  },
  {
    "name": "Gestão e Reúso de Água Industrial",
    "parent": "Saneamento",
    "tier": 1,
    "aliases": [
      "reuso de agua industrial",
      "gestao de agua industrial"
    ]
  },
  {
    "name": "Hospitais e Redes Hospitalares",
    "parent": "Saúde e Educação",
    "tier": 2,
    "aliases": [
      "hospital",
      "rede hospitalar"
    ]
  },
  {
    "name": "Hotéis e Resorts",
    "parent": "Real Estate e Facilities",
    "tier": 2,
    "aliases": [
      "hotelaria",
      "resorts"
    ]
  },
  {
    "name": "Shopping Centers e Centros Comerciais",
    "parent": "Real Estate e Facilities",
    "tier": 2,
    "aliases": [
      "shopping center",
      "centro comercial"
    ]
  },
  {
    "name": "Condomínios Residenciais e Comerciais",
    "parent": "Real Estate e Facilities",
    "tier": 2,
    "aliases": [
      "condominio residencial",
      "condominio comercial"
    ]
  },
  {
    "name": "Centros Logísticos e Armazéns",
    "parent": "Infraestrutura e Logística",
    "tier": 2,
    "aliases": [
      "centro logistico",
      "armazem logistico"
    ]
  },
  {
    "name": "Portos, Terminais e Aeroportos",
    "parent": "Infraestrutura e Logística",
    "tier": 2,
    "aliases": [
      "terminal portuario",
      "porto",
      "terminal aeroportuario"
    ]
  },
  {
    "name": "Data Centers",
    "parent": "Infraestrutura e Logística",
    "tier": 2,
    "aliases": [
      "data center",
      "centro de processamento de dados"
    ]
  }
].map(x=>Object.freeze({...x,aliases:Object.freeze(x.aliases)})));
export const foldSector = raw => String(raw??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/&/g,' e ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const tokens = raw => new Set(foldSector(raw).split(' ').filter(x=>x.length>2&&!['para','com','dos','das','por','industria','industrial','industriais','fabricacao','produtos'].includes(x)));
const similarity=(a,b)=>{const ta=tokens(a),tb=tokens(b);if(!ta.size||!tb.size)return 0;let common=0;for(const t of ta)if(tb.has(t))common++;return common/(ta.size+tb.size-common);};
const byName=new Map(BWC_SECTOR_TAXONOMY.map(x=>[foldSector(x.name),x]));
if(byName.size!==50)throw Error('Taxonomia duplicada ou incompleta');
/** 
 * Exact/alias: relação conhecida, mas só o nome canônico autorizado no tenant
 * pode ser utilizado numa pesquisa. Related/ambiguous: somente sugestão humana.
 */
export function interpretSector(raw,{allowedNames=null,limit=5}={}){
  const input=foldSector(raw);
  if(!input)return {status:'unmatched',candidates:[]};
  const allowed=allowedNames===null?null:new Set(allowedNames.map(foldSector));
  const visible=BWC_SECTOR_TAXONOMY.filter(x=>!allowed||allowed.has(foldSector(x.name)));
  const direct=visible.filter(x=>foldSector(x.name)===input);
  if(direct.length===1)return {status:'exact',canonical:direct[0].name,candidates:[{name:direct[0].name,relation:'exact',score:1}]};
  const aliases=visible.filter(x=>x.aliases.some(a=>foldSector(a)===input));
  if(aliases.length===1)return {status:'alias',canonical:aliases[0].name,candidates:[{name:aliases[0].name,relation:'alias',score:1}]};
  if(aliases.length>1)return {status:'ambiguous',candidates:aliases.map(x=>({name:x.name,relation:'alias',score:1}))};
  const candidates=visible.map(x=>{
    const own=similarity(raw,x.name),syn=Math.max(0,...x.aliases.map(a=>similarity(raw,a)));
    const score=Math.max(own,syn);
    return {name:x.name,parent:x.parent,relation:'related',score:+score.toFixed(3)};
  }).filter(x=>x.score>=0.34).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'pt-BR')).slice(0,Math.max(1,Math.min(10,limit)));
  return {status:candidates.length?'related':'unmatched',candidates};
}
/** Expandir só termos aprovados da mesma categoria. Nunca incluir filhos/irmãos automaticamente. */
export function sectorSearchVocabulary(canonical,allowedNames=[]){
 const allowed=new Set(allowedNames.map(foldSector));
 const x=byName.get(foldSector(canonical));
 if(!x||!allowed.has(foldSector(x.name)))return [];
 return [x.name,...x.aliases];
}
