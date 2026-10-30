/* P5b: verificador diferencial em modo sombra, sem substituir os indicadores.
   Carregar apenas em homologação. Nenhum dado sai do navegador. */
(function (global) {
 'use strict';
 function validar(carteira, contexto) {
   if (!global.IADIncremental) throw new Error('P5b: motor ausente');
   const motor=global.IADIncremental.criarEscopado(contexto);
   try {
     motor.reconstruir(carteira.resumos || []);
     const a=motor.resultado();
     const pares=[['qtd','qtd'],['valor','total'],['saudavel','saudavel'],['risco','emRisco'],['zumbi','zumbi']];
     const divergencias=pares.filter(function (p) {
       return Math.abs(a[p[0]]-carteira[p[1]]) > 0.000001;
     }).map(function (p) { return p[1]; });
     return { valido: divergencias.length===0, divergencias: divergencias, total: a.qtd };
   } finally { motor.revogar(); }
 }
 global.IADP5bShadow={validar:validar};
})(window);
