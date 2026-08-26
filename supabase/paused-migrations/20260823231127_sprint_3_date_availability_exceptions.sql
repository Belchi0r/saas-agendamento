-- Sprint 3 (partial): local calendar exceptions and exceptional working windows.
-- Active BlockedPeriod is intentionally absent: the canonical model requires
-- ScheduleOccupancy in the same transaction, which this sprint explicitly excludes.
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

revoke all on app_private.date_availability_exception from public;
revoke all on app_private.exception_working_window from public;

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
    end if;
  end loop;
end
$$;
