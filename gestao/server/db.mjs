// Acesso à BD: pool na role da aplicação + transacções com identidade
// (SET LOCAL app.user_id) para a RLS saber quem pede.
import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // a cloud termina TLS no túnel; o contentor fala TCP simples ao Postgres
  ssl: process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

/** corre fn(client) dentro de uma transacção com a identidade do membro */
export async function withUser(memberId, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true)", [memberId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    try { await client.query("rollback"); } catch { /* ligação partida */ }
    throw e;
  } finally {
    client.release();
  }
}

/** login: verificação do bcrypt DENTRO da BD (hash nunca sai) */
export async function verifyLogin(email, password) {
  const { rows } = await pool.query(
    "select id, email, display_name, role from private.verify_login($1, $2)",
    [email, password],
  );
  return rows[0] || null;
}

/** healthcheck: prova ligação + permissões da role */
export async function health() {
  const { rows } = await pool.query("select 1 as ok");
  return rows[0]?.ok === 1;
}

/** escapa % e _ para pesquisas ILIKE parametrizadas */
export function likePattern(q) {
  return `%${String(q).replace(/[\\%_]/g, (m) => "\\" + m)}%`;
}
