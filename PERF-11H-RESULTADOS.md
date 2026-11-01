# PERF-11H — Homologação de IndexedDB real e isolamento local de perfis

**Status:** corrigido, teste Chromium aprovado, 154 testes automatizados aprovados. **Produção ainda em v286; nenhum merge/deploy/SQL de produção executado.**

## Defeito descoberto durante teste real de duas abas

O teste Chromium abriu o IndexedDB v1 em uma aba, manteve sua conexão aberta e solicitou a migração para v2 em outra aba. O retorno `onblocked` apresentava a mensagem esperada, mas a solicitação rejeitada podia continuar pendente e, após o fechamento da primeira aba, obter uma conexão tardia não controlada.

Ao solicitar uma atualização de esquema posterior, o navegador permaneceu bloqueado: o gerenciador antigo fechava a conexão apontada pela variável `bancoAberto`, que podia ter sido substituída por outra, deixando conexões anteriores abertas.

**Falha reproduzida no primeiro workflow:** `v2 onversionchange did not close`.

## Correção restrita a `src/arquivos.js`

- `aberturaEmAndamento` compartilha a mesma tentativa de abertura entre chamadas concorrentes enquanto não existe conexão ativa.
- `onblocked` avisa o usuário como antes e marca a tentativa como abandonada. Se ela acabar conectando depois, **fecha imediatamente** a conexão e não a mantém em memória.
- `onversionchange` captura a instância local do banco e fecha **a própria conexão**, sem fechar por engano uma instância mais recente.
- Nenhuma mudança no nome do banco, versão v2, lojas, índices, formato dos anexos ou dados comerciais.
- A recuperação após fechar a aba bloqueadora permanece possível com uma nova tentativa de acesso.

## Resultados verificados em GitHub Actions, Chromium Headless real

- V1 com 3 anexos de teste, dois object stores, um índice existente. V2 cria índices `contaId`, `oportunidadeId` e `tarefaId`, preservando todos os metadados.
- V1 aberta em outra aba bloqueia V2 e produz a mensagem de segurança correta; após fechar a conexão antiga, o upgrade V2 é concluído.
- Conteúdo binário do arquivo anterior preservado (verificado após a migração).
- Seleção por oportunidade, conta e tarefa preservada.
- Operações **offline**: listar, repontar 2 anexos, salvar novo, consultar e excluir sem perder os 3 originais.
- Nova solicitação de atualização de versão (V2→V3) concluída no teste, provando que `onversionchange` encerra a conexão correta. **O teste altera apenas IndexedDB efêmero do Chromium local, não o esquema ou os dados de produção**.
- Controle de visibilidade local via módulos reais `Store` e `Auth`: vendedor vê somente as próprias oportunidades e sem dono no tenant; gestor vê a empresa; administrador vê as empresas autorizadas e respeita os filtros; sem sessão o Store não devolve oportunidades.
- **154/154 testes de regressão completos aprovados, 0 falhas**. Nenhum erro JavaScript no browser do teste.
- Workflow aprovado: `PERF-11H — Chromium real IndexedDB v1-v2 e perfis`; commit da correção `3bb5bb8d383bcf367ce2df9458b2711e5b43cb08`.

## Limites do teste

A matriz de perfil acima testa a segurança **no cliente local**, não substitui RLS autenticada no Supabase. O teste usa arquivos e empresas sintéticos e um navegador limpo, não anexo real preexistente do usuário. A v287 continua bloqueada até homologação autenticada do portal com HEINEKEN, Suzano, sincronização, cache PWA, anexos reais e P95 ponta a ponta. Não copiar banco de produção sem solicitação explícita.

## Próximo portão

Executar PERF-11F de forma autenticada em ambiente controlado, revalidando registros reais e todos os perfis no backend. Mesclar os PRs **#34 → #36 → #37 → #39 → #40 → PERF-11H** somente após aprovação dos portões. O experimento PERF-11D regressivo permanece rejeitado.
