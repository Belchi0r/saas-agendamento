export type RecognizablePostgresError = Error & {
  code?: string;
  constraint?: string;
  detail?: string;
};

export function asPostgresError(
  error: unknown,
): RecognizablePostgresError | undefined {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const candidate = current as RecognizablePostgresError;
    if (typeof candidate.code === "string") {
      return candidate;
    }
    current = candidate.cause;
  }

  return undefined;
}

export function isExclusionViolation(error: unknown): boolean {
  const postgresError = asPostgresError(error);
  return (
    postgresError?.code === "23P01" &&
    postgresError.constraint === "schedule_occupancy_no_overlap"
  );
}
