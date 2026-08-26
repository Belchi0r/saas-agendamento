import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import type { Pool, PoolClient } from "pg";

import { createBarrier, waitForBackendLock } from "./synchronization.js";

type Period = { start: string; end: string };
type OwnerKind = "booking" | "block";

type PostgresErrorShape = {
  code?: string;
  constraint?: string;
};

const HISTORY_ROWS_PER_CLASS = 25_000;

const normalizeInstant = (value: string) => new Date(value).toISOString();

function postgresError(error: unknown): PostgresErrorShape {
  if (typeof error !== "object" || error === null) {
    return {};
  }
  return error as PostgresErrorShape;
}

async function backendPid(client: PoolClient): Promise<number> {
  const result = await client.query<{ pid: number }>(
    "select pg_backend_pid()::integer as pid",
  );
  return result.rows[0]!.pid;
}

async function rollback(client: PoolClient) {
  await client.query("rollback").catch(() => undefined);
}

async function assertConnectionReusable(client: PoolClient, marker: string) {
  const result = await client.query<{ marker: string }>(
    "select $1::text as marker",
    [marker],
  );
  assert.equal(result.rows[0]?.marker, marker);
  return true;
}

async function createBusiness(pool: Pool) {
  const id = randomUUID();
  await pool.query(
    "insert into app_private.business (id) values ($1)",
    [id],
  );
  return id;
}

async function insertAppointment(
  client: PoolClient,
  businessId: string,
  appointmentId: string,
  period: Period,
  status = "CONFIRMED",
) {
  await client.query(`
    insert into app_private.appointment (
      id,
      business_id,
      status,
      scheduled_start_at,
      scheduled_end_at,
      occupied_start_at,
      occupied_end_at
    ) values ($1, $2, $3, $4, $5, $4, $5)
  `, [appointmentId, businessId, status, period.start, period.end]);
}

async function insertBlockedPeriod(
  client: PoolClient,
  businessId: string,
  blockedPeriodId: string,
  period: Period,
) {
  await client.query(`
    insert into app_private.blocked_period (
      id,
      business_id,
      start_at,
      end_at,
      active
    ) values ($1, $2, $3, $4, true)
  `, [blockedPeriodId, businessId, period.start, period.end]);
}

async function insertOccupancy(
  client: PoolClient,
  businessId: string,
  ownerId: string,
  ownerKind: OwnerKind,
  period: Period,
  releasedAt?: string,
) {
  const appointmentId = ownerKind === "booking" ? ownerId : null;
  const blockedPeriodId = ownerKind === "block" ? ownerId : null;
  const id = randomUUID();
  await client.query(`
    insert into app_private.schedule_occupancy (
      id,
      business_id,
      appointment_id,
      blocked_period_id,
      occupied_period,
      released_at
    ) values (
      $1,
      $2,
      $3,
      $4,
      tstzrange($5::timestamptz, $6::timestamptz, '[)'),
      $7
    )
  `, [
    id,
    businessId,
    appointmentId,
    blockedPeriodId,
    period.start,
    period.end,
    releasedAt ?? null,
  ]);
  return id;
}

async function createOwnedCapacity(
  pool: Pool,
  businessId: string,
  kind: OwnerKind,
  period: Period,
  status = "CONFIRMED",
) {
  const client = await pool.connect();
  const ownerId = randomUUID();
  try {
    await client.query("begin");
    if (kind === "booking") {
      await insertAppointment(client, businessId, ownerId, period, status);
    } else {
      await insertBlockedPeriod(client, businessId, ownerId, period);
    }
    const occupancyId = await insertOccupancy(
      client,
      businessId,
      ownerId,
      kind,
      period,
    );
    await client.query("commit");
    return { ownerId, occupancyId };
  } catch (error) {
    await rollback(client);
    throw error;
  } finally {
    client.release();
  }
}

async function runCapacityContender(
  pool: Pool,
  businessId: string,
  kind: OwnerKind,
  period: Period,
  barrier: ReturnType<typeof createBarrier>,
  label: string,
) {
  const client = await pool.connect();
  const ownerId = randomUUID();
  try {
    await client.query("begin");
    await client.query(
      "select id from app_private.business where id = $1 for share",
      [businessId],
    );
    if (kind === "booking") {
      await insertAppointment(client, businessId, ownerId, period);
    } else {
      await insertBlockedPeriod(client, businessId, ownerId, period);
    }
    await barrier.arriveAndWait();
    await insertOccupancy(client, businessId, ownerId, kind, period);
    await client.query("commit");
    const connectionReusable = await assertConnectionReusable(
      client,
      `${label}-winner`,
    );
    return {
      label,
      kind,
      status: "SUCCESS" as const,
      ownerId,
      connectionReusable,
    };
  } catch (error) {
    const detail = postgresError(error);
    await rollback(client);
    const connectionReusable = await assertConnectionReusable(
      client,
      `${label}-loser`,
    );
    return {
      label,
      kind,
      status: "CONFLICT" as const,
      ownerId,
      sqlstate: detail.code,
      constraint: detail.constraint,
      connectionReusable,
    };
  } finally {
    client.release();
  }
}

