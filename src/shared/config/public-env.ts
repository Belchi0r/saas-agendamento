import { z } from "zod";

import { parseEnvironment } from "./parse-environment";

const supabaseUrlSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    const loopback =
      url.hostname === "127.0.0.1" || url.hostname === "localhost";

    return url.protocol === "https:" || (url.protocol === "http:" && loopback);
  } catch {
    return false;
  }
}, "must use HTTPS except for a loopback development server");

const publicAuthEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

export type PublicAuthEnv = z.infer<typeof publicAuthEnvSchema>;

export function getPublicAuthEnv(): PublicAuthEnv {
  return parseEnvironment(
    publicAuthEnvSchema,
    {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
    "public Auth",
  );
}
