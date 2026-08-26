import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

type HttpEvidence = {
  id: string;
  method: "GET" | "POST";
  path: string;
  requestProfile?: string;
  status: number;
  body: unknown;
  attempts: number;
};

function required(name: string): string {
  const value = process.env[name];
  assert.ok(value, `Missing required environment variable: ${name}`);
  return value;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.slice(0, 500);
  }
}

async function probe(
  baseUrl: URL,
  publishableKey: string,
  options: {
    id: string;
    method: "GET" | "POST";
    path: string;
    profile?: string;
    body?: string;
  },
): Promise<HttpEvidence> {
  const response = await fetch(new URL(options.path, baseUrl), {
    method: options.method,
    headers: {
      apikey: publishableKey,
      Accept: "application/json",
      ...(options.profile ? { "Accept-Profile": options.profile } : {}),
      ...(options.method === "POST"
        ? {
            "Content-Type": "application/json",
            ...(options.profile ? { "Content-Profile": options.profile } : {}),
          }
        : {}),
    },
    body: options.body,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const responseText = await response.text();
  return {
    id: options.id,
    method: options.method,
    path: options.path,
    requestProfile: options.profile,
    status: response.status,
    body: safeJson(responseText),
    attempts: 1,
  };
}

async function waitForPositiveControl(
  baseUrl: URL,
  publishableKey: string,
): Promise<HttpEvidence> {
  let last: HttpEvidence | undefined;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    last = await probe(baseUrl, publishableKey, {
      id: "managed-data-api-positive-control",
      method: "GET",
      path: "/rest/v1/spk006_public_probe?select=id,label",
    });
    last.attempts = attempt;
    if (last.status === 200) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  assert.fail(
    `Managed Data API positive control did not become available: ${JSON.stringify(last)}`,
  );
}

function assertPgrst106(result: HttpEvidence) {
  assert.equal(result.status, 406, JSON.stringify(result));
  assert.ok(result.body && typeof result.body === "object", JSON.stringify(result));
  const body = result.body as { code?: string; message?: string };
  assert.equal(body.code, "PGRST106", JSON.stringify(result));
  assert.match(body.message ?? "", /(schema must be one of|invalid schema:)/i);
}

async function privateMetadata(database: Pool) {
  const schema = await database.query<{
    schema_name: string;
    owner: string;
    acl: string | null;
  }>(`
    select n.nspname as schema_name,
           r.rolname as owner,
           n.nspacl::text as acl
    from pg_namespace n
    join pg_roles r on r.oid = n.nspowner
    where n.nspname = 'app_private'
  `);
  const objects = await database.query<{
    object_name: string;
    object_kind: string;
    owner: string;
    acl: string | null;
  }>(`
    select c.relname as object_name,
           c.relkind as object_kind,
           r.rolname as owner,
           c.relacl::text as acl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_roles r on r.oid = c.relowner
    where n.nspname = 'app_private'
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    order by c.relname
  `);
  const apiRolePrivileges = await database.query<{
    role_name: string;
    can_use: boolean;
    can_create: boolean;
  }>(`
    select role_name,
           has_schema_privilege(role_name, 'app_private', 'USAGE') as can_use,
           has_schema_privilege(role_name, 'app_private', 'CREATE') as can_create
    from unnest(array['anon','authenticated','service_role']) role_name
    order by role_name
  `);
  return {
    schema: schema.rows,
    objects: objects.rows,
    apiRolePrivileges: apiRolePrivileges.rows,
  };
}

async function main() {
  assert.equal(
    required("SPK006_ALLOW_REMOTE_TESTS"),
    "1",
    "Remote mutation guard is not enabled",
  );
  assert.equal(
    required("SPK006_ENVIRONMENT_LABEL"),
    "SPK006_DISPOSABLE",
    "The hosted project must be explicitly labelled disposable",
  );

  const directDatabaseUrl = required("DIRECT_DATABASE_URL");
  const supabaseUrl = new URL(required("SUPABASE_URL"));
  const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
  const databaseHost = new URL(directDatabaseUrl).hostname;
  assert.match(supabaseUrl.hostname, /\.supabase\.co$/i);
  assert.doesNotMatch(databaseHost, /^(localhost|127\.0\.0\.1|::1)$/i);
  assert.match(publishableKey, /^(sb_publishable_|eyJ)/);

  const spikeRoot = path.resolve(import.meta.dirname, "..");
  const evidenceDir = path.join(spikeRoot, "evidence");
  const migrationPath = path.join(
    spikeRoot,
    "supabase",
    "migrations",
    "20260823161021_spk006_managed_data_api_probe.sql",
  );
  const migrationSql = await readFile(migrationPath, "utf8");
  const database = new Pool({
    connectionString: directDatabaseUrl,
    max: 3,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 5_000,
    application_name: "spk-006-remote-harness",
  });

  try {
    const preflight = await database.query<{
      app_private_exists: boolean;
      business_exists: boolean;
      probe_exists: boolean;
    }>(`
      select
        to_regnamespace('app_private') is not null as app_private_exists,
        to_regclass('app_private.business') is not null as business_exists,
        to_regclass('public.spk006_public_probe') is not null as probe_exists
    `);
    assert.equal(preflight.rows[0]?.app_private_exists, true);
    assert.equal(preflight.rows[0]?.business_exists, true);

    const privateBefore = await privateMetadata(database);
    const knownObjectNames = privateBefore.objects.map((object) => object.object_name);
    assert.deepEqual(knownObjectNames, [
      "business",
      "schedule_occupancy",
      "transaction_probe",
    ]);

    const migrationAppliedThisRun = !preflight.rows[0]?.probe_exists;
    if (migrationAppliedThisRun) {
      const client = await database.connect();
      try {
        await client.query("begin");
        await client.query(migrationSql);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    } else {
      const existingProbe = await database.query<{
        id: number;
        label: string;
        has_rls: boolean;
        policy_count: string;
      }>(`
        select p.id, p.label, c.relrowsecurity as has_rls,
               (select count(*)::text from pg_policy where polrelid = c.oid)
                 as policy_count
        from public.spk006_public_probe p
        join pg_class c on c.oid = 'public.spk006_public_probe'::regclass
      `);
      assert.deepEqual(existingProbe.rows, [{
        id: 1,
        label: "data-api-positive-control",
        has_rls: true,
        policy_count: "1",
      }]);
    }

    const catalog = await database.query<{
      anon_has_private_usage: boolean;
      authenticated_has_private_usage: boolean;
      service_role_has_private_usage: boolean;
      anon_can_read_probe: boolean;
      authenticated_can_read_probe: boolean;
      probe_has_rls: boolean;
    }>(`
      select
        has_schema_privilege('anon', 'app_private', 'USAGE') as anon_has_private_usage,
        has_schema_privilege('authenticated', 'app_private', 'USAGE')
          as authenticated_has_private_usage,
        has_schema_privilege('service_role', 'app_private', 'USAGE')
          as service_role_has_private_usage,
        has_table_privilege('anon', 'public.spk006_public_probe', 'SELECT')
          as anon_can_read_probe,
        has_table_privilege('authenticated', 'public.spk006_public_probe', 'SELECT')
          as authenticated_can_read_probe,
        c.relrowsecurity as probe_has_rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'spk006_public_probe'
    `);
    assert.deepEqual(catalog.rows[0], {
      anon_has_private_usage: false,
      authenticated_has_private_usage: false,
      service_role_has_private_usage: false,
      anon_can_read_probe: true,
      authenticated_can_read_probe: true,
      probe_has_rls: true,
    });

    const positive = await waitForPositiveControl(supabaseUrl, publishableKey);
    assert.deepEqual(positive.body, [
      { id: 1, label: "data-api-positive-control" },
    ]);

    const privateRead = await probe(supabaseUrl, publishableKey, {
      id: "managed-private-schema-read",
      method: "GET",
      path: "/rest/v1/business?select=id",
      profile: "app_private",
    });
    assertPgrst106(privateRead);

    const injectedBusinessId = "f0000000-0000-4000-8000-000000000001";
    const privateWrite = await probe(supabaseUrl, publishableKey, {
      id: "managed-private-schema-write",
      method: "POST",
      path: "/rest/v1/business",
      profile: "app_private",
      body: JSON.stringify({
        id: injectedBusinessId,
        public_name: "must-not-be-created",
        admin_auth_user_id: "f0000000-0000-4000-8000-000000000002",
      }),
    });
    assertPgrst106(privateWrite);

    const noInjectedBusiness = await database.query<{ count: string }>(
      "select count(*)::text as count from app_private.business where id = $1",
      [injectedBusinessId],
    );
    assert.equal(noInjectedBusiness.rows[0]?.count, "0");

    const privateAfter = await privateMetadata(database);
    assert.deepEqual(
      privateAfter,
      privateBefore,
      "SPK-006 managed probe must not alter prior app_private metadata",
    );

    const evidence = {
      spike: "SPK-006",
      result: "REMOTE_PASS",
      generatedAt: new Date().toISOString(),
      environmentLabel: "SPK006_DISPOSABLE",
      transport: {
        database: "managed PostgreSQL TLS connection",
        dataApi: "managed Supabase REST endpoint over HTTPS",
        projectHostnamePersisted: false,
      },
      migration: {
        file: path.basename(migrationPath),
        scope: "public positive-control object only",
        appliedInSingleTransaction: true,
        appliedThisRun: migrationAppliedThisRun,
        schemaCacheReloadRequested: true,
      },
      priorPrivateInfrastructure: {
        source: "existing disposable-project infrastructure",
        objectNames: knownObjectNames,
        metadataBefore: privateBefore,
        metadataUnchangedAfterProbe: true,
      },
      catalog: catalog.rows[0],
      http: [positive, privateRead, privateWrite],
      negativeWritePersistedRows: noInjectedBusiness.rows[0]?.count,
      conclusion: {
        positiveControlReachable: true,
        appPrivateNotExposed: true,
        privateReadRejectedBeforeObjectAccess: true,
        privateWriteRejectedBeforeObjectAccess: true,
        apiRolesAlsoLackPrivateSchemaAcl: true,
        priorPrivateInfrastructurePreserved: true,
      },
      secretsPersisted: false,
    };
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(
      path.join(evidenceDir, "SPK-006_DATA_API_EVIDENCE.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );
    console.log("SPK-006 managed Data API result: REMOTE_PASS");
  } finally {
    await database.end().catch(() => undefined);
  }
}

await main();
