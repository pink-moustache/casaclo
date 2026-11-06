// Casa Clo · Gestão — arranque, sessão e router por hash.
import * as db from "./api.js";
import { esc, toast, errMessage } from "./ui.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderOrders } from "./views/orders.js";
import { renderOrderDetail, renderOrderForm } from "./views/order.js";
import { renderCustomers } from "./views/customers.js";
import { renderCustomer } from "./views/customer.js";
import { renderPayments } from "./views/payments.js";
import { renderSettings } from "./views/settings.js";

const APP = document.getElementById("app");
let me = null; // perfil de quem está com sessão iniciada

/* ---------- ecrã de login ---------- */

function screenLogin(errorMsg = "") {
  APP.innerHTML = `
    <div class="screen">
      <p class="screen-logo">Casa <em>Clo</em></p>
      <p class="screen-sub">gestão interna</p>
      <div class="screen-card">
        <h2>Entrar</h2>
        <form id="login-form">
          <label for="li-email">Email</label>
          <input id="li-email" type="email" autocomplete="username" required autofocus>
          <label for="li-pass">Palavra-passe</label>
          <input id="li-pass" type="password" autocomplete="current-password" required>
          <p style="margin:18px 0 0">
            <button type="submit" style="width:100%">Entrar</button>
          </p>
          ${errorMsg ? `<p class="error-box" style="padding:10px 0 0">${esc(errorMsg)}</p>` : ""}
        </form>
      </div>
    </div>`;
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    const { error } = await db.signIn(
      document.getElementById("li-email").value,
      document.getElementById("li-pass").value,
    );
    if (error) {
      screenLogin(errMessage(error));
      return;
    }
    start();
  });
}

/* ---------- estrutura da app ---------- */

const NAV = [
  ["/", "Hoje"],
  ["/orders", "Encomendas"],
  ["/customers", "Clientes"],
  ["/payments", "Pagamentos"],
  ["/settings", "Definições"],
];

function renderLayout() {
  const who = me?.display_name || me?.email || "";
  APP.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <p class="brand">Casa Clo</p>
        <p class="brand-sub">Gestão</p>
        <nav class="nav" id="nav">
          ${NAV.map(([href, label]) => `<a href="#${href}" data-nav="${href}">${label}</a>`).join("")}
        </nav>
        <div class="foot">
          <span class="who" title="${esc(who)}">${esc(who)}</span>
          <button id="btn-logout" class="small">Sair</button>
        </div>
      </aside>
      <main class="main" id="view"></main>
    </div>`;
  document.getElementById("btn-logout").addEventListener("click", async () => {
    await db.signOut();
    me = null;
    screenLogin();
  });
}

/* ---------- router ---------- */

function parseHash() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart = ""] = h.split("?");
  const parts = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  return { path: "/" + parts.join("/"), parts, query };
}

const ROUTES = [
  { re: /^\/$/,                 view: () => renderDashboard(viewEl()) },
  { re: /^\/orders$/,           view: (m, p, q) => renderOrders(viewEl(), p, q) },
  { re: /^\/orders\/new$/,      view: () => renderOrderForm(viewEl(), null) },
  { re: /^\/orders\/([^/]+)$/,  view: (m) => renderOrderDetail(viewEl(), m[1]) },
  { re: /^\/orders\/([^/]+)\/edit$/, view: (m) => renderOrderForm(viewEl(), m[1]) },
  { re: /^\/customers$/,        view: (m, p, q) => renderCustomers(viewEl(), p, q) },
  { re: /^\/customers\/([^/]+)$/, view: (m) => renderCustomer(viewEl(), m[1]) },
  { re: /^\/payments$/,         view: (m, p, q) => renderPayments(viewEl(), p, q) },
  { re: /^\/settings$/,         view: () => renderSettings(viewEl()) },
];

function viewEl() { return document.getElementById("view"); }

async function route() {
  const { path, parts, query } = parseHash();
  document.querySelectorAll("#nav a").forEach((a) => {
    const nav = a.dataset.nav;
    a.classList.toggle("active", nav === path || (nav !== "/" && path.startsWith(nav)));
  });
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) {
      viewEl().innerHTML = `<div class="empty">a carregar…</div>`;
      try {
        await r.view(m, parts, query);
      } catch (err) {
        if (err?.status === 401) { me = null; screenLogin("A sessão expirou — entra de novo."); return; }
        viewEl().innerHTML = `<div class="panel"><div class="error-box">Erro ao carregar: ${esc(errMessage(err))}</div></div>`;
      }
      return;
    }
  }
  location.hash = "#/";
}

/* ---------- arranque ---------- */

async function start() {
  const session = await db.getSession();
  if (!session) { screenLogin(); return; }
  me = session.user;
  if (!me || me.role !== "owner") {
    screenLogin("Esta conta não tem acesso de gestão.");
    await db.signOut();
    return;
  }
  renderLayout();
  await route();
}

window.addEventListener("hashchange", () => {
  if (document.getElementById("view")) route();
});

start();
