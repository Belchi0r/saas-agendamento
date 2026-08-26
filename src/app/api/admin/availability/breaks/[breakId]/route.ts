import {
  deleteWeeklyBreak,
  updateWeeklyBreak,
} from "@/application/availability/weekly-availability-use-cases";
import { toWeeklyAvailabilityView } from "@/application/availability/weekly-availability-view";
import {
  deleteWeeklyRangeInputSchema,
  updateWeeklyRangeInputSchema,
  weeklyRangeIdSchema,
} from "@/delivery/availability/weekly-availability-input";
import {
  authenticatedError,
  authenticatedJson,
} from "@/delivery/http/json-response";
import { assertTrustedMutationRequest } from "@/delivery/http/request-security";
import { createAdminAvailabilityContext } from "@/infrastructure/composition/availability-context";
import { getSecurityEnv } from "@/infrastructure/config/server-env";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";

type RouteContext = Readonly<{ params: Promise<{ breakId: string }> }>;

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);
    const id = weeklyRangeIdSchema.safeParse((await context.params).breakId);
    const input = updateWeeklyRangeInputSchema.safeParse(await request.json());
    if (!id.success || !input.success) throw invalidInput();

    const application = await createAdminAvailabilityContext();
    const snapshot = await updateWeeklyBreak(
      application.availability,
      id.data,
      input.data,
    );

    return authenticatedJson({ availability: toWeeklyAvailabilityView(snapshot) });
  } catch (error) {
    return authenticatedError(error instanceof SyntaxError ? invalidInput() : error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);
    const id = weeklyRangeIdSchema.safeParse((await context.params).breakId);
    const input = deleteWeeklyRangeInputSchema.safeParse(await request.json());
    if (!id.success || !input.success) throw invalidInput();

    const application = await createAdminAvailabilityContext();
    const snapshot = await deleteWeeklyBreak(
      application.availability,
      id.data,
      input.data.expectedAvailabilityVersion,
    );

    return authenticatedJson({ availability: toWeeklyAvailabilityView(snapshot) });
  } catch (error) {
    return authenticatedError(error instanceof SyntaxError ? invalidInput() : error);
  }
}

function invalidInput(): ApplicationError {
  return new ApplicationError(
    "WEEKLY_AVAILABILITY_INPUT_INVALID",
    "Revise a pausa informada.",
    400,
  );
}
