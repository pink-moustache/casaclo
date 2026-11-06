-- Casa Clo · Gestão — schema (PostgreSQL puro, sem Supabase).
-- Backend próprio (server/) liga-se como role casaclo_app; a identidade de
-- quem faz cada pedido chega à BD em app.user_id (SET LOCAL por transacção).
-- Convenções: money em cêntimos (integer), datas de entrega em date,
-- timestamps em timestamptz. Passwords: hash bcrypt (pgcrypto) e NUNCA saem
-- da BD — verificação por private.verify_login na migração de segurança.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- role da aplicação (sem login; a infra atribui-lhe password por
-- ALTER ROLE — molde decima-cloud; o owner NUNCA vai ao processo)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'casaclo_app') then
    create role casaclo_app nologin;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Membros (donas) — substitui auth.users/profiles do desenho Supabase.
-- ⚠ FAIL-CLOSED: registo de membros só por seed/migração (não há signup).
-- password_hash = crypt(senha, gen_salt('bf', 12)); active=false corta tudo.
-- ---------------------------------------------------------------------------
create table public.members (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique
    constraint members_email_check check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash text not null,
  display_name  text not null default '',
  role          text not null default 'owner'
    constraint members_role_check check (role in ('owner', 'production')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null
    constraint customers_name_check check (char_length(btrim(name)) between 1 and 200),
  phone       text,
  email       text
    constraint customers_email_check check (
      email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    ),
  address     text,
  nif         text
    constraint customers_nif_check check (nif is null or nif ~ '^[0-9]{9}$'),
  allergies   text,
  preferences text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index customers_name_idx  on public.customers (name);
create index customers_phone_idx on public.customers (phone);

-- ---------------------------------------------------------------------------
-- Encomendas
-- status: recebida → confirmada → em_producao → pronta → entregue (+ cancelada)
-- channel: origem do pedido (fase 1 = registo manual; 'site' chega na fase 3)
-- items (jsonb): [{ "desc": text, "qty": number, "unit_cents": integer }]
-- ---------------------------------------------------------------------------
create table public.orders (
  id           uuid primary key default gen_random_uuid(),
  number       bigint generated always as identity
    constraint orders_number_key unique,
  customer_id  uuid not null
    references public.customers (id) on delete restrict,
  status       text not null default 'recebida'
    constraint orders_status_check check (
      status in ('recebida', 'confirmada', 'em_producao', 'pronta', 'entregue', 'cancelada')
    ),
  channel      text not null default 'whatsapp'
    constraint orders_channel_check check (
      channel in ('whatsapp', 'email', 'telefone', 'loja', 'site', 'outro')
    ),
  delivery_date date not null,
  delivery_time text,
  fulfilment   text not null default 'recolha'
    constraint orders_fulfilment_check check (fulfilment in ('recolha', 'entrega')),
  address      text,
  items        jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  total_cents  integer not null default 0
    constraint orders_total_check check (total_cents >= 0),
  allergies    text,
  notes        text,
  created_by   uuid references public.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index orders_delivery_date_idx on public.orders (delivery_date);
create index orders_status_idx        on public.orders (status);
create index orders_customer_id_idx   on public.orders (customer_id);
create index orders_created_by_idx    on public.orders (created_by);

-- ---------------------------------------------------------------------------
-- Métodos de pagamento (tabela de referência, editável pela app)
-- ---------------------------------------------------------------------------
create table public.payment_methods (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  active     boolean not null default true,
  sort_order integer not null default 0
);

insert into public.payment_methods (name, sort_order) values
  ('MB Way', 1),
  ('Transferência bancária', 2),
  ('Numerário', 3)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Pagamentos (sinal, prestações e acertos)
-- ---------------------------------------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  amount_cents integer not null
    constraint payments_amount_check check (amount_cents > 0),
  method_id    bigint references public.payment_methods (id) on delete set null,
  paid_on      date not null default current_date,
  note         text,
  created_by   uuid references public.members (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index payments_order_id_idx  on public.payments (order_id);
create index payments_paid_on_idx   on public.payments (paid_on);
create index payments_method_id_idx on public.payments (method_id);

-- ---------------------------------------------------------------------------
-- Histórico de eventos das encomendas (imutável; auditoria leve)
-- ---------------------------------------------------------------------------
create table public.order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  kind        text not null
    constraint order_events_kind_check check (kind in ('created', 'status_change', 'note')),
  from_status text
    constraint order_events_from_check check (
      from_status is null or from_status in
        ('recebida', 'confirmada', 'em_producao', 'pronta', 'entregue', 'cancelada')
    ),
  to_status   text
    constraint order_events_to_check check (
      to_status is null or to_status in
        ('recebida', 'confirmada', 'em_producao', 'pronta', 'entregue', 'cancelada')
    ),
  detail      text,
  actor_id    uuid references public.members (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index order_events_order_id_idx on public.order_events (order_id, created_at);
create index order_events_actor_id_idx on public.order_events (actor_id);

-- ---------------------------------------------------------------------------
-- Vista de saldos por encomenda (security_invoker ⇒ herda o RLS das tabelas)
-- ---------------------------------------------------------------------------
create view public.order_balances
with (security_invoker = true)
as
select
  o.id           as order_id,
  o.number::int  as number,
  o.status,
  o.customer_id,
  c.name         as customer_name,
  o.delivery_date,
  o.fulfilment,
  o.total_cents,
  coalesce(p.paid_cents, 0) as paid_cents,
  o.total_cents - coalesce(p.paid_cents, 0) as due_cents
from public.orders o
join public.customers c on c.id = o.customer_id
left join (
  select order_id, sum(amount_cents) as paid_cents
  from public.payments
  group by order_id
) p on p.order_id = o.id;

-- ---------------------------------------------------------------------------
-- Funções e gatilhos
-- ---------------------------------------------------------------------------

-- identidade da transacção (o backend faz SET LOCAL app.user_id por pedido;
-- missing_ok para não estourar em ligações administrativas)
create function public.app_member_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- updated_at automático
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger members_set_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- created_by automático (identidade da transacção; null se vier do owner)
create function public.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by = coalesce(new.created_by, public.app_member_id());
  return new;
end;
$$;

create trigger orders_set_created_by
  before insert on public.orders
  for each row execute function public.set_created_by();

create trigger payments_set_created_by
  before insert on public.payments
  for each row execute function public.set_created_by();

-- registo de mudanças de estado no histórico (actor = identidade da tx)
create function public.log_order_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_events (order_id, kind, from_status, to_status, actor_id)
    values (new.id, 'status_change', old.status, new.status, public.app_member_id());
  end if;
  return new;
end;
$$;

create trigger orders_log_status_change
  after update on public.orders
  for each row execute function public.log_order_status_change();
