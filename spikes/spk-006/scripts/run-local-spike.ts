import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DatabaseError,
  Pool,
  type PoolClient,
  type QueryResultRow,
} from "pg";

import { buildBrowserConfig, browserCapabilities } from "../src/browser/public-config.js";
import {
  BusinessScopeResolutionError,
  resolveAdminBusiness,
  resolvePublicBusiness,
  type BusinessScope,
  type Queryable,
} from "../src/server/business-scope.js";
import { buildServerDatabaseConfig } from "../src/server/database-config.js";
import { repositoriesFor } from "../src/server/repositories.js";
import {
  createEmbeddedPostgres,
  findFreeTcpPort,
  mountAsciiWorkspacePath,
  stopEmbeddedPostgres,
} from "./lib/embedded-db.js";
import { runCommand } from "./lib/process.js";
import { applyMigrationsWithSupabaseCli } from "./lib/supabase-cli.js";

const IDS = Object.freeze({
  businessA: "00000000-0000-4000-8000-0000000000a1",
  businessB: "00000000-0000-4000-8000-0000000000b2",
  adminA: "00000000-0000-4000-8000-00000000aa01",
  adminB: "00000000-0000-4000-8000-00000000bb02",
  unknownAdmin: "00000000-0000-4000-8000-00000000ee03",
  serviceA: "10000000-0000-4000-8000-0000000000a1",
  serviceB: "10000000-0000-4000-8000-0000000000b2",
  serviceRuntime: "10000000-0000-4000-8000-0000000000c3",
  customerA: "20000000-0000-4000-8000-0000000000a1",
  customerB: "20000000-0000-4000-8000-0000000000b2",
  customerRuntime: "20000000-0000-4000-8000-0000000000c3",
  appointmentA: "30000000-0000-4000-8000-0000000000a1",
  appointmentCrossService: "30000000-0000-4000-8000-0000000000c1",
  appointmentCrossCustomer: "30000000-0000-4000-8000-0000000000c2",
  appointmentRuntime: "30000000-0000-4000-8000-0000000000c3",
  occupancyA: "40000000-0000-4000-8000-0000000000a1",
  occupancyCross: "40000000-0000-4000-8000-0000000000c2",
  occupancyRuntime: "40000000-0000-4000-8000-0000000000c3",
});

type Experiment = {
  id: string;
  title: string;
  expected: string;
  observed: string;
  outcome: "PASS";
  sqlstate?: string;
  constraint?: string;
};

type NegativeResult = {
  sqlstate: string;
  message: string;
  constraint?: string;
  connectionReusable: boolean;
  currentRoleAfterRecovery: string;
};

const experiments: Experiment[] = [];
const sqlstateEvidence: Array<NegativeResult & { id: string }> = [];

function record(
  id: string,
  title: string,
  expected: string,
  observed: string,
  extra: Pick<Experiment, "sqlstate" | "constraint"> = {},
) {
  experiments.push({ id, title, expected, observed, outcome: "PASS", ...extra });
}

function asQueryable(client: PoolClient): Queryable {
  return client as unknown as Queryable;
}

async function withRole<T>(
  pool: Pool,
  role: "barber_runtime" | "anon" | "authenticated" | "service_role",
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`set role ${role}`);
    return await operation(client);
  } finally {
    await client.query("reset role").catch(() => undefined);
    client.release();
  }
}

async function expectDatabaseError(
  pool: Pool,
  id: string,
  role: "barber_runtime" | "anon" | "authenticated" | "service_role",
  statement: string,
  values: readonly unknown[] = [],
  expectedSqlstate: string,
  expectedConstraint?: string,
): Promise<NegativeResult> {
  const client = await pool.connect();
  try {
    await client.query(`set role ${role}`);
    await client.query("begin");
    let captured: DatabaseError | undefined;
    try {
      await client.query(statement, [...values]);
    } catch (error) {
      assert.ok(error instanceof DatabaseError, `Expected a PostgreSQL error for ${id}`);
      captured = error;
    }
    if (!captured) {
      await client.query("rollback");
      assert.fail(`Operation ${id} unexpectedly succeeded`);
    }
    assert.equal(captured.code, expectedSqlstate, captured.message);
    if (expectedConstraint) {
      assert.equal(captured.constraint, expectedConstraint, captured.message);
    }
    await client.query("rollback");
    const recovery = await client.query<{ current_role: string; marker: number }>(
      "select current_user as current_role, 1::integer as marker",
    );
    assert.equal(recovery.rows[0]?.current_role, role);
    assert.equal(recovery.rows[0]?.marker, 1);
    const result: NegativeResult = {
      sqlstate: captured.code,
      message: captured.message,
      constraint: captured.constraint || undefined,
      connectionReusable: true,
      currentRoleAfterRecovery: recovery.rows[0]!.current_role,
    };
    sqlstateEvidence.push({ id, ...result });
    return result;
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.query("reset role").catch(() => undefined);
    client.release();
  }
}

