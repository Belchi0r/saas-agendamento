import { confirmPublicBooking } from "@/application/booking/public-booking-use-cases";
import { publicBookingInputSchema } from "@/delivery/booking/public-booking-input";
import { privateDynamicError, privateDynamicJson } from "@/delivery/http/json-response";
import { assertTrustedMutationRequest } from "@/delivery/http/request-security";
import { createPublicBookingContext } from "@/infrastructure/composition/public-booking-context";
import { getBookingSecrets, getSecurityEnv } from "@/infrastructure/config/server-env";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const security = getSecurityEnv();
    assertTrustedMutationRequest(request, security.APP_ORIGIN);
    const parsed = publicBookingInputSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApplicationError("PUBLIC_BOOKING_INPUT_INVALID", "Revise os dados do agendamento.", 400);
    const result = await confirmPublicBooking(
      await createPublicBookingContext(), parsed.data,
      request.headers.get("idempotency-key") ?? "",
      getBookingSecrets(), security.APP_ORIGIN,
    );
    return privateDynamicJson({ booking: result }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return privateDynamicError(new ApplicationError("PUBLIC_BOOKING_INPUT_INVALID", "Revise os dados do agendamento.", 400));
    return privateDynamicError(error);
  }
}
