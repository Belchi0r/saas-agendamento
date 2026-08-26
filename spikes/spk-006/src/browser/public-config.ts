export type BrowserConfig = Readonly<{
  supabaseUrl: string;
  supabasePublishableKey: string;
}>;

export function buildBrowserConfig(
  environment: Readonly<Record<string, string | undefined>>,
): BrowserConfig {
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing browser-safe Supabase Auth configuration");
  }
  return Object.freeze({ supabaseUrl, supabasePublishableKey });
}

export const browserCapabilities = Object.freeze([
  "supabase-auth-session",
] as const);

