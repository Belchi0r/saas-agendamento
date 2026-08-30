import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listOperationalDay, transitionOperationalAppointment } from "@/application/agenda/operational-agenda-use-cases";
import { confirmAdminBooking, confirmPublicBooking } from "@/application/booking/public-booking-use-cases";
import type { PublicBookingCommand } from "@/domain/booking/public-booking";
import { businessScopeFromServer } from "@/domain/business/business-scope";
import type { BookingSecrets } from "@/infrastructure/security/booking-secrets";
import { PostgresOperationalAgendaRepository } from "@/persistence/agenda/postgres-operational-agenda-repository";
import { PostgresPublicBookingRepository } from "@/persistence/booking/postgres-public-booking-repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = databaseUrl ? describe : describe.skip;
const BUSINESS = "51000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS = "51000000-0000-4000-8000-000000000002";
const ADMIN = "52000000-0000-4000-8000-000000000001";
const SERVICE = "53000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-27T12:00:00Z");
const RUNTIME_LOGIN = "barber_runtime_sprint5_login";
const RUNTIME_PASSWORD = "sprint5-runtime-password";
const idempotencyPepper = randomBytes(32);
const secrets: BookingSecrets = {
  tokenPepper: randomBytes(32), idempotencyPepper,
  envelopeKeys: new Map([["env-v1", randomBytes(32)]]), activeEnvelopeKeyVersion: "env-v1",
  capabilitySigningKey: randomBytes(32),
};

