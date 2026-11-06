// Vista: detalhe da encomenda + formulário de criação/edição.
import * as db from "../api.js";
import { esc, money, parseMoney, datePt, tsPt, badge, STATUSES, FLOW, payState, toast, errMessage, todayISO } from "../ui.js";

/* ============================ DETALHE ============================ */

export async function renderOrderDetail(el, id) {
  const { data: o, error } = await db.getOrder(id);
  if (error) {
    el.innerHTML = `<div class="panel"><div class="error-box">Encomenda não encontrada: ${esc(errMessage(error))}</div></div>`;
    return;
  }
  const c = o.customers || {};
  const paid = (o.payments || []).reduce((s, p) => s + p.amount_cents, 0);
  const due = o.total_cents - paid;
  const ps = payState(paid, due);
  const st = STATUSES[o.status];
  const items = Array.isArray(o.items) ? o.items : [];

  const nextBtn = st?.next
    ? `<button id="btn-advance" class="small">Marcar "${STATUSES[st.next].label}"</button>`
    : "";
  const cancelBtn = !["entregue", "cancelada"].includes(o.status)
    ? `<button id="btn-cancel" class="danger small">Cancelar encomenda</button>` : "";

  const itemsHtml = items.length
    ? `<table><thead><tr><th>Artigo</th><th class="num">Qtd</th><th class="num">Unit.</th><th class="num">Total</th></tr></thead>
       <tbody>${items.map((it) => `
         <tr><td>${esc(it.desc)}</td>
         <td class="num">${esc(it.qty)}</td>
         <td class="num">${money(it.unit_cents)}</td>
         <td class="num">${money(Math.round(it.qty * it.unit_cents))}</td></tr>`).join("")}
       </tbody></table>`
    : `<div class="empty">Sem artigos registados.</div>`;

  const payRows = (o.payments || []).map((p) => `
    <tr>
      <td>${esc(datePt(p.paid_on))}</td>
      <td>${esc(p.payment_methods?.name || "—")}</td>
      <td class="num">${money(p.amount_cents)}</td>
      <td>${esc(p.note || "")}</td>
      <td><button class="danger small del-pay" data-id="${p.id}">×</button></td>
    </tr>`).join("");

  const events = (o.events || []).map((ev) => {
    const label = ev.kind === "status_change"
      ? `${STATUSES[ev.from_status]?.label || ev.from_status} → ${STATUSES[ev.to_status]?.label || ev.to_status}`
      : ev.kind === "created" ? "encomenda criada" : (ev.detail || ev.kind);
    return `<li><span>${esc(label)}</span><span class="t">${esc(tsPt(ev.created_at))}${ev.profiles?.display_name ? " · " + esc(ev.profiles.display_name) : ""}</span></li>`;
  }).join("") || `<li class="muted">Sem eventos.</li>`;

  const alergias = [o.allergies, c.allergies].filter(Boolean).join(" · ");

  el.innerHTML = `
    <div class="page-head">
      <h1>Encomenda #${o.number} ${badge(o.status)}</h1>
      <div class="actions">
        ${nextBtn}
        <a href="#/orders/${o.id}/edit"><button class="ghost small">Editar</button></a>
        ${cancelBtn}
      </div>
    </div>

    <div class="cards">
      <div class="card"><div class="k">Cliente</div>
        <div class="v" style="font-size:19px"><a href="#/customers/${c.id}">${esc(c.name)}</a></div>
        <div class="s">${esc(c.phone || "")}${c.phone && c.email ? " · " : ""}${esc(c.email || "")}</div></div>
      <div class="card"><div class="k">Entrega / recolha</div>
        <div class="v" style="font-size:19px">${esc(datePt(o.delivery_date))}${o.delivery_time ? " · " + esc(o.delivery_time) : ""}</div>
        <div class="s">${o.fulfilment === "entrega" ? "Entrega" : "Recolha"}${o.address ? " — " + esc(o.address) : ""}</div></div>
      <div class="card"><div class="k">Valor</div>
        <div class="v">${money(o.total_cents)}</div>
        <div class="s"><span class="badge ${ps.cls}">${ps.label}</span> pago ${money(paid)} · falta ${money(Math.max(due, 0))}</div></div>
      <div class="card"><div class="k">Alergias</div>
        <div class="s" style="margin-top:6px">${alergias ? "<strong>" + esc(alergias) + "</strong>" : "sem registo"}</div>
        <div class="k" style="margin-top:10px">Canal</div><div class="s">${esc(o.channel)}</div></div>
    </div>

    <div class="grid-2">
      <div>
        <div class="panel">
          <h3>Artigos</h3>
          ${itemsHtml}
          ${o.notes ? `<div class="panel-body" style="padding-top:10px"><span class="k muted" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.08em">Notas</span><p style="margin:4px 0 0">${esc(o.notes)}</p></div>` : ""}
        </div>
        <div class="panel">
          <h3>Pagamentos</h3>
          ${o.payments?.length
            ? `<table><thead><tr><th>Data</th><th>Método</th><th class="num">Valor</th><th>Nota</th><th></th></tr></thead><tbody>${payRows}</tbody></table>`
            : `<div class="empty">Sem pagamentos.</div>`}
          <div class="panel-body">
            <form id="pay-form" style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end">
              <div style="flex:1; min-width:110px"><label>Data</label><input type="date" name="paid_on" value="${todayISO()}"></div>
              <div style="flex:1; min-width:110px"><label>Valor (€)</label><input name="amount" required placeholder="ex.: 15" inputmode="decimal"></div>
              <div style="flex:1; min-width:130px"><label>Método</label><select name="method"></select></div>
              <div style="flex:2; min-width:140px"><label>Nota</label><input name="note" placeholder="sinal, resto…"></div>
              <button class="small">Registar</button>
            </form>
            ${due > 0 ? `<p class="section-note">Falta receber ${money(due)}.</p>` : `<p class="section-note">Encomenda liquidada.</p>`}
          </div>
        </div>
      </div>
      <div>
        <div class="panel">
          <h3>Histórico</h3>
          <div class="panel-body"><ul class="timeline">${events}</ul></div>
        </div>
      </div>
    </div>`;

  // métodos no select
  const { data: methods } = await db.listMethods();
  const sel = el.querySelector('#pay-form select[name="method"]');
  sel.innerHTML = (methods || []).filter((m) => m.active)
    .map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("");

  el.querySelector("#pay-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const amount = parseMoney(f.get("amount"));
    if (!amount || amount <= 0) { toast("Valor inválido.", "err"); return; }
    const { error: err } = await db.addPayment({
      order_id: o.id, amount_cents: amount,
      method_id: Number(f.get("method")) || null,
      paid_on: f.get("paid_on") || todayISO(),
      note: f.get("note") || null,
    });
    if (err) { toast(errMessage(err), "err"); return; }
    toast("Pagamento registado.", "ok");
    renderOrderDetail(el, id);
  });

  el.querySelectorAll(".del-pay").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Apagar este pagamento?")) return;
      const { error: err } = await db.deletePayment(b.dataset.id);
      if (err) { toast(errMessage(err), "err"); return; }
      renderOrderDetail(el, id);
    }));

  const adv = el.querySelector("#btn-advance");
  if (adv) adv.addEventListener("click", async () => {
    const { error: err } = await db.setOrderStatus(o.id, st.next);
    if (err) { toast(errMessage(err), "err"); return; }
    renderOrderDetail(el, id);
  });

  const cnc = el.querySelector("#btn-cancel");
  if (cnc) cnc.addEventListener("click", async () => {
    if (!confirm(`Cancelar a encomenda #${o.number}?`)) return;
    const { error: err } = await db.setOrderStatus(o.id, "cancelada");
    if (err) { toast(errMessage(err), "err"); return; }
    renderOrderDetail(el, id);
  });
}

