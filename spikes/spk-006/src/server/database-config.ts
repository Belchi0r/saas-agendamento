export type ServerDatabaseConfig = Readonly<{
  databaseUrl: string;
}>;

export function buildServerDatabaseConfig(
  environment: Readonly<Record<string, string | undefined>>,
): ServerDatabaseConfig {
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is server-only and required by the runtime");
  }
  return Object.freeze({ databaseUrl });
}

