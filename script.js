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

  /* ---------- 1b. Atalhos por categoria da loja (.shop-nav) ----------
     Fica fixo por baixo do cabeçalho e marca a categoria que está no ecrã. */
  var header = document.querySelector('header');
  function alturaHeader() {
    if (header) document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  }
  alturaHeader();
  window.addEventListener('resize', alturaHeader);

  var shopNav = document.querySelector('.shop-nav');
  if (shopNav && 'IntersectionObserver' in window) {
    var links = {};
    shopNav.querySelectorAll('a[href^="#"]').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var visiveis = {};
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) { visiveis[e.target.id] = e.isIntersecting; });
      var ativo = null;
      Object.keys(links).forEach(function (id) { if (!ativo && visiveis[id]) ativo = id; });
      Object.keys(links).forEach(function (id) {
        links[id].classList.toggle('is-active', id === ativo);
        var faixa = links[id].parentNode;
        if (id === ativo && faixa.scrollWidth > faixa.clientWidth) {
          faixa.scrollLeft = links[id].offsetLeft - (faixa.clientWidth - links[id].offsetWidth) / 2;
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    Object.keys(links).forEach(function (id) {
      var alvo = document.getElementById(id);
      if (alvo) obs.observe(alvo);
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
     Campos sem valor (incluindo selects por escolher, cuja opção tem value="")
     e o consentimento (name="rgpd") ficam de fora. */
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
      // Valores vazios (ex.: «— selecionar —» com value="") ficam de fora
      var valores = data.getAll(nome).filter(function (v) {
        return String(v).trim() !== '';
      }).map(function (v) {
        // Checkboxes: usar o texto visível em vez do value
        var opcao = form.querySelector('input[name="' + nome + '"][value="' + v + '"]');
        if (opcao && (opcao.type === 'checkbox' || opcao.type === 'radio') && opcao.parentNode.tagName === 'LABEL') {
          return opcao.parentNode.textContent.trim();
        }
        if (campo.tagName === 'SELECT') {
          var escolhida = Array.prototype.find.call(campo.options, function (o) { return o.selected && o.value === v; });
          if (escolhida) return escolhida.textContent.trim();
        }
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

  /* ---------- 4. Botão flutuante de WhatsApp (todas as páginas) ----------
     Criado aqui para viver num só sítio: todas as páginas carregam este
     script. Abre o WhatsApp da Clo com uma saudação que diz de que página
     vem. Esconde-se quando um formulário está no ecrã, para não tapar o
     botão de enviar no telemóvel. */
  var pagina = (document.title.split(' — ')[0] || '').trim();
  var saudacao = 'Olá Clo! Vim pelo site da Casa Clo'
    + (pagina && pagina !== 'Casa Clo' ? ' (' + pagina + ')' : '')
    + ' e gostava de fazer uma pergunta.';
  var fab = document.createElement('a');
  fab.className = 'whatsapp-fab';
  fab.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(saudacao);
  fab.target = '_blank';
  fab.rel = 'noopener';
  fab.setAttribute('aria-label', 'Falar com a Clo pelo WhatsApp');
  fab.innerHTML = '<svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true" focusable="false">'
    + '<path fill="currentColor" d="M16 3C8.8 3 3 8.7 3 15.8c0 2.5.7 4.9 2 7L3 29l6.4-2c2 1.1 4.3 1.7 6.6 1.7 7.2 0 13-5.7 13-12.8S23.2 3 16 3zm0 23.4c-2.1 0-4.1-.6-5.9-1.7l-.4-.3-3.8 1.2 1.2-3.7-.3-.4c-1.2-1.8-1.9-3.9-1.9-6.1 0-5.9 4.9-10.6 11-10.6s11 4.8 11 10.6-4.9 10.9-10.9 10.9zm6-7.9c-.3-.2-1.9-1-2.2-1.1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.3-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.3.3-.6.1-.2.1-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.4c.2.2 2.4 3.6 5.8 5 2.9 1.1 3.4.9 4.1.8.6-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"/>'
    + '</svg><span class="whatsapp-fab-label">WhatsApp</span>';
  document.body.appendChild(fab);

  if ('IntersectionObserver' in window) {
    var formsVisiveis = new Set();
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (en.isIntersecting) formsVisiveis.add(en.target); else formsVisiveis.delete(en.target);
      });
      fab.classList.toggle('is-hidden', formsVisiveis.size > 0);
    });
    document.querySelectorAll('form').forEach(function (f) { obs.observe(f); });
  }
});
