import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { insertOccupancySql } from "../../src/db/advanced-sql.js";
import { createDatabase, createRuntimePool, RUNTIME_POOL_MAX } from "../../src/db/pool.js";
import { asPostgresError, isExclusionViolation } from "../../src/db/postgres-error.js";
import {
  business,
  scheduleOccupancy,
  transactionProbe,
} from "../../src/db/schema.js";

export async function runDatabaseExperiments(
  connectionString: string,
  environment: "embedded-postgres" | "supavisor-transaction",
) {
  const pool = createRuntimePool(connectionString);
  const db = createDatabase(pool);
  const businessId = randomUUID();
  const deletedBusinessId = randomUUID();
  let exclusionSqlstate: string | undefined;
  let exclusionConstraint: string | undefined;

  try {
    // CRUD through Drizzle.
    await db.insert(business).values({ id: businessId, name: "SPK-002 Lab" });
    const inserted = await db.query.business.findFirst({
      where: eq(business.id, businessId),
    });
    assert.equal(inserted?.name, "SPK-002 Lab");

    await db
      .update(business)
      .set({ name: "SPK-002 Lab Updated" })
      .where(eq(business.id, businessId));
    const updated = await db.query.business.findFirst({
      where: eq(business.id, businessId),
    });
    assert.equal(updated?.name, "SPK-002 Lab Updated");

    await db
      .insert(business)
      .values({ id: deletedBusinessId, name: "SPK-002 Delete Probe" });
    await db.delete(business).where(eq(business.id, deletedBusinessId));
    const deleted = await db.query.business.findFirst({
      where: eq(business.id, deletedBusinessId),
    });
    assert.equal(deleted, undefined);

    // Direct pg parameterization treats an injection-shaped string as data.
    const injectionShapedValue = "x'); drop schema app_private cascade; --";
    const parameterized = await pool.query<{ echoed: string }>(
      "select $1::text as echoed",
      [injectionShapedValue],
    );
    assert.equal(parameterized.rows[0]?.echoed, injectionShapedValue);
    const schemaStillExists = await pool.query<{ present: string | null }>(
      "select to_regnamespace('app_private')::text as present",
    );
    assert.equal(schemaStillExists.rows[0]?.present, "app_private");

    // Adjacent half-open periods are valid; a released overlap is ignored.
    const adjacentIds = [randomUUID(), randomUUID(), randomUUID()];
    await db.transaction(async (transaction) => {
      await transaction.execute(
        insertOccupancySql({
          id: adjacentIds[0]!,
          businessId,
          startAt: "2035-01-10T10:00:00Z",
          endAt: "2035-01-10T11:00:00Z",
        }),
      );
      await transaction.execute(
        insertOccupancySql({
          id: adjacentIds[1]!,
          businessId,
          startAt: "2035-01-10T11:00:00Z",
          endAt: "2035-01-10T12:00:00Z",
        }),
      );
      await transaction.execute(
        insertOccupancySql({
          id: adjacentIds[2]!,
          businessId,
          startAt: "2035-01-10T10:30:00Z",
          endAt: "2035-01-10T11:30:00Z",
          releasedAt: "2034-01-01T00:00:00Z",
        }),
      );
    });
    const adjacentRows = await db
      .select()
      .from(scheduleOccupancy)
      .where(eq(scheduleOccupancy.businessId, businessId));
    assert.equal(adjacentRows.length, 3);
    await db
      .delete(scheduleOccupancy)
      .where(eq(scheduleOccupancy.businessId, businessId));

    // A conflict aborts the complete transaction, including its auxiliary row.
    const probeId = randomUUID();
    const validOccupancyId = randomUUID();
    const conflictingOccupancyId = randomUUID();
    try {
      await db.transaction(async (transaction) => {
        await transaction.insert(transactionProbe).values({
          id: probeId,
          note: "must roll back",
        });
        await transaction.execute(
          insertOccupancySql({
            id: validOccupancyId,
            businessId,
            startAt: "2035-02-10T14:00:00Z",
            endAt: "2035-02-10T15:00:00Z",
          }),
        );
        await transaction.execute(
          insertOccupancySql({
            id: conflictingOccupancyId,
            businessId,
            startAt: "2035-02-10T14:30:00Z",
            endAt: "2035-02-10T15:30:00Z",
          }),
        );
      });
      assert.fail("The exclusion constraint should have rejected the overlap");
    } catch (error) {
      const postgresError = asPostgresError(error);
      exclusionSqlstate = postgresError?.code;
      exclusionConstraint = postgresError?.constraint;
      assert.equal(isExclusionViolation(error), true);
    }
    assert.equal(exclusionSqlstate, "23P01");
    assert.equal(exclusionConstraint, "schedule_occupancy_no_overlap");
    const rolledBackProbe = await db
      .select()
      .from(transactionProbe)
      .where(eq(transactionProbe.id, probeId));
    assert.equal(rolledBackProbe.length, 0);
    const rolledBackOccupancy = await db
      .select()
      .from(scheduleOccupancy)
      .where(eq(scheduleOccupancy.businessId, businessId));
    assert.equal(rolledBackOccupancy.length, 0);

    // The pool remains usable after the failed transaction.
    const recovery = await pool.query<{ answer: number }>(
      "select 42::integer as answer",
    );
    assert.equal(recovery.rows[0]?.answer, 42);

    // Consecutive explicit transactions, including a real rollback.
    const consecutiveResults: string[] = [];
    for (const action of ["commit", "rollback", "commit"] as const) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select $1::text as action", [action]);
        await client.query(action);
        consecutiveResults.push(action);
      } finally {
        client.release();
      }
    }

    // Two checked-out pg clients prove row-level locking inside a transaction.
    const locker = await pool.connect();
    const contender = await pool.connect();
    let lockSqlstate: string | undefined;
    try {
      await locker.query("begin");
      await locker.query(
        "select id from app_private.business where id = $1 for update",
        [businessId],
      );
      await contender.query("begin");
      await contender.query("set local lock_timeout = '250ms'");
      try {
        await contender.query(
          "select id from app_private.business where id = $1 for update",
          [businessId],
        );
        assert.fail("The second row lock should have timed out");
      } catch (error) {
        lockSqlstate = asPostgresError(error)?.code;
        assert.equal(lockSqlstate, "55P03");
      }
      await contender.query("rollback");
      await locker.query("commit");
    } finally {
      contender.release();
      locker.release();
    }

    // Neither node-postgres nor Drizzle used a named statement.
    const prepared = await pool.query<{ name: string; statement: string }>(
      "select name, statement from pg_prepared_statements order by name",
    );
    assert.deepEqual(prepared.rows, []);
    assert.ok(pool.totalCount <= RUNTIME_POOL_MAX);
    assert.equal(pool.waitingCount, 0);

    const advanced = await pool.query<{
      postgres_version: string;
      extension_version: string;
      constraint_definition: string;
      exclusion_index_definition: string;
    }>(`
      select
        current_setting('server_version') as postgres_version,
        (select extversion from pg_extension where extname = 'btree_gist') as extension_version,
        (
          select pg_get_constraintdef(con.oid, true)
          from pg_constraint con
          join pg_class c on c.oid = con.conrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'app_private'
            and con.conname = 'schedule_occupancy_no_overlap'
        ) as constraint_definition,
        (
          select pg_get_indexdef(i.indexrelid)
          from pg_index i
          join pg_class idx on idx.oid = i.indexrelid
          join pg_namespace n on n.oid = idx.relnamespace
          where n.nspname = 'app_private'
            and idx.relname = 'schedule_occupancy_no_overlap'
        ) as exclusion_index_definition
    `);
    assert.match(
      advanced.rows[0]!.constraint_definition,
      /EXCLUDE USING gist/i,
    );
    assert.match(
      advanced.rows[0]!.constraint_definition,
      /occupied_period WITH &&/i,
    );

    const poolBeforeClose = {
      configuredMax: RUNTIME_POOL_MAX,
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };

    await db.delete(business).where(eq(business.id, businessId));
    await pool.end();
    let queryRejectedAfterClose = false;
    try {
      await pool.query("select 1");
    } catch {
      queryRejectedAfterClose = true;
    }
    assert.equal(queryRejectedAfterClose, true);

    return {
      environment,
      drizzleCrud: "PASS",
      parameterizedSql: "PASS",
      adjacentHalfOpenRanges: "PASS",
      releasedOverlapIgnored: "PASS",
      exclusionViolation: {
        status: "PASS",
        sqlstate: exclusionSqlstate,
        constraint: exclusionConstraint,
      },
      rollbackIntegrity: "PASS",
      connectionRecovery: "PASS",
      consecutiveTransactions: consecutiveResults,
      rowLock: { status: "PASS", sqlstate: lockSqlstate },
      namedPreparedStatements: prepared.rows,
      advancedPostgres: advanced.rows[0],
      poolLifecycle: {
        beforeClose: poolBeforeClose,
        queryRejectedAfterClose,
      },
    };
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
}
