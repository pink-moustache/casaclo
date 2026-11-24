/* ============================================================
   Casa Clo — script principal
   - Menu mobile (toggle do botão hambúrguer)
   - Formulários enviados pelo WhatsApp (data-whatsapp)
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

  /* ---------- 2b. Produto vindo da loja ----------
     Os botões "Encomendar"/"Orçamento" da loja abrem index.html?produto=…
     Preenche o campo Produto para a Clo saber de onde vem o pedido. */
  var produtoEl = document.getElementById('produto');
  if (produtoEl && window.URLSearchParams) {
    var produto = new URLSearchParams(window.location.search).get('produto');
    if (produto) produtoEl.value = produto.slice(0, 80);
  }

  /* ---------- 3. Formulários → WhatsApp ----------
     Qualquer <form data-whatsapp="Título"> é enviado pelo WhatsApp da Clo:
     ao submeter, abre o WhatsApp com o pedido já escrito (um campo por linha,
     com o texto da etiqueta de cada campo). Para um formulário novo (ex.:
     pré-venda de Natal), basta pôr data-whatsapp no <form>.
     Campos sem valor e o consentimento (name="rgpd") ficam de fora. */
  var WHATSAPP = '351966845351';
  var EMAIL = 'encomendas@casaclodoces.com';

  function etiqueta(campo) {
    var grupo = campo.closest('[role="group"]');
    if (grupo && grupo.getAttribute('aria-label')) return grupo.getAttribute('aria-label');
    if (campo.labels && campo.labels[0]) return campo.labels[0].textContent.trim();
    return campo.name;
  }

  function textoDoPedido(form) {
    var data = new FormData(form);
    var linhas = ['Olá Clo! ' + form.getAttribute('data-whatsapp') + ' (casaclodoces.com)', ''];
    var vistos = {};
    Array.prototype.forEach.call(form.elements, function (campo) {
      var nome = campo.name;
      if (!nome || nome === 'rgpd' || vistos[nome] || campo.type === 'submit') return;
      vistos[nome] = true;
      var valores = data.getAll(nome).map(function (v) {
        // Checkboxes: usar o texto visível em vez do value
        var opcao = form.querySelector('input[name="' + nome + '"][value="' + v + '"]');
        if (opcao && (opcao.type === 'checkbox' || opcao.type === 'radio') && opcao.parentNode.tagName === 'LABEL') {
          return opcao.parentNode.textContent.trim();
        }
        if (campo.tagName === 'SELECT' && campo.selectedOptions[0]) return campo.selectedOptions[0].textContent.trim();
        if (campo.type === 'date' && v) return v.split('-').reverse().join('/');
        return String(v).trim();
      }).filter(Boolean);
      if (!valores.length) return;
      if (campo.tagName === 'TEXTAREA') {
        linhas.push('', etiqueta(campo) + ':', valores.join(', '));
      } else {
        linhas.push(etiqueta(campo) + ': ' + valores.join(', '));
      }
    });
    return linhas.join('\n');
  }

  document.querySelectorAll('form[data-whatsapp]').forEach(function (form) {
    var status = form.querySelector('.form-note');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var url = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(textoDoPedido(form));
      // Sem 'noopener' no open(): com ele o browser devolve sempre null
      var janela = window.open(url, '_blank');
      if (janela) janela.opener = null;
      else window.location.href = url;
      if (status) {
        status.hidden = false;
        status.textContent = 'A abrir o WhatsApp com o seu pedido. Só falta carregar em enviar. Se não abrir, escreva para '
          + EMAIL + ' ou +351 966 845 351.';
      }
    });
  });
});