/* ============================ FORMULÁRIO ============================ */

function itemRow(item = { desc: "", qty: 1, unit: "" }) {
  return `
  <tr class="item-row">
    <td><input class="it-desc" placeholder="ex.: Bolo de chocolate 18cm" value="${esc(item.desc)}"></td>
    <td style="width:80px"><input class="it-qty" type="number" min="0.5" step="0.5" value="${esc(item.qty)}"></td>
    <td style="width:110px"><input class="it-unit" inputmode="decimal" placeholder="€" value="${item.unit !== "" && item.unit != null ? (item.unit / 100).toFixed(2).replace(".", ",") : ""}"></td>
    <td class="num it-total" style="white-space:nowrap">—</td>
    <td class="items-editor-del" style="width:34px"><button type="button" class="ghost small del-item">×</button></td>
  </tr>`;
}

export async function renderOrderForm(el, id) {
  let o = null;
  if (id) {
    const { data, error } = await db.getOrder(id);
    if (error || !data) {
      el.innerHTML = `<div class="panel"><div class="error-box">Encomenda não encontrada.</div></div>`;
      return;
    }
    o = data;
  }

  const items = o ? (Array.isArray(o.items) ? o.items : []).map((it) => ({ desc: it.desc, qty: it.qty, unit: it.unit_cents })) : [];
  if (!items.length) items.push({ desc: "", qty: 1, unit: "" });

  el.innerHTML = `
    <div class="page-head">
      <h1>${o ? `Editar encomenda #${o.number}` : "Nova encomenda"}</h1>
    </div>
    <form id="order-form">
      <div class="grid-2">
        <div class="panel">
          <h3>Cliente</h3>
          <div class="panel-body">
            <label>Cliente existente</label>
            <select name="customer_id" id="cust-select">
              <option value="">— escolher —</option>
            </select>
            <p class="section-note" style="margin-top:14px">…ou criar novo:</p>
            <label>Nome</label><input name="new_name" placeholder="nome do cliente">
            <label>Telefone</label><input name="new_phone" placeholder="+351 …">
            <div id="cust-warn"></div>
          </div>
        </div>
        <div class="panel">
          <h3>Entrega</h3>
          <div class="panel-body">
            <div style="display:flex; gap:10px">
              <div style="flex:1"><label>Data</label><input type="date" name="delivery_date" required value="${o?.delivery_date || todayISO()}"></div>
              <div style="width:110px"><label>Hora</label><input name="delivery_time" placeholder="17:00" value="${esc(o?.delivery_time || "")}"></div>
            </div>
            <label>Modo</label>
            <select name="fulfilment">
              <option value="recolha" ${o?.fulfilment !== "entrega" ? "selected" : ""}>Recolha</option>
              <option value="entrega" ${o?.fulfilment === "entrega" ? "selected" : ""}>Entrega</option>
            </select>
            <label>Morada (se entrega)</label><input name="address" value="${esc(o?.address || "")}">
            <label>Canal de origem</label>
            <select name="channel">
              ${["whatsapp", "email", "telefone", "loja", "outro"].map((ch) =>
                `<option value="${ch}" ${(o?.channel || "whatsapp") === ch ? "selected" : ""}>${ch}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>Artigos <button type="button" class="ghost small" id="add-item">+ linha</button></h3>
        <table class="items-editor">
          <thead><tr><th>Descrição</th><th class="num">Qtd</th><th class="num">Preço unit. (€)</th><th class="num">Total</th><th></th></tr></thead>
          <tbody id="items-body">${items.map(itemRow).join("")}</tbody>
          <tfoot>
            <tr><td colspan="3" style="text-align:right"><strong>Total</strong></td>
            <td class="num"><strong id="grand-total">—</strong></td><td></td></tr>
            <tr><td colspan="5" style="border:none">
              <label style="margin:0">Ajuste/desconto no total (€, opcional)</label>
              <input name="total_adjust" id="total-adjust" inputmode="decimal" style="max-width:160px" placeholder="deixa vazio = soma das linhas">
            </td></tr>
          </tfoot>
        </table>
      </div>

      <div class="panel">
        <h3>Notas e alergias</h3>
        <div class="panel-body">
          <label>Alergias desta encomenda</label>
          <input name="allergies" value="${esc(o?.allergies || "")}" placeholder="ex.: sem frutos secos">
          <label>Notas internas</label>
          <textarea name="notes">${esc(o?.notes || "")}</textarea>
        </div>
      </div>

      <p style="display:flex; gap:8px">
        <button type="submit">${o ? "Guardar alterações" : "Criar encomenda"}</button>
        <a href="${o ? `#/orders/${o.id}` : "#/orders"}"><button type="button" class="ghost">Voltar</button></a>
      </p>
    </form>`;

  /* ---- clientes no select ---- */
  const { data: customers } = await db.listCustomers();
  const selCust = el.querySelector("#cust-select");
  selCust.innerHTML = `<option value="">— escolher —</option>` +
    (customers || []).map((c) =>
      `<option value="${c.id}" ${o?.customer_id === c.id ? "selected" : ""}>${esc(c.name)}${c.phone ? " · " + esc(c.phone) : ""}</option>`).join("");

  /* ---- total dinâmico ---- */
  const tbody = el.querySelector("#items-body");
  function recompute() {
    let total = 0;
    tbody.querySelectorAll(".item-row").forEach((tr) => {
      const qty = parseFloat(tr.querySelector(".it-qty").value) || 0;
      const unit = parseMoney(tr.querySelector(".it-unit").value) || 0;
      const line = Math.round(qty * unit);
      total += line;
      tr.querySelector(".it-total").textContent = line ? money(line) : "—";
    });
    const adjust = parseMoney(el.querySelector("#total-adjust").value);
    if (adjust != null) total = adjust;
    el.querySelector("#grand-total").textContent = money(total);
    return total;
  }
  tbody.addEventListener("input", recompute);
  el.querySelector("#total-adjust").addEventListener("input", recompute);
  el.querySelector("#add-item").addEventListener("click", () => {
    tbody.insertAdjacentHTML("beforeend", itemRow());
    tbody.lastElementChild.querySelector(".it-desc").focus();
  });
  tbody.addEventListener("click", (e) => {
    if (e.target.classList.contains("del-item")) {
      if (tbody.querySelectorAll(".item-row").length > 1) e.target.closest("tr").remove();
      else { e.target.closest("tr").querySelectorAll("input").forEach((i) => (i.value = "")); }
      recompute();
    }
  });
  recompute();

  /* ---- submissão ---- */
  el.querySelector("#order-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    // cliente: existente ou novo
    let customerId = f.get("customer_id");
    if (!customerId) {
      const newName = String(f.get("new_name") || "").trim();
      if (!newName) {
        toast("Escolhe um cliente existente ou escreve o nome do novo.", "err");
        btn.disabled = false; return;
      }
      const { data: nc, error: nerr } = await db.createCustomer({
        name: newName, phone: String(f.get("new_phone") || "").trim() || null,
      });
      if (nerr) { toast(errMessage(nerr), "err"); btn.disabled = false; return; }
      customerId = nc.id;
    }

    // itens
    const its = [];
    tbody.querySelectorAll(".item-row").forEach((tr) => {
      const desc = tr.querySelector(".it-desc").value.trim();
      const qty = parseFloat(tr.querySelector(".it-qty").value) || 0;
      const unit = parseMoney(tr.querySelector(".it-unit").value);
      if (desc && qty > 0 && unit != null) its.push({ desc, qty, unit_cents: unit });
    });
    const adjust = parseMoney(f.get("total_adjust"));
    const totalCents = adjust != null ? adjust : its.reduce((s, it) => s + Math.round(it.qty * it.unit_cents), 0);

    const payload = {
      customer_id: customerId,
      delivery_date: f.get("delivery_date"),
      delivery_time: String(f.get("delivery_time") || "").trim() || null,
      fulfilment: f.get("fulfilment"),
      address: f.get("fulfilment") === "entrega" ? String(f.get("address") || "").trim() || null : null,
      channel: f.get("channel"),
      items: its,
      total_cents: totalCents,
      allergies: String(f.get("allergies") || "").trim() || null,
      notes: String(f.get("notes") || "").trim() || null,
    };

    if (o) {
      const { error } = await db.updateOrder(o.id, payload);
      if (error) { toast(errMessage(error), "err"); btn.disabled = false; return; }
      toast("Encomenda actualizada.", "ok");
      location.hash = `#/orders/${o.id}`;
    } else {
      const { data: created, error } = await db.createOrder(payload);
      if (error) { toast(errMessage(error), "err"); btn.disabled = false; return; }
      toast(`Encomenda #${created.number} criada.`, "ok");
      location.hash = `#/orders/${created.id}`;
    }
  });
}
