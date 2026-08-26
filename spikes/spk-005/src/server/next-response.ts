import type { CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";

import type { CookieWrite } from "./cookie-jar.js";

export function applySupabaseCookieBatch(
  response: NextResponse,
  cookies: readonly CookieWrite[],
  headers: Readonly<Record<string, string>>,
): void {
  for (const cookie of cookies) {
    response.cookies.set(
      cookie.name,
      cookie.value,
      cookie.options as CookieOptions,
    );
  }

  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
}

