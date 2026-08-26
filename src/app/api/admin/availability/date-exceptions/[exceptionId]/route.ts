import {
  deleteDateAvailabilityException,
  updateDateAvailabilityException,
} from "@/application/availability/date-availability-use-cases";
import { toDateAvailabilityView } from "@/application/availability/date-availability-view";
import {
  dateAvailabilityIdSchema,
  deleteDateAvailabilityInputSchema,
  updateDateAvailabilityInputSchema,
} from "@/delivery/availability/date-availability-input";
import {
  authenticatedError,
  authenticatedJson,
} from "@/delivery/http/json-response";
import { assertTrustedMutationRequest } from "@/delivery/http/request-security";
import { createAdminAvailabilityContext } from "@/infrastructure/composition/availability-context";
import { getSecurityEnv } from "@/infrastructure/config/server-env";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";

type RouteContext = Readonly<{ params: Promise<{ exceptionId: string }> }>;

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);
    const id = dateAvailabilityIdSchema.safeParse(
      (await context.params).exceptionId,
    );
    const input = updateDateAvailabilityInputSchema.safeParse(
      await request.json(),
    );
    if (!id.success || !input.success) throw invalidInput();

    const application = await createAdminAvailabilityContext();
    const snapshot = await updateDateAvailabilityException(
      application.dateAvailability,
      id.data,
      input.data,
    );
    return authenticatedJson({
      dateAvailability: toDateAvailabilityView(snapshot),
    });
  } catch (error) {
    return authenticatedError(
      error instanceof SyntaxError ? invalidInput() : error,
    );
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);
    const id = dateAvailabilityIdSchema.safeParse(
      (await context.params).exceptionId,
    );
    const input = deleteDateAvailabilityInputSchema.safeParse(
      await request.json(),
    );
    if (!id.success || !input.success) throw invalidInput();

    const application = await createAdminAvailabilityContext();
    const snapshot = await deleteDateAvailabilityException(
      application.dateAvailability,
      id.data,
      input.data.expectedVersion,
      input.data.expectedAvailabilityVersion,
    );
    return authenticatedJson({
      dateAvailability: toDateAvailabilityView(snapshot),
    });
  } catch (error) {
    return authenticatedError(
      error instanceof SyntaxError ? invalidInput() : error,
    );
  }
}

function invalidInput(): ApplicationError {
  return new ApplicationError(
    "DATE_AVAILABILITY_INPUT_INVALID",
    "Revise a data e os horários especiais informados.",
    400,
  );
}
