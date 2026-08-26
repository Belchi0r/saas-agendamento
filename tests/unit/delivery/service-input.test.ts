import { describe, expect, it } from "vitest";

import {
  changeServiceInputSchema,
  createServiceInputSchema,
} from "@/delivery/services/service-input";

describe("Service delivery validation", () => {
  const valid = {
    name: "Atendimento",
    description: null,
    priceMinor: 10_000,
    durationMinutes: 60,
    active: true,
  };

  it("accepts only valid canonical Service fields", () => {
    expect(createServiceInputSchema.safeParse(valid).success).toBe(true);
    expect(
      createServiceInputSchema.safeParse({ ...valid, priceMinor: 10.5 }).success,
    ).toBe(false);
    expect(
      createServiceInputSchema.safeParse({ ...valid, durationMinutes: 0 }).success,
    ).toBe(false);
  });

  it("rejects a browser-supplied business_id and other extra authority", () => {
    expect(
      createServiceInputSchema.safeParse({
        ...valid,
        business_id: "00000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(false);

    expect(
      changeServiceInputSchema.safeParse({
        action: "set-active",
        active: false,
        expectedVersion: 1,
        businessId: "another-business",
      }).success,
    ).toBe(false);
  });
});
