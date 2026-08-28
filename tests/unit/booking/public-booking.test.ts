import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { enumeratePublicAvailability } from "@/application/availability/calculate-availability";
import { listPublicBookingAvailability, listPublicBookingDateOptions } from "@/application/booking/public-booking-use-cases";
import type { PublicBookingRepository } from "@/application/booking/public-booking-repository";
import { normalizePublicBookingCommand, stableSerialize } from "@/domain/booking/public-booking";
import { businessScopeFromServer } from "@/domain/business/business-scope";
import { publicAvailabilityDatesQuerySchema, publicBookingInputSchema } from "@/delivery/booking/public-booking-input";

vi.mock("server-only", () => ({}));

const BUSINESS = "10000000-0000-4000-8000-000000000001";
const SERVICE = "30000000-0000-4000-8000-000000000001";
const weekly = [{ id: "w", businessId: BUSINESS, weekday: 1 as const, startLocalTime: "09:00", endLocalTime: "18:00", createdAt: new Date(0), updatedAt: new Date(0) }];

describe("Sprint 4 public booking domain", () => {
  it("enumerates an explicit 15-minute cadence while duration remains independent", () => {
    const result = enumeratePublicAvailability({
      localDate: "2026-08-31", timezone: "America/Sao_Paulo",
      serviceDurationMinutes: 45, slotStepMinutes: 15,
      minimumLeadMinutes: 0, bookingHorizonDays: 30,
      nowUtc: "2026-08-27T12:00:00Z", weeklyWorkingWindows: weekly,
      weeklyBreaks: [{ id: "b", businessId: BUSINESS, weekday: 1, startLocalTime: "12:00", endLocalTime: "13:00" }],
      dateException: null, blockedPeriods: [],
      scheduleOccupancies: [{ startAtUtc: "2026-08-31T16:45:00Z", endAtUtc: "2026-08-31T17:30:00Z" }],
    });
    expect(result.cadenceApplied).toBe(true);
    expect(result.slotStepMinutes).toBe(15);
    expect(result.availableCandidates.slice(0, 4).map((slot) => slot.startLocalTime)).toEqual(["09:00", "09:15", "09:30", "09:45"]);
    expect(result.availableCandidates.find((slot) => slot.startLocalTime === "13:00")).toBeDefined();
    expect(result.availableCandidates.find((slot) => slot.startLocalTime === "13:15")).toBeUndefined();
    expect(result.availableCandidates.find((slot) => slot.startLocalTime === "14:30")).toBeDefined();
    expect(result.availableCandidates.at(-1)?.startLocalTime).toBe("17:15");
  });

  it("lets CLOSED remove the date and REPLACE replace weekly windows", () => {
    const base = { localDate: "2026-08-31", timezone: "America/Sao_Paulo", serviceDurationMinutes: 30, slotStepMinutes: 15, minimumLeadMinutes: 0, bookingHorizonDays: 30, nowUtc: "2026-08-27T12:00:00Z", weeklyWorkingWindows: weekly, weeklyBreaks: [], blockedPeriods: [], scheduleOccupancies: [] } as const;
    const closed = enumeratePublicAvailability({ ...base, dateException: { id: "x", businessId: BUSINESS, localDate: base.localDate, mode: "CLOSED", privateNote: null, version: 1, createdAt: new Date(0), updatedAt: new Date(0), workingWindows: [] } });
    expect(closed.availableCandidates).toEqual([]);
    const replace = enumeratePublicAvailability({ ...base, dateException: { id: "x", businessId: BUSINESS, localDate: base.localDate, mode: "REPLACE", privateNote: null, version: 1, createdAt: new Date(0), updatedAt: new Date(0), workingWindows: [{ id: "xw", dateExceptionId: "x", startLocalTime: "20:00", endLocalTime: "21:00" }] } });
    expect(replace.availableCandidates.map((slot) => slot.startLocalTime)).toEqual(["20:00", "20:15", "20:30"]);
  });

  it("normalizes the canonical fingerprint input and rejects browser scope", () => {
    const raw = { serviceId: SERVICE.toUpperCase(), localDate: "2026-08-31", localTime: "09:00", customerName: "  Ana   María ", whatsappE164: "+55 (61) 99999-0000", reviewedService: { version: 1, name: " Corte ", durationMinutes: 45, priceMinor: 5000, currencyCode: "BRL" } };
    const normalized = normalizePublicBookingCommand(raw);
    expect(normalized.customer).toEqual({ name: "Ana María", whatsappE164: "+5561999990000" });
    expect(createHash("sha256").update(stableSerialize(normalized)).digest("hex")).toHaveLength(64);
    expect(publicBookingInputSchema.safeParse({ ...raw, business_id: BUSINESS }).success).toBe(false);
    expect(publicAvailabilityDatesQuerySchema.safeParse({ serviceId: SERVICE, business_id: BUSINESS }).success).toBe(false);
  });

  it("does not offer days outside the working week or CLOSED and respects REPLACE", async () => {
    const repository = discoveryRepository({
      bookingHorizonDays: 5,
      weeklyWorkingWindows: weekly,
      dateExceptions: [
        dateException("2026-08-28", "REPLACE", [
          { id: "xw", dateExceptionId: "x-2026-08-28", startLocalTime: "10:00", endLocalTime: "11:00" },
        ]),
        dateException("2026-08-31", "CLOSED", []),
      ],
    });

    const result = await listPublicBookingDateOptions(repository, SERVICE, new Date("2026-08-27T12:00:00Z"));

    expect(result.dates.find((date) => date.localDate === "2026-08-27")).toMatchObject({
      status: "NOT_WORKING",
      reason: "NO_WORKING_WINDOW",
    });
    expect(result.dates.find((date) => date.localDate === "2026-08-28")).toMatchObject({
      status: "AVAILABLE",
      firstAvailableLocalTime: "10:00",
    });
    expect(result.dates.find((date) => date.localDate === "2026-08-31")).toMatchObject({
      status: "NOT_WORKING",
      reason: "CLOSED",
    });
  });

  it("distinguishes a fully occupied working day and identifies the next available date", async () => {
    const repository = discoveryRepository({
      bookingHorizonDays: 12,
      weeklyWorkingWindows: weekly,
      scheduleOccupancies: [
        { startAtUtc: "2026-08-31T12:00:00Z", endAtUtc: "2026-08-31T21:00:00Z" },
      ],
    });

    const result = await listPublicBookingDateOptions(repository, SERVICE, new Date("2026-08-27T12:00:00Z"));
    const full = result.dates.find((date) => date.localDate === "2026-08-31");
    const next = result.dates.find(
      (date) => date.status === "AVAILABLE" && date.localDate > "2026-08-31",
    );

    expect(full).toMatchObject({ status: "FULLY_BOOKED", reason: "OCCUPIED" });
    expect(next).toMatchObject({ localDate: "2026-09-07", status: "AVAILABLE" });
  });

  it.each([
    ["agenda pública desligada", false, true, true],
    ["configuração incompleta", true, false, true],
    ["serviço inativo", true, true, false],
  ])("fails closed for %s", async (_label, enabled, configured, active) => {
    const repository = {
      scope: businessScopeFromServer(BUSINESS, "public-singleton"),
      loadAvailabilityFacts: async () => ({
        business: { timezone: "America/Sao_Paulo", publicBookingEnabled: enabled, availabilityVersion: 1 },
        policy: configured ? { minimumLeadMinutes: 0, bookingHorizonDays: 30, slotStepMinutes: 15, bufferMinutes: null, configurationConfirmedAt: new Date(), version: 1 } : null,
        service: { id: SERVICE, name: "Corte", description: null, durationMinutes: 45, priceMinor: 5000, currencyCode: "BRL", active, version: 1 },
        weeklyWorkingWindows: weekly, weeklyBreaks: [], dateException: null, scheduleOccupancies: [],
      }),
    } as unknown as PublicBookingRepository;
    await expect(listPublicBookingAvailability(repository, SERVICE, "2026-08-31", new Date("2026-08-27T12:00:00Z"))).rejects.toMatchObject({ status: enabled && configured ? 404 : 503 });
  });
});

