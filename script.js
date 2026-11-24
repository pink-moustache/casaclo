/* ============================================================
   Casa Clo — script principal
   - Menu mobile (toggle do botão hambúrguer)
   - Submissão do formulário (Netlify Forms; e-mail como recurso)
   - Ano dinâmico no footer
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ---------- 1. Menu mobile ---------- */
  var toggle = document.getElementById('menuToggle');
  var menu = document.getElementById('menu');

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var isOpen = menu.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      toggle.textContent = isOpen ? 'Fechar' : 'Menu';
    });

    // Fechar o menu ao clicar num link (mobile)
    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        if (menu.classList.contains('is-open')) {
          menu.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.textContent = 'Menu';
        }
      });
    });
  }

  /* ---------- 2. Ano dinâmico no footer ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  /* ---------- 3. Submissão do formulário ----------
     Envia o pedido para o Netlify Forms (form "pedido-encomenda"), sem
     depender do cliente de e-mail do visitante. Se o envio falhar, cai para
     o método antigo (abrir o e-mail com o pedido preenchido).
     Fase B (site na Decima Cloud): trocar o endpoint "/" por um próprio. */
  var form = document.getElementById('orderForm');
  var status = document.getElementById('formStatus');
  var to = 'encomendas@casaclodoces.com';

  function showStatus(msg) {
    if (status) {
      status.hidden = false;
      status.textContent = msg;
    }
  }

  function abrirEmail(data) {
    var alergias = data.getAll('alergias').join(', ') || '—';
    var corpo = [
      'Novo pedido de encomenda — Casa Clo',
      '',
      'Nome: ' + (data.get('nome') || '—'),
      'Contacto: ' + (data.get('contacto') || '—'),
      'Tipo de pedido: ' + (data.get('tipo') || '—'),
      'Ocasião: ' + (data.get('ocasiao') || '—'),
      'Nº de pessoas: ' + (data.get('pessoas') || '—'),
      'Data pretendida: ' + (data.get('data') || '—'),
      'Entrega/levantamento: ' + (data.get('entrega') || '—'),
      'Zona: ' + (data.get('zona') || '—'),
      'Alergias: ' + alergias,
      '',
      'Mensagem:',
      (data.get('mensagem') || '—')
    ].join('\n');
    var subject = 'Pedido Casa Clo — ' + (data.get('nome') || 'sem nome');
    window.location.href = 'mailto:' + to
      + '?subject=' + encodeURIComponent(subject)
      + '&body=' + encodeURIComponent(corpo);
  }

  if (form) {
    var button = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var data = new FormData(form);

      // As alergias vão num só campo, para aparecerem juntas no Netlify
      var body = new URLSearchParams();
      data.forEach(function (value, key) {
        if (key !== 'alergias') body.append(key, value);
      });
      body.append('alergias', data.getAll('alergias').join(', ') || '—');

      if (button) button.disabled = true;
      showStatus('A enviar o pedido…');

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          form.reset();
          showStatus('Pedido enviado. Obrigada! A Clo responde em 24-48h.');
        })
        .catch(function () {
          showStatus('Não foi possível enviar daqui. Vamos abrir o seu e-mail com o pedido preenchido. Se nada acontecer, escreva para ' + to);
          abrirEmail(data);
        })
        .then(function () {
          if (button) button.disabled = false;
        });
    });
  }
});
