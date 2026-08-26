import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseEnv } from "@/infrastructure/config/server-env";

import * as schema from "./schema";

type DatabaseGlobal = typeof globalThis & {
  __barberDatabasePool?: Pool;
};

const databaseGlobal = globalThis as DatabaseGlobal;

export function getDatabasePool(): Pool {
  if (!databaseGlobal.__barberDatabasePool) {
    const env = getDatabaseEnv();

    databaseGlobal.__barberDatabasePool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DB_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    });
  }

  return databaseGlobal.__barberDatabasePool;
}

/** node-postgres uses unnamed statements unless a query `name` is supplied. */
export function getDatabase() {
  return drizzle(getDatabasePool(), { schema });
}
