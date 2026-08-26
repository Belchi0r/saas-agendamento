-- Hosted-only SPK-006 positive control. It intentionally does not alter the
-- app_private schema or any object created by an earlier spike.

create table public.spk006_public_probe (
  id integer primary key,
  label text not null
);

insert into public.spk006_public_probe (id, label)
values (1, 'data-api-positive-control');

alter table public.spk006_public_probe enable row level security;

create policy spk006_public_probe_read
  on public.spk006_public_probe
  for select
  to anon, authenticated
  using (true);

revoke all on public.spk006_public_probe
  from public, service_role;
grant usage on schema public to anon, authenticated;
grant select on public.spk006_public_probe to anon, authenticated;

notify pgrst, 'reload schema';
