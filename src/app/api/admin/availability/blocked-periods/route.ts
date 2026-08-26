import { createBlockedPeriod } from "@/application/availability/blocked-period-use-cases";
import { toBlockedPeriodListView } from "@/application/availability/blocked-period-view";
import { createBlockedPeriodInputSchema } from "@/delivery/availability/blocked-period-input";
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
    const input = createBlockedPeriodInputSchema.safeParse(await request.json());
    if (!input.success) throw invalidInput();

    const context = await createAdminAvailabilityContext();
    const snapshot = await createBlockedPeriod(context.blockedPeriods, input.data);
    return authenticatedJson(
      { blockedPeriods: toBlockedPeriodListView(snapshot) },
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
    "BLOCKED_PERIOD_INPUT_INVALID",
    "Revise a data e o intervalo do bloqueio.",
    400,
  );
}
