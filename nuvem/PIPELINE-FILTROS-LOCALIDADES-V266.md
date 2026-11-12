# IaD CRM v266 — Filtros IBGE no Pipeline

## O que muda
Na gaveta `Pipeline → Filtros → Onde` aparecem dois controles adicionais:
**Estado / UF** (26 estados + Distrito Federal) e **Município**.
Digite a sigla, o nome ou as primeiras letras. Clique numa sugestão para
aplicar o filtro. A busca ignora acentos, maiúsculas e espaços duplicados.

## De onde vêm os dados
- UFs: catálogo com as 27 unidades do Brasil em `src/localidades.js`.
- Municípios: API oficial do IBGE, sob demanda conforme a UF:
  `https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios?orderBy=nome`.
- Cache dos municípios consultados: 30 dias no navegador. Se o serviço
  do IBGE estiver fora do ar, opções se limitam às cidades já cadastradas
  na carteira que o usuário tem permissão para visualizar.

A filtragem usa **`conta.uf` e `conta.cidade`** da empresa vinculada a
cada oportunidade. O endereço do vendedor/gestor não é utilizado.
O texto livre na pesquisa não altera o resultado até que se escolha
uma sugestão válida. O nome é comparado sem diferenças de acentuação.

## Testes manuais de homologação
1. Na gaveta digitar `sp`, selecionar `São Paulo (SP)`.
2. Digitar `sao jose`, selecionar `São José dos Campos`. Conferir
   que aparecem apenas oportunidades ligadas a contas dessa cidade/UF.
3. Trocar a UF para `RJ`: município anterior deve ser zerado
   automaticamente. Selecionar `Niterói`.
4. Selecionar `DF`, digitar `bra`, escolher `Brasília`.
5. Testar termo com e sem acento (`Sao` / `São`).
6. Limpar o chip `Município` mantém UF; limpar `UF` remove ambos.
7. Confirmar que mudar responsável, segmento ou etapa mantém o
   cruzamento correto com Estado e Município.
8. Verificar resultado no modo lista e kanban.
9. Conferir funcionamento com conta sem `cidade`/`uf`:
   ela não deve aparecer sob filtros regionais restritivos.
10. Testar como Gestor da Bio Water Care e usuário de outra empresa:
    não cruzar permissões nem mostrar dados de outras empresas.
11. Simular falta de conexão com a API IBGE:
    aparecer apenas municípios cadastrados no CRM da UF escolhida.
12. No celular confirmar que a gaveta permite digitar e selecionar
    sem perder foco ou cortar a lista.

## GitHub / implantação
- PR: https://github.com/maiaalex2306/iad/pull/4
- Destino: `claude/decisoes-estagios-vendas-eckjo0`, a branch do
  GitHub Pages em https://www.iadcrm.com.br
- Verificar no GitHub Actions `Pipeline localities regression` com status verde.
- Depois do merge a versão deve ser `v266` em
  https://www.iadcrm.com.br/src/config.js
- Não é necessário SQL ou alterar o Supabase para estes filtros.

## Limitação de qualidade cadastral
Se o campo `UF` foi preenchido com erros de grafia ou a cidade
não estiver presente, o filtro não poderá classificar automaticamente
esse registro. Recomenda-se validar `UF` e `cidade` na tela de
cadastro de contas em evolução posterior, conservando os dados existentes.
