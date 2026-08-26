import assert from "node:assert/strict";

import { getTableConfig } from "drizzle-orm/pg-core";
import type { Pool } from "pg";

import { applicationTables } from "../../src/db/schema.js";

type ColumnContract = {
  schemaName: string;
  tableName: string;
  columnName: string;
  sqlType: string;
  notNull: boolean;
  hasDefault: boolean;
  primaryKey: boolean;
};

export async function assertDrizzleMigrationColumnParity(pool: Pool) {
  const expected: ColumnContract[] = applicationTables.flatMap((table) => {
    const config = getTableConfig(table);
    return config.columns.map((column) => ({
      schemaName: config.schema ?? "public",
      tableName: config.name,
      columnName: column.name,
      sqlType: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      primaryKey: column.primary,
    }));
  });
  expected.sort(compareColumns);

  const result = await pool.query<{
    schema_name: string;
    table_name: string;
    column_name: string;
    sql_type: string;
    not_null: boolean;
    has_default: boolean;
    primary_key: boolean;
  }>(`
    select
      n.nspname as schema_name,
      c.relname as table_name,
      a.attname as column_name,
      format_type(a.atttypid, a.atttypmod) as sql_type,
      a.attnotnull as not_null,
      a.atthasdef as has_default,
      exists (
        select 1
        from pg_index i
        where i.indrelid = c.oid
          and i.indisprimary
          and a.attnum = any(i.indkey)
      ) as primary_key
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app_private'
      and c.relkind in ('r', 'p')
      and a.attnum > 0
      and not a.attisdropped
    order by n.nspname, c.relname, a.attnum
  `);
  const actual: ColumnContract[] = result.rows.map((row) => ({
    schemaName: row.schema_name,
    tableName: row.table_name,
    columnName: row.column_name,
    sqlType: row.sql_type,
    notNull: row.not_null,
    hasDefault: row.has_default,
    primaryKey: row.primary_key,
  }));
  actual.sort(compareColumns);

  assert.deepEqual(
    actual,
    expected,
    "Drizzle TypeScript columns diverged from the Supabase-applied migration",
  );

  return { expected, actual, matched: true };
}

function compareColumns(left: ColumnContract, right: ColumnContract) {
  return [left.schemaName, left.tableName, left.columnName]
    .join(".")
    .localeCompare([right.schemaName, right.tableName, right.columnName].join("."));
}
