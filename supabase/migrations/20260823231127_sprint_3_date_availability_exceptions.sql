-- Sprint 3: local calendar exceptions, blocked periods, and their occupancy.
-- ScheduleOccupancy is introduced only with the BlockedPeriod owner in this slice;
-- Appointment ownership belongs to its future feature migration.
-- No Supabase-managed auth, storage, or other platform schema is modified.

create table app_private.date_availability_exception (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  local_date date not null,
  mode text not null,
  private_note text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint date_availability_exception_business_fk
    foreign key (business_id)
    references app_private.business (id)
    on delete restrict,
  constraint date_availability_exception_business_scope_unique
    unique (business_id, id),
  constraint date_availability_exception_business_date_unique
    unique (business_id, local_date),
  constraint date_availability_exception_mode_valid
    check (mode in ('CLOSED', 'REPLACE')),
  constraint date_availability_exception_private_note_not_blank
    check (private_note is null or btrim(private_note) <> ''),
  constraint date_availability_exception_version_positive
    check (version > 0)
);

create table app_private.exception_working_window (
  id uuid primary key default gen_random_uuid(),
  date_exception_id uuid not null,
  start_local_time time(0) without time zone not null,
  end_local_time time(0) without time zone not null,
  constraint exception_working_window_exception_fk
    foreign key (date_exception_id)
    references app_private.date_availability_exception (id)
    on delete cascade,
  constraint exception_working_window_ordered
    check (start_local_time < end_local_time),
  constraint exception_working_window_no_overlap
    exclude using gist (
      date_exception_id extensions.gist_uuid_ops with =,
      (int4range(
        extract(epoch from start_local_time)::integer,
        extract(epoch from end_local_time)::integer,
        '[)'
      )) with &&
    )
);

create index date_availability_exception_business_date_idx
  on app_private.date_availability_exception (business_id, local_date, id);

create index exception_working_window_exception_start_idx
  on app_private.exception_working_window (
    date_exception_id,
    start_local_time,
    id
  );

create table app_private.blocked_period (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  local_date_from date,
  local_date_to date,
  timezone_snapshot text not null,
  private_reason text,
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blocked_period_business_fk
    foreign key (business_id)
    references app_private.business (id)
    on delete restrict,
  constraint blocked_period_business_scope_unique
    unique (business_id, id),
  constraint blocked_period_ordered
    check (start_at < end_at),
  constraint blocked_period_date_snapshots_paired
    check (
      (local_date_from is null and local_date_to is null)
      or (
        local_date_from is not null
        and local_date_to is not null
        and local_date_from <= local_date_to
      )
    ),
  constraint blocked_period_timezone_snapshot_not_blank
    check (btrim(timezone_snapshot) <> ''),
  constraint blocked_period_private_reason_not_blank
    check (private_reason is null or btrim(private_reason) <> ''),
  constraint blocked_period_version_positive
    check (version > 0)
);

create table app_private.schedule_occupancy (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  blocked_period_id uuid not null,
  occupied_period tstzrange not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  constraint schedule_occupancy_business_fk
    foreign key (business_id)
    references app_private.business (id)
    on delete restrict,
  constraint schedule_occupancy_blocked_period_fk
    foreign key (business_id, blocked_period_id)
    references app_private.blocked_period (business_id, id)
    on delete restrict,
  constraint schedule_occupancy_period_is_half_open
    check (
      not isempty(occupied_period)
      and lower_inc(occupied_period)
      and not upper_inc(occupied_period)
      and lower(occupied_period) < upper(occupied_period)
    )
);

create unique index schedule_occupancy_blocked_period_unique
  on app_private.schedule_occupancy (blocked_period_id);

create index blocked_period_business_start_end_idx
  on app_private.blocked_period (business_id, start_at, end_at)
  where active;

create index schedule_occupancy_business_released_idx
  on app_private.schedule_occupancy (business_id, released_at);

alter table app_private.schedule_occupancy
  add constraint schedule_occupancy_no_overlap
  exclude using gist (
    business_id extensions.gist_uuid_ops with =,
    occupied_period with &&
  )
  where (released_at is null);

create function app_private.assert_blocked_period_occupancy(
  p_business_id uuid,
  p_blocked_period_id uuid
) returns void
language plpgsql
set search_path = pg_catalog, app_private
as $$
declare
  target_active boolean;
  target_start_at timestamptz;
  target_end_at timestamptz;
  active_count integer;
  exact_count integer;
