import { describe, expect, it, vi } from "vitest";
import {
  getOperationalAppointment,
  operationalDayRange,
  todayInBusinessTimezone,
  transitionOperationalAppointment,
} from "@/application/agenda/operational-agenda-use-cases";
import type { OperationalAgendaRepository } from "@/application/agenda/operational-agenda-repository";

describe("operational agenda use cases", () => {
  it("resolves today in the Business timezone", () => {
    expect(todayInBusinessTimezone("America/Sao_Paulo", new Date("2026-08-30T02:30:00Z"))).toBe("2026-08-29");
  });

  it("creates timezone-aware half-open day ranges", () => {
    const range = operationalDayRange("2026-10-18", "America/Sao_Paulo");
    expect(range.startAt.toISOString()).toBe("2026-10-18T03:00:00.000Z");
    expect(range.endAt.getTime()).toBeGreaterThan(range.startAt.getTime());
  });

  it.each([
    ["complete", "COMPLETED"],
    ["no-show", "NO_SHOW"],
    ["cancel", "CANCELLED"],
  ] as const)("maps %s to %s", async (action, toStatus) => {
    const transitionAppointment = vi.fn().mockResolvedValue({ status: toStatus });
    const repository = { transitionAppointment } as unknown as OperationalAgendaRepository;
    await transitionOperationalAppointment(repository, { appointmentId: "a", expectedVersion: 2, action }, new Date("2026-08-30T12:00:00Z"));
    expect(transitionAppointment).toHaveBeenCalledWith(expect.objectContaining({ toStatus, expectedVersion: 2 }));
  });

  it("does not expose a missing or cross-scope appointment", async () => {
    const repository = { findAppointment: vi.fn().mockResolvedValue(null) } as unknown as OperationalAgendaRepository;
    await expect(getOperationalAppointment(repository, "missing")).rejects.toMatchObject({ code: "APPOINTMENT_NOT_FOUND", status: 404 });
  });
});
