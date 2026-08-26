export type PostgresError = Readonly<{
  code: string;
  constraint?: string;
}>;

export function findPostgresError(error: unknown): PostgresError | undefined {
  let current = error;
  const visited = new Set<unknown>();

  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if ("code" in current && typeof current.code === "string") {
      return current as PostgresError;
    }
    current = "cause" in current ? current.cause : undefined;
  }

  return undefined;
}
