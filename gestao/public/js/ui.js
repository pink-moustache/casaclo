// Helpers de interface: formatação, escape, toasts.

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

/** cêntimos → "38,00 €" */
export function money(cents) {
  return eur.format((Number(cents) || 0) / 100);
}

/** "38" | "38.5" | "38,50" → 3850 (cêntimos); null se vazio/inválido */
export function parseMoney(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-12-20" → "20/12/2026" */
export function datePt(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-12-20" → "sáb, 20 dez 2026" */
export function dateLong(iso) {
  if (!iso) return "";
  const dt = new Date(iso + "T12:00:00");
  return `${SEM[dt.getDay()]}, ${dt.getDate()} ${MESES[dt.getMonth()].slice(0, 3)} ${dt.getFullYear()}`;
}

/** "2026-11-06T14:12:38+00:00" → "06/11/2026 14:12" (hora local) */
export function tsPt(ts) {
  if (!ts) return "";
  const dt = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export function todayISO() { // data LOCAL (UTC daria o dia seguinte após as 23h de verão)
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDaysISO(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthLabel(year, monthIdx) {
  return `${MESES[monthIdx]} ${year}`;
}

/** estado de pagamento derivado do saldo */
export function payState(paid, due) {
  if (due <= 0) return { cls: "pay-pago", label: "pago" };
  if (paid > 0) return { cls: "pay-parcial", label: "parcial" };
  return { cls: "pay-pendente", label: "pendente" };
}

export const STATUSES = {
  recebida:     { label: "Recebida",      cls: "st-recebida",     next: "confirmada" },
  confirmada:   { label: "Confirmada",    cls: "st-confirmada",   next: "em_producao" },
  em_producao:  { label: "Em produção",   cls: "st-em_producao",  next: "pronta" },
  pronta:       { label: "Pronta",        cls: "st-pronta",       next: "entregue" },
  entregue:     { label: "Entregue",      cls: "st-entregue",     next: null },
  cancelada:    { label: "Cancelada",     cls: "st-cancelada",    next: null },
};
export const FLOW = ["recebida", "confirmada", "em_producao", "pronta", "entregue"];

export function badge(status) {
  const s = STATUSES[status] || { label: status, cls: "" };
  return `<span class="badge ${s.cls}">${esc(s.label)}</span>`;
}

let toastBox;
export function toast(msg, kind = "") {
  if (!toastBox) toastBox = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  toastBox.appendChild(el);
  setTimeout(() => el.remove(), kind === "err" ? 6000 : 3500);
}

/** mensagem de erro legível a partir de uma resposta de erro da API */
export function errMessage(err) {
  if (!err) return "Erro desconhecido.";
  if (err.message === "Failed to fetch") return "Sem ligação ao servidor. Verifica a internet.";
  return err.message || err.msg || String(err);
}

export function show(el, html) {
  const node = typeof el === "string" ? document.getElementById(el) : el;
  node.innerHTML = html;
  return node;
}
