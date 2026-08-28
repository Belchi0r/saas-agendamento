-- Sprint 4: public booking in the private application schema only.
-- The approved cadence is explicit per Business and has no database default.

create table app_private.business_scheduling_policy (
  business_id uuid primary key references app_private.business(id) on delete restrict,
  minimum_lead_minutes integer not null check (minimum_lead_minutes >= 0),
  booking_horizon_days integer not null check (booking_horizon_days > 0),
  slot_step_minutes integer not null,
  buffer_minutes integer check (buffer_minutes is null or buffer_minutes >= 0),
  cancellation_enabled boolean not null,
  cancellation_notice_minutes integer,
  configuration_confirmed_at timestamptz not null,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  constraint business_scheduling_policy_slot_step_approved check (slot_step_minutes = 15),
  constraint business_scheduling_policy_cancellation_notice_valid check (
    (cancellation_enabled and cancellation_notice_minutes is not null and cancellation_notice_minutes >= 0)
    or (not cancellation_enabled and cancellation_notice_minutes is null)
  )
);

create table app_private.customer (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references app_private.business(id) on delete restrict,
  display_name text not null check (btrim(display_name) <> ''),
  whatsapp_e164 text not null check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_business_scope_unique unique (business_id, id)
);
create index customer_business_whatsapp_idx on app_private.customer (business_id, whatsapp_e164);

create table app_private.appointment (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references app_private.business(id) on delete restrict,
  service_id uuid not null,
  customer_id uuid not null,
  status text not null check (status in ('CONFIRMED','COMPLETED','CANCELLED','NO_SHOW')),
  origin text not null check (origin in ('PUBLIC','ADMIN')),
  version integer not null default 1 check (version > 0),
  service_name_snapshot text not null check (btrim(service_name_snapshot) <> ''),
  service_description_snapshot text,
  service_duration_minutes_snapshot integer not null check (service_duration_minutes_snapshot > 0),
  service_price_minor_snapshot integer not null check (service_price_minor_snapshot >= 0),
  currency_code_snapshot char(3) not null check (currency_code_snapshot ~ '^[A-Z]{3}$'),
  customer_name_snapshot text not null check (btrim(customer_name_snapshot) <> ''),
  customer_whatsapp_snapshot text not null check (customer_whatsapp_snapshot ~ '^\+[1-9][0-9]{7,14}$'),
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  occupied_start_at timestamptz not null,
  occupied_end_at timestamptz not null,
  timezone_snapshot text not null check (btrim(timezone_snapshot) <> ''),
  local_date_snapshot date not null,
  local_time_snapshot time(0) without time zone not null,
  utc_offset_minutes_snapshot integer not null check (utc_offset_minutes_snapshot between -1080 and 1080),
  cancelled_at timestamptz,
  cancellation_actor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_business_scope_unique unique (business_id, id),
  constraint appointment_service_fk foreign key (business_id, service_id)
    references app_private.service(business_id, id) on delete restrict,
  constraint appointment_customer_fk foreign key (business_id, customer_id)
    references app_private.customer(business_id, id) on delete restrict,
  constraint appointment_scheduled_period_ordered check (scheduled_start_at < scheduled_end_at),
  constraint appointment_occupied_contains_service check (
    occupied_start_at <= scheduled_start_at and occupied_end_at >= scheduled_end_at
    and occupied_start_at < occupied_end_at
  ),
  constraint appointment_cancellation_shape check (
    (status = 'CANCELLED' and cancelled_at is not null and cancellation_actor in ('CUSTOMER','ADMIN'))
    or (status <> 'CANCELLED' and cancelled_at is null and cancellation_actor is null)
  )
);
create index appointment_business_start_idx on app_private.appointment (business_id, scheduled_start_at);
create index appointment_business_customer_start_idx on app_private.appointment (business_id, customer_id, scheduled_start_at desc);

create table app_private.appointment_event (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references app_private.appointment(id) on delete restrict,
  appointment_version integer not null check (appointment_version > 0),
  event_type text not null check (event_type in ('CREATED','RESCHEDULED','CANCELLED','COMPLETED','NO_SHOW')),
  actor_type text not null check (actor_type in ('CUSTOMER_TOKEN','ADMIN','SYSTEM')),
  occurred_at timestamptz not null default now(),
  from_status text,
  to_status text,
  from_start_at timestamptz,
  to_start_at timestamptz,
  from_end_at timestamptz,
  to_end_at timestamptz,
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  constraint appointment_event_appointment_version_unique unique (appointment_id, appointment_version)
);
create index appointment_event_appointment_occurred_idx on app_private.appointment_event (appointment_id, occurred_at, id);

create table app_private.appointment_access_token (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references app_private.appointment(id) on delete restrict,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  token_version integer not null check (token_version > 0),
  issued_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  rotation_reason text check (rotation_reason is null or btrim(rotation_reason) <> ''),
  constraint appointment_access_token_expiry_ordered check (expires_at is null or expires_at > issued_at)
);
create unique index appointment_access_token_one_active_unique
  on app_private.appointment_access_token (appointment_id) where revoked_at is null;
create index appointment_access_token_appointment_issued_idx
  on app_private.appointment_access_token (appointment_id, issued_at desc);

