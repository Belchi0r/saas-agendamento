import { z } from "zod";

export function parseEnvironment<T>(
  schema: z.ZodType<T>,
  input: unknown,
  group: string,
): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    const names = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");

    throw new Error(`Invalid ${group} environment variables: ${names}`);
  }

  return result.data;
}
