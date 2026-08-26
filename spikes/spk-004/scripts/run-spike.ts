import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { confirmationTimeLabel } from "../src/browser/confirmation-view.js";
import {
  createConfirmationSnapshot,
  endAfterElapsedMinutes,
  halfOpenIntervalsOverlap,
  InvalidIanaTimeZoneError,
  reconstructInstantFromSnapshot,
  requireSlotInstant,
  resolveLocalDateTime,
  snapshotPresentation,
  Temporal,
  utcInterval,
  validateIanaTimeZone,
} from "../src/server/time-strategy.js";
import {
  changeBusinessTimezone,
  interpretRecurringRule,
  type AppointmentTimeRecord,
} from "../src/server/timezone-change.js";
import { runCaseMatrix } from "./case-matrix.js";

type Experiment = Readonly<{
  id: string;
  expected: string;
  observed: string;
  status: "PASS";
}>;

type ProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type NativeProbe = {
  availability: "UNAVAILABLE" | "EXPERIMENTAL_FLAG";
  globalType: string;
  namespaceKeys?: string[];
  vectors?: Record<string, Record<string, Record<string, unknown>>>;
};

const experiments: Experiment[] = [];

function record(id: string, expected: string, observed: string) {
  experiments.push(Object.freeze({ id, expected, observed, status: "PASS" }));
}

async function runProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: environment,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? -1, stdout, stderr });
    });
  });
}

async function runJsonProcess<T>(
  executable: string,
  args: readonly string[],
  cwd: string,
  environment?: NodeJS.ProcessEnv,
): Promise<T> {
  const result = await runProcess(executable, args, cwd, environment);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout) as T;
}

function temporalCandidate(
  input: string,
  disambiguation: "earlier" | "later" | "compatible" | "reject",
) {
  try {
    const zoned = Temporal.PlainDateTime.from(input).toZonedDateTime(
      "America/New_York",
      { disambiguation },
    );
    return {
      instantUtc: zoned.toInstant().toString(),
      localRoundTrip: zoned.toPlainDateTime().toString(),
      offset: zoned.offset,
    };
  } catch (error) {
    assert.ok(error instanceof Error);
    return { error: error.name, message: error.message };
  }
}

function polyfillNativeComparable() {
  return {
    availability: "POLYFILL_IMPORT" as const,
    globalType: typeof (globalThis as Record<string, unknown>).Temporal,
    namespaceKeys: Object.keys(Temporal),
    vectors: {
      gap: {
        earlier: temporalCandidate("2025-03-09T02:30", "earlier"),
        later: temporalCandidate("2025-03-09T02:30", "later"),
        compatible: temporalCandidate("2025-03-09T02:30", "compatible"),
        reject: temporalCandidate("2025-03-09T02:30", "reject"),
      },
      fold: {
        earlier: temporalCandidate("2025-11-02T01:30", "earlier"),
        later: temporalCandidate("2025-11-02T01:30", "later"),
        compatible: temporalCandidate("2025-11-02T01:30", "compatible"),
        reject: temporalCandidate("2025-11-02T01:30", "reject"),
      },
    },
  };
}

