import { createHash } from "node:crypto";

import type { CookieOptions, CookieMethodsServer } from "@supabase/ssr";

export interface CookieWrite {
  readonly name: string;
  readonly value: string;
  readonly options: CookieOptions;
}

export interface CookieWriteEvidence {
  readonly name: string;
  readonly action: "SET" | "DELETE";
  readonly valuePresent: boolean;
  readonly path: string | null;
  readonly sameSite: string | boolean | null;
  readonly secure: boolean | null;
  readonly httpOnly: boolean | null;
  readonly maxAge: number | null;
  readonly domain: string | null;
}

export class RequestCookieJar {
  readonly writes: CookieWrite[] = [];
  readonly responseHeaders = new Headers();

  private readonly cookies = new Map<string, string>();

  constructor(initial: ReadonlyArray<{ name: string; value: string }> = []) {
    for (const cookie of initial) {
      this.cookies.set(cookie.name, cookie.value);
    }
  }

  readonly adapter: CookieMethodsServer = {
    getAll: async () => this.snapshot(),
    setAll: async (cookies, headers) => {
      for (const [name, value] of Object.entries(headers)) {
        this.responseHeaders.set(name, value);
      }

      for (const cookie of cookies) {
        this.writes.push({
          name: cookie.name,
          value: cookie.value,
          options: { ...cookie.options },
        });

        if (cookie.value === "" || cookie.options.maxAge === 0) {
          this.cookies.delete(cookie.name);
        } else {
          this.cookies.set(cookie.name, cookie.value);
        }
      }
    },
  };

  snapshot(): Array<{ name: string; value: string }> {
    return [...this.cookies.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => ({ name, value }));
  }

  nextRequest(): RequestCookieJar {
    return new RequestCookieJar(this.snapshot());
  }

  opaqueStateFingerprint(): string {
    const hash = createHash("sha256");
    for (const cookie of this.snapshot()) {
      hash.update(cookie.name);
      hash.update("\0");
      hash.update(cookie.value);
      hash.update("\0");
    }
    return hash.digest("hex");
  }
}

export function redactCookieName(name: string, projectRef?: string): string {
  if (!projectRef) {
    return name;
  }

  return name.replace(`sb-${projectRef}-`, "sb-<project-ref>-");
}

export function cookieWriteEvidence(
  writes: readonly CookieWrite[],
  projectRef?: string,
): CookieWriteEvidence[] {
  return writes.map(({ name, value, options }) => ({
    name: redactCookieName(name, projectRef),
    action: value === "" || options.maxAge === 0 ? "DELETE" : "SET",
    valuePresent: value !== "",
    path: options.path ?? null,
    sameSite: options.sameSite ?? null,
    secure: options.secure ?? null,
    httpOnly: options.httpOnly ?? null,
    maxAge: options.maxAge ?? null,
    domain: options.domain ?? null,
  }));
}

