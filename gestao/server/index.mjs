// Casa Clo · Gestão — servidor HTTP da plataforma (Node puro + pg).
// Serve a SPA (public/) e a API REST (/api/*). Sem dependências além de pg.
//
// Ambiente:
//   PORT                 — porta HTTP (default 8315)
//   DATABASE_URL         — ligação na role casaclo_app
//   COOKIE_SECRET        — segredo HS256 da sessão (obrigatório em produção)
//   COOKIE_SECURE=1      — acrescenta Secure ao cookie (atrás de TLS)
//   SESSION_TTL_HOURS    — duração da sessão (default 168 = 7 dias)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { withUser, verifyLogin, health, likePattern, pool } from "./db.mjs";
import { signJwt, verifyJwt, sessionCookie, clearCookie, readCookie, COOKIE_NAME } from "./auth.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "..", "public");
const PORT = Number(process.env.PORT) || 8315;
const COOKIE_SECRET = process.env.COOKIE_SECRET || "";
const COOKIE_SECURE = process.env.COOKIE_SECURE === "1";
const TTL = (Number(process.env.SESSION_TTL_HOURS) || 168) * 3600;

if (!COOKIE_SECRET && process.env.NODE_ENV === "production") {
  console.error("COOKIE_SECRET em falta em produção.");
  process.exit(1);
}
const SECRET = COOKIE_SECRET || "dev-insecure-secret";

/* ---------------- utilidades ---------------- */

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function json(res, status, body, extraHeaders = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(data);
}

