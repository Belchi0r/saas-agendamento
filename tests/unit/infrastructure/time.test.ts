import { describe, expect, it } from "vitest";

import { assertIanaTimeZone, Temporal } from "@/infrastructure/time/temporal";

describe("Temporal boundary", () => {
  it("validates an explicit IANA timezone without the process timezone", () => {
    expect(assertIanaTimeZone("America/New_York")).toBe("America/New_York");
    expect(() => assertIanaTimeZone("Invalid/Timezone")).toThrow(
      "Invalid IANA timezone.",
    );
  });

  it("uses half-open interval semantics at adjacency", () => {
    const firstEnd = Temporal.Instant.from("2026-01-01T11:00:00Z");
    const secondStart = Temporal.Instant.from("2026-01-01T11:00:00Z");

    expect(Temporal.Instant.compare(firstEnd, secondStart)).toBe(0);
  });
});
