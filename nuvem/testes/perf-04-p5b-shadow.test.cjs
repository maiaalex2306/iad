'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(){const window={};const ctx=vm.createContext({window});for(const p of ['src/incremental.js','src/p5b-shadow.js'])vm.runInContext(fs.readFileSync(p,'utf8'),ctx,{filename:p});return window;}
test('paridade dos KPIs no modo sombra, sem alterar fonte de verdade',()=>{
 const w=load(),contexto=()=>({usuarioId:'u1',tenantId:'a',revisao:1});
 const carteira={resumos:[{op:{id:'1',valor:100},classe:{id:'real'}},{op:{id:'2',valor:30},classe:{id:'zumbi'}}],qtd:2,total:130,saudavel:100,emRisco:0,zumbi:30};
 const original=JSON.stringify(carteira);
 const r=w.IADP5bShadow.validar(carteira,contexto);
 assert.equal(r.valido,true);assert.equal(JSON.stringify(carteira),original);
 carteira.total=131;
 const bad=w.IADP5bShadow.validar(carteira,contexto);
 assert.equal(bad.valido,false);assert.ok([...bad.divergencias].includes('total'));
});
