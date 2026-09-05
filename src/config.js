/* Configuração de fábrica.

   O endereço do Supabase e a chave pública moram aqui, no código, e não só no
   navegador de quem configurou. Sem isso, cada pessoa que abrisse o app pela
   primeira vez cairia no login local e teria de colar dois valores à mão antes
   de conseguir entrar — o que derruba a ideia de mandar um link para alguém em
   outra cidade e a pessoa simplesmente usar.

   A chave anon é pública por desenho: ela não concede nada por si só. Quem
   decide o que cada pessoa enxerga são as políticas RLS do banco. Publicá-la é
   a prática normal de qualquer aplicação Supabase que roda no navegador.

   A chave service_role NUNCA entra aqui, nem em nenhum outro arquivo do app:
   essa ignora as políticas.

   Quem configurar pelo app (⚙︎ Dados → Nuvem) sobrescreve o que está abaixo,
   só naquele navegador. */
window.IADConfig = {
  supabase: {
    url: 'https://drhonmdffhnwamwzynrs.supabase.co',
    chave: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyaG9ubWRmZmhud2Ftd3p5bnJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MzI3MzUsImV4cCI6MjEwNDIwODczNX0.FcdPunSGnlRtRs3cQQIj4Cw4fIGsNPzdh4wDpRvS_Bw'
  }
};
