import {
  deactivateBlockedPeriod,
  updateBlockedPeriod,
} from "@/application/availability/blocked-period-use-cases";
import { toBlockedPeriodListView } from "@/application/availability/blocked-period-view";
import {
  blockedPeriodIdSchema,
  deactivateBlockedPeriodInputSchema,
  updateBlockedPeriodInputSchema,
} from "@/delivery/availability/blocked-period-input";
import {
  authenticatedError,
  authenticatedJson,
} from "@/delivery/http/json-response";
import { assertTrustedMutationRequest } from "@/delivery/http/request-security";
import { createAdminAvailabilityContext } from "@/infrastructure/composition/availability-context";
import { getSecurityEnv } from "@/infrastructure/config/server-env";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";

type RouteContext = Readonly<{
  params: Promise<{ blockedPeriodId: string }>;
}>;

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);
    const id = blockedPeriodIdSchema.safeParse(
      (await context.params).blockedPeriodId,
    );
    const input = updateBlockedPeriodInputSchema.safeParse(await request.json());
    if (!id.success || !input.success) throw invalidInput();

    const application = await createAdminAvailabilityContext();
    const snapshot = await updateBlockedPeriod(
      application.blockedPeriods,
      id.data,
      input.data,
    );
    return authenticatedJson({
      blockedPeriods: toBlockedPeriodListView(snapshot),
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
    const id = blockedPeriodIdSchema.safeParse(
      (await context.params).blockedPeriodId,
    );
    const input = deactivateBlockedPeriodInputSchema.safeParse(
      await request.json(),
    );
    if (!id.success || !input.success) throw invalidInput();

    const application = await createAdminAvailabilityContext();
    const snapshot = await deactivateBlockedPeriod(
      application.blockedPeriods,
      id.data,
      input.data.expectedVersion,
      input.data.expectedAvailabilityVersion,
    );
    return authenticatedJson({
      blockedPeriods: toBlockedPeriodListView(snapshot),
    });
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