export async function runOwnerIntegrity(pool: Pool) {
  const businessId = await createBusiness(pool);
  const client = await pool.connect();
  const failures: Array<{
    owner: OwnerKind;
    sqlstate?: string;
    constraint?: string;
    connectionReusable: boolean;
  }> = [];

  try {
    for (const owner of ["booking", "block"] as const) {
      const id = randomUUID();
      try {
        await client.query("begin");
        if (owner === "booking") {
          await insertAppointment(client, businessId, id, {
            start: "2035-01-01T10:00:00Z",
            end: "2035-01-01T11:00:00Z",
          });
        } else {
          await insertBlockedPeriod(client, businessId, id, {
            start: "2035-01-01T12:00:00Z",
            end: "2035-01-01T13:00:00Z",
          });
        }
        await client.query("commit");
        assert.fail(`${owner} without occupancy should fail at commit`);
      } catch (error) {
        const detail = postgresError(error);
        await rollback(client);
        assert.equal(detail.code, "23514");
        assert.equal(detail.constraint, "schedule_occupancy_owner_required");
        failures.push({
          owner,
          sqlstate: detail.code,
          constraint: detail.constraint,
          connectionReusable: await assertConnectionReusable(
            client,
            `owner-${owner}`,
          ),
        });
      }
    }
  } finally {
    client.release();
  }

  return {
    result: "PASS",
    deferredUntilCommit: true,
    failures,
  };
}

export async function runBookingVsBooking(pool: Pool) {
  const businessId = await createBusiness(pool);
  const period = {
    start: "2035-02-01T14:00:00Z",
    end: "2035-02-01T15:00:00Z",
  };
  const barrier = createBarrier(2);
  const outcomes = await Promise.all([
    runCapacityContender(
      pool,
      businessId,
      "booking",
      period,
      barrier,
      "booking-a",
    ),
    runCapacityContender(
      pool,
      businessId,
      "booking",
      period,
      barrier,
      "booking-b",
    ),
  ]);
  assert.equal(outcomes.filter((item) => item.status === "SUCCESS").length, 1);
  const loser = outcomes.find((item) => item.status === "CONFLICT");
  assert.equal(loser?.sqlstate, "23P01");
  assert.equal(loser?.constraint, "schedule_occupancy_no_overlap");
  const persisted = await pool.query<{ count: number }>(`
    select count(*)::integer as count
    from app_private.schedule_occupancy
    where business_id = $1 and released_at is null
  `, [businessId]);
  assert.equal(persisted.rows[0]?.count, 1);
  return { result: "PASS", persistedActiveOccupancies: 1, outcomes };
}

export async function runBookingVsBlock(pool: Pool) {
  const businessId = await createBusiness(pool);
  const period = {
    start: "2035-03-01T14:00:00Z",
    end: "2035-03-01T15:00:00Z",
  };
  const barrier = createBarrier(2);
  const outcomes = await Promise.all([
    runCapacityContender(
      pool,
      businessId,
      "booking",
      period,
      barrier,
      "booking",
    ),
    runCapacityContender(
      pool,
      businessId,
      "block",
      period,
      barrier,
      "block",
    ),
  ]);
  assert.equal(outcomes.filter((item) => item.status === "SUCCESS").length, 1);
  const loser = outcomes.find((item) => item.status === "CONFLICT");
  assert.equal(loser?.sqlstate, "23P01");
  assert.equal(loser?.constraint, "schedule_occupancy_no_overlap");
  const persisted = await pool.query<{ count: number }>(`
    select count(*)::integer as count
    from app_private.schedule_occupancy
    where business_id = $1 and released_at is null
  `, [businessId]);
  assert.equal(persisted.rows[0]?.count, 1);
  return { result: "PASS", persistedActiveOccupancies: 1, outcomes };
}

