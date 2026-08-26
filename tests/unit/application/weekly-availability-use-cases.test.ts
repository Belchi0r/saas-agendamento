import { describe, expect, it, vi } from "vitest";

import type {
  WeeklyAvailabilityRepository,
  WeeklyAvailabilitySnapshot,
} from "@/application/availability/weekly-availability-repository";
import {
  createWeeklyBreak,
  createWorkingWindow,
  deleteWeeklyBreak,
  updateWorkingWindow,
} from "@/application/availability/weekly-availability-use-cases";
import { businessScopeFromServer } from "@/domain/business/business-scope";

const snapshot: WeeklyAvailabilitySnapshot = {
  timezone: "America/Sao_Paulo",
  availabilityVersion: 2,
  workingWindows: [],
  breaks: [],
};

function repository(): WeeklyAvailabilityRepository {
  return {
    scope: businessScopeFromServer("business-a", "admin-auth-user"),
    getSnapshot: vi.fn(async () => snapshot),
    applyMutation: vi.fn(async () => snapshot),
  };
}

describe("weekly availability application use cases", () => {
  const valid = {
    weekday: 1,
    startLocalTime: "09:00",
    endLocalTime: "18:00",
    expectedAvailabilityVersion: 2,
  };

  it("creates working windows and breaks with server-generated ids", async () => {
    const adapter = repository();

    await createWorkingWindow(adapter, valid);
    await createWeeklyBreak(adapter, {
      ...valid,
      startLocalTime: "12:00",
      endLocalTime: "13:00",
    });

    expect(adapter.applyMutation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: "create-working-window",
        id: expect.any(String),
        expectedAvailabilityVersion: 2,
      }),
    );
    expect(adapter.applyMutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: "create-break", id: expect.any(String) }),
    );
  });

  it("updates and removes only by repository scope plus optimistic version", async () => {
    const adapter = repository();

    await updateWorkingWindow(adapter, "window-a", valid);
    await deleteWeeklyBreak(adapter, "break-a", 2);

    expect(adapter.applyMutation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: "update-working-window",
        id: "window-a",
      }),
    );
    expect(adapter.applyMutation).toHaveBeenNthCalledWith(2, {
      kind: "delete-break",
      id: "break-a",
      expectedAvailabilityVersion: 2,
    });
  });

  it("rejects invalid ranges before persistence", async () => {
    const adapter = repository();

    let thrown: unknown;
    try {
      createWorkingWindow(adapter, {
        ...valid,
        startLocalTime: "18:00",
        endLocalTime: "09:00",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: "WEEKLY_RANGE_INVALID", status: 400 });
    expect(adapter.applyMutation).not.toHaveBeenCalled();
  });
});
