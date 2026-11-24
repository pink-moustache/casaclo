#!/usr/bin/env node
// Gera catalogo-whatsapp.csv (feed de produtos para o Meta Commerce Manager,
// que alimenta o catálogo do WhatsApp Business da Clo).
//
// Lê os cartões de produto de loja.html e natal.html. Não tem dependências.
// Correr depois de mudar produtos, preços ou fotos:
//     node scripts/gerar-catalogo.mjs
//
// Regras:
//  - um produto por título (o mesmo doce na loja e no Natal conta uma vez);
//  - produtos sem preço em número ("Preço a definir") ficam de fora, porque
//    a Meta recusa artigos sem preço; aparecem no aviso no fim;
//  - produtos do natal.html e com etiqueta "Natal" levam custom_label_0=natal,
//    para a coleção "Natal" no Commerce Manager;
//  - imagem: usa o .jpg quando existe (a Meta aceita melhor JPG que WebP).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://casaclodoces.com';
const SAIDA = 'catalogo-whatsapp.csv';

const ENTIDADES = { '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };
const texto = (html) =>
  html.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, (e) => ENTIDADES[e] ?? e).replace(/\s+/g, ' ').trim();

const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function lerPagina(ficheiro) {
  const html = readFileSync(join(RAIZ, ficheiro), 'utf8');
  const produtos = [];
  // Divide por sub-colecção (loja.html) para saber a linha de cada produto.
  const partes = html.split(/<div class="sub-collection-heading">/);
  for (let i = 0; i < partes.length; i++) {
    const parte = partes[i];
    const linha = i === 0 ? null : texto((parte.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || '');
    for (const m of parte.matchAll(/<article class="product-card">([\s\S]*?)<\/article>/g)) {
      const card = m[1];
      const titulo = texto((card.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || '');
      if (!titulo) continue;
      const descricao = texto((card.match(/<p>([\s\S]*?)<\/p>/) || [])[1] || '');
      const precoTxt = texto((card.match(/<span class="price">([\s\S]*?)<a /) || [])[1] || '');
      const preco = (precoTxt.match(/(\d+(?:[.,]\d+)?)\s*€/) || [])[1];
      const img = (card.match(/<img[^>]*src="([^"]+)"/) || [])[1];
      const etiqueta = texto((card.match(/<div class="product-topline"><span>([\s\S]*?)<\/span>/) || [])[1] || '');
      produtos.push({
        titulo, descricao, preco, precoTxt, img, etiqueta,
        linha: ficheiro === 'natal.html' ? 'Natal' : linha,
        natal: ficheiro === 'natal.html' || /natal/i.test(etiqueta),
        pagina: ficheiro,
      });
    }
  }
  return produtos;
}

function imagem(src) {
  if (!src) return '';
  const jpg = src.replace(/\.webp$/, '.jpg');
  return `${SITE}/${existsSync(join(RAIZ, jpg)) ? jpg : src}`;
}

const csv = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const porId = new Map();
const semPreco = [];
for (const p of [...lerPagina('loja.html'), ...lerPagina('natal.html')]) {
  const id = slug(p.titulo);
  const antes = porId.get(id);
  if (antes) {
    // Já veio da loja: só marca como Natal e aponta para a página de Natal.
    if (p.natal) { antes.natal = true; antes.pagina = 'natal.html'; }
    continue;
  }
  if (!p.preco || !p.img) { semPreco.push(`${p.titulo} (${!p.preco ? p.precoTxt || 'sem preço' : 'sem foto'})`); continue; }
  porId.set(id, { ...p, id });
}

const colunas = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'product_type', 'custom_label_0'];
const linhas = [colunas.join(',')];
for (const p of porId.values()) {
  const desde = /desde/i.test(p.precoTxt) ? `Preço desde ${p.preco}€. ` : '';
  const valor = Number(p.preco.replace(',', '.')).toFixed(2);
  linhas.push([
    p.id,
    p.titulo,
    `${desde}${p.descricao} Encomendas por WhatsApp.`.trim(),
    'in stock',
    'new',
    `${valor} EUR`,
    `${SITE}/${p.pagina}`,
    imagem(p.img),
    'Casa Clo',
    p.linha || '',
    p.natal ? 'natal' : '',
  ].map(csv).join(','));
}

writeFileSync(join(RAIZ, SAIDA), linhas.join('\n') + '\n');
console.log(`${SAIDA}: ${porId.size} produtos (${[...porId.values()].filter((p) => p.natal).length} de Natal).`);
if (semPreco.length) console.log(`Fora do feed até terem preço/foto: ${semPreco.join('; ')}`);
