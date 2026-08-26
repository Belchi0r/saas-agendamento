import { createDateAvailabilityException } from "@/application/availability/date-availability-use-cases";
import { toDateAvailabilityView } from "@/application/availability/date-availability-view";
import { createDateAvailabilityInputSchema } from "@/delivery/availability/date-availability-input";
import {
  authenticatedError,
  authenticatedJson,
} from "@/delivery/http/json-response";
import { assertTrustedMutationRequest } from "@/delivery/http/request-security";
import { createAdminAvailabilityContext } from "@/infrastructure/composition/availability-context";
import { getSecurityEnv } from "@/infrastructure/config/server-env";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);
    const input = createDateAvailabilityInputSchema.safeParse(
      await request.json(),
    );
    if (!input.success) throw invalidInput();

    const context = await createAdminAvailabilityContext();
    const snapshot = await createDateAvailabilityException(
      context.dateAvailability,
      input.data,
    );
    return authenticatedJson(
      { dateAvailability: toDateAvailabilityView(snapshot) },
      { status: 201 },
    );
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
