import { createBrowserClient } from "@supabase/ssr";

import { AUTH_COOKIE_POLICY } from "../server/request-client.js";

export function createBrowserAdminAuth(
  supabaseUrl: string,
  publishableKey: string,
) {
  const auth = createBrowserClient(supabaseUrl, publishableKey, {
    cookieOptions: AUTH_COOKIE_POLICY,
  }).auth;

  return {
    signInWithPassword(email: string, password: string) {
      return auth.signInWithPassword({ email, password });
    },
    requestPasswordReset(email: string, redirectTo: string) {
      return auth.resetPasswordForEmail(email, { redirectTo });
    },
    signOut() {
      return auth.signOut({ scope: "local" });
    },
  };
}