create table app_private.idempotency_request (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references app_private.business(id) on delete restrict,
  operation text not null check (btrim(operation) <> ''),
  key_hash bytea not null check (octet_length(key_hash) = 32),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  fingerprint_version text not null check (btrim(fingerprint_version) <> ''),
  status text not null check (status = 'SUCCEEDED'),
  appointment_id uuid,
  response_status integer not null check (response_status between 200 and 599),
  response_envelope bytea,
  envelope_nonce bytea,
  envelope_auth_tag bytea,
  envelope_key_version text,
  envelope_expires_at timestamptz,
  created_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > created_at),
  constraint idempotency_request_appointment_fk foreign key (business_id, appointment_id)
    references app_private.appointment(business_id, id) on delete restrict,
  constraint idempotency_request_business_operation_key_unique unique (business_id, operation, key_hash),
  constraint idempotency_request_envelope_shape check (
    (response_envelope is null and envelope_nonce is null and envelope_auth_tag is null
      and envelope_key_version is null and envelope_expires_at is null)
    or (response_envelope is not null and octet_length(envelope_nonce) = 12
      and octet_length(envelope_auth_tag) = 16 and btrim(envelope_key_version) <> ''
      and envelope_expires_at is not null and envelope_expires_at > created_at
      and envelope_expires_at <= expires_at)
  )
);
create index idempotency_request_expiry_idx on app_private.idempotency_request (expires_at);
create index idempotency_request_envelope_expiry_idx on app_private.idempotency_request (envelope_expires_at)
  where response_envelope is not null;

alter table app_private.schedule_occupancy
  alter column blocked_period_id drop not null,
  add column appointment_id uuid,
  add constraint schedule_occupancy_appointment_fk foreign key (business_id, appointment_id)
    references app_private.appointment(business_id, id) on delete restrict,
  add constraint schedule_occupancy_exactly_one_owner
    check (num_nonnulls(appointment_id, blocked_period_id) = 1);
create unique index schedule_occupancy_appointment_unique
  on app_private.schedule_occupancy (appointment_id) where appointment_id is not null;

create function app_private.assert_appointment_occupancy(p_business_id uuid, p_appointment_id uuid)
returns void language plpgsql set search_path = pg_catalog, app_private as $$
declare
  target_status text; target_start_at timestamptz; target_end_at timestamptz;
  active_count integer; exact_count integer;
begin
  select status, occupied_start_at, occupied_end_at into target_status, target_start_at, target_end_at
    from app_private.appointment where business_id = p_business_id and id = p_appointment_id;
  if not found then return; end if;
  select count(*) filter (where released_at is null),
         count(*) filter (where released_at is null and occupied_period = tstzrange(target_start_at,target_end_at,'[)'))
    into active_count, exact_count from app_private.schedule_occupancy
    where business_id = p_business_id and appointment_id = p_appointment_id;
  if target_status = 'CONFIRMED' and (active_count <> 1 or exact_count <> 1) then
    raise exception using errcode='23514', constraint='schedule_occupancy_appointment_owner_required', message='Confirmed Appointment requires one matching occupancy';
  elsif target_status = 'CANCELLED' and active_count <> 0 then
    raise exception using errcode='23514', constraint='schedule_occupancy_cancelled_appointment_must_be_released', message='Cancelled Appointment cannot keep active occupancy';
  end if;
end $$;

create function app_private.check_appointment_occupancy_trigger()
returns trigger language plpgsql set search_path = pg_catalog, app_private as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform app_private.assert_appointment_occupancy(old.business_id,old.id); end if;
  if tg_op in ('INSERT','UPDATE') then perform app_private.assert_appointment_occupancy(new.business_id,new.id); end if;
  return null;
end $$;

create or replace function app_private.check_occupancy_block_owner_trigger()
returns trigger language plpgsql set search_path = pg_catalog, app_private as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    if old.blocked_period_id is not null then perform app_private.assert_blocked_period_occupancy(old.business_id,old.blocked_period_id); end if;
    if old.appointment_id is not null then perform app_private.assert_appointment_occupancy(old.business_id,old.appointment_id); end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    if new.blocked_period_id is not null then perform app_private.assert_blocked_period_occupancy(new.business_id,new.blocked_period_id); end if;
    if new.appointment_id is not null then perform app_private.assert_appointment_occupancy(new.business_id,new.appointment_id); end if;
  end if;
  return null;
end $$;

create constraint trigger appointment_occupancy_guard
after insert or update or delete on app_private.appointment
deferrable initially deferred for each row
execute function app_private.check_appointment_occupancy_trigger();

revoke all on app_private.business_scheduling_policy, app_private.customer,
  app_private.appointment, app_private.appointment_event,
  app_private.appointment_access_token, app_private.idempotency_request from public;
revoke all on function app_private.assert_appointment_occupancy(uuid,uuid) from public;
revoke all on function app_private.check_appointment_occupancy_trigger() from public;

grant select on app_private.business_scheduling_policy to barber_runtime;
grant insert on app_private.customer to barber_runtime;
grant select, insert on app_private.appointment to barber_runtime;
grant insert on app_private.appointment_event to barber_runtime;
grant select, insert on app_private.appointment_access_token to barber_runtime;
grant update (last_used_at, revoked_at, rotation_reason) on app_private.appointment_access_token to barber_runtime;
grant select, insert on app_private.idempotency_request to barber_runtime;
grant insert (appointment_id) on app_private.schedule_occupancy to barber_runtime;
grant execute on function app_private.assert_appointment_occupancy(uuid,uuid) to barber_runtime;
grant execute on function app_private.check_appointment_occupancy_trigger() to barber_runtime;

do $$
declare target_role text;
begin
  foreach target_role in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname=target_role) then
      execute format('revoke all on app_private.business_scheduling_policy from %I',target_role);
      execute format('revoke all on app_private.customer from %I',target_role);
      execute format('revoke all on app_private.appointment from %I',target_role);
      execute format('revoke all on app_private.appointment_event from %I',target_role);
      execute format('revoke all on app_private.appointment_access_token from %I',target_role);
      execute format('revoke all on app_private.idempotency_request from %I',target_role);
    end if;
  end loop;
end $$;
