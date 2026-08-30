import { listAdminBookingDateOptions } from "@/application/booking/public-booking-use-cases";
import { publicAvailabilityDatesQuerySchema } from "@/delivery/booking/public-booking-input";
import { authenticatedError, authenticatedJson } from "@/delivery/http/json-response";
import { createOperationalAgendaContext } from "@/infrastructure/composition/operational-agenda-context";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const parsed = publicAvailabilityDatesQuerySchema.safeParse({ serviceId: new URL(request.url).searchParams.get("serviceId") });
    if (!parsed.success) throw new ApplicationError("AVAILABILITY_QUERY_INVALID", "Revise o serviço.", 400);
    const context = await createOperationalAgendaContext();
    return authenticatedJson({ availability: await listAdminBookingDateOptions(context.booking, parsed.data.serviceId) });
  } catch (error) { return authenticatedError(error); }
}
