/* ============================================================
   Casa Clo — interruptor da campanha de Natal
   ------------------------------------------------------------
   É O ÚNICO SÍTIO A MEXER para ligar/desligar o Natal no site.

   modo:
     'auto'      → liga sozinho entre `inicio` e `fim` (recomendado)
     'ligado'    → sempre ligado
     'desligado' → sempre desligado (o site volta ao normal)

   fimEncomendas: último dia para encomendar. Depois disso o tema
   continua, mas o formulário de Natal fecha e aparece um aviso.

   Pré-visualizar sem mexer em nada: acrescentar ?natal=1 ao endereço
   (ou ?natal=0 para ver sem Natal). Fica guardado só nesse separador.
   ============================================================ */
(function () {
  var NATAL = {
    modo: 'auto',
    inicio: '2026-11-25',
    fimEncomendas: '2026-12-20', // confirmado 24/11
    fim: '2026-12-26',
    // Dias de entrega no formulário (confirmado 24/11).
    // Texto depois da data aparece a seguir ao dia, ex.: "(até às 16h)".
    levantamento: ['2026-12-22', '2026-12-23', '2026-12-24 (até às 16h)']
  };

  window.CASACLO_NATAL = NATAL;

  var html = document.documentElement;
  var hoje = new Date();
  var dia = hoje.getFullYear() + '-' +
    String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
    String(hoje.getDate()).padStart(2, '0');

  var ligado = NATAL.modo === 'ligado' ||
    (NATAL.modo === 'auto' && dia >= NATAL.inicio && dia <= NATAL.fim);

  // Pré-visualização (?natal=1 / ?natal=0), guardada no separador
  try {
    var p = new URLSearchParams(window.location.search).get('natal');
    if (p === '1' || p === '0') sessionStorage.setItem('casaclo-natal', p);
    var forcado = sessionStorage.getItem('casaclo-natal');
    if (forcado === '1') ligado = true;
    if (forcado === '0') ligado = false;
  } catch (e) { /* sem sessionStorage: segue a data */ }

  if (ligado) {
    html.classList.add('natal');
    if (dia > NATAL.fimEncomendas) html.classList.add('natal-fechado');
  }

  // Escreve as datas da configuração nas páginas, para estarem num só sítio:
  //   <span data-natal-data="fimEncomendas">…</span>
  //   <select data-natal-dias>…</select>
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function porExtenso(iso, comDia) {
    var d = new Date(iso + 'T12:00:00');
    return (comDia ? SEMANA[d.getDay()] + ', ' : '') + d.getDate() + ' de ' + MESES[d.getMonth()];
  }
  NATAL.porExtenso = porExtenso;

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-natal-data]').forEach(function (el) {
      var v = NATAL[el.getAttribute('data-natal-data')];
      if (v) el.textContent = porExtenso(v);
    });
    document.querySelectorAll('select[data-natal-dias]').forEach(function (sel) {
      sel.innerHTML = '';
      NATAL.levantamento.forEach(function (dia) {
        var o = document.createElement('option');
        var extra = dia.slice(10).trim();
        o.value = porExtenso(dia.slice(0, 10), true) + (extra ? ' ' + extra : '');
        o.textContent = o.value;
        sel.appendChild(o);
      });
    });
    // Contagem: "Faltam N dias para fechar as reservas"
    document.querySelectorAll('[data-natal-contagem]').forEach(function (el) {
      var fim = new Date(NATAL.fimEncomendas + 'T23:59:59');
      var dias = Math.ceil((fim - new Date()) / 86400000);
      if (dias < 1) return;
      el.textContent = dias === 1 ? 'Último dia para reservar' : 'Faltam ' + dias + ' dias para fechar as reservas';
      el.hidden = false;
    });
    ligarReserva();
  });

  /* ---------- Reserva de Natal por WhatsApp (natal.html) ----------
     O formulário não envia nada para servidor: monta a mensagem e abre
     o WhatsApp da Casa Clo com a reserva já escrita. */
  var WHATSAPP = '351966845351';
  var EMAIL = 'encomendas@casaclodoces.com';
  var MBWAY = '966 845 351';
  var SINAL = 0.5;                                // 50% de sinal
  var ENTREGA = { lisboa: 5, gratisAcima: 100 };  // Margem Sul: a Clo confirma

  // Nome do doce sem o selo ("✦ especial 2026")
  function nomeDoce(linha) {
    var label = linha.querySelector('label').cloneNode(true);
    label.querySelectorAll('small').forEach(function (s) { s.remove(); });
    return label.textContent.trim();
  }

  // Valor de n unidades, usando o conjunto (ex.: 3 por 38€) quando compensa
  function valorLinha(l, n) {
    var preco = Number(l.dataset.preco) || 0;
    var pn = Number(l.dataset.packN) || 0, pp = Number(l.dataset.packPreco) || 0;
    if (pn > 1 && pp) return Math.floor(n / pn) * pp + (n % pn) * preco;
    return n * preco;
  }

  function euros(n) { return n.toLocaleString('pt-PT') + '€'; }
  function precoDe(txt) { var m = /(\d+(?:[.,]\d+)?)\s*€/.exec(txt || ''); return m ? Number(m[1].replace(',', '.')) : 0; }

  /* Lista de doces da reserva: foto e preço vêm do cartão de cada doce
     (o elemento com data-natal-produto="qtd-…"), botões − / + e resumo. */
  function prepararLista(form) {
    var linhas = form.querySelectorAll('.natal-qtd .linha');
    if (!linhas.length) return;

    linhas.forEach(function (l) {
      var input = l.querySelector('input');
      var origem = document.querySelector('[data-natal-produto="' + input.id + '"]');
      var cartao = origem && (origem.closest('article') || origem.closest('section'));
      var precoEl = l.querySelector('.price');
      if (cartao) {
        var img = cartao.querySelector('img');
        var preco = cartao.querySelector('.price');
        if (preco && precoEl) precoEl.textContent = preco.textContent.trim();
        // Conjunto no texto do cartão, ex.: "(3 por 38€)"
        var pack = /(\d+)\s+por\s+(\d+(?:[.,]\d+)?)\s*€/.exec(cartao.textContent);
        if (pack) { l.dataset.packN = pack[1]; l.dataset.packPreco = pack[2].replace(',', '.'); }
        if (img) {
          var foto = document.createElement('span');
          foto.className = 'linha-foto';
          foto.setAttribute('aria-hidden', 'true');
          var t = document.createElement('img');
          t.src = img.currentSrc || img.src; t.alt = ''; t.loading = 'lazy'; t.decoding = 'async';
          foto.appendChild(t);
          l.insertBefore(foto, l.firstChild);
        }
      }
      l.dataset.preco = precoDe(precoEl && precoEl.textContent);
      l.dataset.desde = /desde/i.test(precoEl ? precoEl.textContent : '') ? '1' : '';
      // Unidade depois do preço ("Desde 14€ · unidade"): vai para uma 2.ª linha pequena
      if (precoEl) {
        var partes = precoEl.textContent.split('·');
        var unidade = partes.slice(1).join('·').trim();
        if (l.dataset.packN) unidade += (unidade ? ' · ' : '') + l.dataset.packN + ' por ' + euros(Number(l.dataset.packPreco));
        l.dataset.unidade = unidade;
        if (unidade) {
          precoEl.textContent = partes[0].trim();
          var u = document.createElement('small');
          u.className = 'linha-unidade'; u.textContent = unidade;
          precoEl.appendChild(u);
        }
      }

      // Passo − / +
      var passo = document.createElement('span');
      passo.className = 'linha-passo';
      var menos = document.createElement('button');
      menos.type = 'button'; menos.textContent = '−';
      menos.setAttribute('aria-label', 'Menos ' + nomeDoce(l));
      var mais = document.createElement('button');
      mais.type = 'button'; mais.textContent = '+';
      mais.setAttribute('aria-label', 'Mais ' + nomeDoce(l));
      input.parentNode.insertBefore(passo, input);
      passo.appendChild(menos); passo.appendChild(input); passo.appendChild(mais);
      function mudar(d) {
        var max = Number(input.max) || 99;
        input.value = Math.min(max, Math.max(0, (Number(input.value) || 0) + d));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      menos.addEventListener('click', function () { mudar(-1); });
      mais.addEventListener('click', function () { mudar(1); });
    });

    // Resumo: n.º de doces e valor "desde"
    var resumo = document.createElement('div');
    resumo.className = 'natal-resumo';
    resumo.setAttribute('aria-live', 'polite');
    form.querySelector('.natal-qtd').after(resumo);

    function atualizar() {
      var qtd = 0, total = 0;
      linhas.forEach(function (l) {
        var n = Number(l.querySelector('input').value) || 0;
        l.classList.toggle('escolhida', n > 0);
        qtd += n; total += valorLinha(l, n);
      });
      resumo.classList.toggle('vazio', !qtd);
      resumo.innerHTML = qtd
        ? '<span><strong>' + qtd + (qtd === 1 ? ' doce' : ' doces') + '</strong> · desde ' + euros(total) + '</span>'
          + '<span class="natal-resumo-sinal">Sinal de 50%: desde ' + euros(Math.ceil(total / 2)) + '</span>'
        : '<span>Escolha os doces com <strong>+</strong>. O total aparece aqui.</span>';
    }
    form.addEventListener('input', atualizar);
    form.addEventListener('change', atualizar);
    // "Reservar" num cartão mexe no valor sem evento: atualiza ao chegar ao formulário
    window.addEventListener('hashchange', atualizar);
    document.querySelectorAll('[data-natal-produto]').forEach(function (a) {
      a.addEventListener('click', function () { setTimeout(atualizar, 0); });
    });
    atualizar();
  }

  function ligarReserva() {
    var form = document.getElementById('natalForm');
    if (!form) return;
    var status = document.getElementById('natalStatus');

    function aviso(html) {
      if (!status) return;
      status.hidden = false;
      status.innerHTML = html;
    }

    // "Reservar" num cartão: põe 1 unidade desse doce e desce ao formulário
    document.querySelectorAll('[data-natal-produto]').forEach(function (a) {
      a.addEventListener('click', function () {
        var input = document.getElementById(a.getAttribute('data-natal-produto'));
        if (input && Number(input.value) < 1) input.value = 1;
      });
    });

    prepararLista(form);

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var doces = [], subtotal = 0;
      form.querySelectorAll('.natal-qtd .linha').forEach(function (l) {
        var n = Number(l.querySelector('input').value) || 0;
        if (n < 1) return;
        var preco = Number(l.dataset.preco) || 0;
        var valor = valorLinha(l, n);
        subtotal += valor;
        doces.push('• ' + n + ' × ' + nomeDoce(l) + (preco ? ' (' + (l.dataset.desde ? 'desde ' : '') + euros(preco)
          + (l.dataset.unidade ? ' · ' + l.dataset.unidade : '') + ') = ' + euros(valor) : ''));
      });
      if (!doces.length) {
        aviso('Escolha pelo menos um doce (quantidade maior que 0).');
        var primeiro = form.querySelector('.natal-qtd input');
        if (primeiro) primeiro.focus();
        return;
      }

      var d = new FormData(form);
      var alergias = d.getAll('alergias').join(', ');
      // Contas (valores "desde": a Clo confirma o total final)
      var lisboa = /lisboa/i.test(d.get('entrega') || '');
      var entrega = lisboa ? (subtotal > ENTREGA.gratisAcima ? 0 : ENTREGA.lisboa) : null;
      var total = subtotal + (entrega || 0);
      var sinal = Math.ceil(total * SINAL);
      var mbway = /mb ?way/i.test(d.get('pagamento') || '');
      var linhas = [
        'Olá Clo! Queria fazer uma reserva de Natal:',
        '',
        doces.join('\n'),
        '',
        'Subtotal: desde ' + euros(subtotal),
        'Entrega (' + (lisboa ? 'Lisboa' : 'Margem Sul') + '): ' +
          (entrega === null ? 'a confirmar' : entrega === 0 ? 'grátis (acima de ' + euros(ENTREGA.gratisAcima) + ')' : euros(entrega)),
        'Total estimado: desde ' + euros(total) + (entrega === null ? ' + entrega' : ''),
        'Sinal de ' + Math.round(SINAL * 100) + '%: desde ' + euros(sinal) +
          (mbway ? ' por MB WAY para o ' + MBWAY : ' por transferência bancária'),
        '',
        'Nome: ' + d.get('nome'),
        'Dia: ' + d.get('dia'),
        'Morada de entrega: ' + d.get('zona')
      ];
      if (alergias) linhas.push('Alergias: ' + alergias);
      if (d.get('mensagem')) linhas.push('', 'Notas: ' + d.get('mensagem'));
      var texto = linhas.join('\n');

      var wa = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(texto);
      var mail = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('Reserva de Natal — ' + d.get('nome'))
        + '&body=' + encodeURIComponent(texto);

      aviso('A abrir o WhatsApp com a sua reserva já escrita: só falta carregar em Enviar. '
        + 'Se não abrir, <a href="' + wa + '" target="_blank" rel="noopener" style="text-decoration: underline;">toque aqui</a> '
        + 'ou envie por <a href="' + mail + '" style="text-decoration: underline;">e-mail</a>.');
      // (window.open com 'noopener' devolve sempre null, por isso corta-se à mão)
      var w = window.open(wa, '_blank');
      if (w) w.opener = null; else window.location.href = wa;
    });
  }
})();