export async function runConcurrentReschedule(pool: Pool) {
  const businessId = await createBusiness(pool);
  const original = {
    start: "2035-04-01T09:00:00Z",
    end: "2035-04-01T10:00:00Z",
  };
  const targetA = {
    start: "2035-04-01T11:00:00Z",
    end: "2035-04-01T12:00:00Z",
  };
  const targetB = {
    start: "2035-04-01T13:00:00Z",
    end: "2035-04-01T14:00:00Z",
  };
  const { ownerId: appointmentId } = await createOwnedCapacity(
    pool,
    businessId,
    "booking",
    original,
  );
  const first = await pool.connect();
  const second = await pool.connect();
  const observer = await pool.connect();

  try {
    const secondPid = await backendPid(second);
    await first.query("begin");
    await second.query("begin");
    await first.query(
      "select id from app_private.business where id = $1 for share",
      [businessId],
    );
    await second.query(
      "select id from app_private.business where id = $1 for share",
      [businessId],
    );
    const firstLocked = await first.query<{ version: number }>(`
      select version
      from app_private.appointment
      where id = $1
      for update
    `, [appointmentId]);
    assert.equal(firstLocked.rows[0]?.version, 1);

    const secondLockPromise = second.query<{ version: number }>(`
      select version
      from app_private.appointment
      where id = $1
      for update
    `, [appointmentId]);
    const waitEvidence = await waitForBackendLock(observer, secondPid);

    await first.query(`
      update app_private.schedule_occupancy
      set occupied_period = tstzrange($2::timestamptz, $3::timestamptz, '[)')
      where appointment_id = $1
    `, [appointmentId, targetA.start, targetA.end]);
    await first.query(`
      update app_private.appointment
      set scheduled_start_at = $2,
          scheduled_end_at = $3,
          occupied_start_at = $2,
          occupied_end_at = $3,
          version = version + 1
      where id = $1 and version = 1
    `, [appointmentId, targetA.start, targetA.end]);
    await first.query("commit");

    const secondLocked = await secondLockPromise;
    const observedVersion = secondLocked.rows[0]!.version;
    assert.equal(observedVersion, 2);
    await second.query("rollback");

    const final = await pool.query<{
      version: number;
      scheduled_start_at: Date;
      occupied_start_at: Date;
    }>(`
      select
        a.version,
        a.scheduled_start_at,
        lower(o.occupied_period) as occupied_start_at
      from app_private.appointment a
      join app_private.schedule_occupancy o
        on o.appointment_id = a.id
      where a.id = $1
    `, [appointmentId]);
    assert.equal(final.rows[0]?.version, 2);
    assert.equal(
      final.rows[0]?.scheduled_start_at.toISOString(),
      normalizeInstant(targetA.start),
    );
    assert.equal(
      final.rows[0]?.occupied_start_at.toISOString(),
      normalizeInstant(targetA.start),
    );
    assert.notEqual(
      final.rows[0]?.scheduled_start_at.toISOString(),
      normalizeInstant(targetB.start),
    );

    return {
      result: "PASS",
      winner: { expectedVersion: 1, resultingVersion: 2, target: targetA },
      loser: {
        result: "VERSION_CONFLICT",
        expectedVersion: 1,
        observedVersion,
        target: targetB,
      },
      deterministicWait: waitEvidence,
      final: {
        version: final.rows[0]?.version,
        scheduledStartAt: final.rows[0]?.scheduled_start_at.toISOString(),
        occupancyStartAt: final.rows[0]?.occupied_start_at.toISOString(),
      },
      connectionRecovery: {
        first: await assertConnectionReusable(first, "reschedule-first"),
        second: await assertConnectionReusable(second, "reschedule-second"),
      },
    };
  } finally {
    await rollback(first);
    await rollback(second);
    observer.release();
    second.release();
    first.release();
  }
}

