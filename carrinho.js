/* ============================================================
   Casa Clo — carrinho e checkout
   - "Adicionar" em cada cartão de produto (.product-card) com botão
     Encomendar/Reservar. Os de orçamento (Cerimónia) ficam como estão.
   - Carrinho guardado no browser (localStorage), visível em todas as páginas:
     botão no cabeçalho e no telemóvel, painel lateral com quantidades.
   - Checkout: dados, data, recolha/entrega. Por agora a encomenda é enviada
     pelo WhatsApp da Clo, que confirma o valor final e manda os dados de
     pagamento (MB WAY). Quando houver pagamento online, é este passo que muda.

   Para mudar antecedências ou zonas de entrega: ver CONFIG abaixo.
   ============================================================ */

(function () {
  'use strict';

  var CONFIG = {
    whatsapp: '351966845351',
    chave: 'casaclo-carrinho-v1',
    // Dias de antecedência mínima por secção da loja (id da <section>).
    // A data mais cedo do checkout usa o maior valor entre os produtos.
    antecedencia: { 'para-casa': 3, 'celebrar': 7, 'epocas': 3 },
    antecedenciaPadrao: 3,
    entrega: [
      { valor: 'recolha', texto: 'Recolha (local combinado com a Clo)' },
      { valor: 'lisboa', texto: 'Entrega em Lisboa (5€, grátis acima de 100€)' },
      { valor: 'margem-sul', texto: 'Entrega na Margem Sul (8€, grátis acima de 100€)' }
    ],
    maxQtd: 50
  };

  // Caminho base: o 404.html usa caminhos absolutos, o resto relativos.
  var BASE = (document.currentScript && /^\//.test(document.currentScript.getAttribute('src') || '')) ? '/' : '';

  /* ---------- Dados ---------- */
  function ler() {
    try {
      var v = JSON.parse(localStorage.getItem(CONFIG.chave) || '[]');
      return Array.isArray(v) ? v.filter(function (i) { return i && i.id && i.qtd > 0; }) : [];
    } catch (e) { return []; }
  }
  var itens = ler();
  function guardar() {
    try { localStorage.setItem(CONFIG.chave, JSON.stringify(itens)); } catch (e) { /* modo privado: fica só nesta página */ }
    desenhar();
  }

  var slug = function (s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };
  var euros = function (n) { return (Math.round(n * 100) / 100).toString().replace('.', ',') + '€'; };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };

  function total() {
    var soma = 0, porConfirmar = 0, unidades = 0;
    itens.forEach(function (i) {
      unidades += i.qtd;
      if (typeof i.preco === 'number') soma += i.preco * i.qtd; else porConfirmar += i.qtd;
    });
    return { soma: soma, porConfirmar: porConfirmar, unidades: unidades };
  }

  /* ---------- Ler produto de um cartão ---------- */
  function produtoDoCartao(card) {
    var h3 = card.querySelector('h3');
    if (!h3) return null;
    var nome = h3.textContent.replace(/\s+/g, ' ').trim();
    var precoEl = card.querySelector('.price');
    var precoTxt = precoEl ? precoEl.textContent.replace(/\s+/g, ' ').trim() : '';
    var m = precoEl && !precoEl.querySelector('.ph') ? precoTxt.match(/(\d+(?:[.,]\d+)?)\s*€/) : null;
    var img = card.querySelector('.product-image img');
    var seccao = card.closest('section[id]');
    var dias = seccao && CONFIG.antecedencia[seccao.id] != null ? CONFIG.antecedencia[seccao.id] : CONFIG.antecedenciaPadrao;
    return {
      id: slug(nome),
      nome: nome,
      preco: m ? parseFloat(m[1].replace(',', '.')) : null,
      desde: /desde/i.test(precoTxt),
      img: img ? img.getAttribute('src').replace(/^\//, '') : '',
      dias: dias
    };
  }

  function adicionar(p) {
    var existente = itens.find(function (i) { return i.id === p.id; });
    if (existente) existente.qtd = Math.min(CONFIG.maxQtd, existente.qtd + 1);
    else itens.push({ id: p.id, nome: p.nome, preco: p.preco, desde: p.desde, img: p.img, dias: p.dias, qtd: 1 });
    guardar();
    aviso(p.nome);
  }

  /* ---------- Botões "Adicionar" nos cartões ---------- */
  function prepararCartoes() {
    // A página de Natal tem o seu próprio formulário de pré-venda.
    if (document.getElementById('encomendar') && document.querySelector('[data-natal-produto]')) return;
    document.querySelectorAll('.product-card .product-meta .mini-button').forEach(function (botao) {
      var texto = botao.textContent.trim().toLowerCase();
      if (texto !== 'encomendar' && texto !== 'reservar') return; // "Orçamento" fica igual
      var card = botao.closest('.product-card');
      var p = produtoDoCartao(card);
      if (!p) return;
      var novo = document.createElement('button');
      novo.type = 'button';
      novo.className = 'mini-button cart-add';
      novo.innerHTML = '<span aria-hidden="true">+</span> Adicionar';
      novo.setAttribute('aria-label', 'Adicionar ' + p.nome + ' ao carrinho');
      novo.addEventListener('click', function () { adicionar(p); });
      botao.replaceWith(novo);
    });
  }

  /* ---------- Interface ---------- */
  var painel, lista, rodape, passoItens, passoDados, form, toast, contadores = [];

  function criarInterface() {
    // Botão do cabeçalho (substitui o "Encomendar" do menu)
    document.querySelectorAll('.cart-pill').forEach(function (pill) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cart-pill cart-open';
      b.innerHTML = 'Carrinho <span class="cart-count" aria-hidden="true"></span>';
      pill.replaceWith(b);
    });
    // Botão compacto ao lado do "Menu", só no telemóvel
    var toggle = document.getElementById('menuToggle');
    if (toggle) {
      var mini = document.createElement('button');
      mini.type = 'button';
      mini.className = 'cart-mini cart-open';
      mini.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8z"/><path fill="none" stroke="currentColor" stroke-width="1.6" d="M9 10V6.5a3 3 0 0 1 6 0V10"/></svg><span class="cart-count"></span>';
      toggle.parentNode.insertBefore(mini, toggle);
    }

    var fundo = document.createElement('div');
    fundo.className = 'cart-fundo';
    fundo.hidden = true;

    painel = document.createElement('aside');
    painel.className = 'cart-painel';
    painel.setAttribute('role', 'dialog');
    painel.setAttribute('aria-modal', 'true');
    painel.setAttribute('aria-labelledby', 'cart-titulo');
    painel.hidden = true;
    painel.innerHTML =
      '<div class="cart-topo">' +
        '<h2 id="cart-titulo">O seu carrinho</h2>' +
        '<button type="button" class="cart-fechar" aria-label="Fechar carrinho">×</button>' +
      '</div>' +
      '<div class="cart-passo" data-passo="itens">' +
        '<ul class="cart-lista"></ul>' +
        '<div class="cart-rodape"></div>' +
      '</div>' +
      '<div class="cart-passo" data-passo="dados" hidden>' +
        '<button type="button" class="cart-voltar">← Voltar ao carrinho</button>' +
        '<form class="cart-form" novalidate>' +
          '<div><label for="cc-nome">Nome</label><input id="cc-nome" name="nome" required autocomplete="name"></div>' +
          '<div><label for="cc-tel">Telemóvel</label><input id="cc-tel" name="tel" type="tel" required autocomplete="tel" inputmode="tel" placeholder="9xx xxx xxx"></div>' +
          '<div><label for="cc-data">Para que dia?</label><input id="cc-data" name="data" type="date" required><p class="cart-ajuda" data-ajuda-data></p></div>' +
          '<div><label for="cc-entrega">Recolha ou entrega</label><select id="cc-entrega" name="entrega" required>' +
            CONFIG.entrega.map(function (e) { return '<option value="' + e.valor + '">' + esc(e.texto) + '</option>'; }).join('') +
          '</select></div>' +
          '<div data-morada hidden><label for="cc-morada">Morada de entrega</label><input id="cc-morada" name="morada" autocomplete="street-address" placeholder="Rua, número, código postal, localidade"></div>' +
          '<div><label for="cc-alergias">Alergias ou intolerâncias</label><input id="cc-alergias" name="alergias" placeholder="Se não houver, deixe em branco"></div>' +
          '<div><label for="cc-msg">Mensagem no bolo (opcional)</label><input id="cc-msg" name="mensagem" maxlength="60" placeholder="Ex.: Parabéns, Maria!"></div>' +
          '<div><label for="cc-notas">Notas (opcional)</label><textarea id="cc-notas" name="notas" rows="3" placeholder="Sabores, tamanhos, cores, hora preferida…"></textarea></div>' +
          '<p class="cart-erro" role="alert" hidden></p>' +
          '<button type="submit" class="button primary cart-enviar">Enviar encomenda pelo WhatsApp</button>' +
          '<p class="cart-ajuda">A Clo confirma a disponibilidade e o valor final, e envia os dados de pagamento por MB WAY.</p>' +
        '</form>' +
      '</div>' +
      '<div class="cart-passo" data-passo="enviado" hidden>' +
        '<p class="cart-ok">Abrimos o WhatsApp com a sua encomenda. Só falta carregar em enviar.</p>' +
        '<p class="cart-ajuda">Se o WhatsApp não abriu, escreva para encomendas@casaclodoces.com ou +351 966 845 351.</p>' +
        '<button type="button" class="button primary" data-esvaziar>Já enviei, esvaziar o carrinho</button>' +
        '<button type="button" class="button secondary" data-reenviar>Abrir o WhatsApp outra vez</button>' +
      '</div>';

    toast = document.createElement('div');
    toast.className = 'cart-toast';
    toast.setAttribute('role', 'status');
    toast.hidden = true;

    document.body.appendChild(fundo);
    document.body.appendChild(painel);
    document.body.appendChild(toast);

    lista = painel.querySelector('.cart-lista');
    rodape = painel.querySelector('.cart-rodape');
    form = painel.querySelector('.cart-form');
    contadores = document.querySelectorAll('.cart-count');

    document.querySelectorAll('.cart-open').forEach(function (b) { b.addEventListener('click', abrir); });
    fundo.addEventListener('click', fechar);
    painel.querySelector('.cart-fechar').addEventListener('click', fechar);
    painel.querySelector('.cart-voltar').addEventListener('click', function () { passo('itens'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !painel.hidden) fechar(); });

    lista.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-acao]');
      if (!b) return;
      var item = itens.find(function (i) { return i.id === b.getAttribute('data-id'); });
      if (!item) return;
      var acao = b.getAttribute('data-acao');
      if (acao === 'mais') item.qtd = Math.min(CONFIG.maxQtd, item.qtd + 1);
      if (acao === 'menos') item.qtd -= 1;
      if (acao === 'tirar') item.qtd = 0;
      itens = itens.filter(function (i) { return i.qtd > 0; });
      guardar();
    });

    form.entrega.addEventListener('change', function () {
      var precisa = form.entrega.value !== 'recolha';
      painel.querySelector('[data-morada]').hidden = !precisa;
      form.morada.required = precisa;
    });
    form.addEventListener('submit', enviar);
    form.addEventListener('input', function () { painel.querySelector('.cart-erro').hidden = true; });
    painel.querySelector('[data-esvaziar]').addEventListener('click', function () {
      itens = []; guardar(); form.reset(); passo('itens'); fechar();
    });
    painel.querySelector('[data-reenviar]').addEventListener('click', function () { abrirWhatsApp(ultimaMensagem); });

    painel._fundo = fundo;
  }

  function passo(nome) {
    painel.querySelectorAll('.cart-passo').forEach(function (p) { p.hidden = p.getAttribute('data-passo') !== nome; });
    painel.querySelector('#cart-titulo').textContent =
      nome === 'dados' ? 'Os seus dados' : nome === 'enviado' ? 'Encomenda pronta' : 'O seu carrinho';
    painel.scrollTop = 0;
    if (nome === 'dados') prepararData();
  }

  var focoAnterior = null;
  function abrir() {
    focoAnterior = document.activeElement;
    passo(painel.querySelector('[data-passo="enviado"]').hidden || itens.length === 0 ? 'itens' : 'enviado');
    painel.hidden = false;
    painel._fundo.hidden = false;
    document.documentElement.classList.add('cart-aberto');
    requestAnimationFrame(function () { painel.classList.add('is-open'); painel._fundo.classList.add('is-open'); });
    painel.querySelector('.cart-fechar').focus();
  }
  function fechar() {
    painel.classList.remove('is-open');
    painel._fundo.classList.remove('is-open');
    document.documentElement.classList.remove('cart-aberto');
    setTimeout(function () { painel.hidden = true; painel._fundo.hidden = true; }, 250);
    if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
  }

  function desenhar() {
    var t = total();
    contadores.forEach(function (c) { c.textContent = t.unidades ? String(t.unidades) : ''; });
    document.querySelectorAll('.cart-open').forEach(function (b) {
      b.classList.toggle('tem-itens', t.unidades > 0);
      b.setAttribute('aria-label', 'Carrinho' + (t.unidades ? ', ' + t.unidades + (t.unidades === 1 ? ' produto' : ' produtos') : ', vazio'));
    });
    if (!lista) return;
    if (!itens.length) {
      lista.innerHTML = '';
      rodape.innerHTML = '<p class="cart-vazio">O carrinho está vazio.</p><a class="button primary" href="' + BASE + 'loja.html">Ver a loja</a>';
      return;
    }
    lista.innerHTML = itens.map(function (i) {
      var preco = typeof i.preco === 'number'
        ? (i.desde ? 'desde ' : '') + euros(i.preco)
        : 'preço a confirmar';
      return '<li class="cart-item">' +
        (i.img ? '<img src="' + BASE + esc(i.img) + '" alt="" width="64" height="64" loading="lazy">' : '<span class="cart-item-img"></span>') +
        '<div class="cart-item-info"><strong>' + esc(i.nome) + '</strong><span>' + preco + '</span></div>' +
        '<div class="cart-qtd" role="group" aria-label="Quantidade de ' + esc(i.nome) + '">' +
          '<button type="button" data-acao="menos" data-id="' + esc(i.id) + '" aria-label="Menos um">−</button>' +
          '<span aria-live="polite">' + i.qtd + '</span>' +
          '<button type="button" data-acao="mais" data-id="' + esc(i.id) + '" aria-label="Mais um">+</button>' +
        '</div>' +
        '<button type="button" class="cart-tirar" data-acao="tirar" data-id="' + esc(i.id) + '" aria-label="Tirar ' + esc(i.nome) + ' do carrinho">Tirar</button>' +
      '</li>';
    }).join('');
    rodape.innerHTML =
      '<div class="cart-total"><span>Total estimado</span><strong>' + (t.soma ? 'desde ' + euros(t.soma) : 'a confirmar') + '</strong></div>' +
      (t.porConfirmar && t.soma ? '<p class="cart-total-extra">+ ' + t.porConfirmar + (t.porConfirmar === 1 ? ' produto' : ' produtos') + ' com preço a confirmar</p>' : '') +
      '<p class="cart-ajuda">Os preços são "desde": o valor final depende do tamanho e dos detalhes, e a Clo confirma-o antes do pagamento.' +
      ' Entrega: 5€ em Lisboa, 8€ na Margem Sul, grátis acima de 100€.</p>' +
      '<button type="button" class="button primary cart-seguinte">Continuar</button>';
    rodape.querySelector('.cart-seguinte').addEventListener('click', function () { passo('dados'); });
  }

  function textoTotal(t) {
    var s = t.soma ? 'desde ' + euros(t.soma) : '';
    if (t.porConfirmar) s += (s ? ' + ' : '') + 'a confirmar';
    return s;
  }

  /* ---------- Datas ---------- */
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function prepararData() {
    var dias = itens.reduce(function (m, i) { return Math.max(m, i.dias || CONFIG.antecedenciaPadrao); }, CONFIG.antecedenciaPadrao);
    var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + dias);
    form.data.min = iso(d);
    if (form.data.value && form.data.value < form.data.min) form.data.value = '';
    painel.querySelector('[data-ajuda-data]').textContent =
      'Pedimos pelo menos ' + dias + ' dias de antecedência para ' + (itens.length > 1 ? 'estes doces' : 'este doce') + '.';
  }

  /* ---------- Enviar ---------- */
  var ultimaMensagem = '';
  function enviar(e) {
    e.preventDefault();
    var erro = painel.querySelector('.cart-erro');
    var faltas = [];
    if (!form.nome.value.trim()) faltas.push('o nome');
    if (form.tel.value.replace(/\D/g, '').length < 9) faltas.push('um telemóvel válido');
    if (!form.data.value) faltas.push('o dia');
    else if (form.data.value < form.data.min) faltas.push('um dia a partir de ' + form.data.min.split('-').reverse().join('/'));
    if (form.morada.required && !form.morada.value.trim()) faltas.push('a morada de entrega');
    if (faltas.length) {
      erro.textContent = 'Falta ' + faltas.join(', ') + '.';
      erro.hidden = false;
      return;
    }
    erro.hidden = true;

    var t = total();
    var entrega = CONFIG.entrega.find(function (x) { return x.valor === form.entrega.value; });
    var linhas = ['Olá Clo! Encomenda pelo site (casaclodoces.com)', ''];
    itens.forEach(function (i) {
      linhas.push(i.qtd + ' × ' + i.nome + ' (' + (typeof i.preco === 'number' ? (i.desde ? 'desde ' : '') + euros(i.preco) : 'preço a confirmar') + ')');
    });
    linhas.push('Total estimado: ' + textoTotal(t), '');
    linhas.push('Nome: ' + form.nome.value.trim());
    linhas.push('Telemóvel: ' + form.tel.value.trim());
    linhas.push('Dia: ' + form.data.value.split('-').reverse().join('/'));
    linhas.push('Entrega: ' + (entrega ? entrega.texto : form.entrega.value));
    if (form.morada.required) linhas.push('Morada: ' + form.morada.value.trim());
    if (form.alergias.value.trim()) linhas.push('Alergias: ' + form.alergias.value.trim());
    if (form.mensagem.value.trim()) linhas.push('Mensagem no bolo: ' + form.mensagem.value.trim());
    if (form.notas.value.trim()) linhas.push('', 'Notas:', form.notas.value.trim());
    ultimaMensagem = linhas.join('\n');
    abrirWhatsApp(ultimaMensagem);
    passo('enviado');
  }

  function abrirWhatsApp(texto) {
    var url = 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(texto);
    var janela = window.open(url, '_blank');
    if (janela) janela.opener = null; else window.location.href = url;
  }

  /* ---------- Aviso "adicionado" ---------- */
  var tempoAviso;
  function aviso(nome) {
    toast.innerHTML = '<span><strong>' + esc(nome) + '</strong> está no carrinho.</span><button type="button">Ver carrinho</button>';
    toast.querySelector('button').addEventListener('click', function () { toast.hidden = true; abrir(); });
    toast.hidden = false;
    toast.classList.remove('is-open');
    void toast.offsetWidth;
    toast.classList.add('is-open');
    clearTimeout(tempoAviso);
    tempoAviso = setTimeout(function () { toast.classList.remove('is-open'); setTimeout(function () { toast.hidden = true; }, 250); }, 3500);
  }

  // Outro separador mudou o carrinho
  window.addEventListener('storage', function (e) { if (e.key === CONFIG.chave) { itens = ler(); desenhar(); } });

  function iniciar() {
    prepararCartoes();
    criarInterface();
    desenhar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
