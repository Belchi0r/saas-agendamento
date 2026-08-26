import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NextResponse } from "next/server";

import {
  authorizeBusinessAdmin,
  type AdminBusinessRepository,
  type ServerAuthVerifier,
} from "../src/server/authorization.js";
import {
  applyAuthenticatedResponseHeaders,
  AUTHENTICATED_RESPONSE_HEADERS,
} from "../src/server/cache-policy.js";
import { RequestCookieJar } from "../src/server/cookie-jar.js";
import { validateMutationCsrf } from "../src/server/csrf.js";
import { applySupabaseCookieBatch } from "../src/server/next-response.js";
import {
  AUTH_COOKIE_POLICY,
  createRequestScopedSupabaseClient,
} from "../src/server/request-client.js";
import { testedVersions } from "./versions.js";

const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(spikeRoot, "evidence");

function fakeAuth(
  userId: string | null,
  error: unknown = null,
): ServerAuthVerifier {
  return {
    async getUser() {
      return {
        data: { user: userId ? { id: userId } : null },
        error,
      };
    },
  };
}

function businessRepository(
  expectedUserId: string,
  returnedAdminId = expectedUserId,
): AdminBusinessRepository {
  return {
    async findByAdminAuthUserId(authUserId) {
      if (authUserId !== expectedUserId) {
        return null;
      }
      return {
        id: "business-a",
        adminAuthUserId: returnedAdminId,
      };
    },
  };
}

function request(
  method: string,
  headers: Record<string, string>,
): Pick<Request, "method" | "headers"> {
  return { method, headers: new Headers(headers) };
}

