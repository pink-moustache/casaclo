#!/usr/bin/env bash
# ============================================================================
# Casa Clo · Gestão — teste end-to-end de RLS/grants (PostgreSQL puro).
# Pré-requisitos: contentor casaclo-devdb (postgres:17-alpine, porta 54331),
# migrações aplicadas e seed dos membros de teste corrido (ver README).
# Uso: bash db/tests/rls_e2e.sh
# Modelo: a app liga-se como role casaclo_app e cada transacção arranca com
# SET LOCAL app.user_id — estes testes exercitam exactamente esse contrato.
# Escritas usam commit (persistem entre passos); leituras usam rollback.
# ============================================================================
set -uo pipefail

export PGPASSWORD=dev
PSQL=(psql -h 127.0.0.1 -p 54331 -U postgres -d casaclo -q -tA)

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✔ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
check() { [ "$2" = "$3" ] && ok "$1" || bad "$1 (esperado='$2' obtido='$3')"; }

# corre SQL como a app: role casaclo_app + identidade na transacção
# as_app  <uuid|-> <sql>  → rollback (leituras)
# as_app_c <uuid>  <sql>  → commit   (escritas persistentes)
_run_as() { # _run_as <uuid|-> <commit|rollback> <sql>
  local uid=$1 end=$2 sql=$3
  { echo "begin;"
    echo "set local role casaclo_app;"
    [ "$uid" != "-" ] && echo "select set_config('app.user_id', '$uid', true);"
    echo "$sql"
    echo "$end;"
  } | "${PSQL[@]}" 2>&1
}
as_app()   { _run_as "$1" rollback "$2"; }
as_app_c() { _run_as "$1" commit "$2"; }

