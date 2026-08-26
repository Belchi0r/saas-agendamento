import {
  setServiceActive,
  updateService,
} from "@/application/services/service-use-cases";
import { toServiceView } from "@/application/services/service-view";
import { authenticatedError, authenticatedJson } from "@/delivery/http/json-response";
import { assertTrustedMutationRequest } from "@/delivery/http/request-security";
import {
  changeServiceInputSchema,
  serviceIdSchema,
} from "@/delivery/services/service-input";
import { createAdminServiceContext } from "@/infrastructure/composition/service-context";
import { getSecurityEnv } from "@/infrastructure/config/server-env";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ serviceId: string }> },
): Promise<Response> {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);
    const serviceId = serviceIdSchema.safeParse((await params).serviceId);
    const input = changeServiceInputSchema.safeParse(await request.json());

    if (!serviceId.success || !input.success) {
      throw new ApplicationError(
        "SERVICE_INPUT_INVALID",
        "Revise os dados do serviço.",
        400,
      );
    }

    const context = await createAdminServiceContext();
    const service =
      input.data.action === "update"
        ? await updateService(context.services, serviceId.data, input.data)
        : await setServiceActive(context.services, serviceId.data, input.data);

    return authenticatedJson({ service: toServiceView(service) });
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
