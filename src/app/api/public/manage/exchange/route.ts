import { exchangeManagementToken } from "@/application/booking/public-booking-use-cases";
import { managementTokenInputSchema } from "@/delivery/booking/public-booking-input";
import { privateDynamicError, privateDynamicJson } from "@/delivery/http/json-response";
import { assertTrustedMutationRequest } from "@/delivery/http/request-security";
import { createManagementBookingContext } from "@/infrastructure/composition/public-booking-context";
import { getBookingSecrets, getSecurityEnv } from "@/infrastructure/config/server-env";
import { CAPABILITY_COOKIE_MAX_AGE_SECONDS, CAPABILITY_COOKIE_NAME } from "@/infrastructure/security/booking-secrets";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);
    const parsed = managementTokenInputSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApplicationError("MANAGEMENT_LINK_INVALID", "Este acesso não é válido.", 404);
    const cookie = await exchangeManagementToken(
      await createManagementBookingContext(), parsed.data.token, getBookingSecrets(),
    );
    return privateDynamicJson(
      { exchanged: true },
      { headers: { "Set-Cookie": `${CAPABILITY_COOKIE_NAME}=${cookie}; Path=/manage; Max-Age=${CAPABILITY_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict` } },
    );
  } catch (error) {
    if (error instanceof SyntaxError) return privateDynamicError(new ApplicationError("MANAGEMENT_LINK_INVALID", "Este acesso não é válido.", 404));
    return privateDynamicError(error);
  }
}
