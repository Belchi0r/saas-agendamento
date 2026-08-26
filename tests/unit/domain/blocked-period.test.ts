import { describe, expect, it } from "vitest";

import {
  assertBlockedPeriodDraft,
  BlockedPeriodRuleError,
} from "@/domain/availability/blocked-period";

describe("blocked period domain", () => {
  it("accepts a point local interval and rejects invalid ranges/dates", () => {
    expect(() =>
      assertBlockedPeriodDraft({
        localDate: "2026-12-24",
        startLocalTime: "10:00",
        endLocalTime: "11:00",
        privateReason: null,
      }),
    ).not.toThrow();

    for (const draft of [
      {
        localDate: "2026-02-30",
        startLocalTime: "10:00",
        endLocalTime: "11:00",
        privateReason: null,
      },
      {
        localDate: "2026-12-24",
        startLocalTime: "11:00",
        endLocalTime: "11:00",
        privateReason: null,
      },
    ]) {
      expect(() => assertBlockedPeriodDraft(draft)).toThrow(
        BlockedPeriodRuleError,
      );
    }
  });
});
