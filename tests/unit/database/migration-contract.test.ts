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

  it("defines the canonical implemented slices with scoped integrity", () => {
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
    expect(sql).toContain("create table app_private.date_availability_exception");
    expect(sql).toContain("create table app_private.exception_working_window");
    expect(sql).toContain("date_availability_exception_business_date_unique");
    expect(sql).toContain("exception_working_window_no_overlap");
    expect(sql).toContain("create table app_private.blocked_period");
    expect(sql).toContain("create table app_private.schedule_occupancy");
    expect(sql).toContain("schedule_occupancy_no_overlap");
    expect(sql).toContain("blocked_period_occupancy_guard");
    expect(sql).toContain("schedule_occupancy_owner_guard");
    expect(sql).not.toMatch(
      /create table app_private\.(appointment|customer)/i,
    );
  });

  it("keeps date exceptions private and grants only their required DML", () => {
    const sql = migrationSql();

    expect(sql).toMatch(
      /grant\s+delete\s+on\s+app_private\.date_availability_exception\s+to\s+barber_runtime/i,
    );
    expect(sql).toMatch(
      /grant\s+delete\s+on\s+app_private\.exception_working_window\s+to\s+barber_runtime/i,
    );
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+app_private\.date_availability_exception\s+from\s+%I/i,
    );
  });

  it("keeps occupancy append/release-only for the runtime", () => {
    const sql = migrationSql();

    expect(sql).toMatch(
      /blocked_period_id\s+uuid\s+not\s+null/i,
    );
    expect(sql).toMatch(
      /foreign\s+key\s*\(\s*business_id\s*,\s*blocked_period_id\s*\)\s*references\s+app_private\.blocked_period\s*\(\s*business_id\s*,\s*id\s*\)/is,
    );
    expect(sql).toMatch(
      /schedule_occupancy_period_is_half_open[\s\S]*lower_inc\(occupied_period\)[\s\S]*not\s+upper_inc\(occupied_period\)/i,
    );
    expect(sql).toMatch(
      /schedule_occupancy_no_overlap[\s\S]*exclude\s+using\s+gist[\s\S]*occupied_period\s+with\s+&&[\s\S]*where\s*\(\s*released_at\s+is\s+null\s*\)/i,
    );
    expect(sql).toMatch(
      /create\s+constraint\s+trigger\s+blocked_period_occupancy_guard[\s\S]*deferrable\s+initially\s+deferred/i,
    );
    expect(sql).toMatch(
      /create\s+constraint\s+trigger\s+schedule_occupancy_owner_guard[\s\S]*deferrable\s+initially\s+deferred/i,
    );
    expect(sql).toMatch(
      /grant\s+update\s*\(\s*occupied_period,\s*released_at\s*\)\s*on\s+app_private\.schedule_occupancy\s+to\s+barber_runtime/is,
    );
    expect(sql).toMatch(
      /revoke\s+delete\s+on\s+app_private\.schedule_occupancy\s+from\s+barber_runtime/i,
    );
    expect(sql).not.toMatch(
      /grant\s+delete\s+on\s+app_private\.schedule_occupancy/i,
    );
    expect(sql).not.toMatch(
      /grant\s+delete\s+on\s+app_private\.blocked_period/i,
    );
    expect(sql).not.toMatch(/\bappointment_id\b/i);
  });

  it("does not silently freeze the still-open slot cadence", () => {
    expect(migrationSql()).not.toMatch(/\bslot_step_minutes\b/i);
  });
});
