import { describe, expect, it } from "vitest";

import { createBlockedPeriodInputSchema } from "@/delivery/availability/blocked-period-input";

describe("blocked period delivery input", () => {
  it("accepts local input and rejects browser business/timezone authority", () => {
    const valid = {
      localDate: "2026-12-24",
      startLocalTime: "10:00",
      endLocalTime: "11:00",
      privateReason: "Manutenção",
      expectedAvailabilityVersion: 1,
    };
    expect(createBlockedPeriodInputSchema.safeParse(valid).success).toBe(true);
    expect(
      createBlockedPeriodInputSchema.safeParse({
        ...valid,
        business_id: "10000000-0000-4000-8000-000000000099",
      }).success,
    ).toBe(false);
    expect(
      createBlockedPeriodInputSchema.safeParse({
        ...valid,
        timezone: "UTC",
      }).success,
    ).toBe(false);
  });
});