begin
  select active, start_at, end_at
    into target_active, target_start_at, target_end_at
  from app_private.blocked_period
  where business_id = p_business_id and id = p_blocked_period_id;

  if not found then
    return;
  end if;

  select
    count(*) filter (where released_at is null),
    count(*) filter (
      where released_at is null
        and occupied_period = tstzrange(target_start_at, target_end_at, '[)')
    )
    into active_count, exact_count
  from app_private.schedule_occupancy
  where business_id = p_business_id
    and blocked_period_id = p_blocked_period_id;

  if target_active then
    if active_count <> 1 or exact_count <> 1 then
      raise exception using
        errcode = '23514',
        constraint = 'schedule_occupancy_owner_required',
        message = 'Active BlockedPeriod requires one matching occupancy';
    end if;
  elsif active_count <> 0 then
    raise exception using
      errcode = '23514',
      constraint = 'schedule_occupancy_inactive_block_must_be_released',
      message = 'Inactive BlockedPeriod cannot keep active occupancy';
  end if;
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

create function app_private.check_occupancy_block_owner_trigger()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app_private.assert_blocked_period_occupancy(
      old.business_id,
      old.blocked_period_id
    );
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform app_private.assert_blocked_period_occupancy(
      new.business_id,
      new.blocked_period_id
    );
  end if;
  return null;
end;
$$;

create constraint trigger blocked_period_occupancy_guard
after insert or update or delete on app_private.blocked_period
deferrable initially deferred
for each row execute function app_private.check_blocked_period_occupancy_trigger();

create constraint trigger schedule_occupancy_owner_guard
after insert or update or delete on app_private.schedule_occupancy
deferrable initially deferred
for each row execute function app_private.check_occupancy_block_owner_trigger();

revoke all on app_private.date_availability_exception from public;
revoke all on app_private.exception_working_window from public;
revoke all on app_private.blocked_period from public;
revoke all on app_private.schedule_occupancy from public;
revoke all on function app_private.assert_blocked_period_occupancy(uuid, uuid) from public;
revoke all on function app_private.check_blocked_period_occupancy_trigger() from public;
revoke all on function app_private.check_occupancy_block_owner_trigger() from public;

grant select on app_private.date_availability_exception to barber_runtime;
grant insert (
  id,
  business_id,
  local_date,
  mode,
  private_note,
  version,
  created_at,
  updated_at
) on app_private.date_availability_exception to barber_runtime;
grant update (
  local_date,
  mode,
  private_note,
  version,
  updated_at
) on app_private.date_availability_exception to barber_runtime;
grant delete on app_private.date_availability_exception to barber_runtime;

grant select on app_private.exception_working_window to barber_runtime;
grant insert (
  id,
  date_exception_id,
  start_local_time,
  end_local_time
) on app_private.exception_working_window to barber_runtime;
grant delete on app_private.exception_working_window to barber_runtime;

grant select on app_private.blocked_period to barber_runtime;
grant insert (
  id,
  business_id,
  start_at,
  end_at,
  local_date_from,
  local_date_to,
  timezone_snapshot,
  private_reason,
  active,
  version,
  created_at,
  updated_at
) on app_private.blocked_period to barber_runtime;
grant update (
  start_at,
  end_at,
  timezone_snapshot,
  private_reason,
  active,
  version,
  updated_at
) on app_private.blocked_period to barber_runtime;

grant select on app_private.schedule_occupancy to barber_runtime;
grant insert (
  id,
  business_id,
  blocked_period_id,
  occupied_period,
  released_at,
  created_at
) on app_private.schedule_occupancy to barber_runtime;
grant update (
  occupied_period,
  released_at
) on app_private.schedule_occupancy to barber_runtime;
revoke delete on app_private.schedule_occupancy from barber_runtime;

grant execute on function app_private.assert_blocked_period_occupancy(uuid, uuid)
  to barber_runtime;
grant execute on function app_private.check_blocked_period_occupancy_trigger()
  to barber_runtime;
grant execute on function app_private.check_occupancy_block_owner_trigger()
  to barber_runtime;

do $$
declare
  target_role text;
begin
  foreach target_role in array array['anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = target_role) then
      execute format(
        'revoke all on app_private.date_availability_exception from %I',
        target_role
      );
      execute format(
        'revoke all on app_private.exception_working_window from %I',
        target_role
      );
      execute format(
        'revoke all on app_private.blocked_period from %I',
        target_role
      );
      execute format(
        'revoke all on app_private.schedule_occupancy from %I',
        target_role
      );
    end if;
  end loop;
end
$$;
