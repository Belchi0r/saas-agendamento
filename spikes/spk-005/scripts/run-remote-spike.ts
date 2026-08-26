import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  authorizeBusinessAdmin,
  type AdminBusinessRepository,
} from "../src/server/authorization.js";
import {
  AUTHENTICATED_RESPONSE_HEADERS,
  applyAuthenticatedResponseHeaders,
} from "../src/server/cache-policy.js";
import {
  cookieWriteEvidence,
  RequestCookieJar,
} from "../src/server/cookie-jar.js";
import { validateMutationCsrf } from "../src/server/csrf.js";
import { createRequestScopedSupabaseClient } from "../src/server/request-client.js";
import { testedVersions } from "./versions.js";

const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(spikeRoot, "evidence");

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable is missing: ${name}`);
  }
  return value;
}

function authErrorEvidence(error: unknown): {
  name: string;
  status: number | null;
  code: string | null;
} | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as {
    name?: unknown;
    status?: unknown;
    code?: unknown;
  };
  return {
    name: typeof candidate.name === "string" ? candidate.name : "Error",
    status: typeof candidate.status === "number" ? candidate.status : null,
    code: typeof candidate.code === "string" ? candidate.code : null,
  };
}

function businessRepository(
  authenticatedUserId: string,
  mode: "MATCH" | "NO_MATCH" | "CROSS_SCOPE",
): AdminBusinessRepository {
  return {
    async findByAdminAuthUserId(userId) {
      if (mode === "NO_MATCH" || userId !== authenticatedUserId) {
        return null;
      }
      return {
        id: "spk005-business",
        adminAuthUserId:
          mode === "CROSS_SCOPE"
            ? "00000000-0000-4000-8000-000000000099"
            : authenticatedUserId,
      };
    },
  };
}

function jwtExpiration(accessToken: string): number {
  const parts = accessToken.split(".");
  assert.equal(parts.length, 3, "Supabase access token must be a JWT");
  const payloadPart = parts[1];
  assert.ok(payloadPart);
  const payload = JSON.parse(
    Buffer.from(payloadPart, "base64url").toString("utf8"),
  ) as { exp?: unknown };
  if (typeof payload.exp !== "number") {
    throw new Error("Supabase JWT is missing a numeric exp claim");
  }
  return payload.exp;
}

async function waitForEpochSeconds(target: number): Promise<number> {
  const waitMs = Math.max(0, target * 1_000 - Date.now());
  if (waitMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }
  return waitMs;
}

async function main(): Promise<void> {
  assert.equal(
    required("SPK005_ALLOW_REMOTE_TESTS"),
    "1",
    "Remote mutation guard is not enabled",
  );

  const supabaseUrl = new URL(required("SUPABASE_URL"));
  const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
  const adminEmail = required("SPK005_ADMIN_EMAIL");
  const adminPassword = required("SPK005_ADMIN_PASSWORD");
  const recoveryRedirectUrl = new URL(
    required("SPK005_RECOVERY_REDIRECT_URL"),
  );
  const maxExpiryWaitSeconds = Number(
    required("SPK005_MAX_EXPIRY_WAIT_SECONDS"),
  );

  assert.equal(supabaseUrl.protocol, "https:");
  assert.match(supabaseUrl.hostname, /^[a-z0-9-]+\.supabase\.co$/i);
  assert.match(publishableKey, /^(sb_publishable_|eyJ)/);
  assert.ok(adminEmail.includes("@"));
  assert.ok(adminPassword.length >= 6);
  assert.ok(
    recoveryRedirectUrl.protocol === "https:" ||
      recoveryRedirectUrl.hostname === "localhost",
  );
  assert.ok(Number.isFinite(maxExpiryWaitSeconds));
  assert.ok(maxExpiryWaitSeconds >= 300 && maxExpiryWaitSeconds <= 600);

  const projectRef = supabaseUrl.hostname.split(".")[0];
  assert.ok(projectRef);
  const baseClientInput = {
    supabaseUrl: supabaseUrl.origin,
    publishableKey,
    production: true,
  } as const;

  const absentJar = new RequestCookieJar();
  const absentRequest = createRequestScopedSupabaseClient({
    ...baseClientInput,
    requestId: "absent-session",
    cookieJar: absentJar,
  });
  const absentUser = await absentRequest.client.auth.getUser();
  assert.equal(absentUser.data.user, null);
  assert.ok(absentUser.error);
  const absentAuthorization = await authorizeBusinessAdmin(
    absentRequest.client.auth,
    businessRepository(
      "00000000-0000-4000-8000-000000000001",
      "NO_MATCH",
    ),
  );
  assert.equal(absentAuthorization.status, 401);

  const invalidJar = new RequestCookieJar();
  const invalidRequest = createRequestScopedSupabaseClient({
    ...baseClientInput,
    requestId: "invalid-password",
    cookieJar: invalidJar,
  });
  const invalidLogin = await invalidRequest.client.auth.signInWithPassword({
    email: adminEmail,
    password: `${adminPassword}--spk005-invalid`,
  });
  assert.ok(invalidLogin.error);
  assert.equal(invalidLogin.data.session, null);

  const loginJar = new RequestCookieJar();
  const loginRequest = createRequestScopedSupabaseClient({
    ...baseClientInput,
    requestId: "valid-login",
    cookieJar: loginJar,
  });
  const login = await loginRequest.client.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  assert.equal(login.error, null);
  assert.ok(login.data.user);
  assert.ok(login.data.session);
  assert.ok(loginJar.writes.some(({ value }) => value !== ""));

  const authenticatedUserId = login.data.user.id;
  const loginCookieFingerprint = loginJar.opaqueStateFingerprint();
  const loginCookieWrites = cookieWriteEvidence(loginJar.writes, projectRef);
  for (const write of loginCookieWrites.filter(({ action }) => action === "SET")) {
    assert.equal(write.secure, true);
    assert.equal(write.sameSite, "lax");
    assert.equal(write.httpOnly, false);
    assert.equal(write.path, "/");
  }
  assert.equal(
    loginJar.responseHeaders.get("Cache-Control"),
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );

  const subsequentJar = loginJar.nextRequest();
  const subsequentRequest = createRequestScopedSupabaseClient({
    ...baseClientInput,
    requestId: "subsequent-valid-session",
    cookieJar: subsequentJar,
  });
  const subsequentUser = await subsequentRequest.client.auth.getUser();
  assert.equal(subsequentUser.error, null);
  assert.equal(subsequentUser.data.user?.id, authenticatedUserId);

  const authorized = await authorizeBusinessAdmin(
    subsequentRequest.client.auth,
    businessRepository(authenticatedUserId, "MATCH"),
  );
  assert.equal(authorized.status, 200);
  const wrongBusiness = await authorizeBusinessAdmin(
    subsequentRequest.client.auth,
    businessRepository(authenticatedUserId, "NO_MATCH"),
  );
  assert.equal(wrongBusiness.status, 403);
  const crossedBusiness = await authorizeBusinessAdmin(
    subsequentRequest.client.auth,
    businessRepository(authenticatedUserId, "CROSS_SCOPE"),
  );
  assert.equal(crossedBusiness.status, 403);

  const isolatedAuthenticatedJar = loginJar.nextRequest();
  const isolatedEmptyJar = new RequestCookieJar();
  const isolatedAuthenticated = createRequestScopedSupabaseClient({
    ...baseClientInput,
    requestId: "parallel-authenticated",
    cookieJar: isolatedAuthenticatedJar,
  });
  const isolatedEmpty = createRequestScopedSupabaseClient({
    ...baseClientInput,
    requestId: "parallel-empty",
    cookieJar: isolatedEmptyJar,
  });
  assert.notEqual(isolatedAuthenticated.client, isolatedEmpty.client);
  const [parallelAuthenticated, parallelEmpty] = await Promise.all([
    isolatedAuthenticated.client.auth.getUser(),
    isolatedEmpty.client.auth.getUser(),
  ]);
  assert.equal(parallelAuthenticated.data.user?.id, authenticatedUserId);
  assert.equal(parallelEmpty.data.user, null);

  const beforeRefreshFingerprint = subsequentJar.opaqueStateFingerprint();
  const refresh = await subsequentRequest.client.auth.refreshSession();
  assert.equal(refresh.error, null);
  assert.ok(refresh.data.session);
  assert.equal(refresh.data.user?.id, authenticatedUserId);
  const afterRefreshFingerprint = subsequentJar.opaqueStateFingerprint();
  assert.notEqual(beforeRefreshFingerprint, afterRefreshFingerprint);
  assert.notEqual(loginCookieFingerprint, afterRefreshFingerprint);

  const refreshedNextJar = subsequentJar.nextRequest();
  const refreshedNextRequest = createRequestScopedSupabaseClient({
    ...baseClientInput,
    requestId: "after-refresh",
    cookieJar: refreshedNextJar,
  });
  const refreshedUser = await refreshedNextRequest.client.auth.getUser();
  assert.equal(refreshedUser.error, null);
  assert.equal(refreshedUser.data.user?.id, authenticatedUserId);

  const expiresAt = jwtExpiration(refresh.data.session.access_token);
  assert.equal(refresh.data.session.expires_at, expiresAt);
  const secondsUntilExpiry = expiresAt - Math.floor(Date.now() / 1_000);
  assert.ok(secondsUntilExpiry > 0);
  assert.ok(
    secondsUntilExpiry + 5 <= maxExpiryWaitSeconds,
    `JWT lifetime ${secondsUntilExpiry}s exceeds SPK005_MAX_EXPIRY_WAIT_SECONDS; configure the disposable project's JWT expiry to 300 seconds`,
  );

  const recoveryJar = new RequestCookieJar();
  const recoveryRequest = createRequestScopedSupabaseClient({
    ...baseClientInput,
    requestId: "password-recovery",
    cookieJar: recoveryJar,
  });
  const recovery = await recoveryRequest.client.auth.resetPasswordForEmail(
    adminEmail,
    { redirectTo: recoveryRedirectUrl.toString() },
  );
  assert.equal(recovery.error, null);
  const recoveryCookieWrites = cookieWriteEvidence(
    recoveryJar.writes,
    projectRef,
  );
  assert.ok(
    recoveryCookieWrites.some(
      ({ name, action }) => name.includes("code-verifier") && action === "SET",
    ),
    "PKCE recovery must write a code-verifier cookie",
  );

  const stalePreLogoutSnapshot = refreshedNextJar.snapshot();
  const logoutJar = refreshedNextJar.nextRequest();
  const logoutRequest = createRequestScopedSupabaseClient({
    ...baseClientInput,
    requestId: "logout-global",
    cookieJar: logoutJar,
  });
  const logout = await logoutRequest.client.auth.signOut({ scope: "global" });
  assert.equal(logout.error, null);
  assert.ok(logoutJar.writes.some(({ options }) => options.maxAge === 0));

  const afterLogoutJar = logoutJar.nextRequest();
  const afterLogoutRequest = createRequestScopedSupabaseClient({
    ...baseClientInput,
    requestId: "after-logout-clean-browser",
    cookieJar: afterLogoutJar,
  });
  const afterLogoutUser = await afterLogoutRequest.client.auth.getUser();
  assert.equal(afterLogoutUser.data.user, null);

  const retainedTokenImmediate = createRequestScopedSupabaseClient({
    ...baseClientInput,
    requestId: "retained-pre-logout-token-immediate",
    cookieJar: new RequestCookieJar(stalePreLogoutSnapshot),
  });
  const retainedImmediateUser =
    await retainedTokenImmediate.client.auth.getUser();
  const retainedAccessTokenStillAcceptedBeforeExpiry =
    retainedImmediateUser.data.user?.id === authenticatedUserId;

  const targetExpiry = expiresAt + 2;
  const waitedMilliseconds = await waitForEpochSeconds(targetExpiry);
  const expiredRetainedJar = new RequestCookieJar(stalePreLogoutSnapshot);
  const expiredRetainedRequest = createRequestScopedSupabaseClient({
    ...baseClientInput,
    requestId: "retained-pre-logout-token-expired",
    cookieJar: expiredRetainedJar,
  });
  const expiredRetainedUser =
    await expiredRetainedRequest.client.auth.getUser();
  assert.equal(expiredRetainedUser.data.user, null);
  assert.ok(expiredRetainedUser.error);

  const cacheHeaders = new Headers(loginJar.responseHeaders);
  applyAuthenticatedResponseHeaders(cacheHeaders);
  for (const [name, value] of Object.entries(AUTHENTICATED_RESPONSE_HEADERS)) {
    assert.equal(cacheHeaders.get(name), value);
  }

  const csrfPolicy = {
    allowedOrigins: new Set([recoveryRedirectUrl.origin]),
    allowedHosts: new Set([recoveryRedirectUrl.host]),
    production: recoveryRedirectUrl.protocol === "https:",
    trustForwardedHost: true,
  };
  const validMutation = validateMutationCsrf(
    {
      method: "POST",
      headers: new Headers({
        origin: recoveryRedirectUrl.origin,
        host: recoveryRedirectUrl.host,
      }),
    },
    csrfPolicy,
  );
  const invalidMutation = validateMutationCsrf(
    {
      method: "POST",
      headers: new Headers({
        origin: "https://cross-site.invalid",
        host: recoveryRedirectUrl.host,
      }),
    },
    csrfPolicy,
  );
  assert.equal(validMutation.code, "ALLOWED");
  assert.equal(invalidMutation.code, "ORIGIN_NOT_ALLOWED");

  const evidence = {
    spike: "SPK-005",
    phase: "REMOTE",
    result: "REMOTE_PASS",
    generatedAt: new Date().toISOString(),
    environment: {
      operatingSystem: `${process.platform} ${process.arch}`,
      managedSupabaseAuth: true,
      serviceRoleUsed: false,
      ...(await testedVersions()),
    },
    authentication: {
      absentSession: {
        user: null,
        authorizationStatus: absentAuthorization.status,
        error: authErrorEvidence(absentUser.error),
      },
      invalidPassword: {
        rejected: true,
        session: null,
        error: authErrorEvidence(invalidLogin.error),
      },
      validLogin: {
        accepted: true,
        userStableAcrossRequests: true,
        subsequentGetUserSucceeded: true,
      },
    },
    requestScopedClient: {
      parallelClientsDistinct: true,
      authenticatedClientSawUser: true,
      emptyClientSawUser: false,
      sharedStateObserved: false,
    },
    refresh: {
      succeeded: true,
      cookieStateRotated: true,
      subsequentGetUserSucceeded: true,
      refreshWrites: cookieWriteEvidence(subsequentJar.writes, projectRef),
    },
    expiration: {
      jwtExpClaimMatchedSessionExpiresAt: true,
      secondsUntilExpiryAtMeasurement: secondsUntilExpiry,
      waitedMilliseconds,
      expiredAccessAndRevokedRefreshRejected: true,
      error: authErrorEvidence(expiredRetainedUser.error),
    },
    logout: {
      scope: "global",
      serverAccepted: true,
      cleanBrowserCookiesCleared: afterLogoutJar.snapshot().length === 0,
      nextCleanRequestAuthenticated: false,
      retainedAccessTokenAcceptedBeforeExpiry:
        retainedAccessTokenStillAcceptedBeforeExpiry,
      retainedAccessTokenAcceptedAfterExpiry: false,
      cookieWrites: cookieWriteEvidence(logoutJar.writes, projectRef),
    },
    recovery: {
      requestAcceptedByManagedAuth: true,
      pkceCodeVerifierCookieWritten: true,
      redirectWasConfigured: true,
      emailDeliveryInspected: false,
      linkExchangeCompleted: false,
      cookieWrites: recoveryCookieWrites,
    },
    cookies: {
      beforeLoginCount: 0,
      loginWrites: loginCookieWrites,
      afterLoginCookieCount: loginJar.snapshot().length,
      afterRefreshCookieCount: subsequentJar.snapshot().length,
      afterLogoutCookieCount: afterLogoutJar.snapshot().length,
      valuesPersistedInEvidence: false,
      officialResponseCacheHeadersObserved: {
        cacheControl: loginJar.responseHeaders.get("Cache-Control"),
        expires: loginJar.responseHeaders.get("Expires"),
        pragma: loginJar.responseHeaders.get("Pragma"),
      },
    },
    authorization: {
      authnMethod: "auth.getUser()",
      matchingBusinessStatus: authorized.status,
      nonMatchingBusinessStatus: wrongBusiness.status,
      crossScopedRepositoryStatus: crossedBusiness.status,
      authnAndAuthzSeparated: true,
    },
    cache: Object.fromEntries(cacheHeaders.entries()),
    csrf: {
      validOriginHost: validMutation.code,
      invalidCrossSiteOrigin: invalidMutation.code,
    },
    secrets: {
      serviceRoleRead: false,
      tokenValuesWrittenToEvidence: false,
      emailWrittenToEvidence: false,
      passwordWrittenToEvidence: false,
      projectRefWrittenToEvidence: false,
    },
  };

  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    path.join(evidenceDirectory, "SPK-005_REMOTE_EVIDENCE.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );

  console.log("SPK-005 managed Auth result: REMOTE_PASS");
}

await main();