async function expectScopeError(
  operation: () => Promise<unknown>,
  expectedCode: BusinessScopeResolutionError["code"],
  expectedCount: number,
) {
  let captured: BusinessScopeResolutionError | undefined;
  try {
    await operation();
  } catch (error) {
    assert.ok(error instanceof BusinessScopeResolutionError);
    captured = error;
  }
  assert.ok(captured, `Expected ${expectedCode}`);
  assert.equal(captured.code, expectedCode);
  assert.equal(captured.observedCount, expectedCount);
  return captured;
}

async function attemptIneffectiveGrant(pool: Pool) {
  const client = await pool.connect();
  const notices: Array<{ code?: string; message?: string }> = [];
  client.on("notice", (notice) => {
    notices.push({ code: notice.code, message: notice.message });
  });
  try {
    await client.query("set role barber_runtime");
    await client.query("begin");
    await client.query("grant select on app_private.service to anon");
    await client.query("commit");
    const recovery = await client.query<{ current_role: string; marker: number }>(
      "select current_user as current_role, 1::integer as marker",
    );
    assert.equal(recovery.rows[0]?.current_role, "barber_runtime");
    assert.equal(recovery.rows[0]?.marker, 1);
    const privilege = await client.query<{ allowed: boolean }>(
      "select has_table_privilege('anon', 'app_private.service', 'SELECT') as allowed",
    );
    assert.equal(privilege.rows[0]?.allowed, false);
    await client.query("reset role");
    const warning = notices.find((notice) => notice.code === "01007");
    assert.ok(warning, "Expected privilege_not_granted warning 01007");
    return {
      warningSqlstate: warning.code!,
      warningMessage: warning.message ?? "no privileges were granted",
      aclChanged: false,
      connectionReusable: true,
    };
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.query("reset role").catch(() => undefined);
    client.release();
  }
}

async function seedTwoBusinesses(pool: Pool) {
  await pool.query(`
    insert into app_private.business (
      id, public_name, admin_auth_user_id,
      public_booking_enabled, operational_enabled
    ) values
      ('${IDS.businessA}', 'Business A', '${IDS.adminA}', true, true),
      ('${IDS.businessB}', 'Business B', '${IDS.adminB}', true, true);

    insert into app_private.service (id, business_id, name) values
      ('${IDS.serviceA}', '${IDS.businessA}', 'Service A'),
      ('${IDS.serviceB}', '${IDS.businessB}', 'Service B');

    insert into app_private.customer (id, business_id, display_name) values
      ('${IDS.customerA}', '${IDS.businessA}', 'Customer A'),
      ('${IDS.customerB}', '${IDS.businessB}', 'Customer B');

    insert into app_private.appointment (
      id, business_id, service_id, customer_id
    ) values (
      '${IDS.appointmentA}', '${IDS.businessA}',
      '${IDS.serviceA}', '${IDS.customerA}'
    );

    insert into app_private.schedule_occupancy (
      id, business_id, appointment_id
    ) values (
      '${IDS.occupancyA}', '${IDS.businessA}', '${IDS.appointmentA}'
    );
  `);
}

