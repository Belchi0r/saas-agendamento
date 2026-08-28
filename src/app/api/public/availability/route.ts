import { listPublicBookingAvailability } from "@/application/booking/public-booking-use-cases";
import { publicAvailabilityQuerySchema } from "@/delivery/booking/public-booking-input";
import { privateDynamicError, privateDynamicJson } from "@/delivery/http/json-response";
import { createPublicBookingContext } from "@/infrastructure/composition/public-booking-context";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parsed = publicAvailabilityQuerySchema.safeParse({
      serviceId: url.searchParams.get("serviceId"),
      localDate: url.searchParams.get("localDate"),
    });
    if (!parsed.success) throw new ApplicationError("AVAILABILITY_QUERY_INVALID", "Revise o serviço e a data.", 400);
    const result = await listPublicBookingAvailability(
      await createPublicBookingContext(), parsed.data.serviceId, parsed.data.localDate,
    );
    return privateDynamicJson({
      availability: {
        localDate: result.localDate,
        timezone: result.timezone,
        slotStepMinutes: result.slotStepMinutes,
        slots: result.slots,
      },
    });
  } catch (error) { return privateDynamicError(error); }
}
