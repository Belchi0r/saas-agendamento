import { createServerClient } from "@supabase/ssr";

import { RequestCookieJar } from "./cookie-jar.js";

export interface RequestClientInput {
  readonly requestId: string;
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly cookieJar: RequestCookieJar;
  readonly production: boolean;
}

export const AUTH_COOKIE_POLICY = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: false,
  maxAge: 400 * 24 * 60 * 60,
};

export function createRequestScopedSupabaseClient(
  input: RequestClientInput,
) {
  const client = createServerClient(input.supabaseUrl, input.publishableKey, {
    cookies: input.cookieJar.adapter,
    cookieOptions: {
      ...AUTH_COOKIE_POLICY,
      secure: input.production,
    },
  });

  return {
    requestId: input.requestId,
    client,
    cookieJar: input.cookieJar,
  };
}
