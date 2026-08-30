import { confirmAdminBooking } from "@/application/booking/public-booking-use-cases";
import { publicBookingInputSchema } from "@/delivery/booking/public-booking-input";
import { authenticatedError, authenticatedJson } from "@/delivery/http/json-response";
import { assertTrustedMutationRequest } from "@/delivery/http/request-security";
import { createOperationalAgendaContext } from "@/infrastructure/composition/operational-agenda-context";
import { getBookingSecrets, getSecurityEnv } from "@/infrastructure/config/server-env";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);
    const parsed = publicBookingInputSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApplicationError("ADMIN_BOOKING_INPUT_INVALID", "Revise os dados do agendamento.", 400);
    const context = await createOperationalAgendaContext();
    const booking = await confirmAdminBooking(context.booking, parsed.data, request.headers.get("idempotency-key") ?? "", getBookingSecrets().idempotencyPepper);
    return authenticatedJson({ booking }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return authenticatedError(new ApplicationError("ADMIN_BOOKING_INPUT_INVALID", "Revise os dados do agendamento.", 400));
    return authenticatedError(error);
  }
}