function discoveryRepository(input: Readonly<{
  bookingHorizonDays: number;
  weeklyWorkingWindows: typeof weekly;
  dateExceptions?: readonly ReturnType<typeof dateException>[];
  scheduleOccupancies?: readonly { startAtUtc: string; endAtUtc: string }[];
}>): PublicBookingRepository {
  return {
    scope: businessScopeFromServer(BUSINESS, "public-singleton"),
    loadBookingProfile: async () => ({
      business: {
        timezone: "America/Sao_Paulo",
        publicBookingEnabled: true,
        availabilityVersion: 1,
      },
      policy: {
        minimumLeadMinutes: 0,
        bookingHorizonDays: input.bookingHorizonDays,
        slotStepMinutes: 15,
        bufferMinutes: null,
        configurationConfirmedAt: new Date(),
        version: 1,
      },
      service: {
        id: SERVICE,
        name: "Corte",
        description: null,
        durationMinutes: 45,
        priceMinor: 5000,
        currencyCode: "BRL",
        active: true,
        version: 1,
      },
    }),
    loadDateDiscoveryCalendar: async () => ({
      weeklyWorkingWindows: input.weeklyWorkingWindows,
      weeklyBreaks: [],
      dateExceptions: input.dateExceptions ?? [],
      scheduleOccupancies: input.scheduleOccupancies ?? [],
    }),
  } as unknown as PublicBookingRepository;
}

function dateException(
  localDate: string,
  mode: "CLOSED" | "REPLACE",
  workingWindows: readonly {
    id: string;
    dateExceptionId: string;
    startLocalTime: string;
    endLocalTime: string;
  }[],
) {
  return {
    id: `x-${localDate}`,
    businessId: BUSINESS,
    localDate,
    mode,
    privateNote: null,
    version: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    workingWindows,
  } as const;
}
