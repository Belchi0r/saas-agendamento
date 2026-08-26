import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createWeeklyBreak,
  createWorkingWindow,
  deleteWeeklyBreak,
  deleteWorkingWindow,
  getWeeklyAvailability,
  updateWeeklyBreak,
  updateWorkingWindow,
} from "@/application/availability/weekly-availability-use-cases";
import { businessScopeFromServer } from "@/domain/business/business-scope";
import { PostgresWeeklyAvailabilityRepository } from "@/persistence/availability/postgres-weekly-availability-repository";
import * as schema from "@/persistence/database/schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = databaseUrl ? describe : describe.skip;

const BUSINESS_A = "10000000-0000-4000-8000-000000000001";
const BUSINESS_B = "10000000-0000-4000-8000-000000000002";
const ADMIN_A = "20000000-0000-4000-8000-000000000001";
const ADMIN_B = "20000000-0000-4000-8000-000000000002";

databaseSuite("Sprint 2 weekly availability on real PostgreSQL", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid.invalid/postgres",
    max: 4,
  });

  beforeAll(async () => {
    await pool.query("select 1");
  });

  beforeEach(async () => {
    await pool.query("delete from app_private.weekly_break");
    await pool.query("delete from app_private.weekly_working_window");
    await pool.query("delete from app_private.service");
    await pool.query("delete from app_private.business");
    await pool.query(
      `
        insert into app_private.business (
          id, public_name, timezone, currency_code, admin_auth_user_id
        ) values
          ($1, 'Negócio A', 'America/Sao_Paulo', 'BRL', $2),
          ($3, 'Negócio B', 'America/New_York', 'BRL', $4)
      `,
      [BUSINESS_A, ADMIN_A, BUSINESS_B, ADMIN_B],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function withRuntimeRepository<T>(
    businessId: string,
    callback: (repository: PostgresWeeklyAvailabilityRepository) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();

    try {
      await client.query("set role barber_runtime");
      const database = drizzle(client, { schema });
      return await callback(
        new PostgresWeeklyAvailabilityRepository(
          database,
          businessScopeFromServer(businessId, "admin-auth-user"),
        ),
      );
    } finally {
      await client.query("reset role");
      client.release();
    }
  }

  it("creates, edits, reloads, and removes working windows and breaks", async () => {
    const final = await withRuntimeRepository(BUSINESS_A, async (repository) => {
      const working = await createWorkingWindow(repository, {
        weekday: 1,
        startLocalTime: "09:00",
        endLocalTime: "18:00",
        expectedAvailabilityVersion: 1,
      });
      const paused = await createWeeklyBreak(repository, {
        weekday: 1,
        startLocalTime: "12:00",
        endLocalTime: "13:00",
        expectedAvailabilityVersion: working.availabilityVersion,
      });
      const editedWorking = await updateWorkingWindow(
        repository,
        working.workingWindows[0]!.id,
        {
          weekday: 1,
          startLocalTime: "08:30",
          endLocalTime: "18:30",
          expectedAvailabilityVersion: paused.availabilityVersion,
        },
      );
      const editedBreak = await updateWeeklyBreak(
        repository,
        paused.breaks[0]!.id,
        {
          weekday: 1,
          startLocalTime: "12:30",
          endLocalTime: "13:30",
          expectedAvailabilityVersion: editedWorking.availabilityVersion,
        },
      );
      const withoutBreak = await deleteWeeklyBreak(
        repository,
        editedBreak.breaks[0]!.id,
        editedBreak.availabilityVersion,
      );
      const empty = await deleteWorkingWindow(
        repository,
        withoutBreak.workingWindows[0]!.id,
        withoutBreak.availabilityVersion,
      );

      return { empty, reloaded: await getWeeklyAvailability(repository) };
    });

    expect(final.empty).toMatchObject({
      timezone: "America/Sao_Paulo",
      availabilityVersion: 7,
      workingWindows: [],
      breaks: [],
    });
    expect(final.reloaded).toMatchObject({
      availabilityVersion: 7,
      workingWindows: [],
      breaks: [],
    });
  });

  it("allows adjacent windows, rejects overlap in Domain and PostgreSQL, and recovers", async () => {
    await withRuntimeRepository(BUSINESS_A, async (repository) => {
      const first = await createWorkingWindow(repository, {
        weekday: 1,
        startLocalTime: "09:00",
        endLocalTime: "12:00",
        expectedAvailabilityVersion: 1,
      });
      const adjacent = await createWorkingWindow(repository, {
        weekday: 1,
        startLocalTime: "12:00",
        endLocalTime: "18:00",
        expectedAvailabilityVersion: first.availabilityVersion,
      });

      await expect(
        createWorkingWindow(repository, {
          weekday: 1,
          startLocalTime: "11:00",
          endLocalTime: "13:00",
          expectedAvailabilityVersion: adjacent.availabilityVersion,
        }),
      ).rejects.toMatchObject({ code: "WORKING_WINDOW_OVERLAP", status: 409 });
      await expect(getWeeklyAvailability(repository)).resolves.toMatchObject({
        availabilityVersion: 3,
        workingWindows: [{ startLocalTime: "09:00", endLocalTime: "12:00" }, { startLocalTime: "12:00", endLocalTime: "18:00" }],
      });
    });

    await expect(
      pool.query(
        `
          insert into app_private.weekly_working_window (
            business_id, weekday, start_local_time, end_local_time
          ) values ($1, 1, '10:00', '11:00')
        `,
        [BUSINESS_A],
      ),
    ).rejects.toMatchObject({ code: "23P01" });
    await expect(pool.query("select 1 as recovered")).resolves.toMatchObject({
      rows: [{ recovered: 1 }],
    });
  });

  it("rejects breaks outside working time and preserves valid state atomically", async () => {
    await withRuntimeRepository(BUSINESS_A, async (repository) => {
      const working = await createWorkingWindow(repository, {
        weekday: 2,
        startLocalTime: "09:00",
        endLocalTime: "18:00",
        expectedAvailabilityVersion: 1,
      });
      const paused = await createWeeklyBreak(repository, {
        weekday: 2,
        startLocalTime: "12:00",
        endLocalTime: "13:00",
        expectedAvailabilityVersion: working.availabilityVersion,
      });

      await expect(
        createWeeklyBreak(repository, {
          weekday: 2,
          startLocalTime: "18:00",
          endLocalTime: "19:00",
          expectedAvailabilityVersion: paused.availabilityVersion,
        }),
      ).rejects.toMatchObject({
        code: "WEEKLY_BREAK_OUTSIDE_WORKING_WINDOW",
      });
      await expect(
        deleteWorkingWindow(
          repository,
          paused.workingWindows[0]!.id,
          paused.availabilityVersion,
        ),
      ).rejects.toMatchObject({
        code: "WEEKLY_BREAK_OUTSIDE_WORKING_WINDOW",
      });

      await expect(getWeeklyAvailability(repository)).resolves.toMatchObject({
        availabilityVersion: 3,
        workingWindows: [{ startLocalTime: "09:00", endLocalTime: "18:00" }],
        breaks: [{ startLocalTime: "12:00", endLocalTime: "13:00" }],
      });
    });
  });

  it("isolates two Businesses for reads and mutations while allowing equal local ranges", async () => {
    const targetB = "50000000-0000-4000-8000-000000000002";
    await pool.query(
      `
        insert into app_private.weekly_working_window (
          id, business_id, weekday, start_local_time, end_local_time
        ) values ($1, $2, 1, '09:00', '18:00')
      `,
      [targetB, BUSINESS_B],
    );

    await withRuntimeRepository(BUSINESS_A, async (repository) => {
      const own = await createWorkingWindow(repository, {
        weekday: 1,
        startLocalTime: "09:00",
        endLocalTime: "18:00",
        expectedAvailabilityVersion: 1,
      });
      expect(own.workingWindows).toHaveLength(1);
      expect(own.workingWindows[0]?.businessId).toBe(BUSINESS_A);

      await expect(
        updateWorkingWindow(repository, targetB, {
          weekday: 1,
          startLocalTime: "08:00",
          endLocalTime: "17:00",
          expectedAvailabilityVersion: own.availabilityVersion,
        }),
      ).rejects.toMatchObject({ code: "WEEKLY_ITEM_NOT_FOUND", status: 404 });
    });

    await expect(
      pool.query(
        "select start_local_time::text, end_local_time::text from app_private.weekly_working_window where id = $1",
        [targetB],
      ),
    ).resolves.toMatchObject({
      rows: [{ start_local_time: "09:00:00", end_local_time: "18:00:00" }],
    });
  });

  it("enforces shape constraints and optimistic versioning without poisoning connections", async () => {
    await expect(
      pool.query(
        `
          insert into app_private.weekly_break (
            business_id, weekday, start_local_time, end_local_time
          ) values ($1, 8, '13:00', '12:00')
        `,
        [BUSINESS_A],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await withRuntimeRepository(BUSINESS_A, async (repository) => {
      await createWorkingWindow(repository, {
        weekday: 3,
        startLocalTime: "09:00",
        endLocalTime: "18:00",
        expectedAvailabilityVersion: 1,
      });

      await expect(
        createWorkingWindow(repository, {
          weekday: 4,
          startLocalTime: "09:00",
          endLocalTime: "18:00",
          expectedAvailabilityVersion: 1,
        }),
      ).rejects.toMatchObject({
        code: "AVAILABILITY_VERSION_CONFLICT",
        status: 409,
      });
      await expect(getWeeklyAvailability(repository)).resolves.toMatchObject({
        availabilityVersion: 2,
      });
    });
  });
});
