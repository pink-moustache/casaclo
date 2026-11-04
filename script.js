/* ============================================================
   Casa Clo — script principal
   - Menu mobile (toggle do botão hambúrguer)
   - Submissão do formulário (abre cliente de email com tudo preenchido)
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
     Por agora, abre o cliente de email com o pedido formatado.
     Quando a Clo escolher uma plataforma final (Formspree, Netlify Forms,
     WhatsApp Business API, Shopify, etc.), substitui-se este bloco. */
  var form = document.getElementById('orderForm');
  var status = document.getElementById('formStatus');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var data = new FormData(form);
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

      // Caixa na Hostinger; MX/SPF/DKIM a activar na DNS Netlify
      var to = 'encomendas@casaclodoces.com';
      var subject = 'Pedido Casa Clo — ' + (data.get('nome') || 'sem nome');

      var mailto = 'mailto:' + to
        + '?subject=' + encodeURIComponent(subject)
        + '&body=' + encodeURIComponent(corpo);

      window.location.href = mailto;

      if (status) {
        status.hidden = false;
        status.textContent = 'A abrir o seu cliente de e-mail… Se nada acontecer, escreva diretamente para ' + to;
      }
    });
  }
});