export async function runFailedReschedulePreservesOld(pool: Pool) {
  const businessId = await createBusiness(pool);
  const oldPeriod = {
    start: "2035-05-01T09:00:00Z",
    end: "2035-05-01T10:00:00Z",
  };
  const occupiedTarget = {
    start: "2035-05-01T12:00:00Z",
    end: "2035-05-01T13:00:00Z",
  };
  const conflictingTarget = {
    start: "2035-05-01T12:30:00Z",
    end: "2035-05-01T13:30:00Z",
  };
  const { ownerId: movingAppointmentId } = await createOwnedCapacity(
    pool,
    businessId,
    "booking",
    oldPeriod,
  );
  await createOwnedCapacity(pool, businessId, "booking", occupiedTarget);
  const client = await pool.connect();
  let sqlstate: string | undefined;
  let constraint: string | undefined;

  try {
    try {
      await client.query("begin");
      await client.query(
        "select id from app_private.business where id = $1 for share",
        [businessId],
      );
      await client.query(
        "select id from app_private.appointment where id = $1 for update",
        [movingAppointmentId],
      );
      await client.query(`
        update app_private.schedule_occupancy
        set occupied_period = tstzrange($2::timestamptz, $3::timestamptz, '[)')
        where appointment_id = $1
      `, [movingAppointmentId, conflictingTarget.start, conflictingTarget.end]);
      await client.query(`
        update app_private.appointment
        set scheduled_start_at = $2,
            scheduled_end_at = $3,
            occupied_start_at = $2,
            occupied_end_at = $3,
            version = version + 1
        where id = $1
      `, [movingAppointmentId, conflictingTarget.start, conflictingTarget.end]);
      await client.query("commit");
      assert.fail("Conflicting reschedule should fail");
    } catch (error) {
      const detail = postgresError(error);
      sqlstate = detail.code;
      constraint = detail.constraint;
      await rollback(client);
    }

    assert.equal(sqlstate, "23P01");
    assert.equal(constraint, "schedule_occupancy_no_overlap");
    const final = await client.query<{
      version: number;
      scheduled_start_at: Date;
      scheduled_end_at: Date;
      occupied_start_at: Date;
      occupied_end_at: Date;
    }>(`
      select
        a.version,
        a.scheduled_start_at,
        a.scheduled_end_at,
        lower(o.occupied_period) as occupied_start_at,
        upper(o.occupied_period) as occupied_end_at
      from app_private.appointment a
      join app_private.schedule_occupancy o
        on o.appointment_id = a.id
      where a.id = $1
    `, [movingAppointmentId]);
    const row = final.rows[0]!;
    assert.equal(row.version, 1);
    assert.equal(
      row.scheduled_start_at.toISOString(),
      normalizeInstant(oldPeriod.start),
    );
    assert.equal(
      row.scheduled_end_at.toISOString(),
      normalizeInstant(oldPeriod.end),
    );
    assert.equal(
      row.occupied_start_at.toISOString(),
      normalizeInstant(oldPeriod.start),
    );
    assert.equal(
      row.occupied_end_at.toISOString(),
      normalizeInstant(oldPeriod.end),
    );

    return {
      result: "PASS",
      sqlstate,
      constraint,
      originalOccupancyPreserved: true,
      appointmentVersionPreserved: row.version,
      connectionReusable: await assertConnectionReusable(
        client,
        "failed-reschedule",
      ),
    };
  } finally {
    await rollback(client);
    client.release();
  }
}

export async function runRangeScopeAndRelease(pool: Pool) {
  const businessA = await createBusiness(pool);
  const businessB = await createBusiness(pool);
  const first = {
    start: "2035-06-01T10:00:00Z",
    end: "2035-06-01T11:00:00Z",
  };
  const adjacent = {
    start: "2035-06-01T11:00:00Z",
    end: "2035-06-01T12:00:00Z",
  };
  await createOwnedCapacity(pool, businessA, "booking", first);
  await createOwnedCapacity(pool, businessA, "booking", adjacent);
  await createOwnedCapacity(pool, businessB, "booking", first);

  const releasePeriod = {
    start: "2035-06-01T14:00:00Z",
    end: "2035-06-01T15:00:00Z",
  };
  const { ownerId: originalId } = await createOwnedCapacity(
    pool,
    businessA,
    "booking",
    releasePeriod,
  );
  const client = await pool.connect();
  let conflictSqlstate: string | undefined;
  try {
    const conflictingId = randomUUID();
    try {
      await client.query("begin");
      await insertAppointment(
        client,
        businessA,
        conflictingId,
        releasePeriod,
      );
      await insertOccupancy(
        client,
        businessA,
        conflictingId,
        "booking",
        releasePeriod,
      );
      await client.query("commit");
      assert.fail("Active occupancy should conflict before release");
    } catch (error) {
      conflictSqlstate = postgresError(error).code;
      await rollback(client);
    }
    assert.equal(conflictSqlstate, "23P01");

    await client.query("begin");
    await client.query(`
      update app_private.appointment
      set status = 'CANCELLED', version = version + 1
      where id = $1
    `, [originalId]);
    await client.query(`
      update app_private.schedule_occupancy
      set released_at = clock_timestamp()
      where appointment_id = $1
    `, [originalId]);
    await client.query("commit");

    const replacement = await createOwnedCapacity(
      pool,
      businessA,
      "booking",
      releasePeriod,
    );
    const activeAtReleasedPeriod = await pool.query<{ count: number }>(`
      select count(*)::integer as count
      from app_private.schedule_occupancy
      where business_id = $1
        and released_at is null
        and occupied_period && tstzrange($2, $3, '[)')
    `, [businessA, releasePeriod.start, releasePeriod.end]);
    assert.equal(activeAtReleasedPeriod.rows[0]?.count, 1);

    return {
      result: "PASS",
      adjacentHalfOpen: true,
      sameRangeDifferentBusinesses: true,
      beforeReleaseConflictSqlstate: conflictSqlstate,
      releasedCapacityReused: true,
      replacementOwnerId: replacement.ownerId,
      activeOccupanciesAtReleasedPeriod: 1,
      connectionReusableAfterConflict: await assertConnectionReusable(
        client,
        "range-release",
      ),
    };
  } finally {
    await rollback(client);
    client.release();
  }
}

