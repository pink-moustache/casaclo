// Casa Clo · Gestão — seed insert-only e idempotente dos membros (donas).
// Uso:
//   DATABASE_URL=… CASACLO_INITIAL_PASSWORDS='email=senha;email2=senha2' npm run seed
// Guarda de alvo: recusa BDs não-locais sem ALLOW_SEED_TARGET=1 (molde casa).
// Os hashes nascem NA BD (crypt/gen_salt) — as senhas em claro não tocam SQL
// interpolado nem logs; membros já existentes ficam INTACTOS (insert-only).
import pg from "pg";

function parsePasswords(raw) {
  const out = [];
  for (const pair of String(raw || "").split(";")) {
    const [email, ...rest] = pair.split("=");
    const password = rest.join("=");
    const mail = String(email || "").trim();
    if (mail && password) out.push({ email: mail, password });
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL em falta."); process.exit(1); }

  // guarda: só corre contra localhost/contêineres de dev sem flag explícita
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  if (!isLocal && process.env.ALLOW_SEED_TARGET !== "1") {
    console.error("Alvo não-local recusado (define ALLOW_SEED_TARGET=1 para forçar).");
    process.exit(1);
  }

  const members = parsePasswords(process.env.CASACLO_INITIAL_PASSWORDS);
  if (!members.length) {
    console.error("CASACLO_INITIAL_PASSWORDS vazio — nada a semear (fail-closed).");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const { rows: existing } = await client.query("select email from members");
  const have = new Set(existing.map((r) => r.email.toLowerCase()));
  let inserted = 0;

  for (const m of members) {
    if (have.has(m.email.toLowerCase())) {
      console.log(`= ${m.email} já existe — intocado`);
      continue;
    }
    const { rows } = await client.query(
      `insert into members (email, password_hash, display_name, role, active)
       values ($1, extensions.crypt($2, extensions.gen_salt('bf', 12)), $3, 'owner', true)
       on conflict (email) do nothing
       returning email`,
      [m.email, m.password, m.email.split("@")[0]],
    );
    if (rows.length) { inserted++; console.log(`+ ${m.email} (owner, activo)`); }
  }

  console.log(`Seed concluído: ${inserted} criados, ${members.length - inserted} já existiam.`);
  await client.end();
}

main();
