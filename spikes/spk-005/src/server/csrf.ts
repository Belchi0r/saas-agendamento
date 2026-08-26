const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface CsrfPolicy {
  readonly allowedOrigins: ReadonlySet<string>;
  readonly allowedHosts: ReadonlySet<string>;
  readonly production: boolean;
  readonly trustForwardedHost: boolean;
}

export type CsrfResult =
  | { readonly ok: true; readonly code: "ALLOWED" }
  | {
      readonly ok: false;
      readonly status: 403 | 405;
      readonly code:
        | "MUTATION_METHOD_REQUIRED"
        | "ORIGIN_REQUIRED"
        | "INVALID_ORIGIN"
        | "HTTPS_ORIGIN_REQUIRED"
        | "HOST_REQUIRED"
        | "HOST_NOT_ALLOWED"
        | "ORIGIN_NOT_ALLOWED"
        | "ORIGIN_HOST_MISMATCH";
    };

function firstForwardedHost(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.split(",", 1)[0]?.trim() || null;
}

export function validateMutationCsrf(
  request: Pick<Request, "method" | "headers">,
  policy: CsrfPolicy,
): CsrfResult {
  if (!MUTATION_METHODS.has(request.method.toUpperCase())) {
    return {
      ok: false,
      status: 405,
      code: "MUTATION_METHOD_REQUIRED",
    };
  }

  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    return { ok: false, status: 403, code: "ORIGIN_REQUIRED" };
  }

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return { ok: false, status: 403, code: "INVALID_ORIGIN" };
  }

  if (policy.production && origin.protocol !== "https:") {
    return { ok: false, status: 403, code: "HTTPS_ORIGIN_REQUIRED" };
  }

  const forwardedHost = policy.trustForwardedHost
    ? firstForwardedHost(request.headers.get("x-forwarded-host"))
    : null;
  const host = forwardedHost ?? request.headers.get("host");

  if (!host) {
    return { ok: false, status: 403, code: "HOST_REQUIRED" };
  }
  if (!policy.allowedHosts.has(host)) {
    return { ok: false, status: 403, code: "HOST_NOT_ALLOWED" };
  }
  if (!policy.allowedOrigins.has(origin.origin)) {
    return { ok: false, status: 403, code: "ORIGIN_NOT_ALLOWED" };
  }
  if (origin.host !== host) {
    return { ok: false, status: 403, code: "ORIGIN_HOST_MISMATCH" };
  }

  return { ok: true, code: "ALLOWED" };
}

