// Vista: Definições — métodos de pagamento e utilizadores.
import * as db from "../api.js";
import { esc, toast, errMessage } from "../ui.js";

export async function renderSettings(el) {
  const [{ data: methods, error: mErr }, { data: profiles, error: pErr }] =
    await Promise.all([db.listMethods(), db.listProfiles()]);
  if (mErr || pErr) {
    el.innerHTML = `<div class="panel"><div class="error-box">${esc(errMessage(mErr || pErr))}</div></div>`;
    return;
  }

  const mRows = (methods || []).map((m) => `
    <tr data-id="${m.id}">
      <td><input class="mt-name" value="${esc(m.name)}" ${m.active ? "" : 'style="text-decoration:line-through"'}></td>
      <td style="width:90px"><input class="mt-sort" type="number" value="${m.sort_order}"></td>
      <td style="width:90px"><label style="display:flex;gap:6px;align-items:center;margin:0;text-transform:none;letter-spacing:0;font-size:13px">
        <input class="mt-active" type="checkbox" style="width:auto" ${m.active ? "checked" : ""}></label></td>
      <td style="width:80px"><button class="ghost small mt-save">guardar</button></td>
    </tr>`).join("");

  const uRows = (profiles || []).map((p) => `
    <tr>
      <td>${esc(p.display_name || "—")}<br><span class="muted" style="font-size:12px">${esc(p.email)}</span></td>
      <td>
        <select class="pf-role" data-id="${p.id}">
          <option value="owner" ${p.role === "owner" ? "selected" : ""}>dono</option>
          <option value="production" ${p.role === "production" ? "selected" : ""}>produção (sem acesso)</option>
        </select>
      </td>
      <td>
        <label style="display:flex;gap:6px;align-items:center;margin:0;text-transform:none;letter-spacing:0;font-size:13px">
          <input class="pf-active" data-id="${p.id}" type="checkbox" style="width:auto" ${p.active ? "checked" : ""}> activo
        </label>
      </td>
    </tr>`).join("");

  el.innerHTML = `
    <div class="page-head"><h1>Definições</h1></div>

    <div class="panel">
      <h3>Métodos de pagamento</h3>
      <table>
        <thead><tr><th>Nome</th><th class="num">Ordem</th><th>Activo</th><th></th></tr></thead>
        <tbody id="mt-body">${mRows}</tbody>
      </table>
      <div class="panel-body">
        <form id="mt-new" style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap">
          <div style="flex:1; min-width:160px"><label>Novo método</label><input name="name" required placeholder="ex.: Cartão terminal"></div>
          <button class="small">Adicionar</button>
        </form>
      </div>
    </div>

    <div class="panel">
      <h3>Utilizadores</h3>
      <div class="panel-body">
        <p class="section-note" style="margin:0 0 10px">
          As contas criam-se pela infra (script de seed, contrato
          <code>docs/DEPLOY-DECIMA-CLOUD.md</code> §3) — não existe signup.
          Desactivar aqui corta o acesso de imediato, mesmo em sessões abertas.
        </p>
      </div>
      <table>
        <thead><tr><th>Utilizador</th><th>Papel</th><th>Estado</th></tr></thead>
        <tbody id="pf-body">${uRows}</tbody>
      </table>
    </div>`;

  /* métodos: guardar linha */
  el.querySelectorAll(".mt-save").forEach((b) => b.addEventListener("click", async () => {
    const tr = b.closest("tr");
    const payload = {
      name: tr.querySelector(".mt-name").value.trim(),
      sort_order: Number(tr.querySelector(".mt-sort").value) || 0,
      active: tr.querySelector(".mt-active").checked,
    };
    if (!payload.name) { toast("O nome não pode ficar vazio.", "err"); return; }
    const { error } = await db.updateMethod(tr.dataset.id, payload);
    if (error) { toast(errMessage(error), "err"); return; }
    toast("Método guardado.", "ok");
    renderSettings(el);
  }));

  el.querySelector("#mt-new").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get("name").trim();
    const { error } = await db.createMethod({ name, active: true, sort_order: (methods?.length || 0) + 1 });
    if (error) { toast(errMessage(error), "err"); return; }
    toast("Método adicionado.", "ok");
    renderSettings(el);
  });

  /* perfis: papel / activo */
  el.querySelectorAll(".pf-role").forEach((s) => s.addEventListener("change", async () => {
    if (s.value !== "owner" && !confirm("Se esta for a tua própria conta, perdes o acesso de imediato (só volta pela infra, na BD). Continuar?")) {
      renderSettings(el); return;
    }
    const { error } = await db.updateProfile(s.dataset.id, { role: s.value });
    if (error) { toast(errMessage(error), "err"); renderSettings(el); return; }
    toast("Papel actualizado.", "ok");
  }));
  el.querySelectorAll(".pf-active").forEach((c) => c.addEventListener("change", async () => {
    if (!c.checked && !confirm("Desactivar este utilizador? Se for a tua própria conta, perdes o acesso de imediato (só volta pela infra, na BD).")) {
      renderSettings(el); return;
    }
    const { error } = await db.updateProfile(c.dataset.id, { active: c.checked });
    if (error) { toast(errMessage(error), "err"); renderSettings(el); return; }
    toast(c.checked ? "Utilizador activado." : "Utilizador desactivado — deixará de ter acesso.", "ok");
  }));
}
