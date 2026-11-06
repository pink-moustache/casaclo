// Casa Clo · Gestão — migrador versionado (registry próprio casaclo_schema_migrations).
// Uso:
//   DATABASE_URL=postgres://… npm run db:migrate          # aplica
//   DATABASE_URL=postgres://… npm run db:migrate:dry      # lista pendentes
// Liga-se com credenciais de OWNER (só para migrar); a app nunca usa isto.
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(here, "migrations");

async function main() {
  const dry = process.argv.includes("--dry-run");
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL em falta."); process.exit(1); }

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  if (!files.length) { console.error("Sem migrações em", MIGRATIONS_DIR); process.exit(1); }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  await client.query(`
    create table if not exists casaclo_schema_migrations (
      version    text primary key,
      applied_at timestamptz not null default now()
    )`);
  const { rows } = await client.query("select version from casaclo_schema_migrations");
  const applied = new Set(rows.map((r) => r.version));
  const pending = files.filter((f) => !applied.has(f));

  console.log(`Migrações: ${applied.size} aplicadas · ${pending.length} pendentes${dry ? " (dry-run)" : ""}`);
  if (dry) { pending.forEach((f) => console.log("  —", f)); await client.end(); return; }

  for (const f of pending) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, f), "utf8");
    console.log("  ↓", f);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into casaclo_schema_migrations (version) values ($1)", [f]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      console.error(`FALHA em ${f}:`, e.message);
      process.exit(1);
    }
  }
  console.log("Concluído.");
  await client.end();
}

main();
