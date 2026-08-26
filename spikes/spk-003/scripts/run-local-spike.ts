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
import { runDatabaseScenarios } from "./lib/db-scenarios.js";

const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(spikeRoot, "sql", "schema.sql");
const browserEvidencePath = path.join(spikeRoot, "evidence", "SPK-003_BROWSER_EVIDENCE.json");
const mounted = mountAsciiWorkspacePath(spikeRoot);
const port = await findFreeTcpPort();
const { instance, databaseDir } = createEmbeddedPostgres(mounted.runtimeRoot, port);
const connectionString = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
let pool: Pool | undefined;
let started = false;

try {
  const browserEvidence = JSON.parse(await readFile(browserEvidencePath, "utf8")) as {
    result: string;
    rawSecretLeakAudit: { evidenceContainsRawToken: boolean };
  };
  assert.equal(browserEvidence.result, "PASS");
  assert.equal(browserEvidence.rawSecretLeakAudit.evidenceContainsRawToken, false);

  await instance.initialise();
  await instance.start();
  started = true;
  pool = new Pool({
    connectionString,
    max: 12,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });
  const schemaSql = await readFile(schemaPath, "utf8");
  await pool.query(schemaSql);
  const database = await runDatabaseScenarios(pool);
  const connectionProbe = await pool.query<{ value: number }>("select 1 as value");
  assert.equal(connectionProbe.rows[0]?.value, 1);
  const poolBeforeClose = {
    configuredMax: 12,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
  assert.equal(pool.waitingCount, 0);

  const evidence = {
    result: "PASS",
    generatedAt: new Date().toISOString(),
    scope: "SPK-003 only; disposable local PostgreSQL and browser laboratory",
    environment: {
      platform: `${os.platform()} ${os.release()}`,
      architecture: os.arch(),
      node: process.version,
      openssl: process.versions.openssl,
      postgres: database.schema.postgres,
      hostedSupabaseUsed: false,
      hostedSupabaseReason: "No required guarantee is specific to the managed environment; real PostgreSQL and a real browser exercise the mechanisms under test.",
      clocks: "fixed injected instants for domain/TTL tests; wall clock only for evidence timestamp and browser cookie lifetime",
    },
    schema: {
      source: "sql/schema.sql",
      sha256: createHash("sha256").update(schemaSql).digest("hex"),
    },
    database,
    browser: browserEvidence,
    connectionLifecycle: {
      probeAfterHandledErrors: connectionProbe.rows[0]?.value === 1,
      poolBeforeClose,
    },
  };
  const serialized = JSON.stringify(evidence, null, 2);
  assert.equal(serialized.includes("SIMULATED_SECRET_SENTINEL"), false);
  const evidencePath = path.join(spikeRoot, "evidence", "SPK-003_LOCAL_EVIDENCE.json");
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${serialized}\n`, "utf8");
  console.log(JSON.stringify({
    result: evidence.result,
    postgres: evidence.environment.postgres,
    browser: browserEvidence.result,
    tokenLifecycle: database.basicTokenLifecycle.successfulRotation,
    idempotency: database.idempotency.concurrentSameKeyAndFingerprint,
    uncertainResponse: database.responseEnvelope.uncertainCommitResponse,
    evidencePath: path.relative(spikeRoot, evidencePath),
  }, null, 2));
} finally {
  await pool?.end().catch(() => undefined);
  if (started) await stopEmbeddedPostgres(instance, databaseDir);
  mounted.unmount();
}
