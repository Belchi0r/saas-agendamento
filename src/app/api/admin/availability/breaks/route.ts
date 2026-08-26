import { createWeeklyBreak } from "@/application/availability/weekly-availability-use-cases";
import { toWeeklyAvailabilityView } from "@/application/availability/weekly-availability-view";
import { weeklyRangeInputSchema } from "@/delivery/availability/weekly-availability-input";
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
    const input = weeklyRangeInputSchema.safeParse(await request.json());
    if (!input.success) throw invalidInput();

    const context = await createAdminAvailabilityContext();
    const snapshot = await createWeeklyBreak(context.availability, input.data);

    return authenticatedJson(
      { availability: toWeeklyAvailabilityView(snapshot) },
      { status: 201 },
    );
  } catch (error) {
    return authenticatedError(error instanceof SyntaxError ? invalidInput() : error);
  }
}

function invalidInput(): ApplicationError {
  return new ApplicationError(
    "WEEKLY_AVAILABILITY_INPUT_INVALID",
    "Revise o dia e os horários da pausa.",
    400,
  );
}
