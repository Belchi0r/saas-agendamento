import { listAdminBookingAvailability } from "@/application/booking/public-booking-use-cases";
import { publicAvailabilityQuerySchema } from "@/delivery/booking/public-booking-input";
import { authenticatedError, authenticatedJson } from "@/delivery/http/json-response";
import { createOperationalAgendaContext } from "@/infrastructure/composition/operational-agenda-context";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const parsed = publicAvailabilityQuerySchema.safeParse({ serviceId: url.searchParams.get("serviceId"), localDate: url.searchParams.get("localDate") });
    if (!parsed.success) throw new ApplicationError("AVAILABILITY_QUERY_INVALID", "Revise o serviço e a data.", 400);
    const context = await createOperationalAgendaContext();
    return authenticatedJson({ availability: await listAdminBookingAvailability(context.booking, parsed.data.serviceId, parsed.data.localDate) });
  } catch (error) { return authenticatedError(error); }
}
