import { describe, expect, it } from "vitest";

import {
  assertServiceInvariants,
  normalizeServiceText,
} from "@/domain/services/service";

describe("Service domain", () => {
  it("normalizes text and preserves money in minor units", () => {
    expect(
      normalizeServiceText({
        name: "  Atendimento personalizado  ",
        description: "   ",
        priceMinor: 12_345,
        durationMinutes: 50,
        active: true,
      }),
    ).toEqual({
      name: "Atendimento personalizado",
      description: null,
      priceMinor: 12_345,
      durationMinutes: 50,
      active: true,
    });
  });

  it.each([
    ["blank name", { name: " ", priceMinor: 0, durationMinutes: 10 }],
    ["negative price", { name: "A", priceMinor: -1, durationMinutes: 10 }],
    ["fractional price", { name: "A", priceMinor: 1.5, durationMinutes: 10 }],
    ["nonpositive duration", { name: "A", priceMinor: 0, durationMinutes: 0 }],
  ])("rejects %s", (_case, values) => {
    expect(() =>
      assertServiceInvariants({
        ...values,
        description: null,
        active: true,
      }),
    ).toThrow();
  });
});
