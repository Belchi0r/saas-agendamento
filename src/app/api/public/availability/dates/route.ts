import { listPublicBookingDateOptions } from "@/application/booking/public-booking-use-cases";
import { publicAvailabilityDatesQuerySchema } from "@/delivery/booking/public-booking-input";
import { privateDynamicError, privateDynamicJson } from "@/delivery/http/json-response";
import { createPublicBookingContext } from "@/infrastructure/composition/public-booking-context";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parsed = publicAvailabilityDatesQuerySchema.safeParse({
      serviceId: url.searchParams.get("serviceId"),
    });
    if (!parsed.success) {
      throw new ApplicationError(
        "AVAILABILITY_QUERY_INVALID",
        "Revise o serviço.",
        400,
      );
    }
    const availability = await listPublicBookingDateOptions(
      await createPublicBookingContext(),
      parsed.data.serviceId,
    );
    return privateDynamicJson({ availability });
  } catch (error) {
    return privateDynamicError(error);
  }
}
