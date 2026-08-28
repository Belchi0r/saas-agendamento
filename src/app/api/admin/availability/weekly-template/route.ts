import { replaceWeeklyDays } from "@/application/availability/weekly-availability-use-cases";
import { toWeeklyAvailabilityView } from "@/application/availability/weekly-availability-view";
import { replaceWeeklyDaysInputSchema } from "@/delivery/availability/weekly-availability-input";
import {
  authenticatedError,
  authenticatedJson,
} from "@/delivery/http/json-response";
import { assertTrustedMutationRequest } from "@/delivery/http/request-security";
import { createAdminAvailabilityContext } from "@/infrastructure/composition/availability-context";
import { getSecurityEnv } from "@/infrastructure/config/server-env";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";

export async function PUT(request: Request): Promise<Response> {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);
    const input = replaceWeeklyDaysInputSchema.safeParse(await request.json());
    if (!input.success) throw invalidInput();

    const context = await createAdminAvailabilityContext();
    const snapshot = await replaceWeeklyDays(context.availability, input.data);
    return authenticatedJson({ availability: toWeeklyAvailabilityView(snapshot) });
  } catch (error) {
    return authenticatedError(error instanceof SyntaxError ? invalidInput() : error);
  }
}

function invalidInput(): ApplicationError {
  return new ApplicationError(
    "WEEKLY_AVAILABILITY_INPUT_INVALID",
    "Selecione os dias e revise os horários informados.",
    400,
  );
}
