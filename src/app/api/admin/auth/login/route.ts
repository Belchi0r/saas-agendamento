import { loginInputSchema } from "@/delivery/auth/login-input";
import { assertTrustedMutationRequest } from "@/delivery/http/request-security";
import {
  authenticatedError,
  authenticatedJson,
} from "@/delivery/http/json-response";
import { createServerAuthClient } from "@/infrastructure/auth/server-client";
import { authorizeAuthenticatedUser } from "@/infrastructure/composition/service-context";
import { getSecurityEnv } from "@/infrastructure/config/server-env";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);

    const input = loginInputSchema.safeParse(await request.json());
    if (!input.success) {
      throw new ApplicationError(
        "LOGIN_INPUT_INVALID",
        "Informe e-mail e senha válidos.",
        400,
      );
    }

    const client = await createServerAuthClient();
    const { error: signInError } = await client.auth.signInWithPassword(input.data);

    if (signInError) {
      throw new ApplicationError(
        "INVALID_CREDENTIALS",
        "Não foi possível entrar com essas credenciais.",
        401,
      );
    }

    const { data, error: userError } = await client.auth.getUser();
    if (userError || !data.user) {
      throw new ApplicationError(
        "AUTHENTICATION_REQUIRED",
        "Entre novamente para continuar.",
        401,
      );
    }

    try {
      await authorizeAuthenticatedUser(data.user.id);
    } catch (error) {
      await client.auth.signOut({ scope: "local" });
      throw error;
    }

    return authenticatedJson({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return authenticatedError(
        new ApplicationError(
          "LOGIN_INPUT_INVALID",
          "Informe e-mail e senha válidos.",
          400,
        ),
      );
    }

    return authenticatedError(error);
  }
}