echo "— 0. cenas de teste —"
"${PSQL[@]}" -c "delete from orders where customer_id in (select id from customers where name like '%Teste%' or name like '%Debug%');" >/dev/null
"${PSQL[@]}" -c "delete from customers where name like '%Teste%' or name like '%Debug%';" >/dev/null
OWNER=$("${PSQL[@]}" -c "select id from members where email='owner@casa.local'")
PROD=$("${PSQL[@]}" -c "select id from members where email='prod@casa.local'")
INACT=$("${PSQL[@]}" -c "select id from members where email='inactivo@casa.local'")
[ ${#OWNER} -ge 30 ] && ok "3 membros de teste presentes" || bad "membros em falta ($OWNER)"

echo "— 1. fail-closed: sem identidade não se vê nada —"
check "app sem app.user_id lê 0 clientes" "0" "$(as_app - 'select count(*) from customers;' | tail -1)"
check "app sem app.user_id lê 0 encomendas" "0" "$(as_app - 'select count(*) from orders;' | tail -1)"

echo "— 2. produção e inactivo cortados —"
check "production lê 0 clientes" "0" "$(as_app "$PROD" 'select count(*) from customers;' | tail -1)"
check "inactivo lê 0 clientes" "0" "$(as_app "$INACT" 'select count(*) from customers;' | tail -1)"
INS=$(as_app "$PROD" "insert into customers (name) values ('Intruso');" | tail -1)
echo "$INS" | grep -q "violates row-level" && ok "production NÃO insere clientes" || bad "production inseriu: $INS"

echo "— 3. owner: CRUD completo (com commit) —"
CUST=$(as_app_c "$OWNER" "insert into customers (name, phone, allergies) values ('Maria Teste', '+351900000000', 'frutos secos') returning id;" | grep -E '^[0-9a-f-]{36}$' | tail -1)
[ ${#CUST} -ge 30 ] && ok "owner cria cliente (persistido)" || bad "insert cliente falhou: $CUST"
check "owner vê o cliente" "1" "$(as_app "$OWNER" "select count(*) from customers where name='Maria Teste';" | tail -1)"

ORD=$(as_app_c "$OWNER" "insert into orders (customer_id, delivery_date, fulfilment, address, channel, items, total_cents) values ('$CUST', current_date + 3, 'entrega', 'Rua do Teste 1', 'whatsapp', '[{\"desc\":\"Bolo 18cm\",\"qty\":1,\"unit_cents\":3800}]'::jsonb, 3800) returning id;" | grep -E '^[0-9a-f-]{36}$' | tail -1)
[ ${#ORD} -ge 30 ] && ok "owner cria encomenda (persistida)" || bad "insert encomenda falhou: $ORD"
NUM=$(as_app "$OWNER" "select number from orders where id='$ORD';" | tail -1)
ok "encomenda nº $NUM (identity automático)"

as_app_c "$OWNER" "update orders set status='confirmada' where id='$ORD';" >/dev/null
EV=$(as_app "$OWNER" "select kind||':'||from_status||'->'||to_status from order_events where order_id='$ORD' and kind='status_change';" | tail -1)
check "evento de mudança de estado" "status_change:recebida->confirmada" "$EV"
ACT=$(as_app "$OWNER" "select actor_id::text from order_events where order_id='$ORD' and kind='status_change';" | tail -1)
check "actor do evento = quem alterou" "$OWNER" "$ACT"
CB=$(as_app "$OWNER" "select created_by::text from orders where id='$ORD';" | tail -1)
check "created_by preenchido pelo trigger" "$OWNER" "$CB"

PAY=$(as_app_c "$OWNER" "insert into payments (order_id, amount_cents, method_id, note) values ('$ORD', 1500, 1, 'sinal') returning amount_cents;" | tail -1)
check "pagamento registado" "1500" "$PAY"
BAL=$(as_app "$OWNER" "select total_cents||'/'||paid_cents||'/'||due_cents from order_balances where order_id='$ORD';" | tail -1)
check "saldo na vista (3800/1500/2300)" "3800/1500/2300" "$BAL"

echo "— 4. imutabilidades e segredos —"
EVUP=$(as_app "$OWNER" "update order_events set detail='x' where order_id='$ORD';" | tail -1)
echo "$EVUP" | grep -qi "permission denied" && ok "order_events sem UPDATE (grant ausente)" || bad "eventos editáveis: $EVUP"
HASH=$(as_app "$OWNER" "select password_hash from members limit 1;" | tail -1)
echo "$HASH" | grep -qi "permission denied" && ok "password_hash ilegível pela app" || bad "hash legível: $HASH"
INSROLE=$(as_app "$OWNER" "insert into members (email, password_hash) values ('x@x.pt','y');" | tail -1)
echo "$INSROLE" | grep -qi "permission denied" && ok "app não cria membros (só seed/owner)" || bad "app criou membro: $INSROLE"

echo "— 5. verify_login (hash nunca sai da BD) —"
check "senha certa devolve o owner" "1" "$("${PSQL[@]}" -c "select count(*) from private.verify_login('owner@casa.local','senha-Teste-Local-1');" | tail -1)"
check "senha errada devolve 0" "0" "$("${PSQL[@]}" -c "select count(*) from private.verify_login('owner@casa.local','errada');" | tail -1)"
check "inactivo não entra (fail-closed)" "0" "$("${PSQL[@]}" -c "select count(*) from private.verify_login('inactivo@casa.local','senha-Teste-Local-3');" | tail -1)"
check "production entra (papel corta no backend/RLS)" "1" "$("${PSQL[@]}" -c "select count(*) from private.verify_login('prod@casa.local','senha-Teste-Local-2');" | tail -1)"

echo "— 6. role estranha: zero confiança —"
"${PSQL[@]}" -c "do \$\$ begin if not exists (select from pg_roles where rolname='intruso_test') then create role intruso_test nologin; end if; end \$\$;" >/dev/null
INTR=$({ echo "begin; set local role intruso_test; select count(*) from customers; rollback;"; } | "${PSQL[@]}" 2>&1 | tail -1)
echo "$INTR" | grep -qi "permission denied" && ok "role sem grants é bloqueada" || bad "role estranha leu: $INTR"

echo "— 7. limpeza —"
as_app_c "$OWNER" "delete from orders where id='$ORD';" >/dev/null
check "encomenda apagada (cascade eventos/pagamentos)" "0" "$(as_app "$OWNER" "select count(*) from orders where id='$ORD';" | tail -1)"
"${PSQL[@]}" -c "delete from customers where name like '%Teste%' or name like '%Debug%';" >/dev/null
ok "cena limpa"

echo ""
echo "RESULTADO: $PASS passaram, $FAIL falharam"
[ "$FAIL" -eq 0 ]
