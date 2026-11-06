// Vista: Pagamentos — mês a mês, com totais por método.
import * as db from "../api.js";
import { esc, money, datePt, monthLabel, toast, errMessage } from "../ui.js";

export async function renderPayments(el, parts, query) {
  const now = new Date();
  const y = Number(query.ano) || now.getFullYear();
  const m = Number(query.mes) != null && query.mes !== undefined ? Number(query.mes) : now.getMonth();
  const first = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const next = m === 11 ? `${y + 1}-01-01` : `${y}-${String(m + 2).padStart(2, "0")}-01`;

  const { data: pays, error } = await db.listPayments(first, next);
  if (error) {
    el.innerHTML = `<div class="panel"><div class="error-box">${esc(errMessage(error))}</div></div>`;
    return;
  }

  const rows = (pays || []).map((p) => `
    <tr class="rowlink" data-href="#/orders/${p.orders?.id || ""}" ${p.orders ? "" : 'style="opacity:.6"'}>
      <td>${esc(datePt(p.paid_on))}</td>
      <td>${p.orders ? `#${p.orders.number} · ${esc(p.orders.customers?.name || "?")}` : "—"}</td>
      <td>${esc(p.payment_methods?.name || "—")}</td>
      <td class="num">${money(p.amount_cents)}</td>
      <td class="hide-sm">${esc(p.note || "")}</td>
    </tr>`).join("");

  const total = (pays || []).reduce((s, p) => s + p.amount_cents, 0);
  const porMetodo = new Map();
  for (const p of pays || []) {
    const k = p.payment_methods?.name || "sem método";
    porMetodo.set(k, (porMetodo.get(k) || 0) + p.amount_cents);
  }

  const meses = Array.from({ length: 12 }, (_, i) =>
    `<a class="chip ${i === m ? "active" : ""}" href="#/payments?ano=${y}&mes=${i}">${monthLabel(y, i).split(" ")[0].slice(0, 3)}</a>`).join("");
  const anos = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((yy) =>
    `<a class="chip ${yy === y ? "active" : ""}" href="#/payments?ano=${yy}&mes=${m}">${yy}</a>`).join("");

  el.innerHTML = `
    <div class="page-head">
      <h1>Pagamentos — ${esc(monthLabel(y, m))}</h1>
    </div>
    <div class="toolbar">
      <div class="chips">${anos}</div>
      <div class="chips">${meses}</div>
    </div>
    <div class="cards">
      <div class="card" style="grid-column: span 2">
        <div class="k">Recebido em ${esc(monthLabel(y, m))}</div>
        <div class="v">${money(total)}</div>
        <div class="s">${pays?.length || 0} pagamentos</div>
      </div>
      ${[...porMetodo.entries()].map(([k, v]) => `
        <div class="card"><div class="k">${esc(k)}</div><div class="v" style="font-size:20px">${money(v)}</div></div>`).join("")}
    </div>
    <div class="panel">
      ${(pays || []).length
        ? `<table>
            <thead><tr><th>Data</th><th>Encomenda</th><th>Método</th><th class="num">Valor</th><th class="hide-sm">Nota</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`
        : `<div class="empty">Sem pagamentos em ${esc(monthLabel(y, m))}.</div>`}
    </div>`;

  el.querySelectorAll(".rowlink").forEach((tr) => {
    if (tr.dataset.href && tr.dataset.href !== "#/orders/") {
      tr.addEventListener("click", () => { location.hash = tr.dataset.href; });
    }
  });
}
