import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createBlockedPeriod,
  deactivateBlockedPeriod,
  updateBlockedPeriod,
} from "@/application/availability/blocked-period-use-cases";
import { calculateAvailabilityForCandidates } from "@/application/availability/calculate-availability";
import {
  createDateAvailabilityException,
  deleteDateAvailabilityException,
  updateDateAvailabilityException,
} from "@/application/availability/date-availability-use-cases";
import { businessScopeFromServer } from "@/domain/business/business-scope";
import { PostgresBlockedPeriodRepository } from "@/persistence/availability/postgres-blocked-period-repository";
import { PostgresDateAvailabilityRepository } from "@/persistence/availability/postgres-date-availability-repository";
import * as schema from "@/persistence/database/schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = databaseUrl ? describe : describe.skip;
const BUSINESS_A = "10000000-0000-4000-8000-000000000001";
const BUSINESS_B = "10000000-0000-4000-8000-000000000002";
const ADMIN_A = "20000000-0000-4000-8000-000000000001";
const ADMIN_B = "20000000-0000-4000-8000-000000000002";

databaseSuite("Sprint 3 exceptions and blocks on real PostgreSQL", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid.invalid/postgres",
    max: 4,
  });

  beforeAll(async () => void (await pool.query("select 1")));

  beforeEach(async () => {
    await pool.query(`
      begin;
      update app_private.appointment
         set status = 'CANCELLED',
             cancelled_at = coalesce(cancelled_at, clock_timestamp()),
             cancellation_actor = coalesce(cancellation_actor, 'ADMIN')
       where status = 'CONFIRMED';
      update app_private.blocked_period set active = false where active;
      update app_private.schedule_occupancy
         set released_at = coalesce(released_at, clock_timestamp());
      commit;
    `);
    await pool.query("delete from app_private.idempotency_request");
    await pool.query("delete from app_private.appointment_access_token");
    await pool.query("delete from app_private.appointment_event");
    await pool.query("delete from app_private.schedule_occupancy");
    await pool.query("delete from app_private.appointment");
    await pool.query("delete from app_private.customer");
    await pool.query("delete from app_private.blocked_period");
    await pool.query("delete from app_private.exception_working_window");
    await pool.query("delete from app_private.date_availability_exception");
    await pool.query("delete from app_private.weekly_break");
    await pool.query("delete from app_private.weekly_working_window");
    await pool.query("delete from app_private.business_scheduling_policy");
    await pool.query("delete from app_private.service");
    await pool.query("delete from app_private.business");
    await pool.query(
      `insert into app_private.business
        (id, public_name, timezone, currency_code, admin_auth_user_id)
       values ($1, 'Negócio A', 'America/Sao_Paulo', 'BRL', $2),
              ($3, 'Negócio B', 'America/New_York', 'BRL', $4)`,
      [BUSINESS_A, ADMIN_A, BUSINESS_B, ADMIN_B],
    );
  });

  afterAll(async () => void (await pool.end()));

  async function withRuntime<T>(
    businessId: string,
    callback: (repositories: {
      dates: PostgresDateAvailabilityRepository;
      blocks: PostgresBlockedPeriodRepository;
    }) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("set role barber_runtime");
      const database = drizzle(client, { schema });
      const scope = businessScopeFromServer(businessId, "admin-auth-user");
      return await callback({
        dates: new PostgresDateAvailabilityRepository(database, scope),
        blocks: new PostgresBlockedPeriodRepository(database, scope),
      });
    } finally {
      await client.query("reset role");
      client.release();
    }
  }

  it("creates, edits, reloads, and removes CLOSED/REPLACE exceptions", async () => {
    await withRuntime(BUSINESS_A, async ({ dates }) => {
      const closed = await createDateAvailabilityException(dates, {
        localDate: "2026-12-24",
        mode: "CLOSED",
        privateNote: "Recesso",
        workingWindows: [],
        expectedAvailabilityVersion: 1,
      });
      const id = closed.exceptions[0]!.id;
      const replaced = await updateDateAvailabilityException(dates, id, {
        localDate: "2026-12-24",
        mode: "REPLACE",
        privateNote: "Véspera",
        workingWindows: [
          { startLocalTime: "09:00", endLocalTime: "12:00" },
          { startLocalTime: "12:00", endLocalTime: "14:00" },
        ],
        expectedVersion: 1,
        expectedAvailabilityVersion: 2,
      });
      expect(replaced.exceptions[0]).toMatchObject({
        id,
        mode: "REPLACE",
        version: 2,
        workingWindows: [
          { startLocalTime: "09:00", endLocalTime: "12:00" },
          { startLocalTime: "12:00", endLocalTime: "14:00" },
        ],
      });
      const empty = await deleteDateAvailabilityException(dates, id, 2, 3);
      expect(empty).toMatchObject({ availabilityVersion: 4, exceptions: [] });
    });
  });

  it("enforces date uniqueness, window overlap, and BusinessScope", async () => {
    const targetB = "30000000-0000-4000-8000-000000000002";
    await pool.query(
      `insert into app_private.date_availability_exception
        (id, business_id, local_date, mode)
       values ($1, $2, '2026-12-24', 'CLOSED')`,
      [targetB, BUSINESS_B],
    );
    await withRuntime(BUSINESS_A, async ({ dates }) => {
      await createDateAvailabilityException(dates, {
        localDate: "2026-12-24",
        mode: "CLOSED",
        privateNote: null,
        workingWindows: [],
        expectedAvailabilityVersion: 1,
      });
      await expect(
        updateDateAvailabilityException(dates, targetB, {
          localDate: "2026-12-25",
          mode: "CLOSED",
          privateNote: null,
          workingWindows: [],
          expectedVersion: 1,
          expectedAvailabilityVersion: 2,
        }),
      ).rejects.toMatchObject({ code: "DATE_EXCEPTION_ITEM_NOT_FOUND" });
    });
    await expect(
      pool.query(
        `insert into app_private.date_availability_exception
          (business_id, local_date, mode)
         values ($1, '2026-12-24', 'CLOSED')`,
        [BUSINESS_A],
      ),
    ).rejects.toMatchObject({ code: "23505" });

    const parent = "30000000-0000-4000-8000-000000000003";
    await pool.query(
      `insert into app_private.date_availability_exception
        (id, business_id, local_date, mode)
       values ($1, $2, '2026-12-26', 'REPLACE')`,
      [parent, BUSINESS_A],
    );
    await pool.query(
      `insert into app_private.exception_working_window
        (date_exception_id, start_local_time, end_local_time)
       values ($1, '09:00', '12:00')`,
      [parent],
    );
    await expect(
      pool.query(
        `insert into app_private.exception_working_window
          (date_exception_id, start_local_time, end_local_time)
         values ($1, '11:00', '13:00')`,
        [parent],
      ),
    ).rejects.toMatchObject({ code: "23P01" });
    await expect(pool.query("select 1 as recovered")).resolves.toMatchObject({
      rows: [{ recovered: 1 }],
    });
  });

  it("creates, edits, and deactivates one block and its occupancy atomically", async () => {
    await withRuntime(BUSINESS_A, async ({ blocks }) => {
      const created = await createBlockedPeriod(blocks, {
        localDate: "2026-08-31",
        startLocalTime: "10:00",
        endLocalTime: "11:00",
        privateReason: "Manutenção",
        expectedAvailabilityVersion: 1,
      });
      expect(created.blockedPeriods[0]).toMatchObject({
        startAtUtc: "2026-08-31T13:00:00.000Z",
        endAtUtc: "2026-08-31T14:00:00.000Z",
        timezoneSnapshot: "America/Sao_Paulo",
        version: 1,
      });
      const id = created.blockedPeriods[0]!.id;
      const edited = await updateBlockedPeriod(blocks, id, {
        localDate: "2026-08-31",
        startLocalTime: "11:00",
        endLocalTime: "12:00",
        privateReason: null,
        expectedVersion: 1,
        expectedAvailabilityVersion: 2,
      });
      expect(edited.blockedPeriods[0]).toMatchObject({
        startAtUtc: "2026-08-31T14:00:00.000Z",
        endAtUtc: "2026-08-31T15:00:00.000Z",
        version: 2,
      });
      await expect(
        deactivateBlockedPeriod(blocks, id, 2, 3),
      ).resolves.toMatchObject({ availabilityVersion: 4, blockedPeriods: [] });
    });

    const evidence = await pool.query(
      `select b.active, o.released_at is not null as released,
              lower(o.occupied_period)::text as start_at,
              upper(o.occupied_period)::text as end_at
       from app_private.blocked_period b
       join app_private.schedule_occupancy o on o.blocked_period_id = b.id`,
    );
    expect(evidence.rows).toEqual([
      expect.objectContaining({ active: false, released: true }),
    ]);
  });

  it("rejects overlap, permits adjacency and equal ranges for another Business", async () => {
    await withRuntime(BUSINESS_A, async ({ blocks }) => {
      await createBlockedPeriod(blocks, {
        localDate: "2026-08-31",
        startLocalTime: "10:00",
        endLocalTime: "11:00",
        privateReason: null,
        expectedAvailabilityVersion: 1,
      });
      await expect(
        createBlockedPeriod(blocks, {
          localDate: "2026-08-31",
          startLocalTime: "10:30",
          endLocalTime: "11:30",
          privateReason: null,
          expectedAvailabilityVersion: 2,
        }),
      ).rejects.toMatchObject({ code: "BLOCKED_PERIOD_CONFLICT", status: 409 });
      await expect(
        createBlockedPeriod(blocks, {
          localDate: "2026-08-31",
          startLocalTime: "11:00",
          endLocalTime: "12:00",
          privateReason: null,
          expectedAvailabilityVersion: 2,
        }),
      ).resolves.toMatchObject({ availabilityVersion: 3 });
    });
    await pool.query(
      "update app_private.business set timezone = 'America/Sao_Paulo' where id = $1",
      [BUSINESS_B],
    );
    await withRuntime(BUSINESS_B, async ({ blocks }) => {
      await expect(
        createBlockedPeriod(blocks, {
          localDate: "2026-08-31",
          startLocalTime: "10:00",
          endLocalTime: "11:00",
          privateReason: null,
          expectedAvailabilityVersion: 1,
        }),
      ).resolves.toMatchObject({ availabilityVersion: 2 });
    });
    await expect(pool.query("select 1 as recovered")).resolves.toMatchObject({
      rows: [{ recovered: 1 }],
    });
  });

  it("enforces deferred owner integrity and denies runtime occupancy DELETE", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into app_private.blocked_period
          (id, business_id, start_at, end_at, timezone_snapshot)
         values ($1, $2, '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z', 'UTC')`,
        ["40000000-0000-4000-8000-000000000099", BUSINESS_A],
      );
      await expect(client.query("commit")).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback").catch(() => undefined);

      const created = await withRuntime(BUSINESS_A, ({ blocks }) =>
        createBlockedPeriod(blocks, {
          localDate: "2026-09-01",
          startLocalTime: "10:00",
          endLocalTime: "11:00",
          privateReason: null,
          expectedAvailabilityVersion: 1,
        }),
      );
      const id = created.blockedPeriods[0]!.id;
      await client.query("begin");
      await client.query(
        "delete from app_private.schedule_occupancy where blocked_period_id = $1",
        [id],
      );
      await expect(client.query("commit")).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback").catch(() => undefined);

      await client.query("set role barber_runtime");
      await expect(
        client.query(
          "delete from app_private.schedule_occupancy where blocked_period_id = $1",
          [id],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("reset role");
      await expect(client.query("select 1 as recovered")).resolves.toMatchObject({
        rows: [{ recovered: 1 }],
      });
    } finally {
      await client.query("rollback").catch(() => undefined);
      await client.query("reset role").catch(() => undefined);
      client.release();
    }
  });

  it("feeds a persisted block and CLOSED exception into the engine", async () => {
    await pool.query(
      `insert into app_private.weekly_working_window
        (business_id, weekday, start_local_time, end_local_time)
       values ($1, 1, '09:00', '14:00')`,
      [BUSINESS_A],
    );
    await withRuntime(BUSINESS_A, async ({ dates, blocks }) => {
      const closed = await createDateAvailabilityException(dates, {
        localDate: "2026-09-01",
        mode: "CLOSED",
        privateNote: null,
        workingWindows: [],
        expectedAvailabilityVersion: 1,
      });
      const block = await createBlockedPeriod(blocks, {
        localDate: "2026-08-31",
        startLocalTime: "10:00",
        endLocalTime: "11:00",
        privateReason: null,
        expectedAvailabilityVersion: 2,
      });
      const weeklyWorkingWindows = [
        {
          id: "50000000-0000-4000-8000-000000000001",
          businessId: BUSINESS_A,
          weekday: 1 as const,
          startLocalTime: "09:00",
          endLocalTime: "14:00",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ];
      const openResult = calculateAvailabilityForCandidates({
        localDate: "2026-08-31",
        timezone: "America/Sao_Paulo",
        serviceDurationMinutes: 60,
        candidateLocalTimes: ["09:00", "10:00", "11:00"],
        weeklyWorkingWindows,
        weeklyBreaks: [],
        dateException: null,
        blockedPeriods: block.blockedPeriods,
      });
      expect(openResult.availableCandidates.map((item) => item.startLocalTime)).toEqual([
        "09:00",
        "11:00",
      ]);
      const closedResult = calculateAvailabilityForCandidates({
        localDate: "2026-09-01",
        timezone: "America/Sao_Paulo",
        serviceDurationMinutes: 60,
        candidateLocalTimes: ["09:00"],
        weeklyWorkingWindows,
        weeklyBreaks: [],
        dateException: closed.exceptions[0]!,
        blockedPeriods: block.blockedPeriods,
      });
      expect(closedResult).toMatchObject({ source: "CLOSED", availableCandidates: [] });
    });
  });
});