export async function runDeletionDefense(pool: Pool) {
  const businessId = await createBusiness(pool);
  const period = {
    start: "2035-07-01T10:00:00Z",
    end: "2035-07-01T11:00:00Z",
  };
  const { ownerId, occupancyId } = await createOwnedCapacity(
    pool,
    businessId,
    "booking",
    period,
  );
  const client = await pool.connect();
  let runtimeSqlstate: string | undefined;
  let triggerSqlstate: string | undefined;
  let triggerConstraint: string | undefined;
  const transientReplacementId = randomUUID();

  try {
    await client.query("set role spk001_runtime");
    try {
      await client.query("begin");
      await client.query(
        "delete from app_private.schedule_occupancy where id = $1",
        [occupancyId],
      );
      await client.query("commit");
      assert.fail("Runtime role should not delete occupancy");
    } catch (error) {
      runtimeSqlstate = postgresError(error).code;
      await rollback(client);
    } finally {
      await client.query("reset role");
    }
    assert.equal(runtimeSqlstate, "42501");
    const runtimeConnectionReusable = await assertConnectionReusable(
      client,
      "delete-runtime",
    );

    let capacityReopenedInsideUncommittedDelete = false;
    try {
      await client.query("begin");
      await client.query(
        "delete from app_private.schedule_occupancy where id = $1",
        [occupancyId],
      );
      await insertAppointment(
        client,
        businessId,
        transientReplacementId,
        period,
      );
      await insertOccupancy(
        client,
        businessId,
        transientReplacementId,
        "booking",
        period,
      );
      capacityReopenedInsideUncommittedDelete = true;
      await client.query("commit");
      assert.fail("Deferred owner guard should reject active occupancy deletion");
    } catch (error) {
      const detail = postgresError(error);
      triggerSqlstate = detail.code;
      triggerConstraint = detail.constraint;
      await rollback(client);
    }
    assert.equal(capacityReopenedInsideUncommittedDelete, true);
    assert.equal(triggerSqlstate, "23514");
    assert.equal(triggerConstraint, "schedule_occupancy_owner_required");

    const afterRejectedDelete = await client.query<{
      original_count: number;
      replacement_count: number;
    }>(`
      select
        count(*) filter (where id = $1)::integer as original_count,
        count(*) filter (where appointment_id = $2)::integer as replacement_count
      from app_private.schedule_occupancy
    `, [occupancyId, transientReplacementId]);
    assert.equal(afterRejectedDelete.rows[0]?.original_count, 1);
    assert.equal(afterRejectedDelete.rows[0]?.replacement_count, 0);
    const privilegedConnectionReusable = await assertConnectionReusable(
      client,
      "delete-trigger",
    );

    await client.query("begin");
    await client.query(`
      update app_private.appointment
      set status = 'CANCELLED', version = version + 1
      where id = $1
    `, [ownerId]);
    await client.query(`
      update app_private.schedule_occupancy
      set released_at = clock_timestamp()
      where id = $1
    `, [occupancyId]);
    await client.query("commit");
    await client.query("begin");
    await client.query(
      "delete from app_private.schedule_occupancy where id = $1",
      [occupancyId],
    );
    await client.query("commit");
    const releasedDeleted = await client.query<{ count: number }>(`
      select count(*)::integer as count
      from app_private.schedule_occupancy
      where id = $1
    `, [occupancyId]);
    assert.equal(releasedDeleted.rows[0]?.count, 0);

    return {
      result: "PASS",
      runtimeDelete: {
        rejected: true,
        sqlstate: runtimeSqlstate,
        connectionReusable: runtimeConnectionReusable,
      },
      privilegedActiveDelete: {
        deleteStatementInitiallyExecuted: true,
        capacityReopenedInsideTransaction: capacityReopenedInsideUncommittedDelete,
        commitRejected: true,
        sqlstate: triggerSqlstate,
        constraint: triggerConstraint,
        rollbackRestoredOriginal: true,
        connectionReusable: privilegedConnectionReusable,
      },
      privilegedReleasedHistoryDelete: {
        allowedByIntegrityTrigger: true,
        runtimeStillHasNoDeletePrivilege: true,
      },
      conclusion:
        "REVOKE DELETE is necessary but not sufficient for privileged paths; the deferred owner-integrity trigger is required. A second BEFORE DELETE trigger is not required for committed integrity.",
    };
  } finally {
    await rollback(client);
    await client.query("reset role").catch(() => undefined);
    client.release();
  }
}

