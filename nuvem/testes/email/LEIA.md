# Os testes da caixa de e-mail

Eles ficam **fora** de `nuvem/funcoes/email/` de propósito: aquela pasta tem
exatamente os dois arquivos que você cola no painel do Supabase, e um terceiro
ali só faria você se perguntar se também precisa colar.

Para rodar, de dentro desta pasta:

```
deno run --allow-read mime.test.ts
deno run --allow-read transporte.test.ts
```

(ou `bun mime.test.ts` — foi com o bun que eles foram escritos e rodados.)

Nenhum dos dois toca em rede, em senha ou em banco. Não precisa de Supabase, de
caixa de e-mail nem de internet.

## `mime.test.ts` — 26 testes

O `mime.ts` é puro de propósito: não toca em rede, não usa nada do Deno. É onde
mora a parte chata do e-mail, que é onde os erros se escondem — cabeçalho
dobrado em várias linhas, acento em `=?UTF-8?B?` e em quoted-printable,
`multipart/alternative` que tem de preferir o texto ao HTML, anexo que não pode
virar corpo, a cadeia de `References` que amarra a conversa, e o corte do
"Em 12/09, fulano escreveu:".

Sendo puro, ele é testável sem servidor nenhum. É a razão de ele ser um arquivo
separado.

## `transporte.test.ts` — 33 testes

O `index.ts` conversando com um servidor de mentira que fala IMAP e SMTP dentro
da memória (`servidor-de-mentira.ts`), entregando os bytes em pedaços de 137,
como a rede faz.

Três testes existem porque o código falhava neles:

1. **A armadilha.** Um e-mail cujo *corpo* contém a linha `a3 OK FETCH
   completed` e um `* 99 FETCH (UID 999 BODY[] {12}` logo abaixo. Com marcas de
   comando fixas, bastaria um cliente escrever isso — falando de log, o que
   acontece sozinho — para a leitura parar no meio e uma mensagem inventada
   entrar no banco.
2. **O EHLO de várias linhas.** Resposta de SMTP tem linhas do meio com traço
   (`250-SIZE`) e só a última com espaço. Parar na primeira deixava o resto no
   socket, e essas linhas viravam a resposta do comando seguinte.
3. **A data do IMAP.** `INTERNALDATE` vem como `18-Sep-2026 14:22:01 +0000`.
   `new Date` disso devolve `NaN` em boa parte dos motores, e `toISOString()`
   de `NaN` **lança** — uma caixa inteira falharia por causa de um formato de
   data.

O último teste do arquivo confere que a senha não aparece em nada do que sai:
nem na resposta, nem no que vai para o banco, nem na mensagem enviada.