function semanticVectors(
  vectors: Record<string, Record<string, Record<string, unknown>>>,
) {
  return Object.fromEntries(
    Object.entries(vectors).map(([classification, modes]) => [
      classification,
      Object.fromEntries(Object.entries(modes).map(([mode, result]) => [
        mode,
        "error" in result
          ? { error: result.error }
          : {
              instantUtc: result.instantUtc,
              localRoundTrip: result.localRoundTrip,
              offset: result.offset,
            },
      ])),
    ]),
  );
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function makeAppointment(
  id: string,
  status: AppointmentTimeRecord["status"],
  localDate: string,
  localTime: string,
  timeZone: string,
): AppointmentTimeRecord {
  const resolution = requireSlotInstant(
    resolveLocalDateTime(localDate, localTime, timeZone),
  );
  return Object.freeze({
    id,
    status,
    ...createConfirmationSnapshot(resolution),
  });
}

async function main() {
  const spikeRoot = path.resolve(import.meta.dirname, "..");
  const evidenceDir = path.join(spikeRoot, "evidence");
  await mkdir(evidenceDir, { recursive: true });

  const polyfillPackage = JSON.parse(await readFile(
    path.join(
      spikeRoot,
      "node_modules",
      "@js-temporal",
      "polyfill",
      "package.json",
    ),
    "utf8",
  )) as { version: string };
  assert.equal(polyfillPackage.version, "0.5.1");

  const caseMatrix = runCaseMatrix();
  assert.equal(caseMatrix.length, 13);
  record(
    "deterministic-case-matrix",
    "All no-DST, DST, offset, midnight, month, and year vectors match fixed expectations",
    `${caseMatrix.length} case rows passed against tzdata ${process.versions.tz}`,
  );

  for (const [date, time, zone] of [
    ["2025-03-09", "02:30", "America/New_York"],
    ["2025-03-30", "02:30", "Europe/Berlin"],
  ] as const) {
    const nonexistent = resolveLocalDateTime(date, time, zone);
    assert.equal(nonexistent.kind, "NONEXISTENT");
    assert.equal(nonexistent.instantUtc, null);
    assert.throws(
      () => requireSlotInstant(nonexistent),
      /NONEXISTENT_LOCAL_TIME_DOES_NOT_GENERATE_SLOT/,
    );
  }
  record(
    "nonexistent-local-times",
    "Spring-forward gaps produce no slot and are never silently shifted",
    "New York and Berlin gaps returned NONEXISTENT, null instant, and explicit rejection",
  );

  const fold = requireSlotInstant(
    resolveLocalDateTime("2025-11-02", "01:30", "America/New_York"),
  );
  assert.equal(fold.kind, "AMBIGUOUS_FIRST");
  assert.equal(fold.instantUtc, "2025-11-02T05:30:00Z");
  assert.equal(fold.alternativeInstantUtc, "2025-11-02T06:30:00Z");
  assert.equal(
    Temporal.Instant.compare(
      Temporal.Instant.from(fold.instantUtc),
      Temporal.Instant.from(fold.alternativeInstantUtc),
    ),
    -1,
  );
  record(
    "ambiguous-first-occurrence",
    "Automatic generation selects the chronologically first occurrence",
    "New York 01:30 selected 05:30Z/-04:00 before alternative 06:30Z/-05:00",
  );

  const roundTrip = Temporal.Instant.from(fold.instantUtc)
    .toZonedDateTimeISO(fold.timeZone);
  assert.equal(roundTrip.toPlainDate().toString(), fold.localDate);
  assert.equal(
    roundTrip.toPlainTime().toString({ smallestUnit: "second" }),
    fold.localTime,
  );
  assert.equal(roundTrip.offset, fold.offset);
  record(
    "local-utc-local-round-trip",
    "The selected instant round-trips to the confirmed local date/time and offset",
    `${fold.localDate}T${fold.localTime}${fold.offset} -> ${fold.instantUtc} -> same local fields`,
  );

  const snapshot = createConfirmationSnapshot(fold);
  assert.equal(reconstructInstantFromSnapshot(snapshot), fold.instantUtc);
  assert.equal(confirmationTimeLabel(snapshot), snapshotPresentation(snapshot));
  assert.deepEqual(snapshot, {
    scheduledStartAtUtc: "2025-11-02T05:30:00Z",
    timezoneSnapshot: "America/New_York",
    localDateSnapshot: "2025-11-02",
    localTimeSnapshot: "01:30:00",
    utcOffsetMinutesSnapshot: -240,
  });
  record(
    "confirmation-snapshot",
    "UTC, IANA zone, local fields, and offset reconstruct the confirmed presentation",
    `${snapshotPresentation(snapshot)} reconstructs ${snapshot.scheduledStartAtUtc}`,
  );

  for (const invalid of ["Mars/Olympus", "+02:00", "", "Not A Zone"]) {
    assert.throws(
      () => validateIanaTimeZone(invalid),
      InvalidIanaTimeZoneError,
    );
  }
  assert.equal(validateIanaTimeZone("America/New_York"), "America/New_York");
  record(
    "iana-validation",
    "Invalid and fixed-offset identifiers are rejected; valid IANA zones are accepted",
    "Four invalid inputs rejected; America/New_York accepted",
  );

  const springDuration = endAfterElapsedMinutes(
    "2025-03-09T06:30:00Z",
    120,
    "America/New_York",
  );
  assert.deepEqual(springDuration, {
    startInstantUtc: "2025-03-09T06:30:00Z",
    endInstantUtc: "2025-03-09T08:30:00Z",
    elapsedMinutes: 120,
    endLocal: "2025-03-09T04:30:00-04:00[America/New_York]",
  });
  const fallDuration = endAfterElapsedMinutes(
    "2025-11-02T04:30:00Z",
    120,
    "America/New_York",
  );
  assert.deepEqual(fallDuration, {
    startInstantUtc: "2025-11-02T04:30:00Z",
    endInstantUtc: "2025-11-02T06:30:00Z",
    elapsedMinutes: 120,
    endLocal: "2025-11-02T01:30:00-05:00[America/New_York]",
  });
  record(
    "elapsed-duration-across-offset",
    "Service duration is elapsed minutes even when the wall-clock offset changes",
    "120 minutes stayed 120 across spring-forward and fall-back",
  );

  const intervalA = utcInterval(
    "2025-11-02T05:30:00Z",
    "2025-11-02T06:00:00Z",
  );
  const intervalB = utcInterval(
    "2025-11-02T06:00:00Z",
    "2025-11-02T06:30:00Z",
  );
  const intervalOverlap = utcInterval(
    "2025-11-02T05:59:00Z",
    "2025-11-02T06:01:00Z",
  );
  assert.equal(halfOpenIntervalsOverlap(intervalA, intervalB), false);
  assert.equal(halfOpenIntervalsOverlap(intervalA, intervalOverlap), true);
  record(
    "half-open-intervals",
    "Adjacent [) UTC intervals do not overlap, while a one-minute crossing does",
    "[05:30,06:00) and [06:00,06:30) were adjacent; [05:59,06:01) overlapped",
  );

  const business = Object.freeze({
    timezone: "America/New_York",
    availabilityVersion: 7,
  });
  const futureConfirmed = makeAppointment(
    "future-confirmed",
    "CONFIRMED",
    "2026-02-01",
    "09:00",
    business.timezone,
  );
  const blocked = changeBusinessTimezone(
    business,
    [futureConfirmed],
    "America/Los_Angeles",
    "2026-01-01T00:00:00Z",
  );
  assert.equal(blocked.outcome, "BLOCKED_FUTURE_CONFIRMED");
  assert.deepEqual(blocked.conflictingAppointmentIds, ["future-confirmed"]);
  assert.strictEqual(blocked.business, business);
  record(
    "timezone-change-blocked",
    "A future confirmed Appointment blocks Business timezone change",
    "Change rejected with the exact conflicting appointment id; version remained 7",
  );

  const history = makeAppointment(
    "historical-confirmed",
    "CONFIRMED",
    "2025-06-01",
    "09:00",
    business.timezone,
  );
  const futureCancelled = makeAppointment(
    "future-cancelled",
    "CANCELLED",
    "2026-03-01",
    "09:00",
    business.timezone,
  );
  const preservedBefore = JSON.stringify([history, futureCancelled]);
  const changed = changeBusinessTimezone(
    business,
    [history, futureCancelled],
    "America/Los_Angeles",
    "2026-01-01T00:00:00Z",
  );
  assert.equal(changed.outcome, "CHANGED");
  assert.equal(changed.business.timezone, "America/Los_Angeles");
  assert.equal(changed.business.availabilityVersion, 8);
  assert.equal(changed.recurringRulesReinterpreted, true);
  assert.equal(JSON.stringify(changed.appointments), preservedBefore);
  assert.equal(history.scheduledStartAtUtc, "2025-06-01T13:00:00Z");

  const futureRuleInNewYork = requireSlotInstant(
    interpretRecurringRule("2030-01-15", "09:00", "America/New_York"),
  );
  const futureRuleInLosAngeles = requireSlotInstant(
    interpretRecurringRule("2030-01-15", "09:00", changed.business.timezone),
  );
  assert.equal(futureRuleInNewYork.instantUtc, "2030-01-15T14:00:00Z");
  assert.equal(futureRuleInLosAngeles.instantUtc, "2030-01-15T17:00:00Z");
  record(
    "timezone-change-without-future-confirmed",
    "Change increments availability version, preserves history, and reinterprets future local rules",
    "Version 7->8; appointment JSON unchanged; future 09:00 moved from 14:00Z to 17:00Z",
  );

  const browserSource = await readFile(
    path.join(spikeRoot, "src", "browser", "confirmation-view.ts"),
    "utf8",
  );
  const serverSource = await readFile(
    path.join(spikeRoot, "src", "server", "time-strategy.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    browserSource,
    /@js-temporal|Temporal\.|new Date|Date\.now|toZonedDateTime|resolveLocalDateTime/,
  );
  assert.doesNotMatch(serverSource, /new Date|Date\.now/);
  record(
    "server-only-conversion-boundary",
    "Local-to-UTC conversion exists only in server code and never uses process-local Date",
    "Browser module only formats stored snapshots; server module uses explicit Temporal zones",
  );

  const processTimeZones = ["UTC", "America/Los_Angeles", "Asia/Tokyo"];
  const matrixByProcessTimeZone: Record<string, unknown> = {};
  const matrixHashes: Record<string, string> = {};
  for (const processTimeZone of processTimeZones) {
    const matrix = await runJsonProcess<unknown>(
      process.execPath,
      ["--import", "tsx", path.join(spikeRoot, "scripts", "emit-vectors.ts")],
      spikeRoot,
      { ...process.env, TZ: processTimeZone },
    );
    matrixByProcessTimeZone[processTimeZone] = matrix;
    matrixHashes[processTimeZone] = sha256(JSON.stringify(matrix));
  }
  assert.deepEqual(
    matrixByProcessTimeZone.UTC,
    matrixByProcessTimeZone["America/Los_Angeles"],
  );
  assert.deepEqual(
    matrixByProcessTimeZone.UTC,
    matrixByProcessTimeZone["Asia/Tokyo"],
  );
  assert.equal(new Set(Object.values(matrixHashes)).size, 1);
  record(
    "process-timezone-independence",
    "All business vectors are byte-equivalent under three process TZ settings",
    `Identical SHA-256 ${matrixHashes.UTC} under ${processTimeZones.join(", ")}`,
  );

  const nativeDefault = await runJsonProcess<NativeProbe>(
    process.execPath,
    [path.join(spikeRoot, "scripts", "native-probe.mjs")],
    spikeRoot,
  );
  const nativeExperimental = await runJsonProcess<NativeProbe>(
    process.execPath,
    ["--harmony-temporal", path.join(spikeRoot, "scripts", "native-probe.mjs")],
    spikeRoot,
  );
  const polyfillProbe = polyfillNativeComparable();
  assert.deepEqual(nativeDefault, {
    availability: "UNAVAILABLE",
    globalType: "undefined",
  });
  assert.equal(nativeExperimental.availability, "EXPERIMENTAL_FLAG");
  assert.ok(nativeExperimental.vectors);
  assert.deepEqual(
    semanticVectors(nativeExperimental.vectors),
    semanticVectors(polyfillProbe.vectors),
  );
  const nativeGapReject = nativeExperimental.vectors.gap?.reject;
  const polyfillGapReject = polyfillProbe.vectors.gap.reject;
  assert.equal(nativeGapReject?.error, "RangeError");
  assert.equal(polyfillGapReject.error, "RangeError");
  assert.notEqual(nativeGapReject?.message, polyfillGapReject.message);
  record(
    "native-polyfill-comparison",
    "Default runtime absence is explicit; experimental native semantics match the polyfill core vectors",
    "Native requires --harmony-temporal; semantic outputs matched; RangeError messages differed",
  );

  const nativeComparison = {
    runtimeDefault: nativeDefault,
    runtimeExperimental: nativeExperimental,
    polyfill: polyfillProbe,
    semanticMatchUnderExperimentalFlag: true,
    differences: [
      "globalThis.Temporal is undefined in the default Node runtime",
      "native Temporal requires the in-progress --harmony-temporal flag",
      "the polyfill is imported explicitly and does not install a global",
      "native and polyfill RangeError messages differ; policy relies only on classification/round-trip, not message text",
    ],
    criticalIncompatibility: false,
  };

  const timezoneChangeEvidence = {
    fixedNowUtc: "2026-01-01T00:00:00Z",
    blocked: {
      outcome: blocked.outcome,
      conflicts: blocked.conflictingAppointmentIds,
      businessUnchanged: blocked.business === business,
    },
    allowed: {
      outcome: changed.outcome,
      beforeTimezone: business.timezone,
      afterTimezone: changed.business.timezone,
      beforeVersion: business.availabilityVersion,
      afterVersion: changed.business.availabilityVersion,
      appointmentRecordsUnchanged: JSON.stringify(changed.appointments) === preservedBefore,
      historicalInstantUtc: history.scheduledStartAtUtc,
      futureRuleOldTimezoneUtc: futureRuleInNewYork.instantUtc,
      futureRuleNewTimezoneUtc: futureRuleInLosAngeles.instantUtc,
    },
  };

  const evidence = {
    spike: "SPK-004",
    result: "PASS",
    generatedAt: Temporal.Now.instant().toString(),
    environment: {
      operatingSystem: `${process.platform} ${process.arch}`,
      node: process.version,
      v8: process.versions.v8,
      icu: process.versions.icu,
      cldr: process.versions.cldr,
      tzdata: process.versions.tz,
      polyfill: polyfillPackage.version,
      nativeTemporalDefault: nativeDefault.availability,
      nativeTemporalExperimental: nativeExperimental.availability,
    },
    caseMatrix,
    experiments,
    snapshotEvidence: {
      snapshot,
      reconstructedInstantUtc: reconstructInstantFromSnapshot(snapshot),
      presentation: snapshotPresentation(snapshot),
    },
    durationEvidence: { springDuration, fallDuration },
    intervalEvidence: {
      adjacentOverlap: halfOpenIntervalsOverlap(intervalA, intervalB),
      crossingOverlap: halfOpenIntervalsOverlap(intervalA, intervalOverlap),
    },
    timezoneChangeEvidence,
    processTimezoneIndependence: {
      processTimeZones,
      hashes: matrixHashes,
      byteEquivalent: true,
    },
    nativeComparison,
    businessTimeSources: {
      explicitIanaTimeZoneOnly: true,
      processLocalDateUsed: false,
      fixedClockUsedForPolicyTests: true,
    },
  };

  await writeFile(
    path.join(evidenceDir, "SPK-004_CASE_MATRIX.json"),
    `${JSON.stringify(caseMatrix, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(evidenceDir, "SPK-004_NATIVE_COMPARISON.json"),
    `${JSON.stringify(nativeComparison, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(evidenceDir, "SPK-004_EVIDENCE.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `SPK-004 result: PASS (${caseMatrix.length} case rows, ${experiments.length} experiments)`,
  );
}

await main();
