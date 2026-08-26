"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getPublicAuthEnv } from "@/shared/config/public-env";

/** Browser client is Auth-only. Domain tables are never accessed through it. */
export function createBrowserAuthClient() {
  const env = getPublicAuthEnv();

  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
