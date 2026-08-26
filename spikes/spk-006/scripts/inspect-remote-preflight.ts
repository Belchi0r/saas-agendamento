import assert from "node:assert/strict";

import { Pool } from "pg";

const databaseUrl = process.env.DIRECT_DATABASE_URL;
assert.ok(databaseUrl, "DIRECT_DATABASE_URL is required");

const database = new Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 15_000,
  application_name: "spk-006-read-only-preflight",
});

try {
  const schemas = await database.query(`
    select n.nspname as schema_name,
           r.rolname as owner,
           coalesce(n.nspacl::text, '<null>') as acl
    from pg_namespace n
    join pg_roles r on r.oid = n.nspowner
    where n.nspname in ('app_private', 'external_private', 'spk006_private')
    order by n.nspname
  `);
  const objects = await database.query(`
    select n.nspname as schema_name,
           c.relname as object_name,
           c.relkind as object_kind,
           r.rolname as owner
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_roles r on r.oid = c.relowner
    where n.nspname in ('app_private', 'external_private', 'spk006_private')
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    order by n.nspname, c.relname
  `);
  const privileges = await database.query(`
    select role_name, schema_name,
           has_schema_privilege(role_name, schema_name, 'USAGE') as can_use,
           has_schema_privilege(role_name, schema_name, 'CREATE') as can_create
    from unnest(array['anon','authenticated','service_role']) role_name
    cross join unnest(array['app_private','external_private','spk006_private']) schema_name
    where to_regnamespace(schema_name) is not null
    order by role_name, schema_name
  `);
  console.log(JSON.stringify({
    inspectionMode: "READ_ONLY_METADATA",
    schemas: schemas.rows,
    objects: objects.rows,
    privileges: privileges.rows,
  }, null, 2));
} finally {
  await database.end().catch(() => undefined);
}
