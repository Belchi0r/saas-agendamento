import { describe, expect, it } from "vitest";

import {
  assertDateAvailabilityExceptionDraft,
  DateAvailabilityRuleError,
} from "@/domain/availability/date-availability";
import { subtractLocalIntervals } from "@/domain/availability/local-interval";

describe("date availability domain", () => {
  it("accepts CLOSED without windows and REPLACE with adjacent windows", () => {
    expect(() =>
      assertDateAvailabilityExceptionDraft({
        localDate: "2026-12-31",
        mode: "CLOSED",
        privateNote: null,
        workingWindows: [],
      }),
    ).not.toThrow();

    expect(() =>
      assertDateAvailabilityExceptionDraft({
        localDate: "2026-12-31",
        mode: "REPLACE",
        privateNote: "Atendimento reduzido",
        workingWindows: [
          { startLocalTime: "09:00", endLocalTime: "12:00" },
          { startLocalTime: "12:00", endLocalTime: "15:00" },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects impossible dates, invalid mode/window cardinality, and overlap", () => {
    const invalid = [
      {
        localDate: "2026-02-30",
        mode: "CLOSED" as const,
        privateNote: null,
        workingWindows: [],
      },
      {
        localDate: "2026-01-01",
        mode: "CLOSED" as const,
        privateNote: null,
        workingWindows: [{ startLocalTime: "09:00", endLocalTime: "10:00" }],
      },
      {
        localDate: "2026-01-01",
        mode: "REPLACE" as const,
        privateNote: null,
        workingWindows: [],
      },
    ];

    for (const draft of invalid) {
      expect(() => assertDateAvailabilityExceptionDraft(draft)).toThrow(
        DateAvailabilityRuleError,
      );
    }

    expect(() =>
      assertDateAvailabilityExceptionDraft({
        localDate: "2026-01-01",
        mode: "REPLACE",
        privateNote: null,
        workingWindows: [
          { startLocalTime: "09:00", endLocalTime: "12:00" },
          { startLocalTime: "11:59", endLocalTime: "13:00" },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "DATE_EXCEPTION_WINDOW_OVERLAP" }),
    );
  });

  it("subtracts partial and integral half-open intervals deterministically", () => {
    expect(
      subtractLocalIntervals(
        [{ startLocalTime: "09:00", endLocalTime: "18:00" }],
        [
          { startLocalTime: "08:00", endLocalTime: "10:00" },
          { startLocalTime: "12:00", endLocalTime: "13:00" },
          { startLocalTime: "17:00", endLocalTime: "19:00" },
        ],
      ),
    ).toEqual([
      { startLocalTime: "10:00", endLocalTime: "12:00" },
      { startLocalTime: "13:00", endLocalTime: "17:00" },
    ]);

    expect(
      subtractLocalIntervals(
        [{ startLocalTime: "09:00", endLocalTime: "10:00" }],
        [{ startLocalTime: "09:00", endLocalTime: "10:00" }],
      ),
    ).toEqual([]);
  });
});