async function readPrivilegeMatrix(pool: Pool) {
  const roles = ["barber_runtime", "anon", "authenticated", "service_role"];
  const schemas = ["app_private", "public", "external_private"];
  const tables = [
    "app_private.business",
    "app_private.service",
    "app_private.customer",
    "app_private.appointment",
    "app_private.schedule_occupancy",
    "public.spk006_public_probe",
    "external_private.secret_probe",
  ];
  const privileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
  const roleAttributes = await pool.query<{
    rolname: string;
    rolsuper: boolean;
    rolinherit: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolcanlogin: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    rolconnlimit: number;
  }>(`
    select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
           rolcanlogin, rolreplication, rolbypassrls, rolconnlimit
    from pg_roles where rolname = 'barber_runtime'
  `);
  const schemaMatrix: Record<string, Record<string, boolean>> = {};
  for (const role of roles) {
    schemaMatrix[role] = {};
    for (const schema of schemas) {
      const result = await pool.query<{ allowed: boolean }>(
        "select has_schema_privilege($1, $2, 'USAGE') as allowed",
        [role, schema],
      );
      schemaMatrix[role]![schema] = result.rows[0]!.allowed;
    }
  }
  const tableMatrix: Record<string, Record<string, Record<string, boolean>>> = {};
  for (const role of roles) {
    tableMatrix[role] = {};
    for (const table of tables) {
      tableMatrix[role]![table] = {};
      for (const privilege of privileges) {
        const result = await pool.query<{ allowed: boolean }>(
          "select has_table_privilege($1, $2, $3) as allowed",
          [role, table, privilege],
        );
        tableMatrix[role]![table]![privilege] = result.rows[0]!.allowed;
      }
    }
  }
  const businessColumns = await pool.query<{
    column_name: string;
    can_update: boolean;
  }>(`
    select column_name,
           has_column_privilege(
             'barber_runtime',
             'app_private.business',
             column_name,
             'UPDATE'
           ) as can_update
    from information_schema.columns
    where table_schema = 'app_private' and table_name = 'business'
    order by ordinal_position
  `);
  const domainColumns = await pool.query<{
    table_name: string;
    column_name: string;
    can_insert: boolean;
    can_update: boolean;
  }>(`
    select table_name, column_name,
           has_column_privilege(
             'barber_runtime',
             format('app_private.%I', table_name),
             column_name,
             'INSERT'
           ) as can_insert,
           has_column_privilege(
             'barber_runtime',
             format('app_private.%I', table_name),
             column_name,
             'UPDATE'
           ) as can_update
    from information_schema.columns
    where table_schema = 'app_private'
      and table_name in (
        'service', 'customer', 'appointment', 'schedule_occupancy'
      )
    order by table_name, ordinal_position
  `);
  return {
    roleAttributes: roleAttributes.rows[0],
    schemaUsage: schemaMatrix,
    tablePrivileges: tableMatrix,
    businessColumnUpdate: businessColumns.rows,
    domainColumnPrivileges: domainColumns.rows,
  };
}

