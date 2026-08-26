import assert from "node:assert/strict";

import { resolveLocalDateTime, type LocalTimeResolution } from "../src/server/time-strategy.js";

export type TimeCaseEvidence = Readonly<{
  id: string;
  inputLocal: string;
  timeZone: string;
  classification: LocalTimeResolution["kind"];
  offset: string | null;
  instantUtc: string | null;
  alternativeInstantUtc: string | null;
  expectedBehavior: string;
  observedBehavior: string;
  status: "PASS";
}>;

type Expected = Readonly<{
  kind: LocalTimeResolution["kind"];
  offset: string | null;
  instantUtc: string | null;
  alternativeInstantUtc?: string | null;
}>;

const definitions: ReadonlyArray<Readonly<{
  id: string;
  localDate: string;
  localTime: string;
  timeZone: string;
  expected: Expected;
  expectedBehavior: string;
}>> = [
  {
    id: "no-dst-phoenix-winter",
    localDate: "2025-01-15",
    localTime: "09:00",
    timeZone: "America/Phoenix",
    expected: { kind: "UNIQUE", offset: "-07:00", instantUtc: "2025-01-15T16:00:00Z" },
    expectedBehavior: "unique instant with fixed -07:00 offset",
  },
  {
    id: "no-dst-phoenix-summer",
    localDate: "2025-07-15",
    localTime: "09:00",
    timeZone: "America/Phoenix",
    expected: { kind: "UNIQUE", offset: "-07:00", instantUtc: "2025-07-15T16:00:00Z" },
    expectedBehavior: "same offset in summer for a no-DST zone",
  },
  {
    id: "half-hour-offset-kolkata",
    localDate: "2025-06-15",
    localTime: "09:00",
    timeZone: "Asia/Calcutta",
    expected: { kind: "UNIQUE", offset: "+05:30", instantUtc: "2025-06-15T03:30:00Z" },
    expectedBehavior: "preserve a non-whole-hour IANA offset",
  },
  {
    id: "new-york-before-spring-forward",
    localDate: "2025-03-09",
    localTime: "01:59",
    timeZone: "America/New_York",
    expected: { kind: "UNIQUE", offset: "-05:00", instantUtc: "2025-03-09T06:59:00Z" },
    expectedBehavior: "last pre-transition minutes use EST",
  },
  {
    id: "new-york-nonexistent",
    localDate: "2025-03-09",
    localTime: "02:30",
    timeZone: "America/New_York",
    expected: { kind: "NONEXISTENT", offset: null, instantUtc: null },
    expectedBehavior: "generate no slot and never shift to 03:30",
  },
  {
    id: "new-york-after-spring-forward",
    localDate: "2025-03-09",
    localTime: "03:00",
    timeZone: "America/New_York",
    expected: { kind: "UNIQUE", offset: "-04:00", instantUtc: "2025-03-09T07:00:00Z" },
    expectedBehavior: "first post-transition hour uses EDT",
  },
  {
    id: "new-york-ambiguous-first",
    localDate: "2025-11-02",
    localTime: "01:30",
    timeZone: "America/New_York",
    expected: {
      kind: "AMBIGUOUS_FIRST",
      offset: "-04:00",
      instantUtc: "2025-11-02T05:30:00Z",
      alternativeInstantUtc: "2025-11-02T06:30:00Z",
    },
    expectedBehavior: "choose the chronologically first occurrence",
  },
  {
    id: "new-york-after-fall-back",
    localDate: "2025-11-02",
    localTime: "02:00",
    timeZone: "America/New_York",
    expected: { kind: "UNIQUE", offset: "-05:00", instantUtc: "2025-11-02T07:00:00Z" },
    expectedBehavior: "post-transition hour uses EST",
  },
  {
    id: "berlin-nonexistent",
    localDate: "2025-03-30",
    localTime: "02:30",
    timeZone: "Europe/Berlin",
    expected: { kind: "NONEXISTENT", offset: null, instantUtc: null },
    expectedBehavior: "European spring gap also generates no slot",
  },
  {
    id: "berlin-ambiguous-first",
    localDate: "2025-10-26",
    localTime: "02:30",
    timeZone: "Europe/Berlin",
    expected: {
      kind: "AMBIGUOUS_FIRST",
      offset: "+02:00",
      instantUtc: "2025-10-26T00:30:00Z",
      alternativeInstantUtc: "2025-10-26T01:30:00Z",
    },
    expectedBehavior: "choose the first European fall-back occurrence",
  },
  {
    id: "midnight-year-boundary-kiritimati",
    localDate: "2026-01-01",
    localTime: "00:15",
    timeZone: "Pacific/Kiritimati",
    expected: { kind: "UNIQUE", offset: "+14:00", instantUtc: "2025-12-31T10:15:00Z" },
    expectedBehavior: "local new year maps to the previous UTC year",
  },
  {
    id: "month-boundary-new-york",
    localDate: "2025-03-01",
    localTime: "00:00",
    timeZone: "America/New_York",
    expected: { kind: "UNIQUE", offset: "-05:00", instantUtc: "2025-03-01T05:00:00Z" },
    expectedBehavior: "local midnight remains deterministic at a month boundary",
  },
  {
    id: "day-after-spring-transition",
    localDate: "2025-03-10",
    localTime: "00:00",
    timeZone: "America/New_York",
    expected: { kind: "UNIQUE", offset: "-04:00", instantUtc: "2025-03-10T04:00:00Z" },
    expectedBehavior: "midnight after DST uses the new offset",
  },
];

export function runCaseMatrix(): TimeCaseEvidence[] {
  return definitions.map((definition) => {
    const observed = resolveLocalDateTime(
      definition.localDate,
      definition.localTime,
      definition.timeZone,
    );
    assert.deepEqual(
      {
        kind: observed.kind,
        offset: observed.offset,
        instantUtc: observed.instantUtc,
        alternativeInstantUtc: observed.alternativeInstantUtc,
      },
      {
        kind: definition.expected.kind,
        offset: definition.expected.offset,
        instantUtc: definition.expected.instantUtc,
        alternativeInstantUtc: definition.expected.alternativeInstantUtc ?? null,
      },
      definition.id,
    );
    return Object.freeze({
      id: definition.id,
      inputLocal: `${definition.localDate}T${definition.localTime}`,
      timeZone: definition.timeZone,
      classification: observed.kind,
      offset: observed.offset,
      instantUtc: observed.instantUtc,
      alternativeInstantUtc: observed.alternativeInstantUtc,
      expectedBehavior: definition.expectedBehavior,
      observedBehavior: observed.kind === "NONEXISTENT"
        ? "slot omitted; no UTC instant produced"
        : `${observed.kind}; selected ${observed.instantUtc} at ${observed.offset}`,
      status: "PASS" as const,
    });
  });
}
