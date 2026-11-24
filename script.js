/* ============================================================
   Casa Clo — script principal
   - Menu mobile (toggle do botão hambúrguer)
   - Submissão do formulário (Netlify Forms; e-mail como recurso)
   - Ano dinâmico no footer
   - Formulário de pré-venda de Natal (natal.html)
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

  /* ---------- 4. Pré-venda de Natal (natal.html) ----------
     Form "encomenda-natal" no Netlify Forms, com o mesmo recurso de e-mail. */
  var natalForm = document.getElementById('natalForm');
  var natalStatus = document.getElementById('natalStatus');

  // "Reservar" num cartão: põe 1 unidade desse doce e desce até ao formulário
  document.querySelectorAll('[data-natal-produto]').forEach(function (a) {
    a.addEventListener('click', function () {
      var input = document.getElementById(a.getAttribute('data-natal-produto'));
      if (input && Number(input.value) < 1) input.value = 1;
    });
  });

  function natalStatusMsg(msg) {
    if (natalStatus) {
      natalStatus.hidden = false;
      natalStatus.textContent = msg;
    }
  }

  function linhasProdutos() {
    var linhas = [];
    natalForm.querySelectorAll('.natal-qtd .linha').forEach(function (l) {
      var input = l.querySelector('input');
      var n = Number(input.value) || 0;
      if (n > 0) linhas.push(n + ' × ' + l.querySelector('label').textContent.trim());
    });
    return linhas;
  }

  if (natalForm) {
    var natalButton = natalForm.querySelector('button[type="submit"]');

    natalForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var produtos = linhasProdutos();
      if (!produtos.length) {
        natalStatusMsg('Escolha pelo menos um doce (quantidade maior que 0).');
        var primeiro = natalForm.querySelector('.natal-qtd input');
        if (primeiro) primeiro.focus();
        return;
      }

      // "resumo" existe no HTML (hidden) para o Netlify o guardar
      var resumo = natalForm.querySelector('[name="resumo"]');
      if (resumo) resumo.value = produtos.join('; ');

      var data = new FormData(natalForm);
      var body = new URLSearchParams();
      data.forEach(function (value, key) {
        if (key !== 'alergias') body.append(key, value);
      });
      body.append('alergias', data.getAll('alergias').join(', ') || '—');

      if (natalButton) natalButton.disabled = true;
      natalStatusMsg('A enviar a reserva…');

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          natalForm.reset();
          natalStatusMsg('Reserva enviada. Obrigada! A Clo confirma em 24-48h com o total e os dados para o sinal.');
        })
        .catch(function () {
          natalStatusMsg('Não foi possível enviar daqui. Vamos abrir o seu e-mail com a reserva preenchida. Se nada acontecer, escreva para ' + to);
          var corpo = [
            'Reserva de Natal — Casa Clo',
            '',
            'Doces:',
            produtos.join('\n'),
            '',
            'Nome: ' + (data.get('nome') || '—'),
            'Telemóvel: ' + (data.get('telefone') || '—'),
            'Dia: ' + (data.get('dia') || '—'),
            'Levantamento/entrega: ' + (data.get('entrega') || '—'),
            'Morada/zona: ' + (data.get('zona') || '—'),
            'Pagamento do sinal: ' + (data.get('pagamento') || '—'),
            'Alergias: ' + (data.getAll('alergias').join(', ') || '—'),
            '',
            'Notas:',
            (data.get('mensagem') || '—')
          ].join('\n');
          window.location.href = 'mailto:' + to
            + '?subject=' + encodeURIComponent('Reserva de Natal — ' + (data.get('nome') || 'sem nome'))
            + '&body=' + encodeURIComponent(corpo);
        })
        .then(function () {
          if (natalButton) natalButton.disabled = false;
        });
    });
  }
});
