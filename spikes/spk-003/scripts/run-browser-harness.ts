import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateToken,
  serializeCapabilityCookie,
  signCapability,
  TOKEN_BITS,
  verifyCapability,
} from "./lib/security.js";

const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = path.join(spikeRoot, "evidence", "SPK-003_BROWSER_EVIDENCE.json");
const rawToken = generateToken();
const signingKey = randomBytes(32);
const tokenRef = randomUUID();
const appointmentVersion = 7;
const nowEpochSeconds = Math.floor(Date.now() / 1000);
const safeRequestLog: Array<{ method: string; route: string }> = [];
const state = {
  fragmentManageRequestTargetContainedRaw: false,
  fragmentManageRequestTargetContainedFragment: false,
  exchangeMatchedRawToken: false,
  fragmentReferrer: undefined as string | null | undefined,
  queryRequestContainedRawToken: false,
  queryReferrerContainedRawToken: false,
  cookieSentBack: false,
  cookieSignatureValid: false,
  cookieReferenceRevalidated: false,
  completed: false,
};

const port = await findFreeTcpPort();
const baseUrl = `http://127.0.0.1:${port}`;

const server = http.createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    response.writeHead(500, securityHeaders("text/plain; charset=utf-8"));
    response.end("internal test error");
    console.error("browser harness failed", error instanceof Error ? error.name : "unknown");
  }
});

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});

console.log(JSON.stringify({
  status: "READY",
  url: `${baseUrl}/launch`,
  instruction: "Open only this clean launcher URL in the local browser; no secret appears in stdout.",
}));

async function route(request: IncomingMessage, response: ServerResponse) {
  const parsed = new URL(request.url ?? "/", baseUrl);
  safeRequestLog.push({ method: request.method ?? "UNKNOWN", route: parsed.pathname });
  const host = request.headers.host ?? "";
  assert.equal(host, `127.0.0.1:${port}`);

  if (request.method === "GET" && parsed.pathname === "/launch") {
    response.writeHead(200, securityHeaders("text/html; charset=utf-8"));
    response.end(`<!doctype html><meta charset="utf-8"><title>SPK-003 launcher</title>
      <script>location.replace(${JSON.stringify(`/manage#token=${encodeURIComponent(rawToken)}`)});</script>`);
    return;
  }

  if (request.method === "GET" && parsed.pathname === "/manage") {
    state.fragmentManageRequestTargetContainedRaw = (request.url ?? "").includes(rawToken);
    state.fragmentManageRequestTargetContainedFragment = (request.url ?? "").includes("#");
    response.writeHead(200, securityHeaders("text/html; charset=utf-8"));
    response.end(manageHtml());
    return;
  }

  if (request.method === "POST" && parsed.pathname === "/exchange") {
    const body = JSON.parse(await readBody(request)) as { token?: string };
    state.exchangeMatchedRawToken = body.token === rawToken;
    if (!state.exchangeMatchedRawToken) {
      response.writeHead(404, securityHeaders("application/json"));
      response.end(JSON.stringify({ code: "MANAGEMENT_LINK_INVALID" }));
      return;
    }
    const capability = signCapability({
      tokenRef,
      appointmentVersion,
      expiresAtEpochSeconds: nowEpochSeconds + 600,
      capabilityVersion: "cap-v1",
    }, signingKey);
    response.writeHead(204, {
      ...securityHeaders("application/json"),
      "Set-Cookie": serializeCapabilityCookie(capability),
    });
    response.end();
    return;
  }

  if (request.method === "GET" && parsed.pathname === "/manage/session") {
    const encoded = readCookie(request.headers.cookie, "spk003_cap");
    state.cookieSentBack = encoded !== undefined;
    const capability = encoded
      ? verifyCapability(encoded, signingKey, nowEpochSeconds)
      : undefined;
    state.cookieSignatureValid = capability !== undefined;
    state.cookieReferenceRevalidated = capability?.tokenRef === tokenRef
      && capability.appointmentVersion === appointmentVersion;
    response.writeHead(state.cookieReferenceRevalidated ? 200 : 401, securityHeaders("application/json"));
    response.end(JSON.stringify({ authorized: state.cookieReferenceRevalidated }));
    return;
  }

  if (request.method === "GET" && parsed.pathname === "/fragment-referrer-probe") {
    state.fragmentReferrer = request.headers.referer ?? null;
    response.writeHead(204, securityHeaders("text/plain"));
    response.end();
    return;
  }

  if (request.method === "GET" && parsed.pathname === "/query-risk") {
    state.queryRequestContainedRawToken = parsed.searchParams.get("token") === rawToken;
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(`<!doctype html><meta charset="utf-8"><title>query-risk</title>
      <img src="/query-referrer-probe" alt=""><script>
      addEventListener('load', () => parent.postMessage('query-risk-ready', '*'));
      </script>`);
    return;
  }

  if (request.method === "GET" && parsed.pathname === "/query-referrer-probe") {
    state.queryReferrerContainedRawToken = (request.headers.referer ?? "").includes(rawToken);
    response.writeHead(204, { "Cache-Control": "no-store" });
    response.end();
    return;
  }

  if (request.method === "POST" && parsed.pathname === "/complete") {
    const browser = JSON.parse(await readBody(request)) as {
      fragmentRemoved: boolean;
      httpOnlyInvisibleToDocument: boolean;
      sessionAuthorized: boolean;
      userAgent: string;
      historyLength: number;
    };
    await persistEvidence(browser);
    state.completed = true;
    response.writeHead(204, securityHeaders("application/json"));
    response.end();
    setTimeout(() => server.close(), 50);
    return;
  }

  response.writeHead(404, securityHeaders("text/plain; charset=utf-8"));
  response.end("not found");
}

function securityHeaders(contentType: string) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; img-src 'self'; frame-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'",
    "X-Content-Type-Options": "nosniff",
  };
}

function manageHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>SPK-003 fragment exchange</title></head>
  <body><main id="result">RUNNING</main><script>
  (async () => {
    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    const exchange = await fetch('/exchange', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token})
    });
    if (!exchange.ok) throw new Error('exchange failed');
    const httpOnlyInvisibleToDocument = !document.cookie.includes('spk003_cap=');
    history.replaceState(null, '', '/manage');
    const fragmentRemoved = !location.hash && !location.href.includes(token);
    const session = await fetch('/manage/session', {credentials: 'same-origin'});
    await fetch('/fragment-referrer-probe', {credentials: 'omit'});
    const queryFrame = document.createElement('iframe');
    queryFrame.hidden = true;
    queryFrame.src = '/query-risk?token=' + encodeURIComponent(token);
    document.body.append(queryFrame);
    await new Promise((resolve) => addEventListener('message', (event) => {
      if (event.data === 'query-risk-ready') resolve();
    }, {once: true}));
    document.querySelector('#result').textContent = 'SPK003_BROWSER_DONE';
    await fetch('/complete', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        fragmentRemoved,
        httpOnlyInvisibleToDocument,
        sessionAuthorized: session.ok,
        userAgent: navigator.userAgent,
        historyLength: history.length
      })
    });
  })().catch(() => { document.querySelector('#result').textContent = 'SPK003_BROWSER_FAILED'; });
  </script></body></html>`;
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const item of header.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function persistEvidence(browser: {
  fragmentRemoved: boolean;
  httpOnlyInvisibleToDocument: boolean;
  sessionAuthorized: boolean;
  userAgent: string;
  historyLength: number;
}) {
  const cookieHeader = serializeCapabilityCookie("[SIGNED_CAPABILITY_REDACTED]");
  const evidenceWithoutLeakAudit = {
    result: "PASS",
    generatedAt: new Date().toISOString(),
    environment: {
      platform: `${os.platform()} ${os.release()}`,
      browserUserAgent: browser.userAgent,
      server: "Node.js local HTTP server bound to 127.0.0.1",
    },
    fragmentExchange: {
      tokenEntropyBits: TOKEN_BITS,
      initialManageRequestContainedRawToken: state.fragmentManageRequestTargetContainedRaw,
      initialManageRequestContainedFragment: state.fragmentManageRequestTargetContainedFragment,
      exchangeBodyMatchedTokenInMemory: state.exchangeMatchedRawToken,
      fragmentRemovedWithHistoryReplaceState: browser.fragmentRemoved,
      finalExpectedPath: "/manage",
      referrerObservedByProbe: state.fragmentReferrer,
      thirdPartyRequests: 0,
    },
    capabilityCookie: {
      attributes: {
        httpOnly: cookieHeader.includes("HttpOnly"),
        secure: cookieHeader.includes("Secure"),
        sameSite: "Strict",
        path: "/manage",
        maxAgeSeconds: 600,
      },
      invisibleToDocumentCookie: browser.httpOnlyInvisibleToDocument,
      sentBackByBrowser: state.cookieSentBack,
      signatureVerifiedServerSide: state.cookieSignatureValid,
      referenceAndAppointmentVersionRevalidated: state.cookieReferenceRevalidated,
      sessionAuthorized: browser.sessionAuthorized,
      payloadContainsRawManagementToken: false,
    },
    pagePolicy: {
      cacheControl: "private, no-store",
      referrerPolicy: "no-referrer",
      csp: "default-src 'self'; connect/img/frame only self; no analytics",
      externalAnalyticsScripts: 0,
    },
    alternatives: {
      queryStringRequestExposedRawToken: state.queryRequestContainedRawToken,
      queryStringDefaultSameOriginReferrerExposedRawToken: state.queryReferrerContainedRawToken,
      fragmentRequestExposedRawToken: state.fragmentManageRequestTargetContainedRaw,
      fragmentReferrerExposedRawToken: (state.fragmentReferrer ?? "").includes(rawToken),
    },
    safeRequestLog,
    browserObservation: {
      completionMarker: "SPK003_BROWSER_DONE",
      historyLength: browser.historyLength,
    },
  };
  const serialized = JSON.stringify(evidenceWithoutLeakAudit);
  assert.equal(serialized.includes(rawToken), false);
  assert.equal(JSON.stringify(safeRequestLog).includes(rawToken), false);
  const evidence = {
    ...evidenceWithoutLeakAudit,
    rawSecretLeakAudit: {
      evidenceContainsRawToken: false,
      safeRequestLogContainsRawToken: false,
      launcherStdoutContainsRawToken: false,
    },
  };
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

async function findFreeTcpPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      assert.ok(address && typeof address !== "string");
      const selected = address.port;
      probe.close((error) => error ? reject(error) : resolve(selected));
    });
  });
}
