-- Sprint 5: least-privilege access for the authenticated operational agenda.
-- No Supabase-managed schema is touched.

grant select on app_private.customer to barber_runtime;
grant update (status, version, cancelled_at, cancellation_actor, updated_at)
  on app_private.appointment to barber_runtime;
grant select on app_private.appointment_event to barber_runtime;
grant select on app_private.schedule_occupancy to barber_runtime;
grant update (released_at) on app_private.schedule_occupancy to barber_runtime;

do $$
declare target_role text;
begin
  foreach target_role in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = target_role) then
      execute format('revoke all on app_private.customer from %I', target_role);
      execute format('revoke all on app_private.appointment_event from %I', target_role);
    end if;
  end loop;
end $$;
