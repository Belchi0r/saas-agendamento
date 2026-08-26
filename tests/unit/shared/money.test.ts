import { describe, expect, it } from "vitest";

import {
  formatMinorUnits,
  parseMinorUnits,
} from "@/shared/money/minor-units";

describe("minor-unit money boundary", () => {
  it("parses decimal input without floating-point persistence", () => {
    expect(parseMinorUnits("123,45", "BRL")).toBe(12_345);
    expect(parseMinorUnits("123.45", "BRL")).toBe(12_345);
    expect(parseMinorUnits("123,456", "BRL")).toBeNull();
    expect(parseMinorUnits("10,5", "BRL")).toBe(1_050);
  });

  it("uses the currency fraction digits supplied by Intl", () => {
    expect(parseMinorUnits("123", "JPY")).toBe(123);
    expect(formatMinorUnits(12_345, "BRL")).toBe("R$ 123,45");
  });
});
