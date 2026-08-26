import { describe, expect, it } from "vitest";

import { createDateAvailabilityInputSchema } from "@/delivery/availability/date-availability-input";

describe("date availability delivery input", () => {
  it("accepts canonical input and rejects browser-supplied business authority", () => {
    const valid = {
      localDate: "2026-12-24",
      mode: "REPLACE" as const,
      privateNote: null,
      workingWindows: [
        { startLocalTime: "09:00", endLocalTime: "12:00" },
      ],
      expectedAvailabilityVersion: 1,
    };

    expect(createDateAvailabilityInputSchema.safeParse(valid).success).toBe(true);
    expect(
      createDateAvailabilityInputSchema.safeParse({
        ...valid,
        business_id: "10000000-0000-4000-8000-000000000099",
      }).success,
    ).toBe(false);
  });
});
