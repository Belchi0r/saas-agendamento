-- SPK-006 laboratory schema. This migration is intentionally self-contained so
-- it can run in both vanilla PostgreSQL and a disposable Supabase project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'barber_runtime') then
    create role barber_runtime nologin;
  end if;
end
$$;

alter role barber_runtime
  nologin
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit
  noreplication
  nobypassrls
  connection limit 12;

revoke create on database postgres from barber_runtime;

create schema if not exists app_private;
create schema if not exists external_private;

revoke all on schema app_private
  from public, anon, authenticated, service_role, barber_runtime;
revoke all on schema external_private
  from public, anon, authenticated, service_role, barber_runtime;
revoke create on schema public from barber_runtime;

create table app_private.business (
  id uuid primary key,
  public_name text not null,
  admin_auth_user_id uuid not null unique,
  public_booking_enabled boolean not null default true,
  operational_enabled boolean not null default true,
  availability_version integer not null default 1,
  constraint business_availability_version_positive
    check (availability_version > 0)
);

create table app_private.service (
  id uuid primary key,
  business_id uuid not null,
  name text not null,
  active boolean not null default true,
  version integer not null default 1,
  constraint service_business_fk
    foreign key (business_id)
    references app_private.business (id),
  constraint service_business_id_uk unique (business_id, id),
  constraint service_version_positive check (version > 0)
);

create table app_private.customer (
  id uuid primary key,
  business_id uuid not null,
  display_name text not null,
  constraint customer_business_fk
    foreign key (business_id)
    references app_private.business (id),
  constraint customer_business_id_uk unique (business_id, id)
);

create table app_private.appointment (
  id uuid primary key,
  business_id uuid not null,
  service_id uuid not null,
  customer_id uuid not null,
  status text not null default 'CONFIRMED',
  constraint appointment_business_fk
    foreign key (business_id)
    references app_private.business (id),
  constraint appointment_service_business_fk
    foreign key (business_id, service_id)
    references app_private.service (business_id, id),
  constraint appointment_customer_business_fk
    foreign key (business_id, customer_id)
    references app_private.customer (business_id, id),
  constraint appointment_business_id_uk unique (business_id, id)
);

create table app_private.schedule_occupancy (
  id uuid primary key,
  business_id uuid not null,
  appointment_id uuid not null,
  released_at timestamptz,
  constraint schedule_occupancy_business_fk
    foreign key (business_id)
    references app_private.business (id),
  constraint schedule_occupancy_appointment_business_fk
    foreign key (business_id, appointment_id)
    references app_private.appointment (business_id, id)
);

create index service_business_id_idx
  on app_private.service (business_id);
create index customer_business_id_idx
  on app_private.customer (business_id);
create index appointment_business_id_idx
  on app_private.appointment (business_id);
create index appointment_business_service_idx
  on app_private.appointment (business_id, service_id);
create index appointment_business_customer_idx
  on app_private.appointment (business_id, customer_id);
create index schedule_occupancy_business_id_idx
  on app_private.schedule_occupancy (business_id);
create index schedule_occupancy_business_appointment_idx
  on app_private.schedule_occupancy (business_id, appointment_id);

create table external_private.secret_probe (
  id integer primary key,
  label text not null
);
insert into external_private.secret_probe (id, label)
values (1, 'must remain unreachable');

revoke all on all tables in schema app_private
  from public, anon, authenticated, service_role, barber_runtime;
revoke all on all sequences in schema app_private
  from public, anon, authenticated, service_role, barber_runtime;
revoke all on all routines in schema app_private
  from public, anon, authenticated, service_role, barber_runtime;
revoke all on all tables in schema external_private
  from public, anon, authenticated, service_role, barber_runtime;

-- Keep future objects private even if the migration owner has broader platform
-- defaults. These statements are evidence for the intended owner, postgres.
alter default privileges for role postgres in schema app_private
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema app_private
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema app_private
  revoke all on routines from public, anon, authenticated, service_role;

grant usage on schema app_private to barber_runtime;
grant select on app_private.business to barber_runtime;
grant update (
  public_name,
  public_booking_enabled,
  operational_enabled,
  availability_version
) on app_private.business to barber_runtime;
grant select on app_private.service to barber_runtime;
grant insert (id, business_id, name, active, version)
  on app_private.service to barber_runtime;
grant update (name, active, version)
  on app_private.service to barber_runtime;

grant select on app_private.customer to barber_runtime;
grant insert (id, business_id, display_name)
  on app_private.customer to barber_runtime;
grant update (display_name)
  on app_private.customer to barber_runtime;

grant select on app_private.appointment to barber_runtime;
grant insert (id, business_id, service_id, customer_id, status)
  on app_private.appointment to barber_runtime;
grant update (service_id, customer_id, status)
  on app_private.appointment to barber_runtime;

grant select on app_private.schedule_occupancy to barber_runtime;
grant insert (id, business_id, appointment_id, released_at)
  on app_private.schedule_occupancy to barber_runtime;
grant update (released_at)
  on app_private.schedule_occupancy to barber_runtime;
