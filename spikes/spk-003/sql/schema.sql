create schema app_private;

create table app_private.business (
  id uuid primary key,
  name text not null
);

create table app_private.appointment (
  id uuid primary key,
  business_id uuid not null references app_private.business(id),
  status text not null check (status in ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')),
  version integer not null default 1 check (version > 0),
  effect_count integer not null default 1 check (effect_count > 0),
  created_at timestamptz not null
);

create unique index appointment_business_id_id_uq
  on app_private.appointment (business_id, id);

create table app_private.appointment_access_token (
  id uuid primary key,
  appointment_id uuid not null references app_private.appointment(id),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  token_version integer not null check (token_version > 0),
  issued_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  rotation_reason text
);

create unique index appointment_access_token_one_active_uq
  on app_private.appointment_access_token (appointment_id)
  where revoked_at is null;

create index appointment_access_token_appointment_idx
  on app_private.appointment_access_token (appointment_id, issued_at desc);

create table app_private.idempotency_request (
  id uuid primary key,
  business_id uuid not null references app_private.business(id),
  operation text not null,
  key_hash bytea not null check (octet_length(key_hash) = 32),
  request_fingerprint bytea not null check (octet_length(request_fingerprint) = 32),
  fingerprint_version text not null,
  status text not null check (status = 'SUCCEEDED'),
  appointment_id uuid,
  response_status integer not null,
  response_envelope bytea,
  envelope_nonce bytea,
  envelope_auth_tag bytea,
  envelope_key_version text,
  envelope_expires_at timestamptz,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  constraint idempotency_request_appointment_fk
    foreign key (business_id, appointment_id)
    references app_private.appointment (business_id, id),
  constraint idempotency_request_envelope_shape_ck check (
    (response_envelope is null
      and envelope_nonce is null
      and envelope_auth_tag is null
      and envelope_key_version is null
      and envelope_expires_at is null)
    or
    (response_envelope is not null
      and octet_length(envelope_nonce) = 12
      and octet_length(envelope_auth_tag) = 16
      and envelope_key_version is not null
      and envelope_expires_at is not null)
  ),
  unique (business_id, operation, key_hash)
);

create index idempotency_request_expiry_idx
  on app_private.idempotency_request (expires_at);

create index idempotency_request_envelope_expiry_idx
  on app_private.idempotency_request (envelope_expires_at)
  where response_envelope is not null;
