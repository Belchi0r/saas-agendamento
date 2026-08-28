import { describe, expect, it } from "vitest";

import {
  deleteWeeklyRangeInputSchema,
  replaceWeeklyDaysInputSchema,
  updateWeeklyRangeInputSchema,
  weeklyRangeInputSchema,
} from "@/delivery/availability/weekly-availability-input";

describe("weekly availability delivery validation", () => {
  const valid = {
    weekday: 1,
    startLocalTime: "09:00",
    endLocalTime: "18:00",
    expectedAvailabilityVersion: 1,
  };

  it("accepts ISO weekdays and explicit local times", () => {
    expect(weeklyRangeInputSchema.safeParse(valid).success).toBe(true);
    expect(weeklyRangeInputSchema.safeParse({ ...valid, weekday: 0 }).success).toBe(
      false,
    );
    expect(
      weeklyRangeInputSchema.safeParse({ ...valid, startLocalTime: "9am" })
        .success,
    ).toBe(false);
  });

  it("rejects browser-supplied Business authority on every mutation shape", () => {
    expect(
      weeklyRangeInputSchema.safeParse({ ...valid, business_id: "business-b" })
        .success,
    ).toBe(false);
    expect(
      updateWeeklyRangeInputSchema.safeParse({
        action: "update",
        ...valid,
        businessId: "business-b",
      }).success,
    ).toBe(false);
    expect(
      deleteWeeklyRangeInputSchema.safeParse({
        expectedAvailabilityVersion: 1,
        business_id: "business-b",
      }).success,
    ).toBe(false);
    expect(
      replaceWeeklyDaysInputSchema.safeParse({
        weekdays: [1, 2],
        workingStartLocalTime: "08:00",
        workingEndLocalTime: "20:00",
        breakStartLocalTime: null,
        breakEndLocalTime: null,
        confirmReplaceExisting: false,
        expectedAvailabilityVersion: 1,
        business_id: "business-b",
      }).success,
    ).toBe(false);
  });

  it("accepts a multi-day template and rejects partial break input", () => {
    const template = {
      weekdays: [1, 2, 3, 4, 5],
      workingStartLocalTime: "08:00",
      workingEndLocalTime: "20:00",
      breakStartLocalTime: "12:00",
      breakEndLocalTime: "13:30",
      confirmReplaceExisting: true,
      expectedAvailabilityVersion: 1,
    };
    expect(replaceWeeklyDaysInputSchema.safeParse(template).success).toBe(true);
    expect(replaceWeeklyDaysInputSchema.safeParse({
      ...template,
      breakEndLocalTime: null,
    }).success).toBe(false);
  });
});
