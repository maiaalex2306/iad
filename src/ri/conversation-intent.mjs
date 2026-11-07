/* RI-08 — detector local de intencoes comerciais, sem chamadas de rede.
 * Nao e uma probabilidade de fechamento. Os sinais exigem revisao humana.
 * Somente falas do comprador podem gerar sinais de compra explicitos.
 */
const fold = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const short = (value, limit=600) => typeof value === 'string' ? value.trim().slice(0,limit) : '';
const negation = /\b(?:nao (?:tenho|temos|queremos|quero|precisamos|pretendemos|ha|existe|existe nenhuma|estamos buscando)|sem (?:interesse|demanda|necessidade|projeto)|projeto (?:cancelado|suspenso)|nao e (?:para mim|nosso foco)|retire (?:me|meu contato)|pare de (?:enviar|mandar))\b/;
const courtesy = /^(?:bom dia|boa tarde|boa noite|obrigad[oa](?: pelo contato)?|agradec(?:o|emos)(?: o contato)?|ok|tudo bem|legal|perfeito|valeu)[.! ]*$/;
const rules = [
 {id:'pedido_proposta',priority:100,label:'Pedido de proposta ou orçamento',re:/\b(?:envie|enviar|mande|mandar|preciso|precisamos|gostaria|quero|solicito|solicitamos|podem enviar|pode enviar|poderia enviar|cotem|cotar)\b.{0,75}\b(?:proposta|orcamento|cotacao|precos?)\b|\b(?:proposta|orcamento|cotacao)\b.{0,35}\b(?:enviar|solicitar|preciso|queremos|pedir)\b/,action:'Confirmar escopo, requisitos e prazo antes de elaborar a proposta.'},
 {id:'reuniao',priority:95,label:'Solicitação de conversa ou reunião',re:/\b(?:podemos|poderiamos|vamos|gostaria|quero|preciso|podem|consegue)\b.{0,55}\b(?:conversar|reuniao|agendar|marcar uma conversa|apresentacao|call)\b|\b(?:agendar|marcar)\b.{0,40}\b(?:reuniao|conversa|visita)\b/,action:'Propor o próximo contato e preparar as perguntas de descoberta.'},
 {id:'modernizacao_ete',priority:90,label:'Projeto ou necessidade em ETE',re:/\b(?:moderniz|melhorar|reform|ampli|automatiz|problema|dificuldade|projeto|precis|implant|adequar)\w*.{0,75}\b(?:ete|estacao de tratamento|efluentes?)\b|\b(?:ete|efluentes?)\b.{0,70}\b(?:moderniz|melhorar|reform|ampli|automatiz|problema|dificuldade|projeto|precis|implant|adequar)\w*/,action:'Validar estágio do projeto, parâmetros, escopo técnico e responsáveis.'},
 {id:'consumo_agua',priority:88,label:'Necessidade relacionada ao consumo de água',re:/\b(?:reduz|diminu|control|monitor|medir|economiz)\w*.{0,75}\b(?:consumo|agua|perdas?|desperdicio)\b|\b(?:conta de agua|consumo de agua|consumo hidrico)\b.{0,65}\b(?:aument|alto|elevad|cresc|descontrole|perda|problema)\w*/,action:'Investigar medições, pontos de consumo e causas de perdas antes de propor soluções.'},
 {id:'reuso',priority:85,label:'Projeto ou necessidade de reúso',re:/\b(?:reuso|reutiliz|aproveitamento de agua)\b.{0,65}\b(?:projeto|precis|estud|implant|avali|interess|quer|planej)\w*|\b(?:projeto|precis|estud|implant|avali|quer)\w*.{0,65}\b(?:reuso|reutiliz)\b/,action:'Verificar origem, qualidade requerida, uso final e viabilidade técnica.'},
 {id:'expansao',priority:82,label:'Ampliação da operação mencionada',re:/\b(?:estamos|vamos|planejamos|projeto de|pretendemos|iniciamos)\b.{0,55}\b(?:ampliar|expansao|ampliacao|nova fabrica|nova planta|nova unidade|aumento de capacidade)\b|\b(?:ampliando|expandindo|nova fabrica|nova planta|nova unidade)\b/,action:'Identificar projeto, unidade, investimentos e cronograma para avaliar aderência.'},
 {id:'problema',priority:80,label:'Problema operacional relatado',re:/\b(?:estamos com|temos|enfrentamos|enfrentando|nossa|nosso)\b.{0,80}\b(?:problemas?|dificuldades?|falhas?|retrabalho|ineficiencia|manual(?:mente)?)\b|\b(?:sistema atual|fornecedor atual)\b.{0,50}\b(?:problemas?|falhas?|insatisf|nao atende)\b/,action:'Confirmar impacto operacional, frequência e custo do problema.'},
 {id:'custos',priority:77,label:'Redução de custos em avaliação',re:/\b(?:reduzir|diminuir|economizar|otimizar|controlar)\b.{0,70}\b(?:custos?|despesas?|gastos?)\b|\b(?:custos?|despesas?|gastos?)\b.{0,60}\b(?:aument|elevad|alto|reduz|diminu)\w*/,action:'Qualificar os custos relevantes, causas e potencial econômico.'},
 {id:'interesse_solucoes',priority:72,label:'Interesse explícito em conhecer soluções',re:/\b(?:quero|queremos|gostaria|gostariamos|preciso|precisamos|interesse|interessad[oa]s?|podem|pode)\b.{0,65}\b(?:conhecer|entender|saber mais|apresentar|mostrar)\b.{0,65}\b(?:soluc|servic|produto|sistema|voce|voces)\w*|\b(?:quero|queremos|gostaria|gostariamos|interesse)\b.{0,65}\b(?:solucoes|servicos|produtos)\b/,action:'Responder rapidamente e perguntar qual necessidade motivou o interesse.'},
 {id:'decisao',priority:65,label:'Decisão ou aprovação mencionada',re:/\b(?:aguardando aprovacao|aprovacao (?:da|de|do) (?:diretoria|investimento|orcamento)|diretoria pediu|comite de investimento|avaliando (?:a|o) proposta)\b/,action:'Identificar os critérios, decisores e próximos marcos de aprovação.'},
 {id:'futuro',priority:50,label:'Possível demanda futura',re:/\b(?:proximo semestre|proximo ano|ano que vem|mais para frente|final do ano|planejamento do ano|semestre que vem)\b/,action:'Validar quando o projeto será reavaliado e propor acompanhamento.'}
];
const topicRules=[
 ['agua',/\b(?:agua|hidric|consumo|reservatorio|poco|vazao|perdas?)\b/],
 ['ete',/\b(?:ete|efluente|tratamento de esgoto|estacao de tratamento)\b/],
 ['reuso',/\b(?:reuso|reutiliz|aproveitamento)\w*/],
 ['automacao',/\b(?:automatiz|telemetria|sensor|monitoramento|manual(?:mente)?)\w*/],
 ['custos',/\b(?:custos?|despesas?|economia|gastos?)\b/]
];
export const INTENT_KINDS=Object.freeze(rules.map(r=>r.id));
const topics=normal=>topicRules.filter(([,rx])=>rx.test(normal)).map(([id])=>id);
function fragments(text){
 return short(text,1600).split(/(?:\r?\n|(?<=[.!?;])\s+)/).map(s=>s.trim()).filter(Boolean).slice(0,18);
}
export function detectCommercialIntents(text,{sellerContext='',max=6}={}){
 const signals=[];const seen=new Set();
 for(const sentence of fragments(text)){
  const normalized=fold(sentence);
  if(!normalized || courtesy.test(normalized) || negation.test(normalized))continue;
  for(const rule of rules){
   if(!rule.re.test(normalized))continue;
   const key=rule.id;
   if(seen.has(key))continue;
   seen.add(key);
   signals.push({type:rule.id,headline:rule.label,evidence:short(sentence,260),
    action:rule.action,priority:rule.priority,topics:topics(normalized),source:'regra_local'});
  }
  if(!signals.length && /\b(?:sim|pode enviar|pode mandar|vamos conversar)\b/.test(normalized)
    && /\b(?:soluc|reuniao|convers|apresentacao|material)\w*/.test(fold(sellerContext))){
   signals.push({type:'aceite_contextual',headline:'Resposta contextual a uma abordagem',
    evidence:short(sentence,260),action:'Confirmar qual assunto despertou interesse.',
    priority:52,topics:[],source:'regra_local'});seen.add('aceite_contextual');
  }
 }
 return signals.sort((a,b)=>b.priority-a.priority).slice(0,Math.max(1,Math.min(6,max)));
}
export function validateAiIntents(items,buyerMessages){
 if(!Array.isArray(items)||!Array.isArray(buyerMessages))return [];
 const originals=buyerMessages.filter(m=>typeof m==='string').map(s=>short(s,1200));
 const results=[];const seen=new Set();
 for(const raw of items.slice(0,6)){
  if(!raw||typeof raw!=='object'||!INTENT_KINDS.includes(raw.type))continue;
  const excerpt=short(raw.evidence,220);
  if(!excerpt||!originals.some(s=>fold(s).includes(fold(excerpt))))continue;
  if(negation.test(fold(excerpt)))continue;
  const key=raw.type+'|'+fold(excerpt);
  if(seen.has(key))continue;seen.add(key);
  const rule=rules.find(r=>r.id===raw.type);
  results.push({type:rule.id,headline:rule.label,evidence:excerpt,action:rule.action,
   priority:rule.priority,topics:topics(fold(excerpt)),source:'ia_validada',status:'hipotese'});
 }
 return results.slice(0,4);
}
/* Transcricoes historicas armazenam as duas pontas. So extrair mensagens cujo
 * autor e identificavel e NAO corresponde a SDR; em caso de duvida, ignorar.
 */
export function buyerMessagesFromTranscript(detail,sdrName=''){
 const sdr=fold(sdrName);if(!sdr)return [];
 const result=[];
 for(const line of String(detail||'').split(/\r?\n/).slice(0,80)){
  const m=/^(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\s*[·\-]\s*([^:]{2,100}):\s*(.+)$/.exec(line.trim());
  if(!m)continue;
  const author=fold(m[1]);
  if(author===sdr||author.includes(sdr)||sdr.includes(author)||author==='sdr')continue;
  result.push({author:m[1].trim(),text:m[2].trim()});
 }
 return result.slice(0,40);
}
