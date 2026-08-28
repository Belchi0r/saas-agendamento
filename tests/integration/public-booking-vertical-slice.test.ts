import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { confirmPublicBooking, exchangeManagementToken, getManagedAppointment, listPublicBookingAvailability, listPublicBookingDateOptions, revokeManagementToken, rotateManagementToken } from "@/application/booking/public-booking-use-cases";
import type { PublicBookingCommand } from "@/domain/booking/public-booking";
import { businessScopeFromServer } from "@/domain/business/business-scope";
import type { BookingSecrets } from "@/infrastructure/security/booking-secrets";
import { PostgresPublicBookingRepository } from "@/persistence/booking/postgres-public-booking-repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = databaseUrl ? describe : describe.skip;
const BUSINESS = "10000000-0000-4000-8000-000000000001";
const ADMIN = "20000000-0000-4000-8000-000000000001";
const SERVICE = "30000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-27T12:00:00Z");
const RUNTIME_LOGIN = "barber_runtime_integration_login";
const RUNTIME_PASSWORD = "integration-runtime-password";
const secrets: BookingSecrets = {
  tokenPepper: randomBytes(32), idempotencyPepper: randomBytes(32),
  envelopeKeys: new Map([["env-v1", randomBytes(32)]]),
  activeEnvelopeKeyVersion: "env-v1", capabilitySigningKey: randomBytes(32),
};

