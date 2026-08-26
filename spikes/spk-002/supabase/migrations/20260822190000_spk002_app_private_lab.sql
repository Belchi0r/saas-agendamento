-- SPK-002 disposable laboratory migration.
--
-- Source of the ordinary table DDL:
--   drizzle-candidate/0000_clear_magus.sql
--
-- Manual review additions required because they are PostgreSQL-specific:
--   1. btree_gist in the conventional private extensions schema;
--   2. the partial GiST exclusion constraint for active occupancies.
--
-- This migration intentionally contains no statement targeting auth or storage.

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create schema app_private;

create table app_private.business (
  id uuid primary key not null,
  name text not null,
  created_at timestamp with time zone default now() not null
);

create table app_private.schedule_occupancy (
  id uuid primary key not null,
  business_id uuid not null,
  occupied_period tstzrange not null,
  released_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint schedule_occupancy_period_is_half_open check (
    not isempty(occupied_period)
    and lower_inc(occupied_period)
    and not upper_inc(occupied_period)
    and lower(occupied_period) < upper(occupied_period)
  )
);

create table app_private.transaction_probe (
  id uuid primary key not null,
  note text not null,
  created_at timestamp with time zone default now() not null
);

alter table app_private.schedule_occupancy
  add constraint schedule_occupancy_business_id_business_id_fk
  foreign key (business_id)
  references app_private.business (id)
  on delete restrict
  on update no action;

create index business_name_idx
  on app_private.business using btree (name);

create index schedule_occupancy_business_idx
  on app_private.schedule_occupancy using btree (business_id);

alter table app_private.schedule_occupancy
  add constraint schedule_occupancy_no_overlap
  exclude using gist (
    business_id extensions.gist_uuid_ops with =,
    occupied_period with &&
  )
  where (released_at is null);

comment on schema app_private is
  'Disposable private application schema created only for SPK-002.';