export async function runGlobalLockOrder(pool: Pool) {
  const businessId = await createBusiness(pool);
  const period = {
    start: "2035-08-01T10:00:00Z",
    end: "2035-08-01T11:00:00Z",
  };
  const { ownerId: appointmentId } = await createOwnedCapacity(
    pool,
    businessId,
    "booking",
    period,
  );
  const configuration = await pool.connect();
  const reschedule = await pool.connect();
  const observer = await pool.connect();

  try {
    const reschedulePid = await backendPid(reschedule);
    const configurationOrder: string[] = [];
    const rescheduleOrder: string[] = [];
    await configuration.query("begin");
    await configuration.query(
      "select id from app_private.business where id = $1 for update",
      [businessId],
    );
    configurationOrder.push("availability/configuration");
    await configuration.query(
      "select id from app_private.appointment where id = $1 for update",
      [appointmentId],
    );
    configurationOrder.push("appointment");

    await reschedule.query("begin");
    const availabilityLock = reschedule.query(
      "select id from app_private.business where id = $1 for share",
      [businessId],
    );
    const waitEvidence = await waitForBackendLock(observer, reschedulePid);
    await configuration.query(`
      update app_private.business
      set availability_version = availability_version + 1
      where id = $1
    `, [businessId]);
    await configuration.query("commit");

    await availabilityLock;
    rescheduleOrder.push("availability/configuration");
    await reschedule.query(
      "select id from app_private.appointment where id = $1 for update",
      [appointmentId],
    );
    rescheduleOrder.push("appointment");
    await reschedule.query("rollback");

    assert.deepEqual(configurationOrder, [
      "availability/configuration",
      "appointment",
    ]);
    assert.deepEqual(rescheduleOrder, [
      "availability/configuration",
      "appointment",
    ]);

    return {
      result: "PASS",
      deadlock: false,
      configurationOrder,
      rescheduleOrder,
      deterministicWait: waitEvidence,
      connectionRecovery: {
        configuration: await assertConnectionReusable(
          configuration,
          "lock-order-configuration",
        ),
        reschedule: await assertConnectionReusable(
          reschedule,
          "lock-order-reschedule",
        ),
      },
    };
  } finally {
    await rollback(configuration);
    await rollback(reschedule);
    observer.release();
    reschedule.release();
    configuration.release();
  }
}

async function runDeadlockStep(
  client: PoolClient,
  label: string,
  sql: string,
  values: readonly unknown[],
) {
  try {
    await client.query(sql, [...values]);
    return { label, status: "SURVIVED" as const };
  } catch (error) {
    const detail = postgresError(error);
    await rollback(client);
    return {
      label,
      status: "DEADLOCK_VICTIM" as const,
      sqlstate: detail.code,
      constraint: detail.constraint,
    };
  }
}

async function finishDeadlockPair(
  first: PoolClient,
  second: PoolClient,
  outcomes: Array<{
    label: string;
    status: "SURVIVED" | "DEADLOCK_VICTIM";
    sqlstate?: string;
  }>,
) {
  const victims = outcomes.filter((item) => item.status === "DEADLOCK_VICTIM");
  assert.equal(victims.length, 1);
  assert.equal(victims[0]?.sqlstate, "40P01");
  const firstOutcome = outcomes.find((item) => item.label.endsWith("first"));
  const secondOutcome = outcomes.find((item) => item.label.endsWith("second"));
  if (firstOutcome?.status === "SURVIVED") {
    await first.query("commit");
  }
  if (secondOutcome?.status === "SURVIVED") {
    await second.query("commit");
  }
  return {
    victims: 1,
    sqlstate: victims[0]?.sqlstate,
    outcomes,
    connectionRecovery: {
      first: await assertConnectionReusable(first, "deadlock-first"),
      second: await assertConnectionReusable(second, "deadlock-second"),
    },
  };
}

