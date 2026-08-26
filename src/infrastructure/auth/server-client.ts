import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicAuthEnv } from "@/shared/config/public-env";

export const ADMIN_AUTH_COOKIE_POLICY = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: false,
  maxAge: 400 * 24 * 60 * 60,
};

export type AuthCookie = Readonly<{
  name: string;
  value: string;
  options: CookieOptions;
}>;

export interface AuthCookieAdapter {
  getAll(): ReadonlyArray<Readonly<{ name: string; value: string }>>;
  setAll(cookiesToSet: ReadonlyArray<AuthCookie>): void;
}

export function createRequestScopedAuthClient(adapter: AuthCookieAdapter) {
  const env = getPublicAuthEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: {
        ...ADMIN_AUTH_COOKIE_POLICY,
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll: () => [...adapter.getAll()],
        setAll: (cookiesToSet) => adapter.setAll(cookiesToSet),
      },
    },
  );
}

/** Creates a new Supabase client and cookie adapter for every server request. */
export async function createServerAuthClient() {
  const cookieStore = await cookies();

  return createRequestScopedAuthClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Server Components cannot write cookies. src/proxy.ts performs refresh
        // for protected paths where a response cookie update is possible.
      }
    },
  });
}
