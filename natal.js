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
    fimEncomendas: '2026-12-20', // PLACEHOLDER: confirmar com a Clo
    fim: '2026-12-26',
    // Dias de levantamento/entrega oferecidos no formulário (PLACEHOLDER)
    levantamento: ['2026-12-22', '2026-12-23', '2026-12-24']
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
      NATAL.levantamento.forEach(function (iso) {
        var o = document.createElement('option');
        o.value = porExtenso(iso, true);
        o.textContent = porExtenso(iso, true);
        sel.appendChild(o);
      });
    });
  });
})();
