// Camada de dados: API REST própria (server/index.mjs) com cookie de sessão.
// Mantém as assinaturas das funções que as vistas já usavam (ex-db.js).
const BASE = "/api";

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data = null;
  try { data = await res.json(); } catch { /* corpo vazio */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Erro HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- sessão ---------- */

export async function signIn(email, password) {
  try {
    const { user } = await call("POST", "/login", { email, password });
    return { data: { user }, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function signOut() {
  try { await call("POST", "/logout"); return { error: null }; }
  catch (e) { return { error: e }; }
}

export async function getSession() {
  try {
    const { user } = await call("GET", "/me");
    return { user };
  } catch {
    return null;
  }
}

export async function getMyProfile() {
  const s = await getSession();
  return s?.user || null;
}

/* ---------- dashboard ---------- */

export async function dashboard(today) {
  return call("GET", `/dashboard?today=${encodeURIComponent(today)}`);
}

/* ---------- encomendas ---------- */

export async function listOrders({ status = "todas", from, to, q = "", order } = {}) {
  const params = new URLSearchParams();
  if (status !== "todas") params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (q.trim()) params.set("q", q.trim());
  if (order) params.set("order", order);
  const qs = params.toString();
  const rows = await call("GET", `/orders${qs ? "?" + qs : ""}`);
  return { data: rows, error: null };
}

export async function getOrder(id) {
  try {
    const data = await call("GET", `/orders/${id}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createOrder(payload) {
  try {
    const data = await call("POST", "/orders", payload);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function updateOrder(id, payload) {
  try {
    const data = await call("PATCH", `/orders/${id}`, payload);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function setOrderStatus(id, status) {
  return updateOrder(id, { status });
}

export async function deleteOrder(id) {
  try {
    await call("DELETE", `/orders/${id}`);
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

/* ---------- clientes ---------- */

export async function listCustomers(q = "") {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  const rows = await call("GET", `/customers${qs}`);
  return { data: rows, error: null };
}

export async function getCustomer(id) {
  const data = await call("GET", `/customers/${id}`);
  return { data, error: null };
}

export async function createCustomer(payload) {
  try {
    const data = await call("POST", "/customers", payload);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function updateCustomer(id, payload) {
  try {
    await call("PATCH", `/customers/${id}`, payload);
    return { data: { id }, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/* ---------- pagamentos ---------- */

export async function addPayment(payload) {
  try {
    const data = await call("POST", "/payments", payload);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function deletePayment(id) {
  try {
    await call("DELETE", `/payments/${id}`);
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

export async function listPayments(monthFirstDay, nextMonthFirstDay) {
  const rows = await call("GET", `/payments?from=${monthFirstDay}&to=${nextMonthFirstDay}`);
  return { data: rows, error: null };
}

/* ---------- métodos de pagamento ---------- */

export async function listMethods() {
  const rows = await call("GET", "/methods");
  return { data: rows, error: null };
}

export async function createMethod(payload) {
  try {
    const data = await call("POST", "/methods", payload);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function updateMethod(id, payload) {
  try {
    const data = await call("PATCH", `/methods/${id}`, payload);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/* ---------- utilizadores (membros) ---------- */

export async function listProfiles() {
  const rows = await call("GET", "/profiles");
  return { data: rows, error: null };
}

export async function updateProfile(id, payload) {
  try {
    const data = await call("PATCH", `/profiles/${id}`, payload);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}
