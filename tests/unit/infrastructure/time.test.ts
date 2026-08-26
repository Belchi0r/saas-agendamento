import { describe, expect, it } from "vitest";

import {
  assertIanaTimeZone,
  resolveLocalDateTime,
  Temporal,
} from "@/infrastructure/time/temporal";

describe("Temporal boundary", () => {
  it("validates an explicit IANA timezone without the process timezone", () => {
    expect(assertIanaTimeZone("America/New_York")).toBe("America/New_York");
    expect(() => assertIanaTimeZone("Invalid/Timezone")).toThrow(
      "Invalid IANA timezone.",
    );
    expect(() => assertIanaTimeZone("+02:00")).toThrow(
      "Invalid IANA timezone.",
    );
  });

  it("rejects gaps and chooses the first chronological fold occurrence", () => {
    expect(
      resolveLocalDateTime("2025-03-09", "02:30", "America/New_York"),
    ).toMatchObject({ kind: "NONEXISTENT", instantUtc: null });
    expect(
      resolveLocalDateTime("2025-11-02", "01:30", "America/New_York"),
    ).toMatchObject({
      kind: "AMBIGUOUS_FIRST",
      instantUtc: "2025-11-02T05:30:00Z",
      alternativeInstantUtc: "2025-11-02T06:30:00Z",
      offset: "-04:00",
    });
  });

  it("uses half-open interval semantics at adjacency", () => {
    const firstEnd = Temporal.Instant.from("2026-01-01T11:00:00Z");
    const secondStart = Temporal.Instant.from("2026-01-01T11:00:00Z");

    expect(Temporal.Instant.compare(firstEnd, secondStart)).toBe(0);
  });
});
