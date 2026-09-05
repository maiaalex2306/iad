/* Helpers de interface: formatação, escape e diálogos. */
(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function moeda(valor) {
    const n = Number(valor) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  function compacto(valor) {
    const n = Number(valor) || 0;
    if (n >= 1e6) return 'R$ ' + (n / 1e6).toFixed(1).replace('.', ',') + 'M';
    if (n >= 1e3) return 'R$ ' + Math.round(n / 1e3) + 'k';
    return moeda(n);
  }

  function data(iso) {
    if (!iso) return '—';
    const p = iso.slice(0, 10).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function numero(n, casas) {
    return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 });
  }

  /* Diálogo genérico: recebe HTML de formulário e devolve os campos preenchidos. */
  function formulario(titulo, campos, valores, aoConfirmar) {
    const dlg = document.createElement('dialog');
    const html = campos.map(function (c) {
      const v = (valores && valores[c.id] != null) ? valores[c.id] : (c.padrao != null ? c.padrao : '');
      if (c.tipo === 'select') {
        return '<label class="campo"><span>' + esc(c.rotulo) + '</span><select name="' + c.id + '">' +
          c.opcoes.map(function (o) {
            const val = typeof o === 'string' ? o : o.valor;
            const rot = typeof o === 'string' ? o : o.rotulo;
            return '<option value="' + esc(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(rot) + '</option>';
          }).join('') + '</select></label>';
      }
      if (c.tipo === 'textarea') {
        return '<label class="campo"><span>' + esc(c.rotulo) + '</span><textarea name="' + c.id + '">' + esc(v) + '</textarea></label>';
      }
      return '<label class="campo"><span>' + esc(c.rotulo) + '</span><input type="' + (c.tipo || 'text') + '" name="' + c.id + '" value="' + esc(v) + '"' + (c.placeholder ? ' placeholder="' + esc(c.placeholder) + '"' : '') + '></label>';
    }).join('');

    dlg.innerHTML =
      '<form method="dialog"><div class="corpo"><h2>' + esc(titulo) + '</h2>' + html + '</div>' +
      '<div class="rodape"><button class="btn ghost" value="cancelar" type="submit">Cancelar</button>' +
      '<button class="btn" value="ok" type="submit">Salvar</button></div></form>';

    document.body.appendChild(dlg);
    dlg.addEventListener('close', function () {
      if (dlg.returnValue === 'ok') {
        const dados = {};
        campos.forEach(function (c) {
          const el = dlg.querySelector('[name="' + c.id + '"]');
          dados[c.id] = c.tipo === 'number' ? Number(el.value || 0) : el.value.trim();
        });
        aoConfirmar(dados);
      }
      dlg.remove();
    });
    dlg.showModal();
  }

  function confirmar(mensagem) { return global.confirm(mensagem); }

  function barra(percentual, alt) {
    const p = Math.max(0, Math.min(100, Math.round(percentual)));
    return '<div class="barra' + (alt ? ' alt' : '') + '"><i style="width:' + p + '%"></i></div>';
  }

  global.IADUI = { esc: esc, moeda: moeda, compacto: compacto, data: data, numero: numero, formulario: formulario, confirmar: confirmar, barra: barra };
})(window);
