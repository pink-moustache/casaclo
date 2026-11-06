-- Casa Clo · Gestão — segurança: login na BD, RLS e grants.
-- Modelo: a aplicação liga-se como casaclo_app; cada transacção arranca com
-- SET LOCAL app.user_id = <member id>. A RLS só deixa passar membros
-- activos com role 'owner'. O hash da password nunca sai da BD:
-- private.verify_login compara com crypt() e devolve apenas os dados
-- públicos do membro. Não existe signup — membros nascem por seed/script.

-- ---------------------------------------------------------------------------
-- Schema privado (funções de autorização — não expostas a grants de dados)
-- ---------------------------------------------------------------------------
create schema if not exists private;

-- login: compara a password e devolve o membro (sem o hash).
-- security definer para ler members SEM RLS; revogada a execução directa
-- a tudo excepto casaclo_app (o backend é o único chamador).
create function private.verify_login(p_email text, p_password text)
returns table (id uuid, email text, display_name text, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select * into r
  from public.members mm
  where lower(mm.email) = lower(p_email)
    and mm.active
  limit 1;

  if r.id is null or r.password_hash is distinct from extensions.crypt(p_password, r.password_hash) then
    return; -- vazio = credenciais inválidas (não distinguimos o motivo)
  end if;

  return query select r.id, r.email, r.display_name, r.role;
end;
$$;

-- autorização: o membro da transacção é um owner activo?
-- security definer para saltar a RLS de members sem recursão de policies.
create function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    where m.id = public.app_member_id()
      and m.role = 'owner'
      and m.active
  );
$$;

-- execução directa só para a role da app (o backend é o único chamador)
revoke all on function private.verify_login(text, text) from public;
grant execute on function private.verify_login(text, text) to casaclo_app;

revoke all on function private.is_owner() from public;
grant execute on function private.is_owner() to casaclo_app;
grant execute on function public.app_member_id() to casaclo_app;
grant usage on schema private to casaclo_app;

-- funções futuras em private não ficam chamáveis por omissão
alter default privileges in schema private
  revoke execute on functions from public, casaclo_app;

-- gatilhos: sem execução directa
revoke execute on function public.set_updated_at() from public, casaclo_app;
revoke execute on function public.set_created_by() from public, casaclo_app;
revoke execute on function public.log_order_status_change() from public, casaclo_app;

-- ---------------------------------------------------------------------------
-- RLS — tudo fechado por omissão; só owners activos passam
-- ---------------------------------------------------------------------------
alter table public.members         enable row level security;
alter table public.customers       enable row level security;
alter table public.orders          enable row level security;
alter table public.payment_methods enable row level security;
alter table public.payments        enable row level security;
alter table public.order_events    enable row level security;

-- members: dono vê/edita os dados PÚBLICOS dos membros; password_hash é
-- coluna à parte SEM grant de select ⇒ ilegível pela app por design.
-- (verify_login é o único caminho para validar credenciais.)
create policy members_select on public.members
  for select to casaclo_app
  using ((select private.is_owner()));

create policy members_update on public.members
  for update to casaclo_app
  using ((select private.is_owner()))
  with check ((select private.is_owner()));
-- sem insert/delete para a app: membros nascem por seed/script (owner)

create policy customers_select on public.customers
  for select to casaclo_app
  using ((select private.is_owner()));

create policy customers_insert on public.customers
  for insert to casaclo_app
  with check ((select private.is_owner()));

create policy customers_update on public.customers
  for update to casaclo_app
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

create policy customers_delete on public.customers
  for delete to casaclo_app
  using ((select private.is_owner()));

create policy orders_select on public.orders
  for select to casaclo_app
  using ((select private.is_owner()));

create policy orders_insert on public.orders
  for insert to casaclo_app
  with check ((select private.is_owner()));

create policy orders_update on public.orders
  for update to casaclo_app
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

create policy orders_delete on public.orders
  for delete to casaclo_app
  using ((select private.is_owner()));

-- métodos: leitura para qualquer membro activo da app (dropdowns);
-- escrita só para owners
create policy payment_methods_select on public.payment_methods
  for select to casaclo_app
  using (true);

create policy payment_methods_insert on public.payment_methods
  for insert to casaclo_app
  with check ((select private.is_owner()));

create policy payment_methods_update on public.payment_methods
  for update to casaclo_app
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

create policy payment_methods_delete on public.payment_methods
  for delete to casaclo_app
  using ((select private.is_owner()));

create policy payments_select on public.payments
  for select to casaclo_app
  using ((select private.is_owner()));

create policy payments_insert on public.payments
  for insert to casaclo_app
  with check ((select private.is_owner()));

create policy payments_update on public.payments
  for update to casaclo_app
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

create policy payments_delete on public.payments
  for delete to casaclo_app
  using ((select private.is_owner()));

-- histórico: leitura para owners; inserção permitida (o gatilho de estado
-- escreve com a identidade da transacção); update/delete NÃO existem
-- por desenho — o registo é imutável
create policy order_events_select on public.order_events
  for select to casaclo_app
  using ((select private.is_owner()));

create policy order_events_insert on public.order_events
  for insert to casaclo_app
  with check ((select private.is_owner()));

-- ---------------------------------------------------------------------------
-- Grants mínimos para a role da aplicação
-- ---------------------------------------------------------------------------
grant usage on schema public to casaclo_app;

grant select, insert, update, delete on
  public.customers, public.orders, public.payments, public.payment_methods
  to casaclo_app;
grant select (id, email, display_name, role, active, created_at, updated_at),
      update (display_name, role, active) on public.members to casaclo_app;
grant select, insert on public.order_events to casaclo_app;
grant select on public.order_balances to casaclo_app;
