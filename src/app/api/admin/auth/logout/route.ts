import { authenticatedError, authenticatedJson } from "@/delivery/http/json-response";
import { assertTrustedMutationRequest } from "@/delivery/http/request-security";
import { createServerAuthClient } from "@/infrastructure/auth/server-client";
import { getSecurityEnv } from "@/infrastructure/config/server-env";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);
    const client = await createServerAuthClient();
    await client.auth.signOut({ scope: "local" });

    return authenticatedJson({ ok: true });
  } catch (error) {
    return authenticatedError(error);
  }
}
