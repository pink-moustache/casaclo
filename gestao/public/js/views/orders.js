// Vista: Encomendas — lista com filtros de estado, período e pesquisa.
import * as db from "../api.js";
import { esc, money, datePt, badge, STATUSES, payState, todayISO, addDaysISO, toast, errMessage } from "../ui.js";

const PERIODOS = [
  ["prox7", "Próximos 7 dias"],
  ["hoje", "Hoje"],
  ["mes", "Últimos 30 dias"],
  ["tudo", "Todas"],
];

function periodo(params) {
  const today = todayISO();
  switch (params.periodo) {
    case "hoje": return { from: today, to: today };
    case "mes":  return { from: addDaysISO(today, -30), to: addDaysISO(today, 30) };
    case "tudo": return { order: "desc" };
    default:     return { from: today }; // prox7 (default)
  }
}

export async function renderOrders(el, parts, query) {
  const status = query.status || "todas";
  const periodoSel = query.periodo || "prox7";
  const q = query.q || "";

  const filtros = { status, q, ...periodo({ ...query, periodo: periodoSel }) };
  const { data: rows, error } = await db.listOrders(filtros);
  if (error) {
    el.innerHTML = `<div class="panel"><div class="error-box">${esc(errMessage(error))}</div></div>`;
    return;
  }

  const chips = ["todas", ...Object.keys(STATUSES)].map((s) => {
    const label = s === "todas" ? "Todas" : STATUSES[s].label;
    const qs = new URLSearchParams({ ...(q && { q }), ...(periodoSel !== "prox7" && { periodo: periodoSel }), ...(s !== "todas" && { status: s }) });
    return `<a class="chip ${s === status ? "active" : ""}" href="#/orders?${qs}">${label}</a>`;
  }).join("");

  const pChips = PERIODOS.map(([id, label]) => {
    const qs = new URLSearchParams({ ...(q && { q }), ...(status !== "todas" && { status }), periodo: id });
    return `<a class="chip ${id === periodoSel ? "active" : ""}" href="#/orders?${qs}">${label}</a>`;
  }).join("");

  const trs = rows.map((o) => {
    const due = o.total_cents - o.paid_cents;
    const ps = payState(o.paid_cents, due);
    return `
    <tr class="rowlink" data-href="#/orders/${o.id}">
      <td><strong>#${o.number}</strong></td>
      <td>${esc(o.customers?.name || "?")}<br><span class="muted" style="font-size:12px">${esc(o.customers?.phone || "")}</span></td>
      <td>${esc(datePt(o.delivery_date))}${o.delivery_time ? `<br><span class="muted" style="font-size:12px">${esc(o.delivery_time)}</span>` : ""}</td>
      <td>${o.fulfilment === "entrega" ? "Entrega" : "Recolha"}</td>
      <td class="num">${money(o.total_cents)}<br><span class="badge ${ps.cls}" style="margin-top:2px">${ps.label}</span></td>
      <td>${badge(o.status)}</td>
    </tr>`;
  }).join("");

  el.innerHTML = `
    <div class="page-head">
      <h1>Encomendas</h1>
      <div class="actions"><a href="#/orders/new"><button>+ Nova encomenda</button></a></div>
    </div>
    <div class="toolbar">
      <input type="search" id="ord-q" placeholder="Cliente ou nº…" value="${esc(q)}">
      <div class="chips">${pChips}</div>
    </div>
    <div class="toolbar"><div class="chips">${chips}</div></div>
    <div class="panel">
      ${rows.length
        ? `<table>
            <thead><tr><th>Nº</th><th>Cliente</th><th>Entrega</th><th>Modo</th><th class="num">Valor</th><th>Estado</th></tr></thead>
            <tbody>${trs}</tbody>
          </table>`
        : `<div class="empty">Sem encomendas para este filtro.</div>`}
    </div>`;

  // pesquisa: Enter ou 300ms sem escrever
  const input = el.querySelector("#ord-q");
  let t;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const qs = new URLSearchParams({ ...(status !== "todas" && { status }), ...(periodoSel !== "prox7" && { periodo: periodoSel }), ...(input.value.trim() && { q: input.value.trim() }) });
      location.hash = `#/orders?${qs}`;
    }, 300);
  });

  el.querySelectorAll(".rowlink").forEach((tr) =>
    tr.addEventListener("click", () => { location.hash = tr.dataset.href; }));
}