export async function runDeliberateDeadlocks(pool: Pool) {
  const businessId = await createBusiness(pool);
  const firstAppointment = await createOwnedCapacity(
    pool,
    businessId,
    "booking",
    { start: "2035-09-01T10:00:00Z", end: "2035-09-01T11:00:00Z" },
  );
  const secondAppointment = await createOwnedCapacity(
    pool,
    businessId,
    "booking",
    { start: "2035-09-01T12:00:00Z", end: "2035-09-01T13:00:00Z" },
  );
  const first = await pool.connect();
  const second = await pool.connect();

  try {
    await first.query("begin");
    await second.query("begin");
    await first.query("set local deadlock_timeout = '100ms'");
    await second.query("set local deadlock_timeout = '100ms'");
    await first.query(
      "select id from app_private.appointment where id = $1 for update",
      [firstAppointment.ownerId],
    );
    await second.query(
      "select id from app_private.appointment where id = $1 for update",
      [secondAppointment.ownerId],
    );
    const genericOutcomes = await Promise.all([
      runDeadlockStep(
        first,
        "generic-first",
        "select id from app_private.appointment where id = $1 for update",
        [secondAppointment.ownerId],
      ),
      runDeadlockStep(
        second,
        "generic-second",
        "select id from app_private.appointment where id = $1 for update",
        [firstAppointment.ownerId],
      ),
    ]);
    const generic = await finishDeadlockPair(
      first,
      second,
      genericOutcomes,
    );

    await first.query("begin");
    await second.query("begin");
    await first.query("set local deadlock_timeout = '100ms'");
    await second.query("set local deadlock_timeout = '100ms'");
    await first.query(
      "select id from app_private.appointment where id = $1 for update",
      [firstAppointment.ownerId],
    );
    await second.query(
      "select id from app_private.business where id = $1 for update",
      [businessId],
    );
    const inversionOutcomes = await Promise.all([
      runDeadlockStep(
        first,
        "inversion-first",
        "select id from app_private.business where id = $1 for update",
        [businessId],
      ),
      runDeadlockStep(
        second,
        "inversion-second",
        "select id from app_private.appointment where id = $1 for update",
        [firstAppointment.ownerId],
      ),
    ]);
    const inversion = await finishDeadlockPair(
      first,
      second,
      inversionOutcomes,
    );

    return {
      result: "PASS",
      deadlockTimeout: "100ms",
      genericTwoAppointmentCycle: generic,
      globalOrderInversion: {
        ...inversion,
        badOrder: ["appointment", "availability/configuration"],
        requiredOrder: ["availability/configuration", "appointment"],
      },
    };
  } finally {
    await rollback(first);
    await rollback(second);
    second.release();
    first.release();
  }
}

async function relationSizes(pool: Pool) {
  const result = await pool.query<{
    table_bytes: string;
    table_total_bytes: string;
    gist_bytes: string;
  }>(`
    select
      pg_relation_size('app_private.schedule_occupancy')::bigint::text as table_bytes,
      pg_total_relation_size('app_private.schedule_occupancy')::bigint::text as table_total_bytes,
      pg_relation_size('app_private.schedule_occupancy_no_overlap')::bigint::text as gist_bytes
  `);
  const row = result.rows[0]!;
  return {
    tableBytes: Number(row.table_bytes),
    tableTotalBytes: Number(row.table_total_bytes),
    gistBytes: Number(row.gist_bytes),
  };
}

async function insertHistoricalBatch(
  pool: Pool,
  businessId: string,
  kind: "released-cancelled" | "retained-completed",
  rows: number,
) {
  const client = await pool.connect();
  const started = performance.now();
  const prefix = `spk001-${kind}-`;
  const releasedAt = kind === "released-cancelled"
    ? "2010-01-01T00:00:00Z"
    : null;
  const status = kind === "released-cancelled" ? "CANCELLED" : "COMPLETED";
  try {
    await client.query("begin");
    await client.query(`
      with generated as (
        select
          g,
          md5($3 || g::text)::uuid as appointment_id,
          timestamptz '2000-01-01T00:00:00Z'
            + g * interval '2 hours' as start_at
        from generate_series(1, $2::integer) as g
      )
      insert into app_private.appointment (
        id,
        business_id,
        status,
        scheduled_start_at,
        scheduled_end_at,
        occupied_start_at,
        occupied_end_at
      )
      select
        appointment_id,
        $1,
        $4,
        start_at,
        start_at + interval '1 hour',
        start_at,
        start_at + interval '1 hour'
      from generated
    `, [businessId, rows, prefix, status]);
    await client.query(`
      with generated as (
        select
          g,
          md5($3 || g::text)::uuid as appointment_id,
          md5($4 || g::text)::uuid as occupancy_id,
          timestamptz '2000-01-01T00:00:00Z'
            + g * interval '2 hours' as start_at
        from generate_series(1, $2::integer) as g
      )
      insert into app_private.schedule_occupancy (
        id,
        business_id,
        appointment_id,
        occupied_period,
        released_at
      )
      select
        occupancy_id,
        $1,
        appointment_id,
        tstzrange(start_at, start_at + interval '1 hour', '[)'),
        $5
      from generated
    `, [businessId, rows, prefix, `${prefix}occupancy-`, releasedAt]);
    await client.query("commit");
    return Math.round((performance.now() - started) * 100) / 100;
  } catch (error) {
    await rollback(client);
    throw error;
  } finally {
    client.release();
  }
}

