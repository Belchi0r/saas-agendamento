import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveAdminAccess } from "@/application/admin/resolve-admin-access";
import { resolvePublicBusinessScope } from "@/application/business/resolve-business-scope";
import {
  createService,
  listAdminServices,
  listPublicServices,
  setServiceActive,
  updateService,
} from "@/application/services/service-use-cases";
import { businessScopeFromServer } from "@/domain/business/business-scope";
import { PostgresBusinessRepository } from "@/persistence/business/business-repository";
import * as schema from "@/persistence/database/schema";
import { PostgresServiceRepository } from "@/persistence/services/postgres-service-repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = databaseUrl ? describe : describe.skip;

const BUSINESS_A = "10000000-0000-4000-8000-000000000001";
const BUSINESS_B = "10000000-0000-4000-8000-000000000002";
const ADMIN_A = "20000000-0000-4000-8000-000000000001";
const ADMIN_B = "20000000-0000-4000-8000-000000000002";

databaseSuite("Sprint 1 Service vertical slice on real PostgreSQL", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid.invalid/postgres",
    max: 3,
  });

  beforeAll(async () => {
    await pool.query("select 1");
  });

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
      `
        insert into app_private.business (
          id, public_name, timezone, currency_code, admin_auth_user_id
        ) values
          ($1, 'Negócio A', 'America/Sao_Paulo', 'BRL', $2),
          ($3, 'Negócio B', 'America/Sao_Paulo', 'BRL', $4)
      `,
      [BUSINESS_A, ADMIN_A, BUSINESS_B, ADMIN_B],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function withRuntimeRepository<T>(
    businessId: string,
    callback: (repository: PostgresServiceRepository) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();

    try {
      await client.query("set role barber_runtime");
      const database = drizzle(client, { schema });
      const repository = new PostgresServiceRepository(
        database,
        businessScopeFromServer(businessId, "admin-auth-user"),
      );
      return await callback(repository);
    } finally {
      await client.query("reset role");
      client.release();
    }
  }

  it("creates, edits, deactivates, and persists through the minimum runtime role", async () => {
    const result = await withRuntimeRepository(BUSINESS_A, async (repository) => {
      const created = await createService(repository, {
        name: "  Atendimento inicial  ",
        description: "  Descrição operacional  ",
        priceMinor: 15_500,
        durationMinutes: 75,
        active: true,
      });
      const updated = await updateService(repository, created.id, {
        name: "Atendimento atualizado",
        description: null,
        priceMinor: 17_000,
        durationMinutes: 90,
        expectedVersion: created.version,
      });
      const inactive = await setServiceActive(repository, created.id, {
        active: false,
        expectedVersion: updated.version,
      });

      return { created, updated, inactive };
    });

    expect(result.created).toMatchObject({
      businessId: BUSINESS_A,
      name: "Atendimento inicial",
      currencyCode: "BRL",
      version: 1,
    });
    expect(result.updated).toMatchObject({
      name: "Atendimento atualizado",
      priceMinor: 17_000,
      durationMinutes: 90,
      version: 2,
    });
    expect(result.inactive).toMatchObject({ active: false, version: 3 });

    await expect(
      pool.query(
        "select name, price_minor, duration_minutes, active, version from app_private.service where id = $1",
        [result.created.id],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          name: "Atendimento atualizado",
          price_minor: 17_000,
          duration_minutes: 90,
          active: false,
          version: 3,
        },
      ],
    });
  });

  it("returns only active Services from the requested Business", async () => {
    await pool.query(
      `
        insert into app_private.service (
          id, business_id, name, price_minor, currency_code, duration_minutes, active
        ) values
          ('30000000-0000-4000-8000-000000000001', $1, 'Ativo A', 1000, 'BRL', 30, true),
          ('30000000-0000-4000-8000-000000000002', $1, 'Inativo A', 2000, 'BRL', 45, false),
          ('30000000-0000-4000-8000-000000000003', $2, 'Ativo B', 3000, 'BRL', 60, true)
      `,
      [BUSINESS_A, BUSINESS_B],
    );

    await withRuntimeRepository(BUSINESS_A, async (repository) => {
      await expect(listPublicServices(repository)).resolves.toMatchObject([
        { name: "Ativo A", active: true, businessId: BUSINESS_A },
      ]);
      await expect(listAdminServices(repository)).resolves.toHaveLength(2);
    });
  });

  it("cannot update a Service across BusinessScope", async () => {
    const targetId = "30000000-0000-4000-8000-000000000003";
    await pool.query(
      `
        insert into app_private.service (
          id, business_id, name, price_minor, currency_code, duration_minutes, active
        ) values ($1, $2, 'Somente B', 3000, 'BRL', 60, true)
      `,
      [targetId, BUSINESS_B],
    );

    await withRuntimeRepository(BUSINESS_A, async (repository) => {
      await expect(
        updateService(repository, targetId, {
          name: "Tentativa cruzada",
          description: null,
          priceMinor: 1,
          durationMinutes: 1,
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ code: "SERVICE_VERSION_CONFLICT", status: 409 });
    });

    await expect(
      pool.query("select name from app_private.service where id = $1", [targetId]),
    ).resolves.toMatchObject({ rows: [{ name: "Somente B" }] });
  });

  it("maps the correct Auth user to Business and denies a different user", async () => {
    const database = drizzle(pool, { schema });
    const reader = new PostgresBusinessRepository(database);

    await expect(
      resolveAdminAccess({ getAuthenticatedUserId: async () => ADMIN_A }, reader),
    ).resolves.toMatchObject({ businessId: BUSINESS_A });
    await expect(
      resolveAdminAccess(
        {
          getAuthenticatedUserId: async () =>
            "20000000-0000-4000-8000-000000000099",
        },
        reader,
      ),
    ).rejects.toMatchObject({ code: "ADMIN_NOT_AUTHORIZED", status: 403 });
  });

  it("resolves only the server-side published singleton for the public catalog", async () => {
    const database = drizzle(pool, { schema });
    const reader = new PostgresBusinessRepository(database);
    await pool.query(
      "update app_private.business set public_booking_enabled = true where id = $1",
      [BUSINESS_A],
    );

    await expect(resolvePublicBusinessScope(reader)).resolves.toMatchObject({
      businessId: BUSINESS_A,
      resolvedBy: "public-singleton",
    });

    await pool.query(
      "update app_private.business set public_booking_enabled = true where id = $1",
      [BUSINESS_B],
    );
    await expect(resolvePublicBusinessScope(reader)).rejects.toMatchObject({
      code: "BUSINESS_SCOPE_AMBIGUOUS",
      status: 503,
    });
  });

  it("enforces Business currency and denies DELETE to runtime with recovery", async () => {
    await expect(
      pool.query(
        `
          insert into app_private.service (
            business_id, name, price_minor, currency_code, duration_minutes, active
          ) values ($1, 'Moeda inválida', 1000, 'USD', 30, true)
        `,
        [BUSINESS_A],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    await pool.query(
      `
        insert into app_private.service (
          id, business_id, name, price_minor, currency_code, duration_minutes, active
        ) values ('30000000-0000-4000-8000-000000000004', $1, 'Preservado', 1000, 'BRL', 30, true)
      `,
      [BUSINESS_A],
    );

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role barber_runtime");
      await expect(
        client.query(
          "delete from app_private.service where id = '30000000-0000-4000-8000-000000000004'",
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback");
      await expect(client.query("select 1 as recovered")).resolves.toMatchObject({
        rows: [{ recovered: 1 }],
      });
    } finally {
      client.release();
    }
  });
});
