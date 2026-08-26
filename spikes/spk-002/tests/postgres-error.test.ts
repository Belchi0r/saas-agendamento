import { describe, expect, it } from "vitest";

import { isExclusionViolation } from "../src/db/postgres-error.js";

describe("PostgreSQL error recognition", () => {
  it("recognizes SQLSTATE 23P01 through an ORM wrapper cause", () => {
    const driverError = Object.assign(new Error("conflicting key value"), {
      code: "23P01",
      constraint: "schedule_occupancy_no_overlap",
    });
    const wrapper = new Error("Drizzle query failed", { cause: driverError });

    expect(isExclusionViolation(wrapper)).toBe(true);
  });

  it("does not confuse a different constraint", () => {
    const driverError = Object.assign(new Error("conflicting key value"), {
      code: "23P01",
      constraint: "another_constraint",
    });

    expect(isExclusionViolation(driverError)).toBe(false);
  });
});
