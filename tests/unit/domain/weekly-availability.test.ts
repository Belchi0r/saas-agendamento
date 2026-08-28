import { describe, expect, it } from "vitest";

import {
  assertWeeklyAvailabilityMutation,
  assertWeeklyAvailabilityState,
  assertWeeklyRangeDraft,
  weeklyIntervalsOverlap,
} from "@/domain/availability/weekly-availability";

const createdAt = new Date("2026-08-23T00:00:00Z");
const working = (
  id: string,
  startLocalTime: string,
  endLocalTime: string,
  weekday = 1,
) => ({
  id,
  businessId: "business-a",
  weekday: weekday as 1,
  startLocalTime,
  endLocalTime,
  createdAt,
  updatedAt: createdAt,
});
const weeklyBreak = (
  id: string,
  startLocalTime: string,
  endLocalTime: string,
  weekday = 1,
) => ({
  id,
  businessId: "business-a",
  weekday: weekday as 1,
  startLocalTime,
  endLocalTime,
});

describe("weekly availability domain", () => {
  it("accepts multiple adjacent half-open working windows and an intersecting break", () => {
    expect(() =>
      assertWeeklyAvailabilityState({
        workingWindows: [
          working("morning", "09:00", "12:00"),
          working("afternoon", "12:00", "18:00"),
        ],
        breaks: [weeklyBreak("lunch", "12:00", "13:00")],
      }),
    ).not.toThrow();

    expect(
      weeklyIntervalsOverlap(
        working("first", "09:00", "12:00"),
        working("second", "12:00", "18:00"),
      ),
    ).toBe(false);
  });

  it("rejects invalid weekdays, invalid local times, and overnight ranges", () => {
    expect(() =>
      assertWeeklyRangeDraft({
        weekday: 0,
        startLocalTime: "09:00",
        endLocalTime: "10:00",
      }),
    ).toThrowError("WEEKLY_RANGE_INVALID");
    expect(() =>
      assertWeeklyRangeDraft({
        weekday: 1,
        startLocalTime: "24:00",
        endLocalTime: "10:00",
      }),
    ).toThrowError("WEEKLY_RANGE_INVALID");
    expect(() =>
      assertWeeklyRangeDraft({
        weekday: 1,
        startLocalTime: "22:00",
        endLocalTime: "02:00",
      }),
    ).toThrowError("WEEKLY_RANGE_INVALID");
  });

  it("rejects overlapping working windows and overlapping breaks", () => {
    expect(() =>
      assertWeeklyAvailabilityState({
        workingWindows: [
          working("a", "09:00", "13:00"),
          working("b", "12:00", "18:00"),
        ],
        breaks: [],
      }),
    ).toThrowError("WORKING_WINDOW_OVERLAP");

    expect(() =>
      assertWeeklyAvailabilityState({
        workingWindows: [working("a", "09:00", "18:00")],
        breaks: [
          weeklyBreak("a", "12:00", "13:00"),
          weeklyBreak("b", "12:30", "14:00"),
        ],
      }),
    ).toThrowError("WEEKLY_BREAK_OVERLAP");
  });

  it("rejects a break outside working time and a working deletion that would orphan it", () => {
    const state = {
      workingWindows: [working("work", "09:00", "18:00")],
      breaks: [weeklyBreak("pause", "12:00", "13:00")],
    };

    expect(() =>
      assertWeeklyAvailabilityState({
        workingWindows: state.workingWindows,
        breaks: [weeklyBreak("outside", "18:00", "19:00")],
      }),
    ).toThrowError("WEEKLY_BREAK_OUTSIDE_WORKING_WINDOW");

    expect(() =>
      assertWeeklyAvailabilityMutation(state, {
        kind: "delete-working-window",
        id: "work",
        expectedAvailabilityVersion: 1,
      }),
    ).toThrowError("WEEKLY_BREAK_OUTSIDE_WORKING_WINDOW");
  });

  it("rejects an update for an item outside the loaded Business schedule", () => {
    expect(() =>
      assertWeeklyAvailabilityMutation(
        { workingWindows: [], breaks: [] },
        {
          kind: "update-working-window",
          id: "another-business-item",
          range: {
            weekday: 1,
            startLocalTime: "09:00",
            endLocalTime: "18:00",
          },
          expectedAvailabilityVersion: 1,
        },
      ),
    ).toThrowError("WEEKLY_ITEM_NOT_FOUND");
  });

  it("requires explicit confirmation before a multi-day replacement", () => {
    const state = {
      workingWindows: [working("monday", "09:00", "18:00")],
      breaks: [weeklyBreak("lunch", "12:00", "13:00")],
    };
    const replacement = {
      kind: "replace-days" as const,
      replacements: [1, 2].map((weekday) => ({
        weekday,
        workingWindow: {
          id: `work-${weekday}`,
          startLocalTime: "08:00",
          endLocalTime: "20:00",
        },
        weeklyBreak: {
          id: `break-${weekday}`,
          startLocalTime: "12:00",
          endLocalTime: "13:30",
        },
      })),
      expectedAvailabilityVersion: 1,
    };

    expect(() => assertWeeklyAvailabilityMutation(state, {
      ...replacement,
      confirmReplaceExisting: false,
    })).toThrowError("WEEKLY_REPLACEMENT_CONFIRMATION_REQUIRED");
    expect(() => assertWeeklyAvailabilityMutation(state, {
      ...replacement,
      confirmReplaceExisting: true,
    })).not.toThrow();
  });
});
