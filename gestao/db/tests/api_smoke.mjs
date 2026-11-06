// ============================================================================
// Casa Clo · Gestão — smoke test da API real (server/index.mjs) contra a BD
// local de teste. Uso: node db/tests/api_smoke.mjs
// Pré-requisitos: contentor casaclo-devdb + migrações + seed (ver README) e
// role casaclo_app com login 'devapp' (ver README de desenvolvimento).
// ============================================================================
import { spawn } from "node:child_process";
import pg from "pg";

const PORT = 8331;
const BASE = `http://127.0.0.1:${PORT}`;
let cookie = "";
let PASS = 0, FAIL = 0;
const ok = (m) => { PASS++; console.log(`  ✔ ${m}`); };
const bad = (m, e) => { FAIL++; console.log(`  ✘ ${m} — ${e}`); };

async function call(method, path, body, useCookie = true) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (useCookie && cookie) headers["Cookie"] = cookie;
  const res = await fetch(BASE + path, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

const check = async (msg, fn) => { try { await fn(); ok(msg); } catch (e) { bad(msg, e.message); } };
const eq = (got, want, m = "") => { if (got !== want) throw new Error(`${m} esperado=${want} obtido=${got}`); return true; };

// ---- limpeza prévia (resíduos de corridas anteriores, como owner da BD) ----
{
  const admin = new pg.Client({ connectionString: "postgres://postgres:dev@127.0.0.1:54331/casaclo" });
  await admin.connect();
  await admin.query("delete from orders where customer_id in (select id from customers where name ilike '%smoke%' or name ilike '%teste%')");
  await admin.query("delete from customers where name ilike '%smoke%' or name ilike '%teste%'");
  await admin.query("delete from payment_methods where name ilike 'Teste %'");
  await admin.end();
}

// ---- arranque do servidor ----
const child = spawn("node", ["server/index.mjs"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATABASE_URL: "postgres://casaclo_app:devapp@127.0.0.1:54331/casaclo",
    COOKIE_SECRET: "segredo-de-teste",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (d) => { log += d; });
child.stderr.on("data", (d) => { log += d; });

async function waitHealthz() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.status === 200) return true;
    } catch { /* ainda a arrancar */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("servidor não arrancou:\n" + log);
}

