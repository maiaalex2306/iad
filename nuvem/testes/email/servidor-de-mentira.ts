/* Um servidor de mentira que fala IMAP e SMTP por dentro da memória, para o
   index.ts conversar com ele sem rede. */
export interface Falso {
  fala: (entrada: string) => string | null;  /* devolve o que responder */
  visto: string[];
}

export function conexaoFalsa(servidor: Falso) {
  let resolverLeitura: ((v: any) => void) | null = null;
  const pendentes: Uint8Array[] = [];
  const enc = (s: string) => {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
    return b;
  };
  const empurrar = (s: string) => {
    /* em pedaços pequenos de propósito: é assim que a rede entrega */
    const b = enc(s);
    for (let i = 0; i < b.length; i += 137) {
      const parte = b.subarray(i, i + 137);
      if (resolverLeitura) { const r = resolverLeitura; resolverLeitura = null; r({ value: parte, done: false }); }
      else pendentes.push(parte);
    }
  };
  const readable = {
    getReader() {
      return {
        read(): Promise<any> {
          const p = pendentes.shift();
          if (p) return Promise.resolve({ value: p, done: false });
          return new Promise((res) => { resolverLeitura = res; });
        },
        releaseLock() {}
      };
    }
  };
  let acumulado = '';
  const writable = {
    getWriter() {
      return {
        write(bytes: Uint8Array) {
          let s = '';
          for (const b of bytes) s += String.fromCharCode(b);
          acumulado += s;
          let corte;
          while ((corte = acumulado.indexOf('\r\n')) >= 0) {
            const linha = acumulado.slice(0, corte);
            acumulado = acumulado.slice(corte + 2);
            servidor.visto.push(linha);
            const r = servidor.fala(linha);
            if (r) empurrar(r);
          }
          return Promise.resolve();
        },
        releaseLock() {}
      };
    }
  };
  /* o banner */
  setTimeout(() => empurrar(servidor.fala('')! || ''), 0);
  return { readable, writable, close() {} } as any;
}
