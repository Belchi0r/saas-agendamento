import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function migrationSql(): string {
  const directory = join(process.cwd(), "supabase", "migrations");
  return readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(directory, name), "utf8"))
    .join("\n")
    .replace(/^\s*--.*$/gm, "");
}

describe("official migration contract", () => {
  it("keeps domain objects private and managed schemas untouched", () => {
    const sql = migrationSql();

    expect(sql).toContain("create schema if not exists app_private");
    expect(sql).toContain("grant usage on schema app_private to barber_runtime");
    expect(sql).not.toMatch(/\b(auth|storage)\s*\./i);
  });

  it("grants only canonical per-table DML to the runtime role", () => {
    const sql = migrationSql();

    expect(sql).not.toMatch(/grant\s+all/i);
    expect(sql).not.toMatch(/grant\s+delete\s+on\s+app_private\.(business|service)/i);
    expect(sql).toMatch(
      /grant\s+delete\s+on\s+app_private\.weekly_working_window\s+to\s+barber_runtime/i,
    );
    expect(sql).toMatch(
      /grant\s+delete\s+on\s+app_private\.weekly_break\s+to\s+barber_runtime/i,
    );
  });

  it("defines the canonical Sprint 1 and Sprint 2 slices with scoped integrity", () => {
    const sql = migrationSql();

    expect(sql).toContain("create table app_private.business");
    expect(sql).toContain("create table app_private.service");
    expect(sql).toContain("service_business_currency_fk");
    expect(sql).toContain("service_business_active_name_idx");
    expect(sql).toContain("price_minor integer not null");
    expect(sql).toContain("duration_minutes integer not null");
    expect(sql).toContain("create table app_private.weekly_working_window");
    expect(sql).toContain("create table app_private.weekly_break");
    expect(sql).toContain("weekly_working_window_no_overlap");
    expect(sql).toContain("weekly_break_no_overlap");
    expect(sql).toContain("start_local_time time(0) without time zone");
    expect(sql).not.toMatch(
      /create table app_private\.(appointment|customer|date_availability_exception|blocked_period)/i,
    );
  });
});
