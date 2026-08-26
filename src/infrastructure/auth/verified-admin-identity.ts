import "server-only";

import { ApplicationError } from "@/shared/errors/application-error";

import { createServerAuthClient } from "./server-client";

/** Revalidates with Supabase Auth; getSession() is intentionally not used. */
export async function getVerifiedAdminAuthUserId(): Promise<string> {
  const client = await createServerAuthClient();
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new ApplicationError(
      "AUTHENTICATION_REQUIRED",
      "Entre novamente para continuar.",
      401,
    );
  }

  return data.user.id;
}
