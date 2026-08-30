import type { BusinessScope } from "@/domain/business/business-scope";

export type AppointmentStatus = "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
export type AppointmentOrigin = "PUBLIC" | "ADMIN";

export type OperationalAppointment = Readonly<{
  id: string;
  status: AppointmentStatus;
  origin: AppointmentOrigin;
  version: number;
  serviceName: string;
  serviceDescription: string | null;
  durationMinutes: number;
  priceMinor: number;
  currencyCode: string;
  customerName: string;
  customerWhatsapp: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  timezoneSnapshot: string;
  localDateSnapshot: string;
  localTimeSnapshot: string;
  cancelledAt: Date | null;
  cancellationActor: "CUSTOMER" | "ADMIN" | null;
}>;

export type AppointmentEventView = Readonly<{
  eventType: string;
  actorType: string;
  occurredAt: Date;
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus | null;
}>;

export type CustomerSummary = Readonly<{
  id: string;
  name: string;
  whatsapp: string;
  nextAppointment: Pick<OperationalAppointment, "id" | "serviceName" | "scheduledStartAt" | "status"> | null;
}>;

export type CustomerDetail = Readonly<{
  id: string;
  name: string;
  whatsapp: string;
  appointments: readonly OperationalAppointment[];
}>;

export interface OperationalAgendaRepository {
  readonly scope: BusinessScope;
  listAppointments(startAt: Date, endAt: Date): Promise<OperationalAppointment[]>;
  findAppointment(id: string): Promise<(OperationalAppointment & { events: readonly AppointmentEventView[] }) | null>;
  transitionAppointment(input: Readonly<{
    appointmentId: string;
    expectedVersion: number;
    toStatus: "COMPLETED" | "NO_SHOW" | "CANCELLED";
    occurredAt: Date;
  }>): Promise<OperationalAppointment>;
  listCustomers(query: string): Promise<CustomerSummary[]>;
  findCustomer(id: string): Promise<CustomerDetail | null>;
}
