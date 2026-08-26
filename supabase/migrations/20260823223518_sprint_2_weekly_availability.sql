-- Sprint 2: recurring local weekly working windows and breaks.
-- These rules stay in local wall-clock time and inherit Business.timezone.
-- No Supabase-managed auth, storage, or other platform schema is modified.

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create table app_private.weekly_working_window (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  weekday smallint not null,
  start_local_time time(0) without time zone not null,
  end_local_time time(0) without time zone not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_working_window_business_fk
    foreign key (business_id)
    references app_private.business (id)
    on delete restrict,
  constraint weekly_working_window_business_scope_unique
    unique (business_id, id),
  constraint weekly_working_window_weekday_iso
    check (weekday between 1 and 7),
  constraint weekly_working_window_ordered
    check (start_local_time < end_local_time),
  constraint weekly_working_window_no_overlap
    exclude using gist (
      business_id extensions.gist_uuid_ops with =,
      weekday extensions.gist_int2_ops with =,
      (int4range(
        extract(epoch from start_local_time)::integer,
        extract(epoch from end_local_time)::integer,
        '[)'
      )) with &&
    )
);

create table app_private.weekly_break (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  weekday smallint not null,
  start_local_time time(0) without time zone not null,
  end_local_time time(0) without time zone not null,
  constraint weekly_break_business_fk
    foreign key (business_id)
    references app_private.business (id)
    on delete restrict,
  constraint weekly_break_business_scope_unique
    unique (business_id, id),
  constraint weekly_break_weekday_iso
    check (weekday between 1 and 7),
  constraint weekly_break_ordered
    check (start_local_time < end_local_time),
  constraint weekly_break_no_overlap
    exclude using gist (
      business_id extensions.gist_uuid_ops with =,
      weekday extensions.gist_int2_ops with =,
      (int4range(
        extract(epoch from start_local_time)::integer,
        extract(epoch from end_local_time)::integer,
        '[)'
      )) with &&
    )
);

create index weekly_working_window_business_weekday_start_idx
  on app_private.weekly_working_window (
    business_id,
    weekday,
    start_local_time
  );

create index weekly_break_business_weekday_start_idx
  on app_private.weekly_break (
    business_id,
    weekday,
    start_local_time
  );

revoke all on app_private.weekly_working_window from public;
revoke all on app_private.weekly_break from public;

grant select on app_private.weekly_working_window to barber_runtime;
grant insert (
  id,
  business_id,
  weekday,
  start_local_time,
  end_local_time,
  created_at,
  updated_at
) on app_private.weekly_working_window to barber_runtime;
grant update (
  weekday,
  start_local_time,
  end_local_time,
  updated_at
) on app_private.weekly_working_window to barber_runtime;
grant delete on app_private.weekly_working_window to barber_runtime;

grant select on app_private.weekly_break to barber_runtime;
grant insert (
  id,
  business_id,
  weekday,
  start_local_time,
  end_local_time
) on app_private.weekly_break to barber_runtime;
grant update (
  weekday,
  start_local_time,
  end_local_time
) on app_private.weekly_break to barber_runtime;
grant delete on app_private.weekly_break to barber_runtime;

grant update (
  availability_version,
  updated_at
) on app_private.business to barber_runtime;

do $$
declare
  target_role text;
begin
  foreach target_role in array array['anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = target_role) then
      execute format(
        'revoke all on app_private.weekly_working_window from %I',
        target_role
      );
      execute format(
        'revoke all on app_private.weekly_break from %I',
        target_role
      );
    end if;
  end loop;
end
$$;
