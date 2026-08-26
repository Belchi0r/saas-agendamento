import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = databaseUrl ? describe : describe.skip;

databaseSuite("Sprint 0 foundation on real PostgreSQL", () => {
  const pool = new Pool({
    connectionString: databaseUrl ?? "postgresql://invalid.invalid/postgres",
    max: 2,
  });

  beforeAll(async () => {
    await pool.query("select 1");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates the private schema and constrained runtime role", async () => {
    const result = await pool.query<{
      schema_exists: boolean;
      usage_allowed: boolean;
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolbypassrls: boolean;
    }>(`
      select
        to_regnamespace('app_private') is not null as schema_exists,
        has_schema_privilege('barber_runtime', 'app_private', 'USAGE') as usage_allowed,
        rolcanlogin,
        rolsuper,
        rolcreatedb,
        rolcreaterole,
        rolbypassrls
      from pg_roles
      where rolname = 'barber_runtime'
    `);

    expect(result.rows[0]).toEqual({
      schema_exists: true,
      usage_allowed: true,
      rolcanlogin: false,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
    });
  });

  it("denies DDL and keeps the connection reusable after rollback", async () => {
    const client = new Client({
      connectionString: databaseUrl ?? "postgresql://invalid.invalid/postgres",
    });
    await client.connect();

    try {
      await client.query("begin");
      await client.query("set local role barber_runtime");

      await expect(client.query("create schema forbidden_probe")).rejects.toMatchObject({
        code: "42501",
      });

      await client.query("rollback");
      await expect(client.query("select 1 as recovered")).resolves.toMatchObject({
        rows: [{ recovered: 1 }],
      });
    } finally {
      await client.end();
    }
  });

  it("keeps app_private outside the Data API allowlist", () => {
    const config = readFileSync(
      join(process.cwd(), "supabase", "config.toml"),
      "utf8",
    );

    expect(config).toContain('schemas = ["public", "graphql_public"]');
    expect(config).not.toMatch(/schemas\s*=\s*\[[^\]]*app_private/);
  });
});
