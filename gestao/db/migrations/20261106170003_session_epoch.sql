-- Casa Clo · Gestão — refinações da revisão independente (06/11):
-- M1: verify_login com custo constante (anti-enumeração de emails)
-- M2: session_epoch em members (rotação de password mata sessões)

-- M2: epoch de sessão — incrementar invalida todos os JWT emitidos antes
alter table public.members
  add column if not exists session_epoch integer not null default 0;

grant select (session_epoch) on public.members to casaclo_app;

-- M1: verify_login devolve também o epoch da sessão e corre o mesmo KDF
-- (gen_salt bf/12) mesmo quando o email não existe — tempo de resposta
-- constante entre "email inexistente" e "senha errada".
drop function if exists private.verify_login(text, text);
create function private.verify_login(p_email text, p_password text)
returns table (id uuid, email text, display_name text, role text, session_epoch integer)
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

  if r.id is null then
    -- igualar o custo do caminho de senha errada (anti-enumeração)
    perform extensions.crypt(p_password, extensions.gen_salt('bf', 12));
    return; -- vazio = credenciais inválidas (não distinguimos o motivo)
  end if;

  if r.password_hash is distinct from extensions.crypt(p_password, r.password_hash) then
    return;
  end if;

  return query select r.id, r.email, r.display_name, r.role, r.session_epoch;
end;
$$;

revoke all on function private.verify_login(text, text) from public;
grant execute on function private.verify_login(text, text) to casaclo_app;
