/* Configuração de fábrica.

   O endereço do Supabase e a chave pública moram aqui, no código, e não só no
   navegador de quem configurou. Sem isso, cada pessoa que abrisse o app pela
   primeira vez cairia no login local e teria de colar dois valores à mão antes
   de conseguir entrar — o que derruba a ideia de mandar um link para alguém em
   outra cidade e a pessoa simplesmente usar.

   A chave pública é pública por desenho: ela não concede nada por si só. Quem
   decide o que cada pessoa enxerga são as políticas RLS do banco. Publicá-la é
   a prática normal de qualquer aplicação Supabase que roda no navegador.

   Formato novo (sb_publishable_...), e não o antigo JWT (eyJ...). O Supabase
   trocou o formato e não desligou tudo de uma vez: a antiga ainda vale para o
   banco e para o login, mas já não vale para o portão das Edge Functions. Com
   ela o app funcionava inteiro menos a IA — sintoma que não parece problema de
   chave nenhuma, e por isso custou caro para achar.

   A chave service_role NUNCA entra aqui, nem em nenhum outro arquivo do app:
   essa ignora as políticas.

   Quem configurar pelo app (Configuração → Nuvem) sobrescreve o que está abaixo,
   só naquele navegador. */
window.IADConfig = {
  supabase: {
    url: 'https://drhonmdffhnwamwzynrs.supabase.co',
    chave: 'sb_publishable_-S7bUjXBrrtPawN7grybuA_SX-iigF8'
  }
};

/* A versão que este código é, e o dia em que ela saiu.

   Anda junto com o CACHE do sw.js e tem de ser trocada no mesmo commit — são
   os dois lados da mesma informação. Em Configuração → Versão aparece o nome
   do cache, que é o que está GUARDADO no aparelho; aqui é o que está RODANDO.
   Quando os dois discordam, o navegador está no meio de uma troca, e saber
   disso vale mais do que a coincidência dos dois números. */
window.IADVersao = { numero: 'v167', data: '2026-09-11' };
