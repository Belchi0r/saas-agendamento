-- SPK-001 disposable laboratory migration.
-- This is a deliberately narrow subset of the approved logical model. It
-- exists only to test booking concurrency and database integrity.

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create schema app_private;

create table app_private.business (
  id uuid primary key,
  availability_version integer not null default 1,
  created_at timestamptz not null default now(),
  constraint business_availability_version_positive
    check (availability_version > 0)
);

create table app_private.appointment (
  id uuid primary key,
  business_id uuid not null,
  status text not null,
  version integer not null default 1,
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  occupied_start_at timestamptz not null,
  occupied_end_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint appointment_business_id_id_unique unique (business_id, id),
  constraint appointment_business_fk foreign key (business_id)
    references app_private.business (id) on delete restrict,
  constraint appointment_status_valid
    check (status in ('CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  constraint appointment_version_positive check (version > 0),
  constraint appointment_scheduled_period_valid
    check (scheduled_start_at < scheduled_end_at),
  constraint appointment_occupied_period_contains_service check (
    occupied_start_at <= scheduled_start_at
    and occupied_end_at >= scheduled_end_at
    and occupied_start_at < occupied_end_at
  )
);

create table app_private.blocked_period (
  id uuid primary key,
  business_id uuid not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint blocked_period_business_id_id_unique unique (business_id, id),
  constraint blocked_period_business_fk foreign key (business_id)
    references app_private.business (id) on delete restrict,
  constraint blocked_period_valid check (start_at < end_at)
);

create table app_private.schedule_occupancy (
  id uuid primary key,
  business_id uuid not null,
  appointment_id uuid,
  blocked_period_id uuid,
  occupied_period tstzrange not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  constraint schedule_occupancy_business_fk foreign key (business_id)
    references app_private.business (id) on delete restrict,
  constraint schedule_occupancy_appointment_fk
    foreign key (business_id, appointment_id)
    references app_private.appointment (business_id, id) on delete restrict,
  constraint schedule_occupancy_blocked_period_fk
    foreign key (business_id, blocked_period_id)
    references app_private.blocked_period (business_id, id) on delete restrict,
  constraint schedule_occupancy_exactly_one_owner check (
    (appointment_id is not null)::integer
    + (blocked_period_id is not null)::integer = 1
  ),
  constraint schedule_occupancy_period_is_half_open check (
    not isempty(occupied_period)
    and lower_inc(occupied_period)
    and not upper_inc(occupied_period)
    and lower(occupied_period) < upper(occupied_period)
  )
);

create unique index schedule_occupancy_appointment_unique
  on app_private.schedule_occupancy (appointment_id)
  where appointment_id is not null;

create unique index schedule_occupancy_blocked_period_unique
  on app_private.schedule_occupancy (blocked_period_id)
  where blocked_period_id is not null;

create index schedule_occupancy_business_released_idx
  on app_private.schedule_occupancy (business_id, released_at);

alter table app_private.schedule_occupancy
  add constraint schedule_occupancy_no_overlap
  exclude using gist (
    business_id extensions.gist_uuid_ops with =,
    occupied_period with &&
  )
  where (released_at is null);

create function app_private.assert_appointment_occupancy(
  p_business_id uuid,
  p_appointment_id uuid
) returns void
language plpgsql
set search_path = pg_catalog, app_private
as $$
declare
  v_status text;
  v_occupied_start_at timestamptz;
  v_occupied_end_at timestamptz;
  v_active_count integer;
  v_exact_count integer;
begin
  select status, occupied_start_at, occupied_end_at
    into v_status, v_occupied_start_at, v_occupied_end_at
  from app_private.appointment
  where business_id = p_business_id and id = p_appointment_id;

  if not found then
    return;
  end if;

  select
    count(*) filter (where released_at is null),
    count(*) filter (
      where released_at is null
        and occupied_period = tstzrange(
          v_occupied_start_at,
          v_occupied_end_at,
          '[)'
        )
    )
    into v_active_count, v_exact_count
  from app_private.schedule_occupancy
  where business_id = p_business_id
    and appointment_id = p_appointment_id;

  if v_status in ('CONFIRMED', 'COMPLETED', 'NO_SHOW') then
    if v_active_count <> 1 or v_exact_count <> 1 then
      raise exception using
        errcode = '23514',
        constraint = 'schedule_occupancy_owner_required',
        message = 'Appointment requires exactly one matching active occupancy';
    end if;
  elsif v_status = 'CANCELLED' and v_active_count <> 0 then
    raise exception using
      errcode = '23514',
      constraint = 'schedule_occupancy_cancelled_must_be_released',
      message = 'Cancelled Appointment cannot keep active occupancy';
  end if;
end;
$$;

create function app_private.assert_blocked_period_occupancy(
  p_business_id uuid,
  p_blocked_period_id uuid
) returns void
language plpgsql
set search_path = pg_catalog, app_private
as $$
declare
  v_active boolean;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_active_count integer;
  v_exact_count integer;
begin
  select active, start_at, end_at
    into v_active, v_start_at, v_end_at
  from app_private.blocked_period
  where business_id = p_business_id and id = p_blocked_period_id;

  if not found then
    return;
  end if;

  select
    count(*) filter (where released_at is null),
    count(*) filter (
      where released_at is null
        and occupied_period = tstzrange(v_start_at, v_end_at, '[)')
    )
    into v_active_count, v_exact_count
  from app_private.schedule_occupancy
  where business_id = p_business_id
    and blocked_period_id = p_blocked_period_id;

  if v_active then
    if v_active_count <> 1 or v_exact_count <> 1 then
      raise exception using
        errcode = '23514',
        constraint = 'schedule_occupancy_owner_required',
        message = 'Active BlockedPeriod requires exactly one matching active occupancy';
    end if;
  elsif v_active_count <> 0 then
    raise exception using
      errcode = '23514',
      constraint = 'schedule_occupancy_inactive_block_must_be_released',
      message = 'Inactive BlockedPeriod cannot keep active occupancy';
  end if;
end;
$$;

create function app_private.check_appointment_occupancy_trigger()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app_private.assert_appointment_occupancy(old.business_id, old.id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform app_private.assert_appointment_occupancy(new.business_id, new.id);
  end if;
  return null;
end;
$$;

create function app_private.check_blocked_period_occupancy_trigger()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app_private.assert_blocked_period_occupancy(old.business_id, old.id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform app_private.assert_blocked_period_occupancy(new.business_id, new.id);
  end if;
  return null;
end;
$$;

create function app_private.check_occupancy_owner_trigger()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if old.appointment_id is not null then
      perform app_private.assert_appointment_occupancy(
        old.business_id,
        old.appointment_id
      );
    end if;
    if old.blocked_period_id is not null then
      perform app_private.assert_blocked_period_occupancy(
        old.business_id,
        old.blocked_period_id
      );
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if new.appointment_id is not null then
      perform app_private.assert_appointment_occupancy(
        new.business_id,
        new.appointment_id
      );
    end if;
    if new.blocked_period_id is not null then
      perform app_private.assert_blocked_period_occupancy(
        new.business_id,
        new.blocked_period_id
      );
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger appointment_occupancy_guard
after insert or update or delete on app_private.appointment
deferrable initially deferred
for each row execute function app_private.check_appointment_occupancy_trigger();

create constraint trigger blocked_period_occupancy_guard
after insert or update or delete on app_private.blocked_period
deferrable initially deferred
for each row execute function app_private.check_blocked_period_occupancy_trigger();

create constraint trigger schedule_occupancy_owner_guard
after insert or update or delete on app_private.schedule_occupancy
deferrable initially deferred
for each row execute function app_private.check_occupancy_owner_trigger();

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'spk001_runtime') then
    create role spk001_runtime nologin;
  end if;
end;
$$;

grant usage on schema app_private to spk001_runtime;
grant select on app_private.business to spk001_runtime;
grant select, insert, update on app_private.appointment to spk001_runtime;
grant select, insert, update on app_private.blocked_period to spk001_runtime;
grant select, insert, update on app_private.schedule_occupancy to spk001_runtime;
revoke delete on app_private.schedule_occupancy from public, spk001_runtime;

comment on schema app_private is
  'Disposable private schema created only for SPK-001.';

