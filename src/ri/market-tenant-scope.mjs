/* RI-M16 — escopo único de catálogo, sem consultar ou alterar dados.
 * O backend market-search usa perfis.tenant_id (JWT) como escopo da cota,
 * auditoria e autorização. Um tenant selecionado diferente NÃO pode iniciar
 * pesquisa paga nem autorizar segmentos de outra empresa.
 */
export function verifyMarketTenantScope({selectedTenant,selectedUser,profile}={}){
 const expected=String(selectedTenant||''),actor=String(selectedUser||'');
 if(!expected||!actor)return {ok:false,code:'INVALID_LOCAL_SCOPE'};
 if(!profile||typeof profile!=='object'||Array.isArray(profile))
  return {ok:false,code:'PROFILE_UNAVAILABLE'};
 if(profile.ativo===false)return {ok:false,code:'PROFILE_INACTIVE'};
 if(!['admin','gestor','usuario'].includes(profile.papel))
  return {ok:false,code:'PROFILE_UNAUTHORIZED'};
 const backendTenant=String(profile.tenant_id||'');
 if(!backendTenant)return {ok:false,code:'PROFILE_TENANT_MISSING'};
 if(backendTenant!==expected)return {ok:false,code:'TENANT_CONTEXT_MISMATCH'};
 return {ok:true,code:'MATCHED'};
}
export const marketTenantMessage=code=>({
 INVALID_LOCAL_SCOPE:'A sessão do CRM não possui escopo válido. Faça login novamente antes de pesquisar.',
 PROFILE_UNAVAILABLE:'Não foi possível validar o perfil da sessão no servidor. Pesquisa bloqueada sem consumir IA.',
 PROFILE_INACTIVE:'Seu perfil está inativo. Pesquisa bloqueada sem consumir IA.',
 PROFILE_UNAUTHORIZED:'Seu perfil não está autorizado a realizar pesquisas externas.',
 PROFILE_TENANT_MISSING:'O perfil autenticado não possui empresa definida. A pesquisa foi bloqueada.',
 TENANT_CONTEXT_MISMATCH:'A empresa selecionada no CRM é diferente da empresa vinculada ao seu perfil autenticado no Supabase. O servidor pesquisaria no catálogo de outra empresa e rejeitaria o segmento. Solicite a vinculação correta ou use uma sessão autorizada para esta empresa; nenhuma IA foi chamada.'
})[code]||'Não foi possível confirmar o escopo da pesquisa. Nenhuma IA foi chamada.';
