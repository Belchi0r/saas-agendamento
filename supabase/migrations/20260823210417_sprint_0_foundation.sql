-- Sprint 0 infrastructure only. Domain tables belong to feature migrations.
-- This migration intentionally does not modify Supabase-managed auth/storage.

do $$
declare
  runtime_role record;
begin
  select
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolinherit,
    rolreplication,
    rolbypassrls,
    rolconnlimit
  into runtime_role
    from pg_roles
    where rolname = 'barber_runtime';

  if not found then
    create role barber_runtime
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication
      nobypassrls
      connection limit 12;
  elsif runtime_role.rolcanlogin
    or runtime_role.rolsuper
    or runtime_role.rolcreatedb
    or runtime_role.rolcreaterole
    or runtime_role.rolinherit
    or runtime_role.rolreplication
    or runtime_role.rolbypassrls
    or runtime_role.rolconnlimit <> 12 then
    raise exception
      'barber_runtime exists with unexpected role attributes; refusing to alter it';
  end if;
end
$$;

alter role barber_runtime
  set search_path = app_private, pg_catalog;

do $$
begin
  execute format(
    'revoke create on database %I from barber_runtime',
    current_database()
  );
end
$$;

create schema if not exists app_private;

revoke all on schema app_private from public, barber_runtime;
revoke create on schema public from barber_runtime;

-- Data API roles vary between vanilla PostgreSQL and Supabase. Revoke them
-- when present so the migration remains testable on ephemeral PostgreSQL.
do $$
declare
  target_role text;
begin
  foreach target_role in array array['anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = target_role) then
      execute format(
        'revoke all on schema app_private from %I',
        target_role
      );
    end if;
  end loop;
end
$$;

-- Future objects stay private by default. Each feature migration must grant
-- only the exact table/column privileges required by barber_runtime.
alter default privileges in schema app_private
  revoke all on tables from public;
alter default privileges in schema app_private
  revoke all on sequences from public;
alter default privileges in schema app_private
  revoke all on routines from public;

do $$
declare
  target_role text;
begin
  foreach target_role in array array['anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = target_role) then
      execute format(
        'alter default privileges in schema app_private revoke all on tables from %I',
        target_role
      );
      execute format(
        'alter default privileges in schema app_private revoke all on sequences from %I',
        target_role
      );
      execute format(
        'alter default privileges in schema app_private revoke all on routines from %I',
        target_role
      );
    end if;
  end loop;
end
$$;

grant usage on schema app_private to barber_runtime;
