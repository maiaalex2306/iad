/* Dados e prompt de comentários: sem acesso ao LinkedIn nem ações externas. */
export function linkedinUrl(input,kind='post') {
  let parsed;
  try {parsed=new URL(String(input||'').trim());}catch{return '';}
  if(parsed.protocol!=='https:'||!/(^|\.)linkedin\.com$/i.test(parsed.hostname)||
      parsed.username||parsed.password)return '';
  if(kind==='profile'&&!/^\/in\/[^/?#]+\/?$/i.test(parsed.pathname))return '';
  if(kind==='post'&&!(/^\/feed\/update\/[^/?#]+/i.test(parsed.pathname)||
      /^\/posts\/[^/?#]+/i.test(parsed.pathname)||/^\/pulse\/[^/?#]+/i.test(parsed.pathname)))return '';
  parsed.hash='';return parsed.href;
}
export function prepareLinkedInCampaign(fields={}) {
  const trim=(value,limit)=>String(value||'').trim().slice(0,limit);
  const campaign={
    lead:trim(fields.lead,120),cargo:trim(fields.cargo,140),
    empresa:trim(fields.empresa,160),perfil:linkedinUrl(fields.perfil,'profile'),
    postUrl:linkedinUrl(fields.postUrl,'post'),
    resumoPerfil:trim(fields.resumoPerfil,1200),
    post:trim(fields.post,6000),comentarioLead:trim(fields.comentarioLead,2000),
    solucao:trim(fields.solucao,1200),
    estilo:['consultivo','tecnico','objetivo'].includes(fields.estilo)?fields.estilo:'consultivo'
  };
  if(!campaign.lead)throw new Error('Informe o nome do lead.');
  if(!campaign.postUrl)throw new Error('Informe um link válido de publicação do LinkedIn.');
  if(campaign.post.length<40)throw new Error('Cole o texto do post (mínimo de 40 caracteres).');
  return campaign;
}
export function campaignText(c) {
  return [
    'POST DO LINKEDIN (conteúdo fornecido pelo usuário):',c.post,
    'COMENTÁRIO DO LEAD NO POST (opcional):',c.comentarioLead||'não informado',
    'LEAD:',c.lead,
    'CARGO:',c.cargo||'não informado',
    'EMPRESA:',c.empresa||'não informada',
    'DADOS PÚBLICOS DO PERFIL:',c.resumoPerfil||'não informado',
    'NOSSA SOLUÇÃO / POSICIONAMENTO:',c.solucao||'não informado',
    'ESTILO SOLICITADO:',c.estilo,
    'TAREFA: redigir comentário público profissional, simpático e coerente com o assunto. Quando existir conexão legítima com água, segurança hídrica, consumo ou efluentes, acrescente perspectiva útil e convide para uma conversa sem pressão. Caso contrário, não force tema comercial. Não invente problemas ou resultados da empresa.'
  ].join('\n');
}
