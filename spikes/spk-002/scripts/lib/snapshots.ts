import { createHash } from "node:crypto";

import type { Pool } from "pg";

export type ManagedSchemaSnapshot = {
  schemas: unknown[];
  relations: unknown[];
  columns: unknown[];
  localSentinels: unknown[];
};

/**
 * A controlled stand-in for Supabase-managed schemas when Docker/Supabase local
 * is unavailable. This is harness setup, never a migration or production DDL.
 */
export async function createLocalManagedSchemaSentinels(pool: Pool) {
  await pool.query(`
    create schema auth;
    create schema storage;

    create table auth._spk_002_guard (
      id integer primary key,
      guard_value text not null
    );

    create table storage._spk_002_guard (
      id integer primary key,
      guard_value text not null
    );

    insert into auth._spk_002_guard (id, guard_value)
    values (1, 'auth-unchanged');

    insert into storage._spk_002_guard (id, guard_value)
    values (1, 'storage-unchanged');
  `);
}

export async function snapshotManagedSchemas(
  pool: Pool,
): Promise<ManagedSchemaSnapshot> {
  const schemas = await pool.query(`
    select
      n.oid::text as oid,
      n.nspname as schema_name,
      pg_get_userbyid(n.nspowner) as owner_name,
      coalesce(n.nspacl::text, '') as acl
    from pg_namespace n
    where n.nspname in ('auth', 'storage')
    order by n.nspname
  `);
  const relations = await pool.query(`
    select
      c.oid::text as oid,
      n.nspname as schema_name,
      c.relname as relation_name,
      c.relkind,
      pg_get_userbyid(c.relowner) as owner_name,
      coalesce(c.relacl::text, '') as acl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('auth', 'storage')
    order by n.nspname, c.relname, c.relkind
  `);
  const columns = await pool.query(`
    select
      n.nspname as schema_name,
      c.relname as relation_name,
      a.attnum,
      a.attname as column_name,
      format_type(a.atttypid, a.atttypmod) as sql_type,
      a.attnotnull,
      coalesce(pg_get_expr(d.adbin, d.adrelid), '') as default_expression
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d
      on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname in ('auth', 'storage')
      and a.attnum > 0
      and not a.attisdropped
    order by n.nspname, c.relname, a.attnum
  `);
  const sentinels = await pool.query(`
    select 'auth' as schema_name, id, guard_value
    from auth._spk_002_guard
    where to_regclass('auth._spk_002_guard') is not null
    union all
    select 'storage' as schema_name, id, guard_value
    from storage._spk_002_guard
    where to_regclass('storage._spk_002_guard') is not null
    order by schema_name, id
  `).catch(() => ({ rows: [] }));

  return {
    schemas: schemas.rows,
    relations: relations.rows,
    columns: columns.rows,
    localSentinels: sentinels.rows,
  };
}

export async function applicationSchemaFingerprint(pool: Pool) {
  const objects = await pool.query(`
    select 'column' as object_kind,
      c.relname as parent_name,
      a.attnum::text as object_order,
      a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' ||
        a.attnotnull::text || ':' ||
        coalesce(pg_get_expr(d.adbin, d.adrelid), '') as definition
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d
      on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = 'app_private'
      and c.relkind in ('r', 'p')
      and a.attnum > 0
      and not a.attisdropped

    union all

    select 'constraint', c.relname, con.conname,
      pg_get_constraintdef(con.oid, true)
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app_private'

    union all

    select 'index', tab.relname, idx.relname,
      pg_get_indexdef(i.indexrelid)
    from pg_index i
    join pg_class tab on tab.oid = i.indrelid
    join pg_class idx on idx.oid = i.indexrelid
    join pg_namespace n on n.oid = tab.relnamespace
    where n.nspname = 'app_private'

    order by object_kind, parent_name, object_order
  `);
  const serialized = JSON.stringify(objects.rows);

  return {
    sha256: createHash("sha256").update(serialized).digest("hex"),
    objects: objects.rows,
  };
}
