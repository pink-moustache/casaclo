// Vista: Clientes — lista com pesquisa e totais.
import * as db from "../api.js";
import { esc, money, toast } from "../ui.js";

export async function renderCustomers(el) {
  let cliDebounce;
  const { data: rows, error } = await db.listCustomers();
  if (error) {
    el.innerHTML = `<div class="panel"><div class="error-box">${esc(error.message || "Erro")}</div></div>`;
    return;
  }

  const trs = rows.map((c) => `
    <tr class="rowlink" data-href="#/customers/${c.id}">
      <td><strong>${esc(c.name)}</strong>${c.allergies ? `<br><span class="badge st-pronta" style="margin-top:2px">alergias: ${esc(c.allergies)}</span>` : ""}</td>
      <td>${esc(c.phone || "")}</td>
      <td class="hide-sm">${esc(c.email || "")}</td>
      <td class="num">${c.n_orders}</td>
      <td class="num">${money(c.total)}</td>
    </tr>`).join("");

  el.innerHTML = `
    <div class="page-head">
      <h1>Clientes</h1>
      <div class="actions"><a href="#/orders/new"><button>+ Nova encomenda</button></a></div>
    </div>
    <div class="toolbar">
      <input type="search" id="cli-q" placeholder="Nome, telefone ou email…" style="max-width:320px">
    </div>
    <div class="panel">
      ${rows.length
        ? `<table>
            <thead><tr><th>Cliente</th><th>Telefone</th><th class="hide-sm">Email</th><th class="num">Encomendas</th><th class="num">Total</th></tr></thead>
            <tbody id="cli-body">${trs}</tbody>
          </table>`
        : `<div class="empty">Ainda sem clientes. Cria o primeiro ao registar uma encomenda.</div>`}
    </div>`;

  el.querySelector("#cli-q").addEventListener("input", (e) => {
    clearTimeout(cliDebounce);
    cliDebounce = setTimeout(async () => {
      const { data: filtered, error } = await db.listCustomers(e.target.value);
      if (error) { toast("A pesquisa falhou — tenta de novo.", "err"); return; }
      const body = el.querySelector("#cli-body");
      body.innerHTML = (filtered || []).map((c) => `
        <tr class="rowlink" data-href="#/customers/${c.id}">
          <td><strong>${esc(c.name)}</strong></td>
          <td>${esc(c.phone || "")}</td>
          <td class="hide-sm">${esc(c.email || "")}</td>
          <td class="num">${c.n_orders}</td>
          <td class="num">${money(c.total)}</td>
        </tr>`).join("") || `<tr><td colspan="5" class="empty">Sem resultados.</td></tr>`;
      body.querySelectorAll(".rowlink").forEach((tr) =>
        tr.addEventListener("click", () => { location.hash = tr.dataset.href; }));
    }, 300);
  });

  el.querySelectorAll(".rowlink").forEach((tr) =>
    tr.addEventListener("click", () => { location.hash = tr.dataset.href; }));
}
