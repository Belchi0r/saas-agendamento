import { transitionOperationalAppointment } from "@/application/agenda/operational-agenda-use-cases";
import { appointmentIdSchema, transitionAppointmentInputSchema } from "@/delivery/agenda/operational-input";
import { authenticatedError, authenticatedJson } from "@/delivery/http/json-response";
import { assertTrustedMutationRequest } from "@/delivery/http/request-security";
import { createOperationalAgendaContext } from "@/infrastructure/composition/operational-agenda-context";
import { getSecurityEnv } from "@/infrastructure/config/server-env";
import { ApplicationError } from "@/shared/errors/application-error";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ appointmentId: string }> }) {
  try {
    assertTrustedMutationRequest(request, getSecurityEnv().APP_ORIGIN);
    const id = appointmentIdSchema.safeParse((await params).appointmentId);
    const body = transitionAppointmentInputSchema.safeParse(await request.json());
    if (!id.success || !body.success) throw new ApplicationError("APPOINTMENT_INPUT_INVALID", "Revise a atualização.", 400);
    const context = await createOperationalAgendaContext();
    const appointment = await transitionOperationalAppointment(context.agenda, { appointmentId: id.data, ...body.data });
    return authenticatedJson({ appointment });
  } catch (error) {
    if (error instanceof SyntaxError) return authenticatedError(new ApplicationError("APPOINTMENT_INPUT_INVALID", "Revise a atualização.", 400));
    return authenticatedError(error);
  }
}
