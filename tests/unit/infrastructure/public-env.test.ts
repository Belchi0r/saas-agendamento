import { afterEach, describe, expect, it, vi } from "vitest";

import { getPublicAuthEnv } from "@/shared/config/public-env";

describe("typed public Auth environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts an HTTPS URL and non-empty publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_1234567890",
    );

    expect(getPublicAuthEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890",
    });
  });

  it("allows HTTP only for a loopback Supabase development server", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_1234567890",
    );
    expect(getPublicAuthEnv().NEXT_PUBLIC_SUPABASE_URL).toBe(
      "http://127.0.0.1:54321",
    );

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://project.supabase.co");
    expect(() => getPublicAuthEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("reports variable names without echoing secret-like values", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "secret-value");

    expect(() => getPublicAuthEnv()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
    expect(() => getPublicAuthEnv()).not.toThrow(/secret-value/);
  });
});
