# DEPLOY DECIMA CLOUD — Casa Clo · Gestão

Contrato entre o produto (este repo) e a infra (operador único). Molde:
DECIMA DESK / centro-de-comando-operacao. Estado: **produto pronto e
testado localmente** (RLS 25/25; API 28/28; revisão independente a correr)
— decisões da dona FECHADAS 06/11 (hostname `casaclo.oooooo.systems`,
conta única `ines@oooooo.systems`); falta só o push do código e a
execução da infra (pedido na PONTE 06/11 16h4x + adenda).

## O que é

Plataforma de gestão da Casa Clo (fase 1: encomendas, clientes, pagamentos,
dashboard). Serviço Node 22 + **PostgreSQL directo** (sem Supabase/Netlify,
decisão da dona 06/11) que serve a própria SPA estática. Repo:
`casaclo` (o site público vive na raiz; a plataforma em `gestao/`).

## §1 Imagem / runtime

- `gestao/Dockerfile` (node:22-alpine, não-root, `HEALTHCHECK /healthz`).
- Sem build step: `npm ci --omit=dev` (única dependência: `pg`).
- Porta interna **8315** (`PORT`), `GET /healthz` → `200 {"ok":true}`
  (prova ligação à BD como role da app; 503 sem BD).
- Projecto no painel: org a escolher pela infra (`decima` ou
  `pink-moustache` — sem preferência do produto); kind **service**;
  dockerfile `gestao/Dockerfile`; **contexto de build `gestao/`** (a imagem
  copia `server/`, `db/` e `public/` a partir dessa pasta).

## §2 Base de dados

- PostgreSQL dedicado, molde `dc-*-db` (postgres:17-alpine, sem portas
  públicas, `.env`/`db.url` 0600, password de owner gerada no host).
- **Migrações pelo script do repo** com credenciais de owner:
  ```bash
  DATABASE_URL='<owner>' npm run db:migrate        # dentro de gestao/ (dry-run: db:migrate:dry)
  ```
  Registry próprio `casaclo_schema_migrations`; 2 migrações transaccionais
  e idempotentes. A migração 1 cria a role `casaclo_app` (nologin) —
  a infra atribui-lhe password (`ALTER ROLE casaclo_app LOGIN PASSWORD …`)
  e guarda-a no keychain (molde casa). **O owner nunca vai ao processo.**

## §3 Seed (uma vez)

- **DECIDIDO pela dona (06/11)**: uma conta dona — **`ines@oooooo.systems`**.
  Password gerada pela infra, cápsula para a dona (§8):
  ```bash
  DATABASE_URL='<owner>' ALLOW_SEED_TARGET=1 \
  CASACLO_INITIAL_PASSWORDS='ines@oooooo.systems=<senha>' npm run seed
  ```
  Insert-only e idempotente; guarda de alvo não-local (recusa sem
  `ALLOW_SEED_TARGET=1`); hashes bcrypt nascem dentro da BD.
  O seed com lista vazia falha fechado — sem membros ninguém entra.
  Contas adicionais no futuro: nova linha no seed (insert-only, nunca
  edita membros existentes) ou criação directa na BD pela infra.

## §4 service_env_refs

| ref                | origem (webhook.env/keychain) | notas                                   |
|--------------------|-------------------------------|-----------------------------------------|
| `DATABASE_URL`     | `CASACLO_DATABASE_URL`        | ligação como `casaclo_app` (não owner)  |
| `COOKIE_SECRET`    | `CASACLO_COOKIE_SECRET`       | segredo HMAC da sessão (gerar forte)    |
| `COOKIE_SECURE`    | fixo `1`                      | atrás do túnel TLS-terminado            |
| `PORT`             | fixo `8315`                   | porta interna do projecto               |

Aliases `DESTINO=FONTE` no molde da casa para blindar o namespace partilhado.

## §5 Webhook

- GitHub push (json) → auto-deploy do main deste repo (molde casa:
  ping 200, má-assinatura 401, 0 deploys espúrios).

## §6 Ingress + DNS

- **DECIDIDO pela dona (06/11)**: hostname **`casaclo.oooooo.systems`**
  (CNAME proxied `casaclo` na zona `oooooo.systems` — zero contacto com a
  zona casaclodoces/MX do email; molde gestão.oooooo.systems do CCOP).
- Regra de ingress antes do catch-all + rollback arquivado (molde casa).

## §7 Verificação de aceite (produto)

1. `/healthz` 200 `{"ok":true}`;
2. raiz serve o login da plataforma (HTML «Casa Clo · Gestão»);
3. login real de uma dona (password da cápsula) → dashboard “Hoje”;
4. criar encomenda + cliente, mudar estado, registar pagamento, ver saldos;
5. sem cookie: qualquer `/api/*` → 401;
6. conta desactivada (se existir) → 401 no login.

## §8 Cápsulas

- Passwords iniciais das donas via cápsulas do vault (TTL 72h,
  burn-on-open, links nunca em transcript — padrão casa).
- Rotação futura de passwords: por enquanto via infra (novo seed manual ou
  UPDATE com crypt); UI de mudança de password é roadmap do produto.

## Fase B (depois da gestão live, pedido separado)

Migrar o **site público** (`casaclodoces.com`, estático puro na raiz do
repo) para a cloud como projecto static (molde malveira-guincho), mantendo
a zona DNS do email intocada; flip só com checkpoint da dona.

## §9 Backups (obrigatório antes do GO)

- `backup-offsite.sh` **+1 passo** `casaclo-$TS.dump` (dump do `dc-casaclo-db`;
  molde desk/ccop: hash-idêntico no off-site, retenção como a frota).
- Antes de considerar PRODUCTION_VERIFIED: execução manual de prova com
  dump legível **+ restauro ensaiado** (molde casa; criar a role
  `casaclo_app` antes do `pg_restore` para exit 0 limpo).

## Notas de segurança do produto (para o advisor da infra)

- RLS em todas as tabelas; role `casaclo_app` com grants mínimos;
  `password_hash` ilegível à role; `order_events` imutável; login verifica
  bcrypt dentro da BD (`private.verify_login`, custo constante —
  anti-enumeração); rate-limit leve (10 falhas/15 min por email); cookies
  HttpOnly+SameSite=Lax+Secure; CSP sem `unsafe-inline` para scripts;
  estáticos com path-traversal bloqueado.
- **Rotação de password / revogação de sessões**: cada membro tem
  `session_epoch` (int); emitir sessão nova inclui o epoch no JWT e cada
  pedido compara com a BD. Rodar password = `update members set
  password_hash = crypt('nova', gen_salt('bf',12)), session_epoch =
  session_epoch + 1 where email='…'` → mata todas as sessões activas na
  hora (fazer pela infra, via owner).
- Funções `security definer` (`private.is_owner`, `private.verify_login`)
  com `search_path=''`, execução revogada a PUBLIC e concedida só à role
  da app; schema `private` com default privileges revogadas.
