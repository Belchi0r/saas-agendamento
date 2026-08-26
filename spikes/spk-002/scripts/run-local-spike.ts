import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool } from "pg";

import { createRuntimePool } from "../src/db/pool.js";
import { assertDrizzleMigrationColumnParity } from "./lib/drift-check.js";
import {
  createEmbeddedPostgres,
  findFreeTcpPort,
  mountAsciiWorkspacePath,
  stopEmbeddedPostgres,
} from "./lib/embedded-db.js";
import { runDatabaseExperiments } from "./lib/experiments.js";
import {
  applicationSchemaFingerprint,
  createLocalManagedSchemaSentinels,
  snapshotManagedSchemas,
} from "./lib/snapshots.js";
import { applyMigrationsWithSupabaseCli } from "./lib/supabase-cli.js";

const spikeRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const mounted = mountAsciiWorkspacePath(spikeRoot);

try {
  const cycleOne = await runCleanCycle(1, false);
  const cycleTwo = await runCleanCycle(2, true);
  assert.equal(
    cycleOne.schemaFingerprint.sha256,
    cycleTwo.schemaFingerprint.sha256,
    "The two from-zero schema fingerprints differ",
  );

  const evidence = {
    result: "LOCAL_PASS_HOSTED_BLOCKED",
    generatedAt: new Date().toISOString(),
    authority: "Supabase CLI migration up --db-url",
    windowsHarnessWorkaround:
      process.platform === "win32"
        ? "subst maps the same workspace to an ASCII drive path for initdb"
        : "not required",
    cycles: [cycleOne, cycleTwo],
    deterministicFingerprint: cycleOne.schemaFingerprint.sha256,
  };
  const evidenceDirectory = path.join(spikeRoot, "evidence");
  await mkdir(evidenceDirectory, { recursive: true });
  const evidencePath = path.join(
    evidenceDirectory,
    "SPK-002_LOCAL_EVIDENCE.json",
  );
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  mounted.unmount();
}

async function runCleanCycle(cycle: number, executeExperiments: boolean) {
  const port = await findFreeTcpPort();
  const { instance, databaseDir } = createEmbeddedPostgres(
    mounted.runtimeRoot,
    cycle,
    port,
  );
  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
  let pool: Pool | undefined;
  let poolClosed = false;
  let started = false;

  try {
    await instance.initialise();
    await instance.start();
    started = true;
    pool = createRuntimePool(databaseUrl);
    await createLocalManagedSchemaSentinels(pool);
    const managedBefore = await snapshotManagedSchemas(pool);

    const migration = await applyMigrationsWithSupabaseCli(
      spikeRoot,
      databaseUrl,
    );
    const managedAfter = await snapshotManagedSchemas(pool);
    assert.deepEqual(
      managedAfter,
      managedBefore,
      "auth/storage sentinel metadata changed after the application migration",
    );

    const migrationHistory = await pool.query<{
      version: string;
      name: string;
    }>(`
      select version, name
      from supabase_migrations.schema_migrations
      order by version
    `);
    assert.deepEqual(migrationHistory.rows, [
      { version: "20260822190000", name: "spk002_app_private_lab" },
    ]);

    const schemaFingerprint = await applicationSchemaFingerprint(pool);
    const drift = await assertDrizzleMigrationColumnParity(pool);
    const versions = await pool.query<{
      postgres: string;
      btree_gist: string;
    }>(`
      select
        current_setting('server_version') as postgres,
        (select extversion from pg_extension where extname = 'btree_gist') as btree_gist
    `);
    const isolation = await inspectIsolationFiles();

    await pool.end();
    poolClosed = true;
    const experiments = executeExperiments
      ? await runDatabaseExperiments(databaseUrl, "embedded-postgres")
      : "deferred-to-cycle-2";

    return {
      cycle,
      databaseDir: path.relative(mounted.runtimeRoot, databaseDir),
      migration: {
        command: migration.command,
        stdout: migration.stdout.trim(),
        stderr: migration.stderr.trim(),
      },
      migrationHistory: migrationHistory.rows,
      managedSchemasUnchanged: true,
      managedSchemaEvidenceKind:
        "controlled local sentinels; not a real Supabase Auth/Storage stack",
      managedBefore,
      managedAfter,
      schemaFingerprint,
      drift,
      versions: versions.rows[0],
      isolation,
      experiments,
    };
  } finally {
    if (pool && !poolClosed) {
      await pool.end().catch(() => undefined);
    }
    if (started) {
      await stopEmbeddedPostgres(instance, databaseDir);
    }
  }
}

async function inspectIsolationFiles() {
  const config = await readFile(
    path.join(spikeRoot, "drizzle.config.ts"),
    "utf8",
  );
  const migration = await readFile(
    path.join(
      spikeRoot,
      "supabase",
      "migrations",
      "20260822190000_spk002_app_private_lab.sql",
    ),
    "utf8",
  );
  const withoutSqlComments = migration.replace(/^\s*--.*$/gm, "");

  assert.match(config, /schemaFilter:\s*\["app_private"\]/);
  assert.doesNotMatch(withoutSqlComments, /\b(?:auth|storage)\s*\./i);

  return {
    drizzleSchemaFilter: ["app_private"],
    migrationTargetsAuthOrStorage: false,
  };
}