databaseSuite("Sprint 4 public booking on real PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl ?? "postgresql://invalid.invalid/postgres", max: 12 });
  const runtimeUrl = new URL(databaseUrl ?? "postgresql://invalid.invalid/postgres");
  runtimeUrl.username = RUNTIME_LOGIN;
  runtimeUrl.password = RUNTIME_PASSWORD;
  const runtimePool = new Pool({ connectionString: runtimeUrl.toString(), max: 12 });
  const repository = new PostgresPublicBookingRepository(runtimePool, businessScopeFromServer(BUSINESS, "public-singleton"));

  beforeAll(async () => {
    await pool.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = '${RUNTIME_LOGIN}') then
          create role ${RUNTIME_LOGIN} login inherit password '${RUNTIME_PASSWORD}';
        end if;
      end $$;
      alter role ${RUNTIME_LOGIN} login inherit password '${RUNTIME_PASSWORD}';
      grant barber_runtime to ${RUNTIME_LOGIN};
    `);
    await runtimePool.query("select 1");
  });
  beforeEach(async () => {
    await pool.query(`begin;
      update app_private.appointment set status='CANCELLED',cancelled_at=clock_timestamp(),cancellation_actor='ADMIN' where status='CONFIRMED';
      update app_private.blocked_period set active=false where active;
      update app_private.schedule_occupancy set released_at=coalesce(released_at,clock_timestamp());
      commit;`);
    for (const table of ["idempotency_request","appointment_access_token","appointment_event","schedule_occupancy","appointment","customer","blocked_period","exception_working_window","date_availability_exception","weekly_break","weekly_working_window","business_scheduling_policy","service","business"]) {
      await pool.query(`delete from app_private.${table}`);
    }
    await pool.query(`insert into app_private.business (id,public_name,timezone,currency_code,admin_auth_user_id,public_booking_enabled) values ($1,'Estúdio Horizonte','America/Sao_Paulo','BRL',$2,true)`, [BUSINESS, ADMIN]);
    await pool.query(`insert into app_private.business_scheduling_policy (business_id,minimum_lead_minutes,booking_horizon_days,slot_step_minutes,buffer_minutes,cancellation_enabled,cancellation_notice_minutes,configuration_confirmed_at) values ($1,0,30,15,null,false,null,$2)`, [BUSINESS, NOW]);
    await pool.query(`insert into app_private.service (id,business_id,name,description,price_minor,currency_code,duration_minutes,active) values ($1,$2,'Corte essencial','Atendimento individual',5000,'BRL',45,true)`, [SERVICE, BUSINESS]);
    await pool.query(`insert into app_private.weekly_working_window (business_id,weekday,start_local_time,end_local_time) values ($1,1,'09:00','18:00')`, [BUSINESS]);
    await pool.query(`insert into app_private.weekly_break (business_id,weekday,start_local_time,end_local_time) values ($1,1,'12:00','13:00')`, [BUSINESS]);
  });
  afterAll(async () => {
    await runtimePool.end();
    await pool.end();
  });

  it("enumerates persisted rules, creates snapshots, and replays exactly one effect", async () => {
    const dateOptions = await listPublicBookingDateOptions(repository, SERVICE, NOW);
    expect(dateOptions.dates.find((date) => date.localDate === "2026-08-27")).toMatchObject({
      status: "NOT_WORKING",
      reason: "NO_WORKING_WINDOW",
    });
    expect(dateOptions.dates.find((date) => date.localDate === "2026-08-31")).toMatchObject({
      status: "AVAILABLE",
      firstAvailableLocalTime: "09:00",
    });

    const availability = await listPublicBookingAvailability(repository, SERVICE, "2026-08-31", NOW);
    expect(availability.slots.slice(0, 4).map((slot) => slot.startLocalTime)).toEqual(["09:00","09:15","09:30","09:45"]);
    expect(availability.slots.some((slot) => slot.startLocalTime === "12:00")).toBe(false);

    const first = await confirmPublicBooking(repository, command("09:00", "Ana", "61994402561"), "idem-success-0000000001", secrets, "http://localhost:3000", NOW);
    const replay = await confirmPublicBooking(repository, command("09:00", "Ana", "+55 (61) 99440-2561"), "idem-success-0000000001", secrets, "http://localhost:3000", NOW);
    expect(first.disposition).toBe("CREATED");
    expect(replay.disposition).toBe("REPLAYED");
    expect(replay.managementLink).toBe(first.managementLink);
    expect(replay.appointment).toEqual(first.appointment);
    await expect(confirmPublicBooking(repository, command("09:45", "Ana", "+5561999990000"), "idem-success-0000000001", secrets, "http://localhost:3000", NOW)).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST", status: 409 });

    const counts = await pool.query(`select (select count(*)::int from app_private.appointment) appointments,(select count(*)::int from app_private.customer) customers,(select count(*)::int from app_private.schedule_occupancy where appointment_id is not null) occupancies,(select count(*)::int from app_private.appointment_event) events,(select count(*)::int from app_private.idempotency_request) receipts`);
    expect(counts.rows[0]).toEqual({ appointments:1, customers:1, occupancies:1, events:1, receipts:1 });
    await pool.query(`update app_private.service set name='Nome novo',duration_minutes=60,price_minor=7000,version=2 where id=$1`, [SERVICE]);
    const snapshot = await pool.query(`select service_name_snapshot,service_duration_minutes_snapshot,service_price_minor_snapshot,customer_whatsapp_snapshot,timezone_snapshot,local_date_snapshot::text,local_time_snapshot::text from app_private.appointment`);
    expect(snapshot.rows[0]).toMatchObject({ service_name_snapshot:"Corte essencial",service_duration_minutes_snapshot:45,service_price_minor_snapshot:5000,customer_whatsapp_snapshot:"+5561994402561",timezone_snapshot:"America/Sao_Paulo",local_date_snapshot:"2026-08-31" });

    const rawToken = new URL(first.managementLink).hash.replace("#token=", "");
    const persistence = JSON.stringify((await pool.query(`select encode(token_hash,'hex') token_hash,encode(response_envelope,'hex') response_envelope from app_private.appointment_access_token cross join app_private.idempotency_request`)).rows);
    expect(persistence).not.toContain(rawToken);
  });

  it("allows adjacent [) bookings and keeps WhatsApp non-unique", async () => {
    const a = await confirmPublicBooking(repository, command("09:00", "Pessoa A", "+5561999990000"), "idem-adjacent-a-0001", secrets, "http://localhost:3000", NOW);
    const b = await confirmPublicBooking(repository, command("09:45", "Pessoa B", "+5561999990000"), "idem-adjacent-b-0001", secrets, "http://localhost:3000", NOW);
    expect(a.appointment.scheduledEndAt).toBe(b.appointment.scheduledStartAt);
    expect((await pool.query(`select count(*)::int count from app_private.customer where whatsapp_e164='+5561999990000'`)).rows[0]?.count).toBe(2);
  });

  it("lets exactly one concurrent booking win and leaves no orphan", async () => {
    const settled = await Promise.allSettled([
      confirmPublicBooking(repository, command("10:00", "Concorrente A", "+5561999990001"), "idem-race-a-00000001", secrets, "http://localhost:3000", NOW),
      confirmPublicBooking(repository, command("10:00", "Concorrente B", "+5561999990002"), "idem-race-b-00000001", secrets, "http://localhost:3000", NOW),
    ]);
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((item) => item.status === "rejected")).toEqual([expect.objectContaining({ reason: expect.objectContaining({ code:"BOOKING_SLOT_UNAVAILABLE",status:409 }) })]);
    const orphans = await pool.query(`select count(*)::int count from app_private.appointment a left join app_private.schedule_occupancy o on o.appointment_id=a.id where o.id is null`);
    expect(orphans.rows[0]?.count).toBe(0);
  });

  it("serializes booking behind the configuration lock and lets BlockedPeriod win", async () => {
    const holder = await pool.connect();
    try {
      await holder.query("begin");
      await holder.query(`select id from app_private.business where id=$1 for update`, [BUSINESS]);
      const booking = confirmPublicBooking(repository, command("11:00", "Bloqueado", "+5561999990003"), "idem-block-race-00001", secrets, "http://localhost:3000", NOW);
      await observeBookingLock(pool);
      const blockId = "40000000-0000-4000-8000-000000000001";
      await holder.query(`insert into app_private.blocked_period (id,business_id,start_at,end_at,timezone_snapshot) values ($1,$2,'2026-08-31T14:00:00Z','2026-08-31T15:00:00Z','America/Sao_Paulo')`, [blockId,BUSINESS]);
      await holder.query(`insert into app_private.schedule_occupancy (business_id,blocked_period_id,occupied_period) values ($1,$2,tstzrange('2026-08-31T14:00:00Z','2026-08-31T15:00:00Z','[)'))`, [BUSINESS,blockId]);
      await holder.query("commit");
      await expect(booking).rejects.toMatchObject({ code:"BOOKING_SLOT_UNAVAILABLE",status:409 });
      expect((await pool.query(`select count(*)::int count from app_private.blocked_period where active`)).rows[0]?.count).toBe(1);
      expect((await pool.query(`select count(*)::int count from app_private.appointment`)).rows[0]?.count).toBe(0);
    } finally { await holder.query("rollback").catch(() => undefined); holder.release(); }
  });

  it("exchanges, rotates, and revokes a capability without persisting the raw secret", async () => {
    const booking = await confirmPublicBooking(repository, command("14:00", "Cliente", "+5561999990004"), "idem-token-000000001", secrets, "http://localhost:3000", NOW);
    const raw = new URL(booking.managementLink).hash.replace("#token=", "");
    const cookie = await exchangeManagementToken(repository, raw, secrets, NOW);
    await expect(getManagedAppointment(repository, cookie, secrets, NOW)).resolves.toMatchObject({ appointmentId: booking.appointment.appointmentId, customerName:"Cliente" });
    const rotated = await rotateManagementToken(repository, booking.appointment.appointmentId, secrets, "ADMIN_REISSUE", new Date(NOW.getTime()+1000));
    await expect(exchangeManagementToken(repository, raw, secrets, NOW)).rejects.toMatchObject({ code:"MANAGEMENT_LINK_INVALID" });
    await expect(exchangeManagementToken(repository, rotated, secrets, NOW)).resolves.toEqual(expect.any(String));
    await revokeManagementToken(repository, booking.appointment.appointmentId, "REVOKED", new Date(NOW.getTime()+2000));
    await expect(exchangeManagementToken(repository, rotated, secrets, NOW)).rejects.toMatchObject({ code:"MANAGEMENT_LINK_INVALID" });
    expect((await pool.query(`select count(*)::int count from app_private.appointment_access_token where revoked_at is null`)).rows[0]?.count).toBe(0);
  });
});

function command(localTime: string, customerName: string, whatsappE164: string): PublicBookingCommand {
  return { serviceId:SERVICE,localDate:"2026-08-31",localTime,customerName,whatsappE164,reviewedService:{version:1,name:"Corte essencial",durationMinutes:45,priceMinor:5000,currencyCode:"BRL"} };
}

async function observeBookingLock(pool: Pool): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const observed = await pool.query(`select 1 from pg_stat_activity where wait_event_type='Lock' and query ilike '%for share of b%' limit 1`);
    if (observed.rowCount === 1) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Booking did not reach the observed configuration lock");
}
