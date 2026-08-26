import { describe, expect, it } from "vitest";

import { calculateAvailabilityForCandidates } from "@/application/availability/calculate-availability";
import type { DateAvailabilityException } from "@/domain/availability/date-availability";
import type {
  WeeklyBreak,
  WeeklyWorkingWindow,
} from "@/domain/availability/weekly-availability";

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";

function weeklyWindow(
  id: string,
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  startLocalTime: string,
  endLocalTime: string,
): WeeklyWorkingWindow {
  return {
    id,
    businessId: BUSINESS_ID,
    weekday,
    startLocalTime,
    endLocalTime,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function weeklyBreak(
  id: string,
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  startLocalTime: string,
  endLocalTime: string,
): WeeklyBreak {
  return { id, businessId: BUSINESS_ID, weekday, startLocalTime, endLocalTime };
}

function exception(
  mode: "CLOSED" | "REPLACE",
  windows: readonly Readonly<{
    startLocalTime: string;
    endLocalTime: string;
  }>[],
): DateAvailabilityException {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    businessId: BUSINESS_ID,
    localDate: "2026-08-31",
    mode,
    privateNote: null,
    version: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    workingWindows: windows.map((window, index) => ({
      id: `30000000-0000-4000-8000-00000000000${index + 2}`,
      dateExceptionId: "30000000-0000-4000-8000-000000000001",
      ...window,
    })),
  };
}

describe("availability candidate engine without invented cadence", () => {
  const mondayWindows = [
    weeklyWindow("window-a", 1, "09:00", "12:00"),
    weeklyWindow("window-b", 1, "13:00", "18:00"),
  ];

  it("subtracts weekly breaks and enforces duration and exact-close [)", () => {
    const result = calculateAvailabilityForCandidates({
      localDate: "2026-08-31",
      timezone: "America/Sao_Paulo",
      serviceDurationMinutes: 60,
      candidateLocalTimes: ["09:00", "11:00", "11:30", "12:00", "13:00", "17:00", "17:30", "18:00"],
      weeklyWorkingWindows: mondayWindows,
      weeklyBreaks: [weeklyBreak("break-a", 1, "11:30", "12:00")],
      dateException: null,
      blockedPeriods: [],
    });

    expect(result).toMatchObject({
      source: "WEEKLY",
      cadenceApplied: false,
      effectiveWindows: [
        { startLocalTime: "09:00", endLocalTime: "11:30" },
        { startLocalTime: "13:00", endLocalTime: "18:00" },
      ],
    });
    expect(result.availableCandidates.map((item) => item.startLocalTime)).toEqual([
      "09:00",
      "13:00",
      "17:00",
    ]);
    expect(result.availableCandidates.at(-1)).toMatchObject({
      startLocalTime: "17:00",
      endAtUtc: "2026-08-31T21:00:00Z",
    });
  });

  it("lets CLOSED and REPLACE fully override the weekly rule", () => {
    const closed = calculateAvailabilityForCandidates({
      localDate: "2026-08-31",
      timezone: "America/Sao_Paulo",
      serviceDurationMinutes: 60,
      candidateLocalTimes: ["09:00"],
      weeklyWorkingWindows: mondayWindows,
      weeklyBreaks: [],
      dateException: exception("CLOSED", []),
      blockedPeriods: [],
    });
    expect(closed).toMatchObject({ source: "CLOSED", effectiveWindows: [] });
    expect(closed.availableCandidates).toEqual([]);

    const replace = calculateAvailabilityForCandidates({
      localDate: "2026-08-31",
      timezone: "America/Sao_Paulo",
      serviceDurationMinutes: 120,
      candidateLocalTimes: ["09:00", "10:00", "12:00"],
      weeklyWorkingWindows: mondayWindows,
      weeklyBreaks: [weeklyBreak("break-a", 1, "10:30", "11:00")],
      dateException: exception("REPLACE", [
        { startLocalTime: "10:00", endLocalTime: "12:00" },
      ]),
      blockedPeriods: [],
    });
    expect(replace.source).toBe("REPLACE");
    expect(replace.availableCandidates.map((item) => item.startLocalTime)).toEqual([
      "10:00",
    ]);
  });

  it("rejects a DST gap and resolves a fold to its first instant", () => {
    const spring = calculateAvailabilityForCandidates({
      localDate: "2025-03-09",
      timezone: "America/New_York",
      serviceDurationMinutes: 30,
      candidateLocalTimes: ["01:30", "02:30", "03:00"],
      weeklyWorkingWindows: [weeklyWindow("spring", 7, "01:00", "05:00")],
      weeklyBreaks: [],
      dateException: null,
      blockedPeriods: [],
    });
    expect(spring.rejectedCandidates).toContainEqual({
      startLocalTime: "02:30",
      reason: "NONEXISTENT_LOCAL_TIME",
    });

    const fall = calculateAvailabilityForCandidates({
      localDate: "2025-11-02",
      timezone: "America/New_York",
      serviceDurationMinutes: 30,
      candidateLocalTimes: ["01:30"],
      weeklyWorkingWindows: [weeklyWindow("fall", 7, "00:00", "03:00")],
      weeklyBreaks: [],
      dateException: null,
      blockedPeriods: [],
    });
    expect(fall.availableCandidates).toEqual([
      expect.objectContaining({
        startLocalTime: "01:30",
        startAtUtc: "2025-11-02T05:30:00Z",
        endAtUtc: "2025-11-02T06:00:00Z",
        offset: "-04:00",
        resolution: "AMBIGUOUS_FIRST",
      }),
    ]);
  });

  it("does not depend on the process timezone", () => {
    const original = process.env.TZ;
    const outputs = ["UTC", "Asia/Tokyo", "America/Los_Angeles"].map((tz) => {
      process.env.TZ = tz;
      return JSON.stringify(
        calculateAvailabilityForCandidates({
          localDate: "2026-08-31",
          timezone: "America/Sao_Paulo",
          serviceDurationMinutes: 30,
          candidateLocalTimes: ["09:00"],
          weeklyWorkingWindows: mondayWindows,
          weeklyBreaks: [],
          dateException: null,
          blockedPeriods: [],
        }),
      );
    });
    process.env.TZ = original;
    expect(new Set(outputs).size).toBe(1);
  });

  it("subtracts partial and full blocked periods with half-open adjacency", () => {
    const result = calculateAvailabilityForCandidates({
      localDate: "2026-08-31",
      timezone: "America/Sao_Paulo",
      serviceDurationMinutes: 60,
      candidateLocalTimes: ["09:00", "10:00", "11:00", "12:00", "13:00"],
      weeklyWorkingWindows: [weeklyWindow("window", 1, "09:00", "14:00")],
      weeklyBreaks: [],
      dateException: null,
      blockedPeriods: [
        {
          id: "40000000-0000-4000-8000-000000000001",
          businessId: BUSINESS_ID,
          startAtUtc: "2026-08-31T13:00:00Z",
          endAtUtc: "2026-08-31T15:00:00Z",
          timezoneSnapshot: "America/Sao_Paulo",
          privateReason: null,
          active: true,
          version: 1,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    });

    expect(result.availableCandidates.map((item) => item.startLocalTime)).toEqual([
      "09:00",
      "12:00",
      "13:00",
    ]);
    expect(result.rejectedCandidates).toEqual([
      { startLocalTime: "10:00", reason: "BLOCKED_PERIOD_CONFLICT" },
      { startLocalTime: "11:00", reason: "BLOCKED_PERIOD_CONFLICT" },
    ]);
  });
});
