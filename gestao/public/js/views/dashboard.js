// Vista: Hoje — painel do dia e próxima semana.
import * as db from "../api.js";
import { esc, money, datePt, dateLong, badge, todayISO, addDaysISO } from "../ui.js";

export async function renderDashboard(el) {
  const today = todayISO();
  const d = await db.dashboard(today);

  const hojeLinhas = d.todayOrders.map((o) => `
    <tr class="rowlink" data-href="#/orders/${o.order_id}">
      <td><strong>#${o.number}</strong></td>
      <td>${esc(o.customer_name)}</td>
      <td>${o.fulfilment === "entrega" ? "entrega" : "recolha"}${o.orders?.delivery_time ? " · " + esc(o.orders.delivery_time) : ""}</td>
      <td class="num">${money(o.due_cents)}</td>
      <td>${badge(o.status)}</td>
    </tr>`).join("");

  const porDia = new Map();
  for (const o of d.upcoming) {
    if (!porDia.has(o.delivery_date)) porDia.set(o.delivery_date, []);
    porDia.get(o.delivery_date).push(o);
  }
  const semanaHtml = [...porDia.entries()].map(([dia, os]) => `
    <div style="margin-bottom:14px">
      <p style="margin:0 0 4px; font-size:12px; text-transform:uppercase; letter-spacing:0.08em" class="muted">
        ${esc(dateLong(dia))}
      </p>
      ${os.map((o) => `
        <div style="display:flex; justify-content:space-between; gap:10px; padding:5px 0; border-bottom:1px solid var(--mist); cursor:pointer"
             class="rowlink2" data-href="#/orders/${o.order_id}">
          <span><strong>#${o.number}</strong> · ${esc(o.customer_name)}</span>
          <span class="muted" style="white-space:nowrap">${money(o.total_cents)} ${badge(o.status)}</span>
        </div>`).join("")}
    </div>`).join("") || `<div class="empty">Sem encomendas nos próximos 7 dias.</div>`;

  el.innerHTML = `
    <div class="page-head">
      <h1>Hoje · ${esc(datePt(today))}</h1>
      <div class="actions"><a href="#/orders/new"><button>+ Nova encomenda</button></a></div>
    </div>

    <div class="cards">
      <div class="card">
        <div class="k">Entregas / recolhas hoje</div>
        <div class="v">${d.todayOrders.length}</div>
        <div class="s">${d.todayOrders.filter((o) => o.due_cents > 0).length} com saldo a receber</div>
      </div>
      <div class="card">
        <div class="k">Novas por confirmar</div>
        <div class="v">${d.novas}</div>
        <div class="s"><a href="#/orders?status=recebida&periodo=tudo">ver encomendas recebidas</a></div>
      </div>
      <div class="card">
        <div class="k">A receber (total)</div>
        <div class="v">${money(d.aReceber)}</div>
        <div class="s">encomendas não pagas e não entregues</div>
      </div>
      <div class="card">
        <div class="k">Recebido este mês</div>
        <div class="v">${money(d.mesRecebido)}</div>
        <div class="s"><a href="#/payments">ver pagamentos</a></div>
      </div>
    </div>

    <div class="panel">
      <h3>Hoje</h3>
      ${d.todayOrders.length
        ? `<table>
            <thead><tr><th>Nº</th><th>Cliente</th><th>Modo</th><th class="num">Falta</th><th>Estado</th></tr></thead>
            <tbody>${hojeLinhas}</tbody>
          </table>`
        : `<div class="empty">Nada marcado para hoje. ${esc(dateLong(today))} 🎂</div>`}
    </div>

    <div class="panel">
      <h3>Próximos 7 dias <span class="muted" style="font-size:13px">até ${esc(datePt(addDaysISO(today, 7)))}</span></h3>
      <div class="panel-body">${semanaHtml}</div>
    </div>`;

  el.querySelectorAll(".rowlink, .rowlink2").forEach((tr) =>
    tr.addEventListener("click", () => { location.hash = tr.dataset.href; }));
}
