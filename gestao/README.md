# Casa Clo · Gestão

Plataforma interna de gestão (fase 1): **encomendas, clientes, pagamentos e
dashboard do dia**, com login só para os donos. Corre na **Decima Cloud**
como um serviço Node + PostgreSQL dedicado — **sem Supabase e sem Netlify**
(decisão da dona, 06/11/2026; molde = DECIMA DESK / centro-de-comando).
O deploy de produção é executado pela sessão de infra seguindo o contrato
`docs/DEPLOY-DECIMA-CLOUD.md` — este repo não toca em infra.

Fase 1 (esta): registo manual de encomendas vindas do WhatsApp/email.
Fase 2 (futura): stock, lista de compras, receitas. Fase 3: formulário
público no site, notificações, fornecedores.

```
gestao/
├── server/            ← backend Node puro (HTTP + REST + cookie de sessão)
│   ├── index.mjs      ← rotas, estáticos, headers de segurança, healthz
│   ├── auth.mjs       ← JWT HS256 + cookies
│   └── db.mjs         ← pool pg (role casaclo_app) + transacções com identidade
├── public/            ← SPA estática (a mesma de sempre, sem supabase-js)
│   ├── index.html
│   ├── css/app.css    ← identidade da marca (paleta + fontes auto-hospedadas)
│   └── js/            ← api.js (fetch REST), app.js (router), views/
├── db/
│   ├── migrations/    ← 20261106…_schema.sql + …_security_rls.sql
│   ├── migrate.mjs    ← registry próprio casaclo_schema_migrations (dry-run ok)
│   ├── seed.mjs       ← membros (donas) a partir de CASACLO_INITIAL_PASSWORDS
│   └── tests/         ← rls_e2e.sh (25 checks) + api_smoke.mjs (28 checks)
├── docs/DEPLOY-DECIMA-CLOUD.md  ← contrato com a infra (molde casa)
├── Dockerfile         ← node:22-alpine, /healthz, não-root
└── package.json       ← única dependência: pg
```

---

## Modelo de dados (fase 1)

- `members` — donas (email único, hash bcrypt **gerado e verificado sempre
  dentro da BD** via `private.verify_login`; o hash nunca sai de lá);
  `role` (`owner`/`production`) e `active`. Não existe signup: membros
  nascem por seed/script com credenciais fornecidas pela infra.
- `customers` — nome, contactos, morada, NIF, **alergias**, preferências.
- `orders` — nº sequencial, cliente, `status`
  (recebida → confirmada → em_producao → pronta → entregue | cancelada),
  canal, data/hora, recolha/entrega, `items` (jsonb), total, notas.
- `payment_methods` — editável pela app (seed: MB Way, Transferência, Numerário).
- `payments` — por encomenda; saldo sempre derivado (vista `order_balances`).
- `order_events` — histórico imutável com autor (quem criou/mudou estados).

Segurança: RLS em tudo; a app liga-se como `casaclo_app` e **cada transacção**
arranca com `SET LOCAL app.user_id` — só membros `owner` activos passam
(`private.is_owner()`); sem identidade nada se vê (fail-closed). A role da
app não tem `SELECT` ao `password_hash`, não pode criar/apagar membros e
`order_events` é sem update/delete. Os testes provam tudo isto (ver abaixo).

---

## Desenvolvimento local

Pré-requisitos: Docker, Node 22+, psql.

```bash
cd gestao
npm install

# 1. BD local descartável
docker rm -f casaclo-devdb; docker run -d --name casaclo-devdb \
  -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=casaclo -p 54331:5432 postgres:17-alpine

# 2. migrações + membros de teste + login da role da app
export DATABASE_URL="postgres://postgres:dev@127.0.0.1:54331/casaclo"
npm run db:migrate
CASACLO_INITIAL_PASSWORDS='owner@casa.local=senha-Teste-Local-1;prod@casa.local=senha-Teste-Local-2;inactivo@casa.local=senha-Teste-Local-3' npm run seed
docker exec casaclo-devdb psql -U postgres -d casaclo -c \
  "alter role casaclo_app login password 'devapp'; \
   update members set role='production' where email='prod@casa.local'; \
   update members set active=false where email='inactivo@casa.local'"

# 3. testes (devem ficar 25/25 e 28/28)
bash db/tests/rls_e2e.sh
node db/tests/api_smoke.mjs

# 4. servir a plataforma
DATABASE_URL="postgres://casaclo_app:devapp@127.0.0.1:54331/casaclo" \
  COOKIE_SECRET=segredo npm start
# abrir http://127.0.0.1:8315/ — owner@casa.local / senha-Teste-Local-1
```

Variáveis do servidor: `PORT` (8315), `DATABASE_URL` (role da app),
`COOKIE_SECRET` (obrigatório em produção), `COOKIE_SECURE=1` (atrás de TLS),
`SESSION_TTL_HOURS` (168 por omissão).

## Migrações futuras

Novas mudanças de schema vivem em `db/migrations/` (criar com nome
`AAAAmmddHHMMSS_nome.sql`); `npm run db:migrate:dry` lista as pendentes e o
migrador é transaccional e idempotente pelo registry. Em produção as
migrações são aplicadas pela infra com credenciais de owner (ver contrato).

## Produção

Ver `docs/DEPLOY-DECIMA-CLOUD.md` (contrato com a infra: BD dedicada,
projecto no painel, env refs, webhook de auto-deploy, ingress+CNAME, backup,
vigia e cápsulas de credenciais para as donas).