async function main(): Promise<void> {
  const adminId = "10000000-0000-4000-8000-000000000001";
  const otherId = "20000000-0000-4000-8000-000000000002";

  const validAdmin = await authorizeBusinessAdmin(
    fakeAuth(adminId),
    businessRepository(adminId),
  );
  assert.deepEqual(validAdmin, {
    ok: true,
    status: 200,
    userId: adminId,
    businessId: "business-a",
  });

  const missingSession = await authorizeBusinessAdmin(
    fakeAuth(null, new Error("session missing")),
    businessRepository(adminId),
  );
  assert.deepEqual(missingSession, {
    ok: false,
    status: 401,
    code: "AUTHENTICATION_REQUIRED",
  });

  const wrongAuthenticatedUser = await authorizeBusinessAdmin(
    fakeAuth(otherId),
    businessRepository(adminId),
  );
  assert.deepEqual(wrongAuthenticatedUser, {
    ok: false,
    status: 403,
    code: "BUSINESS_ADMIN_MISMATCH",
  });

  const crossBusinessInvariant = await authorizeBusinessAdmin(
    fakeAuth(adminId),
    businessRepository(adminId, otherId),
  );
  assert.deepEqual(crossBusinessInvariant, {
    ok: false,
    status: 403,
    code: "BUSINESS_SCOPE_INVARIANT_FAILED",
  });

  const requestClients = Array.from({ length: 32 }, (_, index) => {
    const jar = new RequestCookieJar([
      { name: `request-probe-${index}`, value: `isolated-${index}` },
    ]);
    return createRequestScopedSupabaseClient({
      requestId: `request-${index}`,
      supabaseUrl: "https://spk005.invalid",
      publishableKey: "sb_publishable_spk005_local_probe",
      cookieJar: jar,
      production: index % 2 === 0,
    });
  });

  assert.equal(new Set(requestClients.map(({ client }) => client)).size, 32);
  assert.equal(new Set(requestClients.map(({ cookieJar }) => cookieJar)).size, 32);
  await Promise.all(
    requestClients.map(async ({ client, cookieJar }, index) => {
      const { data } = await client.auth.getSession();
      assert.equal(data.session, null);
      assert.deepEqual(cookieJar.snapshot(), [
        { name: `request-probe-${index}`, value: `isolated-${index}` },
      ]);
    }),
  );

  const policy = {
    allowedOrigins: new Set([
      "https://admin.example.test",
      "https://alternate.example.test",
    ]),
    allowedHosts: new Set(["admin.example.test"]),
    production: true,
    trustForwardedHost: true,
  };

  const csrfCases = [
    {
      id: "valid-origin-host",
      request: request("POST", {
        origin: "https://admin.example.test",
        host: "admin.example.test",
      }),
      expected: "ALLOWED",
    },
    {
      id: "valid-forwarded-host",
      request: request("PATCH", {
        origin: "https://admin.example.test",
        host: "internal-proxy.test",
        "x-forwarded-host": "admin.example.test",
      }),
      expected: "ALLOWED",
    },
    {
      id: "get-never-mutates",
      request: request("GET", {
        origin: "https://admin.example.test",
        host: "admin.example.test",
      }),
      expected: "MUTATION_METHOD_REQUIRED",
    },
    {
      id: "origin-required",
      request: request("POST", { host: "admin.example.test" }),
      expected: "ORIGIN_REQUIRED",
    },
    {
      id: "cross-site-origin",
      request: request("POST", {
        origin: "https://evil.example.test",
        host: "admin.example.test",
      }),
      expected: "ORIGIN_NOT_ALLOWED",
    },
    {
      id: "host-injection",
      request: request("POST", {
        origin: "https://evil.example.test",
        host: "evil.example.test",
      }),
      expected: "HOST_NOT_ALLOWED",
    },
    {
      id: "origin-host-mismatch",
      request: request("DELETE", {
        origin: "https://alternate.example.test",
        host: "admin.example.test",
      }),
      expected: "ORIGIN_HOST_MISMATCH",
    },
    {
      id: "https-required-production",
      request: request("PUT", {
        origin: "http://admin.example.test",
        host: "admin.example.test",
      }),
      expected: "HTTPS_ORIGIN_REQUIRED",
    },
  ].map((testCase) => {
    const result = validateMutationCsrf(testCase.request, policy);
    assert.equal(result.code, testCase.expected, testCase.id);
    return {
      id: testCase.id,
      expected: testCase.expected,
      observed: result.code,
      status: "PASS",
    };
  });

  const response = NextResponse.json({ ok: true });
  applySupabaseCookieBatch(
    response,
    [
      {
        name: "sb-spk005-auth-token",
        value: "opaque-local-probe",
        options: {
          ...AUTH_COOKIE_POLICY,
          secure: true,
        },
      },
    ],
    {
      "Cache-Control":
        "private, no-cache, no-store, must-revalidate, max-age=0",
      Expires: "0",
      Pragma: "no-cache",
    },
  );
  applyAuthenticatedResponseHeaders(response.headers);

  const serializedCookie = response.headers.get("set-cookie");
  assert.ok(serializedCookie);
  assert.match(serializedCookie, /Path=\//i);
  assert.match(serializedCookie, /SameSite=lax/i);
  assert.match(serializedCookie, /Secure/i);
  assert.doesNotMatch(serializedCookie, /HttpOnly/i);
  for (const [name, value] of Object.entries(AUTHENTICATED_RESPONSE_HEADERS)) {
    assert.equal(response.headers.get(name), value);
  }

  const ssrDefaultsSource = await readFile(
    path.join(
      spikeRoot,
      "node_modules",
      "@supabase",
      "ssr",
      "src",
      "utils",
      "constants.ts",
    ),
    "utf8",
  );
  assert.match(ssrDefaultsSource, /path:\s*["']\/["']/);
  assert.match(ssrDefaultsSource, /sameSite:\s*["']lax["']/);
  assert.match(ssrDefaultsSource, /httpOnly:\s*false/);
  assert.doesNotMatch(ssrDefaultsSource, /secure:\s*true/);

  const nextActionSource = await readFile(
    path.join(
      spikeRoot,
      "node_modules",
      "next",
      "dist",
      "server",
      "app-render",
      "action-handler.js",
    ),
    "utf8",
  );
  assert.match(nextActionSource, /originHost !== host\.value/);
  assert.match(nextActionSource, /Invalid Server Actions request\./);
  assert.match(nextActionSource, /Missing `origin` header/);
  assert.match(nextActionSource, /We'll let this through but log a warning\./);
  assert.match(nextActionSource, /fetchCache = 'default-no-store'/);

  const requestClientSource = await readFile(
    path.join(spikeRoot, "src", "server", "request-client.ts"),
    "utf8",
  );
  const browserSource = await readFile(
    path.join(spikeRoot, "src", "browser", "admin-auth.ts"),
    "utf8",
  );
  assert.equal(
    requestClientSource.match(/createServerClient\(/g)?.length,
    1,
    "the SSR client must only be constructed inside the request factory",
  );
  assert.doesNotMatch(browserSource, /\.from\s*\(/);
  assert.doesNotMatch(browserSource, /service_role|admin_auth_user_id/i);

  const cases = [
    {
      id: "authn-missing-session",
      expected: "401",
      observed: `${missingSession.status}`,
      status: "PASS",
    },
    {
      id: "authn-valid-authz-valid",
      expected: "200",
      observed: `${validAdmin.status}`,
      status: "PASS",
    },
    {
      id: "authn-valid-authz-wrong-user",
      expected: "403",
      observed: `${wrongAuthenticatedUser.status}`,
      status: "PASS",
    },
    {
      id: "cross-business-fail-closed",
      expected: "403 invariant failure",
      observed: crossBusinessInvariant.ok
        ? "unexpected success"
        : crossBusinessInvariant.code,
      status: "PASS",
    },
    {
      id: "request-scoped-clients",
      expected: "32 clients and cookie jars with no shared identity",
      observed: "32 distinct clients and 32 isolated jars",
      status: "PASS",
    },
    {
      id: "official-cookie-defaults",
      expected: "path=/, SameSite=Lax, HttpOnly=false, no Secure default",
      observed: "exact defaults found in @supabase/ssr 0.12.4 source",
      status: "PASS",
    },
    {
      id: "production-cookie-serialization",
      expected: "Secure; SameSite=Lax; no HttpOnly claim",
      observed: "NextResponse serialized the explicit policy",
      status: "PASS",
    },
    {
      id: "authenticated-cache-policy",
      expected: "private/no-store for browser, CDN, and Vercel",
      observed: "all explicit response headers preserved",
      status: "PASS",
    },
    {
      id: "next-server-action-csrf",
      expected: "origin/host mismatch aborts; default no-store",
      observed:
        "Next 16.3.2 aborts mismatch but only warns on missing Origin",
      status: "PASS",
    },
    {
      id: "browser-domain-boundary",
      expected: "browser wrapper exposes Auth only",
      observed: "no domain .from(), service role, or Business authorization",
      status: "PASS",
    },
    ...csrfCases,
  ];

  const evidence = {
    spike: "SPK-005",
    phase: "LOCAL",
    result: "LOCAL_PASS",
    generatedAt: new Date().toISOString(),
    environment: {
      operatingSystem: `${process.platform} ${process.arch}`,
      ...(await testedVersions()),
    },
    summary: {
      passed: cases.length,
      failed: 0,
      remoteAuthRequiredForFinalDecision: true,
    },
    cases,
    requestScopedClient: {
      simultaneousClients: 32,
      distinctClientObjects: 32,
      distinctCookieJars: 32,
      sharedSessionStateObserved: false,
    },
    cookiePolicy: {
      officialDefaults: {
        path: "/",
        sameSite: "lax",
        httpOnly: false,
        secure: "UNSET_BY_DEFAULT",
        maxAgeSeconds: 34_560_000,
      },
      productionOverride: {
        secure: true,
        sameSite: "lax",
        httpOnly: false,
      },
      nextResponseSerialization: {
        path: true,
        sameSiteLax: true,
        secure: true,
        httpOnly: false,
      },
    },
    cachePolicy: AUTHENTICATED_RESPONSE_HEADERS,
    csrf: {
      routeHandlerCases: csrfCases,
      nextServerActions: {
        mismatchedOriginHostAborted: true,
        missingOriginRejected: false,
        missingOriginBehavior: "warning and allow",
        defaultFetchCache: "default-no-store",
        applicationRouteHandlerPolicyIsStricter: true,
      },
    },
    authnAuthz: {
      serverRevalidationMethod: "auth.getUser()",
      getSessionUsedForAuthorization: false,
      businessAuthorizationSeparate: true,
      mismatchFailsClosed: true,
    },
    browserBoundary: {
      authOnlyWrapper: true,
      domainTableApiCalls: 0,
      serviceRoleReferenced: false,
    },
  };

  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    path.join(evidenceDirectory, "SPK-005_LOCAL_EVIDENCE.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );

  console.log(`SPK-005 local result: LOCAL_PASS (${cases.length} cases)`);
}

await main();

