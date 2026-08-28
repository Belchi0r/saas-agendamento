import "server-only";

import { z } from "zod";

import { parseEnvironment } from "@/shared/config/parse-environment";
import type { BookingSecrets } from "@/infrastructure/security/booking-secrets";

const databaseEnvSchema = z.object({
  DATABASE_URL: z.url().refine((value) => value.startsWith("postgres"), {
    message: "must be a PostgreSQL URL",
  }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(12).default(2),
});

const securityEnvSchema = z.object({
  APP_ORIGIN: z.url(),
});

const encodedSecretSchema = z.string().transform((value, context) => {
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32) {
    context.addIssue({ code: "custom", message: "must decode to 32 bytes" });
    return z.NEVER;
  }
  return decoded;
});

const bookingSecretsEnvSchema = z.object({
  BOOKING_TOKEN_PEPPER: encodedSecretSchema,
  IDEMPOTENCY_PEPPER: encodedSecretSchema,
  BOOKING_RESPONSE_ENVELOPE_KEYS_JSON: z.string().transform((value, context) => {
    try {
      const input = JSON.parse(value) as Record<string, unknown>;
      const entries = Object.entries(input);
      if (entries.length === 0) throw new Error("empty");
      return new Map(entries.map(([version, encoded]) => {
        const key = Buffer.from(String(encoded), "base64url");
        if (!version || version.length > 40 || key.length !== 32) throw new Error("invalid");
        return [version, key] as const;
      }));
    } catch {
      context.addIssue({ code: "custom", message: "must be a valid 32-byte keyring" });
      return z.NEVER;
    }
  }),
  BOOKING_RESPONSE_ENVELOPE_ACTIVE_KEY_VERSION: z.string().min(1).max(40),
  CAPABILITY_COOKIE_SIGNING_KEY: encodedSecretSchema,
}).refine(
  (value) => value.BOOKING_RESPONSE_ENVELOPE_KEYS_JSON.has(value.BOOKING_RESPONSE_ENVELOPE_ACTIVE_KEY_VERSION),
  { message: "active envelope key must exist" },
);

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type SecurityEnv = z.infer<typeof securityEnvSchema>;

export function getDatabaseEnv(): DatabaseEnv {
  return parseEnvironment(
    databaseEnvSchema,
    {
      DATABASE_URL: process.env.DATABASE_URL,
      DB_POOL_MAX: process.env.DB_POOL_MAX,
    },
    "database",
  );
}

export function getSecurityEnv(): SecurityEnv {
  return parseEnvironment(
    securityEnvSchema,
    { APP_ORIGIN: process.env.APP_ORIGIN },
    "security",
  );
}

export function getBookingSecrets(): BookingSecrets {
  const parsed = parseEnvironment(bookingSecretsEnvSchema, {
    BOOKING_TOKEN_PEPPER: process.env.BOOKING_TOKEN_PEPPER,
    IDEMPOTENCY_PEPPER: process.env.IDEMPOTENCY_PEPPER,
    BOOKING_RESPONSE_ENVELOPE_KEYS_JSON: process.env.BOOKING_RESPONSE_ENVELOPE_KEYS_JSON,
    BOOKING_RESPONSE_ENVELOPE_ACTIVE_KEY_VERSION: process.env.BOOKING_RESPONSE_ENVELOPE_ACTIVE_KEY_VERSION,
    CAPABILITY_COOKIE_SIGNING_KEY: process.env.CAPABILITY_COOKIE_SIGNING_KEY,
  }, "booking security");
  return {
    tokenPepper: parsed.BOOKING_TOKEN_PEPPER,
    idempotencyPepper: parsed.IDEMPOTENCY_PEPPER,
    envelopeKeys: parsed.BOOKING_RESPONSE_ENVELOPE_KEYS_JSON,
    activeEnvelopeKeyVersion: parsed.BOOKING_RESPONSE_ENVELOPE_ACTIVE_KEY_VERSION,
    capabilitySigningKey: parsed.CAPABILITY_COOKIE_SIGNING_KEY,
  };
}
