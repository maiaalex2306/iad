/* RI-M06 — seis etapas auditáveis de triagem de resultados EXTERNOS.
 * Isto NÃO cria 6 chamadas adicionais a LLM nem comprova sinais de compra.
 * Dados consumidos: resultados já normalizados de OpenAI/Claude; nenhum write,
 * network request, enriquecimento oculto ou mutação de Store.
 */
import {normalizeCnpj,proposePipelineAction,isReviewableSourceURL} from './market-contract.mjs';

const text=v=>typeof v==='string'?v.trim():'';
const roles=/\b(diretor[ae]?|diretoria|gerente|presidente|ceo|cfo|cto|coo|head|vp|vice.presidente|superintendente|sóci[oa]|soci[oa]|gestor[ae]?)\b/i;
const icpFields=['municipio','ddd','segmento','funcionarios'];
const stage=(id,name,count,note)=>Object.freeze({id,name,count,note});

/**
 * Classificação interna da pesquisa de Mercado; nunca modelo de intenção,
 * probabilidade de venda ou validação oficial de identidade/contato.
 * @param {object} ctx snapshot de CRM autorizado apenas para evitar duplicações.
 */
export function buildProspectWorkflow({companies,snapshot,scope}={}){
 if(!Array.isArray(companies)||companies.length>50||!snapshot||
    !Array.isArray(snapshot.contas)||!Array.isArray(snapshot.oportunidades)||
    !text(scope?.tenantId)||!text(scope?.userId))
   throw Error('Resultados e sessão autorizada de Inteligência de Mercado são obrigatórios');
 const candidates=[];
 for(const company of companies){
  if(!company||typeof company!=='object')continue;
  const action=proposePipelineAction(company,snapshot,{tenantId:scope.tenantId,userId:scope.userId});
  const sources=(Array.isArray(company.fontes)?company.fontes:[])
   .filter(f=>isReviewableSourceURL(f?.url)).slice(0,15);
  const sourceURLs=new Set(sources.map(f=>f.url));
  // Validar DV não garante associação real CNPJ/razão social.
  const cnpj=normalizeCnpj(company.cnpj);
  const conflicted=Array.isArray(company.conflitos)&&company.conflitos.length>0;
  const possibleDuplicate=action.match.status==='related'||
   (action.match.status==='review'&&action.match.reason!=='cnpj_ausente_ou_invalido');
  const claimed=icpFields.filter(f=>company.qualificacaoICP?.[f]==='declarado');
  const required=icpFields.filter(f=>company.qualificacaoICP?.[f]!=='nao_solicitado');
  // Contato sem fonte citada permanece informado, sem pontuar como decisor documentado.
  const contacts=(Array.isArray(company.contatos)?company.contatos:[]).filter(c=>text(c?.nome));
  const decisionMakers=contacts.filter(c=>roles.test(text(c.cargo))&&sourceURLs.has(c.fonte));
  const exposedContact=contacts.filter(c=>text(c.email)||text(c.telefone));
  // Notícias citadas são hipóteses de timing, nunca intenção de compra comprovada.
  const news=(Array.isArray(company.noticias)?company.noticias:[])
   .filter(n=>text(n?.titulo)&&isReviewableSourceURL(n.url)&&sourceURLs.has(n.url)).slice(0,10);
  const providers=[...new Set((Array.isArray(company.providers)?company.providers:[])
   .filter(p=>p==='OpenAI'||p==='Anthropic'))];
  // Elegibilidade exige critérios realmente solicitados e todos declarados.
  // 'declarado' não é 'verificado': a shortlist segue obrigatoriamente humana.
  const icpReady=required.length>0&&claimed.length===required.length&&
   company.qualificacaoICP?.statusGeral==='declarado_nao_verificado';
  const identity=Boolean(cnpj);
  // Score prioriza *revisão humana* baseada em completude, NÃO potencial de venda.
  const rawScore=Math.max(0,Math.min(100,
   (identity?15:0)+
   (sources.length?15:0)+
   (company.territorioCorroborado===true?10:0)+
   Math.round(25*claimed.length/4)+
   (decisionMakers.length?10:0)+
   (news.length?10:0)+
   (providers.length===2?5:0)+
   (text(company.segmento)?5:0)+
   (text(company.cidade)&&text(company.uf)?5:0)-
   (conflicted?30:0)-
   (action.match.status==='existing'?25:0)-
   (possibleDuplicate?15:0)));
  const score=icpReady?rawScore:Math.min(69,rawScore);
  const reasons=[];
  if(icpReady)reasons.push(claimed.length+'/'+required.length+' critérios ICP declarados, ainda sem verificação');
  else reasons.push('ICP incompleto ou não solicitado: '+claimed.length+'/'+required.length+' requisitos declarados');
  if(sources.length)reasons.push(sources.length+' fonte(s) HTTPS citada(s), revisar conteúdo');
  if(decisionMakers.length)reasons.push(decisionMakers.length+' possível(is) decisor(es) com fonte citada, vínculo não validado');
  if(news.length)reasons.push(news.length+' notícia(s) a investigar, sem prova de intenção de compra');
  if(!identity)reasons.push('CNPJ pendente; sem importação');
  if(conflicted)reasons.push('Divergências entre fontes exigem revisão');
  if(action.match.status==='existing'||possibleDuplicate)reasons.push('Possível conta existente, filial ou duplicidade no CRM');
  if(!sources.length)reasons.push('Sem fonte HTTPS citada');
  if(!reasons.length)reasons.push('Evidência insuficiente para priorizar');
  const status=action.match.status==='existing'?'ja_cadastrada':
   possibleDuplicate?'duplicidade_a_revisar':
   !identity||!sources.length||conflicted||!icpReady?'verificacao_obrigatoria':'candidata_para_revisao';
  const nextAction=action.match.status==='existing'?'Revisar o histórico da conta existente antes de nova abordagem':
   possibleDuplicate?'Confirmar matriz, filial ou identidade para evitar duplicação':
   !identity?'Localizar e conferir o CNPJ em fonte confiável':
   !sources.length?'Localizar fonte HTTPS que sustente a identidade empresarial':
   conflicted?'Reconciliar informações divergentes antes de qualificar':
   !icpReady?'Completar e revisar todos os critérios ICP solicitados':
   !decisionMakers.length?'Identificar e confirmar um decisor e seu vínculo profissional':
   !news.length?'Investigar contexto e possíveis projetos antes de contatar':
   'Conferir a notícia e o vínculo do decisor antes de preparar a abordagem';
  candidates.push({
   company,score,status,reasons,nextAction,matchStatus:action.match.status,
   evidence:{cnpjFormatoValido:identity,fontesCitadas:sources.length,territorioCorroborado:company.territorioCorroborado===true,
    icpDeclarados:claimed.length,icpSolicitados:required.length,icpProntoParaRevisao:icpReady,contatosInformados:contacts.length,
    potenciaisDecisores:decisionMakers.length,contatosComCanalInformado:exposedContact.length,
    contatosVerificados:0,noticiasCitadas:news.length,sinaisCompraConfirmados:0,
    provedores:providers.length,conflitos:conflicted?company.conflitos.length:0}
  });
 }
 candidates.sort((a,b)=>{
  const order={candidata_para_revisao:0,verificacao_obrigatoria:1,duplicidade_a_revisar:2,ja_cadastrada:3};
  return order[a.status]-order[b.status]||b.score-a.score||
   text(a.company.nome||a.company.razaoSocial).localeCompare(text(b.company.nome||b.company.razaoSocial),'pt-BR')||
   text(a.company.cnpj).localeCompare(text(b.company.cnpj));
 });
 const count=(fn)=>candidates.filter(fn).length;
 const stages=[
  stage('finder','Finder',candidates.length,'Candidatas recebidas do motor externo; sem promessa de cobertura total.'),
  stage('analyst','Analyst',count(x=>x.evidence.fontesCitadas>0),
   'Perfis e fontes organizados; nenhuma identidade empresarial é considerada confirmada só por IA.'),
  stage('signal-hunter','Signal Hunter',count(x=>x.evidence.noticiasCitadas>0),
   'Notícias citadas para investigação. Interações sociais e intenção de compra não monitoradas.'),
  stage('enricher','Enricher',count(x=>x.evidence.contatosInformados>0),
   'Contatos declarados, sem validação automática de e-mail, telefone ou vínculo.'),
  stage('qualifier','Qualifier',count(x=>x.evidence.icpProntoParaRevisao),
   'Todos os critérios ICP solicitados declarados, ainda sem validação independente.'),
  stage('prioritizer','Prioritizer',count(x=>x.status==='candidata_para_revisao'),
   'Ordena apenas a fila de revisão, não calcula propensão a comprar.')
 ];
 return {
  stages,candidates,shortlist:candidates.filter(x=>x.status==='candidata_para_revisao').slice(0,10),
  summary:{
   candidates:candidates.length,shortlisted:count(x=>x.status==='candidata_para_revisao'),
   awaitingReview:count(x=>x.status==='verificacao_obrigatoria'||x.status==='duplicidade_a_revisar'),
   existing:count(x=>x.status==='ja_cadastrada'),
   icpIncomplete:count(x=>!x.evidence.icpProntoParaRevisao),
   citedNews:count(x=>x.evidence.noticiasCitadas>0),
   contactsDeclared:count(x=>x.evidence.contatosInformados>0)
  },
  method:'Pontuação heurística de prontidão para revisão (0–100). A shortlist exige ICP declarado completo e fonte pública citada; não significa probabilidade de compra, sinal validado ou contato confirmado.',
  writes:0,networkCalls:0
 };
}
