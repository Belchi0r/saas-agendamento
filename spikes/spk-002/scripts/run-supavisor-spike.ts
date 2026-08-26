import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import { assertDrizzleMigrationColumnParity } from "./lib/drift-check.js";
import { runDatabaseExperiments } from "./lib/experiments.js";
import { snapshotManagedSchemas } from "./lib/snapshots.js";
import { applyMigrationsWithSupabaseCli } from "./lib/supabase-cli.js";

assert.equal(
  process.env.SPK002_ALLOW_REMOTE_TESTS,
  "1",
  "Set SPK002_ALLOW_REMOTE_TESTS=1 only for an explicitly disposable hosted project",
);
assert.match(
  process.env.SPK002_ENVIRONMENT_LABEL ?? "",
  /(spike|test|dev|disposable|descart)/i,
  "SPK002_ENVIRONMENT_LABEL must identify a disposable/test/dev environment",
);
const directUrl = requiredEnvironmentVariable("DIRECT_DATABASE_URL");
const supavisorUrl = requiredEnvironmentVariable("SUPAVISOR_DATABASE_URL");
assert.notEqual(
  directUrl,
  supavisorUrl,
  "DDL and Supavisor runtime URLs must be distinct",
);

const spikeRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const directPool = new Pool({
  connectionString: directUrl,
  max: 1,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

try {
  const managedBefore = await snapshotManagedSchemas(directPool);
  assert.deepEqual(
    managedBefore.schemas.map((schema) => (schema as { schema_name: string }).schema_name),
    ["auth", "storage"],
    "The hosted project must expose real auth and storage schemas before the test",
  );
  const migration = await applyMigrationsWithSupabaseCli(spikeRoot, directUrl);
  const managedAfter = await snapshotManagedSchemas(directPool);
  assert.deepEqual(
    managedAfter,
    managedBefore,
    "Hosted auth/storage metadata changed after application migrations",
  );
  const drift = await assertDrizzleMigrationColumnParity(directPool);
  const runtime = await runDatabaseExperiments(
    supavisorUrl,
    "supavisor-transaction",
  );
  const evidence = {
    result: "HOSTED_SUPAVISOR_PASS",
    generatedAt: new Date().toISOString(),
    environmentLabel: process.env.SPK002_ENVIRONMENT_LABEL,
    migration: {
      command: migration.command,
      stdout: migration.stdout.trim(),
      stderr: migration.stderr.trim(),
    },
    managedBefore,
    managedAfter,
    authStorageUnchanged: true,
    drift,
    runtime,
  };
  const evidenceDirectory = path.join(spikeRoot, "evidence");
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    path.join(evidenceDirectory, "SPK-002_SUPAVISOR_EVIDENCE.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await directPool.end();
}

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name];
  assert.ok(value, `${name} is required`);
  return value;
}
