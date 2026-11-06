import test from 'node:test';
import assert from 'node:assert/strict';
import {BWC_SECTOR_TAXONOMY,foldSector,interpretSector,sectorSearchVocabulary} from '../src/ri/sector-intelligence.mjs';
const BWC_LEGACY=['Açúcar, Etanol e Bioenergia','Agronegócio','Alimentos','Automotivo e Mobilidade','Bebidas','Celulose, Papel e Florestal','Farmacêutica e Cosméticos','Fertilizantes e Agroquímicos','Infraestrutura e Logística','Mineração','Óleo, Gás e Energia','Outros','Proteína Animal','Química e Petroquímica','Real Estate e Facilities','Saneamento','Saúde e Educação','Siderurgia e Metalurgia','Varejo e Grandes Redes'];
test('50 setores unicos, 19 categorias existentes preservadas, 31 especializacoes sem migracao silenciosa',()=>{
 assert.equal(BWC_SECTOR_TAXONOMY.length,50);
 assert.equal(new Set(BWC_SECTOR_TAXONOMY.map(x=>foldSector(x.name))).size,50);
 for(const old of BWC_LEGACY)assert.ok(BWC_SECTOR_TAXONOMY.some(x=>x.name===old&&!x.parent));
 assert.equal(BWC_SECTOR_TAXONOMY.filter(x=>x.parent).length,31);
 for(const x of BWC_SECTOR_TAXONOMY.filter(x=>x.parent))assert.ok(BWC_LEGACY.includes(x.parent));
});
test('diferencas de caixa, acento e pontuacao sao equivalentes',()=>{
 assert.equal(interpretSector(' QUIMICA e PETROQUIMICA ').canonical,'Química e Petroquímica');
 assert.equal(interpretSector('indústria química').canonical,'Química e Petroquímica');
 assert.equal(interpretSector('fabricacao de produtos quimicos').status,'alias');
});
test('aproximacoes retornam sugestoes, jamais classificacao automatica',()=>{
 const r=interpretSector('industria de tratamento e distribuicao de efluentes');
 assert.ok(['related','unmatched'].includes(r.status));
 assert.equal(r.canonical,undefined);
});
test('tenant sem a categoria nao recebe correspondencia de outro tenant',()=>{
 const allowed=['Alimentos','Saneamento'];
 assert.equal(interpretSector('industria quimica',{allowedNames:allowed}).canonical,undefined);
 assert.equal(interpretSector('Alimentos',{allowedNames:allowed}).status,'exact');
 assert.deepEqual(sectorSearchVocabulary('Química e Petroquímica',allowed),[]);
});
test('vocabulário de pesquisa usa apenas aliases da mesma categoria aprovada',()=>{
 const a=sectorSearchVocabulary('Química e Petroquímica',['Química e Petroquímica']);
 assert.ok(a.includes('industria quimica'));
 assert.ok(a.every(x=>!x.toLowerCase().includes('agroquimico')));
});
test('rótulos vagos ou inexistentes nao inventam categoria',()=>{
 for(const s of ['',null,'setor desconhecido com palavra impossivel'])assert.equal(interpretSector(s).canonical,undefined);
});
