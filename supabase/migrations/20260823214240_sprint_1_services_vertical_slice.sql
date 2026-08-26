-- Sprint 1: Business scope and the Service catalog vertical slice.
-- Application data remains in the private schema; this migration does not
-- modify Supabase-managed auth, storage, or other platform schemas.

create table app_private.business (
  id uuid primary key default gen_random_uuid(),
  public_name text,
  public_description text,
  public_contact text,
  public_location text,
  timezone text,
  currency_code char(3) not null,
  admin_auth_user_id uuid not null,
  public_booking_enabled boolean not null default false,
  availability_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_public_name_not_blank
    check (public_name is null or btrim(public_name) <> ''),
  constraint business_timezone_not_blank
    check (timezone is null or btrim(timezone) <> ''),
  constraint business_currency_code_iso_shape
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint business_availability_version_positive
    check (availability_version > 0),
  constraint business_admin_auth_user_id_unique
    unique (admin_auth_user_id),
  constraint business_scope_currency_unique
    unique (id, currency_code)
);

create table app_private.service (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  name text not null,
  description text,
  price_minor integer not null,
  currency_code char(3) not null,
  duration_minutes integer not null,
  active boolean not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_name_not_blank
    check (btrim(name) <> ''),
  constraint service_price_minor_nonnegative
    check (price_minor >= 0),
  constraint service_duration_minutes_positive
    check (duration_minutes > 0),
  constraint service_version_positive
    check (version > 0),
  constraint service_business_fk
    foreign key (business_id)
    references app_private.business (id)
    on delete restrict,
  constraint service_business_currency_fk
    foreign key (business_id, currency_code)
    references app_private.business (id, currency_code)
    on update restrict
    on delete restrict,
  constraint service_business_scope_unique
    unique (business_id, id)
);

create index service_business_active_name_idx
  on app_private.service (business_id, active, name);

revoke all on app_private.business from public;
revoke all on app_private.service from public;

grant select on app_private.business to barber_runtime;
grant select on app_private.service to barber_runtime;
grant insert (
  id,
  business_id,
  name,
  description,
  price_minor,
  currency_code,
  duration_minutes,
  active,
  version,
  created_at,
  updated_at
) on app_private.service to barber_runtime;
grant update (
  name,
  description,
  price_minor,
  duration_minutes,
  active,
  version,
  updated_at
) on app_private.service to barber_runtime;

do $$
declare
  target_role text;
begin
  foreach target_role in array array['anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = target_role) then
      execute format(
        'revoke all on app_private.business from %I',
        target_role
      );
      execute format(
        'revoke all on app_private.service from %I',
        target_role
      );
    end if;
  end loop;
end
$$;
