// Vista: ficha de cliente — dados editáveis + histórico de encomendas.
import * as db from "../api.js";
import { esc, money, datePt, badge, toast, errMessage } from "../ui.js";

export async function renderCustomer(el, id) {
  const { data: c, error } = await db.getCustomer(id);
  if (error || !c) {
    el.innerHTML = `<div class="panel"><div class="error-box">Cliente não encontrado.</div></div>`;
    return;
  }

  const orders = c.orders || [];
  const total = orders.filter((o) => o.status !== "cancelada").reduce((s, o) => s + o.total_cents, 0);

  const rows = orders.map((o) => `
    <tr class="rowlink" data-href="#/orders/${o.id}">
      <td><strong>#${o.number}</strong></td>
      <td>${esc(datePt(o.delivery_date))}</td>
      <td class="num">${money(o.total_cents)}</td>
      <td>${badge(o.status)}</td>
    </tr>`).join("");

  el.innerHTML = `
    <div class="page-head">
      <h1>${esc(c.name)}</h1>
      <div class="actions"><a href="#/orders/new"><button>+ Nova encomenda</button></a></div>
    </div>
    <div class="cards">
      <div class="card"><div class="k">Encomendas</div><div class="v">${orders.length}</div><div class="s">desde ${esc(datePt(orders.length ? orders[orders.length - 1].delivery_date : c.created_at?.slice(0, 10)))}</div></div>
      <div class="card"><div class="k">Total histórico</div><div class="v">${money(total)}</div><div class="s">sem canceladas</div></div>
      <div class="card"><div class="k">Alergias</div><div class="s" style="margin-top:8px">${c.allergies ? "<strong>" + esc(c.allergies) + "</strong>" : "sem registo"}</div></div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <h3>Dados <button class="ghost small" id="btn-edit">Editar</button></h3>
        <div class="panel-body">
          <dl class="kv">
            <dt>Telefone</dt><dd>${esc(c.phone || "—")}</dd>
            <dt>Email</dt><dd>${esc(c.email || "—")}</dd>
            <dt>Morada</dt><dd>${esc(c.address || "—")}</dd>
            <dt>NIF</dt><dd>${esc(c.nif || "—")}</dd>
            <dt>Preferências</dt><dd>${esc(c.preferences || "—")}</dd>
            <dt>Notas</dt><dd>${esc(c.notes || "—")}</dd>
          </dl>
          <form id="cust-form" hidden>
            <label>Nome</label><input name="name" required value="${esc(c.name)}">
            <label>Telefone</label><input name="phone" value="${esc(c.phone || "")}">
            <label>Email</label><input name="email" type="email" value="${esc(c.email || "")}">
            <label>Morada</label><input name="address" value="${esc(c.address || "")}">
            <label>NIF</label><input name="nif" value="${esc(c.nif || "")}" pattern="[0-9]{9}" title="9 dígitos">
            <label>Alergias</label><input name="allergies" value="${esc(c.allergies || "")}">
            <label>Preferências</label><input name="preferences" value="${esc(c.preferences || "")}">
            <label>Notas</label><textarea name="notes">${esc(c.notes || "")}</textarea>
            <p style="display:flex;gap:8px;margin-top:14px">
              <button class="small">Guardar</button>
              <button class="ghost small" type="button" id="btn-cancel-edit">Cancelar</button>
            </p>
          </form>
        </div>
      </div>
      <div class="panel">
        <h3>Encomendas</h3>
        ${orders.length
          ? `<table><thead><tr><th>Nº</th><th>Entrega</th><th class="num">Valor</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>`
          : `<div class="empty">Sem encomendas.</div>`}
      </div>
    </div>`;

  const dl = el.querySelector(".kv");
  const form = el.querySelector("#cust-form");
  el.querySelector("#btn-edit").addEventListener("click", () => { dl.hidden = true; form.hidden = false; });
  el.querySelector("#btn-cancel-edit").addEventListener("click", () => { form.hidden = true; dl.hidden = false; });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const payload = {};
    for (const k of ["name", "phone", "email", "address", "nif", "allergies", "preferences", "notes"]) {
      payload[k] = String(f.get(k) || "").trim() || null;
    }
    if (!payload.name) { toast("O nome é obrigatório.", "err"); return; }
    const { error: uerr } = await db.updateCustomer(c.id, payload);
    if (uerr) { toast(errMessage(uerr), "err"); return; }
    toast("Cliente actualizado.", "ok");
    renderCustomer(el, id);
  });

  el.querySelectorAll(".rowlink").forEach((tr) =>
    tr.addEventListener("click", () => { location.hash = tr.dataset.href; }));
}