function collectPlanNodes(plan: Record<string, unknown>) {
  const nodes: Array<Record<string, unknown>> = [];
  const visit = (node: Record<string, unknown>) => {
    nodes.push({
      nodeType: node["Node Type"],
      indexName: node["Index Name"],
      actualRows: node["Actual Rows"],
      actualTotalTimeMs: node["Actual Total Time"],
      sharedHitBlocks: node["Shared Hit Blocks"],
      sharedReadBlocks: node["Shared Read Blocks"],
    });
    const children = node.Plans;
    if (Array.isArray(children)) {
      for (const child of children) {
        visit(child as Record<string, unknown>);
      }
    }
  };
  visit(plan);
  return nodes;
}

export async function runVolumeAndGist(pool: Pool) {
  const businessId = await createBusiness(pool);
  const before = await relationSizes(pool);
  const releasedInsertMs = await insertHistoricalBatch(
    pool,
    businessId,
    "released-cancelled",
    HISTORY_ROWS_PER_CLASS,
  );
  const afterReleased = await relationSizes(pool);
  const retainedInsertMs = await insertHistoricalBatch(
    pool,
    businessId,
    "retained-completed",
    HISTORY_ROWS_PER_CLASS,
  );
  await pool.query("analyze app_private.schedule_occupancy");
  const afterRetained = await relationSizes(pool);
  const releasedGistGrowth = afterReleased.gistBytes - before.gistBytes;
  const retainedGistGrowth = afterRetained.gistBytes - afterReleased.gistBytes;
  assert.ok(releasedGistGrowth <= 8_192);
  assert.ok(retainedGistGrowth > releasedGistGrowth);

  const counts = await pool.query<{
    total: number;
    released: number;
    retained: number;
  }>(`
    select
      count(*)::integer as total,
      count(*) filter (where released_at is not null)::integer as released,
      count(*) filter (where released_at is null)::integer as retained
    from app_private.schedule_occupancy
    where business_id = $1
  `, [businessId]);
  assert.deepEqual(counts.rows[0], {
    total: HISTORY_ROWS_PER_CLASS * 2,
    released: HISTORY_ROWS_PER_CLASS,
    retained: HISTORY_ROWS_PER_CLASS,
  });

  const explain = await pool.query<{ "QUERY PLAN": unknown }>(`
    explain (analyze, buffers, format json)
    select id
    from app_private.schedule_occupancy
    where business_id = $1
      and released_at is null
      and occupied_period && tstzrange(
        '2000-01-01T02:15:00Z'::timestamptz,
        '2000-01-01T02:30:00Z'::timestamptz,
        '[)'
      )
  `, [businessId]);
  const envelope = (explain.rows[0]!["QUERY PLAN"] as Array<{
    Plan: Record<string, unknown>;
    "Planning Time": number;
    "Execution Time": number;
  }>)[0]!;
  const planNodes = collectPlanNodes(envelope.Plan);
  assert.ok(
    planNodes.some(
      (node) => node.indexName === "schedule_occupancy_no_overlap",
    ),
    "Expected the overlap probe to use the partial GiST index",
  );

  return {
    result: "PASS",
    rowsPerHistoryClass: HISTORY_ROWS_PER_CLASS,
    totalRowsForVolumeBusiness: counts.rows[0]?.total,
    classes: {
      releasedCancelled: counts.rows[0]?.released,
      retainedCompleted: counts.rows[0]?.retained,
    },
    insertDurationMs: {
      releasedCancelled: releasedInsertMs,
      retainedCompleted: retainedInsertMs,
    },
    sizes: { before, afterReleased, afterRetained },
    gistGrowthBytes: {
      releasedCancelled: releasedGistGrowth,
      retainedCompleted: retainedGistGrowth,
    },
    partialIndexFinding:
      "released_at IS NOT NULL rows stayed outside the partial GiST; completed history with released_at IS NULL grew the GiST",
    overlapProbePlan: {
      planningTimeMs: envelope["Planning Time"],
      executionTimeMs: envelope["Execution Time"],
      nodes: planNodes,
    },
  };
}

export async function runAllScenarios(pool: Pool) {
  return {
    ownerIntegrity: await runOwnerIntegrity(pool),
    bookingVsBooking: await runBookingVsBooking(pool),
    bookingVsBlock: await runBookingVsBlock(pool),
    rescheduleVsReschedule: await runConcurrentReschedule(pool),
    failedRescheduleAtomicity: await runFailedReschedulePreservesOld(pool),
    rangeScopeAndRelease: await runRangeScopeAndRelease(pool),
    deletionDefense: await runDeletionDefense(pool),
    globalLockOrder: await runGlobalLockOrder(pool),
    deliberateDeadlocks: await runDeliberateDeadlocks(pool),
    volumeAndGist: await runVolumeAndGist(pool),
  };
}
