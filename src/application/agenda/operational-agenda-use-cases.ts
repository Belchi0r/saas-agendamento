import type {
  AppointmentStatus,
  OperationalAgendaRepository,
  OperationalAppointment,
} from "./operational-agenda-repository";
import { assertIanaTimeZone, Temporal } from "@/infrastructure/time/temporal";
import { ApplicationError } from "@/shared/errors/application-error";

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  CONFIRMED: "Confirmado",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

export function operationalDayRange(localDate: string, timezone: string) {
  let date: Temporal.PlainDate;
  try {
    date = Temporal.PlainDate.from(localDate);
    assertIanaTimeZone(timezone);
  } catch {
    throw new ApplicationError("AGENDA_DATE_INVALID", "Escolha uma data válida.", 400);
  }
  const start = date.toPlainDateTime("12:00").toZonedDateTime(timezone).startOfDay();
  return {
    startAt: new Date(start.toInstant().toString()),
    endAt: new Date(start.add({ days: 1 }).toInstant().toString()),
  };
}

export function todayInBusinessTimezone(timezone: string, now = new Date()) {
  return Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(assertIanaTimeZone(timezone)).toPlainDate().toString();
}

export async function listOperationalDay(
  repository: OperationalAgendaRepository,
  localDate: string,
  timezone: string,
) {
  const range = operationalDayRange(localDate, timezone);
  return repository.listAppointments(range.startAt, range.endAt);
}

export function findNextOperationalAppointment(
  appointments: readonly OperationalAppointment[],
  now = new Date(),
) {
  return appointments.find(
    (appointment) => appointment.status === "CONFIRMED" && appointment.scheduledEndAt >= now,
  ) ?? null;
}

export async function getOperationalAppointment(repository: OperationalAgendaRepository, id: string) {
  const appointment = await repository.findAppointment(id);
  if (!appointment) throw new ApplicationError("APPOINTMENT_NOT_FOUND", "Agendamento não encontrado.", 404);
  return appointment;
}

export function transitionOperationalAppointment(
  repository: OperationalAgendaRepository,
  input: Readonly<{
    appointmentId: string;
    expectedVersion: number;
    action: "complete" | "no-show" | "cancel";
  }>,
  now = new Date(),
): Promise<OperationalAppointment> {
  const toStatus = ({ complete: "COMPLETED", "no-show": "NO_SHOW", cancel: "CANCELLED" } as const)[input.action];
  return repository.transitionAppointment({
    appointmentId: input.appointmentId,
    expectedVersion: input.expectedVersion,
    toStatus,
    occurredAt: now,
  });
}
