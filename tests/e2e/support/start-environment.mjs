import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";

import { Pool } from "pg";

const ADMIN_USER_ID = "20000000-0000-4000-8000-000000000001";
const WRONG_USER_ID = "20000000-0000-4000-8000-000000000099";
const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const ADMIN_EMAIL = "admin@example.test";
const WRONG_EMAIL = "other@example.test";
const PASSWORD = "e2e-password-strong";
const RUNTIME_LOGIN = "barber_runtime_e2e_login";
const RUNTIME_PASSWORD = "e2e-runtime-password";
const APP_ORIGIN = "http://127.0.0.1:3100";
const AUTH_ORIGIN = "http://127.0.0.1:3201";

const adminDatabaseUrl = process.env.TEST_DATABASE_URL;
assert.ok(adminDatabaseUrl, "TEST_DATABASE_URL is required for the E2E environment");
const parsedDatabaseUrl = new URL(adminDatabaseUrl);
assert.ok(
  parsedDatabaseUrl.hostname === "127.0.0.1" ||
    parsedDatabaseUrl.hostname === "localhost",
  "E2E setup refuses to reset a non-loopback database",
);

const adminPool = new Pool({ connectionString: adminDatabaseUrl, max: 1 });
try {
  await adminPool.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = '${RUNTIME_LOGIN}') then
        create role ${RUNTIME_LOGIN} login inherit password '${RUNTIME_PASSWORD}';
      end if;
    end
    $$;
    alter role ${RUNTIME_LOGIN} login inherit password '${RUNTIME_PASSWORD}';
    grant barber_runtime to ${RUNTIME_LOGIN};
  `);
  await adminPool.query(`
    begin;
    update app_private.blocked_period set active = false where active;
    update app_private.schedule_occupancy
       set released_at = coalesce(released_at, clock_timestamp());
    commit;
  `);
  await adminPool.query("delete from app_private.schedule_occupancy");
  await adminPool.query("delete from app_private.blocked_period");
  await adminPool.query("delete from app_private.exception_working_window");
  await adminPool.query("delete from app_private.date_availability_exception");
  await adminPool.query("delete from app_private.weekly_break");
  await adminPool.query("delete from app_private.weekly_working_window");
  await adminPool.query("delete from app_private.service");
  await adminPool.query("delete from app_private.business");
  await adminPool.query(
    `
      insert into app_private.business (
        id,
        public_name,
        public_description,
        timezone,
        currency_code,
        admin_auth_user_id,
        public_booking_enabled
      ) values ($1, $2, $3, 'America/Sao_Paulo', 'BRL', $4, true)
    `,
    [
      BUSINESS_ID,
      "Estúdio Horizonte",
      "Atendimentos com hora marcada.",
      ADMIN_USER_ID,
    ],
  );
} finally {
  await adminPool.end();
}

const runtimeDatabaseUrl = new URL(adminDatabaseUrl);
runtimeDatabaseUrl.username = RUNTIME_LOGIN;
runtimeDatabaseUrl.password = RUNTIME_PASSWORD;

const nextEnvironment = {
  ...process.env,
  APP_ORIGIN,
  DATABASE_URL: runtimeDatabaseUrl.toString(),
  DB_POOL_MAX: "2",
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_PUBLIC_SUPABASE_URL: AUTH_ORIGIN,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    "sb_publishable_e2e_local_only_123456",
};

function base64url(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function userFor(id, email) {
  const now = "2026-08-23T00:00:00.000Z";
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: now,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
}

function sessionFor(id, email) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;
  const accessToken = [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({
      aud: "authenticated",
      exp: expiresAt,
      iat: issuedAt,
      iss: `${AUTH_ORIGIN}/auth/v1`,
      role: "authenticated",
      session_id: "40000000-0000-4000-8000-000000000001",
      sub: id,
      email,
    }),
    Buffer.from("deterministic-signature", "utf8").toString("base64url"),
  ].join(".");

  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: `refresh-${id}`,
    user: userFor(id, email),
  };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const authServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", AUTH_ORIGIN);

  if (
    request.method === "POST" &&
    url.pathname === "/auth/v1/token" &&
    url.searchParams.get("grant_type") === "password"
  ) {
    const body = await readJson(request);
    if (body.password !== PASSWORD) {
      sendJson(response, 400, {
        code: "invalid_credentials",
        msg: "Invalid login credentials",
      });
      return;
    }

    if (body.email === ADMIN_EMAIL) {
      sendJson(response, 200, sessionFor(ADMIN_USER_ID, ADMIN_EMAIL));
      return;
    }
    if (body.email === WRONG_EMAIL) {
      sendJson(response, 200, sessionFor(WRONG_USER_ID, WRONG_EMAIL));
      return;
    }

    sendJson(response, 400, {
      code: "invalid_credentials",
      msg: "Invalid login credentials",
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/auth/v1/user") {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    try {
      const payload = JSON.parse(
        Buffer.from(token?.split(".")[1] ?? "", "base64url").toString("utf8"),
      );
      const email = payload.sub === ADMIN_USER_ID ? ADMIN_EMAIL : WRONG_EMAIL;
      sendJson(response, 200, userFor(payload.sub, email));
    } catch {
      sendJson(response, 401, { code: "bad_jwt", msg: "Invalid JWT" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/auth/v1/logout") {
    response.writeHead(204);
    response.end();
    return;
  }

  sendJson(response, 404, { code: "not_found", msg: "Not found" });
});

await new Promise((resolve, reject) => {
  authServer.once("error", reject);
  authServer.listen(3201, "127.0.0.1", resolve);
});

const nextCli = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const build = spawn(process.execPath, [nextCli, "build"], {
  cwd: process.cwd(),
  windowsHide: true,
  env: nextEnvironment,
  stdio: ["ignore", "pipe", "pipe"],
});
build.stdout.pipe(process.stdout);
build.stderr.pipe(process.stderr);
const buildExitCode = await new Promise((resolve, reject) => {
  build.once("error", reject);
  build.once("exit", (code) => resolve(code ?? 1));
});
if (buildExitCode !== 0) {
  await new Promise((resolve) => authServer.close(resolve));
  process.exit(buildExitCode);
}

const next = spawn(
  process.execPath,
  [
    nextCli,
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    cwd: process.cwd(),
    windowsHide: true,
    env: nextEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

next.stdout.pipe(process.stdout);
next.stderr.pipe(process.stderr);

let closing = false;
async function close(exitCode = 0) {
  if (closing) return;
  closing = true;
  next.kill();
  await new Promise((resolve) => authServer.close(resolve));
  process.exit(exitCode);
}

process.on("SIGINT", () => void close(0));
process.on("SIGTERM", () => void close(0));
next.on("exit", (code) => void close(code ?? 1));