async function main() {
  const spikeRoot = path.resolve(import.meta.dirname, "..");
  const evidenceDir = path.join(spikeRoot, "evidence");
  await mkdir(evidenceDir, { recursive: true });

  const mounted = mountAsciiWorkspacePath(spikeRoot);
  const port = await findFreeTcpPort();
  const { instance, databaseDir } = createEmbeddedPostgres(mounted.runtimeRoot, port);
  let pool: Pool | undefined;
  let runtimePool: Pool | undefined;
  try {
    await instance.initialise();
    await instance.start();
    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
    const migration = await applyMigrationsWithSupabaseCli(spikeRoot, databaseUrl);
    pool = new Pool({ connectionString: databaseUrl, max: 8 });
    const runtimePassword = randomBytes(24).toString("hex");
    await pool.query(`
      create role barber_runtime_harness_login
        login noinherit nosuperuser nocreatedb nocreaterole
        noreplication nobypassrls
        password '${runtimePassword}';
      grant barber_runtime to barber_runtime_harness_login;
    `);
    runtimePool = new Pool({
      host: "127.0.0.1",
      port,
      database: "postgres",
      user: "barber_runtime_harness_login",
      password: runtimePassword,
      ssl: false,
      max: 4,
    });

    const version = await pool.query<{
      server_version: string;
      server_version_num: string;
    }>("select current_setting('server_version') as server_version, current_setting('server_version_num') as server_version_num");
    const migrationHistory = await pool.query<{ version: string; name: string }>(`
      select version, name from supabase_migrations.schema_migrations order by version
    `);
    await seedTwoBusinesses(pool);

    const compiler = await runCommand(
      process.execPath,
      [path.join(spikeRoot, "node_modules", "typescript", "bin", "tsc"), "--noEmit"],
      { cwd: spikeRoot },
    );
    assert.equal(compiler.exitCode, 0, compiler.stderr || compiler.stdout);
    record(
      "scope-static-contract",
      "BusinessScope is mandatory at repository construction",
      "The compiler rejects missing, raw-string, and lookalike scopes",
      "tsc exited 0 while three @ts-expect-error assertions were consumed",
    );

    await withRole(runtimePool, "barber_runtime", async (client) => {
      const identity = await client.query<{
        session_user: string;
        current_user: string;
      }>("select session_user, current_user");
      assert.deepEqual(identity.rows[0], {
        session_user: "barber_runtime_harness_login",
        current_user: "barber_runtime",
      });
      record(
        "runtime-real-login",
        "Runtime tests use a separately authenticated PostgreSQL connection",
        "The session login is unprivileged and can assume only barber_runtime",
        `session_user=${identity.rows[0]!.session_user}; current_user=${identity.rows[0]!.current_user}`,
      );
      const error = await expectScopeError(
        () => resolvePublicBusiness(asQueryable(client), { business_id: IDS.businessA }),
        "BUSINESS_SCOPE_AMBIGUOUS",
        2,
      );
      record(
        "public-singleton-ambiguous",
        "Public resolver fails closed with two public Businesses",
        "No browser-provided id selects one of two candidates",
        `${error.code}; observedCount=${error.observedCount}`,
      );
    });

    await pool.query(
      "update app_private.business set public_booking_enabled = false where id = $1",
      [IDS.businessB],
    );

    let scopeA: BusinessScope | undefined;
    let scopeB: BusinessScope | undefined;
    await withRole(runtimePool, "barber_runtime", async (client) => {
      scopeA = await resolvePublicBusiness(asQueryable(client), {
        business_id: IDS.businessB,
        nested: { business_id: IDS.businessB },
      });
      assert.equal(scopeA.businessId, IDS.businessA);
      assert.equal(scopeA.source, "PUBLIC_SINGLETON");
      scopeB = await resolveAdminBusiness(asQueryable(client), IDS.adminB);
      assert.equal(scopeB.businessId, IDS.businessB);
      assert.equal(scopeB.source, "ADMIN_AUTH");
      const adminError = await expectScopeError(
        () => resolveAdminBusiness(asQueryable(client), IDS.unknownAdmin),
        "ADMIN_NOT_AUTHORIZED",
        0,
      );
      record(
        "public-input-ignored",
        "Public Business is resolved server-side",
        "An untrusted browser business_id cannot override the singleton",
        `malicious target=${IDS.businessB}; resolved=${scopeA.businessId}`,
      );
      record(
        "admin-auth-resolution",
        "Admin Business is resolved from admin_auth_user_id",
        "Known admin maps to its Business; unknown admin fails closed",
        `known=${scopeB.businessId}; unknown=${adminError.code}`,
      );
    });
    assert.ok(scopeA && scopeB);

    await pool.query(
      "update app_private.business set public_booking_enabled = false where id = $1",
      [IDS.businessA],
    );
    await withRole(runtimePool, "barber_runtime", async (client) => {
      const error = await expectScopeError(
        () => resolvePublicBusiness(asQueryable(client)),
        "BUSINESS_SCOPE_NOT_FOUND",
        0,
      );
      record(
        "public-singleton-missing",
        "Public resolver fails closed with zero eligible Businesses",
        "Zero candidates returns an application error, not an unscoped query",
        error.code,
      );
    });
    await pool.query(
      "update app_private.business set public_booking_enabled = true where id = $1",
      [IDS.businessA],
    );

    await withRole(runtimePool, "barber_runtime", async (client) => {
      const reposA = repositoriesFor(asQueryable(client), scopeA!);
      const servicesA = await reposA.listServices();
      assert.deepEqual(servicesA.map((row) => row.business_id), [IDS.businessA]);
      assert.equal(await reposA.findService(IDS.serviceB), undefined);
      assert.equal(await reposA.updateServiceName(IDS.serviceB, "crossed"), 0);

      const reposB = repositoriesFor(asQueryable(client), scopeB!);
      assert.equal(await reposB.findService(IDS.serviceA), undefined);
      const raw = await client.query<{ business_id: string }>(
        "select distinct business_id from app_private.service order by business_id",
      );
      assert.deepEqual(raw.rows.map((row) => row.business_id), [IDS.businessA, IDS.businessB]);
      record(
        "two-business-isolation",
        "Repository queries isolate two test Businesses",
        "Lists, reads, and writes always include the resolved scope",
        "A lists only A; A cannot read/update B; B cannot read A",
      );
      record(
        "unscoped-runtime-risk",
        "Direct runtime SQL is intentionally not tenant-isolated",
        "The experiment identifies that row filtering belongs to Persistence/Application",
        `raw authorized SQL observed ${raw.rows.length} Businesses; repository SQL observed one`,
      );
    });

    const crossService = await expectDatabaseError(
      runtimePool,
      "composite-fk-service",
      "barber_runtime",
      `insert into app_private.appointment
       (id, business_id, service_id, customer_id)
       values ($1, $2, $3, $4)`,
      [IDS.appointmentCrossService, IDS.businessA, IDS.serviceB, IDS.customerA],
      "23503",
      "appointment_service_business_fk",
    );
    record(
      "composite-fk-service",
      "Appointment cannot reference a Service from another Business",
      "Composite FK rejects the insert",
      `${crossService.message}; connectionReusable=${crossService.connectionReusable}`,
      { sqlstate: crossService.sqlstate, constraint: crossService.constraint },
    );

    const crossCustomer = await expectDatabaseError(
      runtimePool,
      "composite-fk-customer",
      "barber_runtime",
      `insert into app_private.appointment
       (id, business_id, service_id, customer_id)
       values ($1, $2, $3, $4)`,
      [IDS.appointmentCrossCustomer, IDS.businessA, IDS.serviceA, IDS.customerB],
      "23503",
      "appointment_customer_business_fk",
    );
    record(
      "composite-fk-customer",
      "Appointment cannot reference a Customer from another Business",
      "Composite FK rejects the insert",
      `${crossCustomer.message}; connectionReusable=${crossCustomer.connectionReusable}`,
      { sqlstate: crossCustomer.sqlstate, constraint: crossCustomer.constraint },
    );

    const crossOccupancy = await expectDatabaseError(
      runtimePool,
      "composite-fk-occupancy",
      "barber_runtime",
      `insert into app_private.schedule_occupancy
       (id, business_id, appointment_id) values ($1, $2, $3)`,
      [IDS.occupancyCross, IDS.businessB, IDS.appointmentA],
      "23503",
      "schedule_occupancy_appointment_business_fk",
    );
    record(
      "composite-fk-occupancy",
      "ScheduleOccupancy cannot cross the Appointment Business",
      "Composite FK rejects the insert",
      `${crossOccupancy.message}; connectionReusable=${crossOccupancy.connectionReusable}`,
      { sqlstate: crossOccupancy.sqlstate, constraint: crossOccupancy.constraint },
    );

    const unauthorizedOperations = [
      {
        id: "runtime-create-table",
        sql: "create table app_private.runtime_ddl_probe (id integer)",
      },
      { id: "runtime-create-schema", sql: "create schema runtime_owned" },
      {
        id: "runtime-alter-table",
        sql: "alter table app_private.service add column injected text",
      },
      { id: "runtime-set-role", sql: "set role postgres" },
      {
        id: "runtime-external-schema",
        sql: "select * from external_private.secret_probe",
      },
      {
        id: "runtime-public-probe",
        sql: "select * from public.spk006_public_probe",
      },
      {
        id: "runtime-delete",
        sql: `delete from app_private.schedule_occupancy where id = '${IDS.occupancyA}'`,
      },
      {
        id: "runtime-insert-business",
        sql: `insert into app_private.business
              (id, public_name, admin_auth_user_id)
              values ('90000000-0000-4000-8000-000000000001', 'injected',
                      '90000000-0000-4000-8000-000000000002')`,
      },
      {
        id: "runtime-change-admin-owner",
        sql: `update app_private.business
              set admin_auth_user_id = '${IDS.unknownAdmin}'
              where id = '${IDS.businessA}'`,
      },
      {
        id: "runtime-change-service-business",
        sql: `update app_private.service
              set business_id = '${IDS.businessB}'
              where id = '${IDS.serviceA}'`,
      },
      {
        id: "runtime-change-customer-business",
        sql: `update app_private.customer
              set business_id = '${IDS.businessB}'
              where id = '${IDS.customerA}'`,
      },
      {
        id: "runtime-change-appointment-business",
        sql: `update app_private.appointment
              set business_id = '${IDS.businessB}'
              where id = '${IDS.appointmentA}'`,
      },
      {
        id: "runtime-repoint-occupancy",
        sql: `update app_private.schedule_occupancy
              set appointment_id = '${IDS.appointmentRuntime}'
              where id = '${IDS.occupancyA}'`,
      },
    ] as const;
    for (const attempt of unauthorizedOperations) {
      const denied = await expectDatabaseError(
        runtimePool,
        attempt.id,
        "barber_runtime",
        attempt.sql,
        [],
        "42501",
      );
      record(
        attempt.id,
        `Unauthorized runtime operation: ${attempt.id}`,
        "PostgreSQL rejects it with insufficient_privilege",
        `${denied.message}; connectionReusable=${denied.connectionReusable}`,
        { sqlstate: denied.sqlstate },
      );
    }

    const ineffectiveGrant = await attemptIneffectiveGrant(runtimePool);
    sqlstateEvidence.push({
      id: "runtime-grant",
      sqlstate: ineffectiveGrant.warningSqlstate,
      message: ineffectiveGrant.warningMessage,
      connectionReusable: ineffectiveGrant.connectionReusable,
      currentRoleAfterRecovery: "barber_runtime",
    });
    record(
      "runtime-grant",
      "Runtime cannot delegate its SELECT privilege",
      "The target role receives no ACL even if PostgreSQL accepts the GRANT statement",
      `${ineffectiveGrant.warningMessage}; aclChanged=${ineffectiveGrant.aclChanged}; connectionReusable=${ineffectiveGrant.connectionReusable}`,
      { sqlstate: ineffectiveGrant.warningSqlstate },
    );

    await withRole(runtimePool, "barber_runtime", async (client) => {
      await client.query(
        `update app_private.business
         set public_name = public_name,
             availability_version = availability_version + 1
         where id = $1`,
        [IDS.businessA],
      );
      await client.query(
        "insert into app_private.service (id, business_id, name) values ($1, $2, $3)",
        [IDS.serviceRuntime, IDS.businessA, "Runtime service"],
      );
      await client.query(
        "insert into app_private.customer (id, business_id, display_name) values ($1, $2, $3)",
        [IDS.customerRuntime, IDS.businessA, "Runtime customer"],
      );
      await client.query(
        `insert into app_private.appointment
         (id, business_id, service_id, customer_id) values ($1, $2, $3, $4)`,
        [IDS.appointmentRuntime, IDS.businessA, IDS.serviceRuntime, IDS.customerRuntime],
      );
      await client.query(
        `insert into app_private.schedule_occupancy
         (id, business_id, appointment_id) values ($1, $2, $3)`,
        [IDS.occupancyRuntime, IDS.businessA, IDS.appointmentRuntime],
      );
      await client.query(
        "update app_private.service set name = $2, version = version + 1 where id = $1",
        [IDS.serviceRuntime, "Runtime service updated"],
      );
      await client.query(
        "update app_private.customer set display_name = $2 where id = $1",
        [IDS.customerRuntime, "Runtime customer updated"],
      );
      await client.query(
        "update app_private.appointment set status = $2 where id = $1",
        [IDS.appointmentRuntime, "COMPLETED"],
      );
      await client.query(
        "update app_private.schedule_occupancy set released_at = now() where id = $1",
        [IDS.occupancyRuntime],
      );
      const count = await client.query<{ count: string }>(
        "select count(*)::text as count from app_private.schedule_occupancy",
      );
      assert.equal(count.rows[0]?.count, "2");
      record(
        "runtime-positive-dml",
        "Minimum runtime role can perform required domain DML",
        "SELECT/INSERT/UPDATE succeed on allowlisted objects and columns",
        "Business safe-column UPDATE and Service/Customer/Appointment/Occupancy INSERT succeeded",
      );
    });

    for (const role of ["anon", "authenticated", "service_role"] as const) {
      const denied = await expectDatabaseError(
        pool,
        `data-api-role-${role}-private-schema`,
        role,
        "select * from app_private.business",
        [],
        "42501",
      );
      record(
        `data-api-role-${role}-private-schema`,
        `${role} cannot access domain tables`,
        "Private schema ACL rejects direct SQL even independently of API schema configuration",
        `${denied.message}; connectionReusable=${denied.connectionReusable}`,
        { sqlstate: denied.sqlstate },
      );
    }
    for (const role of ["anon", "authenticated"] as const) {
      await withRole(pool, role, async (client) => {
        const result = await client.query<{ id: number; label: string }>(
          "select id, label from public.spk006_public_probe",
        );
        assert.deepEqual(result.rows, [{ id: 1, label: "data-api-positive-control" }]);
      });
    }
    record(
      "data-api-positive-control-sql",
      "API roles can access only the intended public positive control",
      "anon/authenticated SELECT succeeds while app_private SELECT fails",
      "Both roles read exactly one RLS-protected public control row",
    );

    const browserConfig = buildBrowserConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "browser-safe-placeholder",
      NEXT_PUBLIC_DATABASE_URL: "postgresql://must-not-be-read",
      DATABASE_URL: "postgresql://server-only",
      DIRECT_DATABASE_URL: "postgresql://server-only",
    });
    assert.deepEqual(Object.keys(browserConfig).sort(), [
      "supabasePublishableKey",
      "supabaseUrl",
    ]);
    assert.deepEqual(browserCapabilities, ["supabase-auth-session"]);
    const browserSource = await readFile(
      path.join(spikeRoot, "src", "browser", "public-config.ts"),
      "utf8",
    );
    assert.doesNotMatch(browserSource, /DATABASE_URL|from\s+["']pg["']|repositories/i);
    const serverConfig = buildServerDatabaseConfig({ DATABASE_URL: databaseUrl });
    assert.equal(serverConfig.databaseUrl, databaseUrl);
    record(
      "browser-no-database-credential",
      "Browser configuration excludes database credentials and domain repositories",
      "Only public Supabase Auth configuration crosses the browser boundary",
      "Static scan and runtime key inspection found no DATABASE_URL, pg, or repository capability",
    );

    const supabaseConfig = await readFile(
      path.join(spikeRoot, "supabase", "config.toml"),
      "utf8",
    );
    const configuredSchemas = supabaseConfig.match(/schemas\s*=\s*\[([^\]]+)\]/)?.[1] ?? "";
    assert.match(configuredSchemas, /"public"/);
    assert.match(configuredSchemas, /"graphql_public"/);
    assert.doesNotMatch(configuredSchemas, /app_private|external_private/);
    record(
      "private-schema-local-config",
      "Private schemas are absent from the configured Data API schema allowlist",
      "Only public and graphql_public are exposed",
      `api.schemas=[${configuredSchemas.trim()}]`,
    );

    const privilegeMatrix = await readPrivilegeMatrix(pool);
    assert.deepEqual(privilegeMatrix.roleAttributes, {
      rolname: "barber_runtime",
      rolsuper: false,
      rolinherit: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolcanlogin: false,
      rolreplication: false,
      rolbypassrls: false,
      rolconnlimit: 12,
    });
    assert.equal(privilegeMatrix.schemaUsage.barber_runtime?.app_private, true);
    assert.equal(privilegeMatrix.schemaUsage.barber_runtime?.external_private, false);
    assert.equal(privilegeMatrix.schemaUsage.anon?.app_private, false);
    assert.equal(privilegeMatrix.tablePrivileges.barber_runtime?.["app_private.service"]?.SELECT, true);
    assert.equal(privilegeMatrix.tablePrivileges.barber_runtime?.["app_private.service"]?.UPDATE, false);
    assert.equal(privilegeMatrix.tablePrivileges.barber_runtime?.["app_private.service"]?.DELETE, false);
    assert.equal(privilegeMatrix.tablePrivileges.barber_runtime?.["public.spk006_public_probe"]?.SELECT, false);
    assert.equal(privilegeMatrix.tablePrivileges.anon?.["public.spk006_public_probe"]?.SELECT, true);
    const sensitiveAdminColumn = privilegeMatrix.businessColumnUpdate.find(
      (column) => column.column_name === "admin_auth_user_id",
    );
    const publicNameColumn = privilegeMatrix.businessColumnUpdate.find(
      (column) => column.column_name === "public_name",
    );
    assert.equal(sensitiveAdminColumn?.can_update, false);
    assert.equal(publicNameColumn?.can_update, true);
    const serviceBusinessColumn = privilegeMatrix.domainColumnPrivileges.find(
      (column) => column.table_name === "service" && column.column_name === "business_id",
    );
    const serviceNameColumn = privilegeMatrix.domainColumnPrivileges.find(
      (column) => column.table_name === "service" && column.column_name === "name",
    );
    const appointmentBusinessColumn = privilegeMatrix.domainColumnPrivileges.find(
      (column) => column.table_name === "appointment" && column.column_name === "business_id",
    );
    const occupancyReleasedColumn = privilegeMatrix.domainColumnPrivileges.find(
      (column) => column.table_name === "schedule_occupancy" && column.column_name === "released_at",
    );
    assert.deepEqual(serviceBusinessColumn, {
      table_name: "service",
      column_name: "business_id",
      can_insert: true,
      can_update: false,
    });
    assert.equal(serviceNameColumn?.can_update, true);
    assert.equal(appointmentBusinessColumn?.can_update, false);
    assert.equal(occupancyReleasedColumn?.can_update, true);
    record(
      "runtime-privilege-matrix",
      "Runtime role has explicit least privileges",
      "No login/admin attributes, no DELETE/DDL, and only allowlisted domain DML",
      "Catalog ACL matrix and role attributes match the declared policy",
    );

    const migrationSql = await readFile(
      path.join(
        spikeRoot,
        "supabase",
        "migrations",
        "20260822213956_spk006_business_scope_private_schema.sql",
      ),
      "utf8",
    );
    assert.match(migrationSql, /alter default privileges for role postgres in schema app_private/);
    assert.match(migrationSql, /revoke all on schema app_private/);
    record(
      "future-object-default-acl",
      "Future app_private objects do not inherit Data API role grants",
      "Migration contains explicit owner-scoped default privilege revokes",
      "Static migration assertion passed; current object ACLs independently verified in pg_catalog",
    );

    const finalState = await pool.query<{
      businesses: string;
      services: string;
      customers: string;
      appointments: string;
      occupancies: string;
    }>(`
      select
        (select count(*)::text from app_private.business) as businesses,
        (select count(*)::text from app_private.service) as services,
        (select count(*)::text from app_private.customer) as customers,
        (select count(*)::text from app_private.appointment) as appointments,
        (select count(*)::text from app_private.schedule_occupancy) as occupancies
    `);
    assert.deepEqual(finalState.rows[0], {
      businesses: "2",
      services: "3",
      customers: "3",
      appointments: "2",
      occupancies: "2",
    });

    const localEvidence = {
      spike: "SPK-006",
      result: "LOCAL_PASS",
      generatedAt: new Date().toISOString(),
      environment: {
        operatingSystem: `${process.platform} ${process.arch}`,
        node: process.version,
        postgres: version.rows[0],
        supabaseCli: "2.115.0",
        driver: "pg 8.23.0",
        topology: "embedded PostgreSQL over real TCP connections",
      },
      migration: {
        command: migration.command,
        exitCode: migration.exitCode,
        history: migrationHistory.rows,
      },
      experiments,
      finalState: finalState.rows[0],
      protectionsByLayer: {
        postgresql: [
          "private schema ACLs",
          "minimal runtime role attributes and object/column grants",
          "composite foreign keys against cross-Business references",
          "transaction abort and explicit rollback after SQL errors",
        ],
        applicationPersistence: [
          "server-side public singleton resolution",
          "admin resolution by admin_auth_user_id",
          "branded mandatory BusinessScope",
          "business_id predicate in every Business-owned repository operation",
        ],
        deliberatelyNotClaimed: [
          "database-enforced row isolation for arbitrary runtime SQL",
          "full multi-tenant routing, membership, or RLS",
          "hosted Data API HTTP behavior (requires managed-environment probe)",
        ],
      },
      secretsPersisted: false,
    };
    await writeFile(
      path.join(evidenceDir, "SPK-006_LOCAL_EVIDENCE.json"),
      `${JSON.stringify(localEvidence, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(evidenceDir, "SPK-006_PRIVILEGE_MATRIX.json"),
      `${JSON.stringify(privilegeMatrix, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(evidenceDir, "SPK-006_SQLSTATE_EVIDENCE.json"),
      `${JSON.stringify(sqlstateEvidence, null, 2)}\n`,
      "utf8",
    );
    console.log(`SPK-006 local result: LOCAL_PASS (${experiments.length} experiments)`);
  } finally {
    if (runtimePool) {
      await runtimePool.end().catch(() => undefined);
    }
    if (pool) {
      await pool.end().catch(() => undefined);
    }
    await stopEmbeddedPostgres(instance, databaseDir).catch((error) => {
      console.error("Failed to stop embedded PostgreSQL cleanly", error);
    });
    mounted.unmount();
  }
}

await main();