async function readBody(req, limit = 64 * 1024) {
  let size = 0; const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error("payload demasiado grande");
    chunks.push(c);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function session(req) {
  const token = readCookie(req, COOKIE_NAME);
  const payload = verifyJwt(token, SECRET);
  return payload?.sub ? payload : null;
}

// exigir sessão + papel de dono validado PELA BD (RLS) em cada pedido
async function requireOwner(req, res) {
  const s = session(req);
  if (!s) { json(res, 401, { error: "Sem sessão." }); return null; }
  let me = null;
  try {
    me = await withUser(s.sub, async (c) => {
      const { rows } = await c.query(
        "select id, email, display_name, role from members where id = $1", [s.sub]);
      return rows[0] || null;
    });
  } catch { /* BD fora — deixa passar como 503 do handler */ }
  if (!me || me.role !== "owner") { json(res, 401, { error: "Sessão sem acesso." }); return null; }
  return me;
}

// rate-limit leve ao login (memória do processo, chega para 2-3 donas)
const loginFails = new Map(); // email → { count, until }
function loginThrottled(email) {
  const e = loginFails.get(email);
  if (!e) return false;
  if (Date.now() > e.until) { loginFails.delete(email); return false; }
  return e.count >= 10;
}
function noteLoginFail(email) {
  const e = loginFails.get(email) || { count: 0, until: Date.now() + 15 * 60_000 };
  e.count += 1;
  e.until = Date.now() + 15 * 60_000;
  loginFails.set(email, e);
}

/* ---------------- API: encomendas ---------------- */

const ORDER_COLS = `o.id, o.number::int as number, o.status, o.channel, o.delivery_date, o.delivery_time,
  o.fulfilment, o.address, o.items, o.total_cents, o.allergies, o.notes, o.created_at,
  c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
  c.email as customer_email, c.address as customer_address, c.allergies as customer_allergies`;

async function attachPayments(client, rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const { rows: pays } = await client.query(
    `select p.id, p.order_id, p.amount_cents, p.paid_on, p.note, m.name as method_name
     from payments p left join payment_methods m on m.id = p.method_id
     where p.order_id = any($1) order by p.paid_on, p.created_at`, [ids]);
  const byOrder = new Map();
  for (const p of pays) {
    if (!byOrder.has(p.order_id)) byOrder.set(p.order_id, []);
    byOrder.get(p.order_id).push(p);
  }
  return rows.map((r) => {
    const payments = byOrder.get(r.id) || [];
    return {
      ...r,
      payments,
      paid_cents: payments.reduce((s, p) => s + p.amount_cents, 0),
    };
  });
}

function orderJson(r) {
  return {
    id: r.id, number: r.number, status: r.status, channel: r.channel,
    delivery_date: r.delivery_date, delivery_time: r.delivery_time,
    fulfilment: r.fulfilment, address: r.address, items: r.items,
    total_cents: r.total_cents, allergies: r.allergies, notes: r.notes,
    created_at: r.created_at,
    customers: r.customer_id ? {
      id: r.customer_id, name: r.customer_name, phone: r.customer_phone,
      email: r.customer_email, address: r.customer_address, allergies: r.customer_allergies,
    } : null,
    payments: (r.payments || []).map((p) => ({
      id: p.id, amount_cents: p.amount_cents, paid_on: p.paid_on,
      note: p.note, payment_methods: p.method_name ? { name: p.method_name } : null,
    })),
    paid_cents: r.paid_cents || 0,
  };
}

const ORDER_FIELDS = [
  "customer_id", "status", "channel", "delivery_date", "delivery_time",
  "fulfilment", "address", "items", "total_cents", "allergies", "notes",
];

function orderPayload(body) {
  const out = {};
  for (const f of ORDER_FIELDS) if (f in body) out[f] = body[f];
  if ("items" in out && !Array.isArray(out.items)) throw new Error("items tem de ser array");
  return out;
}

/* ---------------- API: handlers ---------------- */

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  const q = url.searchParams;

  // ---- públicos ----
  if (route === "GET /healthz") {
    try { return json(res, (await health()) ? 200 : 503, { ok: true }); }
    catch { return json(res, 503, { ok: false }); }
  }

  if (route === "POST /api/login") {
    const body = await readBody(req);
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    if (!email || !password) return json(res, 400, { error: "Email e palavra-passe obrigatórios." });
    if (loginThrottled(email)) return json(res, 429, { error: "Demasiadas tentativas. Espera um quarto de hora." });
    let member;
    try { member = await verifyLogin(email, password); }
    catch (e) { return json(res, 503, { error: "Sem ligação à base de dados." }); }
    if (!member) {
      noteLoginFail(email);
      return json(res, 401, { error: "Credenciais inválidas." });
    }
    if (member.role !== "owner") {
      // conta válida mas sem papel de gestão — sem cookie, sem sessão
      return json(res, 403, { error: "Esta conta não tem acesso de gestão." });
    }
    loginFails.delete(email);
    const token = signJwt({ sub: member.id, role: member.role }, SECRET, TTL);
    return json(res, 200, {
      user: { id: member.id, email: member.email, display_name: member.display_name, role: member.role },
    }, { "Set-Cookie": sessionCookie(token, { secure: COOKIE_SECURE, maxAgeSeconds: TTL }) });
  }

  if (route === "POST /api/logout") {
    return json(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
  }

  // ---- autenticados ----

  if (route === "GET /api/me") {
    const me = await requireOwner(req, res);
    if (!me) return undefined;
    return json(res, 200, { user: me });
  }

  if (route === "GET /api/dashboard") {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const today = String(q.get("today") || new Date().toISOString().slice(0, 10));
    const data = await withUser(me.id, async (c) => {
      const [bal, extra, upcoming, novas, saldos, mes] = await Promise.all([
        c.query(`select order_id, number, status, customer_name, delivery_date, fulfilment, due_cents
                 from order_balances where delivery_date = $1
                   and status not in ('cancelada','entregue') order by number`, [today]),
        c.query(`select id, delivery_time, allergies from orders
                 where delivery_date = $1 and status not in ('cancelada','entregue')`, [today]),
        c.query(`select order_id, number, status, customer_name, delivery_date, fulfilment, total_cents
                 from order_balances where delivery_date > $1 and delivery_date <= $1::date + 7
                   and status <> 'cancelada' order by delivery_date, number`, [today]),
        c.query("select count(*)::int as n from orders where status = 'recebida'"),
        c.query("select due_cents from order_balances where status not in ('cancelada','entregue')"),
        c.query("select coalesce(sum(amount_cents),0)::int as s from payments where paid_on >= date_trunc('month', $1::date)", [today]),
      ]);
      const extraById = new Map(extra.rows.map((r) => [r.id, r]));
      return {
        todayOrders: bal.rows.map((r) => ({ ...r, orders: extraById.get(r.order_id) || null })),
        upcoming: upcoming.rows,
        novas: novas.rows[0].n,
        aReceber: saldos.rows.reduce((s, r) => s + Math.max(r.due_cents, 0), 0),
        mesRecebido: mes.rows[0].s,
      };
    });
    return json(res, 200, data);
  }

  if (route === "GET /api/orders") {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const rows = await withUser(me.id, async (c) => {
      const where = []; const args = [];
      if (q.get("status") && q.get("status") !== "todas") { args.push(q.get("status")); where.push(`o.status = $${args.length}`); }
      if (q.get("from")) { args.push(q.get("from")); where.push(`o.delivery_date >= $${args.length}`); }
      if (q.get("to")) { args.push(q.get("to")); where.push(`o.delivery_date <= $${args.length}`); }
      if (q.get("q")) { args.push(likePattern(q.get("q"))); where.push(`(c.name ilike $${args.length} or o.number::text like $${args.length})`); }
      const dir = q.get("order") === "desc" ? "desc" : "asc";
      const sql = `select ${ORDER_COLS} from orders o join customers c on c.id = o.customer_id
        ${where.length ? "where " + where.join(" and ") : ""}
        order by o.delivery_date ${dir}, o.number ${dir} limit 200`;
      const { rows } = await c.query(sql, args);
      return attachPayments(c, rows);
    });
    return json(res, 200, rows.map(orderJson));
  }

  if (route === "POST /api/orders") {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const body = await readBody(req);
    let payload;
    try { payload = orderPayload(body); } catch (e) { return json(res, 400, { error: e.message }); }
    if (!payload.customer_id || !payload.delivery_date) {
      return json(res, 400, { error: "customer_id e delivery_date obrigatórios." });
    }
    const created = await withUser(me.id, async (c) => {
      const { rows } = await c.query(
        "insert into orders (customer_id, delivery_date, delivery_time, fulfilment, address, channel, items, total_cents, allergies, notes) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, number::int as number",
        [payload.customer_id, payload.delivery_date, payload.delivery_time ?? null,
         payload.fulfilment ?? "recolha", payload.address ?? null, payload.channel ?? "whatsapp",
         JSON.stringify(payload.items ?? []), payload.total_cents ?? 0,
         payload.allergies ?? null, payload.notes ?? null]);
      await c.query("insert into order_events (order_id, kind, to_status) values ($1,'created','recebida')", [rows[0].id]);
      return rows[0];
    });
    return json(res, 201, created);
  }

  let m;
  if ((m = url.pathname.match(/^\/api\/orders\/([0-9a-f-]{36})$/))) {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const id = m[1];
    if (req.method === "GET") {
      const row = await withUser(me.id, async (c) => {
        const { rows } = await c.query(
          `select ${ORDER_COLS} from orders o join customers c on c.id = o.customer_id where o.id = $1`, [id]);
        const withPays = await attachPayments(c, rows);
        return withPays[0] || null;
      });
      if (!row) return json(res, 404, { error: "Encomenda não encontrada." });
      const events = await withUser(me.id, async (c) => {
        const { rows } = await c.query(
          `select e.kind, e.from_status, e.to_status, e.detail, e.created_at, m.display_name as actor_name
           from order_events e left join members m on m.id = e.actor_id
           where e.order_id = $1 order by e.created_at`, [id]);
        return rows.map((e) => ({ ...e, profiles: e.actor_name ? { display_name: e.actor_name } : null }));
      });
      return json(res, 200, { ...orderJson(row), events });
    }
    if (req.method === "PATCH") {
      const body = await readBody(req);
      let payload;
      try { payload = orderPayload(body); } catch (e) { return json(res, 400, { error: e.message }); }
      const keys = Object.keys(payload);
      if (!keys.length) return json(res, 400, { error: "Nada para actualizar." });
      const sets = keys.map((k, i) => `${k} = $${i + 2}`);
      const updated = await withUser(me.id, async (c) => {
        const { rowCount } = await c.query(
          `update orders set ${sets.join(", ")} where id = $1`, [id, ...keys.map((k) => k === "items" ? JSON.stringify(payload[k]) : payload[k])]);
        return rowCount;
      });
      if (!updated) return json(res, 404, { error: "Encomenda não encontrada." });
      return json(res, 200, { id });
    }
    if (req.method === "DELETE") {
      const n = await withUser(me.id, async (c) => (await c.query("delete from orders where id = $1", [id])).rowCount);
      if (!n) return json(res, 404, { error: "Encomenda não encontrada." });
      return json(res, 200, { ok: true });
    }
  }

  if (route === "GET /api/customers") {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const rows = await withUser(me.id, async (c) => {
      const args = [];
      let where = "";
      if (q.get("q")) { args.push(likePattern(q.get("q"))); where = "where c.name ilike $1 or c.phone like $1 or c.email ilike $1"; }
      const { rows } = await c.query(
        `select c.*, (select count(*)::int from orders o where o.customer_id = c.id) as n_orders,
                (select coalesce(sum(o.total_cents),0)::int from orders o where o.customer_id = c.id and o.status <> 'cancelada') as total
         from customers c ${where} order by c.name limit 300`, args);
      return rows;
    });
    return json(res, 200, rows);
  }

  if (route === "POST /api/customers") {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const b = await readBody(req);
    if (!String(b.name || "").trim()) return json(res, 400, { error: "Nome obrigatório." });
    const row = await withUser(me.id, async (c) => {
      const { rows } = await c.query(
        "insert into customers (name, phone, email, address, nif, allergies, preferences, notes) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, name",
        [b.name.trim(), b.phone || null, b.email || null, b.address || null, b.nif || null,
         b.allergies || null, b.preferences || null, b.notes || null]);
      return rows[0];
    });
    return json(res, 201, row);
  }

  if ((m = url.pathname.match(/^\/api\/customers\/([0-9a-f-]{36})$/))) {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const id = m[1];
    if (req.method === "GET") {
      const row = await withUser(me.id, async (c) => {
        const { rows } = await c.query("select * from customers where id = $1", [id]);
        if (!rows[0]) return null;
        const { rows: orders } = await c.query(
          "select id, number, status, delivery_date, total_cents from orders where customer_id = $1 order by delivery_date desc", [id]);
        return { ...rows[0], orders };
      });
      if (!row) return json(res, 404, { error: "Cliente não encontrado." });
      return json(res, 200, row);
    }
    if (req.method === "PATCH") {
      const b = await readBody(req);
      const fields = ["name", "phone", "email", "address", "nif", "allergies", "preferences", "notes"];
      const keys = fields.filter((k) => k in b);
      if (!keys.length) return json(res, 400, { error: "Nada para actualizar." });
      const sets = keys.map((k, i) => `${k} = $${i + 2}`);
      const n = await withUser(me.id, async (c) => (await c.query(
        `update customers set ${sets.join(", ")} where id = $1`,
        [id, ...keys.map((k) => b[k] ?? null)])).rowCount);
      if (!n) return json(res, 404, { error: "Cliente não encontrado." });
      return json(res, 200, { id });
    }
    if (req.method === "DELETE") {
      try {
        const n = await withUser(me.id, async (c) => (await c.query("delete from customers where id = $1", [id])).rowCount);
        if (!n) return json(res, 404, { error: "Cliente não encontrado." });
        return json(res, 200, { ok: true });
      } catch (e) {
        if (String(e.code) === "23503") return json(res, 409, { error: "Cliente com encomendas — não pode ser apagado." });
        throw e;
      }
    }
  }

  if (route === "GET /api/payments") {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const from = q.get("from"); const to = q.get("to");
    if (!from || !to) return json(res, 400, { error: "from e to obrigatórios (datas)." });
    const rows = await withUser(me.id, async (c) => {
      const { rows } = await c.query(
        `select p.id, p.amount_cents, p.paid_on, p.note, p.created_at,
                m.name as method_name, o.id as order_id, o.number as order_number, cu.name as customer_name
         from payments p
         left join payment_methods m on m.id = p.method_id
         left join orders o on o.id = p.order_id
         left join customers cu on cu.id = o.customer_id
         where p.paid_on >= $1 and p.paid_on < $2
         order by p.paid_on desc, p.created_at desc`, [from, to]);
      return rows.map((r) => ({
        id: r.id, amount_cents: r.amount_cents, paid_on: r.paid_on, note: r.note, created_at: r.created_at,
        payment_methods: r.method_name ? { name: r.method_name } : null,
        orders: r.order_id ? { id: r.order_id, number: r.order_number, customers: { name: r.customer_name } } : null,
      }));
    });
    return json(res, 200, rows);
  }

  if (route === "POST /api/payments") {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const b = await readBody(req);
    if (!b.order_id || !(Number(b.amount_cents) > 0)) return json(res, 400, { error: "order_id e amount_cents obrigatórios." });
    const row = await withUser(me.id, async (c) => {
      const { rows } = await c.query(
        "insert into payments (order_id, amount_cents, method_id, paid_on, note) values ($1,$2,$3,$4,$5) returning id",
        [b.order_id, b.amount_cents, b.method_id ?? null,
         b.paid_on || new Date().toISOString().slice(0, 10), b.note || null]);
      return rows[0];
    });
    return json(res, 201, row);
  }

  if ((m = url.pathname.match(/^\/api\/payments\/([0-9a-f-]{36})$/)) && req.method === "DELETE") {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const n = await withUser(me.id, async (c) => (await c.query("delete from payments where id = $1", [m[1]])).rowCount);
    if (!n) return json(res, 404, { error: "Pagamento não encontrado." });
    return json(res, 200, { ok: true });
  }

  if (route === "GET /api/methods") {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const rows = await withUser(me.id, async (c) =>
      (await c.query("select id, name, active, sort_order from payment_methods order by sort_order")).rows);
    return json(res, 200, rows);
  }

  if (route === "POST /api/methods") {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const b = await readBody(req);
    if (!String(b.name || "").trim()) return json(res, 400, { error: "Nome obrigatório." });
    const row = await withUser(me.id, async (c) => {
      const { rows } = await c.query(
        "insert into payment_methods (name, active, sort_order) values ($1, coalesce($2,true), coalesce($3,0)) returning id",
        [b.name.trim(), b.active ?? null, b.sort_order ?? null]);
      return rows[0];
    });
    return json(res, 201, row);
  }

  if ((m = url.pathname.match(/^\/api\/methods\/(\d+)$/)) && req.method === "PATCH") {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const b = await readBody(req);
    const keys = ["name", "active", "sort_order"].filter((k) => k in b);
    if (!keys.length) return json(res, 400, { error: "Nada para actualizar." });
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    const n = await withUser(me.id, async (c) => (await c.query(
      `update payment_methods set ${sets.join(", ")} where id = $1`, [m[1], ...keys.map((k) => b[k])])).rowCount);
    if (!n) return json(res, 404, { error: "Método não encontrado." });
    return json(res, 200, { id: m[1] });
  }

  if (route === "GET /api/profiles") {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const rows = await withUser(me.id, async (c) =>
      (await c.query("select id, email, display_name, role, active from members order by email")).rows);
    return json(res, 200, rows);
  }

  if ((m = url.pathname.match(/^\/api\/profiles\/([0-9a-f-]{36})$/)) && req.method === "PATCH") {
    const me = await requireOwner(req, res); if (!me) return undefined;
    const b = await readBody(req);
    const keys = ["display_name", "role", "active"].filter((k) => k in b);
    if (!keys.length) return json(res, 400, { error: "Nada para actualizar." });
    if (m[1] === me.id && ((b.active === false) || (b.role && b.role !== "owner"))) {
      return json(res, 400, { error: "Não podes retirar o acesso à tua própria conta aqui (faz-se por outra conta)." });
    }
    const n = await withUser(me.id, async (c) => (await c.query(
      `update members set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1`,
      [m[1], ...keys.map((k) => b[k])])).rowCount);
    if (!n) return json(res, 404, { error: "Utilizador não encontrado." });
    return json(res, 200, { id: m[1] });
  }

  return json(res, 404, { error: "Rota desconhecida." });
}

/* ---------------- estáticos ---------------- */

async function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === "/") p = "/index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) {
    res.writeHead(403); return res.end();
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not file");
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] || "application/octet-stream";
    const immutable = ext === ".woff2" || p.startsWith("/js/vendor/");
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": info.size,
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
    });
    if (req.method === "HEAD") return res.end();
    const data = await readFile(file);
    return res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    return res.end("<!doctype html><meta charset=utf-8><title>Casa Clo · Gestão</title><p>404 — <a href=/>voltar</a>");
  }
}

/* ---------------- servidor ---------------- */

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  // cabeçalhos de segurança em tudo o que serve
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  );
  try {
    if (url.pathname === "/healthz" || url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (e) {
    console.error(`${req.method} ${url.pathname}:`, e.message);
    if (!res.headersSent) json(res, 500, { error: "Erro interno." });
    else res.end();
  }
});

server.listen(PORT, () => console.log(`gestão casa clo :${PORT}`));
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => server.close(() => pool.end().then(() => process.exit(0))));
}
