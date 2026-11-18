# RI-47 — Pipeline/Kanban e Cadastro Empresarial (v286.108)

## Sintoma e causa
Kanban mostrava contadores por etapa sobre todas as oportunidades filtradas, mas
aplicava `resumos.slice(0,48)` ANTES de agrupar por etapa. Um volume de 312
registros em Conexão deixava Diagnóstico e Proposta sub-representados. Pesquisar
"Frimesa" reduzia o universo para um registro e escondia o defeito.

## Correção
- Mantida paginação global de 48 só no modo Lista;
- Kanban agrupa todas as oportunidades já autorizadas/filtradas e apresenta
  inicialmente até 8 cartões por etapa, independentemente das outras;
- Cada coluna mostra `Exibindo X de Y` e botão `Mostrar mais 8 nesta etapa`;
- Ordenação, filtros, drag/drop, setas, IAD e histórico de mudança de etapa
  permanecem sob as mesmas regras.

## Cadastro Empresarial
- Campos persistentes: `cep`, `logradouro`, `numero`, `complemento`,
  `bairro`, `codigo_ibge`, `fontes_cadastro` (JSONB).
- CNPJ, cidade, UF e telefone corporativo preexistentes são preservados.
- Cadastro e edição: seções legíveis, consulta explícita BrasilAPI/CNPJ e
  ViaCEP/CEP, sem preencher silenciosamente campos com conflito.
- Uma consulta aprovada preenche apenas campos vazios, preserva o nome do
  provedor, data e estado de validação em `fontes_cadastro`.
- "Origens dos dados" mostra de onde vieram as informações.
- IA da ficha de Empresas também preenche somente campos vazios.
- O telefone do contato LH/LinkLeads NUNCA vira telefone da empresa.
- CNPJ válido e diferente impede associação automática de contas, inclusive
  na sugestão por IA, nome e domínio.
- O mesmo formulário continua aceitando edição manual sem consultas externas.

## Banco de dados
Migration: `nuvem/ri47-cadastro-endereco.sql` (7 ADD COLUMN IF NOT EXISTS).
Aplicada em homologação e produção em 18/11/2026, sem DELETE/UPDATE/DROP.
Produção: 461 empresas antes e depois; hash agregado dos campos antigos
`22cf1e77166c5066358d69b2ce559d51` permanece idêntico; RLS ativa.
Homologação: 384 empresas, sem perda; RLS ativa.
`nuvem/conferir.sql` agora verifica as sete colunas.

## IA de extração
Supabase `assistente` versão 84 em produção: contrato e prompt de `conta`
aceitam CEP, logradouro, número, complemento, bairro e código IBGE.
Canário de teste isolado homologado em Supabase antes da atualização:
`assistente-ri47-cadastro-canary`.
Sem pesquisa por nome que atribua automaticamente CNPJ de estabelecimento
potencialmente homônimo.

## Testes e liberação
- Verificações JS de sintaxe, CNPJ, CEP, conciliação, duplicidade e
  paginação por etapa: 23 aprovações em execução isolada.
- Testes reproduzíveis: `node --test tests/ri47-kanban-cadastro.test.cjs`.
- Ainda exigir teste de gravação/recarga em Chrome e dispositivo secundário;
  não limpar fila CAS pendente ou dados locais durante testes.

## Riscos e rollback
- Se falhar frontend: restaurar release anterior de `src/config.js` e `sw.js`
  junto com os demais arquivos JS/CSS da versão; não desfazer banco nem apagar
  colunas/dados dos usuários.
- Se falhar IA: restaurar versão 83 da Edge Function `assistente` via
  ferramenta de versões/deployment; não expor secrets no browser.
- API BrasilAPI/ViaCEP sujeita à disponibilidade; erro é mostrado, sem
  alteração dos campos e sem operação automática.
- Autoenriquecimento por nome/CNPJ desconhecido depende de fornecedor
  auditável adicional; não simular certeza usando um LLM.
