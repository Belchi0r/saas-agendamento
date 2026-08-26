import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema.js";

export const RUNTIME_POOL_MAX = 2;

export function createRuntimePool(
  connectionString: string,
  overrides: Partial<PoolConfig> = {},
) {
  return new Pool({
    connectionString,
    max: RUNTIME_POOL_MAX,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
    ...overrides,
  });
}

export function createDatabase(pool: Pool) {
  return drizzle(pool, { schema });
}
