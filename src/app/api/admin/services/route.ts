import { createService } from "@/application/services/service-use-cases";
import { toServiceView } from "@/application/services/service-view";
import { authenticatedError, authenticatedJson } from "@/delivery/http/json-response";
import { assertTrustedMutationRequest } from "@/delivery/http/request-security";
import { createServiceInputSchema } from "@/delivery/services/service-input";
import { createAdminServiceContext } from "@/infrastructure/composition/service-context";
import { getSecurityEnv } from "@/infrastructure/config/server-env";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);
    const parsed = createServiceInputSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApplicationError(
        "SERVICE_INPUT_INVALID",
        "Revise os dados do serviço.",
        400,
      );
    }

    const context = await createAdminServiceContext();
    const service = await createService(context.services, parsed.data);

    return authenticatedJson({ service: toServiceView(service) }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return authenticatedError(
        new ApplicationError(
          "SERVICE_INPUT_INVALID",
          "Revise os dados do serviço.",
          400,
        ),
      );
    }

    return authenticatedError(error);
  }
}