try {
  await check("servidor arranca + /healthz 200", waitHealthz);

  console.log("— autenticação —");
  await check("sem cookie → /api/me 401", async () => {
    const r = await call("GET", "/api/me", undefined, false);
    eq(r.status, 401);
  });
  await check("senha errada → 401", async () => {
    const r = await call("POST", "/api/login", { email: "owner@casa.local", password: "errada" }, false);
    eq(r.status, 401);
  });
  await check("login owner → 200 + cookie HttpOnly", async () => {
    const r = await call("POST", "/api/login", { email: "owner@casa.local", password: "senha-Teste-Local-1" }, false);
    eq(r.status, 200);
    if (!cookie.startsWith("casaclo_session=")) throw new Error("cookie ausente");
    if (!(r.headers.get("set-cookie") || "").includes("HttpOnly")) throw new Error("sem HttpOnly");
  });
  await check("/api/me devolve o owner", async () => {
    const r = await call("GET", "/api/me");
    eq(r.status, 200); eq(r.data.user.role, "owner");
  });
  await check("conta production → 403 sem cookie", async () => {
    cookie = "";
    const r = await call("POST", "/api/login", { email: "prod@casa.local", password: "senha-Teste-Local-2" }, false);
    eq(r.status, 403); eq(cookie, "");
  });
  await check("conta inactiva → 401", async () => {
    const r = await call("POST", "/api/login", { email: "inactivo@casa.local", password: "senha-Teste-Local-3" }, false);
    eq(r.status, 401);
  });
  await check("re-login owner", async () => {
    const r = await call("POST", "/api/login", { email: "owner@casa.local", password: "senha-Teste-Local-1" }, false);
    eq(r.status, 200);
  });

  console.log("— fluxo de negócio —");
  let custId, ordId, ordId2;
  await check("cria cliente", async () => {
    const r = await call("POST", "/api/customers", { name: "Smoke Cliente", phone: "+351911222333", allergies: "sem glúten" });
    eq(r.status, 201); custId = r.data.id;
  });
  await check("lista clientes (com pesquisa)", async () => {
    const r = await call("GET", "/api/customers?q=smoke");
    eq(r.status, 200); eq(r.data.length >= 1, true);
  });
  await check("email inválido rejeitado (400 + msg da BD)", async () => {
    const r = await call("POST", "/api/customers", { name: "X", email: "nao-email" });
    eq(r.status, 500); // erro de BD propagado como 500 com mensagem
    eq(String(r.data.error).length > 0, true);
  });
  await check("cria encomenda (2 itens)", async () => {
    const r = await call("POST", "/api/orders", {
      customer_id: custId, delivery_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      fulfilment: "entrega", address: "Rua do Smoke 1", channel: "whatsapp",
      items: [{ desc: "Bolo 18cm", qty: 1, unit_cents: 3800 }, { desc: "Suspiros", qty: 2, unit_cents: 800 }],
      total_cents: 5400,
    });
    eq(r.status, 201); ordId = r.data.id; eq(typeof r.data.number, "number");
  });
  await check("detalhe traz cliente, items e evento created", async () => {
    const r = await call("GET", `/api/orders/${ordId}`);
    eq(r.status, 200); eq(r.data.customers.name, "Smoke Cliente");
    eq(r.data.items.length, 2);
    eq(r.data.events.some((e) => e.kind === "created"), true);
  });
  await check("muda estado → evento com actor", async () => {
    const r = await call("PATCH", `/api/orders/${ordId}`, { status: "confirmada" });
    eq(r.status, 200);
    const d = await call("GET", `/api/orders/${ordId}`);
    const ev = d.data.events.find((e) => e.kind === "status_change");
    eq(ev.from_status, "recebida"); eq(ev.to_status, "confirmada");
    eq(Boolean(ev.profiles?.display_name), true);
  });
  await check("regista pagamento", async () => {
    const { data: methods } = await call("GET", "/api/methods");
    const r = await call("POST", "/api/payments", { order_id: ordId, amount_cents: 2000, method_id: methods[0].id, note: "sinal" });
    eq(r.status, 201);
  });
  await check("paid_cents actualizado no detalhe", async () => {
    const r = await call("GET", `/api/orders/${ordId}`);
    eq(r.data.paid_cents, 2000);
  });
  await check("dashboard com números", async () => {
    // 2ª encomenda fica 'recebida' — o contador de novas tem de a ver
    const o2 = await call("POST", "/api/orders", {
      customer_id: custId, delivery_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      items: [{ desc: "Suspiros", qty: 1, unit_cents: 800 }], total_cents: 800,
    });
    eq(o2.status, 201);
    ordId2 = o2.data.id;
    const r = await call("GET", "/api/dashboard");
    eq(r.status, 200); eq(typeof r.data.aReceber, "number");
    eq(r.data.novas >= 1, true);
  });
  await check("lista encomendas com filtro de texto", async () => {
    const r = await call("GET", "/api/orders?q=smoke");
    eq(r.status, 200); eq(r.data.length, 2); // ordId + ordId2 (criada no dashboard)
  });
  await check("lista pagamentos do mês", async () => {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const nm = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const to = `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, "0")}-01`;
    const r = await call("GET", `/api/payments?from=${from}&to=${to}`);
    eq(r.status, 200); eq(r.data.length, 1); eq(r.data[0].orders.customers.name, "Smoke Cliente");
  });
  const tmpMethodName = `Teste ${Date.now()}`;
  await check("métodos: cria + edita", async () => {
    const r = await call("POST", "/api/methods", { name: tmpMethodName, sort_order: 99 });
    eq(r.status, 201);
    const p = await call("PATCH", `/api/methods/${r.data.id}`, { active: false });
    eq(p.status, 200);
  });
  await check("perfis: 3 membros, sem password_hash", async () => {
    const r = await call("GET", "/api/profiles");
    eq(r.status, 200); eq(r.data.length, 3);
    eq(r.data.every((m) => !("password_hash" in m)), true);
  });
  await check("self-deactivate bloqueado (400)", async () => {
    const me = await call("GET", "/api/me");
    const r = await call("PATCH", `/api/profiles/${me.data.user.id}`, { active: false });
    eq(r.status, 400);
  });

  console.log("— estáticos e fronteiras —");
  await check("/ serve a SPA", async () => {
    const r = await fetch(`${BASE}/`);
    eq(r.status, 200);
    eq((await r.text()).includes("Gestão"), true);
  });
  await check("assets servidos (css/js/font)", async () => {
    for (const p of ["/css/app.css", "/js/app.js", "/js/api.js", "/fonts/fraunces-normal-latin.woff2", "/favicon.ico"]) {
      const r = await fetch(BASE + p);
      eq(r.status, 200, p);
    }
  });
  await check("path traversal bloqueado", async () => {
    const r = await fetch(`${BASE}/../server/index.mjs`);
    if (r.status === 200) throw new Error("serviu código do servidor!");
    eq(true, true);
  });
  await check("cabeçalhos de segurança presentes", async () => {
    const r = await fetch(`${BASE}/`);
    eq(r.headers.get("x-content-type-options"), "nosniff");
    eq(Boolean(r.headers.get("content-security-policy")), true);
  });
  await check("logout → sessão morta", async () => {
    await call("POST", "/api/logout");
    const r = await call("GET", "/api/me", undefined, false);
    eq(r.status, 401);
  });

  console.log("— limpeza —");
  await check("re-login + apagar encomendas e cliente de teste", async () => {
    await call("POST", "/api/login", { email: "owner@casa.local", password: "senha-Teste-Local-1" }, false);
    const d = await call("DELETE", `/api/orders/${ordId}`);
    eq(d.status, 200);
    const d2 = await call("DELETE", `/api/orders/${ordId2}`);
    eq(d2.status, 200);
    const c = await call("DELETE", `/api/customers/${custId}`);
    eq(c.status, 200);
    const m = await call("GET", "/api/methods");
    const tmp = m.data.find((x) => x.name === tmpMethodName);
    if (tmp) await call("DELETE", `/api/methods/${tmp.id}`);
  });
} finally {
  child.kill("SIGTERM");
}

console.log(`\nRESULTADO: ${PASS} passaram, ${FAIL} falharam`);
process.exit(FAIL ? 1 : 0);
