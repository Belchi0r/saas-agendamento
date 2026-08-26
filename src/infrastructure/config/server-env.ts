import "server-only";

import { z } from "zod";

import { parseEnvironment } from "@/shared/config/parse-environment";

const databaseEnvSchema = z.object({
  DATABASE_URL: z.url().refine((value) => value.startsWith("postgres"), {
    message: "must be a PostgreSQL URL",
  }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(12).default(2),
});

const securityEnvSchema = z.object({
  APP_ORIGIN: z.url(),
});

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