databaseSuite("Sprint 5 operational agenda on real PostgreSQL", () => {
  const owner = new Pool({ connectionString: databaseUrl ?? "postgresql://invalid.invalid/postgres", max: 12 });
  const runtimeUrl = new URL(databaseUrl ?? "postgresql://invalid.invalid/postgres");
  runtimeUrl.username = RUNTIME_LOGIN; runtimeUrl.password = RUNTIME_PASSWORD;
  const runtime = new Pool({ connectionString: runtimeUrl.toString(), max: 12 });
  const scope = businessScopeFromServer(BUSINESS, "admin-auth-user");
  const booking = new PostgresPublicBookingRepository(runtime, scope);
  const agenda = new PostgresOperationalAgendaRepository(runtime, scope);

  beforeAll(async () => {
    await owner.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${RUNTIME_LOGIN}') then create role ${RUNTIME_LOGIN} login inherit password '${RUNTIME_PASSWORD}'; end if; end $$; alter role ${RUNTIME_LOGIN} login inherit password '${RUNTIME_PASSWORD}'; grant barber_runtime to ${RUNTIME_LOGIN};`);
    await runtime.query("select 1");
  });

  beforeEach(async () => {
    await owner.query(`begin;
      update app_private.appointment set status='CANCELLED',cancelled_at=clock_timestamp(),cancellation_actor='ADMIN' where status='CONFIRMED';
      update app_private.blocked_period set active=false where active;
      update app_private.schedule_occupancy set released_at=coalesce(released_at,clock_timestamp()); commit;`);
    for (const table of ["idempotency_request","appointment_access_token","appointment_event","schedule_occupancy","appointment","customer","blocked_period","exception_working_window","date_availability_exception","weekly_break","weekly_working_window","business_scheduling_policy","service","business"]) await owner.query(`delete from app_private.${table}`);
    await owner.query(`insert into app_private.business (id,public_name,timezone,currency_code,admin_auth_user_id,public_booking_enabled) values ($1,'Estúdio Operacional','America/Sao_Paulo','BRL',$2,true),($3,'Outro negócio','America/Sao_Paulo','BRL',$4,true)`, [BUSINESS,ADMIN,OTHER_BUSINESS,"52000000-0000-4000-8000-000000000002"]);
    await owner.query(`insert into app_private.business_scheduling_policy (business_id,minimum_lead_minutes,booking_horizon_days,slot_step_minutes,buffer_minutes,cancellation_enabled,cancellation_notice_minutes,configuration_confirmed_at) values ($1,0,30,15,null,false,null,$2)`, [BUSINESS,NOW]);
    await owner.query(`insert into app_private.service (id,business_id,name,description,price_minor,currency_code,duration_minutes,active) values ($1,$2,'Corte original','Snapshot preservado',5000,'BRL',45,true)`, [SERVICE,BUSINESS]);
    await owner.query(`insert into app_private.weekly_working_window (business_id,weekday,start_local_time,end_local_time) values ($1,1,'09:00','18:00')`, [BUSINESS]);
  });

  afterAll(async () => { await runtime.end(); await owner.end(); });

  it("lists a Business-local day in chronological order", async () => {
    await admin("10:00", "Segundo", "+5561999991002", "s5-order-second-0001");
    await admin("09:00", "Primeiro", "+5561999991001", "s5-order-first-00001");
    const result = await listOperationalDay(agenda, "2026-08-31", "America/Sao_Paulo");
    expect(result.map((item) => [item.localTimeSnapshot, item.customerName])).toEqual([["09:00","Primeiro"],["10:00","Segundo"]]);
  });

  it("creates and idempotently replays a manual ADMIN booking even when public booking is disabled", async () => {
    await owner.query("update app_private.business set public_booking_enabled=false where id=$1", [BUSINESS]);
    const first = await admin("09:00", "Manual", "+5561999991005", "s5-manual-replay-0001");
    const replay = await admin("09:00", "Manual", "+5561999991005", "s5-manual-replay-0001");
    expect(first.disposition).toBe("CREATED");
    expect(replay).toMatchObject({ disposition:"REPLAYED", appointment:{ appointmentId:first.appointment.appointmentId } });
    const counts = await owner.query(`select
      (select count(*)::int from app_private.appointment where origin='ADMIN') appointments,
      (select count(*)::int from app_private.customer) customers,
      (select count(*)::int from app_private.schedule_occupancy where released_at is null) occupancies,
      (select count(*)::int from app_private.idempotency_request where operation='admin-booking/v1') receipts`);
    expect(counts.rows[0]).toEqual({ appointments:1,customers:1,occupancies:1,receipts:1 });
  });

  it("completes and marks no-show while preserving occupancy", async () => {
    const completed = await admin("09:00", "Concluído", "+5561999991010", "s5-complete-0000001");
    const noShow = await admin("10:00", "Ausente", "+5561999991011", "s5-noshow-00000001");
    await transitionOperationalAppointment(agenda, { appointmentId: completed.appointment.appointmentId, expectedVersion: 1, action: "complete" }, NOW);
    await transitionOperationalAppointment(agenda, { appointmentId: noShow.appointment.appointmentId, expectedVersion: 1, action: "no-show" }, NOW);
    const rows = await owner.query(`select a.status,a.version,o.released_at,e.event_type,e.actor_type from app_private.appointment a join app_private.schedule_occupancy o on o.appointment_id=a.id join app_private.appointment_event e on e.appointment_id=a.id and e.appointment_version=2 order by a.scheduled_start_at`);
    expect(rows.rows).toEqual([
      expect.objectContaining({ status:"COMPLETED",version:2,released_at:null,event_type:"COMPLETED",actor_type:"ADMIN" }),
      expect.objectContaining({ status:"NO_SHOW",version:2,released_at:null,event_type:"NO_SHOW",actor_type:"ADMIN" }),
    ]);
  });

  it("cancels as ADMIN and releases occupancy without deleting history", async () => {
    const created = await admin("09:00", "Cancelado", "+5561999991020", "s5-cancel-00000001");
    const transitioned = await transitionOperationalAppointment(agenda, { appointmentId: created.appointment.appointmentId, expectedVersion: 1, action: "cancel" }, NOW);
    expect(transitioned).toMatchObject({ status:"CANCELLED",version:2,cancellationActor:"ADMIN" });
    const state = await owner.query(`select a.cancelled_at,o.released_at,(select count(*)::int from app_private.appointment_event e where e.appointment_id=a.id) events from app_private.appointment a join app_private.schedule_occupancy o on o.appointment_id=a.id where a.id=$1`, [created.appointment.appointmentId]);
    expect(state.rows[0]).toMatchObject({ cancelled_at: NOW, released_at: NOW, events:2 });
  });

  it("rejects invalid or stale transitions", async () => {
    const created = await admin("09:00", "Imutável", "+5561999991030", "s5-invalid-0000001");
    await transitionOperationalAppointment(agenda, { appointmentId: created.appointment.appointmentId, expectedVersion: 1, action: "complete" }, NOW);
    await expect(transitionOperationalAppointment(agenda, { appointmentId: created.appointment.appointmentId, expectedVersion: 1, action: "cancel" }, NOW)).rejects.toMatchObject({ code:"APPOINTMENT_TRANSITION_CONFLICT",status:409 });
  });

  it("lets exactly one admin booking win against another admin", async () => {
    const settled = await Promise.allSettled([
      admin("11:00", "Admin A", "+5561999991040", "s5-admin-race-a-001"),
      admin("11:00", "Admin B", "+5561999991041", "s5-admin-race-b-001"),
    ]);
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((item) => item.status === "rejected")[0]).toMatchObject({ reason: { code:"BOOKING_SLOT_UNAVAILABLE",status:409 } });
  });

  it("lets exactly one booking win between admin and public", async () => {
    const settled = await Promise.allSettled([
      admin("12:00", "Admin", "+5561999991050", "s5-cross-race-admin1"),
      confirmPublicBooking(booking, command("12:00", "Público", "+5561999991051"), "s5-cross-race-public", secrets, "http://localhost:3000", NOW),
    ]);
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect((await owner.query(`select count(*)::int count from app_private.appointment`)).rows[0]?.count).toBe(1);
  });

  it("serializes admin booking behind BlockedPeriod and lets the committed block win", async () => {
    const holder = await owner.connect();
    try {
      await holder.query("begin");
      await holder.query("select id from app_private.business where id=$1 for update", [BUSINESS]);
      const pending = admin("14:00", "Bloqueado", "+5561999991055", "s5-admin-block-race1");
      await observeBookingLock(owner);
      const blockId = "54000000-0000-4000-8000-000000000001";
      await holder.query(`insert into app_private.blocked_period (id,business_id,start_at,end_at,timezone_snapshot) values ($1,$2,'2026-08-31T17:00:00Z','2026-08-31T18:00:00Z','America/Sao_Paulo')`, [blockId,BUSINESS]);
      await holder.query(`insert into app_private.schedule_occupancy (business_id,blocked_period_id,occupied_period) values ($1,$2,tstzrange('2026-08-31T17:00:00Z','2026-08-31T18:00:00Z','[)'))`, [BUSINESS,blockId]);
      await holder.query("commit");
      await expect(pending).rejects.toMatchObject({ code:"BOOKING_SLOT_UNAVAILABLE",status:409 });
      expect((await owner.query(`select count(*)::int count from app_private.appointment`)).rows[0]?.count).toBe(0);
    } finally { await holder.query("rollback").catch(() => undefined); holder.release(); }
  });

  it("keeps repeated WhatsApp customers separate and historical snapshots unchanged", async () => {
    const first = await admin("09:00", "Pessoa Um", "+5561999991060", "s5-repeat-first-0001");
    await admin("10:00", "Pessoa Dois", "+5561999991060", "s5-repeat-second-001");
    await owner.query(`update app_private.service set name='Nome novo',price_minor=9000,duration_minutes=60,version=2 where id=$1`, [SERVICE]);
    const customers = await agenda.listCustomers("99991060");
    expect(customers).toHaveLength(2);
    const historical = await agenda.findAppointment(first.appointment.appointmentId);
    expect(historical).toMatchObject({ serviceName:"Corte original",priceMinor:5000,durationMinutes:45 });
  });

  it("enforces BusinessScope on agenda, details and customers", async () => {
    const created = await admin("09:00", "Escopado", "+5561999991070", "s5-scope-000000001");
    const other = new PostgresOperationalAgendaRepository(runtime, businessScopeFromServer(OTHER_BUSINESS, "admin-auth-user"));
    expect(await other.findAppointment(created.appointment.appointmentId)).toBeNull();
    expect(await other.listCustomers("Escopado")).toEqual([]);
    expect(await other.listAppointments(new Date("2026-08-31T00:00:00Z"), new Date("2026-09-01T00:00:00Z"))).toEqual([]);
  });

  function admin(localTime: string, name: string, whatsapp: string, key: string) {
    return confirmAdminBooking(booking, command(localTime, name, whatsapp), key, idempotencyPepper, NOW);
  }
});

function command(localTime: string, customerName: string, whatsappE164: string): PublicBookingCommand {
  return { serviceId:SERVICE,localDate:"2026-08-31",localTime,customerName,whatsappE164,reviewedService:{version:1,name:"Corte original",durationMinutes:45,priceMinor:5000,currencyCode:"BRL"} };
}

async function observeBookingLock(pool: Pool): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const result = await pool.query(`select 1 from pg_stat_activity where wait_event_type='Lock' and query ilike '%for share of b%' limit 1`);
    if (result.rowCount === 1) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Admin booking did not reach the configuration lock");
}
