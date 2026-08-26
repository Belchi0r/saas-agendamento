import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import {
  createEmbeddedPostgres,
  findFreeTcpPort,
  mountAsciiWorkspacePath,
  stopEmbeddedPostgres,
} from "./lib/embedded-db.js";
import { runAllScenarios } from "./lib/scenarios.js";
import { applyMigrationsWithSupabaseCli } from "./lib/supabase-cli.js";

const spikeRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationPath = path.join(
  spikeRoot,
  "supabase",
  "migrations",
  "20260822210000_spk001_booking_concurrency_lab.sql",
);
const mounted = mountAsciiWorkspacePath(spikeRoot);
const port = await findFreeTcpPort();
const { instance, databaseDir } = createEmbeddedPostgres(
  mounted.runtimeRoot,
  port,
);
const databaseUrl =
  `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
let pool: Pool | undefined;
let poolClosed = false;
let started = false;

try {
  await instance.initialise();
  await instance.start();
  started = true;
  const migration = await applyMigrationsWithSupabaseCli(
    spikeRoot,
    databaseUrl,
  );
  pool = new Pool({
    connectionString: databaseUrl,
    max: 12,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });

  const migrationHistory = await pool.query<{
    version: string;
    name: string;
  }>(`
    select version, name
    from supabase_migrations.schema_migrations
    order by version
  `);
  assert.deepEqual(migrationHistory.rows, [
    { version: "20260822210000", name: "spk001_booking_concurrency_lab" },
  ]);

  const schemaEvidence = await inspectSchema(pool);
  const scenarios = await runAllScenarios(pool);
  const sqlstates = {
    exclusionViolation: "23P01",
    ownerIntegrityCheck: "23514",
    insufficientPrivilege: "42501",
    deadlockDetected: "40P01",
  };
  assert.equal(
    scenarios.bookingVsBooking.outcomes.some(
      (item) => item.status === "CONFLICT" && item.sqlstate === "23P01",
    ),
    true,
  );
  assert.equal(
    scenarios.deletionDefense.runtimeDelete.sqlstate,
    sqlstates.insufficientPrivilege,
  );
  assert.equal(
    scenarios.deliberateDeadlocks.globalOrderInversion.sqlstate,
    sqlstates.deadlockDetected,
  );

  const beforeClose = {
    configuredMax: 12,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
  assert.ok(pool.totalCount <= 12);
  assert.equal(pool.waitingCount, 0);
  await pool.end();
  poolClosed = true;
  let queryRejectedAfterClose = false;
  try {
    await pool.query("select 1");
  } catch {
    queryRejectedAfterClose = true;
  }
  assert.equal(queryRejectedAfterClose, true);

  const migrationSql = await readFile(migrationPath, "utf8");
  const evidence = {
    result: "LOCAL_POSTGRES_PASS",
    generatedAt: new Date().toISOString(),
    scope: "SPK-001 only; disposable PostgreSQL concurrency laboratory",
    environment: {
      platform: `${os.platform()} ${os.release()}`,
      architecture: os.arch(),
      node: process.version,
      postgres: schemaEvidence.versions.postgres,
      btreeGist: schemaEvidence.versions.btree_gist,
      synchronization:
        "in-process release barriers plus pg_stat_activity lock-wait observation; no arbitrary sleep controls correctness",
      deadlockDetection: "PostgreSQL deadlock detector with deadlock_timeout=100ms",
      windowsHarnessWorkaround:
        process.platform === "win32"
          ? "subst maps the same spike workspace to an ASCII drive path for initdb"
          : "not required",
    },
    migration: {
      authority: "Supabase CLI",
      command: migration.command,
      stdout: migration.stdout.trim(),
      stderr: migration.stderr.trim(),
      history: migrationHistory.rows,
      sha256: createHash("sha256").update(migrationSql).digest("hex"),
    },
    schemaEvidence,
    scenarios,
    sqlstates,
    poolLifecycle: {
      beforeClose,
      queryRejectedAfterClose,
    },
  };
  const evidenceDirectory = path.join(spikeRoot, "evidence");
  await mkdir(evidenceDirectory, { recursive: true });
  const evidencePath = path.join(
    evidenceDirectory,
    "SPK-001_LOCAL_EVIDENCE.json",
  );
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    result: evidence.result,
    generatedAt: evidence.generatedAt,
    postgres: evidence.environment.postgres,
    btreeGist: evidence.environment.btreeGist,
    scenarios: Object.fromEntries(
      Object.entries(scenarios).map(([name, value]) => [name, value.result]),
    ),
    sqlstates,
    volumeAndGist: scenarios.volumeAndGist,
    evidencePath: path.relative(spikeRoot, evidencePath),
  }, null, 2));
} finally {
  if (pool && !poolClosed) {
    await pool.end().catch(() => undefined);
  }
  if (started) {
    await stopEmbeddedPostgres(instance, databaseDir);
  }
  mounted.unmount();
}

async function inspectSchema(pool: Pool) {
  const versions = await pool.query<{
    postgres: string;
    btree_gist: string;
  }>(`
    select
      current_setting('server_version') as postgres,
      (select extversion from pg_extension where extname = 'btree_gist') as btree_gist
  `);
  const exclusion = await pool.query<{
    constraint_definition: string;
    index_definition: string;
  }>(`
    select
      pg_get_constraintdef(c.oid, true) as constraint_definition,
      pg_get_indexdef(i.indexrelid) as index_definition
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_index i on i.indexrelid = c.conindid
    where n.nspname = 'app_private'
      and t.relname = 'schedule_occupancy'
      and c.conname = 'schedule_occupancy_no_overlap'
  `);
  const triggers = await pool.query<{
    trigger_name: string;
    definition: string;
    deferrable: boolean;
    initially_deferred: boolean;
  }>(`
    select
      t.tgname as trigger_name,
      pg_get_triggerdef(t.oid, true) as definition,
      c.condeferrable as deferrable,
      c.condeferred as initially_deferred
    from pg_trigger t
    join pg_constraint c on c.oid = t.tgconstraint
    join pg_class r on r.oid = t.tgrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'app_private'
      and not t.tgisinternal
    order by t.tgname
  `);
  assert.equal(triggers.rows.length, 3);
  assert.equal(triggers.rows.every((row) => row.deferrable), true);
  assert.equal(triggers.rows.every((row) => row.initially_deferred), true);
  const privileges = await pool.query<{
    runtime_can_select: boolean;
    runtime_can_insert: boolean;
    runtime_can_update: boolean;
    runtime_can_delete: boolean;
  }>(`
    select
      has_table_privilege(
        'spk001_runtime',
        'app_private.schedule_occupancy',
        'SELECT'
      ) as runtime_can_select,
      has_table_privilege(
        'spk001_runtime',
        'app_private.schedule_occupancy',
        'INSERT'
      ) as runtime_can_insert,
      has_table_privilege(
        'spk001_runtime',
        'app_private.schedule_occupancy',
        'UPDATE'
      ) as runtime_can_update,
      has_table_privilege(
        'spk001_runtime',
        'app_private.schedule_occupancy',
        'DELETE'
      ) as runtime_can_delete
  `);
  assert.deepEqual(privileges.rows[0], {
    runtime_can_select: true,
    runtime_can_insert: true,
    runtime_can_update: true,
    runtime_can_delete: false,
  });
  assert.match(exclusion.rows[0]!.constraint_definition, /EXCLUDE USING gist/i);
  assert.match(exclusion.rows[0]!.constraint_definition, /occupied_period WITH &&/i);
  assert.match(exclusion.rows[0]!.constraint_definition, /released_at IS NULL/i);

  return {
    versions: versions.rows[0]!,
    exclusion: exclusion.rows[0]!,
    ownerIntegrityTriggers: triggers.rows,
    runtimePrivileges: privileges.rows[0]!,
  };
}

