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
    ligarReserva();
  });

  /* ---------- Reserva de Natal por WhatsApp (natal.html) ----------
     O formulário não envia nada para servidor: monta a mensagem e abre
     o WhatsApp da Casa Clo com a reserva já escrita. */
  var WHATSAPP = '351966845351';
  var EMAIL = 'encomendas@casaclodoces.com';

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

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var doces = [];
      form.querySelectorAll('.natal-qtd .linha').forEach(function (l) {
        var n = Number(l.querySelector('input').value) || 0;
        if (n > 0) doces.push('• ' + n + ' × ' + l.querySelector('label').textContent.trim());
      });
      if (!doces.length) {
        aviso('Escolha pelo menos um doce (quantidade maior que 0).');
        var primeiro = form.querySelector('.natal-qtd input');
        if (primeiro) primeiro.focus();
        return;
      }

      var d = new FormData(form);
      var alergias = d.getAll('alergias').join(', ');
      var linhas = [
        'Olá Clo! Queria fazer uma reserva de Natal:',
        '',
        doces.join('\n'),
        '',
        'Nome: ' + d.get('nome'),
        'Dia: ' + d.get('dia'),
        d.get('entrega') + ': ' + d.get('zona'),
        'Sinal por: ' + d.get('pagamento')
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
